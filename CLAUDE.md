# CLAUDE.md — ChangeSync Project Reference

> This file is the single source of truth for any AI coding assistant working on this project.
> Read it fully before making any changes.

---

## 1. What This Project Does

**ChangeSync** is an AI-powered Engineering Change Management (ECM) platform built for manufacturing environments. Its core purpose is to manage the end-to-end workflow that occurs whenever a physical or process change is made to a production line — for example, replacing a motor, changing a lubricant grade, or updating a packaging specification.

In manufacturing, a single component change can require updates to 10–15 different controlled documents (Lubrication Maps, Safety Maps, PM Plans, CIL checklists, etc.). Today this is done manually and inconsistently, leading to outdated documentation, compliance risk, and safety incidents.

ChangeSync solves this by:

1. **Capturing the change** — an engineer logs the change event, uploads the old and new documents (manuals, drawings, photos), and records what changed (e.g. old motor spec vs new motor spec).
2. **AI impact analysis** — the platform uses an LLM to analyse all documents in the Document Library and determine which ones are impacted by the change, with reasoning and confidence scores.
3. **AI document drafting** — for each impacted document, the LLM extracts the specific values that changed and applies them surgically to the actual Excel/PDF file from the library, producing a modified version with only the changed cells updated.
4. **Review and approval** — the modified documents are shown in a side-by-side comparison view (original left, updated right) with a visual change annotation panel. An approver can be emailed a secure link to approve or reject each document without needing to log in.

The platform is targeted at manufacturing engineers, plant operators, HSE managers, and maintenance leads.

---

## 2. Tech Stack

### Languages
- **TypeScript** (strict, throughout — both client and server)
- **SQL** (MySQL/TiDB via Drizzle ORM)

### Frontend
- **React 19** with functional components and hooks
- **Vite 7** (dev server + build)
- **Tailwind CSS 4** (utility-first, OKLCH color format)
- **shadcn/ui** (component library built on Radix UI primitives — all components in `client/src/components/ui/`)
- **Wouter** (lightweight client-side router, patched version)
- **TanStack Query v5** (server state management)
- **tRPC v11** (end-to-end type-safe API client)
- **Framer Motion** (animations)
- **Recharts** (charts on dashboard)
- **Lucide React** (icons)
- **Sonner** (toast notifications)
- **Streamdown** (markdown rendering with streaming support)
- **React Hook Form + Zod** (form validation)

### Backend
- **Node.js** with **Express 4**
- **tRPC v11** (all API procedures, mounted at `/api/trpc`)
- **Drizzle ORM** (type-safe MySQL queries)
- **MySQL / TiDB** (relational database)
- **bcryptjs** (password hashing)
- **jose** (JWT session signing/verification)
- **nodemailer** (SMTP email for approver notifications)
- **xlsx / ExcelJS** (Excel file reading and modification)
- **pdf-lib** (PDF file modification)
- **node-fetch** (HTTP requests to GitHub API and file downloads)
- **tsx** (TypeScript execution in development, with hot reload via `tsx watch`)

### AI / LLM
- **Manus built-in LLM API** (`server/_core/llm.ts` → `invokeLLM()`) — wraps an OpenAI-compatible endpoint. To use outside Manus, swap this helper to use the OpenAI SDK directly with `OPENAI_API_KEY`.

