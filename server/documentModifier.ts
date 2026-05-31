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
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import mammoth from "mammoth";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, HeadingLevel,
  BorderStyle,
} from "docx";
import { storagePut } from "./storage";
import { PDFParse } from "pdf-parse";
// Note: execSync, fs, tmpdir, path removed — no longer needed for PDF/Word paths
// (all document processing now uses pure JS libraries that work in Cloud Run)
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
 * Normalise a value for comparison:
 * - trim whitespace
 * - lowercase
 * - collapse all whitespace (including \n, \r, \t) to a single space
 * - normalise all dash variants (en-dash, em-dash) to hyphen-minus
 * - strip thousands commas from numbers
 */
function normForMatch(val: string): string {
  return val
    .replace(/[\r\n\t]+/g, " ")   // newlines → space
    .replace(/\s+/g, " ")          // collapse whitespace
    .trim()
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-") // en/em-dash → hyphen
    .replace(/,(?=\d)/g, "");        // strip thousands commas (4,320 → 4320)
}

/**
 * Check if a cell value matches an old value from the change list.
 *
 * Matching strategy (in order of precision):
 * 1. Exact match after normForMatch (handles newlines, dash variants, thousands commas)
 * 2. Cell contains the old value as a substring (only for values ≥ 6 chars to avoid false positives)
 *
 * Deliberately NO bare-numeric match — "40" must NOT match "40 arc-min" or "40 grams".
 * The caller (compareManuals) is responsible for providing values that include units
 * so the match is specific enough (e.g. "40 ml" not just "40").
 */
function matchesOldValue(cellStr: string, oldValue: string, unit?: string): boolean {
  if (!oldValue || oldValue.trim() === "") return false;

  const cell = normForMatch(cellStr);
  const old = normForMatch(oldValue);

  // 1. Exact match
  if (cell === old) return true;

  // 2. Substring match — only for values long enough to be specific
  //    Minimum 6 chars to avoid matching short numbers like "40" in unrelated cells
  if (old.length >= 6 && cell.includes(old)) return true;

  // 3. Compound match: try value+unit variants when the bare value is short (< 6 chars)
  //    e.g. oldValue="155", unit="g" → try "155g", "155gm", "155 g", "155 gm"
  //    This handles documents that store "155gm" when the user entered "155" with unit "g"
  if (unit && unit.trim()) {
    const u = unit.trim().toLowerCase();
    const variants = [
      old + u,           // "155g"
      old + " " + u,     // "155 g"
      old + u + "m",     // "155gm" (grams abbreviation)
      old + " " + u + "m", // "155 gm"
    ];
    for (const v of variants) {
      if (cell === v) return true;
      if (v.length >= 4 && cell.includes(v)) return true;
    }
  }

  // 4. Numeric prefix match: if oldValue is a pure number, check if the cell starts
  //    with that number followed by a non-digit (e.g. "155gm" starts with "155" then "g")
  //    Only apply when oldValue is a pure integer/decimal (no letters)
  if (/^\d+(\.\d+)?$/.test(old)) {
    const numericPrefixRegex = new RegExp(`^${old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\d]`);
    if (numericPrefixRegex.test(cell)) return true;
  }

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
 * The newValue from compareManuals already contains the full cell value
 * (including units and format) so we return it directly.
 * Only falls back to substring replacement if the cell has surrounding text.
 */
function buildNewValue(
  originalCellValue: string | number | boolean | Date | null,
  oldValue: string,
  newValue: string,
  unit?: string
): string | number {
  if (originalCellValue === null || originalCellValue === undefined) return newValue;

  const cellStr = String(originalCellValue);
  const cellNorm = normForMatch(cellStr);
  const oldNorm = normForMatch(oldValue);

  // 1. Exact match: cell IS the old value — return new value directly.
  if (cellNorm === oldNorm) {
    return newValue;
  }

  // 2. Compound unit match: cell is "155gm" but old is "155" with unit "g".
  //    Detect the unit suffix in the cell and preserve it in the output.
  //    e.g. cell="155gm", old="155", new="170", unit="g" → "170gm"
  if (unit && unit.trim() && /^\d+(\.\d+)?$/.test(oldNorm)) {
    const u = unit.trim().toLowerCase();
    const variants = [
      { suffix: u + "m", pattern: oldNorm + u + "m" },   // "155gm"
      { suffix: " " + u + "m", pattern: oldNorm + " " + u + "m" }, // "155 gm"
      { suffix: u, pattern: oldNorm + u },                // "155g"
      { suffix: " " + u, pattern: oldNorm + " " + u },   // "155 g"
    ];
    for (const { suffix, pattern } of variants) {
      if (cellNorm === pattern) {
        // Preserve the suffix from the original cell (exact case/spacing)
        const cellSuffix = cellStr.slice(oldValue.length);
        return newValue + cellSuffix;
      }
      if (cellNorm.includes(pattern)) {
        // Cell has surrounding text — replace the compound form
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const replaced = cellStr.replace(new RegExp(escapedPattern, "gi"), newValue + suffix);
        if (replaced !== cellStr) return replaced;
      }
    }
  }

  // 3. Cell has surrounding text — do a targeted substring replacement.
  //    Normalise dashes in both before replacing so "75 – 90" matches "75 - 90" in cell.
  const normOld = oldValue.replace(/[\u2013\u2014]/g, "-");
  const escapedOld = normOld.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escapedOld, "gi");
  const replaced = cellStr.replace(regex, newValue);
  if (replaced !== cellStr) return replaced;

  // Fallback: just return the new value
  return newValue;
}

