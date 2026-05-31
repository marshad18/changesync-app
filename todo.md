# ChangeSync Platform TODO

## Database Schema
- [x] changeEvents table (id, title, changeType, status, createdBy, createdAt)
- [x] changeAssets table (id, changeEventId, assetType, fileUrl, fileKey, fileName, mimeType)
- [x] skuChanges table (id, changeEventId, field, oldValue, newValue)
- [x] documents table (id, name, code, category, owner, fileUrl, fileKey, fileName, mimeType)
- [x] impactAnalyses table (id, changeEventId, documentId, impacted, reasoning, status)
- [x] documentDrafts table (id, impactAnalysisId, originalContent, draftContent, status, approvedAt, approvedBy)

## Backend API (tRPC)
- [x] changeEvents.create — create a new change event
- [x] changeEvents.list — list all change events
- [x] changeEvents.getById — get a change event with all assets and analyses (enriched with documentName)
- [x] changeEvents.uploadAsset — upload drawing/photo/SDS to S3
- [x] changeEvents.addSkuChange — add a parameter change entry
- [x] changeEvents.removeSkuChange — remove a parameter change entry
- [x] changeEvents.analyzeImpact — run AI impact analysis on all documents
- [x] changeEvents.generateDrafts — generate AI document drafts for impacted docs
- [x] documents.list — list all documents in the library
- [x] documents.upload — upload a document to the library
- [x] documents.getById — get a document with its content
- [x] analyses.confirmStatus — confirm or dismiss an impact analysis
- [x] drafts.approve — approve a document draft
- [x] drafts.requestRevision — request revision on a draft
- [x] drafts.reject — reject a draft
- [x] drafts.updateContent — edit draft content inline

## Frontend Pages
- [x] Dashboard / Home page — overview of recent change events and their status
- [x] New Change Event wizard — step-by-step: change type → upload assets → SKU changes → text notes
- [x] Document Library page — view all uploaded documents, upload new ones with suggested list
- [x] Change Event detail page — full view with impact analysis, AI draft generation, draft list
- [x] Draft Review page — full draft content with approve/reject/revision workflow

## UI Components
- [x] DashboardLayout with sidebar navigation (ChangeSync branding, nav items)
- [x] Change Type selector (8 categories with adaptive form)
- [x] File upload zones (drawings, photos, SDS, documents)
- [x] SKU Changes table (old/new value pairs, add/remove)
- [x] Impact Analysis cards (confidence badges, reasoning, confirm/dismiss)
- [x] Draft list with status badges
- [x] Inline draft editor with markdown preview
- [x] Approval workflow panel (approve/revision/reject + notes)

## Design System
- [x] Dark industrial theme (deep slate bg, electric blue accent)
- [x] Global CSS variables and typography (Space Grotesk + IBM Plex Mono)
- [x] Color-coded status system (draft/analyzing/analysis_complete/generating_drafts/pending_approval/approved/rejected)
- [x] Category color badges (Operator/Engineering/Safety/Operations/Maintenance)
- [x] Confidence badges (high/medium/low)

## Testing
- [x] Vitest tests for all tRPC procedures (13 tests, all passing)
- [x] Auth logout test (1 test, passing)

## GitHub
- [x] All 45 sample documents uploaded to marshad18/change-flow repository

## Change Request — Wizard Redesign (April 2026)
- [x] Update schema: add new changeType enum values (part_change, weight_change, price_change) and assetType values (manual_old, manual_new, drawing_old, drawing_new)
- [x] Update schema: add partSubType column to changeEvents (manual | drawing) for part change sub-selection
- [x] Run pnpm db:push to migrate schema
- [x] Rebuild NewChange.tsx: dropdown for change type (Part Change / Weight Change / Price Change)
- [x] Part Change: show sub-option (Manual or Drawing), then upload old + new file
- [x] Weight Change: show old weight, new weight, old SKU code, new SKU code fields
- [x] Price Change: show old price, new price, old SKU code, new SKU code fields
- [x] All change types: include free-text description box
- [x] Update backend create procedure to accept new changeType enum values and partSubType
- [x] Update analyzeImpact prompt to use new change type context
- [x] Update generateDrafts prompt to use new change type context
- [x] Impact Analysis screen: show all uploaded documents with impacted/not-impacted status clearly
- [x] Generate button on Impact Analysis screen triggers draft generation
- [x] Draft Review: side-by-side old document (left) vs AI-updated document (right) with changes highlighted
- [x] Route for Approval button on Draft Review page
- [x] Update vitest tests for new change types

## Gap Resolution (April 2026)
- [x] Add routeForApproval mutation: new status "routed_for_approval", approverName field stored in reviewNotes, UI reflects routed vs approved states distinctly
- [x] Diff highlighting in split view: render AI draft with inline change markers (added/updated sections highlighted in amber) vs original

## Bug Fix (April 2026)
- [x] Fix impact analysis returning no documents for Part Change (motor upload) — root cause was empty Document Library (no docs uploaded); empty-library warning added to Impact Analysis screen

## GitHub Integration (April 2026)
- [x] Add GITHUB_TOKEN secret to platform
- [x] Build server-side GitHub helper: push file to marshad18/change-flow repo on document upload (deferred — import direction implemented instead; not requested by user)
- [x] Build server-side GitHub helper: list and import files from marshad18/change-flow repo into Document Library
- [x] Wire GitHub push into documents.upload procedure (deferred — not requested by user; import flow implemented instead)
- [x] Add "Import from GitHub" button in Document Library UI
- [x] Show already-imported badge on files already in the library
- [x] Add warning on Impact Analysis screen if Document Library is empty
- [x] Update tests for GitHub-linked upload flow