### File Storage
- **Manus built-in S3-compatible storage** (`server/storage.ts` → `storagePut()` / `storageGet()`) — wraps a Forge API proxy. To use outside Manus, replace with direct AWS S3 SDK calls using `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

### Testing
- **Vitest** (unit tests, 31 tests across 2 suites — all passing)

### Tooling
- **pnpm** (package manager, v10)
- **Drizzle Kit** (`pnpm db:push` = `drizzle-kit generate && drizzle-kit migrate`)
- **esbuild** (server bundle for production)
- **Prettier** (code formatting)

---

## 3. Folder and File Structure

```
changesync-app/
├── client/                        # React frontend
│   ├── index.html                 # Vite HTML entry point
│   ├── public/                    # Static files only (favicon, robots.txt)
│   └── src/
│       ├── App.tsx                # Route definitions and layout wiring
│       ├── main.tsx               # React root, tRPC client setup, QueryClient
│       ├── index.css              # Global CSS variables, Tailwind theme, typography
│       ├── const.ts               # App-wide constants (getLoginUrl, etc.)
│       ├── _core/
│       │   └── hooks/
│       │       └── useAuth.ts     # Auth hook: user, loading, isAuthenticated, logout
│       ├── components/
│       │   ├── ui/                # shadcn/ui components (button, card, dialog, etc.)
│       │   ├── DashboardLayout.tsx        # Authenticated shell with sidebar nav
│       │   ├── DashboardLayoutSkeleton.tsx # Loading state for DashboardLayout
│       │   ├── ChangeProgressStepper.tsx  # 4-step workflow progress indicator
│       │   ├── StatusBadge.tsx            # Coloured status badge component
│       │   ├── WebcamCapture.tsx          # Camera capture for image-based part changes
│       │   ├── AIChatBox.tsx              # Reusable AI chat interface (not currently used)
│       │   └── Map.tsx                    # Google Maps integration (not currently used)
│       ├── pages/
│       │   ├── Login.tsx          # Email/password login form
│       │   ├── Register.tsx       # New account registration
│       │   ├── ForgotPassword.tsx # Password reset request
│       │   ├── ResetPassword.tsx  # Password reset via token link
│       │   ├── Dashboard.tsx      # Home dashboard: KPI cards + change event list
│       │   ├── NewChange.tsx      # Step 1: Create change event wizard
│       │   ├── ChangeDetail.tsx   # Step 2: Impact analysis + Step 3: Generate drafts
│       │   ├── DraftReview.tsx    # Step 4: Side-by-side document comparison + approval
│       │   ├── DocumentLibrary.tsx # Document Library: upload + GitHub import
│       │   ├── UserManagement.tsx  # Admin: list users, change roles, reset passwords
│       │   ├── ApprovalPage.tsx   # Public: token-based approve/reject for emailed approvers
│       │   └── Home.tsx           # Redirects to /dashboard (legacy entry point)
│       ├── contexts/
│       │   └── ThemeContext.tsx   # Light/dark theme context
│       ├── hooks/                 # Utility hooks (useMobile, useComposition, etc.)
│       └── lib/
│           ├── trpc.ts            # tRPC client binding
│           └── utils.ts           # cn() utility (clsx + tailwind-merge)
│
├── server/
│   ├── _core/                     # Framework plumbing — DO NOT edit unless extending infra
│   │   ├── index.ts               # Express server entry point (dev + prod)
│   │   ├── trpc.ts                # tRPC init: publicProcedure, protectedProcedure, router
│   │   ├── context.ts             # Request context builder (injects ctx.user)
│   │   ├── env.ts                 # Environment variable normalization (ENV object)
│   │   ├── llm.ts                 # LLM helper: invokeLLM({ messages, response_format })
│   │   ├── notification.ts        # Owner notification helper: notifyOwner({ title, content })
│   │   ├── imageGeneration.ts     # Image generation helper: generateImage({ prompt })
│   │   ├── voiceTranscription.ts  # Voice transcription helper: transcribeAudio({ audioUrl })
│   │   ├── oauth.ts               # Manus OAuth callback handler
│   │   ├── cookies.ts             # Session cookie helpers
│   │   ├── sdk.ts                 # JWT session signing/verification
│   │   ├── systemRouter.ts        # System tRPC router (notifyOwner mutation)
│   │   ├── vite.ts                # Vite dev middleware integration
│   │   └── dataApi.ts             # Manus data API proxy helper
│   ├── routers.ts                 # ALL tRPC procedures (the main API file)
│   ├── db.ts                      # All database query helpers (Drizzle)
│   ├── storage.ts                 # S3 file upload/download helpers
│   ├── documentModifier.ts        # Excel/PDF modification engine
│   ├── manualComparison.ts        # LLM-powered manual diff extractor
│   ├── emailHelper.ts             # SMTP email sender for approver notifications
│   ├── github.ts                  # GitHub API helpers (list/download/push files)
│   ├── index.ts                   # Legacy static-only server (not used in dev)
│   ├── changesync.test.ts         # Main Vitest test suite (21 tests)
│   └── auth.logout.test.ts        # Auth logout test suite (10 tests)
│
├── drizzle/
│   ├── schema.ts                  # Database table definitions (source of truth)
│   ├── relations.ts               # Drizzle relation definitions
│   └── *.sql                      # Migration files (auto-generated, do not edit)
│
├── shared/
│   ├── const.ts                   # Shared constants (COOKIE_NAME, error messages, etc.)
│   └── types.ts                   # Shared TypeScript types
│
├── drizzle.config.ts              # Drizzle Kit configuration
├── vite.config.ts                 # Vite configuration (aliases, plugins, proxy)
├── vitest.config.ts               # Vitest configuration
├── tsconfig.json                  # TypeScript configuration
├── package.json                   # Dependencies and scripts
├── todo.md                        # Full feature history and task ledger
├── ideas.md                       # Design brainstorm notes (historical reference)
└── README.md                      # Environment variables reference table
```

---

## 4. How to Install and Run Locally

### Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- A MySQL or TiDB database
- Git

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/marshad18/changesync-app
cd changesync-app

# 2. Install dependencies
pnpm install

# 3. Create your environment file
#    Copy the variable names from README.md and fill in your values
#    (see Section 5 below for the full list)
touch .env
# ... edit .env with your values

# 4. Push the database schema (creates all tables)
pnpm db:push

# 5. Start the development server
pnpm dev
# App runs at http://localhost:3000
# API runs at http://localhost:3000/api/trpc

# 6. Run tests
pnpm test

# 7. Type-check
pnpm check

# 8. Build for production
pnpm build
pnpm start
```