/**
 * Helper: get a cell's string value from ExcelJS.
 */
function getCellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "richText" in (v as object)) {
    return (v as ExcelJS.CellRichTextValue).richText.map(r => r.text).join("");
  }
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Check if a cell is the master (top-left) cell of its merge group.
 * ExcelJS reports the same value on every row of a merged range — we must only
 * process the master cell to avoid highlighting/modifying the same logical cell
 * multiple times (once per row in the merge).
 *
 * For non-merged cells, isMerged is false and the cell is always its own master.
 */
function isMasterCell(cell: ExcelJS.Cell): boolean {
  if (!cell.isMerged) return true;
  // cell.master is the top-left cell of the merge range
  return cell.address === cell.master.address;
}

/**
 * After setting a fill on a master cell, ExcelJS propagates that fill to all slave
 * cells in the merge range when writing the file. This helper explicitly resets every
 * slave cell's fill to "none" so the colour only appears on the master row visually.
 */
function clearSlaveFills(worksheet: ExcelJS.Worksheet, masterCell: ExcelJS.Cell): void {
  if (!masterCell.isMerged) return;
  // Access the internal _merges map to find the merge range for this master cell
  const merges = (worksheet as any)._merges as Record<string, { model: { top: number; left: number; bottom: number; right: number } }> | undefined;
  if (!merges) return;
  const masterKey = masterCell.address; // e.g. "G71"
  const range = merges[masterKey];
  if (!range) return;
  const { top, left, bottom, right } = range.model;
  for (let r = top + 1; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      const slaveCell = worksheet.getCell(r, c);
      slaveCell.fill = { type: "none" } as any;
    }
  }
}

/**
 * Produce the ANNOTATED ORIGINAL Excel: original values kept, matched cells highlighted YELLOW.
 * This is the LEFT panel in DraftReview — shows where the old values are.
 */
/**
 * Determine whether a row in the lube map is the data row for the affected equipment.
 *
 * The Lube Map structure has ONE data row per component — col A of that row contains
 * the component name (e.g. "Gear box"). The rows below it are empty visual spacers
 * (merged cells for height). We must ONLY match the actual data row where col A
 * itself contains the equipment name. Walking upward into spacer rows is wrong.
 *
 * @param worksheet  The ExcelJS worksheet to scan
 * @param rowNumber  The 1-based row number to check
 * @param equipmentName  The affected equipment name from the change event (e.g. "Gearbox")
 */
function isEquipmentRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  equipmentName: string
): boolean {
  if (!equipmentName || equipmentName.trim() === "") return true; // no equipment constraint — allow all rows (weight/price changes)

  // Only check col A of THIS row — do NOT walk upward.
  // Empty rows below a data row are visual spacers and must never be touched.
  const colA = getCellStr(worksheet.getCell(rowNumber, 1)).trim();
  if (!colA) return false;

  // Build normalised variants to handle "gear box" vs "gearbox" spelling
  const normLabel = normForMatch(colA);
  const normEquip = normForMatch(equipmentName);
  const compactEquip = normEquip.replace(/\s+/g, ""); // "gear box" → "gearbox"
  const compactLabel = normLabel.replace(/\s+/g, "");

  return normLabel.includes(normEquip) || normLabel.includes(compactEquip) ||
         normEquip.includes(normLabel) || compactEquip.includes(normLabel) ||
         compactLabel.includes(compactEquip) || compactEquip.includes(compactLabel);
}

/**
 * Apply highlight fills (yellow or green) directly to an Excel buffer at the XML level.
 *
 * This function bypasses ExcelJS's style-sharing mechanism entirely by working
 * directly on the XLSX ZIP archive. It:
 * 1. Adds the highlight fill colour to the styles XML (if not already present).
 * 2. For each cell address in `cellsToHighlight`, creates a new xf (style) entry
 *    that is identical to the cell's current style but with the highlight fillId.
 * 3. Updates the cell's `s` attribute in the worksheet XML to point to the new style.
 *
 * KEY FIX: Uses the `count` attribute from `<cellXfs count="N">` to determine the
 * correct starting index for new styles. The regex-based xf parser misses some
 * multi-line entries, so counting from the attribute is the only reliable method.
 *
 * @param buffer            The original Excel buffer (unmodified by ExcelJS fills)
 * @param cellsToHighlight  Map of cell address → highlight colour ("yellow" | "green")
 */
