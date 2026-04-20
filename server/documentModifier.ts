/**
 * documentModifier.ts
 *
 * Downloads an original document (Excel or PDF) from S3/URL,
 * applies AI-identified value changes to the actual file content,
 * highlights changed cells in yellow (Excel) or adds a change summary (PDF),
 * uploads the modified file to S3, and returns the new URL plus a change log.
 *
 * Uses ExcelJS for Excel files to preserve 100% of original formatting.
 */

import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
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
 * Normalize a cell value for comparison — trim, lowercase, collapse whitespace.
 */
function normalizeValue(val: string): string {
  return String(val).trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Check if a cell value matches an old value from the change list.
 * Supports exact match, substring match (for longer descriptions), and numeric match.
 */
function matchesOldValue(cellStr: string, oldValue: string): boolean {
  if (!oldValue || oldValue.trim() === "") return false;
  const cell = normalizeValue(cellStr);
  const old = normalizeValue(oldValue);

  // Exact match
  if (cell === old) return true;

  // Cell contains the old value as a whole word/phrase
  // (e.g. "1.5 kW" in "Motor rated at 1.5 kW")
  if (old.length >= 3 && cell.includes(old)) return true;

  // Numeric match — "1.5" matches "1.5 kW", "1440" matches "1440 rpm"
  const numOld = parseFloat(old);
  const numCell = parseFloat(cell);
  if (!isNaN(numOld) && !isNaN(numCell) && numOld === numCell && old.length >= 1) return true;

  return false;
}

/**
 * Build the replacement value string.
 * If the cell contained more than just the old value (e.g. "Motor: 1.5 kW"),
 * do a string replacement to preserve the surrounding text.
 */
function buildNewValue(
  originalCellValue: string | number | boolean | Date | null,
  oldValue: string,
  newValue: string,
  unit?: string
): string | number {
  if (originalCellValue === null || originalCellValue === undefined) return newValue;

  const cellStr = String(originalCellValue);
  const unitSuffix = unit ? ` ${unit}` : "";

  // If the cell is purely the old value (or a number matching it), return the new value directly
  if (normalizeValue(cellStr) === normalizeValue(oldValue)) {
    // Try to preserve numeric type
    const parsed = parseFloat(newValue);
    if (typeof originalCellValue === "number" && !isNaN(parsed)) {
      return parsed;
    }
    return newValue + unitSuffix;
  }

  // Otherwise do a substring replacement to preserve surrounding text
  const regex = new RegExp(oldValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return cellStr.replace(regex, newValue + unitSuffix);
}

/**
 * Modify an Excel workbook using ExcelJS to preserve ALL original formatting.
 * Only cells matching old values are changed — everything else is untouched.
 * Changed cells are highlighted with a bright yellow fill (#FFFF00).
 */
async function modifyExcel(
  buffer: Buffer,
  changes: ChangeEntry[]
): Promise<{ buffer: Buffer; changeLog: CellChange[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const changeLog: CellChange[] = [];

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const cellValue = cell.value;
        if (cellValue === null || cellValue === undefined) return;

        // Handle rich text cells
        let cellStr: string;
        if (typeof cellValue === "object" && "richText" in (cellValue as object)) {
          cellStr = (cellValue as ExcelJS.CellRichTextValue).richText.map(r => r.text).join("");
        } else if (cellValue instanceof Date) {
          cellStr = cellValue.toISOString();
        } else {
          cellStr = String(cellValue);
        }

        for (const change of changes) {
          if (!change.oldValue || !change.newValue) continue;
          if (matchesOldValue(cellStr, change.oldValue)) {
            const newVal = buildNewValue(cellValue as string | number | boolean | Date | null, change.oldValue, change.newValue, change.unit);

            // Record the change
            const cellRef = `${String.fromCharCode(64 + colNumber)}${rowNumber}`;
            changeLog.push({
              sheetName: worksheet.name,
              cellRef,
              oldValue: cellStr,
              newValue: String(newVal),
              rowIndex: rowNumber,
              colIndex: colNumber,
            });

            // Apply new value
            cell.value = newVal;

            // Apply yellow highlight — preserve existing font/border/alignment
            const existingFill = cell.fill;
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFFF00" }, // bright yellow
            };

            // Make the text bold to draw attention
            if (cell.font) {
              cell.font = { ...cell.font, bold: true };
            } else {
              cell.font = { bold: true };
            }

            break; // Only apply the first matching change per cell
          }
        }
      });
    });
  }

  // Write back — ExcelJS preserves all original formatting
  const outBuffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(outBuffer), changeLog };
}