### First-time setup
After running `pnpm dev`, navigate to `http://localhost:3000/register` to create the first user account. To make that user an admin, update the `role` column directly in the database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

---

## 5. Environment Variables

All variables must be set in a `.env` file in the project root. The server reads them via `dotenv` on startup.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | MySQL/TiDB connection string, e.g. `mysql://user:pass@host:3306/changesync` |
| `JWT_SECRET` | **Yes** | Long random string for signing session cookies |
| `BUILT_IN_FORGE_API_URL` | **Yes** | Base URL for Manus LLM + Storage API (or your own OpenAI-compatible endpoint) |
| `BUILT_IN_FORGE_API_KEY` | **Yes** | Server-side bearer token for the Forge API |
| `VITE_FRONTEND_FORGE_API_KEY` | **Yes** | Frontend bearer token for the Forge API |
| `VITE_FRONTEND_FORGE_API_URL` | **Yes** | Frontend base URL for the Forge API |
| `GITHUB_TOKEN` | **Yes** | GitHub personal access token (for Document Library import from `change-flow` repo) |
| `GITHUB_REPO` | No | GitHub repo for sample documents. Defaults to `marshad18/change-flow` |
| `SMTP_HOST` | No | SMTP server host (e.g. `smtp.gmail.com`). Without this, emails are not sent. |
| `SMTP_PORT` | No | SMTP port. Defaults to `587` |
| `SMTP_USER` | No | SMTP username / email address |
| `SMTP_PASS` | No | SMTP password or app password |
| `SMTP_FROM` | No | From address for approval emails |
| `VITE_APP_TITLE` | No | Browser tab title. Defaults to `ChangeSync` |
| `OWNER_OPEN_ID` | No | Manus owner ID (for owner notifications) |
| `OWNER_NAME` | No | Manus owner name |
| `OAUTH_SERVER_URL` | No | Manus OAuth server URL (legacy, not used in active auth flow) |
| `VITE_OAUTH_PORTAL_URL` | No | Manus OAuth portal URL (legacy) |
| `VITE_APP_ID` | No | Manus app ID (legacy) |

> **Important:** `BUILT_IN_FORGE_API_*` variables power both the LLM (AI analysis) and file storage. If running outside Manus, you will need to replace `server/_core/llm.ts` with an OpenAI SDK call and `server/storage.ts` with direct AWS S3 SDK calls.

---

## 6. Current State of the Project

### What Is Built and Working

**Authentication**
- Email/password registration, login, logout
- Password reset via email token link
- JWT session cookies (1-year expiry)
- Role-based access: `user` and `admin` roles

**Change Event Workflow (4-step process)**

