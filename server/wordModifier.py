#!/usr/bin/env python3
"""
wordModifier.py — In-place Word document modifier using python-docx.

Usage:
  python3.11 wordModifier.py <mode> <input.docx> <output.docx> <changes_json>

Modes:
  annotate_original  — highlight OLD values in YELLOW in the original document
  modify_green       — replace OLD values with NEW values, highlight NEW values in GREEN
  modify_clean       — replace OLD values with NEW values, NO highlights (clean download)

changes_json format:
  [{"fieldName": "Weight", "oldValue": "155", "newValue": "170", "unit": "g"}, ...]

Exit codes:
  0 = success, changes applied
  1 = error
  2 = no matches found (non-fatal)
"""

import sys
import json
import copy
import re
from docx import Document
from docx.shared import RGBColor
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import lxml.etree as etree

# ── Highlight color constants ──────────────────────────────────────────────────
# python-docx highlight uses W3C color names for the <w:highlight> element
YELLOW_HIGHLIGHT = "yellow"
GREEN_HIGHLIGHT  = "green"

def set_run_highlight(run, color_name):
    """Set the highlight color on a run using the <w:highlight> XML element."""
    rPr = run._r.get_or_add_rPr()
    # Remove existing highlight if any
    for existing in rPr.findall(qn("w:highlight")):
        rPr.remove(existing)
    if color_name:
        highlight = OxmlElement("w:highlight")
        highlight.set(qn("w:val"), color_name)
        rPr.append(highlight)

def set_run_color(run, hex_color):
    """Set the font color on a run (hex without #, e.g. '1B5E20')."""
    rPr = run._r.get_or_add_rPr()
    for existing in rPr.findall(qn("w:color")):
        rPr.remove(existing)
    color_el = OxmlElement("w:color")
    color_el.set(qn("w:val"), hex_color)
    rPr.append(color_el)

def set_run_bold(run, bold=True):
    """Set bold on a run."""
    rPr = run._r.get_or_add_rPr()
    for existing in rPr.findall(qn("w:b")):
        rPr.remove(existing)
    if bold:
        b_el = OxmlElement("w:b")
        rPr.append(b_el)

def copy_run_formatting(source_run, target_run):
    """Copy all rPr formatting from source_run to target_run (except text)."""
    src_rPr = source_run._r.find(qn("w:rPr"))
    tgt_r = target_run._r
    # Remove existing rPr from target
    for existing in tgt_r.findall(qn("w:rPr")):
        tgt_r.remove(existing)
    if src_rPr is not None:
        tgt_r.insert(0, copy.deepcopy(src_rPr))

def get_paragraph_full_text(para):
    """Get the full text of a paragraph across all runs."""
    return "".join(run.text for run in para.runs)

def process_paragraph(para, changes, mode):
    """
    Process a single paragraph, applying changes based on mode.
    Returns True if any change was applied.
    """
    full_text = get_paragraph_full_text(para)
    if not full_text.strip():
        return False

    changed = False

    for change in changes:
        old_val = change.get("oldValue", "").strip()
        new_val = change.get("newValue", "").strip()
        unit = change.get("unit", "").strip()

        if not old_val or not new_val:
            continue

        # Build search terms in priority order: compound first ("155g", "155 g"), then bare ("155")
        # This prevents matching "155" and leaving the original "g" behind
        search_terms = []
        if unit:
            search_terms.append(f"{old_val}{unit}")    # "155g"
            search_terms.append(f"{old_val} {unit}")   # "155 g"
        search_terms.append(old_val)                    # "155" (fallback)

        for term in search_terms:
            # Case-insensitive search
            pattern = re.compile(re.escape(term), re.IGNORECASE)
            if not pattern.search(full_text):
                continue

            # Found a match — need to split runs and apply formatting
            # Rebuild the paragraph runs with the replacement applied
            if mode == "annotate_original":
                # Highlight old value in YELLOW, keep text unchanged
                _apply_highlight_in_paragraph(para, term, YELLOW_HIGHLIGHT, None, keep_text=True)
            elif mode == "modify_green":
                # Replace old value with new value, highlight NEW value in GREEN
                replacement = f"{new_val}{' ' + unit if unit else ''}"
                _apply_highlight_in_paragraph(para, term, GREEN_HIGHLIGHT, replacement, keep_text=False)
            elif mode == "modify_clean":
                # Replace old value with new value, NO highlight
                replacement = f"{new_val}{' ' + unit if unit else ''}"
                _apply_highlight_in_paragraph(para, term, None, replacement, keep_text=False)

            changed = True
            # Update full_text after change for subsequent terms
            full_text = get_paragraph_full_text(para)
            break  # Move to next change after applying this one

    return changed


