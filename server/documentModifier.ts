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
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
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
  /** URL of the original document with YELLOW highlights over old values (for left panel in DraftReview) */
  annotatedOriginalUrl?: string;
  annotatedOriginalKey?: string;
  /** URL of the clean modified document without any annotation highlights (for download) */
  cleanModifiedUrl?: string;
  cleanModifiedKey?: string;
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
 * Parse pdftotext -bbox HTML output to get word bounding boxes per page.
 * Returns: Map<pageIndex, Array<{word, xMin, yMin, xMax, yMax, pageWidth, pageHeight}>>
 */
function parseBboxHtml(html: string): Map<number, Array<{ word: string; xMin: number; yMin: number; xMax: number; yMax: number; pageWidth: number; pageHeight: number }>> {
  const pages = new Map<number, Array<{ word: string; xMin: number; yMin: number; xMax: number; yMax: number; pageWidth: number; pageHeight: number }>>();
  // Split by </page> to get individual page chunks (avoids dotAll regex flag)
  const pageChunks = html.split("</page>");
  for (let pageIdx = 0; pageIdx < pageChunks.length; pageIdx++) {
    const chunk = pageChunks[pageIdx];
    const headerMatch = /<page width="([\d.]+)" height="([\d.]+)">/.exec(chunk);
    if (!headerMatch) continue;
    const pageWidth = parseFloat(headerMatch[1]);
    const pageHeight = parseFloat(headerMatch[2]);
    const pageContent = chunk.substring(headerMatch.index + headerMatch[0].length);
    const words: Array<{ word: string; xMin: number; yMin: number; xMax: number; yMax: number; pageWidth: number; pageHeight: number }> = [];
    const wordRegex = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = wordRegex.exec(pageContent)) !== null) {
      words.push({
        word: wordMatch[5].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
        xMin: parseFloat(wordMatch[1]),
        yMin: parseFloat(wordMatch[2]),
        xMax: parseFloat(wordMatch[3]),
        yMax: parseFloat(wordMatch[4]),
        pageWidth,
        pageHeight,
      });
    }
    if (words.length > 0) {
      pages.set(pageIdx, words);
    }
  }
  return pages;
}

/**
 * Helper: find word bounding boxes for given search terms in a PDF.
 * Returns an array of match records with page index and coordinates.
 */
type WordEntry = { word: string; xMin: number; yMin: number; xMax: number; yMax: number; pageWidth: number; pageHeight: number };

function findTermsInPageWords(
  pageWords: Map<number, WordEntry[]>,
  searchTerms: string[]
): Array<{ pageIdx: number; wi: number; xMin: number; yMin: number; xMax: number; yMax: number; pageH: number; term: string }> {
  const matches: Array<{ pageIdx: number; wi: number; xMin: number; yMin: number; xMax: number; yMax: number; pageH: number; term: string }> = [];
  for (const [pageIdx, words] of Array.from(pageWords.entries())) {
    for (const term of searchTerms) {
      const termWords = term.trim().split(/\s+/);
      for (let wi = 0; wi <= words.length - termWords.length; wi++) {
        const matchWords = words.slice(wi, wi + termWords.length);
        const matchText = matchWords.map(w => w.word).join(" ");
        if (matchText.toLowerCase() === term.toLowerCase() ||
            matchText.toLowerCase().replace(/[,]/g, "") === term.toLowerCase().replace(/[,]/g, "")) {
          const xMin = Math.min(...matchWords.map(w => w.xMin));
          const yMin = Math.min(...matchWords.map(w => w.yMin));
          const xMax = Math.max(...matchWords.map(w => w.xMax));
          const yMax = Math.max(...matchWords.map(w => w.yMax));
          // Get page height from the first word's pageHeight
          const pageH = matchWords[0]?.pageHeight ?? 842;
          matches.push({ pageIdx, wi, xMin, yMin, xMax, yMax, pageH, term });
          break; // one match per term per page
        }
      }
    }
  }
  return matches;
}

/**
 * Extract pdftotext -bbox page words from a PDF buffer.
 * Returns null on failure.
 */
