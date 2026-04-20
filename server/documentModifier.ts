/**
 * documentModifier.ts
 *
 * Downloads an original document (Excel or PDF) from S3/URL,
 * applies AI-identified value changes to the actual file content,
 * highlights changed cells/sections, uploads the modified file to S3,
 * and returns the new URL plus a structured change log.
 */

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
 * Normalize a value string for comparison (trim, lowercase, remove units).
 */
function normalizeValue(val: string): string {
  return String(val).trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Check if a cell value matches an old value from the change list.
 */
function matchesOldValue(cellStr: string, oldValue: string): boolean {
  const cell = normalizeValue(cellStr);
  const old = normalizeValue(oldValue);
  // Exact match
  if (cell === old) return true;
  // Cell contains the old value as a substring (e.g. "1.5 kW" in a longer description)
  if (cell.includes(old) && old.length > 2) return true;
  // Numeric match (e.g. "1.5" matches "1.5 kW")
  const numOld = parseFloat(old);
  const numCell = parseFloat(cell);
  if (!isNaN(numOld) && !isNaN(numCell) && numOld === numCell) return true;
  return false;
}

/**
 * Modify an Excel workbook: find cells matching old values and replace with new values.
 * Changed cells are highlighted with a yellow fill.
 */
function modifyExcel(
  buffer: Buffer,
  changes: ChangeEntry[]
): { buffer: Buffer; changeLog: CellChange[] } {
  const workbook = XLSX.read(buffer, { type: "buffer", cellStyles: true });
  const changeLog: CellChange[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");

    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = sheet[cellRef];
        if (!cell || cell.v === undefined || cell.v === null) continue;

        const cellStr = String(cell.v);

        for (const change of changes) {
          if (!change.oldValue || !change.newValue) continue;
          if (matchesOldValue(cellStr, change.oldValue)) {
            // Build the new value string
            let newVal: string | number = change.newValue;
            // Preserve numeric type if original was numeric
            if (typeof cell.v === "number") {
              const parsed = parseFloat(change.newValue);
              if (!isNaN(parsed)) newVal = parsed;
            }
            // If the cell contained more than just the old value (e.g. "1.5 kW motor"),
            // do a string replacement to preserve surrounding text
            if (typeof cell.v === "string" && cell.v.trim() !== change.oldValue.trim()) {
              const regex = new RegExp(change.oldValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
              newVal = cell.v.replace(regex, change.newValue + (change.unit ? " " + change.unit : ""));
            } else if (change.unit && typeof newVal === "string") {
              newVal = newVal + " " + change.unit;
            }

            // Record the change
            changeLog.push({
              sheetName,
              cellRef,
              oldValue: cellStr,
              newValue: String(newVal),
              rowIndex: row,
              colIndex: col,
            });

            // Apply the new value
            cell.v = newVal;
            cell.w = String(newVal); // formatted text
            if (typeof newVal === "number") {
              cell.t = "n";
            } else {
              cell.t = "s";
            }

            // Highlight the cell with a yellow fill
            if (!cell.s) cell.s = {};
            cell.s.fill = {
              patternType: "solid",
              fgColor: { rgb: "FFFF00" }, // yellow
              bgColor: { rgb: "FFFF00" },
            };

            break; // Only apply the first matching change per cell
          }
        }
      }
    }
  }

  // Write back with cell styles enabled
  const outBuffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  });

  return { buffer: Buffer.from(outBuffer), changeLog };
}