def _apply_highlight_in_paragraph(para, search_term, highlight_color, replacement_text, keep_text):
    """
    Find search_term in the paragraph's runs and apply highlight/replacement.
    This works by rebuilding the run list around the match.
    """
    # Collect all runs with their text
    runs = para.runs
    if not runs:
        return

    # Build a flat character map: list of (run_index, char_index, char)
    full_text = ""
    char_map = []  # (run_idx, char_idx_in_run)
    for ri, run in enumerate(runs):
        for ci, ch in enumerate(run.text):
            char_map.append((ri, ci))
            full_text += ch

    # Find the match position (case-insensitive)
    pattern = re.compile(re.escape(search_term), re.IGNORECASE)
    match = pattern.search(full_text)
    if not match:
        return

    start, end = match.start(), match.end()

    # Determine which runs are involved
    # We'll rebuild: before_text (normal) + matched_text (highlighted/replaced) + after_text (normal)
    before_text = full_text[:start]
    matched_text = full_text[start:end]
    after_text = full_text[end:]

    # Get the formatting from the first run of the match (to copy to new runs)
    first_match_run_idx = char_map[start][0] if start < len(char_map) else 0
    template_run = runs[first_match_run_idx]

    # Clear all existing runs from the paragraph XML
    p_elem = para._p
    # Remove all <w:r> elements
    for r_elem in p_elem.findall(qn("w:r")):
        p_elem.remove(r_elem)

    # Find where to insert (after pPr if present, otherwise at start)
    insert_pos = 0
    pPr = p_elem.find(qn("w:pPr"))
    if pPr is not None:
        insert_pos = list(p_elem).index(pPr) + 1

    def add_run(text, highlight=None, color=None, bold=None, insert_at=None):
        """Create a new run element and add it to the paragraph."""
        if not text:
            return
        from docx.oxml import OxmlElement as OE
        r = OE("w:r")
        # Copy rPr from template
        src_rPr = template_run._r.find(qn("w:rPr"))
        if src_rPr is not None:
            new_rPr = copy.deepcopy(src_rPr)
            # Remove existing highlight from copied rPr
            for h in new_rPr.findall(qn("w:highlight")):
                new_rPr.remove(h)
            # Remove existing color from copied rPr
            for c in new_rPr.findall(qn("w:color")):
                new_rPr.remove(c)
            # Remove existing bold from copied rPr
            for b in new_rPr.findall(qn("w:b")):
                new_rPr.remove(b)
            # Apply new highlight
            if highlight:
                h_el = OE("w:highlight")
                h_el.set(qn("w:val"), highlight)
                new_rPr.append(h_el)
            # Apply new color
            if color:
                c_el = OE("w:color")
                c_el.set(qn("w:val"), color)
                new_rPr.append(c_el)
            # Apply bold
            if bold:
                b_el = OE("w:b")
                new_rPr.append(b_el)
            r.append(new_rPr)
        else:
            new_rPr = OE("w:rPr")
            if highlight:
                h_el = OE("w:highlight")
                h_el.set(qn("w:val"), highlight)
                new_rPr.append(h_el)
            if color:
                c_el = OE("w:color")
                c_el.set(qn("w:val"), color)
                new_rPr.append(c_el)
            if bold:
                b_el = OE("w:b")
                new_rPr.append(b_el)
            r.append(new_rPr)

        t = OE("w:t")
        t.text = text
        if text.startswith(" ") or text.endswith(" "):
            t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        r.append(t)

        if insert_at is not None:
            p_elem.insert(insert_at, r)
            return insert_at + 1
        else:
            p_elem.append(r)
            return None

    pos = insert_pos

    # Add before text (normal formatting)
    if before_text:
        pos = add_run(before_text, insert_at=pos)

    # Add the matched/replaced text
    if keep_text:
        # annotate_original: keep original text, just highlight it
        pos = add_run(matched_text, highlight=highlight_color, insert_at=pos)
    else:
        # modify: replace with new value
        display_text = replacement_text if replacement_text else matched_text
        pos = add_run(display_text, highlight=highlight_color, color="1B5E20" if highlight_color == GREEN_HIGHLIGHT else None, bold=(highlight_color is not None), insert_at=pos)

    # Add after text (normal formatting)
    if after_text:
        add_run(after_text, insert_at=pos)


def process_table(table, changes, mode):
    """Process all cells in a table."""
    changed = False
    for row in table.rows:
        for cell in row.cells:
            for para in cell.paragraphs:
                if process_paragraph(para, changes, mode):
                    changed = True
    return changed


def process_document(doc, changes, mode):
    """Process all paragraphs and tables in the document."""
    total_changes = 0

    # Process body paragraphs
    for para in doc.paragraphs:
        if process_paragraph(para, changes, mode):
            total_changes += 1

    # Process tables
    for table in doc.tables:
        if process_table(table, changes, mode):
            total_changes += 1

    # Process headers and footers
    for section in doc.sections:
        for hdr in [section.header, section.footer]:
            if hdr:
                for para in hdr.paragraphs:
                    if process_paragraph(para, changes, mode):
                        total_changes += 1
                for table in hdr.tables:
                    if process_table(table, changes, mode):
                        total_changes += 1

    return total_changes


def main():
    if len(sys.argv) < 5:
        print("Usage: wordModifier.py <mode> <input.docx> <output.docx> <changes_json>", file=sys.stderr)
        sys.exit(1)

    mode = sys.argv[1]
    input_path = sys.argv[2]
    output_path = sys.argv[3]
    changes_json = sys.argv[4]

    if mode not in ("annotate_original", "modify_green", "modify_clean"):
        print(f"Unknown mode: {mode}", file=sys.stderr)
        sys.exit(1)

    try:
        changes = json.loads(changes_json)
    except json.JSONDecodeError as e:
        print(f"Invalid changes JSON: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        doc = Document(input_path)
    except Exception as e:
        print(f"Failed to open document: {e}", file=sys.stderr)
        sys.exit(1)

    total = process_document(doc, changes, mode)

    try:
        doc.save(output_path)
    except Exception as e:
        print(f"Failed to save document: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"OK:{total}", flush=True)
    sys.exit(0 if total > 0 else 2)


if __name__ == "__main__":
    main()