function extractPageWords(buffer: Buffer): Map<number, WordEntry[]> | null {
  const tmpPdf = join(tmpdir(), `pdf-bbox-${randomSuffix()}.pdf`);
  const tmpHtml = join(tmpdir(), `pdf-bbox-${randomSuffix()}.html`);
  try {
    writeFileSync(tmpPdf, buffer);
    execSync(`pdftotext -bbox "${tmpPdf}" "${tmpHtml}"`, { timeout: 30000 });
    const bboxHtml = readFileSync(tmpHtml, "utf8");
    return parseBboxHtml(bboxHtml);
  } catch (e) {
    console.error("[extractPageWords] Failed:", e);
    return null;
  } finally {
    if (existsSync(tmpPdf)) unlinkSync(tmpPdf);
    if (existsSync(tmpHtml)) unlinkSync(tmpHtml);
  }
}

/**
 * Annotate the ORIGINAL PDF with YELLOW highlights over old values.
 * Used for the LEFT panel in DraftReview — shows where the old values were.
 */
async function annotateOriginalPdf(
  buffer: Buffer,
  changes: ChangeEntry[],
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWords = extractPageWords(buffer);
  if (!pageWords) return buffer;

  const filteredChanges = changes.filter(c => c.oldValue && c.oldValue.trim() !== "");
  for (const change of filteredChanges) {
    // Compound terms first to avoid matching bare number and leaving the unit behind
    const searchTerms: string[] = [];
    if (change.unit) {
      searchTerms.push(`${change.oldValue}${change.unit}`);   // "155g"
      searchTerms.push(`${change.oldValue} ${change.unit}`);  // "155 g"
    }
    searchTerms.push(change.oldValue);  // "155" (fallback)
    const matches = findTermsInPageWords(pageWords, searchTerms);
    for (const m of matches) {
      const page = pdfDoc.getPage(m.pageIdx);
      const { height: pageH } = page.getSize();
      const pdfLibYMin = pageH - m.yMax;
      const pdfLibYMax = pageH - m.yMin;
      const boxH = pdfLibYMax - pdfLibYMin;
      const boxW = m.xMax - m.xMin;

      // Bold YELLOW highlight rectangle over the old value
      page.drawRectangle({
        x: m.xMin - 3,
        y: pdfLibYMin - 2,
        width: boxW + 6,
        height: boxH + 4,
        color: rgb(1.0, 0.93, 0.0),
        opacity: 0.65,
      });
      // Small label above: "OLD VALUE"
      const labelFontSize = Math.max(5, Math.min(7, boxH * 0.7));
      page.drawText("OLD", {
        x: m.xMin,
        y: pdfLibYMax + 2,
        size: labelFontSize,
        font: helveticaBold,
        color: rgb(0.7, 0.4, 0.0),
      });
    }
  }

  // Add a small "ORIGINAL — OLD VALUES HIGHLIGHTED" stamp to the first page
  const firstPage = pdfDoc.getPage(0);
  const { width, height } = firstPage.getSize();
  firstPage.drawRectangle({
    x: width - 240,
    y: height - 30,
    width: 235,
    height: 22,
    color: rgb(1.0, 0.93, 0.0),
    opacity: 0.9,
  });
  firstPage.drawText("ORIGINAL - OLD VALUES HIGHLIGHTED", {
    x: width - 232,
    y: height - 22,
    size: 8,
    font: helveticaBold,
    color: rgb(0.4, 0.2, 0.0),
  });

  const annotatedBuffer = await pdfDoc.save();
  return Buffer.from(annotatedBuffer);
}

/**
 * Modify a PDF: replace old values with new values and add GREEN highlights + arrows.
 * This is the RIGHT panel view — shows the updated document with new values highlighted.
 * Also appends a change summary page at the end.
 */
/** Strip characters not encodable by WinAnsi (pdf-lib standard fonts only support Latin-1 subset) */
function sanitizeForPdf(text: string): string {
  return text
    .replace(/[\u2014\u2013]/g, "-")  // em-dash, en-dash -> hyphen
    .replace(/[\u2018\u2019]/g, "'")  // smart quotes
    .replace(/[\u201c\u201d]/g, '"')  // smart double quotes
    .replace(/[\u2026]/g, "...")       // ellipsis
    .replace(/[\u2190-\u21ff]/g, ">") // arrows -> >
    .replace(/[^\x00-\xff]/g, "?");   // anything else outside Latin-1
}