*Step 1 — Create Change Event (`NewChange.tsx`)*
- Three change types: Part Change, Weight Change, Price Change
- Part Change has three sub-types: Manual upload, Engineering Drawing upload, Image (with webcam capture option)
- Old and new file uploads for each type
- Free-text description field
- Change event is created in the DB and user is redirected to Step 2

*Step 2 — Impact Analysis (`ChangeDetail.tsx`)*
- LLM analyses all documents in the Document Library against the change
- Returns impacted/not-impacted status with reasoning and confidence (high/medium/low)
- Redesigned card UI: coloured category badges, reasoning text, confidence indicators
- User can confirm or dismiss individual analyses
- Warning shown if Document Library is empty
- "Generate Document Drafts" button at bottom-left triggers Step 3

*Step 3 — Generate Drafts (triggered from `ChangeDetail.tsx`)*
- For Part Change (manual sub-type): LLM compares old and new manual text, extracts a structured list of changed values (field name, old value, new value)
- For each impacted document: LLM identifies which specific cells/fields in that document correspond to the changed values
- `documentModifier.ts` downloads the original Excel/PDF from S3, applies the changes to the actual cells, highlights changed cells in yellow, and uploads the modified file back to S3
- The change log (array of `{cellRef, sheetName, oldValue, newValue}`) is stored in the DB alongside the modified file URL

*Step 4 — Draft Review (`DraftReview.tsx`)*
- Side-by-side split view: original document (left) vs updated document (right)
- Both documents rendered inline: Excel files via a custom HTML table renderer, PDFs via `<iframe>`
- Right panel header: "Same document as left — only changed values are updated & highlighted in yellow"
- **Change Annotation Panel** below the right document: numbered cards showing each change with Before (strikethrough) → arrow → After (yellow highlight)
- Inline editing of the AI draft text content
- Approve / Request Revision / Reject actions
- **Route for Approval**: enter approver's email address, click Send — generates a secure token, sends an HTML email with the change summary and Approve/Reject buttons, displays the approval link inline

**Approver Email Flow (`ApprovalPage.tsx`)**
- Public page at `/approve?token=...` — no login required
- Shows change event title, document name, and change log
- Approve and Reject buttons with optional notes
- Token expires after 7 days
- If no SMTP is configured, the approval link is still generated and displayed (can be shared manually)

**Document Library (`DocumentLibrary.tsx`)**
- Upload documents with metadata: name, code, category (Operator/Engineering/Safety/Operations/Maintenance), owner
- Import from GitHub: lists all files in `marshad18/change-flow/sample-documents/` grouped by folder, with checkboxes and an Import button
- Already-imported files are flagged with a badge
- 45 sample documents available in the connected GitHub repo

**Admin**
- User Management page: list all users, search by name/email, change user role, reset user password

**Testing**
- 31 Vitest tests across 2 suites, all passing
- Covers: change event CRUD, impact analysis, draft actions, auth, GitHub import

### What Is Not Yet Built

- **SMTP email delivery** is functional in code but requires the operator to configure `SMTP_*` environment variables. Without them, emails are not sent (the approval link is still generated and shown on screen).
- **Pushing documents back to GitHub** after modification — the `pushFileToGitHub()` helper exists in `server/github.ts` but is not wired into any procedure. This was intentionally deferred.
- **Weight Change and Price Change document modification** — the LLM analysis and draft generation work for these types, but the manual comparison pipeline (`compareManuals`) is only triggered for Part Change (manual sub-type). Weight/price changes generate a text summary draft but do not produce a modified Excel/PDF file.
- **Bulk approval routing** — each draft must be routed individually. There is no "Route All" button on the Change Event detail page.
- **Audit trail / history** — there is no timestamped log of who approved/rejected/revised each draft and when.
- **Notifications to document owners** — when a draft is generated for a document, the document's `owner` field is not used to automatically notify that person.
- **Version history for documents** — the `version` column exists in the `documents` table but is not incremented or surfaced in the UI.

---

## 7. Known Bugs and Issues

