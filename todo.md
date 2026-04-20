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
