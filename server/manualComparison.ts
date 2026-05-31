/**
 * manualComparison.ts
 *
 * Extracts exactly 3 lubrication fields from old and new equipment manuals:
 *   1. Lubricant Name  (short form as it appears in a Lube Map cell, e.g. "Omala 220")
 *   2. Lubrication Quantity  (e.g. "75 - 90 ml" or "40 ml")
 *   3. Lubrication Frequency (e.g. "4320 hrs\n(180 days)")
 *
 * Strategy:
 *   - Deterministic regex extraction from the lubrication section of the manual.
 *   - Falls back to LLM only if deterministic extraction fails to find all 3 fields.
 *   - All extracted old values are in the exact format used by Lube Map cells so the
 *     Excel modifier can match them without any further normalisation.
 */

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { invokeLLM } from "./_core/llm";

export interface ChangeEntry {
  fieldName: string;
  oldValue: string;
  newValue: string;
  unit: string;
  documentCategory: string;
}

// ─── Text extraction ──────────────────────────────────────────────────────────

/**
 * Download a file from a URL and return as Buffer.
 */
async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Extract plain text from a file (PDF or DOCX) at a given URL.
 * Uses pdf-parse for PDFs and mammoth for Word documents — pure JS, no CLI tools.
 */
export async function extractFileText(fileUrl: string, fileName: string): Promise<string> {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const buf = await downloadBuffer(fileUrl);

  if (ext === "pdf") {
    const parser = new PDFParse({ data: Buffer.from(buf) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }

  if (ext === "docx" || ext === "doc") {
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value;
  }

  // Fallback: try pdf-parse anyway
  const parser = new PDFParse({ data: Buffer.from(buf) });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

// ─── Lubrication section finder ───────────────────────────────────────────────

/**
 * Extract the lubrication section from a manual's text.
 *
 * Finds the actual section heading (not a TOC entry) by looking for a line that:
 *   - Matches a section-8 or "Lubrication" heading pattern
 *   - Is NOT a TOC entry (TOC entries have 5+ consecutive spaces used for right-alignment)
 *   - Is short (< 60 chars after trimming)
 *
 * Returns the text from that heading to the next section heading.
 */
function extractLubeSection(text: string): string {
  const lines = text.split("\n");

  // Patterns that identify a lubrication section heading
  const HEADING_RE = /(?:§\s*8\b|^8[.\s]\s|section\s+8\b)/i;
  const LUBE_RE = /lubric/i;
  // TOC entries: long lines with 5+ spaces AND ending with a digit (right-aligned page number)
  // This avoids falsely skipping short headings like "§8       Lubrication" that have extra spaces
  const TOC_RE = /\s{5,}\d+\s*$/;

  let sectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim();
    if (!s) continue;
    const isHeading = (HEADING_RE.test(s) && LUBE_RE.test(s)) ||
                      (s.toLowerCase() === "lubrication") ||
                      /^(?:§\s*)?\d+\s+lubrication\s*$/i.test(s);
    if (!isHeading) continue;
    if (TOC_RE.test(lines[i])) continue; // skip TOC entries
    if (s.length > 60) continue;         // skip long paragraphs (ECN banners, warnings)
    sectionStart = i;
    break;
  }

  if (sectionStart === -1) return text; // fallback: use full text

  // Find the end of the section (next numbered section heading)
  const NEXT_SECTION_RE = /^(?:§\s*9\b|^9[.\s]\s|section\s+9\b)/i;
  let sectionEnd = lines.length;
  for (let i = sectionStart + 2; i < lines.length; i++) {
    const s = lines[i].trim();
    if (NEXT_SECTION_RE.test(s) && !TOC_RE.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  return lines.slice(sectionStart, sectionEnd).join("\n");
}

// ─── Field extractors ─────────────────────────────────────────────────────────

/**
 * Lines to skip when extracting lubricant name — these mention the old lubricant
 * in a negative context (compatibility warnings, substitutes, etc.)
 */
const SKIP_LUBRICANT_LINE = /do not use|not compatible|flush|transitioning from|replace with|instead of|avoid|prohibited|approved substitute|alternative|equivalent|incompatible/i;

/**
 * Extract the short lubricant name as it would appear in a Lube Map cell.
 * Returns e.g. "Omala 220", "Mobil SHC 630".
 *
 * Tries known product name patterns in order of specificity.
 * Skips lines that mention the lubricant in a negative/warning context.
 */
function extractLubricantName(sectionText: string): string | null {
  const lines = sectionText.split("\n");

  // Ordered patterns: most specific first
  const PATTERNS: Array<{ re: RegExp; fmt: (m: RegExpMatchArray) => string }> = [
    // Shell Omala S2 G 220 / S4 GX 320 → "Omala 220"
    { re: /Shell\s+Omala\s+S[24]\s+G[X]?\s+(\d+)/i,   fmt: m => `Omala ${m[1]}` },
    { re: /Omala\s+S[24]\s+G[X]?\s+(\d+)/i,            fmt: m => `Omala ${m[1]}` },
    // Shell Omala 220 → "Omala 220"
    { re: /Shell\s+Omala\s+(\d+)/i,                     fmt: m => `Omala ${m[1]}` },
    { re: /\bOmala\s+(\d+)/i,                           fmt: m => `Omala ${m[1]}` },
    // Mobil SHC 630 → "Mobil SHC 630"
    { re: /Mobil\s+SHC\s+(\d+)/i,                       fmt: m => `Mobil SHC ${m[1]}` },
    // Castrol Optigear Synthetic X 320 → "Castrol Optigear 320"
    { re: /Castrol\s+Optigear\s+Synthetic\s+X\s+(\d+)/i, fmt: m => `Castrol Optigear ${m[1]}` },
    { re: /Castrol\s+Optigear\s+(\d+)/i,                fmt: m => `Castrol Optigear ${m[1]}` },
    // MobilGear 600 XP 220 → "MobilGear 220"
    { re: /MobilGear\s+\d+\s+XP\s+(\d+)/i,             fmt: m => `MobilGear ${m[1]}` },
    { re: /MobilGear\s+(\d+)/i,                         fmt: m => `MobilGear ${m[1]}` },
    // Generic ISO VG grade lubricant (last resort)
    { re: /ISO\s+VG\s+(\d+)/i,                         fmt: m => `ISO VG ${m[1]}` },
  ];

  for (const { re, fmt } of PATTERNS) {
    for (const line of lines) {
      if (SKIP_LUBRICANT_LINE.test(line)) continue;
      const m = line.match(re);
      if (m) return fmt(m);
    }
  }
  return null;
}

/**
 * Lines to skip when extracting quantity — comparison/caution lines that mention
 * both old and new quantities.
 */
const SKIP_QTY_LINE = /vs\.|versus|compared to|previous|old model|smaller than|larger than|less than|more than|significantly|do not use|not compatible|instead of|rather than/i;

/**
 * Keywords that identify the primary fill-quantity line.
 */
const FILL_KEYWORDS = /fill quantity|oil fill|fill volume|fill level|oil volume|capacity|sump volume/i;

/**
 * Extract the lubrication quantity as it would appear in a Lube Map cell.
 * Returns e.g. "75 - 90 ml" or "40 ml".
 *
 * IMPORTANT: check range pattern BEFORE single-value to avoid matching "90" in "75 – 90 ml".
 */
function extractLubricationQty(sectionText: string): string | null {
  const lines = sectionText.split("\n");

  // Priority 1: lines that explicitly name the fill quantity
  for (const line of lines) {
    if (!FILL_KEYWORDS.test(line)) continue;
    if (SKIP_QTY_LINE.test(line)) continue;
    // Find positions of range and single-value matches
    const rangeM = line.match(/(\d+)\s*(?:[–\-]|to)\s*(\d+)\s*ml/i);
    const singleM = line.match(/(?:exactly\s+)?(\d+(?:\.\d+)?)\s*ml/i);
    if (rangeM && singleM) {
      // If single value appears BEFORE the range, prefer single value
      const rangeIdx = line.indexOf(rangeM[0]);
      const singleIdx = line.indexOf(singleM[0]);
      if (singleIdx < rangeIdx) return `${singleM[1]} ml`;
      return `${rangeM[1]} - ${rangeM[2]} ml`;
    }
    if (rangeM) return `${rangeM[1]} - ${rangeM[2]} ml`;
    if (singleM) return `${singleM[1]} ml`;
  }

  // Priority 2: any line, skip comparison/caution lines
  for (const line of lines) {
    if (SKIP_QTY_LINE.test(line)) continue;
    const rangeM = line.match(/(\d+)\s*(?:[–\-]|to)\s*(\d+)\s*ml/i);
    if (rangeM) return `${rangeM[1]} - ${rangeM[2]} ml`;
    const singleM = line.match(/(?:exactly\s+)?(\d+(?:\.\d+)?)\s*ml/i);
    if (singleM) return `${singleM[1]} ml`;
  }

  return null;
}

/**
 * Keywords that identify the oil-change interval line.
 */
const OIL_CHANGE_LINE = /routine.*change|change.*interval|oil change|service interval|maintenance interval|replace.*every|change.*every|every.*change|oil.*interval/i;

/**
 * Lines to skip when extracting frequency — first-fill, flush, or compatibility lines.
 */
const SKIP_FREQ_LINE = /first.*change|initial|break.?in|do not use|not compatible|flush|transitioning from|replace with|instead of|avoid|prohibited/i;

/**
 * Extract the lubrication frequency as it would appear in a Lube Map cell.
 * Returns e.g. "4320 hrs\n(180 days)" — hours on first line, days in parentheses on second.
 *
 * Prefers lines that explicitly mention "oil change" or "service interval".
 * Falls back to any line with both hours and days.
 */
function extractLubricationFrequency(sectionText: string): string | null {
  const lines = sectionText.split("\n");

  // Build a list of "joined lines": each line merged with the next non-empty line.
  // This handles PDF line-wraps where hours appear on one line and days on the next.
  const joinedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    joinedLines.push(lines[i]);
    // Also add a version joined with the next line (handles line-wrap)
    if (i + 1 < lines.length && lines[i + 1].trim()) {
      joinedLines.push(lines[i] + " " + lines[i + 1].trim());
    }
  }

  // Priority 1: explicit oil-change interval lines (or joined pairs)
  for (const line of joinedLines) {
    if (!OIL_CHANGE_LINE.test(line)) continue;
    if (SKIP_FREQ_LINE.test(line)) continue;
    const hrsM = line.match(/(\d[\d,]*)\s*h(?:ours?|rs?)/i);
    const daysM = line.match(/(\d+)\s*days?/i);
    if (hrsM && daysM) {
      const hrs = hrsM[1].replace(/,/g, "");
      return `${hrs} hrs\n(${daysM[1]} days)`;
    }
    if (hrsM) return `${hrsM[1].replace(/,/g, "")} hrs`;
    if (daysM) return `(${daysM[1]} days)`;
  }

  // Priority 2: any joined line with both hours and days (skip warning lines)
  for (const line of joinedLines) {
    if (SKIP_FREQ_LINE.test(line)) continue;
    const hrsM = line.match(/(\d[\d,]*)\s*h(?:ours?|rs?)/i);
    const daysM = line.match(/(\d+)\s*days?/i);
    if (hrsM && daysM) {
      const hrs = hrsM[1].replace(/,/g, "");
      return `${hrs} hrs\n(${daysM[1]} days)`;
    }
  }

  return null;
}

// ─── Main comparison function ─────────────────────────────────────────────────

export async function compareManuals(params: {
  oldManualText: string;
  newManualText: string;
  oldFileName: string;
  newFileName: string;
  changeEventTitle: string;
}): Promise<ChangeEntry[]> {
  const { oldManualText, newManualText, oldFileName, newFileName, changeEventTitle } = params;

  // ── Step 1: Extract lubrication section from each manual ──────────────────
  const oldSection = extractLubeSection(oldManualText);
  const newSection = extractLubeSection(newManualText);

  console.log(`[ManualComparison] Old section (first 200): ${oldSection.substring(0, 200).replace(/\n/g, "\\n")}`);
  console.log(`[ManualComparison] New section (first 200): ${newSection.substring(0, 200).replace(/\n/g, "\\n")}`);

  // ── Step 2: Extract the 3 fields from each section ────────────────────────
  const oldLubricant = extractLubricantName(oldSection);
  const newLubricant = extractLubricantName(newSection);
  const oldQty       = extractLubricationQty(oldSection);
  const newQty       = extractLubricationQty(newSection);
  const oldFreq      = extractLubricationFrequency(oldSection);
  const newFreq      = extractLubricationFrequency(newSection);

  console.log(`[ManualComparison] Extracted — Lubricant: "${oldLubricant}" → "${newLubricant}"`);
  console.log(`[ManualComparison] Extracted — Quantity:  "${oldQty}" → "${newQty}"`);
  console.log(`[ManualComparison] Extracted — Frequency: "${oldFreq?.replace(/\n/g,"\\n")}" → "${newFreq?.replace(/\n/g,"\\n")}"`);

  const changes: ChangeEntry[] = [];

  if (oldLubricant && newLubricant && oldLubricant !== newLubricant) {
    changes.push({
      fieldName: "Lubricant Name",
      oldValue: oldLubricant,
      newValue: newLubricant,
      unit: "",
      documentCategory: "Lube Map",
    });
  }
  if (oldQty && newQty && oldQty !== newQty) {
    changes.push({
      fieldName: "Lubrication Quantity",
      oldValue: oldQty,
      newValue: newQty,
      unit: "",
      documentCategory: "Lube Map",
    });
  }
  if (oldFreq && newFreq && oldFreq !== newFreq) {
    changes.push({
      fieldName: "Lubrication Frequency",
      oldValue: oldFreq,
      newValue: newFreq,
      unit: "",
      documentCategory: "Lube Map",
    });
  }

  // ── Step 3: If deterministic found ≥ 2 fields, return them ───────────────
  if (changes.length >= 2) {
    console.log(`[ManualComparison] Deterministic extraction found ${changes.length} changes.`);
    return changes;
  }

  // ── Step 4: LLM fallback for unusual manual formats ───────────────────────
  console.log(`[ManualComparison] Deterministic found only ${changes.length} — falling back to LLM`);

  const prompt = `You are an expert manufacturing documentation analyst.

Compare these two equipment manuals and extract ONLY the three lubrication fields that appear in Lube Map documents:
1. Lubricant Name — the SHORT product name as it appears in a Lube Map cell (e.g. "Omala 220", "Mobil SHC 630")
2. Lubrication Quantity — the fill volume as it appears in a Lube Map cell (e.g. "75 - 90 ml", "40 ml")
3. Lubrication Frequency — the service interval as it appears in a Lube Map cell (e.g. "4320 hrs\\n(180 days)", "1440 hrs\\n(60 days)")

CHANGE EVENT: ${changeEventTitle}

OLD MANUAL (${oldFileName}):
${oldManualText.substring(0, 6000)}

NEW MANUAL (${newFileName}):
${newManualText.substring(0, 6000)}

CRITICAL RULES:
- oldValue MUST be the exact short form as it appears in a Lube Map cell — NOT the full product name from the manual
- For lubricant names: use SHORT form (e.g. "Omala 220" not "Shell Omala S2 G 220")
- For quantity ranges: use format "75 - 90 ml" (hyphen-minus with spaces, include ml unit)
- For frequency: use format "4320 hrs\\n(180 days)" — hours first, then days in parentheses on next line
- Only return changes where BOTH old and new values are clearly stated in the respective manuals
- Return ONLY the 3 lubrication fields — do NOT include motor specs, gear ratios, part numbers, etc.

Return a JSON object with a "changes" array.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are an expert manufacturing documentation analyst. Always respond with valid JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "manual_diff",
        strict: true,
        schema: {
          type: "object",
          properties: {
            changes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  fieldName: { type: "string" },
                  oldValue: { type: "string" },
                  newValue: { type: "string" },
                  unit: { type: "string" },
                  documentCategory: { type: "string" },
                },
                required: ["fieldName", "oldValue", "newValue", "unit", "documentCategory"],
                additionalProperties: false,
              },
            },
          },
          required: ["changes"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const content = String(response.choices[0]?.message?.content ?? "{}");
    const parsed = JSON.parse(content) as { changes: ChangeEntry[] };
    const llmChanges = (parsed.changes ?? []).filter(
      c => c.newValue && c.newValue.trim() !== "" && c.oldValue !== c.newValue
    );
    // Merge: deterministic takes priority over LLM for the same fieldName
    const deterministicFields = new Set(changes.map(c => c.fieldName));
    const merged = [
      ...changes,
      ...llmChanges.filter(c => !deterministicFields.has(c.fieldName)),
    ];
    console.log(`[ManualComparison] Final ${merged.length} changes (${changes.length} deterministic + ${llmChanges.length} LLM)`);
    return merged;
  } catch (e) {
    console.warn("[ManualComparison] Failed to parse LLM response:", e);
    return changes;
  }
}
