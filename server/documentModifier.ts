/**
 * documentModifier.ts
 *
 * Downloads an original document (Excel or PDF) from S3/URL,
 * applies AI-identified value changes to the actual file content,
 * highlights ONLY the changed cells (Excel) or adds a change summary page (PDF),
 * preserves ALL original formatting, uploads the modified file to S3,
 * and returns the new URL plus a structured change log.
 *
 * Key principle: the modified document must look IDENTICAL to the original
 * except for the specific values that changed (highlighted in amber).
 */

import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { storagePut } from "./storage";

function randomSuffix() {
  return Math.random().toString(36).substring(2, 10);
}

export interface ChangeEntry {
  fieldName: string;
  oldValue: string;
  newValue: string;
  unit?: string;
}

export interface CellChange {
  sheetName: string;
  cellRef: string;
  oldValue: string;
  newValue: string;
  rowIndex: number;
  colIndex: number;
}

export interface ModificationResult {
  modifiedFileUrl: string;
  modifiedFileKey: string;
  changeLog: CellChange[];
  changesApplied: number;
}

/**
 * Download a file from a URL and return as Buffer.
 */
async function downloadFile(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file: ${res.status} ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Normalize a value string for comparison (trim whitespace, collapse spaces).
 * Does NOT lowercase — we want to preserve case for display.
 */
function normalizeForCompare(val: string): string {
  return String(val).trim().replace(/\s+/g, " ");
}

/**
 * Check if a cell value matches an old value from the change list.
 * Uses multiple strategies: exact, substring, and numeric tolerance.
 */
function matchesOldValue(cellStr: string, oldValue: string): boolean {
  const cell = normalizeForCompare(cellStr).toLowerCase();
  const old = normalizeForCompare(oldValue).toLowerCase();

  if (!old || old.length < 1) return false;

  // Exact match (case-insensitive)
  if (cell === old) return true;

  // Cell is exactly the old value with a unit appended (e.g. "Monthly" matches "monthly")
  if (cell.startsWith(old) && (cell.length === old.length || cell[old.length] === " ")) return true;

  // Numeric match: "1.5" matches "1.5 kW" and vice versa
  const numOld = parseFloat(old);
  const numCell = parseFloat(cell);
  if (!isNaN(numOld) && !isNaN(numCell) && Math.abs(numOld - numCell) < 0.0001) {
    // Only match if the numeric part is the dominant content of the cell
    // (avoid matching "15" in "150 rpm")
    const cellNumStr = String(numCell);
    const oldNumStr = String(numOld);
    if (cell.startsWith(cellNumStr) || cell === cellNumStr) return true;
    if (old.startsWith(oldNumStr) && cell.startsWith(oldNumStr)) return true;
  }

  return false;
}

/**
 * Modify an Excel workbook using ExcelJS to preserve ALL original formatting.
 * Only the specific cells matching old values are changed and highlighted.
 * Everything else (column widths, row heights, merged cells, fonts, borders,
 * number formats, conditional formatting) is preserved exactly.
 */
async function modifyExcel(
  buffer: Buffer,
  changes: ChangeEntry[]
): Promise<{ buffer: Buffer; changeLog: CellChange[] }> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const changeLog: CellChange[] = [];

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (cell.value === null || cell.value === undefined) return;

        // Get the display string of the cell value
        let cellStr: string;
        if (typeof cell.value === "object" && cell.value !== null && "richText" in cell.value) {
          // Rich text — join all text parts
          cellStr = (cell.value as ExcelJS.CellRichTextValue).richText.map(r => r.text).join("");
        } else if (typeof cell.value === "object" && cell.value !== null && "formula" in cell.value) {
          // Formula cell — use the cached result
          const formulaVal = cell.value as ExcelJS.CellFormulaValue;
          cellStr = String(formulaVal.result ?? "");
        } else {
          cellStr = String(cell.value);
        }

        for (const change of changes) {
          if (!change.oldValue || !change.newValue) continue;
          if (!matchesOldValue(cellStr, change.oldValue)) continue;

          // Build the new display value
          let newDisplayValue: string | number = change.newValue;
          if (change.unit && !change.newValue.includes(change.unit)) {
            newDisplayValue = `${change.newValue} ${change.unit}`;
          }

          // Preserve numeric type if the original cell was numeric
          if (typeof cell.value === "number") {
            const parsed = parseFloat(change.newValue);
            if (!isNaN(parsed)) {
              newDisplayValue = parsed;
            }
          }

          // If the cell contained more than just the old value (e.g. "1.5 kW motor"),
          // do a targeted string replacement to preserve surrounding text
          if (typeof cell.value === "string" && normalizeForCompare(cell.value).toLowerCase() !== normalizeForCompare(change.oldValue).toLowerCase()) {
            const escapedOld = change.oldValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(escapedOld, "gi");
            const replacement = change.newValue + (change.unit ? " " + change.unit : "");
            newDisplayValue = cell.value.replace(regex, replacement);
          }

          // Record the change
          const cellRef = `${worksheet.name}!${cell.address}`;
          changeLog.push({
            sheetName: worksheet.name,
            cellRef: cell.address,
            oldValue: cellStr,
            newValue: String(newDisplayValue),
            rowIndex: rowNumber - 1,
            colIndex: colNumber - 1,
          });

          // Apply the new value (preserves formula structure if it was a formula)
          if (typeof cell.value === "object" && cell.value !== null && "formula" in cell.value) {
            // For formula cells, update the cached result but keep the formula
            (cell.value as ExcelJS.CellFormulaValue).result = String(newDisplayValue);
          } else {
            cell.value = newDisplayValue as ExcelJS.CellValue;
          }

          // Highlight ONLY this cell with amber fill — preserve all other style properties
          const existingFill = cell.fill;
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFC000" }, // Amber — professional, visible, not garish
          };
          // Keep the existing font but make it bold to draw attention
          if (cell.font) {
            cell.font = { ...cell.font, bold: true };
          } else {
            cell.font = { bold: true };
          }
          // Suppress unused variable warning
          void existingFill;

          break; // Only apply the first matching change per cell
        }
      });
    });
  }

  // Write back — ExcelJS preserves all original formatting
  const outBuffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(outBuffer as unknown as ArrayBuffer), changeLog };
}