- **Excel viewer rendering** — the custom HTML table renderer for Excel files works well for simple flat tables but may not render merged cells, complex formatting, or multi-sheet workbooks correctly. The modified file is always correct (the xlsx library handles it properly); the visual rendering is approximate.
- **PDF modification** — `pdf-lib` can only modify text in PDFs that were created with embedded editable text. Scanned PDFs (image-based) cannot be modified; the system falls back to a text-only draft in this case.
- **LLM cell matching accuracy** — the LLM identifies which cells to update based on column headers and row labels. If a document has unusual structure (no clear headers, merged cells, non-standard layouts), the cell matching may be incorrect. Always review the Change Annotation Panel before approving.
- **Approval token expiry** — the `approvalTokenExpiry` column is set to 7 days but the `approveByToken` procedure does not currently check expiry. This should be added.
- **No CSRF protection** — tRPC mutations rely on the session cookie for auth but do not implement CSRF tokens. Acceptable for an internal tool but should be addressed before public-facing deployment.
- **`server/index.ts` vs `server/_core/index.ts`** — there are two server entry points. `server/index.ts` is a legacy static-file-only server and is not used by `pnpm dev` or `pnpm build`. Do not confuse the two.

---

## 8. Coding Conventions

### General
- **TypeScript strict mode** throughout. No `any` types unless absolutely unavoidable.
- **camelCase** for all variable names, function names, and database column names.
- **PascalCase** for React components and TypeScript types/interfaces.
- **kebab-case** for file names in `client/src/pages/` and `client/src/components/`.

### Backend (tRPC + Drizzle)
- All API logic lives in `server/routers.ts`. When this file exceeds ~150 lines for a feature, split into `server/routers/<feature>.ts`.
- All database queries live in `server/db.ts`. Procedures call helpers from `db.ts`; they do not write raw Drizzle queries inline.
- Use `publicProcedure` for unauthenticated endpoints (login, register, token-based approval). Use `protectedProcedure` for everything else — it injects `ctx.user`.
- Admin-only operations check `ctx.user.role !== 'admin'` and throw `TRPCError({ code: 'FORBIDDEN' })`.
- All timestamps are stored as UTC. The frontend converts to local time for display using `new Date(ts).toLocaleString()`.
- File uploads follow the pattern: client sends base64 or binary → server calls `storagePut()` → stores the returned S3 URL and key in the DB.

### Frontend (React + tRPC)
- All backend calls use `trpc.*.useQuery()` or `trpc.*.useMutation()`. Never use `fetch` or `axios` directly.
- Use optimistic updates (`onMutate` / `onError` / `onSettled`) for list operations, toggles, and profile edits.
- Use `trpc.useUtils().feature.invalidate()` in `onSuccess` for critical operations.
- Auth state comes exclusively from `useAuth()`. Never read or write cookies manually.
- All UI components come from `client/src/components/ui/` (shadcn/ui). Do not install new UI libraries without good reason.
- Colors use **OKLCH format** in Tailwind 4 CSS variables (e.g. `oklch(0.55 0.16 265)`). Never use HSL or hex in `index.css` theme variables.
- The app uses a **light theme** (`defaultTheme="light"` in `App.tsx`). The `.light {}` block in `index.css` defines all CSS variables.
- Avoid `useEffect` for data fetching — use tRPC queries instead.
- Never create objects or arrays as inline query inputs (causes infinite re-renders). Use `useState` or `useMemo` to stabilize references.

### Styling
- Tailwind utility classes are preferred over custom CSS.
- Use `cn()` from `client/src/lib/utils.ts` to merge class names conditionally.
- The `.container` class is customized to auto-center with responsive padding — use it directly without `mx-auto px-*`.
- The `button` variant `outline` has a transparent background — add a background class manually if needed.

---

## 9. Next Steps and Goals

The following are the most valuable near-term improvements, in rough priority order:

1. **Configure SMTP and test email delivery end-to-end** — set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and verify that approvers receive the HTML email with working Approve/Reject buttons.

2. **Add approval token expiry check** — in `drafts.approveByToken` and `drafts.rejectByToken`, add a check: `if (draft.approvalTokenExpiry && draft.approvalTokenExpiry < new Date()) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'This approval link has expired.' })`.

3. **Extend document modification to Weight Change and Price Change** — currently only Part Change (manual sub-type) triggers the `compareManuals` pipeline. Weight and price changes have structured old/new values in `skuChanges` that could be used directly to drive `documentModifier` without needing LLM comparison.

