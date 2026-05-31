# ChangeSync — AI-Powered Engineering Change Management

ChangeSync is a full-stack web application that automates engineering change management for manufacturing environments. When a physical component is replaced, a product weight changes, or a price is updated, ChangeSync scans the entire operational document library, identifies which documents contain affected values, and generates modified drafts with old values replaced and new values highlighted — ready for review and approval.

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference (tRPC Procedures)](#api-reference-trpc-procedures)
- [Core Algorithms](#core-algorithms)
- [Frontend Pages](#frontend-pages)
- [Configuration](#configuration)
- [Getting Started](#getting-started)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Problem Statement

In manufacturing environments, a single engineering change can impact dozens of operational documents. When a gearbox is replaced with a new model, the following documents may need updating:

- **Lubrication Maps** — lubricant name, quantity, and frequency for the gearbox rows
- **Safety Maps** — new hazard zones, LOTO points, PPE requirements
- **Preventative Maintenance Plans** — new PM task types and frequencies
- **Centerline Process Equipment** — new operating parameters
- **Troubleshooting Guides** — new failure modes and diagnostics
- **Operator Training (OPLs)** — new normal/abnormal conditions
- **Spare Parts Lists** — new part numbers and stock levels

Traditionally, identifying which documents need updating is a manual process that takes weeks. Engineers must open each document, search for relevant values, and manually edit them. ChangeSync automates this entire workflow end-to-end.

---

## How It Works

### End-to-End Workflow

```
1. CREATE CHANGE EVENT
   ├── Part Change: Upload old + new equipment manuals (PDF/Word)
   ├── Weight Change: Specify SKU, old value, new value, unit
   └── Price Change: Specify SKU, old value, new value, unit

2. IMPACT ANALYSIS (automated)
   ├── Extract text from every document in the library
   ├── Search for old values + equipment name in each document
   ├── Flag documents that contain BOTH equipment reference AND old values
   └── Mark remaining documents as not impacted (with reasoning)

3. DRAFT GENERATION (automated)
   ├── For each impacted document:
   │   ├── Download the original file from S3
   │   ├── Apply find-and-replace: old values → new values
   │   ├── Add green highlights to changed cells/text
   │   ├── Generate annotated original (yellow highlights on old values)
   │   ├── Generate clean download copy (no highlights)
   │   └── Upload all variants to S3
   └── Generate LLM-written change summary for each document

4. REVIEW & APPROVE
   ├── Side-by-side comparison: original (yellow) vs modified (green)
   ├── Change log showing every cell/field that was modified
   ├── Route to approver via email (token-based, no login required)
   └── On approval: create new document version in the library
```

### Change Types Supported

| Change Type | Input Required | Impact Analysis Strategy |
|-------------|---------------|--------------------------|
| **Part Change** (with manuals) | Old manual PDF + New manual PDF + Affected equipment name | Compare manuals → extract lubricant/qty/frequency diff → scan all docs for old values |
| **Part Change** (without manuals) | Text description + Affected equipment name | LLM-based impact assessment of each document |
| **Weight Change** | SKU name, old weight, new weight, unit (g/kg/lb) | Search all docs for old weight value with unit variants |
| **Price Change** | SKU name, old price, new price, unit (currency) | Search all docs for old price value with unit variants |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (React 19)                               │
│                                                                           │
│  Dashboard ─ NewChange ─ ChangeDetail ─ DraftReview ─ DocumentLibrary    │
│  ApprovalPage (public) ─ Login/Register ─ UserManagement ─ LLMSettings   │
│                                                                           │
│  Tailwind CSS 4 + shadcn/ui + Framer Motion + TanStack React Query       │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │ tRPC v11 (type-safe, superjson)
┌───────────────────────────────────┴──────────────────────────────────────┐
│                          SERVER (Express 4 + tRPC)                         │
│                                                                           │
│  routers.ts (1400 lines)         │  documentModifier.ts (1600 lines)     │
│  ├── auth.*                      │  ├── modifyExcel (JSZip XML)          │
│  ├── changeEvents.*              │  ├── modifyPdf (pdf-lib + pdf-parse)  │
│  ├── documents.*                 │  ├── modifyWord (JSZip XML)           │
│  ├── github.*                    │  └── extractDocumentContent           │
│  ├── analyses.*                  │                                        │
│  ├── drafts.*                    │  manualComparison.ts                   │
│  ├── admin.*                     │  ├── extractFileText (pdf-parse/mammoth)│
│  └── settings.*                  │  ├── extractLubeSection               │
│                                  │  ├── extractLubricantName (regex)      │
│  db.ts (Drizzle query helpers)   │  ├── extractLubricationQty (regex)    │
│  emailHelper.ts (SMTP/fallback)  │  ├── extractLubricationFrequency     │
│  github.ts (tree API + import)   │  └── compareManuals (regex + LLM)    │
│  storage.ts (S3 put/get)         │                                        │
└──────────┬───────────────────────┴───────────────────┬───────────────────┘
           │                                           │
    ┌──────┴──────┐    ┌──────────────┐    ┌──────────┴──────────┐
    │  MySQL/TiDB  │    │  S3 Storage  │    │  LLM API (Gemini)   │
    │  (Drizzle)   │    │  (documents) │    │  (impact + drafts)  │
    └─────────────┘    └──────────────┘    └─────────────────────┘
```

### Key Design Decisions

1. **Pure JavaScript document processing** — No CLI tools (pdftotext, python3.11) required. All PDF, Word, and Excel processing uses npm packages (pdf-parse, JSZip, mammoth, xlsx, pdf-lib, ExcelJS). This ensures clean deployment to containerized environments.

2. **Deterministic-first, LLM-fallback** — Manual comparison uses regex extraction for lubricant names, quantities, and frequencies. LLM is only invoked when deterministic extraction fails. This ensures reproducible results and reduces API costs.

3. **Content-based impact analysis** — Documents are flagged based on their actual content, not their name or category. The system downloads and extracts text from every document, then checks for the presence of both the affected equipment name AND the old values being changed.

4. **Three-variant file generation** — For each impacted document, three files are produced:
   - Annotated original (yellow highlights on old values) — for the left review panel
   - Modified with highlights (green on new values) — for the right review panel
   - Clean modified (no highlights) — for download and version archiving

5. **Equipment-aware matching** — For Excel files, a match only counts if the search term appears in the same row as the affected equipment name. This prevents false positives (e.g., flagging a "Driver Roller" row when only the "Gearbox" row should change).

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend Framework | React 19 + TypeScript | UI components and state management |
| Styling | Tailwind CSS 4 + shadcn/ui | Design system with 50+ pre-built components |
| Animations | Framer Motion | Page transitions and micro-interactions |
| Routing | Wouter | Lightweight client-side routing |
| Data Fetching | TanStack React Query + tRPC 11 | Type-safe server communication with caching |
| Backend Framework | Express 4 + tRPC 11 | API server with type-safe procedures |
| Database ORM | Drizzle ORM | Type-safe SQL queries and migrations |
| Database | MySQL 8 / TiDB | Relational data storage |
| File Storage | AWS S3 (or compatible) | Document file storage |
| PDF Reading | pdf-parse v2 (pdfjs-dist) | Text extraction with position data |
| PDF Writing | pdf-lib | Annotation overlays (strikethrough, highlights) |
| Excel Reading | xlsx (SheetJS) | Cell value extraction |
| Excel Writing | JSZip (raw XML) | Formatting-preserving cell modification |
| Word Reading | mammoth | Text extraction from .docx |
| Word Writing | JSZip (raw XML) | Run-level text replacement with highlights |
| LLM | Gemini 2.5 Flash (configurable) | Impact assessment, change extraction, draft writing |
| Authentication | bcrypt + JWT cookies | Email/password auth with session management |
| Email | Nodemailer | Approval notification emails via SMTP |
| Build Tool | Vite 6 + esbuild | Frontend bundling + server compilation |
| Testing | Vitest | Unit and integration tests |

---

## Project Structure

```
changesync-app/
├── client/                          # Frontend application
│   ├── index.html                   # HTML entry with Google Fonts (DM Serif Display + DM Sans)
│   └── src/
│       ├── App.tsx                  # Route definitions + layout wiring
│       ├── main.tsx                 # tRPC client + React Query + auth redirect
│       ├── index.css                # Global theme: colors, fonts, shadows, container
│       ├── const.ts                 # OAuth login URL builder, app constants
│       ├── pages/
│       │   ├── Home.tsx             # Landing page (PRD-style documentation with TOC)
│       │   ├── Dashboard.tsx        # Stats cards + recent change events list
│       │   ├── NewChange.tsx        # Multi-step change event creation wizard
│       │   ├── ChangeDetail.tsx     # Event detail: status, assets, impact results, drafts
│       │   ├── DraftReview.tsx      # Split-panel: original vs modified with change log
│       │   ├── DocumentLibrary.tsx  # Upload, import, search, version history
│       │   ├── ApprovalPage.tsx     # Public token-gated approver review page
│       │   ├── UserManagement.tsx   # Admin: list users, change roles, reset passwords
│       │   ├── LLMSettings.tsx      # Admin: select AI model (Gemini/Claude variants)
│       │   ├── Login.tsx            # Email/password login form
│       │   ├── Register.tsx         # User registration form
│       │   ├── ForgotPassword.tsx   # Password reset request
│       │   └── ResetPassword.tsx    # Password reset completion
│       ├── components/
│       │   ├── DashboardLayout.tsx  # Sidebar navigation shell with role-based items
│       │   ├── ChangeProgressStepper.tsx  # Visual workflow status indicator
│       │   ├── StatusBadge.tsx      # Color-coded status pills
│       │   ├── ErrorBoundary.tsx    # React error boundary with fallback UI
│       │   ├── WebcamCapture.tsx    # Camera capture for photo-based changes
│       │   └── ui/                  # shadcn/ui library (button, card, dialog, table, etc.)
│       ├── contexts/
│       │   └── ThemeContext.tsx     # Light/dark theme provider
│       ├── hooks/
│       │   └── useMobile.tsx        # Responsive breakpoint detection
│       └── lib/
│           ├── trpc.ts             # tRPC React hooks client
│           └── utils.ts            # cn() utility for Tailwind class merging
│
├── server/                          # Backend application
│   ├── routers.ts                   # All tRPC procedures (auth, changes, docs, drafts, admin)
│   ├── db.ts                        # Drizzle query helpers (CRUD for all tables)
│   ├── documentModifier.ts          # Document processing engine (Excel, PDF, Word)
│   ├── manualComparison.ts          # Manual comparison: regex extraction + LLM fallback
│   ├── emailHelper.ts              # SMTP email sending with HTML templates
│   ├── github.ts                    # GitHub API: list sample docs, import, push
│   ├── storage.ts                   # S3 storagePut/storageGet helpers
│   ├── wordModifier.py             # Legacy Python Word modifier (replaced by JS)
│   ├── index.ts                     # Production static file server
│   ├── _core/                       # Framework plumbing
│   │   ├── index.ts                # Express + Vite dev server bootstrap
│   │   ├── context.ts             # tRPC context builder (user from cookie)
│   │   ├── trpc.ts                # tRPC init + publicProcedure/protectedProcedure
│   │   ├── oauth.ts               # Manus OAuth callback handler
│   │   ├── cookies.ts             # Session cookie configuration
│   │   ├── sdk.ts                 # JWT signing/verification
│   │   ├── env.ts                 # Environment variable mapping
│   │   ├── llm.ts                 # invokeLLM helper (Gemini/Claude)
│   │   ├── notification.ts        # notifyOwner helper
│   │   ├── imageGeneration.ts     # generateImage helper
│   │   ├── voiceTranscription.ts  # transcribeAudio helper
│   │   ├── map.ts                 # Google Maps proxy helper
│   │   ├── dataApi.ts             # Data API helper
│   │   └── systemRouter.ts        # System tRPC router (notify owner)
│   ├── auth.logout.test.ts         # Auth test suite (10 tests)
│   └── changesync.test.ts          # Core workflow test suite (21 tests)
│
├── drizzle/                         # Database schema & migrations
│   ├── schema.ts                    # 7 tables with full column definitions
│   ├── relations.ts                 # Table relationships
│   ├── meta/_journal.json           # Migration journal
│   └── 0000-0012_*.sql             # 13 SQL migration files
│
├── shared/                          # Shared between client and server
│   ├── const.ts                    # COOKIE_NAME, error messages, timeout constants
│   └── types.ts                    # Re-exported Drizzle types
│
├── scripts/
│   └── list-docs.mts              # Utility: list documents from GitHub repo
│
├── patches/
│   └── wouter@3.7.1.patch         # Wouter patch for route matching
│
├── package.json                    # Dependencies and scripts
├── pnpm-lock.yaml                  # Lockfile
├── vite.config.ts                  # Vite + Express dev server configuration
├── vitest.config.ts                # Test configuration
├── drizzle.config.ts               # Drizzle Kit configuration
├── tsconfig.json                   # TypeScript configuration
├── components.json                 # shadcn/ui configuration
├── CLAUDE.md                       # AI assistant context document
├── ideas.md                        # Feature ideas and roadmap notes
└── todo.md                         # Development task tracking
```

---

## Database Schema

### `users`

Stores all user accounts (OAuth and email/password).

| Column | Type | Description |
|--------|------|-------------|
| `id` | int (PK, auto) | Surrogate primary key |
| `openId` | varchar(64), unique | Manus OAuth identifier (nullable for email users) |
| `name` | text | Display name |
| `email` | varchar(320), unique | Email address |
| `passwordHash` | varchar(255) | bcrypt hash (null for OAuth-only users) |
| `passwordResetToken` | varchar(128) | Token for password reset flow |
| `passwordResetExpiry` | timestamp | Expiry time for reset token |
| `loginMethod` | varchar(64) | How the user registered (email, oauth) |
| `role` | enum(user, admin) | Access level (default: user) |
| `createdAt` | timestamp | Account creation time |
| `updatedAt` | timestamp | Last modification time |
| `lastSignedIn` | timestamp | Last login time |

### `changeEvents`

Records each engineering change request.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int (PK, auto) | Surrogate primary key |
| `title` | varchar(255) | Human-readable title (e.g., "Gear Box Change") |
| `changeType` | enum | One of: hardware, process, material, packaging, supplier, regulatory, safety, maintenance, part_change, weight_change, price_change |
| `partSubType` | enum | For part_change: manual, drawing, or image |
| `changeScope` | enum | substitution, upgrade, or new_introduction |
| `affectedEquipment` | varchar(255) | Equipment name (e.g., "Gear Box") |
| `affectedSku` | varchar(255) | SKU identifier for weight/price changes |
| `textNotes` | text | Free-text description of the change |
| `status` | enum | Workflow state: draft → analyzing → analysis_complete → generating_drafts → pending_approval → approved/rejected |
| `createdBy` | int | User ID who created the event |
| `manualDiff` | text | JSON array of extracted changes from manual comparison |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last modification time |

### `changeAssets`

File attachments for change events (old/new manuals, drawings, photos).

| Column | Type | Description |
|--------|------|-------------|
| `id` | int (PK, auto) | Surrogate primary key |
| `changeEventId` | int (FK) | Parent change event |
| `assetType` | enum | drawing_old, drawing_new, photo_old, photo_new, sds, other, manual_old, manual_new, image_old, image_new |
| `fileUrl` | text | S3 URL of the uploaded file |
| `fileKey` | varchar(512) | S3 object key |
| `fileName` | varchar(255) | Original filename |
| `mimeType` | varchar(128) | MIME type |
| `createdAt` | timestamp | Upload time |

### `skuChanges`

Individual parameter changes within a change event (old value → new value).

| Column | Type | Description |
|--------|------|-------------|
| `id` | int (PK, auto) | Surrogate primary key |
| `changeEventId` | int (FK) | Parent change event |
| `fieldName` | varchar(255) | What changed (e.g., "Weight", "Price") |
| `oldValue` | text | Previous value |
| `newValue` | text | New value |
| `unit` | varchar(64) | Unit of measurement (g, kg, $, etc.) |
| `createdAt` | timestamp | Creation time |

### `documents`

The operational document library.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int (PK, auto) | Surrogate primary key |
| `name` | varchar(255) | Document display name |
| `code` | varchar(64) | Document type code (CIL, CPE, LUBE Map, PM Plan, etc.) |
| `category` | enum | Operator, Engineering, Safety, Operations, Maintenance |
| `owner` | varchar(255) | Responsible person/team |
| `fileUrl` | text | S3 URL of the current version |
| `fileKey` | varchar(512) | S3 object key |
| `fileName` | varchar(255) | Original filename |
| `mimeType` | varchar(128) | MIME type |
| `version` | int | Current version number (default: 1) |
| `isActive` | boolean | Whether the document is active (default: true) |
| `uploadedBy` | int | User ID who uploaded |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last modification time |

### `impactAnalyses`

Impact assessment results — one per document per change event.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int (PK, auto) | Surrogate primary key |
| `changeEventId` | int (FK) | Parent change event |
| `documentId` | int (FK) | Assessed document |
| `impacted` | boolean | Whether the document is affected |
| `reasoning` | text | Explanation of why/why not impacted |
| `impactedSections` | text | Which sections/rows are affected |
| `confidence` | enum | high, medium, low |
| `status` | enum | pending, confirmed, dismissed |
| `createdAt` | timestamp | Assessment time |
| `updatedAt` | timestamp | Last modification time |

### `documentDrafts`

Generated drafts with file variants and approval state.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int (PK, auto) | Surrogate primary key |
| `impactAnalysisId` | int (FK) | Parent impact analysis |
| `changeEventId` | int (FK) | Parent change event |
| `documentId` | int (FK) | Target document |
| `draftContent` | text | LLM-generated change summary (Markdown) |
| `reviewNotes` | text | Reviewer comments |
| `status` | enum | generating, pending_review, routed_for_approval, approved, revision_requested, rejected |
| `approverName` | varchar(255) | Name of the designated approver |
| `approverEmail` | varchar(320) | Email of the designated approver |
| `approvalToken` | varchar(128) | Secure token for email-based approval |
| `approvalTokenExpiry` | timestamp | Token expiry (7 days from routing) |
| `approvedBy` | int | User ID who approved |
| `approvedAt` | timestamp | Approval timestamp |
| `modifiedFileUrl` | text | S3 URL: modified file with green highlights |
| `modifiedFileKey` | varchar(512) | S3 key for modified file |
| `annotatedOriginalUrl` | text | S3 URL: original with yellow highlights on old values |
| `annotatedOriginalKey` | varchar(512) | S3 key for annotated original |
| `cleanModifiedUrl` | text | S3 URL: clean modified file (no highlights) |
| `cleanModifiedKey` | varchar(512) | S3 key for clean modified file |
| `changeLog` | text | JSON array: [{cellRef, oldValue, newValue, sheetName}] |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last modification time |

### `documentVersions`

Version history for documents (created on approval).

| Column | Type | Description |
|--------|------|-------------|
| `id` | int (PK, auto) | Surrogate primary key |
| `documentId` | int (FK) | Parent document |
| `versionNumber` | int | Sequential version (1, 2, 3, ...) |
| `fileUrl` | text | S3 URL of this version |
| `fileKey` | varchar(512) | S3 key |
| `fileName` | varchar(255) | Filename |
| `mimeType` | varchar(128) | MIME type |
| `changeEventId` | int | Which change event produced this version |
| `changeEventTitle` | varchar(255) | Denormalized title for display |
| `changeNote` | text | Human-readable description of what changed |
| `uploadedBy` | int | User ID |
| `uploadedByName` | varchar(255) | Display name of uploader |
| `createdAt` | timestamp | Version creation time |

### `appSettings`

Key-value store for application configuration.

| Column | Type | Description |
|--------|------|-------------|
| `key` | varchar(128) (PK) | Setting name (e.g., "llm_model") |
| `value` | text | Setting value (e.g., "gemini-2.5-flash") |
| `updatedAt` | timestamp | Last modification time |

---

## API Reference (tRPC Procedures)

All procedures are accessible via `/api/trpc`. The client uses type-safe hooks generated from these definitions.

### `auth.*` — Authentication

| Procedure | Type | Description |
|-----------|------|-------------|
| `auth.me` | query | Returns current user from session cookie (null if not logged in) |
| `auth.register` | mutation | Create account with name, email, password (min 8 chars). Returns session cookie. |
| `auth.login` | mutation | Authenticate with email + password. Returns session cookie. |
| `auth.forgotPassword` | mutation | Send password reset email with token (expires in 1 hour) |
| `auth.resetPassword` | mutation | Complete password reset with token + new password |
| `auth.logout` | mutation | Clear session cookie |

### `changeEvents.*` — Change Event Management

| Procedure | Type | Description |
|-----------|------|-------------|
| `changeEvents.list` | query | List all change events (ordered by creation date) |
| `changeEvents.getById` | query | Get single event with assets, SKU changes, analyses, and drafts |
| `changeEvents.create` | mutation | Create new event (title, changeType, partSubType, affectedEquipment, affectedSku, textNotes) |
| `changeEvents.uploadAsset` | mutation | Upload a file attachment (base64 data + assetType + fileName) |
| `changeEvents.addSkuChange` | mutation | Add a parameter change (fieldName, oldValue, newValue, unit) |
| `changeEvents.removeSkuChange` | mutation | Delete a parameter change by ID |
| `changeEvents.analyzeImpact` | mutation | **Run full impact analysis** — scans all documents, flags impacted ones |
| `changeEvents.generateDrafts` | mutation | **Generate modified documents** — produces drafts for all impacted documents |

### `documents.*` — Document Library

| Procedure | Type | Description |
|-----------|------|-------------|
| `documents.list` | query | List all active documents |
| `documents.getById` | query | Get single document by ID |
| `documents.upload` | mutation | Upload new document (name, code, category, owner, base64 file data) |
| `documents.getVersionHistory` | query | Get version history for a document |

### `github.*` — GitHub Integration

| Procedure | Type | Description |
|-----------|------|-------------|
| `github.listSampleDocs` | query | List available sample documents from configured GitHub repo (grouped by folder) |
| `github.importFiles` | mutation | Import selected files from GitHub into the document library |

### `analyses.*` — Impact Analysis Management

| Procedure | Type | Description |
|-----------|------|-------------|
| `analyses.confirmStatus` | mutation | Manually confirm or dismiss an impact analysis result |

### `drafts.*` — Draft Management & Approval

| Procedure | Type | Description |
|-----------|------|-------------|
| `drafts.getById` | query | Get draft with full details (document, event, change log) |
| `drafts.approve` | mutation | Approve a draft (internal user) |
| `drafts.requestRevision` | mutation | Request revision with notes |
| `drafts.reject` | mutation | Reject a draft |
| `drafts.updateContent` | mutation | Edit the LLM-generated text summary |
| `drafts.routeForApproval` | mutation | Send approval email to external approver (generates token, sends email) |
| `drafts.approveByToken` | mutation | **Public** — approver clicks email link (no login required) |
| `drafts.getByToken` | query | **Public** — get draft info for the approval page |
| `drafts.reGenerateModifiedFile` | mutation | Re-run document modification (useful after fixing extraction bugs) |

### `admin.*` — User Administration

| Procedure | Type | Description |
|-----------|------|-------------|
| `admin.listUsers` | query | List all registered users |
| `admin.updateUserRole` | mutation | Change a user's role (user ↔ admin) |
| `admin.resetUserPassword` | mutation | Admin-initiated password reset for a user |

### `settings.*` — Application Settings

| Procedure | Type | Description |
|-----------|------|-------------|
| `settings.getModel` | query | Get current LLM model selection |
| `settings.setModel` | mutation | Change LLM model (persisted in appSettings table) |

---

## Core Algorithms

### 1. Manual Comparison (`server/manualComparison.ts`)

When old and new equipment manuals are uploaded, the system extracts exactly three lubrication fields:

**Step 1: Section Isolation**
- Finds the "Lubrication" section heading (§8, "Section 8", or standalone "Lubrication")
- Skips Table of Contents entries (detected by 5+ consecutive spaces + trailing page number)
- Extracts text from the heading to the next section (§9)

**Step 2: Deterministic Regex Extraction**

For each manual, three field extractors run in priority order:

| Field | Patterns (in priority order) | Output Format |
|-------|------------------------------|---------------|
| Lubricant Name | Shell Omala S2/S4 G/GX {N}, Mobil SHC {N}, Castrol Optigear {N}, MobilGear {N}, ISO VG {N} | "Omala 220", "Mobil SHC 630" |
| Quantity | Range: `{N} - {N} ml`, Single: `{N} ml`. Priority: lines with "fill quantity/oil fill" keywords | "75 - 90 ml", "40 ml" |
| Frequency | Hours + days: `{N} hrs\n({N} days)`. Priority: lines with "oil change/service interval" keywords | "4320 hrs\n(180 days)" |

Each extractor skips negative-context lines (warnings, compatibility notes, "do not use" lines).

**Step 3: LLM Fallback**
- If deterministic extraction finds fewer than 2 fields, the system falls back to LLM
- Sends both manual sections to Gemini with structured JSON output schema
- Returns the same three fields in Lube Map cell format

### 2. Impact Analysis (`server/routers.ts` → `analyzeImpact`)

**Path A: Part Change with Manuals (fully deterministic)**

```
1. Compare old/new manuals → get diff (e.g., "Omala 220 → Mobil SHC 630")
2. Build equipment keywords from affectedEquipment (e.g., "gear", "box", "gearbox")
3. For EACH document in the library:
   a. Download and extract text (pdf-parse for PDF, extractDocumentContent for Excel)
   b. Check if text contains ANY equipment keyword (case-insensitive)
   c. Check if text contains ANY old value from the diff (case-insensitive)
   d. Flag as impacted ONLY if BOTH conditions are true
4. Store reasoning for every document (impacted or not)
```

**Path B: Weight/Price Change (search-term scanning + LLM)**

```
1. Build search terms from SKU changes:
   - Base value: "155"
   - With unit: "155g", "155 g"
   - Gram variants: "155gm", "155 gm"
   - Numeric only: strip non-numeric from values that contain units

2. For EACH document in the library:
   a. Download and extract text
   b. For Excel: equipment-aware row matching (term + equipment in same row)
   c. For PDF/Word: require both term AND equipment in document
   d. If text match found → flag as impacted (high confidence)

3. For remaining unflagged documents:
   - Send to LLM for assessment (structured JSON: impacted boolean + reasoning)
   - Apply change-type-specific exclusion rules:
     * Weight/price changes exclude equipment-specific docs (Lube Maps, Safety Maps)
     * Line Clearance documents always flagged for weight changes
```

### 3. Document Modification (`server/documentModifier.ts`)

#### Excel Modification (JSZip XML approach)

The system uses raw XML manipulation via JSZip to preserve 100% of original formatting (merged cells, images, conditional formatting, cell styles). ExcelJS is only used for the annotated original (yellow highlights).

```
1. Download original .xlsx from S3
2. Open with JSZip → access xl/sharedStrings.xml and xl/worksheets/sheet1.xml
3. Parse shared strings table (Excel stores text in a shared pool)
4. For each row in the worksheet XML:
   a. Check if row contains affected equipment name (equipment guard)
   b. For each cell in the row:
      - Resolve cell value (inline string or shared string reference)
      - Check if cell contains any old value (case-insensitive)
      - If match: replace old value with new value in the XML
      - Add green fill style to the cell (modify xl/styles.xml)
5. Rebuild the .xlsx with JSZip
6. Upload modified file to S3
7. Also generate annotated original (ExcelJS with yellow fills on old-value cells)
8. Also generate clean copy (same as modified but without green highlights)
```

**Equipment Guard Logic:**
- For each row, concatenate all cell values into a single string
- Check if any equipment keyword appears in that string
- Only apply changes to rows that pass the equipment guard
- This prevents modifying "Driver Roller" rows when only "Gearbox" should change

#### PDF Modification (pdf-parse + pdf-lib)

```
1. Download original PDF from S3
2. Extract text with positions using pdf-parse v2:
   a. Access internal pdf.js document via PDFParse
   b. For each page, call getTextContent() → get text items with transform arrays
   c. Group items by Y coordinate (same line = within 2px tolerance)
   d. Sort items within each line by X coordinate
   e. Concatenate items with gap-based spacing (gap > 3px = space)
   f. Build character-level position map: each character → {x, y, width, height}

3. Search for old values in concatenated line text:
   a. Case-insensitive substring search
   b. Map match positions back to bounding boxes via character position map
   c. Return: [{term, pageIndex, x, y, width, height}]

4. Apply modifications using pdf-lib:
   a. Load the PDF document
   b. For each match:
      - Draw white rectangle over old text (cover it)
      - Draw red strikethrough line through the covered area
      - Draw new value text in green to the right of the old position
   c. Save modified PDF

5. Generate three variants:
   - Annotated original: yellow rectangles over old values (no replacement)
   - Modified with highlights: white cover + strikethrough + green new values
   - Clean modified: white cover + new values in black (no color coding)
```

**Handling Fragmented Text Items:**
PDF.js often splits words across multiple text items (e.g., "155gm" → "1" + "55" + "gm"). The line-based concatenation approach solves this by:
- Grouping all items on the same Y coordinate into a single line
- Concatenating them in X order with gap-based spacing
- Searching the full concatenated string for matches
- Mapping character indices back to precise X/Y coordinates

#### Word (.docx) Modification (JSZip XML)

```
1. Download original .docx from S3
2. Open with JSZip → access word/document.xml
3. Parse the XML to find <w:r> (run) elements containing text
4. For each paragraph:
   a. Concatenate all run texts to form the full paragraph text
   b. Search for old values (case-insensitive)
   c. If found:
      - Identify which runs contain the match (may span multiple runs)
      - Split runs at match boundaries
      - Replace matched text with new value
      - Add <w:highlight w:val="yellow"/> to the replacement run's properties
      - Preserve all existing run properties (bold, italic, font, size, color)
5. Rebuild the .docx with JSZip
6. Upload to S3
```

### 4. Approval Flow

```
1. Internal reviewer clicks "Route for Approval" on a draft
2. System generates a 32-byte hex token (valid 7 days)
3. Sends HTML email via SMTP with:
   - Change event title and document name
   - Table of changed fields (old → new)
   - "Approve" and "Reject" buttons (links with token)
4. Approver clicks link → lands on /approve?token=<hex>&action=approve
5. Public approval page shows:
   - Split panel: original (left) vs modified (right)
   - Change log table
   - Approve/Reject form with optional comments
6. On approval:
   - Draft status → "approved"
   - New document version created in the library (using clean modified file)
   - Change event status → "approved"
```

**SMTP Fallback:** If SMTP is not configured, the system logs the approval links and sends them via the Manus owner notification channel.

---

## Frontend Pages

### Dashboard (`/`)
Overview with four stat cards (total changes, pending, approved, documents) and a list of recent change events showing status, type, affected equipment/SKU, and creation date/time.

### New Change (`/changes/new`)
Multi-step wizard for creating a change event:
1. Select change type (Part Change / Weight Change / Price Change)
2. For Part Change: select sub-type (Manual / Drawing / Image), upload old + new files, specify affected equipment
3. For Weight/Price Change: specify SKU name, old value, new value, unit
4. Submit → creates event and redirects to detail page

### Change Detail (`/changes/:id`)
Full event view with:
- Progress stepper showing workflow state
- Detected changes from manual comparison (if applicable)
- Uploaded assets (old/new manuals, drawings, photos)
- Parameter changes table
- Impact analysis results (impacted vs not impacted, with reasoning)
- Draft links for each impacted document
- Actions: Run Analysis, Generate Drafts, Re-analyze

### Draft Review (`/drafts/:id`)
Split-panel comparison:
- **Left panel:** Original document with yellow highlights over old values. Supports PDF (embedded viewer), Excel (Office Online), Word (Office Online), and images.
- **Right panel:** Modified document with green highlights on new values (viewer at top, change badge list below). Supports same formats.
- **Actions:** Re-generate, Edit text summary, Route for Approval, Download clean copy

### Document Library (`/documents`)
- Upload documents with metadata (name, code, category, owner)
- Import from configured GitHub repository (grouped by folder, bulk select)
- Search and filter by name, code, category
- Version history drawer showing all versions with change notes

### Approval Page (`/approve?token=...`)
Public page (no login required):
- Branded header with change event title
- Full-width split panel: original vs modified
- Change log table
- Approve/Reject form with comments

### User Management (`/admin/users`)
Admin-only page for managing users: list all accounts, change roles (user ↔ admin), reset passwords.

### AI Model Settings (`/admin/ai-model`)
Admin-only page for selecting the LLM model used for impact analysis and draft generation. Supports Gemini 2.5 Flash (default), Gemini 2.5 Pro, Gemini 2.0 Flash, Claude Sonnet 4, and Claude Opus 4.

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | MySQL/TiDB connection string (e.g., `mysql://user:pass@host:3306/db?ssl={"rejectUnauthorized":true}`) |
| `JWT_SECRET` | Yes | Long random string for signing session cookies |
| `BUILT_IN_FORGE_API_URL` | Yes | LLM/Storage API base URL |
| `BUILT_IN_FORGE_API_KEY` | Yes | Server-side API key for LLM and storage calls |
| `VITE_FRONTEND_FORGE_API_KEY` | Yes | Frontend API key (exposed to browser) |
| `VITE_FRONTEND_FORGE_API_URL` | Yes | Frontend API base URL |
| `VITE_APP_ID` | Yes | OAuth application ID |
| `OAUTH_SERVER_URL` | Yes | OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | Yes | OAuth login portal URL (frontend redirect) |
| `OWNER_OPEN_ID` | Yes | Owner's OAuth identifier |
| `OWNER_NAME` | No | Owner's display name |
| `GITHUB_TOKEN` | No | GitHub personal access token (for document import) |
| `GITHUB_REPO` | No | GitHub repo for sample documents (default: `marshad18/change-flow`) |
| `SMTP_HOST` | No | SMTP server host (e.g., `smtp.gmail.com`) |
| `SMTP_PORT` | No | SMTP port (e.g., `587`) |
| `SMTP_USER` | No | SMTP username/email |
| `SMTP_PASS` | No | SMTP password or app password |
| `SMTP_FROM` | No | From address for approval emails |
| `VITE_APP_TITLE` | No | Browser tab title |
| `VITE_APP_LOGO` | No | App logo URL |

### Supported LLM Models

| Model | Provider | Notes |
|-------|----------|-------|
| `gemini-2.5-flash` | Google | Default. Fast, good at structured output. |
| `gemini-2.5-pro` | Google | Higher quality, slower. |
| `gemini-2.0-flash` | Google | Previous generation, stable. |
| `claude-sonnet-4-20250514` | Anthropic | High quality, may fail structured JSON. |
| `claude-opus-4-20250514` | Anthropic | Most capable, experimental. |

### Supported Document Types

| Code | Name | Category |
|------|------|----------|
| CIL | Clean, Inspect, Lubricate | Operator |
| CPE | Centerline Process Equipment | Engineering |
| Safety Map | Safety Map | Safety |
| SOC Map | Standard Operating Conditions Map | Operations |
| HTRA Map | Hazard & Task Risk Assessment Map | Safety |
| LUBE Map | Lubrication Map | Maintenance |
| Fastener Map | Fastener Torque Map | Maintenance |
| MTM | Methods-Time Measurement | Engineering |
| WPA | Workplace Analysis | Engineering |
| Manuals | Equipment Manuals | Operations |
| OPLs | One-Point Lessons | Operator |
| Troubleshooting | Troubleshooting Guide | Maintenance |
| AM Step 3/4/5 | Autonomous Maintenance Steps | Operator |
| Spare List | Spare Parts List | Maintenance |
| PM Plan | Preventative Maintenance Plan | Maintenance |

---

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- MySQL 8+ or TiDB (with SSL)

### Installation

```bash
# Clone the repository
git clone https://github.com/marshad18/changesync-app.git
cd changesync-app

# Install dependencies
pnpm install

# Set up environment variables
# Create .env file with required variables (see Configuration section)

# Push database schema
pnpm db:push

# Start development server
pnpm dev
```

The application will be available at `http://localhost:3000`.

### First-Time Setup

1. Register an account at `/register`
2. Promote yourself to admin via SQL: `UPDATE users SET role = 'admin' WHERE email = 'your@email.com'`
3. Import sample documents from GitHub via the Document Library page
4. Create your first change event

---

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Development | `pnpm dev` | Start dev server with hot reload (tsx watch + Vite HMR) |
| Build | `pnpm build` | Production build (Vite frontend + esbuild server bundle) |
| Start | `pnpm start` | Start production server from `dist/` |
| Test | `pnpm test` | Run Vitest test suite (31 tests) |
| DB Push | `pnpm db:push` | Generate SQL migrations + apply to database |
| Format | `pnpm format` | Format all code with Prettier |

---

## Testing

The project includes 31 tests across two suites:

### `server/auth.logout.test.ts` (10 tests)
- User registration with email/password
- Login with correct/incorrect credentials
- Session cookie creation and validation
- Logout and cookie clearing
- Password reset token generation
- Duplicate email prevention

### `server/changesync.test.ts` (21 tests)
- Change event CRUD (create, list, get by ID)
- Asset upload and retrieval
- SKU change management (add, remove)
- Impact analysis execution and result storage
- Document library operations
- Draft generation and status transitions
- Approval workflow (route, approve by token, reject)
- Document version creation on approval
- Re-generation of modified files

Run tests:
```bash
pnpm test
```

---

## Deployment

The application is designed for containerized deployment (Cloud Run, Docker, etc.):

### Build Output
```
dist/
├── index.js          # Bundled server (ESM, single file)
└── public/           # Static frontend assets (Vite build)
    ├── index.html
    └── assets/       # JS/CSS chunks with content hashes
```

### Requirements
- **No system packages needed** — all document processing is pure JavaScript
- **Single process** — Express serves both API and static frontend
- **Port** — reads from `PORT` environment variable (defaults to 3000)
- **Database** — MySQL/TiDB with SSL (connection string via `DATABASE_URL`)
- **Storage** — S3-compatible object storage (credentials via env vars)

### Docker Example
```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY dist/ ./dist/
ENV PORT=8080
CMD ["node", "dist/index.js"]
```

### Production Checklist
- [ ] All environment variables set (see Configuration section)
- [ ] Database schema pushed (`pnpm db:push`)
- [ ] S3 bucket created and accessible
- [ ] SMTP configured (or accept fallback to owner notifications)
- [ ] Admin user promoted via SQL

---

## License

Private repository. All rights reserved.
