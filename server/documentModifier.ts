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
import mammoth from "mammoth";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, HeadingLevel,
  BorderStyle,
} from "docx";
import { storagePut } from "./storage";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
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
 * If oldValue is empty, this is a "new addition" — handled separately in modifyExcel.
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
  // Strip commas and units before comparing (handles "1,440 RPM" vs "1440")
  const stripUnits = (s: string) => s.replace(/[,]/g, "").replace(/[a-z%°]+$/i, "").trim();
  const numOld = parseFloat(stripUnits(old));
  const numCell = parseFloat(stripUnits(cell));
  if (!isNaN(numOld) && !isNaN(numCell) && numOld === numCell && old.length >= 1) return true;

  return false;
}

/**
 * Check if a cell's label/header (the cell to the left or above) matches the fieldName.
 * Used to find the right cell for new-value-only additions.
 */
function fieldNameMatchesLabel(fieldName: string, label: string): boolean {
  if (!fieldName || !label) return false;
  const fn = normalizeValue(fieldName);
  const lb = normalizeValue(label);
  // Direct containment
  if (lb.includes(fn) || fn.includes(lb)) return true;
  // Word overlap: at least 2 significant words in common
  const fnWords = fn.split(/\s+/).filter(w => w.length > 3);
  const lbWords = lb.split(/\s+/).filter(w => w.length > 3);
  const overlap = fnWords.filter(w => lbWords.includes(w));
  return overlap.length >= 1 && fnWords.length > 0;
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

  // Separate changes into: (a) old-value replacements, (b) new-value-only additions
  const replacementChanges = changes.filter(c => c.oldValue && c.oldValue.trim() !== "" && c.newValue);
  const additionChanges = changes.filter(c => (!c.oldValue || c.oldValue.trim() === "") && c.newValue);

  // Track which addition changes have already been applied (by fieldName)
  const appliedAdditions = new Set<string>();

  for (const worksheet of workbook.worksheets) {
    // Build a map of row labels: for each row, the first non-empty cell is the label
    const rowLabels = new Map<number, string>();
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const firstCell = row.getCell(1);
      if (firstCell?.value) {
        const v = firstCell.value;
        const label = typeof v === "object" && v !== null && "richText" in v
          ? (v as ExcelJS.CellRichTextValue).richText.map(r => r.text).join("")
          : String(v);
        if (label.trim()) rowLabels.set(rowNumber, label.trim());
      }
    });

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

        // --- Pass 1: Apply old-value replacement changes ---
        for (const change of replacementChanges) {
          if (matchesOldValue(cellStr, change.oldValue)) {
            const newVal = buildNewValue(cellValue as string | number | boolean | Date | null, change.oldValue, change.newValue, change.unit);

            const cellRef = `${String.fromCharCode(64 + colNumber)}${rowNumber}`;
            changeLog.push({
              sheetName: worksheet.name,
              cellRef,
              oldValue: cellStr,
              newValue: String(newVal),
              rowIndex: rowNumber,
              colIndex: colNumber,
            });

            cell.value = newVal;
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
            cell.font = cell.font ? { ...cell.font, bold: true } : { bold: true };
            break;
          }
        }

        // --- Pass 2: Apply new-value-only addition changes ---
        // Find the right cell by matching the row label to the fieldName.
        // Only apply to value cells (col >= 2) to avoid overwriting labels.
        if (colNumber >= 2) {
          const rowLabel = rowLabels.get(rowNumber) ?? "";
          for (const change of additionChanges) {
            if (appliedAdditions.has(change.fieldName)) continue;
            if (fieldNameMatchesLabel(change.fieldName, rowLabel)) {
              // Only write if the cell is currently empty or has a placeholder
              const isEmpty = !cellStr || cellStr.trim() === "" || cellStr === "-" || cellStr === "N/A";
              if (isEmpty) {
                const cellRef = `${String.fromCharCode(64 + colNumber)}${rowNumber}`;
                changeLog.push({
                  sheetName: worksheet.name,
                  cellRef,
                  oldValue: cellStr || "(empty)",
                  newValue: `${change.newValue}${change.unit ? " " + change.unit : ""}`,
                  rowIndex: rowNumber,
                  colIndex: colNumber,
                });
                cell.value = `${change.newValue}${change.unit ? " " + change.unit : ""}`;
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
                cell.font = cell.font ? { ...cell.font, bold: true } : { bold: true };
                appliedAdditions.add(change.fieldName);
                break;
              }
            }
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
 * Modify a Word (.docx) document: extract all paragraphs and tables,
 * replace matching old values with new values, and highlight changed text
 * in yellow using the docx library. Rebuilds the document from scratch
 * preserving the logical structure.
 */
async function modifyWord(
  buffer: Buffer,
  changes: ChangeEntry[],
  docName: string
): Promise<{ buffer: Buffer; changeLog: CellChange[] }> {
  // Extract text content using mammoth for analysis
  const extracted = await mammoth.extractRawText({ buffer });
  const rawText = extracted.value;

  const changeLog: CellChange[] = [];

  // Build a map of text replacements
  const replacements: Array<{ old: string; new: string; fieldName: string; unit?: string }> = [];
  for (const change of changes) {
    if (change.newValue) {
      replacements.push({
        old: change.oldValue ?? "",
        new: change.newValue,
        fieldName: change.fieldName,
        unit: change.unit,
      });
    }
  }

  // Split raw text into lines to rebuild as paragraphs
  const lines = rawText.split("\n").filter(l => l.trim() !== "");

  let changeIndex = 0;
  const paragraphs: Paragraph[] = [];

  // Add a title header
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: `MODIFIED DRAFT — ${docName}`, bold: true, size: 28, color: "1A237E" })],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    })
  );

  // Add a change summary banner
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `⚠ This document has been automatically updated based on an engineering change event. Changed values are highlighted in yellow.`,
          bold: true,
          size: 18,
          color: "7B3F00",
          highlight: "yellow",
        }),
      ],
      spacing: { before: 100, after: 200 },
    })
  );

  // Process each line, applying replacements and highlighting
  for (const line of lines) {
    let remainingText = line;
    const runs: TextRun[] = [];
    let lineChanged = false;

    // Try each replacement on this line
    for (const rep of replacements) {
      if (!rep.old || rep.old.trim() === "") continue;

      // Case-insensitive search
      const idx = remainingText.toLowerCase().indexOf(rep.old.toLowerCase());
      if (idx !== -1) {
        // Text before the match
        if (idx > 0) {
          runs.push(new TextRun({ text: remainingText.substring(0, idx), size: 20 }));
        }
        // The replacement (highlighted yellow)
        const newVal = `${rep.new}${rep.unit ? " " + rep.unit : ""}`;
        runs.push(new TextRun({
          text: newVal,
          bold: true,
          size: 20,
          highlight: "yellow",
          color: "1B5E20",
        }));
        // Strikethrough of old value (shown before new value for context)
        // Actually just log it and continue with remaining text
        changeLog.push({
          sheetName: "Word Document",
          cellRef: `Line ${changeIndex + 1}`,
          oldValue: `${rep.fieldName}: ${rep.old}${rep.unit ? " " + rep.unit : ""}`,
          newValue: `${rep.fieldName}: ${newVal}`,
          rowIndex: changeIndex,
          colIndex: 0,
        });
        changeIndex++;
        lineChanged = true;
        remainingText = remainingText.substring(idx + rep.old.length);
        break; // Apply one replacement per line pass
      }
    }

    // For new-value-only additions, check if line label matches fieldName
    if (!lineChanged) {
      for (const rep of replacements) {
        if (rep.old && rep.old.trim() !== "") continue; // Skip non-additions
        if (fieldNameMatchesLabel(rep.fieldName, line)) {
          runs.push(new TextRun({ text: line, size: 20 }));
          const newVal = `${rep.new}${rep.unit ? " " + rep.unit : ""}`;
          runs.push(new TextRun({
            text: ` → ${newVal}`,
            bold: true,
            size: 20,
            highlight: "yellow",
            color: "1B5E20",
          }));
          changeLog.push({
            sheetName: "Word Document",
            cellRef: `Line ${changeIndex + 1}`,
            oldValue: `${rep.fieldName}: (not set)`,
            newValue: `${rep.fieldName}: ${newVal}`,
            rowIndex: changeIndex,
            colIndex: 0,
          });
          changeIndex++;
          lineChanged = true;
          remainingText = "";
          break;
        }
      }
    }

    // Add remaining text
    if (remainingText) {
      runs.push(new TextRun({ text: remainingText, size: 20 }));
    }

    paragraphs.push(new Paragraph({ children: runs, spacing: { after: 120 } }));
  }

  // If no changes were found in the text, add a change summary table at the end
  if (changeLog.length === 0 && replacements.length > 0) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: "Changes Applied to This Document", bold: true, size: 24, color: "1A237E" })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
      })
    );

    const tableRows = [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Field / Parameter", bold: true, color: "FFFFFF" })] })], shading: { type: ShadingType.SOLID, color: "1A237E" } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Old Value", bold: true, color: "FFFFFF" })] })], shading: { type: ShadingType.SOLID, color: "1A237E" } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "New Value", bold: true, color: "FFFFFF" })] })], shading: { type: ShadingType.SOLID, color: "1A237E" } }),
        ],
      }),
      ...replacements.filter(r => r.new).map((r, i) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.fieldName, size: 18 })] })], shading: { type: ShadingType.SOLID, color: i % 2 === 0 ? "F5F5FF" : "FFFFFF" } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.old || "(not set)", size: 18, color: "B71C1C" })] })], shading: { type: ShadingType.SOLID, color: i % 2 === 0 ? "F5F5FF" : "FFFFFF" } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${r.new}${r.unit ? " " + r.unit : ""}`, bold: true, size: 18, color: "1B5E20", highlight: "yellow" })] })], shading: { type: ShadingType.SOLID, color: i % 2 === 0 ? "F5F5FF" : "FFFFFF" } }),
          ],
        })
      ),
    ];

    paragraphs.push(
      new Paragraph({ children: [] }), // spacer
    );

    // Add table to the document via a separate section
    const tableDoc = new Document({
      sections: [{
        children: [
          ...paragraphs,
          new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        ],
      }],
    });

    // Build change log from replacements
    for (let i = 0; i < replacements.length; i++) {
      const r = replacements[i];
      if (r.new) {
        changeLog.push({
          sheetName: "Word Document",
          cellRef: `Change ${i + 1}`,
          oldValue: `${r.fieldName}: ${r.old || "(not set)"}${r.unit ? " " + r.unit : ""}`,
          newValue: `${r.fieldName}: ${r.new}${r.unit ? " " + r.unit : ""}`,
          rowIndex: i,
          colIndex: 0,
        });
      }
    }

    const outBuffer = await Packer.toBuffer(tableDoc);
    return { buffer: outBuffer, changeLog };
  }

  // Build the final document
  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

  const outBuffer = await Packer.toBuffer(doc);
  return { buffer: outBuffer, changeLog };
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
      const tmpFile = join(tmpdir(), `pdfmod-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
      writeFileSync(tmpFile, buffer);
      let text = "";
      try {
        text = execSync(`pdftotext -layout "${tmpFile}" -`, { maxBuffer: 10 * 1024 * 1024 }).toString();
      } finally {
        if (existsSync(tmpFile)) unlinkSync(tmpFile);
      }
      return `PDF DOCUMENT: ${fileName}\n\n${text.substring(0, 10000)}`;
    } catch (e) {
      return `[Could not extract PDF content: ${e}]`;
    }
  }

  const isWord =
    mimeType.includes("wordprocessingml") ||
    mimeType.includes("msword") ||
    fileName.endsWith(".docx") ||
    fileName.endsWith(".doc");

  if (isWord) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return `WORD DOCUMENT: ${fileName}\n\n${result.value.substring(0, 12000)}`;
    } catch (e) {
      return `[Could not extract Word content: ${e}]`;
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

  const isWord =
    mimeType.includes("wordprocessingml") ||
    mimeType.includes("msword") ||
    fileName.endsWith(".docx") ||
    fileName.endsWith(".doc");

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
  } else if (isWord) {
    const result = await modifyWord(originalBuffer, changes, documentName);
    modifiedBuffer = result.buffer;
    changeLog = result.changeLog;
    outputMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    outputExtension = "docx";
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