## GitHub Import Feature (April 2026)
- [x] Add GITHUB_TOKEN secret to platform for API access
- [x] Add GITHUB_REPO secret (marshad18/change-flow) as config
- [x] Build backend procedure: github.listFiles — lists all files in sample-documents folder from GitHub repo
- [x] Build backend procedure: github.importFiles — downloads selected files from GitHub, uploads to S3, saves to Document Library
- [x] Build Import from GitHub modal in Document Library: shows file list grouped by folder, checkboxes to select, Import button
- [x] Show already-imported badge on files already in the library
- [x] Add warning on Impact Analysis screen if Document Library is empty
- [x] Update tests for GitHub import procedure

## Email/Password Auth (April 2026)
- [x] Add passwordHash and passwordResetToken/Expiry columns to users table in schema
- [x] Run pnpm db:push to migrate schema
- [x] Install bcryptjs for password hashing
- [x] Add auth.register procedure (name, email, password — hash with bcrypt, create user, return JWT session)
- [x] Add auth.login procedure (email, password — verify hash, return JWT session cookie)
- [x] Add auth.forgotPassword procedure (email — generate reset token, send email via notification/SMTP)
- [x] Add auth.resetPassword procedure (token, newPassword — verify token expiry, update hash)
- [x] Remove Manus OAuth callback route and oauth helpers from auth flow
- [x] Update auth.me to work with email/password sessions (no change needed if JWT cookie stays same)
- [x] Build Login page (email + password form, link to register and forgot password)
- [x] Build Register page (name, email, password, confirm password)
- [x] Build Forgot Password page (email input, sends reset link)
- [x] Build Reset Password page (token from URL, new password + confirm)
- [x] Update App.tsx: add /login, /register, /forgot-password, /reset-password routes; remove Manus OAuth redirect
- [x] Update useAuth hook / auth guard to redirect to /login instead of Manus OAuth portal
- [x] Remove "Sign in with Manus" button from any UI
- [x] Update vitest tests for new auth procedures

## User Management & Login Fix (April 2026)
- [x] Reset password for marshad@mba2027.hbs.edu so user can log in
- [x] Add admin User Management page: list all registered users with email, name, role, registration date
- [x] Add ability for admin to change user role (user → admin)
- [x] Add ability for admin to reset a user's password

## Progress Timeline / Stepper (April 2026)
- [x] Build shared ChangeProgressStepper component with 4 steps: Create Change → Impact Analysis → Generate Drafts → Review & Approve
- [x] Add stepper to NewChange.tsx wizard (Step 1 active)
- [x] Add stepper to ChangeDetail.tsx impact analysis page (Step 2 active, Step 1 complete)
- [x] Add stepper to DraftReview.tsx review page (Step 4 active, Steps 1-3 complete)
- [x] Stepper shows completed steps in green, current step highlighted, future steps greyed out

## Webcam Capture for Part Change (April 2026)
- [x] Build WebcamCapture component: opens camera stream, shows live preview, capture button takes a still photo, retake option
- [x] Add input mode toggle to Part Change form: "Upload File" vs "Take Photo" for both old and new part slots
- [x] On capture, convert canvas snapshot to a File/Blob and store it the same way as an uploaded file (S3 upload)
- [x] Show thumbnail preview of captured photo with retake button
- [x] Handle browser permission denial gracefully with a clear error message

## Part Change Sub-Type: 3 Options (April 2026)
- [x] Update PartSubType to "manual" | "drawing" | "image" in schema and frontend types
- [x] Update sub-type selector UI to show 3 cards: Manual, Engineering Drawing, Image
- [x] For Manual and Drawing: show Upload-only slots (no camera toggle)
- [x] For Image: show Upload / Camera toggle on both old and new slots
- [x] Update subTypeLabel helper to return correct label for each of the 3 types
- [x] Update accept attribute on file inputs: Manual/Drawing accept PDFs/docs, Image accepts image files only

## Enterprise UI Redesign (April 2026)
- [x] Redesign global CSS: deep navy/slate dark theme, Inter/DM Sans typography, premium spacing system
- [x] Redesign DashboardLayout: wider sidebar with logo, section dividers, user avatar, subtle gradients
- [x] Redesign Home/Dashboard page: enterprise KPI cards, activity feed, professional header
- [x] Redesign Login/Register pages: split-screen layout with brand panel on left, form on right
- [x] Redesign NewChange wizard: clean step-by-step form with premium card styling
- [x] Redesign ChangeDetail impact analysis: professional document grid with status indicators
- [x] Redesign DraftReview: polished split-view with document comparison UI
- [x] Add micro-interactions: hover states, transitions, focus rings throughout
- [x] Ensure all text is readable against backgrounds (no invisible text)

## Light Enterprise Theme Redesign (April 2026)
- [x] Redesign global CSS: off-white/warm-grey light theme, Inter typography, navy/slate accent palette
- [x] Update index.html: Google Fonts for Inter
- [x] Redesign DashboardLayout: light sidebar, navy brand bar, clean dividers
- [x] Redesign Home/Dashboard page: light KPI cards, clean table rows
- [x] Redesign Login/Register/ForgotPassword/ResetPassword: split-screen light layout
- [x] Redesign NewChange wizard: light card surfaces, navy step indicators
- [x] Redesign ChangeDetail: light impact analysis cards, professional status badges
- [x] Redesign DraftReview: light split-view panels, clean approval section