/**
 * Modify a PDF: add a visible change summary page at the end.
 * The original pages are NOT modified (pdf-lib cannot reliably replace text).
 * The change summary page clearly lists every old → new value.
 */
async function modifyPdf(
  buffer: Buffer,
  changes: ChangeEntry[],
  docName: string
): Promise<{ buffer: Buffer; changeLog: CellChange[] }> {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const filteredChanges = changes.filter(c => c.oldValue && c.newValue && c.oldValue !== c.newValue);

  const changeLog: CellChange[] = filteredChanges.map((c, i) => ({
    sheetName: "PDF",
    cellRef: `Change ${i + 1}`,
    oldValue: `${c.fieldName}: ${c.oldValue}${c.unit ? " " + c.unit : ""}`,
    newValue: `${c.fieldName}: ${c.newValue}${c.unit ? " " + c.unit : ""}`,
    rowIndex: i,
    colIndex: 0,
  }));

  // Add a thin amber banner at the top of every existing page
  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();
    page.drawRectangle({
      x: 0,
      y: height - 22,
      width,
      height: 22,
      color: rgb(1.0, 0.75, 0.0),
      opacity: 0.92,
    });
    page.drawText("MODIFIED DRAFT — SEE CHANGE SUMMARY ON LAST PAGE", {
      x: 10,
      y: height - 15,
      size: 8,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
    });
  }

  // Add a professional "Change Summary" page at the end
  const summaryPage = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = summaryPage.getSize();
  const margin = 45;
  let y = height - margin;

  // Navy header bar
  summaryPage.drawRectangle({ x: 0, y: height - 65, width, height: 65, color: rgb(0.1, 0.17, 0.29) });
  summaryPage.drawText("CHANGE SUMMARY", {
    x: margin, y: height - 35, size: 16, font: helveticaBold, color: rgb(1, 1, 1),
  });
  summaryPage.drawText(`Document: ${docName}`, {
    x: margin, y: height - 52, size: 9, font: helvetica, color: rgb(0.75, 0.82, 0.95),
  });
  summaryPage.drawText(`Generated by ChangeSync AI  |  ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, {
    x: margin, y: height - 62, size: 8, font: helvetica, color: rgb(0.6, 0.7, 0.85),
  });

  y = height - 85;

  summaryPage.drawText(
    "The following specific values have been identified for update based on the engineering change event. " +
    "Review each change carefully before approving.",
    { x: margin, y, size: 9, font: helvetica, color: rgb(0.25, 0.25, 0.25), maxWidth: width - 2 * margin }
  );
  y -= 25;

  if (filteredChanges.length === 0) {
    summaryPage.drawText("No specific value changes were identified for this document.", {
      x: margin, y, size: 10, font: helvetica, color: rgb(0.5, 0.5, 0.5),
    });
  } else {
    // Column headers
    const col1 = margin;
    const col2 = margin + 175;
    const col3 = margin + 320;
    const tableWidth = width - 2 * margin;

    summaryPage.drawRectangle({ x: col1, y: y - 5, width: tableWidth, height: 20, color: rgb(0.18, 0.27, 0.45) });
    summaryPage.drawText("Field / Parameter", { x: col1 + 6, y: y + 2, size: 8.5, font: helveticaBold, color: rgb(1, 1, 1) });
    summaryPage.drawText("Current Value (Old)", { x: col2 + 6, y: y + 2, size: 8.5, font: helveticaBold, color: rgb(1, 1, 1) });
    summaryPage.drawText("Updated Value (New)", { x: col3 + 6, y: y + 2, size: 8.5, font: helveticaBold, color: rgb(1, 1, 1) });
    y -= 20;

    for (let i = 0; i < filteredChanges.length; i++) {
      const c = filteredChanges[i];
      const rowH = 20;
      const rowBg = i % 2 === 0 ? rgb(0.96, 0.97, 0.99) : rgb(1, 1, 1);
      summaryPage.drawRectangle({ x: col1, y: y - 5, width: tableWidth, height: rowH, color: rowBg });

      // Draw thin bottom border
      summaryPage.drawLine({
        start: { x: col1, y: y - 5 },
        end: { x: col1 + tableWidth, y: y - 5 },
        thickness: 0.5,
        color: rgb(0.85, 0.87, 0.9),
      });

      const label = c.fieldName.length > 26 ? c.fieldName.substring(0, 24) + "…" : c.fieldName;
      const oldVal = `${c.oldValue}${c.unit ? " " + c.unit : ""}`;
      const newVal = `${c.newValue}${c.unit ? " " + c.unit : ""}`;

      summaryPage.drawText(label, { x: col1 + 6, y: y + 2, size: 8.5, font: helvetica, color: rgb(0.15, 0.15, 0.15) });
      summaryPage.drawText(oldVal.substring(0, 24), { x: col2 + 6, y: y + 2, size: 8.5, font: helvetica, color: rgb(0.65, 0.1, 0.1) });
      // Amber highlight behind new value
      summaryPage.drawRectangle({ x: col3 + 2, y: y - 3, width: width - col3 - margin - 2, height: 16, color: rgb(1.0, 0.95, 0.7) });
      summaryPage.drawText(newVal.substring(0, 24), { x: col3 + 6, y: y + 2, size: 8.5, font: helveticaBold, color: rgb(0.05, 0.4, 0.1) });

      y -= rowH;
      if (y < margin + 40) break;
    }
  }

  // Footer
  y -= 15;
  summaryPage.drawLine({
    start: { x: margin, y: y + 5 },
    end: { x: width - margin, y: y + 5 },
    thickness: 0.5,
    color: rgb(0.75, 0.78, 0.82),
  });
  summaryPage.drawText(
    "This document has been automatically modified by ChangeSync AI. All changes must be reviewed and approved by the document owner before implementation.",
    { x: margin, y: y - 8, size: 7, font: helvetica, color: rgb(0.45, 0.45, 0.45), maxWidth: width - 2 * margin }
  );

  const modifiedBuffer = await pdfDoc.save();
  return { buffer: Buffer.from(modifiedBuffer.buffer as ArrayBuffer), changeLog };
}

/**
 * Extract readable text content from a document for LLM analysis.
 * Returns a structured string summary of the document's content.
 * For Excel: outputs every non-empty cell with its row/col reference.
 * For PDF: extracts full text using pdf-parse.
 */
export async function extractDocumentContent(params: {
  fileUrl: string;
  fileName: string;
  mimeType: string;
}): Promise<string> {
  const { fileUrl, fileName, mimeType } = params;
  const buffer = await downloadFile(fileUrl);

  const isExcel =
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls");

  const isPdf =
    mimeType === "application/pdf" ||
    fileName.endsWith(".pdf");

  if (isExcel) {
    try {
      const workbook = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(buffer as any);
      const lines: string[] = [`EXCEL DOCUMENT: ${fileName}`, ""];

      for (const worksheet of workbook.worksheets) {
        lines.push(`=== Sheet: ${worksheet.name} ===`);
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            let val: string;
            if (typeof cell.value === "object" && cell.value !== null && "richText" in cell.value) {
              val = (cell.value as ExcelJS.CellRichTextValue).richText.map(r => r.text).join("");
            } else if (typeof cell.value === "object" && cell.value !== null && "formula" in cell.value) {
              val = String((cell.value as ExcelJS.CellFormulaValue).result ?? "");
            } else {
              val = String(cell.value ?? "");
            }
            if (val.trim()) {
              cells.push(`[Col${colNumber}:${cell.address}]=${val}`);
            }
          });
          if (cells.length > 0) {
            lines.push(`Row ${rowNumber}: ${cells.join(" | ")}`);
          }
        });
        lines.push("");
        // Cap at 12k chars
        if (lines.join("\n").length > 11000) {
          lines.push("...[truncated for length]");
          break;
        }
      }

      return lines.join("\n").substring(0, 12000);
    } catch (e) {
      return `[Could not extract Excel content: ${e}]`;
    }
  }

  if (isPdf) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer, options?: object) => Promise<{ text: string; numpages: number }>;
      const data = await pdfParse(buffer, { max: 0 });
      const text = data.text ?? "";
      const pageCount = data.numpages ?? 0;
      const truncated = text.length > 12000 ? text.substring(0, 12000) + "\n...[truncated]" : text;
      return `PDF DOCUMENT: ${fileName}\nPage count: ${pageCount}\n\nEXTRACTED TEXT:\n${truncated}`;
    } catch (e) {
      return `[Could not extract PDF text: ${e}]`;
    }
  }

  return `DOCUMENT: ${fileName} (${mimeType}) — content extraction not supported for this file type.`;
}

/**
 * Main entry point: modify a document file and upload to S3.
 */
export async function modifyDocument(params: {
  fileUrl: string;
  fileName: string;
  mimeType: string;
  documentName: string;
  originalFileKey: string;
  changes: ChangeEntry[];
}): Promise<ModificationResult> {
  const { fileUrl, fileName, mimeType, documentName, changes } = params;

  if (changes.length === 0) {
    throw new Error("No changes provided to modifyDocument");
  }

  const buffer = await downloadFile(fileUrl);

  const isExcel =
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls");

  const isPdf =
    mimeType === "application/pdf" ||
    fileName.endsWith(".pdf");

  let modifiedBuffer: Buffer;
  let changeLog: CellChange[];

  if (isExcel) {
    const result = await modifyExcel(buffer, changes);
    modifiedBuffer = result.buffer;
    changeLog = result.changeLog;
  } else if (isPdf) {
    const result = await modifyPdf(buffer, changes, documentName);
    modifiedBuffer = result.buffer;
    changeLog = result.changeLog;
  } else {
    throw new Error(`Unsupported file type for modification: ${mimeType} (${fileName})`);
  }

  // Upload the modified file to S3
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "xlsx";
  const modifiedFileName = fileName.replace(/\.[^.]+$/, "") + `-modified-${randomSuffix()}.${ext}`;
  const modifiedFileKey = `modified-documents/${modifiedFileName}`;
  const { url: modifiedFileUrl } = await storagePut(modifiedFileKey, modifiedBuffer, mimeType);

  return {
    modifiedFileUrl,
    modifiedFileKey,
    changeLog,
    changesApplied: changeLog.length,
  };
}
