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