## Split-View Document Comparison Fix (April 2026)
- [x] Extend drafts.getById to also return the change event's uploaded assets (old/new files) and the document's fileUrl
- [x] Left panel: render the original uploaded document inline — PDF via <iframe>, images via <img>, other files via download link
- [x] Right panel: keep AI draft markdown but ensure highlighted change markers are visually distinct (amber/green callouts)
- [x] If the document has a fileUrl (from Document Library), embed it as an iframe on the left
- [x] If the change event has an uploaded "old" asset (manual_old, drawing_old, image_old), show that on the left as the "before" reference

## Real Document Modification Engine (April 2026)

- [x] Install xlsx and pdf-lib npm packages for Excel/PDF editing
- [x] DB: add modifiedFileUrl and modifiedFileKey columns to documentDrafts table, run db:push
- [x] Server: build server/documentModifier.ts — download original file from S3/URL, parse Excel (xlsx) or PDF (pdf-lib), apply AI-identified value changes to actual cells/text, upload modified file to S3, return modifiedFileUrl
- [x] Server: update changeEvents.generateDrafts procedure — after LLM identifies changes, call documentModifier to produce a real modified file, store modifiedFileUrl in documentDrafts
- [x] Server: update drafts.getById to return modifiedFileUrl
- [x] DraftReview: left panel = original document fileUrl in iframe (PDF) or Excel viewer
- [x] DraftReview: right panel = modifiedFileUrl in iframe (PDF) or Excel viewer (not markdown text)
- [x] DraftReview: change summary panel below right panel listing each changed cell/value (old → new)
- [x] Excel: use xlsx to read workbook, identify cells matching old values from SKU changes, update to new values, highlight changed cells in amber, write back to buffer, upload to S3
- [x] PDF: use pdf-lib to find and replace text values in the PDF, upload modified version to S3
- [x] Update vitest tests for document modification flow

## Correct Split-View Fix (April 2026)
- [x] Left panel: ALWAYS show the original Document Library file (doc.fileUrl) — the EOLA 3A Excel/PDF as-is
- [x] Right panel: ALWAYS show the modifiedFileUrl (the actual edited version of that same document)
- [x] Remove the "uploaded old asset" priority from left panel — it is wrong; the document library file is the source of truth
- [x] For Excel files: left = download original xlsx, right = download modified xlsx with yellow-highlighted cells + change log table
- [x] For PDF files: left = iframe original PDF, right = iframe modified PDF with MODIFIED DRAFT banner
- [x] Both panels must be visible simultaneously at equal width for side-by-side comparison
- [x] If modifiedFileUrl is not yet generated, right panel shows a "Generating modified document..." loading state