async function applyHighlightsToExcelXml(
  buffer: Buffer,
  cellsToHighlight: Map<string, "yellow" | "green">
): Promise<Buffer> {
  if (cellsToHighlight.size === 0) return buffer;

  const zip = await JSZip.loadAsync(buffer);
  const files = Object.keys(zip.files);
  const sheetFile = files.find(f => f.includes("worksheets/sheet") && !f.endsWith("/"));
  if (!sheetFile) return buffer;

  let sheetXml = await zip.file(sheetFile)!.async("string");
  let stylesXml = await zip.file("xl/styles.xml")!.async("string");

  // --- Step 1: Ensure highlight fills exist in the styles XML ---
  const fillsSection = stylesXml.match(/<fills[^>]*>([\s\S]*?)<\/fills>/)?.[1] ?? "";
  const fillMatches = Array.from(fillsSection.matchAll(/<fill>([\s\S]*?)<\/fill>/g));

  const YELLOW_ARGB = "FFFFFF00";
  const GREEN_ARGB = "FF92D050";

  let yellowFillId = fillMatches.findIndex(m => m[1].includes(YELLOW_ARGB));
  let greenFillId = fillMatches.findIndex(m => m[1].includes(GREEN_ARGB));

  const newFills: string[] = [];
  if (yellowFillId < 0) {
    yellowFillId = fillMatches.length + newFills.length;
    newFills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${YELLOW_ARGB}"/></patternFill></fill>`);
  }
  if (greenFillId < 0) {
    greenFillId = fillMatches.length + newFills.length;
    newFills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${GREEN_ARGB}"/></patternFill></fill>`);
  }
  if (newFills.length > 0) {
    stylesXml = stylesXml.replace(
      /(<fills count=")(\d+)(")/,
      (_, pre, count, post) => `${pre}${parseInt(count) + newFills.length}${post}`
    );
    stylesXml = stylesXml.replace("</fills>", newFills.join("") + "</fills>");
  }

  // --- Step 2: Get the correct current xf count from the count attribute ---
  // IMPORTANT: Do NOT use regex match count — some xf entries span multiple lines
  // and the regex misses them. The count attribute is always correct.
  const currentXfCount = parseInt(
    stylesXml.match(/<cellXfs count="(\d+)"/)?.[1] ?? "0"
  );

  // Parse xf entries for attribute lookup (regex may miss some, but we only need
  // to look up attributes for cells we're highlighting — indices 0..52 are safe)
  const cellXfsSection = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  const xfEntries = Array.from(cellXfsSection.matchAll(/<xf([^>]*)(?:\/>|>[\s\S]*?<\/xf>)/g));

  // --- Step 3: For each cell to highlight, create a new xf with the highlight fill ---
  const styleToHighlightStyle = new Map<number, number>(); // originalStyleIdx → newHighlightStyleIdx
  const newXfEntries: string[] = [];
  let nextStyleIdx = currentXfCount;

  // Get the current style index for each cell to highlight
  const cellCurrentStyle = new Map<string, number>();
  for (const addr of Array.from(cellsToHighlight.keys())) {
    const m = sheetXml.match(new RegExp(`<c r="${addr}" s="(\\d+)"`));
    if (m) cellCurrentStyle.set(addr, parseInt(m[1]));
  }

  // Create new highlight styles (one per unique original style)
  for (const [addr, colour] of Array.from(cellsToHighlight.entries())) {
    const currentStyleIdx = cellCurrentStyle.get(addr);
    if (currentStyleIdx === undefined) continue;
    const fillId = colour === "yellow" ? yellowFillId : greenFillId;
    if (!styleToHighlightStyle.has(currentStyleIdx)) {
      const currentAttrs = xfEntries[currentStyleIdx]?.[1] ?? "";
      const numFmt = currentAttrs.match(/numFmtId="(\d+)"/)?.[ 1] ?? "0";
      const font   = currentAttrs.match(/fontId="(\d+)"/)?.[ 1] ?? "0";
      const border = currentAttrs.match(/borderId="(\d+)"/)?.[ 1] ?? "0";
      // Build new xf WITHOUT applyFill — ExcelJS reads fills correctly when applyFill is absent
      const newXf = ` numFmtId="${numFmt}" fontId="${font}" fillId="${fillId}" borderId="${border}" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"`;
      styleToHighlightStyle.set(currentStyleIdx, nextStyleIdx);
      newXfEntries.push(`<xf${newXf}/>`);
      nextStyleIdx++;
    }
  }

  if (newXfEntries.length > 0) {
    stylesXml = stylesXml.replace(
      /(<cellXfs count=")(\d+)(")/,
      (_, pre, count, post) => `${pre}${parseInt(count) + newXfEntries.length}${post}`
    );
    stylesXml = stylesXml.replace("</cellXfs>", newXfEntries.join("") + "</cellXfs>");
  }

  // --- Step 4: Patch the worksheet XML to assign new highlight styles ---
  sheetXml = sheetXml.replace(/<c r="([^"]+)" s="(\d+)"/g, (match, addr, styleIdx) => {
    if (cellsToHighlight.has(addr)) {
      const newStyle = styleToHighlightStyle.get(parseInt(styleIdx));
      if (newStyle !== undefined) {
        return `<c r="${addr}" s="${newStyle}"`;
      }
    }
    return match;
  });

  zip.file(sheetFile, sheetXml);
  zip.file("xl/styles.xml", stylesXml);
  const patched = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(patched);
}

/** @deprecated Use isEquipmentRow instead */
function isGearboxRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  _oldLubricant: string
): boolean {
  return isEquipmentRow(worksheet, rowNumber, "gearbox");
}

