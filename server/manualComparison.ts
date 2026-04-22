/**
 * manualComparison.ts
 *
 * Compares two uploaded manuals (old vs new) by extracting their text content
 * and asking the LLM to produce a structured diff of what changed.
 *
 * The resulting ChangeEntry[] is used as the source of truth for modifying
 * all affected Document Library files (Lube Map, Safety Map, CPE, etc.).
 */

import * as XLSX from "xlsx";
import { invokeLLM } from "./_core/llm";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface ChangeEntry {
  fieldName: string;
  oldValue: string;
  newValue: string;
  unit: string;
}

/**
 * Download a file from a URL and return as Buffer.
 */
async function downloadFile(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status} ${res.statusText} — ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Extract readable text from a PDF using pdftotext CLI (poppler-utils).
 * Much more reliable than pdf-parse for complex PDFs.
 */
function extractPdfText(buffer: Buffer): string {
  const tmpFile = join(tmpdir(), `pdfextract-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  try {
    writeFileSync(tmpFile, buffer);
    const text = execSync(`pdftotext -layout "${tmpFile}" -`, { maxBuffer: 10 * 1024 * 1024 }).toString();
    return text.substring(0, 12000);
  } catch (e) {
    return `[PDF text extraction failed: ${e}]`;
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }
}

/**
 * Extract readable text from an Excel file.
 */
function extractExcelText(buffer: Buffer): string {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const lines: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      lines.push(`=== ${sheetName} ===`);
      const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
      for (const row of data.slice(0, 150)) {
        const nonEmpty = row.filter(c => String(c ?? "").trim() !== "");
        if (nonEmpty.length > 0) {
          lines.push(row.map(c => String(c ?? "")).join(" | "));
        }
      }
    }
    return lines.join("\n").substring(0, 8000);
  } catch (e) {
    return `[Excel text extraction failed: ${e}]`;
  }
}

/**
 * Extract text content from a file (PDF or Excel) given its URL and filename.
 */
export async function extractFileText(fileUrl: string, fileName: string): Promise<string> {
  const buffer = await downloadFile(fileUrl);
  const name = fileName.toLowerCase();

  if (name.endsWith(".pdf")) {
    // extractPdfText is now synchronous (uses pdftotext CLI)
    return Promise.resolve(extractPdfText(buffer));
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return extractExcelText(buffer);
  }
  // For other types, try to read as UTF-8 text
  return buffer.toString("utf-8").substring(0, 8000);
}

/**
 * Compare old and new manual texts using the LLM and return a structured diff.
 * This is the core of the manual comparison engine.
 */
export async function compareManuals(params: {
  oldManualText: string;
  newManualText: string;
  oldFileName: string;
  newFileName: string;
  changeEventTitle: string;
}): Promise<ChangeEntry[]> {
  const { oldManualText, newManualText, oldFileName, newFileName, changeEventTitle } = params;

  const prompt = `You are an expert manufacturing documentation analyst. Your job is to compare two versions of a technical manual and identify EVERY specific value that has changed.

CHANGE EVENT: ${changeEventTitle}

OLD MANUAL (${oldFileName}):
${oldManualText}

NEW MANUAL (${newFileName}):
${newManualText}

TASK:
Compare the two manuals above and identify every specific value that has changed. For each change:
- fieldName: A short human-readable label describing what this field is (e.g. "Motor Power", "Lubrication Frequency", "Operating Speed", "Bearing Grease Type", "PM Interval", "Torque Value")
- oldValue: The EXACT value from the OLD manual (copy it verbatim — e.g. "Monthly", "1.5", "IEC 90L", "Shell Omala S2 G 220")
- newValue: The EXACT new value from the NEW manual (copy it verbatim — e.g. "Weekly", "2.2", "IEC 100L", "Shell Omala S2 G 320")
- unit: The unit of measurement if applicable (e.g. "kW", "RPM", "Nm", "months", "weeks") — use empty string "" if none

IMPORTANT RULES:
1. Only include changes where BOTH the old value AND new value are clearly present in the respective manuals.
2. Copy values VERBATIM — do not paraphrase, abbreviate, or add units that are not in the original text.
3. If the same value appears multiple times in the old manual (e.g. "1440" appears 3 times), include ONE entry — the modifier will update all matching occurrences.
4. Be thorough — check ALL sections: power ratings, speeds, temperatures, pressures, lubrication types, frequencies, intervals, part numbers, frame sizes, torque values, current ratings, etc.
5. Do NOT include changes to document metadata (revision numbers, dates, author names) unless they are part of the technical specification.
6. If a value is new (appears in new manual but not old), use oldValue: "" and newValue: the new value.

Return a JSON object with a "changes" array containing all identified changes.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are an expert manufacturing documentation analyst. Always respond with valid JSON only. Be thorough and precise." },
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
                },
                required: ["fieldName", "oldValue", "newValue", "unit"],
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
    // Keep entries where newValue is present and values differ
    // Allow oldValue to be empty for new-only additions (rule 6 in prompt)
    const changes = (parsed.changes ?? []).filter(
      c => c.newValue && c.newValue.trim() !== "" && c.oldValue !== c.newValue
    );
    console.log(`[ManualComparison] Extracted ${changes.length} changes from manual comparison:`,
      changes.map(c => `${c.fieldName}: "${c.oldValue}" → "${c.newValue}"`).join(", ")
    );
    return changes;
  } catch (e) {
    console.warn("[ManualComparison] Failed to parse LLM response:", e);
    return [];
  }
}