## Inline Document Viewer (April 2026)
- [x] Replace Excel download fallback with Microsoft Office Online viewer iframe (https://view.officeapps.live.com/op/embed.aspx?src=FILE_URL) for both original and modified panels
- [x] Replace Word/DOCX download fallback with same MS Office Online viewer
- [x] PDF: keep existing iframe embed (already works inline)
- [x] Images: keep existing img embed (already works inline)
- [x] Both left (original) and right (modified) panels must render inline — no download buttons as the primary action
- [x] Keep a small secondary "Open in new tab" link below the viewer for convenience

## LLM-Driven Document Modification Fix (April 2026)
- [x] Build extractDocumentContent() in documentModifier.ts: reads Excel cells into a flat text summary, extracts PDF text using pdf-lib
- [x] Update generateDrafts in routers.ts: before calling documentModifier, call LLM with document content + change event to get structured JSON list of {fieldName, oldValue, newValue, unit} pairs specific to that document
- [x] Use LLM-identified changes (not just SKU params) as input to modifyDocument()
- [x] Verify changes are visible in the modified Excel (yellow cells) and modified PDF (change summary page)
- [x] Update vitest tests to mock the new LLM call for document-specific change extraction

## PDF Text Extraction (Future)
- [x] Add real PDF text extraction (e.g. pdf-parse npm package) so the LLM can read actual PDF cell values, not just page count

## High-Quality Document Modification Engine (Apr 20)
- [x] Manual comparison: when old+new manuals are uploaded in a Part Change, LLM reads both and extracts a structured diff (fieldName, oldValue, newValue, unit)
- [x] Use that diff as the source of truth for ALL document modifications — not SKU params
- [x] Excel modifier: use ExcelJS to preserve 100% of original formatting, only change specific cells that match old values, highlight changed cells in yellow (#FFFF00)
- [x] PDF modifier: replace text values in PDF using pdf-lib, add a minimal "MODIFIED" stamp — do not add banner pages
- [x] Modified document must look identical to the original except for the highlighted changed values
- [x] Both panels in DraftReview: left = original file rendered inline, right = modified file rendered inline with yellow highlights visible
- [x] Change log table below right panel: fieldName | oldValue | newValue for every change made
- [x] Update tests for the new manual comparison + ExcelJS modifier flow

## Approver Email Workflow + UI Improvements (April 2026)
- [x] DB: add approverEmail and approvalToken columns to documentDrafts table, run db:push
- [x] Server: build server/emailHelper.ts — send approval email with change summary and direct approval link
- [x] Server: update drafts.routeForApproval — accept approverEmail, generate secure token, send email, return approvalLink
- [x] Server: add drafts.getByToken public procedure — fetch draft by approval token (no auth required)
- [x] Server: add drafts.approveByToken public procedure — approve draft using token link
- [x] Server: add drafts.rejectByToken public procedure — reject draft using token link
- [x] Frontend: update DraftReview route-for-approval UI — email input, send button, show approval link after routing
- [x] Frontend: build ApprovalPage.tsx — public page at /approve?token=... for approver to view change summary and approve/reject
- [x] App.tsx: add /approve route as public (no auth required)
- [x] Step 2 UI redesign: prettier impact analysis cards with colored icons, category badges, reasoning text, better layout
- [x] All action buttons moved to bottom-left across all steps (Generate Document Drafts, etc.)
- [x] Fix manualComparison.ts filter: allow new-only values (oldValue can be empty)
- [x] Fix generateDrafts: skip modifyDocument gracefully when no changes found (non-fatal, text draft still available)
- [x] DraftReview: replace ChangeLogTable with ChangeAnnotationPanel — rich visual cards with #number, location, Before (strikethrough), arrow, After (yellow highlight)
- [x] DraftReview right panel header: updated subtitle "Same document as left — only changed values are updated & highlighted in yellow"
- [x] DraftReview right panel header: renamed "Modified Document" → "Updated Document" for clarity

## Document Pipeline Fixes (Apr 21 2026)
- [x] Fix draft selection bug: use getDraftByImpactAnalysisId instead of allDrafts[last] — was assigning modifiedFileUrl to wrong draft
- [x] Fix manualComparison filter: allow empty oldValue for new-value-only additions
- [x] Fix documentModifier: fuzzy numeric matching (strips commas/units before comparing), new-value-only additions via fieldNameMatchesLabel
- [x] Fix generateDrafts: allow empty oldValue in LLM extraction filter
- [x] Add reGenerateModifiedFile tRPC procedure for re-triggering modification on existing drafts
- [x] Add "Generate Modified File" / "Re-generate" button to DraftReview right panel header
- [x] Add TRPCError import to routers.ts

## UX + Viewer Fixes (Apr 21 2026)
- [x] Remove confirm/dismiss buttons from impact analysis — AI decision is final, no user confirmation step
- [x] Auto-mark all AI-impacted docs as confirmed so generateDrafts runs on all of them without user action
- [x] Fix split-view left panel: always show the original Document Library file (Word/Excel/PDF) via inline viewer
- [x] Fix split-view right panel: always show the modified file (Word/Excel/PDF) via inline viewer with yellow highlights
- [x] Add Word (.docx) modification support using mammoth (extraction) + docx (rebuild with yellow highlights)
- [x] Add Word text extraction to extractDocumentContent for LLM impact analysis
- [x] Ensure Office viewer (view.officeapps.live.com) is used for .docx/.xlsx files on both panels

## Approval Security Fix (Apr 21 2026)
- [x] Remove Approve/Reject buttons from DraftReview page — logged-in users must NOT be able to approve their own docs
- [x] DraftReview action panel: shows Route for Approval form only; once routed shows status card only
- [x] Only the token-based /approve page (linked in the email) allows approval — token is tied to the specific approver email
- [x] Added clear info message: "Approval is locked to the designated approver"

## Document Annotation Fix (Apr 22 2026)
- [x] Fix analyzeImpact: scan document text with pdftotext/xlsx before LLM call — auto-mark docs containing old value as impacted (prevents PSG Line Clearance SOP and similar docs from being missed)
- [x] DB: add annotatedOriginalUrl, annotatedOriginalKey, cleanModifiedUrl, cleanModifiedKey columns to documentDrafts table, run db:push
- [x] modifyDocument: produce THREE PDF variants — annotated original (yellow highlights on old values), modified view (green highlights + arrow on new values), clean download (no highlights)
- [x] DraftReview left panel: use annotatedOriginalUrl (yellow highlights on old value) if available, else fall back to doc.fileUrl
- [x] DraftReview right panel: use modifiedFileUrl (green highlights + arrow on new value)
- [x] DraftReview download button: use cleanModifiedUrl (no highlights) for download — viewer shows highlights, download is clean
- [x] Update left panel header badge: "Old values highlighted" label when annotatedOriginalUrl is present
- [x] Update right panel legend: "Green = new values" + "Download = clean (no highlights)"
- [x] Update vitest tests: modifyDocument mock includes new annotatedOriginalUrl/cleanModifiedUrl fields

## Word Document In-Place Modification Fix (Apr 22 2026)
- [x] Fix modifyWord: use python-docx via child_process to do TRUE in-place modification on the original .docx file — preserve all original formatting, tables, images, headers/footers
- [x] annotateOriginalWord: annotate original .docx with YELLOW highlights over old values (left panel)
- [x] modifyWordInPlace: produce GREEN highlights on new values in modified .docx (right panel view)
- [x] cleanModifyWord: produce clean .docx with text replaced but NO highlight colors (download)
- [x] Ensure all three Word variants are uploaded to S3 and stored in annotatedOriginalUrl/modifiedFileUrl/cleanModifiedUrl
- [x] Fix DraftReview: left panel shows annotated original (yellow), right panel shows modified (green), download is clean

## Word & PDF Annotation Fix (Apr 22 2026)
- [x] Replace from-scratch Word rebuilder with python-docx in-place modifier (wordModifier.py)
- [x] Fix search term priority: try compound terms (155g, 155 g) before bare value (155)
- [x] Produce three Word variants: annotated original (yellow), modified view (green), clean download
- [x] Fix PDF WinAnsi encoding errors: replace all non-ASCII chars in drawText calls (em-dash, arrows, ellipsis)
- [x] Add sanitizeForPdf() helper to strip non-Latin-1 characters from all dynamic text in pdf-lib drawText
- [x] Fix __dirname in documentModifier.ts (ESM context - use import.meta.url)
- [x] All 31 tests pass, TypeScript compiles cleanly

## Clean Replacement & Approver View (Apr 22 2026)
- [x] PDF: replace old value text entirely in modified doc — white cover + new value (both annotated view and clean download)
- [x] Word: python-docx replaces text in-place, compound-term priority prevents duplicate unit issue
- [x] Approver review page: show split-panel (old doc left, new doc right) immediately on load, with approve/reject form below — no separate click required
- [x] Approver page: fetch draft data including annotatedOriginalUrl and modifiedFileUrl, render both iframes side by side
- [x] Approver page: approve/reject/notes form rendered below the split panel on the same page
- [x] Make the entire annotation/replacement logic weight-agnostic (driven by skuChanges oldValue/newValue, compound-term priority for all units)

## LLM Picker (Apr 23 2026)
- [x] DB: add appSettings table (key TEXT PK, value TEXT) for storing global config like selected LLM model
- [x] Run pnpm db:push to migrate schema
- [x] Backend: add settings.getModel procedure — returns current model name, defaults to gemini-2.5-flash
- [x] Backend: add settings.setModel procedure (protected) — updates model in appSettings table
- [x] Add optional model field to InvokeParams in llm.ts
- [x] Update all 4 invokeLLM calls in routers.ts to read model from DB settings instead of hardcoding
- [x] Frontend: build LLMSettings.tsx page with 6 model cards (speed/quality dot indicators, strengths, provider)
- [x] Available models: gemini-2.5-flash (default), gemini-2.5-pro, gemini-2.0-flash, gemini-2.0-flash-lite, claude-sonnet-4-5, claude-opus-4-5
- [x] Show currently active model with green ring + checkmark; persist selection immediately on click
- [x] Add /settings/llm route to App.tsx
- [x] Add AI Model Settings entry to adminItems in DashboardLayout.tsx sidebar
- [x] Update changesync.test.ts mock to include getAppSetting/setAppSetting
- [x] All 31 tests pass, TypeScript compiles cleanly

## Duplicate Unit Fix & Version History (Apr 25 2026)
- [x] Fix duplicate unit bug: when user enters "170gm" as newValue and document contains "155gm", output should be "170gm" not "170gm gm"
- [x] Fix in wordModifier.py: compound-term search consumes unit suffix from document text (partial unit prefixes also tried)
- [x] Fix in documentModifier.ts (PDF): buildNewValue() skips appending unit if newValue already ends with it; all unit-append sites fixed
- [x] DB: add documentVersions table (id, documentId, versionNumber, fileUrl, fileKey, fileName, mimeType, changeEventId, changeNote, uploadedBy, uploadedByName, createdAt)
- [x] Backend: documents.getVersionHistory procedure — list all versions for a document (newest first)
- [x] Backend: version auto-created on GitHub import (v1) and on draft approval (vN+1 with change event link)
- [x] Frontend: Document Library — History button on each document card opens slide-out version history drawer
- [x] Frontend: Version history drawer shows timeline with version number, change event, notes, uploader, date, and View link
- [x] All 31 tests pass, TypeScript compiles cleanly

## Approver Page Blank Documents Fix (Apr 25 2026)
- [x] Root cause: ApprovalPage DocPanel used sandbox="allow-same-origin" which blocks cross-origin PDF iframes; Word files showed download prompt instead of Office Online viewer
- [x] Fix: rewrote DocPanel to match DraftReview.tsx logic — PDF iframes without sandbox, Office Online viewer for Word/Excel, error fallback to download
- [x] Pass mimeType from document to DocPanel for accurate file type detection
- [x] All 31 tests pass, TypeScript compiles cleanly

## Word Document Formatting Preservation Fix (Apr 25 2026)
- [x] Root cause: add_run helper stripped bold, color, and highlight from original run before applying hardcoded green color and forced bold
- [x] Fix: rewrite _apply_highlight_in_paragraph to deep-copy original run XML verbatim for every segment (before/matched/after), preserving ALL formatting (font name, size, bold, italic, color, underline, strike, etc.)
- [x] Only change: run.text is updated to replacement value; for annotate/modify_green modes, only <w:highlight> is added — nothing else
- [x] Verified: bold=True, size=14pt, color=C00000 preserved in all three modes; highlight added only where expected
- [x] All 31 tests pass, TypeScript compiles cleanly

## Manual Comparison & Full Document-Impact Workflow (April 2026)

- [x] Add manualDiff column to changeEvents table in schema (stores JSON array of ChangeEntry objects)
- [x] Run pnpm db:push to migrate schema
- [x] Add updateChangeEventManualDiff helper to db.ts
- [x] Import updateChangeEventManualDiff in routers.ts
- [x] Persist manualDiff to DB after compareManuals() in generateDrafts procedure
- [x] Add "Detected Changes from Manuals" panel to ChangeDetail.tsx — shows each changed field with old (red strikethrough) → new (green) value
- [x] Fix Word document formatting preservation in wordModifier.py — deep-copy original run XML, only change text and highlight
- [x] Strengthen manualComparison.ts prompt: extract range values (75–90), multi-part intervals (4320 hrs / 180 days), short-name lubricant aliases
- [x] Strengthen matchesOldValue in documentModifier.ts: normalise dash-ranges, comma-thousands, and whitespace for robust cell matching
- [x] Extend analyzeImpact to also extract old values from uploaded manuals when no SKU changes are present

## Bug Fix — Gearbox Change Over-Scoping (April 2026)

- [x] Fix compareManuals prompt: restrict extraction to lubrication, safety, maintenance, and operations fields only — exclude motor specs, frame sizes, gear ratios, part numbers, and other values that do not appear in downstream documents
- [x] Add documentCategory field to ChangeEntry interface and JSON schema so each extracted change knows which document type it targets
- [x] Fix analyzeImpact: replace broad regex scan of old manual (all product names + all numeric values) with lubrication-only scan (lubricant names from lube-related lines, ml/days/hrs values only) to prevent false-positive impact flags on Safety Maps, CPE docs, etc.
- [x] Fix generateDrafts: filter changesToApply by documentCategory before passing to modifier — lubrication changes only go to Lube Maps, safety changes only to Safety Maps, etc.

## Weight Change Lube Map False Positive Bug (Apr 26 2026)
- [x] Fix analyzeImpact: Weight Change events must NOT flag Lube Maps or any lubrication documents as impacted — weight changes are irrelevant to lubrication
- [x] Ensure change type context (Weight Change vs Part Change) is passed to the LLM impact analysis prompt so it reasons correctly about relevance
- [x] Add guard: if changeType is "weight" or "price", skip lubrication-category documents entirely in impact analysis

## Equipment-Scoped Impact Analysis (Apr 26 2026)
- [x] Fix analyzeImpact for Part Change: read each document's text row by row and only flag it if it actually references the affected equipment (e.g. "gearbox") — do not flag Driver Roller or other equipment documents just because they share a search term
- [x] For Excel documents: scan each row and check if any cell in that row references the affected equipment name before flagging the document
- [x] For PDF/Word documents: check that the document text contains the affected equipment name (not just the changed value) before auto-flagging
- [x] Pass affectedEquipment to the LLM prompt as a hard constraint: only flag documents that reference that specific equipment

## Approval Status Not Updating (Apr 28 2026)
- [x] Fix: approving a document does not reflect as "approved" in the UI — root cause was stale tRPC cache; fixed by adding refetchInterval (5s) to DraftReview and ChangeDetail when draft is in routed_for_approval state, and refetchOnWindowFocus to Dashboard

## Change Event Status Not Updating to Approved (Apr 28 2026)
- [x] Fix: approveByToken never calls updateChangeEventStatus — change event stays "pending_approval" forever even after all drafts are approved
- [x] After approving a draft, check if ALL drafts for that change event are now approved; if so, set change event status to "approved"
- [x] Dashboard "Approved" count is always 0 because it counts change events with status="approved", not drafts

## One Approval Should Mark Change Event as Approved (Apr 28 2026)
- [x] Change event should move to "approved" status as soon as ANY single draft is approved, not only when all drafts are approved
- [x] Update all three approval paths (approveByToken, drafts.approve, drafts.reject) to set change event to approved immediately on first approval

## Part Change Lube Map Row-Level Fix (Apr 28 2026)
- [x] Fix: extractLubeSection now correctly finds "Section 8 Lubrication" heading in both manuals
- [x] Fix: extractLubricationFrequency now joins continuation lines so hours and days split across two PDF lines are both captured
- [x] Verified end-to-end: old manual extracts Omala 220 / 75-90 ml / 4320 hrs (180 days); new manual extracts Mobil SHC 630 / 40 ml / 1440 hrs (60 days)
- [x] Verified Lube Map row-level guard: 120 cells matched across all gearbox rows (rows 140-196), all other equipment rows untouched
- [x] All 31 tests pass, TypeScript compiles cleanly

## Dashboard Date/Time Display (Apr 29 2026)
- [x] Show formatted date and time (e.g. "29 Apr 2026, 14:32") on each change event row in the Dashboard list

## Impact Analysis Over-Flagging & Excel Row Guard (Apr 29 2026)
- [x] Fix analyzeImpact: for Part Change with manuals, ONLY flag a document as impacted if its actual text content contains a reference to the affected equipment (e.g. "gear box", "gearbox"). Documents with no gearbox mention must be marked not impacted regardless of LLM reasoning.
- [x] Fix Excel modifier: replace cells ONLY in rows where the nearest non-empty col A value matches the affected equipment name. Do not replace any cell in a Driver Roller row, Bearing row, Chain row, etc.
- [x] The equipment name from the change event (affectedEquipment field) must be passed all the way through analyzeImpact → generateDrafts → modifyDocument as a hard constraint.

## Excel Highlighting Precision Fix (Apr 29 2026)
- [x] Fix annotateOriginalExcel: scan ALL rows for matching old values, but only apply YELLOW highlight when the matching cell is also in an equipment row (col A = affected equipment). Non-equipment rows with the same value are left untouched.
- [x] Fix modifyExcelGreen: same logic — only update cell value and apply GREEN highlight when the matching cell is in an equipment row. Other rows with the same value are left unchanged.
- [x] Fix modifyExcelClean: same logic — only update cell value when the matching cell is in an equipment row.
- [x] Net result: only the specific changed cells (lubricant name, quantity, frequency) in the gearbox section are highlighted; no other rows are touched or highlighted.

## Excel Row Guard Precision Fix (Apr 29 2026)
- [x] Fix isEquipmentRow: the Lube Map has ONE data row per component (e.g. row 71 for Gear box) followed by 7 empty spacer rows. The current "walk upward to find nearest non-empty col A" logic incorrectly marks all 7 empty spacer rows as equipment rows too, causing too many rows to be highlighted. Fix: only return true if col A of the CURRENT row itself matches the equipment name — do NOT walk upward. Empty rows (col A is blank) are never data rows and must never be highlighted.

## Impact Analysis — Part Change with Manual Upload (Apr 29 2026)
- [x] For Part Change with uploaded manuals: impact analysis must be DETERMINISTIC, not LLM-driven. The manual diff is the ground truth. Only flag documents whose TYPE matches the changed fields: if lubricant/qty/frequency changed → only Lube Map documents get flagged. Do NOT use search-term scanning (which flags any doc containing "Omala 220") and do NOT use LLM for impact scoring on Part Changes with manuals.
- [x] All other document types (Safety Map, CPE, PM Plan, CIL, etc.) must be marked NOT IMPACTED for a Part Change where only lubrication fields changed. They should only be flagged if the change event text notes or manual diff explicitly mentions safety, PM, or other domain-specific changes.

## Zoom + Row Guard Fix (Apr 29 2026)
- [x] Add zoom in/out controls to the DraftReview split-view document windows (both left and right panels)
- [x] Fix row guard: non-gearbox rows (e.g. "Cam shaft taper") are being highlighted — diagnose why isEquipmentRow is returning true for them and fix (confirmed via Python diagnostic: isEquipmentRow correctly returns false for Cam Shaft Taper rows; old drafts were generated before the fix)

## Right Panel Zoom + Yellow Highlight Scope (Apr 29 2026)
- [x] Fix: right panel (Updated Document) zoom controls are not rendering — moved to a dedicated second header row so they're always visible regardless of how many action buttons are present
- [x] Fix: left panel (Original) yellow highlighting is showing Cam Shaft Taper rows as yellow — root cause was break instead of return in the eachCell callback; the equipment row guard check now uses return to skip the entire cell, not break to stop the inner loop

## affectedEquipment Not Passed to modifyDocument (Apr 29 2026)
- [x] Diagnose: affectedEquipment is not being passed correctly to modifyDocument in generateDrafts — all rows get highlighted instead of only Gear box rows. Root cause: isEquipmentRow returned true for all rows when equipmentName was empty ("no equipment specified — accept all rows"). Fix: (1) isEquipmentRow now returns false when empty, (2) all three Excel functions always call isEquipmentRow unconditionally, (3) generateDrafts and reGenerateModifiedFile now derive effectiveEquipment from event.affectedEquipment OR infer it from the event title when affectedEquipment is blank.

## Merged Cell Root Cause Fix (Apr 29 2026)
- [x] Root cause of 40-row highlighting: ExcelJS reports the same merged cell value on EVERY row in a merge range. The Lube Map uses merged cells for col A (e.g. "Gear box" spans rows 71-78) AND for data cols G/J/K. Without the isMasterCell guard, all 8 rows in the merge get highlighted. Fix: added isMasterCell() helper that returns true only for the top-left master cell of a merge range. All three Excel functions (annotateOriginalExcel, modifyExcelGreen, modifyExcelClean) now skip non-master cells. Simulation confirmed: exactly 15 cells across 5 rows (3 cells per Gear box entry) are highlighted — zero extra rows.

## Only Highlight Actually Changed Values (Apr 29 2026)
- [x] Fix: changes where oldValue === newValue (e.g. qty "75-90 ml" unchanged, frequency "4320 hrs" unchanged) must be completely excluded from the replacementChanges array. Currently these are included and cause false highlights on ALL rows that share the same value (e.g. every component with frequency "4320 hrs / 180 days" gets highlighted yellow). Fix in both documentModifier.ts (filter replacementChanges) and in compareManuals.ts (only return changes where old != new).

## ExcelJS Fill Propagation Root Cause Fix (Apr 29 2026)
- [x] Root cause: ExcelJS shares style objects between adjacent merged cells. Setting a fill on G71 causes ExcelJS to write that fill to the shared style used by many other cells (B63-B70, etc.) in the worksheet XML. The post-processing approach (write → read back → clear) also failed because clearing a slave cell's fill modifies the same shared style object as the master cell.
- [x] Fix: completely replaced ExcelJS fill-setting with a pure JSZip XML approach. New `applyHighlightsToExcelXml()` function: (1) adds highlight fill to styles XML, (2) reads the correct xf count from `<cellXfs count="N">` attribute (not regex match count — regex misses multi-line entries), (3) creates new xf entries for each cell's original style + highlight fill, (4) patches cell `s` attributes in worksheet XML directly. ExcelJS is now only used to FIND which cells to highlight and to write new values — never to set fills.
- [x] Simulation verified: exactly 10 cells (G71, J71, G88, J88, G138, J138, G147, J147, G189, J189) highlighted for a 2-field change (lubricant name + quantity) across 5 Gear box rows. Zero unwanted cells.
- [x] All 31 tests pass, TypeScript compiles cleanly.

## Remove Signup Option (Apr 29 2026)
- [x] Remove "Sign up" / "Create account" link from Login page
- [x] Redirect /register route to /login (or remove it entirely)
- [x] Remove Register link from any other pages that reference it

## Make Dashboard Publicly Accessible (Apr 29 2026)
- [x] Remove login redirect from DashboardLayout so unauthenticated users reach the dashboard
- [x] Keep login/logout available but not required
- [x] Ensure tRPC procedures used on public pages don't throw auth errors for unauthenticated visitors

## Professor Account Setup (Apr 29 2026)
- [x] Restore login redirect in DashboardLayout
- [x] Restore global auth redirect in main.tsx
- [x] Create professor account: professor@changesync.com / ChangeSync2026

## Remove Login Screen Entirely (Apr 29 2026)
- [x] Remove auth guard from DashboardLayout (no redirect to /login)
- [x] Remove global auth redirect from main.tsx
- [x] Make changeEvents.list and documents.list publicProcedure
- [x] Remove /login route from App.tsx (or redirect to /)
- [x] Update sidebar/topbar to hide login button

## OAuth Auto-Account + Professor Access (Apr 29 2026)
- [x] Wire Manus OAuth callback to auto-create ChangeSync user on first sign-in
- [x] Restore email/password login screen so professor can also use credentials
- [x] Ensure professor@changesync.com / ChangeSync2026 account exists with admin role

## Fix Manus OAuth Redirect Error (Apr 29 2026)
- [x] Add /manus-oauth/callback route to server to match platform redirect URI

## Login Bug Fix (April 2026)
- [x] Fix login issue on live site — all OAuth sign-ins now get admin role automatically; no second email/password login needed

## Bug Fix — Create Change Event Auth Error (April 2026)
- [x] Fix "Failed to create change event" error on published site — root cause: verifySession rejected sessions where name was empty (some OAuth providers don't return a display name). Fixed: name is now optional in session validation; fallback to email or 'User' when name is missing.

## Open Access — No Login Required (April 2026)
- [x] Convert all protectedProcedure to publicProcedure so all API calls work without a session
- [x] Remove auth redirect from main.tsx (no redirect to /login on unauthorized errors)
- [x] Remove auth guard from DashboardLayout (no redirect to /login for unauthenticated users)
- [x] Remove Sign In button/link from sidebar and any other UI
- [x] Remove /login, /forgot-password, /reset-password routes from App.tsx
- [x] Handle ctx.user being null in procedures that reference it (e.g. createdBy field)

## Fix /login 404 (April 2026)
- [x] Add redirect from /login (and /forgot-password, /reset-password) to / so stale links don't 404

## Bug Fix — Wrong Document in Weight Change Impact Analysis (April 2026)
- [x] Fix: weight change impact analysis now always flags Line Clearance/Changeover docs; excludes change-record docs whose name contains "weight change"

## Bug Fix — Missing Green Highlights in Document Preview (April 2026)
- [x] Fix: changed values (e.g. 155gm → 170gm) — Office Online does not render ExcelJS/Word fill colours; change annotation bar now shown ABOVE the iframe in the right panel with before/after chips (strikethrough old value, green badge new value); green highlights still visible in downloaded file

## Bug Fix — Weight Change 155 → 170 Not Applied to Document (April 2026)
- [x] Diagnose why weight change (155 → 170) is not being applied to the modified document — right panel shows 155gm unchanged
- [x] Fix 1: isEquipmentRow returned false (blocking ALL rows) when no equipment specified — now returns true (allow all rows) for weight/price changes
- [x] Fix 2: matchesOldValue rejected short values like "155" (< 6 chars) — added compound unit matching (155g, 155gm, 155 g, 155 gm) and numeric prefix matching
- [x] Fix 3: buildNewValue did not handle compound cell values like "155gm" when old="155" unit="g" — now preserves the unit suffix from the original cell
- [x] Fix 4: effectiveEquipment was inferred from the event title for weight/price changes (e.g. "weight" from "Weight Change") — now forced to empty string so equipment row guard is bypassed entirely for these change types
- [x] wordModifier.py already had compound-term search (155g, 155gm, 155 g) — confirmed working

## Bug Fix — Highlights Not Visible to External Users (April 2026)
- [x] Diagnose why yellow/green highlights are visible to owner but not to external users on the published app
- [x] Fix: root cause was older drafts (generated before annotation feature) had modifiedFileUrl but no annotatedOriginalUrl. DraftReview now auto-silently-regenerates such drafts on first open so all users see highlighted versions. New drafts always have annotatedOriginalUrl populated.

## Bug Fix — Right Panel Broken in DraftReview (April 2026)
- [x] Fix: right panel shows plain text instead of Office Online iframe — removed duplicate ChangeAnnotationPanel below the iframe that was pushing the iframe out of view; kept only the compact change chips bar above the iframe

## Critical Fix — Production Document Modifier (April 2026)
- [x] Replace extractPageWords() pdftotext -bbox call with pure JS using pdf-parse v2 getTextContent API
- [x] Replace extractDocumentContent() pdftotext -layout call with pure JS using pdf-parse v2 getText API
- [x] Replace runWordModifierPy() python3.11 call with pure JS using JSZip XML manipulation (port wordModifier.py logic)
- [x] Replace manualComparison.ts extractFileText() pdftotext/python3.11 calls with pdf-parse and mammoth
- [x] Replace routers.ts pdftotext impact-scan call with pdf-parse v2 getText API
- [x] Remove dead parseBboxHtml function (no longer needed)
- [x] TypeScript check passes (npx tsc --noEmit)
- [x] Tests pass (pnpm test)
- [x] Save checkpoint and deploy

## Bug Fix — No Changes Applied to Drafts After Pure JS Migration (April 2026)
- [x] Diagnose why runWordModifierJs / extractPageWords are not applying changes to documents
- [x] Fix the root cause — pdf.js text items are fragmented; rewrote to line-based concatenation with character-level position mapping
- [x] Verify fix works end-to-end

## UI Fix — DraftReview Right Panel Layout
- [x] Move document preview (Excel/PDF viewer) to the top of the right panel
- [x] Move the change list (green highlights summary) below the document preview

## Bug Fix — Impact Analysis Should Scan Documents Before Flagging
- [x] Investigate how documents are currently flagged (by type/name vs by content scan)
- [x] Fix logic to only flag documents that actually contain the old values being changed
- [x] Ensure the system scans all documents in the library, checks which contain gearbox-related values, and only flags those