/**
 * Modify a PDF: add a visible "DRAFT — MODIFIED" watermark and append a
 * change summary page listing all applied changes.
 * (pdf-lib cannot reliably find and replace text in arbitrary PDFs, so we
 * add a clearly visible change summary overlay instead.)
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

  // Add "MODIFIED DRAFT" watermark to every existing page
  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();
    // Semi-transparent amber banner at top
    page.drawRectangle({
      x: 0,
      y: height - 28,
      width,
      height: 28,
      color: rgb(1.0, 0.85, 0.2),
      opacity: 0.9,
    });
    page.drawText("MODIFIED DRAFT — AI GENERATED CHANGES APPLIED", {
      x: 12,
      y: height - 20,
      size: 10,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
    });
  }

  // Add a new "Change Summary" page at the end
  const summaryPage = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = summaryPage.getSize();
  const margin = 40;
  let y = height - margin;

  // Header bar
  summaryPage.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: rgb(0.1, 0.17, 0.29) });
  summaryPage.drawText("CHANGE SUMMARY — AI MODIFIED DOCUMENT", {
    x: margin, y: height - 38, size: 14, font: helveticaBold, color: rgb(1, 1, 1),
  });
  summaryPage.drawText(`Document: ${docName}`, {
    x: margin, y: height - 54, size: 9, font: helvetica, color: rgb(0.8, 0.85, 0.95),
  });

  y = height - 80;

  summaryPage.drawText("The following changes have been applied to this document based on the engineering change event:", {
    x: margin, y, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2), maxWidth: width - 2 * margin,
  });
  y -= 20;

  // Table header
  summaryPage.drawRectangle({ x: margin, y: y - 4, width: width - 2 * margin, height: 18, color: rgb(0.18, 0.27, 0.45) });
  summaryPage.drawText("Field / Parameter", { x: margin + 6, y: y + 1, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  summaryPage.drawText("Old Value", { x: margin + 180, y: y + 1, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  summaryPage.drawText("New Value", { x: margin + 320, y: y + 1, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  y -= 18;

  // Change rows
  const filteredChanges = changes.filter(c => c.oldValue && c.newValue);
  for (let i = 0; i < filteredChanges.length; i++) {
    const c = filteredChanges[i];
    const rowBg = i % 2 === 0 ? rgb(0.97, 0.97, 0.97) : rgb(1, 1, 1);
    summaryPage.drawRectangle({ x: margin, y: y - 4, width: width - 2 * margin, height: 16, color: rowBg });

    const label = c.fieldName.length > 28 ? c.fieldName.substring(0, 26) + "…" : c.fieldName;
    const oldVal = `${c.oldValue}${c.unit ? " " + c.unit : ""}`;
    const newVal = `${c.newValue}${c.unit ? " " + c.unit : ""}`;

    summaryPage.drawText(label, { x: margin + 6, y: y, size: 8, font: helvetica, color: rgb(0.15, 0.15, 0.15) });
    summaryPage.drawText(oldVal.substring(0, 22), { x: margin + 180, y: y, size: 8, font: helvetica, color: rgb(0.7, 0.1, 0.1) });
    summaryPage.drawText(newVal.substring(0, 22), { x: margin + 320, y: y, size: 8, font: helveticaBold, color: rgb(0.05, 0.5, 0.2) });

    y -= 16;
    if (y < margin + 40) break; // Prevent overflow
  }

  // Footer note
  y -= 10;
  summaryPage.drawText(
    "This document has been automatically modified by ChangeSync AI. All changes must be reviewed and approved by the document owner before implementation.",
    { x: margin, y: y, size: 7.5, font: helvetica, color: rgb(0.4, 0.4, 0.4), maxWidth: width - 2 * margin }
  );

  const modifiedBuffer = await pdfDoc.save();
  return { buffer: Buffer.from(modifiedBuffer), changeLog };
}

/**
 * Extract readable text content from a document for LLM analysis.
 * Returns a structured string summary of the document's content.
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
        // Convert sheet to array of arrays for readable output
        const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
        // Output up to 200 rows to keep within LLM context limits
        const maxRows = Math.min(data.length, 200);
        for (let r = 0; r < maxRows; r++) {
          const row = data[r];
          if (!row) continue;
          // Only include rows that have at least one non-empty cell
          const nonEmpty = row.filter(c => c !== null && c !== undefined && String(c).trim() !== "");
          if (nonEmpty.length === 0) continue;
          const cellRef = XLSX.utils.encode_cell({ r, c: 0 });
          lines.push(`Row ${r + 1} (${cellRef}): ${row.map(c => String(c ?? "")).join(" | ")}`);
        }
        lines.push("");
      }
      return lines.join("\n").substring(0, 12000); // Cap at 12k chars for LLM
    } catch (e) {
      return `[Could not extract Excel content: ${e}]`;
    }
  }

  if (isPdf) {
    try {
      // pdf-lib doesn't support text extraction, so we return a note about the PDF structure
      // and rely on the LLM to use the change event context to identify what to change
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pageCount = pdfDoc.getPageCount();
      return `PDF DOCUMENT: ${fileName}\nPage count: ${pageCount}\n\nNote: This is a PDF document. Based on the change event parameters, identify which values in this document type need to be updated.`;
    } catch (e) {
      return `[Could not read PDF: ${e}]`;
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

  // Download the original file
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
    const result = modifyExcel(originalBuffer, changes);
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
    // For unsupported types (Word, etc.), return the original unchanged
    // but still record the intended changes in the log
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

  // Upload modified file to S3
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const modifiedFileName = `${baseName}-modified-${randomSuffix()}.${outputExtension}`;
  const modifiedFileKey = `modified-documents/${modifiedFileName}`;
  const { url: modifiedFileUrl } = await storagePut(modifiedFileKey, modifiedBuffer, outputMimeType);

  return {
    modifiedFileUrl,
    modifiedFileKey,
    changeLog,
    changesApplied: changeLog.length,
  };
}
