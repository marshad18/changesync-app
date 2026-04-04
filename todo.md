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