async function annotateOriginalExcel(
  buffer: Buffer,
  changes: ChangeEntry[],
  affectedEquipment?: string
): Promise<{ buffer: Buffer; changeLog: CellChange[] }> {
  // Phase 1: Use ExcelJS to FIND which cells to highlight (no fill setting)
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const changeLog: CellChange[] = [];
  // Only include changes where the value ACTUALLY changes — skip entries where old === new
  const replacementChanges = changes.filter(c =>
    c.oldValue && c.oldValue.trim() !== "" && c.newValue &&
    normForMatch(c.oldValue) !== normForMatch(c.newValue)
  );

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const cellStr = getCellStr(cell);
        if (!cellStr) return;
        if (!isMasterCell(cell)) return;
        if (!isEquipmentRow(worksheet, rowNumber, affectedEquipment ?? "")) return;
        for (const change of replacementChanges) {
          if (matchesOldValue(cellStr, change.oldValue, change.unit)) {
            const cellRef = `${String.fromCharCode(64 + colNumber)}${rowNumber}`;
            changeLog.push({
              sheetName: worksheet.name, cellRef,
              oldValue: cellStr, newValue: cellStr,
              rowIndex: rowNumber, colIndex: colNumber,
            });
            break;
          }
        }
      });
    });
  }

  // Phase 2: Apply highlights directly to the ORIGINAL buffer via JSZip XML patching
  const cellsToHighlight = new Map<string, "yellow" | "green">();
  for (const entry of changeLog) {
    cellsToHighlight.set(entry.cellRef, "yellow");
  }
  const highlightedBuffer = await applyHighlightsToExcelXml(buffer, cellsToHighlight);
  return { buffer: highlightedBuffer, changeLog };
}

/**
 * Produce the MODIFIED Excel: new values written, changed cells highlighted GREEN.
 * This is the RIGHT panel in DraftReview — shows the updated document.
 */
async function modifyExcelGreen(
  buffer: Buffer,
  changes: ChangeEntry[],
  affectedEquipment?: string
): Promise<{ buffer: Buffer; changeLog: CellChange[] }> {
  // Phase 1: Use ExcelJS to write new values (NO fill setting) and record which cells changed
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const changeLog: CellChange[] = [];
  const replacementChanges = changes.filter(c =>
    c.oldValue && c.oldValue.trim() !== "" && c.newValue &&
    normForMatch(c.oldValue) !== normForMatch(c.newValue)
  );

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const cellStr = getCellStr(cell);
        if (!cellStr) return;
        if (!isMasterCell(cell)) return;
        if (!isEquipmentRow(worksheet, rowNumber, affectedEquipment ?? "")) return;
        for (const change of replacementChanges) {
          if (matchesOldValue(cellStr, change.oldValue, change.unit)) {
            const newVal = buildNewValue(
              cell.value as string | number | boolean | Date | null,
              change.oldValue, change.newValue, change.unit
            );
            const cellRef = `${String.fromCharCode(64 + colNumber)}${rowNumber}`;
            changeLog.push({
              sheetName: worksheet.name, cellRef,
              oldValue: cellStr, newValue: String(newVal),
              rowIndex: rowNumber, colIndex: colNumber,
            });
            cell.value = newVal;
            // DO NOT set fill here — ExcelJS fill propagation corrupts other cells
            break;
          }
        }
      });
    });
  }

  // Write the new values to a buffer (no fills set)
  const valueBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

  // Phase 2: Apply GREEN highlights directly to the value-updated buffer via JSZip XML patching
  const cellsToHighlight = new Map<string, "yellow" | "green">();
  for (const entry of changeLog) {
    cellsToHighlight.set(entry.cellRef, "green");
  }
  const highlightedBuffer = await applyHighlightsToExcelXml(valueBuffer, cellsToHighlight);
  return { buffer: highlightedBuffer, changeLog };
}

/**
 * Produce the CLEAN MODIFIED Excel: new values written, NO highlight colours.
 * This is the download version — looks like a normal document.
 */
async function modifyExcelClean(
  buffer: Buffer,
  changes: ChangeEntry[],
  affectedEquipment?: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const replacementChanges = changes.filter(c =>
    c.oldValue && c.oldValue.trim() !== "" && c.newValue &&
    normForMatch(c.oldValue) !== normForMatch(c.newValue)
  );

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
      _row.eachCell({ includeEmpty: false }, (cell) => {
        const cellStr = getCellStr(cell);
        if (!cellStr) return;
        // Skip non-master cells of merged ranges
        if (!isMasterCell(cell)) return;
        // Always check the equipment row guard. isEquipmentRow returns false when
        // equipmentName is empty, so no rows are modified when equipment is unspecified.
        if (!isEquipmentRow(worksheet, rowNumber, affectedEquipment ?? "")) return;
        for (const change of replacementChanges) {
          if (matchesOldValue(cellStr, change.oldValue, change.unit)) {
            const newVal = buildNewValue(
              cell.value as string | number | boolean | Date | null,
              change.oldValue, change.newValue, change.unit
            );
            cell.value = newVal;
            // No fill change — preserve original cell colour
            break;
          }
        }
      });
    });
  }
  const outBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(outBuffer);
}

/**
 * @deprecated Use annotateOriginalExcel + modifyExcelGreen + modifyExcelClean instead.
 * Kept for backward compatibility.
 */
async function modifyExcel(
  buffer: Buffer,
  changes: ChangeEntry[]
): Promise<{ buffer: Buffer; changeLog: CellChange[] }> {
  return modifyExcelGreen(buffer, changes);
}


/**
 * A text item from a PDF page with its bounding box.
 */
type TextItem = { str: string; xMin: number; yMin: number; xMax: number; yMax: number };

/**
 * A line of text on a PDF page: items grouped by Y coordinate, sorted by X.
 * The `text` field is the concatenated string; `charMap` maps each character
 * index in `text` back to approximate X coordinates for bounding box extraction.
 */