async function modifyPdf(
  buffer: Buffer,
  changes: ChangeEntry[],
  docName: string
): Promise<{ buffer: Buffer; cleanBuffer: Buffer; changeLog: CellChange[] }> {
  // Sanitize docName to avoid WinAnsi encoding errors in pdf-lib
  const safeDocName = sanitizeForPdf(docName);
  // Load two copies: one for the annotated view, one for the clean download
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const cleanPdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const cleanHelveticaBold = await cleanPdfDoc.embedFont(StandardFonts.HelveticaBold);
  const cleanHelvetica = await cleanPdfDoc.embedFont(StandardFonts.Helvetica);

  const changeLog: CellChange[] = [];

  const pageWords = extractPageWords(buffer);
  if (pageWords) {
    // For each change, find all occurrences of oldValue across all pages
    const filteredChanges = changes.filter(c => c.oldValue && c.oldValue.trim() !== "" && c.newValue);
    for (const change of filteredChanges) {
      // Compound terms first to avoid matching bare number and leaving the unit behind
      const searchTerms: string[] = [];
      if (change.unit) {
        searchTerms.push(`${change.oldValue}${change.unit}`);   // "155g"
        searchTerms.push(`${change.oldValue} ${change.unit}`);  // "155 g"
      }
      searchTerms.push(change.oldValue);  // "155" (fallback)

      const matches = findTermsInPageWords(pageWords, searchTerms);
      for (const m of matches) {
        // ── ANNOTATED VIEW (right panel): green highlight + arrow ──────────
        const page = pdfDoc.getPage(m.pageIdx);
        const { height: pageH } = page.getSize();
        const pdfLibYMin = pageH - m.yMax;
        const pdfLibYMax = pageH - m.yMin;
        const boxH = pdfLibYMax - pdfLibYMin;
        const boxW = m.xMax - m.xMin;

        // Draw the new value text in green, replacing the old
        const newLabel = sanitizeForPdf(`${change.newValue}${change.unit ? " " + change.unit : ""}`);
        const annotFontSize = Math.max(6, Math.min(10, boxH * 0.9));

        // ── ANNOTATED VIEW (right panel): white cover + green highlight + new value ──
        // Step 1: Cover the old text with a white rectangle (fully opaque)
        page.drawRectangle({
          x: m.xMin - 2,
          y: pdfLibYMin - 2,
          width: boxW + 4,
          height: boxH + 4,
          color: rgb(1.0, 1.0, 1.0),
          opacity: 1.0,
        });
        // Step 2: Green highlight over the covered area
        page.drawRectangle({
          x: m.xMin - 2,
          y: pdfLibYMin - 2,
          width: boxW + 4,
          height: boxH + 4,
          color: rgb(0.75, 1.0, 0.75),
          opacity: 0.7,
        });
        // Step 3: Draw the new value text in dark green
        page.drawText(newLabel, {
          x: m.xMin,
          y: pdfLibYMin + (boxH - annotFontSize) / 2,
          size: annotFontSize,
          font: helveticaBold,
          color: rgb(0.05, 0.45, 0.1),
        });
        // Step 4: "NEW" label above
        const labelFontSize = Math.max(5, Math.min(7, boxH * 0.7));
        page.drawText("> NEW", {
          x: m.xMin,
          y: pdfLibYMax + 2,
          size: labelFontSize,
          font: helveticaBold,
          color: rgb(0.05, 0.45, 0.1),
        });

        // ── CLEAN DOWNLOAD (no highlights): white cover + new value text only ──
        const cleanPage = cleanPdfDoc.getPage(m.pageIdx);
        const { height: cleanPageH } = cleanPage.getSize();
        const cleanPdfLibYMin = cleanPageH - m.yMax;
        const cleanBoxH = (cleanPageH - m.yMin) - cleanPdfLibYMin;
        // Cover old text with white rectangle
        cleanPage.drawRectangle({
          x: m.xMin - 2,
          y: cleanPdfLibYMin - 2,
          width: boxW + 4,
          height: cleanBoxH + 4,
          color: rgb(1.0, 1.0, 1.0),
          opacity: 1.0,
        });
        // Draw new value in black (same style as original text)
        cleanPage.drawText(newLabel, {
          x: m.xMin,
          y: cleanPdfLibYMin + (cleanBoxH - annotFontSize) / 2,
          size: annotFontSize,
          font: cleanHelveticaBold,
          color: rgb(0.1, 0.1, 0.1),
        });

        changeLog.push({
          sheetName: `Page ${m.pageIdx + 1}`,
          cellRef: `(${Math.round(m.xMin)}, ${Math.round(m.yMin)})`,
          oldValue: `${change.fieldName}: ${change.oldValue}${change.unit ? " " + change.unit : ""}`,
          newValue: `${change.fieldName}: ${change.newValue}${change.unit ? " " + change.unit : ""}`,
          rowIndex: m.pageIdx,
          colIndex: m.wi,
        });
      }
    }
  }

  // ── Add "MODIFIED DRAFT" stamp to the annotated view ──────────────────────
  const firstPage = pdfDoc.getPage(0);
  const { width, height } = firstPage.getSize();
  firstPage.drawRectangle({
    x: width - 160,
    y: height - 30,
    width: 155,
    height: 22,
    color: rgb(0.75, 1.0, 0.75),
    opacity: 0.9,
  });
  firstPage.drawText("MODIFIED DRAFT - NEW VALUES", {
    x: width - 155,
    y: height - 22,
    size: 8,
    font: helveticaBold,
    color: rgb(0.05, 0.35, 0.1),
  });

  // ── Append change summary page to annotated view ──────────────────────────
  const summaryPage = pdfDoc.addPage([595, 842]);
  const margin = 45;
  let y = summaryPage.getHeight() - margin;

  summaryPage.drawText("CHANGE SUMMARY", {
    x: margin, y, size: 16, font: helveticaBold, color: rgb(0.1, 0.17, 0.35),
  });
  y -= 20;
  summaryPage.drawText(`Document: ${safeDocName}`, {
    x: margin, y, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4),
  });
  y -= 8;
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

  const col1 = margin;
  const col2 = margin + 180;
  const col3 = margin + 330;

  summaryPage.drawRectangle({ x: margin, y: y - 4, width: summaryPage.getWidth() - 2 * margin, height: 18, color: rgb(0.18, 0.27, 0.45) });
  summaryPage.drawText("Field / Parameter", { x: col1 + 4, y: y + 1, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  summaryPage.drawText("Old Value", { x: col2 + 4, y: y + 1, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  summaryPage.drawText("New Value", { x: col3 + 4, y: y + 1, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  y -= 18;

  const allChanges = changes.filter(c => c.newValue);
  for (let i = 0; i < allChanges.length; i++) {
    const c = allChanges[i];
    const rowBg = i % 2 === 0 ? rgb(0.96, 0.97, 1.0) : rgb(1, 1, 1);
    summaryPage.drawRectangle({ x: margin, y: y - 4, width: summaryPage.getWidth() - 2 * margin, height: 16, color: rowBg });

    const label = sanitizeForPdf(c.fieldName.length > 26 ? c.fieldName.substring(0, 24) + "..." : c.fieldName);
    const oldVal = sanitizeForPdf(`${c.oldValue ?? "(new)"}${c.unit ? " " + c.unit : ""}`).substring(0, 22);
    const newVal = sanitizeForPdf(`${c.newValue}${c.unit ? " " + c.unit : ""}`).substring(0, 22);

    summaryPage.drawText(label, { x: col1 + 4, y, size: 8, font: helvetica, color: rgb(0.15, 0.15, 0.15) });
    summaryPage.drawText(oldVal, { x: col2 + 4, y, size: 8, font: helvetica, color: rgb(0.65, 0.1, 0.1) });
    summaryPage.drawText(newVal, { x: col3 + 4, y, size: 8, font: helveticaBold, color: rgb(0.05, 0.45, 0.15) });

    y -= 16;
    if (y < margin + 40) break;
  }

  // ── Also add clean change summary to the clean version ────────────────────
  const cleanSummaryPage = cleanPdfDoc.addPage([595, 842]);
  const cleanHelvetica2 = await cleanPdfDoc.embedFont(StandardFonts.Helvetica);
  const cleanHelveticaBold2 = await cleanPdfDoc.embedFont(StandardFonts.HelveticaBold);
  let cy = cleanSummaryPage.getHeight() - margin;
  cleanSummaryPage.drawText("CHANGE SUMMARY", { x: margin, y: cy, size: 16, font: cleanHelveticaBold2, color: rgb(0.1, 0.17, 0.35) });
  cy -= 20;
  cleanSummaryPage.drawText(`Document: ${safeDocName}`, { x: margin, y: cy, size: 9, font: cleanHelvetica2, color: rgb(0.4, 0.4, 0.4) });
  cy -= 26;
  for (let i = 0; i < allChanges.length && cy > margin + 40; i++) {
    const c = allChanges[i];
    const label = sanitizeForPdf(c.fieldName.length > 26 ? c.fieldName.substring(0, 24) + "..." : c.fieldName);
    const oldVal = sanitizeForPdf(`${c.oldValue ?? "(new)"}${c.unit ? " " + c.unit : ""}`);
    const newVal = sanitizeForPdf(`${c.newValue}${c.unit ? " " + c.unit : ""}`);
    cleanSummaryPage.drawText(`${label}: ${oldVal} -> ${newVal}`, { x: margin, y: cy, size: 9, font: cleanHelvetica2, color: rgb(0.15, 0.15, 0.15) });
    cy -= 16;
  }

  const modifiedBuffer = await pdfDoc.save();
  const cleanBuffer = await cleanPdfDoc.save();
  return { buffer: Buffer.from(modifiedBuffer), cleanBuffer: Buffer.from(cleanBuffer), changeLog };
}

/**
 * Run the Python wordModifier.py script on a buffer.
 * mode: 'annotate_original' | 'modify_green' | 'modify_clean'
 * Returns the output buffer, or null on failure.
 */
function runWordModifierPy(
  inputBuffer: Buffer,
  changes: ChangeEntry[],
  mode: "annotate_original" | "modify_green" | "modify_clean"
): Buffer | null {
  const tmpIn = join(tmpdir(), `word-in-${randomSuffix()}.docx`);
  const tmpOut = join(tmpdir(), `word-out-${randomSuffix()}.docx`);
  try {
    writeFileSync(tmpIn, inputBuffer);
    const changesJson = JSON.stringify(
      changes.map(c => ({ fieldName: c.fieldName, oldValue: c.oldValue ?? "", newValue: c.newValue ?? "", unit: c.unit ?? "" }))
    );
    const scriptPath = join(__dirname, "wordModifier.py");
    const result = execSync(
      `python3.11 "${scriptPath}" ${mode} "${tmpIn}" "${tmpOut}" '${changesJson.replace(/'/g, "'\\''")}' `,
      { timeout: 60000, encoding: "utf8" }
    );
    console.log(`[WordModifier] ${mode} result: ${result.trim()}`);
    if (existsSync(tmpOut)) {
      return readFileSync(tmpOut);
    }
    return null;
  } catch (e: unknown) {
    // Exit code 2 means no matches found — still return the output file if it exists
    if (existsSync(tmpOut)) {
      return readFileSync(tmpOut);
    }
    console.error(`[WordModifier] ${mode} failed:`, e);
    return null;
  } finally {
    if (existsSync(tmpIn)) unlinkSync(tmpIn);
    if (existsSync(tmpOut)) unlinkSync(tmpOut);
  }
}

/**
 * Modify a Word (.docx) document using python-docx for TRUE in-place modification.
 * Preserves all original formatting, tables, images, headers/footers.
 * Produces three variants: annotated original (yellow), modified view (green), clean download.
 */
async function modifyWord(
  buffer: Buffer,
  changes: ChangeEntry[],
  _docName: string
): Promise<{ buffer: Buffer; annotatedOriginalBuffer: Buffer | null; cleanBuffer: Buffer | null; changeLog: CellChange[] }> {
  // Run all three variants in parallel
  const [greenBuffer, annotatedBuffer, cleanBuffer] = await Promise.all([
    Promise.resolve(runWordModifierPy(buffer, changes, "modify_green")),
    Promise.resolve(runWordModifierPy(buffer, changes, "annotate_original")),
    Promise.resolve(runWordModifierPy(buffer, changes, "modify_clean")),
  ]);

  // Build change log from changes (Python script doesn't return structured log)
  const changeLog: CellChange[] = changes
    .filter(c => c.oldValue && c.newValue)
    .map((c, i) => ({
      sheetName: "Word Document",
      cellRef: `Change ${i + 1}`,
      oldValue: `${c.fieldName}: ${c.oldValue}${c.unit ? " " + c.unit : ""}`,
      newValue: `${c.fieldName}: ${c.newValue}${c.unit ? " " + c.unit : ""}`,
      rowIndex: i,
      colIndex: 0,
    }));

  return {
    buffer: greenBuffer ?? buffer,  // right panel: green highlights
    annotatedOriginalBuffer: annotatedBuffer,  // left panel: yellow highlights on original
    cleanBuffer: cleanBuffer,  // download: no highlights
    changeLog,
  };
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

  // Extra buffers for PDF-specific annotated original and clean download
  let annotatedOriginalBuffer: Buffer | null = null;
  let cleanModifiedBuffer: Buffer | null = null;

  if (isExcel) {
    const result = await modifyExcel(originalBuffer, changes);
    modifiedBuffer = result.buffer;
    changeLog = result.changeLog;
    outputMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    outputExtension = "xlsx";
  } else if (isPdf) {
    // Produce three variants:
    // 1. annotatedOriginalBuffer — original PDF with YELLOW highlights on old values (left panel)
    // 2. modifiedBuffer — modified PDF with GREEN highlights on new values (right panel view)
    // 3. cleanModifiedBuffer — clean modified PDF without any annotation colors (download)
    const [annotated, modified] = await Promise.all([
      annotateOriginalPdf(originalBuffer, changes),
      modifyPdf(originalBuffer, changes, documentName),
    ]);
    annotatedOriginalBuffer = annotated;
    modifiedBuffer = modified.buffer;
    cleanModifiedBuffer = modified.cleanBuffer;
    changeLog = modified.changeLog;
    outputMimeType = "application/pdf";
    outputExtension = "pdf";
  } else if (isWord) {
    const result = await modifyWord(originalBuffer, changes, documentName);
    modifiedBuffer = result.buffer;
    changeLog = result.changeLog;
    // Word also produces three variants now
    if (result.annotatedOriginalBuffer) annotatedOriginalBuffer = result.annotatedOriginalBuffer;
    if (result.cleanBuffer) cleanModifiedBuffer = result.cleanBuffer;
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
  const suffix = randomSuffix();

  // Upload the annotated view (right panel — green highlights)
  const modifiedFileName = `${baseName}-modified-${suffix}.${outputExtension}`;
  const modifiedFileKey = `modified-documents/${modifiedFileName}`;
  const { url: modifiedFileUrl } = await storagePut(modifiedFileKey, modifiedBuffer, outputMimeType);

  // Upload annotated original (left panel — yellow highlights) if available
  let annotatedOriginalUrl: string | undefined;
  let annotatedOriginalKey: string | undefined;
  if (annotatedOriginalBuffer) {
    const annotOrigFileName = `${baseName}-annotated-original-${suffix}.${outputExtension}`;
    annotatedOriginalKey = `modified-documents/${annotOrigFileName}`;
    const { url } = await storagePut(annotatedOriginalKey, annotatedOriginalBuffer, outputMimeType);
    annotatedOriginalUrl = url;
  }

  // Upload clean modified (download — no highlights) if available
  let cleanModifiedUrl: string | undefined;
  let cleanModifiedKey: string | undefined;
  if (cleanModifiedBuffer) {
    const cleanFileName = `${baseName}-clean-modified-${suffix}.${outputExtension}`;
    cleanModifiedKey = `modified-documents/${cleanFileName}`;
    const { url } = await storagePut(cleanModifiedKey, cleanModifiedBuffer, outputMimeType);
    cleanModifiedUrl = url;
  }

  console.log(`[DocumentModifier] Modified ${documentName}: ${changeLog.length} cell changes applied, uploaded to ${modifiedFileUrl}`);

  return {
    modifiedFileUrl,
    modifiedFileKey,
    changeLog,
    changesApplied: changeLog.length,
    annotatedOriginalUrl,
    annotatedOriginalKey,
    cleanModifiedUrl,
    cleanModifiedKey,
  };
}
