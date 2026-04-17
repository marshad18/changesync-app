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