type PageLine = {
  text: string;
  yMin: number;
  yMax: number;
  charMap: Array<{ x: number; w: number }>; // one entry per char in `text`
};

/**
 * Structured page data: lines of text with character-level position mapping.
 */
type PageData = {
  lines: PageLine[];
  pageWidth: number;
  pageHeight: number;
};

/**
 * Helper: find search terms in page data using line-based concatenation.
 * This correctly handles PDFs where text items are fragmented across runs
 * (e.g., "155gm" split as "1" + "55" + "gm" in separate text items).
 *
 * Returns an array of match records with page index and bounding box coordinates.
 */
function findTermsInPages(
  pageData: Map<number, PageData>,
  searchTerms: string[]
): Array<{ pageIdx: number; wi: number; xMin: number; yMin: number; xMax: number; yMax: number; pageH: number; term: string }> {
  const matches: Array<{ pageIdx: number; wi: number; xMin: number; yMin: number; xMax: number; yMax: number; pageH: number; term: string }> = [];

  for (const [pageIdx, data] of Array.from(pageData.entries())) {
    for (const term of searchTerms) {
      const termLower = term.toLowerCase();
      let found = false;
      for (const line of data.lines) {
        const lineLower = line.text.toLowerCase();
        const idx = lineLower.indexOf(termLower);
        if (idx === -1) continue;

        // Map character range back to X coordinates
        const startChar = line.charMap[idx];
        const endChar = line.charMap[idx + term.length - 1];
        if (!startChar || !endChar) continue;

        const xMin = startChar.x;
        const xMax = endChar.x + endChar.w;

        matches.push({
          pageIdx,
          wi: idx,
          xMin,
          yMin: line.yMin,
          xMax,
          yMax: line.yMax,
          pageH: data.pageHeight,
          term,
        });
        found = true;
        break; // one match per term per page
      }
      if (found) break; // first matching term wins (compound terms checked first)
    }
  }
  return matches;
}

/**
 * Extract structured page data from a PDF buffer using pdf-parse v2 (pure JS).
 * Groups text items into lines, concatenates them, and builds a character-level
 * position map for accurate bounding box extraction during search.
 *
 * This approach correctly handles PDFs where text items are fragmented across
 * multiple runs (common in complex PDFs with mixed fonts, colors, or formatting).
 */