4. **Add an audit trail** — add an `approvalHistory` table (draftId, action, actorEmail, notes, timestamp) and surface it as a collapsible timeline on the Draft Review page.

5. **Bulk approval routing** — add a "Route All Drafts" button on `ChangeDetail.tsx` that loops through all `pending_review` drafts for a change event and routes them to a single approver email in one action.

6. **Notify document owners automatically** — when a draft is generated for a document, use the document's `owner` field to look up the responsible person and send them a notification.

7. **Replace Manus LLM/Storage with standard APIs** — to run fully independently of the Manus platform, replace `server/_core/llm.ts` with the OpenAI SDK and `server/storage.ts` with direct AWS S3 SDK calls.

8. **Add more change types to the wizard** — the schema supports 8 change type categories (hardware, process, material, packaging, supplier, regulatory, safety, maintenance) but the UI wizard currently only exposes 3 (part_change, weight_change, price_change). The remaining types need wizard forms.

---

## 10. Additional Notes for AI Assistants

### The Four-Step Workflow
Every change event moves through exactly four steps, each corresponding to a page:

```
Step 1: NewChange.tsx        → creates changeEvent + changeAssets + skuChanges
Step 2: ChangeDetail.tsx     → runs analyzeImpact, shows impactAnalyses
Step 3: ChangeDetail.tsx     → runs generateDrafts, shows documentDrafts list
Step 4: DraftReview.tsx      → shows one draft at a time with split-view comparison
```

The `changeEvents.status` enum tracks overall progress: `draft → analyzing → analysis_complete → generating_drafts → pending_approval → approved/rejected`.

### The Document Modification Pipeline
This is the most complex part of the system. When `generateDrafts` is called:

1. `manualComparison.ts` → `compareManuals(oldFileUrl, newFileUrl)` — downloads both files, extracts text, asks LLM to produce a `ChangeEntry[]` (field name, old value, new value).
2. For each impacted document, `routers.ts` calls `invokeLLM` with the document content + change entries to get a `DocumentChange[]` (cellRef, sheetName, oldValue, newValue).
3. `documentModifier.ts` → `modifyDocument(fileUrl, changes)` — downloads the original file, applies changes cell by cell (Excel) or text replacement (PDF), highlights changed cells in yellow (Excel), uploads the result to S3, returns `{ modifiedFileUrl, changeLog }`.
4. The `changeLog` JSON array is stored in `documentDrafts.changeLog` and rendered by `ChangeAnnotationPanel` in `DraftReview.tsx`.

### Key Relationships in the Database
```
changeEvents (1) → (many) changeAssets       [uploaded files]
changeEvents (1) → (many) skuChanges         [old/new value pairs]
changeEvents (1) → (many) impactAnalyses     [one per document in library]
impactAnalyses (1) → (1) documentDrafts      [one draft per impacted doc]
documentDrafts → documents                   [the library document being updated]
```

### The Sample Documents Repository
The Document Library is populated by importing from `marshad18/change-flow` on GitHub. This repo contains 45 sample manufacturing documents in three folders: `equipment-maps/`, `packaging/`, and `safety/`. The import flow is: GitHub API → download file bytes → `storagePut()` → save URL + metadata to `documents` table.

### Authentication
The app uses email/password auth with JWT session cookies. There is no Manus OAuth in the active flow (the OAuth callback route still exists in `server/_core/oauth.ts` for backwards compatibility but is not linked from the UI). The `users.openId` column is nullable and unused for new accounts.

### Running Tests
```bash
pnpm test
```
Tests use Vitest with mocked DB, storage, LLM, and document modifier. They do not require a real database or API keys. All 31 tests must pass before committing changes.

### Adding a New Feature (Checklist)
1. Update `drizzle/schema.ts` if new columns/tables are needed, then run `pnpm db:push`.
2. Add query helpers to `server/db.ts`.
3. Add tRPC procedures to `server/routers.ts` (or a split file under `server/routers/`).
4. Build the UI page in `client/src/pages/` using `trpc.*.useQuery/useMutation`.
5. Register the route in `client/src/App.tsx`.
6. Add/update Vitest tests in `server/changesync.test.ts`.
7. Mark the feature as `[x]` in `todo.md`.