/**
 * Modify a PDF: add a minimal "MODIFIED DRAFT" stamp to the first page
 * and append a clean change summary page at the end.
 */
async function modifyPdf(
  buffer: Buffer,
  changes: ChangeEntry[],
  docName: string
): Promise<{ buffer: Buffer; changeLog: CellChange[] }> {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const changeLog: CellChange[] = changes
    .filter(c => c.oldValue && c.newValue)
    .map((c, i) => ({
      sheetName: "PDF",
      cellRef: `Change ${i + 1}`,
      oldValue: `${c.fieldName}: ${c.oldValue}${c.unit ? " " + c.unit : ""}`,
      newValue: `${c.fieldName}: ${c.newValue}${c.unit ? " " + c.unit : ""}`,
      rowIndex: i,
      colIndex: 0,
    }));

  // Add a small "MODIFIED DRAFT" stamp to the first page only (non-intrusive)
  const firstPage = pdfDoc.getPage(0);
  const { width, height } = firstPage.getSize();
  firstPage.drawRectangle({
    x: width - 160,
    y: height - 30,
    width: 155,
    height: 22,
    color: rgb(1.0, 0.85, 0.0),
    opacity: 0.9,
  });
  firstPage.drawText("MODIFIED DRAFT", {
    x: width - 150,
    y: height - 22,
    size: 9,
    font: helveticaBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Append a clean change summary page
  const summaryPage = pdfDoc.addPage([595, 842]); // A4
  const margin = 45;
  let y = summaryPage.getHeight() - margin;

  // Title
  summaryPage.drawText("CHANGE SUMMARY", {
    x: margin, y, size: 16, font: helveticaBold, color: rgb(0.1, 0.17, 0.35),
  });
  y -= 20;
  summaryPage.drawText(`Document: ${docName}`, {
    x: margin, y, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4),
  });
  y -= 8;
  // Divider line
  summaryPage.drawLine({
    start: { x: margin, y },
    end: { x: summaryPage.getWidth() - margin, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 18;

  summaryPage.drawText(
    "The following values have been updated based on the engineering change event:",
    { x: margin, y, size: 9, font: helvetica, color: rgb(0.25, 0.25, 0.25), maxWidth: summaryPage.getWidth() - 2 * margin }
  );
  y -= 20;

  // Column headers
  const col1 = margin;
  const col2 = margin + 180;
  const col3 = margin + 330;

  summaryPage.drawRectangle({ x: margin, y: y - 4, width: summaryPage.getWidth() - 2 * margin, height: 18, color: rgb(0.18, 0.27, 0.45) });
  summaryPage.drawText("Field / Parameter", { x: col1 + 4, y: y + 1, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  summaryPage.drawText("Old Value", { x: col2 + 4, y: y + 1, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  summaryPage.drawText("New Value", { x: col3 + 4, y: y + 1, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  y -= 18;

  const filteredChanges = changes.filter(c => c.oldValue && c.newValue);
  for (let i = 0; i < filteredChanges.length; i++) {
    const c = filteredChanges[i];
    const rowBg = i % 2 === 0 ? rgb(0.96, 0.97, 1.0) : rgb(1, 1, 1);
    summaryPage.drawRectangle({ x: margin, y: y - 4, width: summaryPage.getWidth() - 2 * margin, height: 16, color: rowBg });

    const label = c.fieldName.length > 26 ? c.fieldName.substring(0, 24) + "…" : c.fieldName;
    const oldVal = `${c.oldValue}${c.unit ? " " + c.unit : ""}`.substring(0, 20);
    const newVal = `${c.newValue}${c.unit ? " " + c.unit : ""}`.substring(0, 20);

    summaryPage.drawText(label, { x: col1 + 4, y, size: 8, font: helvetica, color: rgb(0.15, 0.15, 0.15) });
    summaryPage.drawText(oldVal, { x: col2 + 4, y, size: 8, font: helvetica, color: rgb(0.65, 0.1, 0.1) });
    summaryPage.drawText(newVal, { x: col3 + 4, y, size: 8, font: helveticaBold, color: rgb(0.05, 0.45, 0.15) });

    y -= 16;
    if (y < margin + 40) break;
  }

  const modifiedBuffer = await pdfDoc.save();
  return { buffer: Buffer.from(modifiedBuffer), changeLog };
}

/**
 * Extract readable text content from a document for LLM analysis.
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
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const lines: string[] = [`EXCEL DOCUMENT: ${fileName}`, ""];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        lines.push(`=== Sheet: ${sheetName} ===`);
        const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
        const maxRows = Math.min(data.length, 200);
        for (let r = 0; r < maxRows; r++) {
          const row = data[r];
          if (!row) continue;
          const nonEmpty = row.filter(c => c !== null && c !== undefined && String(c).trim() !== "");
          if (nonEmpty.length === 0) continue;
          lines.push(`Row ${r + 1}: ${row.map(c => String(c ?? "")).join(" | ")}`);
        }
        lines.push("");
      }
      return lines.join("\n").substring(0, 12000);
    } catch (e) {
      return `[Could not extract Excel content: ${e}]`;
    }
  }

  if (isPdf) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      return `PDF DOCUMENT: ${fileName}\n\n${result.text.substring(0, 10000)}`;
    } catch (e) {
      return `[Could not extract PDF content: ${e}]`;
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
  changes: ChangeEntry[];
  documentName: string;
  originalFileKey: string;
}): Promise<ModificationResult> {
  const { fileUrl, fileName, mimeType, changes, documentName, originalFileKey } = params;

  if (!changes || changes.length === 0) {
    throw new Error("No changes provided to modifyDocument");
  }

  const originalBuffer = await downloadFile(fileUrl);

  let modifiedBuffer: Buffer;
  let changeLog: CellChange[];
  let outputMimeType = mimeType;
  let outputExtension = fileName.split(".").pop() ?? "bin";

  const isExcel =
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls");

  const isPdf =
    mimeType === "application/pdf" ||
    fileName.endsWith(".pdf");

  if (isExcel) {
    const result = await modifyExcel(originalBuffer, changes);
    modifiedBuffer = result.buffer;
    changeLog = result.changeLog;
    outputMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    outputExtension = "xlsx";
  } else if (isPdf) {
    const result = await modifyPdf(originalBuffer, changes, documentName);
    modifiedBuffer = result.buffer;
    changeLog = result.changeLog;
    outputMimeType = "application/pdf";
    outputExtension = "pdf";
  } else {
    // For unsupported types, return the original with a change log
    modifiedBuffer = originalBuffer;
    changeLog = changes
      .filter(c => c.oldValue && c.newValue)
      .map((c, i) => ({
        sheetName: "Document",
        cellRef: `Change ${i + 1}`,
        oldValue: `${c.fieldName}: ${c.oldValue}${c.unit ? " " + c.unit : ""}`,
        newValue: `${c.fieldName}: ${c.newValue}${c.unit ? " " + c.unit : ""}`,
        rowIndex: i,
        colIndex: 0,
      }));
  }

  const baseName = fileName.replace(/\.[^.]+$/, "");
  const modifiedFileName = `${baseName}-modified-${randomSuffix()}.${outputExtension}`;
  const modifiedFileKey = `modified-documents/${modifiedFileName}`;
  const { url: modifiedFileUrl } = await storagePut(modifiedFileKey, modifiedBuffer, outputMimeType);

  console.log(`[DocumentModifier] Modified ${documentName}: ${changeLog.length} cell changes applied, uploaded to ${modifiedFileUrl}`);

  return {
    modifiedFileUrl,
    modifiedFileKey,
    changeLog,
    changesApplied: changeLog.length,
  };
}
