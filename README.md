# ChangeSync — AI-Powered Engineering Change Management

ChangeSync is a full-stack web application that helps manufacturing teams manage engineering changes by automatically identifying which operational documents are impacted and generating updated drafts with highlighted changes. When a component is replaced, a product weight changes, or a price is updated, ChangeSync scans the entire document library, flags affected documents, and produces ready-to-review drafts with old values struck through and new values highlighted.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Core Features](#core-features)
- [Document Processing Pipeline](#document-processing-pipeline)
- [Database Schema](#database-schema)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Overview

In manufacturing environments, a single engineering change (e.g., replacing a gearbox) can impact dozens of operational documents — lubrication maps, safety maps, maintenance plans, operator training materials, and more. Traditionally, identifying which documents need updating is a manual, error-prone process that can take weeks.

ChangeSync automates this entire workflow:

1. **Create a Change Event** — Describe what changed (part replacement, weight change, price change), upload old/new equipment manuals or specify old/new values.
2. **AI Impact Analysis** — The system extracts text from every document in the library, scans for affected values, and uses equipment-aware matching to flag only the documents that genuinely contain the relevant data.
3. **Automated Draft Generation** — For each impacted document, ChangeSync generates a modified version with old values replaced by new values and changes highlighted in green.
4. **Review & Approve** — Engineers review side-by-side comparisons (original vs. modified) and approve or reject each draft.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (React 19)                        │
│  Dashboard │ Change Events │ Document Library │ Draft Review     │
│  Tailwind CSS 4 + shadcn/ui + Framer Motion                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ tRPC (type-safe RPC)
┌────────────────────────────┴────────────────────────────────────┐
│                      Server (Express + tRPC 11)                  │
│  routers.ts │ documentModifier.ts │ manualComparison.ts │ db.ts │
│  Pure JS document processing (pdf-parse, JSZip, mammoth, xlsx)  │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
        │  MySQL /   │ │    S3     │ │  LLM API  │
        │   TiDB     │ │  Storage  │ │ (Gemini)  │
        └───────────┘ └───────────┘ └───────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Framer Motion, Wouter (routing) |
| State Management | TanStack React Query + tRPC hooks |
| Backend | Express 4, tRPC 11, TypeScript |
| Database | MySQL / TiDB with Drizzle ORM |
| File Storage | AWS S3 (or S3-compatible) |
| Document Processing | pdf-parse v2, JSZip, xlsx, mammoth, pdf-lib, ExcelJS |
| AI/LLM | Gemini 2.5 Flash (configurable) via built-in LLM helper |
| Authentication | OAuth 2.0 (Manus) + bcrypt password auth |
| Email | Nodemailer (SMTP) for approval notifications |
| Build | Vite 6, esbuild, tsx |
| Testing | Vitest |

---

## Project Structure

```
changesync-app/
├── client/                     # Frontend application
│   ├── index.html              # HTML entry point
│   └── src/
│       ├── App.tsx             # Routes & layout wiring
│       ├── main.tsx            # tRPC + React Query providers
│       ├── index.css           # Global styles & Tailwind theme
│       ├── const.ts            # Frontend constants & OAuth helpers
│       ├── pages/
│       │   ├── Home.tsx            # Landing page (PRD-style documentation)
│       │   ├── Dashboard.tsx       # Overview with stats & recent changes
│       │   ├── NewChange.tsx       # Multi-step change event creation wizard
│       │   ├── ChangeDetail.tsx    # Change event detail with impact results
│       │   ├── DraftReview.tsx     # Side-by-side draft comparison & approval
│       │   ├── DocumentLibrary.tsx # Document CRUD with upload & GitHub import
│       │   ├── ApprovalPage.tsx    # External approver review page
│       │   ├── UserManagement.tsx  # Admin user management
│       │   ├── LLMSettings.tsx     # AI model configuration
│       │   ├── Login.tsx           # Email/password login
│       │   ├── Register.tsx        # User registration
│       │   ├── ForgotPassword.tsx  # Password reset request
│       │   └── ResetPassword.tsx   # Password reset completion
│       ├── components/
│       │   ├── DashboardLayout.tsx     # Sidebar navigation shell
│       │   ├── ChangeProgressStepper.tsx # Change workflow status stepper
│       │   ├── StatusBadge.tsx         # Color-coded status badges
│       │   ├── ErrorBoundary.tsx       # React error boundary
│       │   ├── WebcamCapture.tsx       # Camera capture for photos
│       │   └── ui/                     # shadcn/ui component library (50+ components)
│       ├── contexts/
│       │   └── ThemeContext.tsx     # Dark/light theme provider
│       ├── hooks/
│       │   └── useMobile.tsx       # Responsive breakpoint hook
│       └── lib/
│           ├── trpc.ts             # tRPC client setup
│           └── utils.ts            # Tailwind merge utility
│
├── server/                     # Backend application
│   ├── index.ts                # Express server entry (imported by _core)
│   ├── routers.ts              # All tRPC procedures (1400+ lines)
│   ├── db.ts                   # Database query helpers (Drizzle)
│   ├── documentModifier.ts     # Document processing engine (1600+ lines)
│   ├── manualComparison.ts     # Manual comparison & lubrication extraction
│   ├── emailHelper.ts          # SMTP email sending for approvals
│   ├── github.ts               # GitHub integration for document import
│   ├── storage.ts              # S3 file storage helpers
│   ├── _core/                  # Framework plumbing (OAuth, context, Vite bridge)
│   ├── auth.logout.test.ts     # Auth test suite
│   └── changesync.test.ts      # Core workflow test suite
│
├── drizzle/                    # Database schema & migrations
│   ├── schema.ts               # Table definitions (9 tables)
│   ├── relations.ts            # Table relationships
│   └── *.sql                   # 13 migration files
│
├── shared/                     # Shared types & constants
│   ├── const.ts                # Shared constants (change types, error messages)
│   └── types.ts                # Shared TypeScript types
│
├── package.json                # Dependencies & scripts
├── vite.config.ts              # Vite configuration with Express middleware
├── tsconfig.json               # TypeScript configuration
├── vitest.config.ts            # Test configuration
└── drizzle.config.ts           # Drizzle Kit configuration
```

---

## Core Features

### 1. Change Event Management

Three types of engineering changes are supported:

| Change Type | Description | Input Required |
|-------------|-------------|----------------|
| **Part Change** | Physical component replaced (e.g., gearbox motor) | Old/new equipment manuals (PDF/Word), affected equipment name |
| **Weight Change** | Product weight specification changes | SKU name, old value, new value, unit |
| **Price Change** | Product price specification changes | SKU name, old value, new value, unit |

Each change event progresses through a workflow: `draft` → `analyzing` → `analysis_complete` → `pending_approval` → `approved` or `rejected`.

### 2. Document Library

A centralized repository of all operational documents with:

- File upload (PDF, Excel, Word) with S3 storage
- Bulk import from a configured GitHub repository
- Document metadata: name, code, category, owner, version tracking
- Categories: Operator, Engineering, Safety, Operations, Maintenance
- Document codes: CIL, CPE, Safety Map, SOC Map, HTRA Map, LUBE Map, Fastener Map, MTM, WPA, Manuals, OPLs, Troubleshooting, AM Step 3/4/5, Spare List, PM Plan

### 3. AI-Powered Impact Analysis

The impact analysis engine uses a multi-strategy approach:

**For Part Changes with Manuals:**

1. Compares old/new manuals using deterministic regex extraction (lubricant name, quantity, frequency)
2. Falls back to LLM extraction if regex fails
3. Scans ALL documents in the library — downloads and extracts text from each
4. Flags a document as impacted only if it contains BOTH the affected equipment name AND at least one old value from the manual diff
5. Equipment-aware matching with compound word variants (e.g., "gear box" ↔ "gearbox")

**For Weight/Price Changes:**

1. Builds search terms from old values (with unit variants: "155g", "155gm", "155 g")
2. Scans all documents for text matches
3. Excel files: equipment-aware row matching (term must appear in same row as equipment name)
4. PDF/Word files: requires both search term and equipment name in the document
5. Remaining ambiguous documents are assessed by LLM with structured JSON output

**Change-Type-Specific Rules:**

- Weight/price changes exclude equipment-specific documents (Lube Maps, Safety Maps, CPE, etc.)
- Line Clearance documents are always flagged for weight changes
- Change record documents are excluded from flagging

### 4. Automated Draft Generation

For each impacted document, the system generates a modified version:

**Excel (.xlsx) Modification:**

- Opens the file using JSZip (raw XML manipulation for formatting preservation)
- Identifies equipment-relevant rows using the affected equipment name
- Replaces old values with new values in matching cells
- Adds green background highlighting to changed cells
- Preserves all existing formatting, merged cells, images, and structure
- Also generates an annotated original with yellow highlights on old values

**PDF Modification:**

- Extracts text with precise positions using pdf-parse v2's internal pdf.js `getTextContent()` API
- Uses line-based concatenation to handle fragmented text items (pdf.js often splits words like "155gm" into "1"+"55"+"gm")
- Groups text items by Y coordinate, sorts by X, concatenates with gap-based spacing
- Creates overlay annotations: red strikethrough on old values, green text for new values
- Uses pdf-lib for annotation rendering

**Word (.docx) Modification:**

- Opens the file using JSZip to access document.xml
- Parses XML to find text runs containing old values
- Handles text split across multiple `<w:r>` elements
- Replaces old values and adds `<w:highlight>` elements for yellow highlighting
- Preserves all existing run properties (bold, italic, font, size, color)

### 5. Draft Review Interface

A split-panel comparison view:

- **Left panel:** Original document with old values highlighted (yellow for Excel, red strikethrough for PDF)
- **Right panel:** Modified document preview (Excel via Office Online viewer, PDF via embedded viewer) with change summary badges below
- **Actions:** Re-generate draft, manual edit, download clean copy (without highlights), approve/reject

### 6. Approval Workflow

- Email notifications sent to designated approvers via SMTP
- External approval page (no login required, token-based)
- Approval status tracking with comments
- Batch approval for multiple documents in a change event

### 7. Authentication & Authorization

- OAuth 2.0 integration (Manus)
- Email/password registration and login with bcrypt hashing
- Password reset flow via email
- Role-based access control: `admin` and `user` roles
- Admin-only features: user management, AI model settings

### 8. GitHub Integration

- Import sample documents from a configured GitHub repository
- Automatic MIME type inference from file extensions
- Push modified documents back to GitHub (version tracking)

---

## Document Processing Pipeline

The document processing engine (`server/documentModifier.ts`, 1600+ lines) is entirely pure JavaScript — no CLI tools (pdftotext, python3.11) are required. This ensures the application deploys cleanly to containerized environments like Cloud Run.

### Key Technical Decisions

| Challenge | Solution |
|-----------|----------|
| PDF text extraction with positions | pdf-parse v2 → internal pdf.js `getTextContent()` with transform arrays |
| Fragmented PDF text items | Line-based concatenation: group by Y, sort by X, gap-based word spacing |
| Excel formatting preservation | JSZip raw XML manipulation (not ExcelJS which loses formatting) |
| Word formatting preservation | JSZip XML manipulation with run property preservation |
| Equipment-aware matching | Compound word variants + row-level matching for Excel |
| Manual comparison | Deterministic regex extraction with LLM fallback |

### Processing Flow

```
Document Upload → S3 Storage → Text Extraction → Impact Analysis
                                                        │
                                    ┌───────────────────┼───────────────────┐
                                    │                   │                   │
                              Text Match          Equipment Match       LLM Assessment
                                    │                   │                   │
                                    └───────────────────┼───────────────────┘
                                                        │
                                                  Flag Impacted
                                                        │
                                                  Generate Draft
                                                        │
                                    ┌───────────────────┼───────────────────┐
                                    │                   │                   │
                              Excel Modifier      PDF Modifier       Word Modifier
                              (JSZip XML)        (pdf-lib)          (JSZip XML)
                                    │                   │                   │
                                    └───────────────────┼───────────────────┘
                                                        │
                                                Upload to S3 → Review & Approve
```

---

## Database Schema

The application uses 9 MySQL tables managed by Drizzle ORM:

| Table | Purpose |
|-------|---------|
| `users` | User accounts with roles (admin/user), OAuth or password auth |
| `changeEvents` | Engineering change records with type, status, affected equipment |
| `changeAssets` | File attachments for change events (old/new manuals, drawings, photos) |
| `skuChanges` | SKU-level value changes (old value → new value with unit) |
| `documents` | Document library entries with file metadata |
| `impactAnalyses` | Impact assessment results per document per change event |
| `documentDrafts` | Generated draft files with change JSON and approval status |
| `documentVersions` | Version history for documents |
| `appSettings` | Application configuration (LLM model selection, etc.) |

---

## Environment Variables

Create a `.env` file in the project root for local development:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | Long random string for signing session cookies |
| `BUILT_IN_FORGE_API_URL` | LLM/Storage API base URL |
| `BUILT_IN_FORGE_API_KEY` | Server-side API key for LLM calls |
| `VITE_FRONTEND_FORGE_API_KEY` | Frontend API key |
| `VITE_FRONTEND_FORGE_API_URL` | Frontend API base URL |
| `S3_BUCKET` | S3 bucket name for file storage |
| `S3_REGION` | S3 region (e.g., `us-east-1`) |
| `S3_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `S3_ENDPOINT` | (Optional) Custom endpoint for S3-compatible services |
| `SMTP_HOST` | SMTP server host (e.g., `smtp.gmail.com`) |
| `SMTP_PORT` | SMTP port (e.g., `587`) |
| `SMTP_USER` | SMTP username / email address |
| `SMTP_PASS` | SMTP password or app password |
| `SMTP_FROM` | From address for approval emails |
| `GITHUB_TOKEN` | GitHub personal access token (for document import) |
| `GITHUB_REPO` | GitHub repo for sample documents (e.g., `marshad18/change-flow`) |
| `VITE_APP_TITLE` | App title shown in the browser tab |

---

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- MySQL 8+ or TiDB

### Installation

```bash
# Clone the repository
git clone https://github.com/marshad18/changesync-app.git
cd changesync-app

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database, S3, and API credentials

# Push database schema
pnpm db:push

# Start development server
pnpm dev
```

The application will be available at `http://localhost:3000`.

---

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development server with hot reload (tsx watch) |
| `pnpm build` | Build for production (Vite frontend + esbuild backend) |
| `pnpm start` | Start production server |
| `pnpm test` | Run Vitest test suite |
| `pnpm db:push` | Generate and apply database migrations |
| `pnpm format` | Format code with Prettier |

---

## Testing

The project includes two test suites:

- **`server/auth.logout.test.ts`** — Authentication flow tests (10 tests): registration, login, logout, session management
- **`server/changesync.test.ts`** — Core workflow tests (21 tests): change event CRUD, impact analysis, document management, draft generation, approval workflow

Run tests with:

```bash
pnpm test
```

---

## Deployment

The application is designed for containerized deployment (Cloud Run, Docker, etc.):

- **Build output:** `dist/` directory contains the bundled server and static frontend assets
- **No CLI dependencies:** All document processing uses pure JavaScript — no system packages required
- **Single process:** Express serves both the API and static frontend
- **Port:** Reads from `PORT` environment variable (defaults to 3000)

```bash
pnpm build
pnpm start
```

---

## License

Private repository. All rights reserved.