async function extractPageData(buffer: Buffer): Promise<Map<number, PageData> | null> {
  try {
    const parser = new PDFParse({ data: Buffer.from(buffer) });
    await parser.getText({ partial: [1] });
    const doc = (parser as any).doc;
    if (!doc) {
      await parser.destroy();
      return null;
    }
    const numPages = doc.numPages;
    const pages = new Map<number, PageData>();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent({ includeMarkedContent: false });

      // Collect all text items with their bounding boxes
      const items: TextItem[] = [];
      for (const item of textContent.items) {
        if (!item.str) continue;
        const x = item.transform[4];
        const y = item.transform[5];
        const fontSize = Math.abs(item.transform[3]) || item.height || 10;
        const width = item.width || (item.str.length * fontSize * 0.5);

        items.push({
          str: item.str,
          xMin: x,
          // Convert from PDF coords (origin bottom-left) to top-left coords
          yMin: viewport.height - y - fontSize,
          xMax: x + width,
          yMax: viewport.height - y,
        });
      }

      // Group items into lines by Y coordinate (tolerance: half of typical font size)
      const lineGroups: Array<{ yCenter: number; items: TextItem[] }> = [];
      for (const item of items) {
        const yCenter = (item.yMin + item.yMax) / 2;
        const lineHeight = item.yMax - item.yMin;
        const tolerance = lineHeight * 0.5 || 5;
        let foundGroup = false;
        for (const group of lineGroups) {
          if (Math.abs(group.yCenter - yCenter) < tolerance) {
            group.items.push(item);
            // Update group center as running average
            group.yCenter = (group.yCenter * (group.items.length - 1) + yCenter) / group.items.length;
            foundGroup = true;
            break;
          }
        }
        if (!foundGroup) {
          lineGroups.push({ yCenter, items: [item] });
        }
      }

      // Sort groups top-to-bottom, items within each group left-to-right
      lineGroups.sort((a, b) => a.yCenter - b.yCenter);

      const lines: PageLine[] = [];
      for (const group of lineGroups) {
        group.items.sort((a, b) => a.xMin - b.xMin);

        // Concatenate items into a single line string with character position mapping
        let text = "";
        const charMap: Array<{ x: number; w: number }> = [];
        let yMin = Infinity;
        let yMax = -Infinity;

        for (let i = 0; i < group.items.length; i++) {
          const item = group.items[i];
          yMin = Math.min(yMin, item.yMin);
          yMax = Math.max(yMax, item.yMax);

          // Determine if we need to insert a space between this item and the previous
          if (i > 0) {
            const prevItem = group.items[i - 1];
            const gap = item.xMin - prevItem.xMax;
            const avgCharWidth = (prevItem.xMax - prevItem.xMin) / Math.max(1, prevItem.str.length);
            // Insert space if gap is larger than ~30% of average char width
            if (gap > avgCharWidth * 0.3) {
              const spaceX = prevItem.xMax;
              const spaceW = gap;
              text += " ";
              charMap.push({ x: spaceX, w: spaceW });
            }
            // If items overlap or are very close, concatenate directly (no space)
          }

          // Add each character of this item to the map
          const itemCharWidth = (item.xMax - item.xMin) / Math.max(1, item.str.length);
          for (let ci = 0; ci < item.str.length; ci++) {
            text += item.str[ci];
            charMap.push({
              x: item.xMin + ci * itemCharWidth,
              w: itemCharWidth,
            });
          }
        }

        if (text.trim()) {
          lines.push({ text, yMin, yMax, charMap });
        }
      }

      if (lines.length > 0) {
        pages.set(pageNum - 1, { lines, pageWidth: viewport.width, pageHeight: viewport.height });
      }
      page.cleanup();
    }

    await parser.destroy();
    return pages;
  } catch (e) {
    console.error("[extractPageData] Failed:", e);
    return null;
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

  const pageData = await extractPageData(buffer);
  if (!pageData) return buffer;

  const filteredChanges = changes.filter(c => c.oldValue && c.oldValue.trim() !== "");
  for (const change of filteredChanges) {
    // Compound terms first to avoid matching bare number and leaving the unit behind
    const searchTerms: string[] = [];
    if (change.unit) {
      searchTerms.push(`${change.oldValue}${change.unit}`);   // "155g"
      searchTerms.push(`${change.oldValue} ${change.unit}`);  // "155 g"
    }
    searchTerms.push(change.oldValue);  // "155" (fallback)
    const matches = findTermsInPages(pageData, searchTerms);
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

  const pageData = await extractPageData(buffer);
  if (pageData) {
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

      const matches = findTermsInPages(pageData, searchTerms);
      for (const m of matches) {
        // ── ANNOTATED VIEW (right panel): green highlight + arrow ──────────
        const page = pdfDoc.getPage(m.pageIdx);
        const { height: pageH } = page.getSize();
        const pdfLibYMin = pageH - m.yMax;
        const pdfLibYMax = pageH - m.yMin;
        const boxH = pdfLibYMax - pdfLibYMin;
        const boxW = m.xMax - m.xMin;

        // Draw the new value text in green, replacing the old
        // Only append unit if newValue doesn't already end with it (prevents "170gm gm")
        const pdfUnitSuffix = change.unit && !change.newValue.toLowerCase().endsWith(change.unit.toLowerCase()) ? ` ${change.unit}` : "";
        const newLabel = sanitizeForPdf(`${change.newValue}${pdfUnitSuffix}`);
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

        const clOldSuffix = change.unit && !change.oldValue.toLowerCase().endsWith(change.unit.toLowerCase()) ? ` ${change.unit}` : "";
        const clNewSuffix = change.unit && !change.newValue.toLowerCase().endsWith(change.unit.toLowerCase()) ? ` ${change.unit}` : "";
        changeLog.push({
          sheetName: `Page ${m.pageIdx + 1}`,
          cellRef: `(${Math.round(m.xMin)}, ${Math.round(m.yMin)})`,
          oldValue: `${change.fieldName}: ${change.oldValue}${clOldSuffix}`,
          newValue: `${change.fieldName}: ${change.newValue}${clNewSuffix}`,
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
    const sumOldSuffix = c.unit && c.oldValue && !c.oldValue.toLowerCase().endsWith(c.unit.toLowerCase()) ? ` ${c.unit}` : "";
    const sumNewSuffix = c.unit && !c.newValue.toLowerCase().endsWith(c.unit.toLowerCase()) ? ` ${c.unit}` : "";
    const oldVal = sanitizeForPdf(`${c.oldValue ?? "(new)"}${sumOldSuffix}`).substring(0, 22);
    const newVal = sanitizeForPdf(`${c.newValue}${sumNewSuffix}`).substring(0, 22);

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
    const cleanOldSuffix = c.unit && c.oldValue && !c.oldValue.toLowerCase().endsWith(c.unit.toLowerCase()) ? ` ${c.unit}` : "";
    const cleanNewSuffix = c.unit && !c.newValue.toLowerCase().endsWith(c.unit.toLowerCase()) ? ` ${c.unit}` : "";
    const oldVal = sanitizeForPdf(`${c.oldValue ?? "(new)"}${cleanOldSuffix}`);
    const newVal = sanitizeForPdf(`${c.newValue}${cleanNewSuffix}`);
    cleanSummaryPage.drawText(`${label}: ${oldVal} -> ${newVal}`, { x: margin, y: cy, size: 9, font: cleanHelvetica2, color: rgb(0.15, 0.15, 0.15) });
    cy -= 16;
  }

  const modifiedBuffer = await pdfDoc.save();
  const cleanBuffer = await cleanPdfDoc.save();
  return { buffer: Buffer.from(modifiedBuffer), cleanBuffer: Buffer.from(cleanBuffer), changeLog };
}

/**
 * Pure JS Word document modifier — replaces the Python wordModifier.py script.
 * Uses JSZip to open the .docx, manipulates the XML directly to find/replace text
 * in runs while preserving all original formatting.
 *
 * mode: 'annotate_original' | 'modify_green' | 'modify_clean'
 * Returns the output buffer, or null on failure.
 */
async function runWordModifierJs(
  inputBuffer: Buffer,
  changes: ChangeEntry[],
  mode: "annotate_original" | "modify_green" | "modify_clean"
): Promise<Buffer | null> {
  try {
    const zip = await JSZip.loadAsync(inputBuffer);

    // Process all document parts that can contain text
    const xmlParts = [
      "word/document.xml",
      "word/header1.xml", "word/header2.xml", "word/header3.xml",
      "word/footer1.xml", "word/footer2.xml", "word/footer3.xml",
    ];

    let totalChanges = 0;

    for (const partPath of xmlParts) {
      const file = zip.file(partPath);
      if (!file) continue;
      let xml = await file.async("string");
      const result = applyChangesToDocXml(xml, changes, mode);
      if (result.changesApplied > 0) {
        zip.file(partPath, result.xml);
        totalChanges += result.changesApplied;
      }
    }

    console.log(`[WordModifierJS] ${mode}: ${totalChanges} changes applied`);
    const outputBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return outputBuffer;
  } catch (e) {
    console.error(`[WordModifierJS] ${mode} failed:`, e);
    return null;
  }
}

/**
 * Apply text changes to a Word XML part (document.xml, header, footer).
 * Searches for old values in paragraph text, replaces them, and optionally adds highlights.
 *
 * Strategy:
 * 1. Find all <w:p> elements (paragraphs)
 * 2. For each paragraph, concatenate all <w:t> text to get the full paragraph text
 * 3. Search for each change's old value (compound terms first)
 * 4. When found, rebuild the runs to split at match boundaries
 * 5. Apply highlight/replacement to the matched segment
 */
function applyChangesToDocXml(
  xml: string,
  changes: ChangeEntry[],
  mode: "annotate_original" | "modify_green" | "modify_clean"
): { xml: string; changesApplied: number } {
  let changesApplied = 0;

  // Process each paragraph
  // Match <w:p ...>...</w:p> or <w:p/> (self-closing)
  const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  
  xml = xml.replace(pRegex, (pXml) => {
    // Extract all runs from this paragraph
    const runRegex = /<w:r[\s>][\s\S]*?<\/w:r>/g;
    const runs: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = runRegex.exec(pXml)) !== null) {
      runs.push(match[0]);
    }
    if (runs.length === 0) return pXml;

    // Get full text from all runs
    const runTexts = runs.map(r => {
      const tMatch = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let text = "";
      let m: RegExpExecArray | null;
      while ((m = tMatch.exec(r)) !== null) {
        text += m[1];
      }
      return text;
    });
    const fullText = runTexts.join("");
    if (!fullText.trim()) return pXml;

    // Try each change
    for (const change of changes) {
      const oldVal = (change.oldValue ?? "").trim();
      const newVal = (change.newValue ?? "").trim();
      const unit = (change.unit ?? "").trim();
      if (!oldVal || !newVal) continue;

      // Build search terms in priority order (longest compound first)
      const searchTerms: string[] = [];
      if (unit) {
        searchTerms.push(`${oldVal}${unit}`);
        searchTerms.push(`${oldVal} ${unit}`);
        for (let prefixLen = unit.length - 1; prefixLen > 0; prefixLen--) {
          const prefix = unit.substring(0, prefixLen);
          searchTerms.push(`${oldVal}${prefix}`);
          searchTerms.push(`${oldVal} ${prefix}`);
        }
      }
      searchTerms.push(oldVal);

      // Find a match in the full text
      let matchStart = -1;
      let matchEnd = -1;
      let matchedTerm = "";
      for (const term of searchTerms) {
        const idx = fullText.toLowerCase().indexOf(term.toLowerCase());
        if (idx !== -1) {
          matchStart = idx;
          matchEnd = idx + term.length;
          matchedTerm = term;
          break;
        }
      }
      if (matchStart === -1) continue;

      // Determine replacement text
      let replacementText: string;
      if (mode === "annotate_original") {
        replacementText = fullText.substring(matchStart, matchEnd); // keep original text
      } else {
        if (unit && !newVal.toLowerCase().endsWith(unit.toLowerCase())) {
          replacementText = `${newVal} ${unit}`;
        } else {
          replacementText = newVal;
        }
      }

      // Determine highlight color
      let highlightColor: string | null = null;
      if (mode === "annotate_original") highlightColor = "yellow";
      else if (mode === "modify_green") highlightColor = "green";

      // Rebuild runs with the match split
      // Build character-to-run map
      const charToRun: number[] = [];
      for (let ri = 0; ri < runTexts.length; ri++) {
        for (let ci = 0; ci < runTexts[ri].length; ci++) {
          charToRun.push(ri);
        }
      }

      // Build new runs
      const newRuns: string[] = [];
      let charIdx = 0;
      for (let ri = 0; ri < runs.length; ri++) {
        const runText = runTexts[ri];
        const runStart = charIdx;
        const runEnd = charIdx + runText.length;

        // Determine which segments of this run fall in before/matched/after
        const segments: Array<{ text: string; segment: "before" | "matched" | "after" }> = [];

        const beforeEnd = Math.min(runEnd, matchStart);
        if (beforeEnd > runStart) {
          segments.push({ text: fullText.substring(runStart, beforeEnd), segment: "before" });
        }

        const matchedStart = Math.max(runStart, matchStart);
        const matchedEnd = Math.min(runEnd, matchEnd);
        if (matchedStart < matchedEnd) {
          segments.push({ text: fullText.substring(matchedStart, matchedEnd), segment: "matched" });
        }

        const afterStart = Math.max(runStart, matchEnd);
        if (afterStart < runEnd) {
          segments.push({ text: fullText.substring(afterStart, runEnd), segment: "after" });
        }

        // Get the run's rPr (formatting properties)
        const rPrMatch = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(runs[ri]);
        const rPr = rPrMatch ? rPrMatch[0] : "";

        for (const seg of segments) {
          if (!seg.text && seg.segment !== "matched") continue;

          let segText = seg.text;
          let segRPr = rPr;

          if (seg.segment === "matched") {
            // Use replacement text (only for the first run that contains matched text)
            if (segments[0]?.segment === "matched" || !segments.some(s => s.segment === "matched" && s !== seg)) {
              segText = replacementText;
              // Clear replacement for subsequent matched segments
              replacementText = "";
            } else {
              segText = ""; // subsequent matched runs get empty text
            }

            // Add highlight to rPr
            if (highlightColor && segText) {
              if (segRPr) {
                // Remove existing highlight
                segRPr = segRPr.replace(/<w:highlight[^/]*\/>/g, "");
                segRPr = segRPr.replace(/<w:highlight[^>]*>[\s\S]*?<\/w:highlight>/g, "");
                // Add new highlight before closing </w:rPr>
                segRPr = segRPr.replace("</w:rPr>", `<w:highlight w:val="${highlightColor}"/></w:rPr>`);
              } else {
                segRPr = `<w:rPr><w:highlight w:val="${highlightColor}"/></w:rPr>`;
              }
            }
          }

          if (segText === "" && seg.segment !== "matched") continue;

          // Build the run XML
          const spaceAttr = (segText.startsWith(" ") || segText.endsWith(" ")) ? ' xml:space="preserve"' : "";
          const escapedText = segText
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          newRuns.push(`<w:r>${segRPr}<w:t${spaceAttr}>${escapedText}</w:t></w:r>`);
        }

        charIdx = runEnd;
      }

      // Replace runs in the paragraph XML
      // Remove all existing <w:r>...</w:r> and insert new ones
      let newPXml = pXml.replace(/<w:r[\s>][\s\S]*?<\/w:r>/g, "");
      // Find insertion point (after <w:pPr>...</w:pPr> if present, or at start of paragraph content)
      const pPrEnd = newPXml.indexOf("</w:pPr>");
      if (pPrEnd !== -1) {
        const insertAt = pPrEnd + "</w:pPr>".length;
        newPXml = newPXml.substring(0, insertAt) + newRuns.join("") + newPXml.substring(insertAt);
      } else {
        // Insert after the opening <w:p> or <w:p ...> tag
        const pOpenEnd = newPXml.indexOf(">") + 1;
        newPXml = newPXml.substring(0, pOpenEnd) + newRuns.join("") + newPXml.substring(pOpenEnd);
      }

      changesApplied++;
      pXml = newPXml;
      break; // one change per paragraph (same as Python)
    }

    return pXml;
  });

  return { xml, changesApplied };
}

/**
 * Modify a Word (.docx) document using pure JS (JSZip XML manipulation).
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
    runWordModifierJs(buffer, changes, "modify_green"),
    runWordModifierJs(buffer, changes, "annotate_original"),
    runWordModifierJs(buffer, changes, "modify_clean"),
  ]);

  // Build change log from changes (Python script doesn't return structured log)
  const changeLog: CellChange[] = changes
    .filter(c => c.oldValue && c.newValue)
    .map((c, i) => ({
      sheetName: "Word Document",
      cellRef: `Change ${i + 1}`,
      oldValue: `${c.fieldName}: ${c.oldValue}${c.unit && !c.oldValue.toLowerCase().endsWith(c.unit.toLowerCase()) ? " " + c.unit : ""}`,
      newValue: `${c.fieldName}: ${c.newValue}${c.unit && !c.newValue.toLowerCase().endsWith(c.unit.toLowerCase()) ? " " + c.unit : ""}`,
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
      const parser = new PDFParse({ data: Buffer.from(buffer) });
      const result = await parser.getText();
      await parser.destroy();
      return `PDF DOCUMENT: ${fileName}\n\n${result.text.substring(0, 10000)}`;
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
  affectedEquipment?: string;
}): Promise<ModificationResult> {
  const { fileUrl, fileName, mimeType, changes, documentName, originalFileKey, affectedEquipment } = params;

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
    // Produce three variants in parallel:
    // 1. annotatedOriginalBuffer — original values, YELLOW highlights on matched cells (left panel)
    // 2. modifiedBuffer — new values written, GREEN highlights on changed cells (right panel)
    // 3. cleanModifiedBuffer — new values written, no highlight colours (download)
    const [annotatedResult, greenResult, cleanBuf] = await Promise.all([
      annotateOriginalExcel(originalBuffer, changes, affectedEquipment),
      modifyExcelGreen(originalBuffer, changes, affectedEquipment),
      modifyExcelClean(originalBuffer, changes, affectedEquipment),
    ]);
    annotatedOriginalBuffer = annotatedResult.buffer;
    modifiedBuffer = greenResult.buffer;
    changeLog = greenResult.changeLog;
    cleanModifiedBuffer = cleanBuf;
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
        oldValue: `${c.fieldName}: ${c.oldValue}${c.unit && !c.oldValue.toLowerCase().endsWith(c.unit.toLowerCase()) ? " " + c.unit : ""}`,
        newValue: `${c.fieldName}: ${c.newValue}${c.unit && !c.newValue.toLowerCase().endsWith(c.unit.toLowerCase()) ? " " + c.unit : ""}`,
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
