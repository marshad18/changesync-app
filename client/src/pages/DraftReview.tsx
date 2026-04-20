import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import {
  ArrowLeft, CheckCircle2, XCircle, MessageSquare, Loader2,
  FileText, Edit3, Save, Columns2, LayoutTemplate, Send,
  User, Download, ExternalLink, Sparkles, Table2, AlertCircle,
} from "lucide-react";
import ChangeProgressStepper from "@/components/ChangeProgressStepper";

// ── Change log table: shows each cell/field that was modified ─────────────────
interface CellChange {
  sheetName: string;
  cellRef: string;
  oldValue: string;
  newValue: string;
  rowIndex: number;
  colIndex: number;
}

function ChangeAnnotationPanel({ changeLog }: { changeLog: CellChange[] }) {
  if (!changeLog.length) return null;
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid oklch(0.80 0.10 85 / 0.40)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3"
        style={{
          background: "linear-gradient(135deg, oklch(0.96 0.012 85), oklch(0.98 0.008 75))",
          borderBottom: "1px solid oklch(0.80 0.10 85 / 0.35)",
        }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "oklch(0.88 0.14 85 / 0.60)" }}
        >
          <Table2 className="h-3.5 w-3.5" style={{ color: "oklch(0.55 0.16 75)" }} />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "oklch(0.45 0.14 75)" }}>
          {changeLog.length} Change{changeLog.length !== 1 ? "s" : ""} Applied to This Document
        </span>
        <span
          className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "oklch(0.88 0.14 85 / 0.60)", color: "oklch(0.45 0.14 75)" }}
        >
          Highlighted in yellow above
        </span>
      </div>
      {/* Change cards */}
      <div style={{ background: "oklch(1 0 0)" }}>
        {changeLog.map((c, i) => {
          const location = c.sheetName !== "PDF" && c.sheetName !== "Document"
            ? `${c.sheetName} • Cell ${c.cellRef}`
            : c.cellRef;
          return (
            <div
              key={i}
              className="flex items-stretch"
              style={{ borderBottom: i < changeLog.length - 1 ? "1px solid oklch(0.92 0.006 255)" : "none" }}
            >
              {/* Change number + location */}
              <div
                className="flex flex-col items-center justify-center px-3 py-3 shrink-0 gap-1"
                style={{ background: "oklch(0.97 0.010 85)", borderRight: "1px solid oklch(0.88 0.08 85 / 0.35)", minWidth: "52px" }}
              >
                <span className="text-sm font-black" style={{ color: "oklch(0.55 0.16 75)" }}>#{i + 1}</span>
                <span className="text-[9px] font-mono text-center leading-tight" style={{ color: "oklch(0.60 0.08 75)" }}>
                  {location}
                </span>
              </div>
              {/* Old value */}
              <div
                className="flex flex-col justify-center px-4 py-3 flex-1 gap-0.5"
                style={{ background: "oklch(0.99 0.006 25 / 0.40)", borderRight: "1px solid oklch(0.88 0.06 25 / 0.25)" }}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "oklch(0.65 0.12 25)" }}>Before</span>
                <span
                  className="text-sm font-mono line-through"
                  style={{ color: "oklch(0.55 0.18 25)", textDecorationColor: "oklch(0.65 0.18 25)" }}
                >
                  {c.oldValue || "—"}
                </span>
              </div>
              {/* Arrow */}
              <div className="flex items-center justify-center px-2 shrink-0" style={{ color: "oklch(0.55 0.04 255)" }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M3 10h11M10 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              {/* New value highlighted */}
              <div
                className="flex flex-col justify-center px-4 py-3 flex-1 gap-0.5"
                style={{ background: "oklch(0.96 0.10 85 / 0.35)" }}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "oklch(0.45 0.14 145)" }}>After</span>
                <span
                  className="text-sm font-bold font-mono px-1.5 py-0.5 rounded inline-block"
                  style={{
                    color: "oklch(0.28 0.14 145)",
                    background: "oklch(0.88 0.14 85)",
                    border: "1px solid oklch(0.75 0.16 85 / 0.60)",
                  }}
                >
                  {c.newValue}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Modified file viewer: shows the actual modified Excel/PDF ─────────────────
function ModifiedDocViewer({
  modifiedFileUrl,
  fileName,
  mimeType,
  changeLog,
}: {
  modifiedFileUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
  changeLog: CellChange[];
}) {
  const [pdfError, setPdfError] = useState(false);
  const [officeError, setOfficeError] = useState(false);
  const mime = mimeType ?? "";
  const name = fileName ?? "modified-document";
  const url = modifiedFileUrl.toLowerCase();
  const isPdf = mime.includes("pdf") || url.includes(".pdf");
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(url);
  const isExcel = mime.includes("spreadsheet") || mime.includes("excel") || url.includes(".xlsx") || url.includes(".xls");
  const isWord = mime.includes("word") || mime.includes("msword") || url.includes(".docx") || url.includes(".doc");
  const canUseOfficeViewer = (isExcel || isWord) && !officeError;
  // Microsoft Office Online viewer — renders Excel/Word directly in the browser without any download
  const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(modifiedFileUrl)}`;

  return (
    <div className="flex flex-col h-full">
      {isPdf && !pdfError ? (
        <iframe
          src={`${modifiedFileUrl}#toolbar=1&navpanes=0`}
          title={name}
          className="flex-1 w-full"
          style={{ minHeight: "480px", border: "none" }}
          onError={() => setPdfError(true)}
        />
      ) : isImage ? (
        <div className="flex flex-col items-center justify-center flex-1 p-6 gap-4">
          <img
            src={modifiedFileUrl}
            alt={name}
            className="max-w-full max-h-[480px] rounded-xl object-contain"
            style={{ border: "1px solid oklch(0.88 0.008 255)" }}
          />
          <a href={modifiedFileUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs font-medium transition-colors"
            style={{ color: "oklch(0.55 0.18 260)" }}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open full size
          </a>
        </div>
      ) : canUseOfficeViewer ? (
        <div className="flex flex-col flex-1">
          <iframe
            src={officeViewerUrl}
            title={name}
            className="flex-1 w-full"
            style={{ minHeight: "480px", border: "none" }}
            onError={() => setOfficeError(true)}
            allow="fullscreen"
          />
          <div
            className="flex items-center justify-between px-4 py-2 shrink-0 text-xs text-muted-foreground"
            style={{ borderTop: "1px solid oklch(0.90 0.006 255)" }}
          >
            <span>{changeLog.length} cell{changeLog.length !== 1 ? "s" : ""} updated (highlighted in yellow)</span>
            <a href={modifiedFileUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> Open in new tab
            </a>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 p-8 gap-4">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Preview not available</p>
          <a href={modifiedFileUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2"><ExternalLink className="h-4 w-4" /> Open in new tab</Button>
          </a>
        </div>
      )}
      {/* Change annotation panel below the viewer */}
      {changeLog.length > 0 && (
        <div className="p-4 overflow-y-auto shrink-0" style={{ maxHeight: "320px", borderTop: "1px solid oklch(0.90 0.006 255)" }}>
          <ChangeAnnotationPanel changeLog={changeLog} />
        </div>
      )}
    </div>
  );
}

// ── Helper: decide how to render a file based on its mimeType / URL ──────────
function OriginalDocViewer({ fileUrl, fileName, mimeType }: { fileUrl: string; fileName?: string | null; mimeType?: string | null }) {
  const [pdfError, setPdfError] = useState(false);
  const [officeError, setOfficeError] = useState(false);

  const mime = mimeType ?? "";
  const name = fileName ?? "document";
  const url = fileUrl.toLowerCase();
  const isPdf = mime.includes("pdf") || url.includes(".pdf");
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(url);
  const isExcel = mime.includes("spreadsheet") || mime.includes("excel") || url.includes(".xlsx") || url.includes(".xls");
  const isWord = mime.includes("word") || mime.includes("msword") || url.includes(".docx") || url.includes(".doc");
  const canUseOfficeViewer = (isExcel || isWord) && !officeError;
  const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;

  if (isPdf && !pdfError) {
    return (
      <div className="flex flex-col h-full">
        <iframe
          src={`${fileUrl}#toolbar=1&navpanes=0`}
          title={name}
          className="flex-1 w-full rounded-b-xl"
          style={{ minHeight: "520px", border: "none" }}
          onError={() => setPdfError(true)}
        />
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 gap-4">
        <img
          src={fileUrl}
          alt={name}
          className="max-w-full max-h-[520px] rounded-xl object-contain"
          style={{ border: "1px solid oklch(0.88 0.008 255)" }}
        />
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs font-medium transition-colors"
          style={{ color: "oklch(0.55 0.18 260)" }}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open full size
        </a>
      </div>
    );
  }

  if (canUseOfficeViewer) {
    return (
      <div className="flex flex-col h-full">
        <iframe
          src={officeViewerUrl}
          title={name}
          className="flex-1 w-full"
          style={{ minHeight: "520px", border: "none" }}
          onError={() => setOfficeError(true)}
          allow="fullscreen"
        />
        <div
          className="flex items-center justify-end px-4 py-2 shrink-0 text-xs text-muted-foreground"
          style={{ borderTop: "1px solid oklch(0.90 0.006 255)" }}
        >
          <a href={fileUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" /> Open in new tab
          </a>
        </div>
      </div>
    );
  }

  // Fallback for unsupported types
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-5">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "oklch(0.94 0.008 255)", border: "1px solid oklch(0.86 0.010 255)" }}
      >
        <FileText className="h-8 w-8" style={{ color: "oklch(0.55 0.04 255)" }} />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">{mime || "Document"}</p>
      </div>
      <a href={fileUrl} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm" className="gap-2">
          <ExternalLink className="h-4 w-4" /> Open in new tab
        </Button>
      </a>
    </div>
  );
}

// ── Left panel: ALWAYS shows the Document Library original file ───────────────
function LeftPanelContent({
  doc,
}: {
  doc: { fileUrl?: string | null; fileName?: string | null; mimeType?: string | null; name?: string | null } | null;
}) {
  // The Document Library file is always the source of truth for the left panel.
  // This is the original EOLA 3A document (Lube Map, Safety Map, CPE, etc.) before any changes.
  if (doc?.fileUrl) {
    return (
      <OriginalDocViewer
        fileUrl={doc.fileUrl}
        fileName={doc.fileName ?? doc.name}
        mimeType={doc.mimeType}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "oklch(0.94 0.008 255)", border: "1px solid oklch(0.86 0.010 255)" }}
      >
        <FileText className="h-7 w-7" style={{ color: "oklch(0.65 0.04 255)" }} />
      </div>
      <p className="text-sm text-muted-foreground text-center max-w-xs">
        No original document found. Import this document into the Document Library first.
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DraftReview() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);
  const [, setLocation] = useLocation();

  const [reviewNotes, setReviewNotes] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [viewMode, setViewMode] = useState<"single" | "split">("split");
  const [approverName, setApproverName] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [routeSuccess, setRouteSuccess] = useState<{approvalLink: string; emailSent: boolean} | null>(null);

  const { data, isLoading, refetch } = trpc.drafts.getById.useQuery({ id }, { enabled: !!id });
  const approveMutation = trpc.drafts.approve.useMutation();
  const rejectMutation = trpc.drafts.reject.useMutation();
  const revisionMutation = trpc.drafts.requestRevision.useMutation();
  const updateContentMutation = trpc.drafts.updateContent.useMutation();
  const routeMutation = trpc.drafts.routeForApproval.useMutation();

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync({ id, reviewNotes: reviewNotes || undefined });
      await refetch();
      toast.success("Draft approved!");
    } catch {
      toast.error("Failed to approve. Please try again.");
    }
  };

  const handleReject = async () => {
    try {
      await rejectMutation.mutateAsync({ id, reviewNotes: reviewNotes || undefined });
      await refetch();
      toast.success("Draft rejected.");
    } catch {
      toast.error("Failed to reject. Please try again.");
    }
  };

  const handleRequestRevision = async () => {
    if (!reviewNotes.trim()) {
      toast.error("Please add revision notes before requesting a revision.");
      return;
    }
    try {
      await revisionMutation.mutateAsync({ id, reviewNotes });
      await refetch();
      toast.success("Revision requested.");
    } catch {
      toast.error("Failed to request revision. Please try again.");
    }
  };

  const handleRouteForApproval = async () => {
    if (!approverEmail.trim()) {
      toast.error("Please enter the approver's email address.");
      return;
    }
    try {
      const result = await routeMutation.mutateAsync({
        id,
        approverName: approverName.trim() || undefined,
        approverEmail: approverEmail.trim(),
        reviewNotes: reviewNotes.trim() || undefined,
        origin: window.location.origin,
      });
      await refetch();
      setRouteSuccess({ approvalLink: result.approvalLink, emailSent: result.emailSent });
      if (result.emailSent) {
        toast.success(`Approval email sent to ${approverEmail}!`);
      } else {
        toast.success(`Routed for approval. Copy the link to share with the approver.`);
      }
    } catch {
      toast.error("Failed to route for approval.");
    }
  };

  const handleStartEdit = () => {
    setEditedContent(data?.draft.draftContent ?? "");
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      await updateContentMutation.mutateAsync({ id, content: editedContent });
      await refetch();
      setIsEditing(false);
      toast.success("Draft content updated.");
    } catch {
      toast.error("Failed to save edits.");
    } finally {
      setSavingEdit(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Draft not found.</p>
        <Button onClick={() => setLocation("/")} variant="outline" className="mt-4">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const { draft, document: doc, oldAsset } = data as {
    draft: typeof data.draft;
    document: typeof data.document;
    oldAsset: { fileUrl: string; fileName: string; mimeType?: string | null } | null;
  };

  // Parse the change log from the draft record
  const parsedChangeLog: CellChange[] = (() => {
    try {
      if (draft.changeLog) return JSON.parse(draft.changeLog) as CellChange[];
    } catch { /* ignore */ }
    return [];
  })();

  const hasModifiedFile = !!(draft as { modifiedFileUrl?: string | null }).modifiedFileUrl;
  const modifiedFileUrl = (draft as { modifiedFileUrl?: string | null }).modifiedFileUrl ?? null;
  const status = draft.status ?? "pending_review";
  const isActionable = status === "pending_review" || status === "revision_requested";

  function statusStyle(): React.CSSProperties {
    if (status === "approved") return { background: "oklch(0.95 0.012 145)", color: "oklch(0.38 0.14 145)", border: "1px solid oklch(0.80 0.06 145)" };
    if (status === "rejected") return { background: "oklch(0.96 0.012 25)", color: "oklch(0.42 0.16 25)", border: "1px solid oklch(0.82 0.06 25)" };
    if (status === "routed_for_approval") return { background: "oklch(0.93 0.012 265)", color: "oklch(0.38 0.16 265)", border: "1px solid oklch(0.80 0.015 265)" };
    if (status === "revision_requested") return { background: "oklch(0.96 0.012 85)", color: "oklch(0.42 0.14 75)", border: "1px solid oklch(0.82 0.06 85)" };
    return { background: "oklch(0.94 0.008 255)", color: "oklch(0.35 0.06 255)", border: "1px solid oklch(0.82 0.012 255)" };
  }

  const statusLabel: Record<string, string> = {
    pending_review: "Pending Review",
    revision_requested: "Revision Requested",
    routed_for_approval: "Routed for Approval",
    approved: "Approved",
    rejected: "Rejected",
  };

  // Left panel always shows the Document Library original file
  const leftPanelLabel = doc?.fileName ?? doc?.name ?? "Original Document";

  return (
    <div className="min-h-full bg-background">

      {/* ── Sticky header bar ── */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-8 py-4"
        style={{
          background: "oklch(1 0 0 / 0.96)",
          borderBottom: "1px solid oklch(0.88 0.008 255)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => history.back()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="h-4 w-px" style={{ background: "oklch(0.85 0.008 255)" }} />
          <div>
            <h1 className="text-base font-semibold text-foreground tracking-tight">
              {doc?.name ?? `Document #${draft.documentId}`}
            </h1>
            <p className="text-xs text-muted-foreground">Draft Review</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl"
            style={{ background: "oklch(0.975 0.004 250)", border: "1px solid oklch(0.88 0.008 255)" }}
          >
            <button
              onClick={() => setViewMode("single")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={viewMode === "single"
                ? { background: "oklch(0.38 0.16 265)", color: "white" }
                : { color: "oklch(0.55 0.04 255)" }
              }
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              Single
            </button>
            <button
              onClick={() => setViewMode("split")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={viewMode === "split"
                ? { background: "oklch(0.38 0.16 265)", color: "white" }
                : { color: "oklch(0.55 0.04 255)" }
              }
            >
              <Columns2 className="h-3.5 w-3.5" />
              Split View
            </button>
          </div>
          <span
            className="text-xs px-3 py-1 rounded-full font-semibold"
            style={statusStyle()}
          >
            {statusLabel[status] ?? status}
          </span>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">

        {/* ── Progress Stepper ── */}
        <ChangeProgressStepper currentStep={4} completedSteps={[1, 2, 3]} />

        {/* ── Document metadata bar ── */}
        <div className="flex items-center gap-3 flex-wrap">
          {doc?.code && (
            <span
              className="text-xs px-3 py-1.5 rounded-lg font-mono font-medium"
              style={{ background: "oklch(0.94 0.008 255)", border: "1px solid oklch(0.86 0.010 255)", color: "oklch(0.40 0.04 255)" }}
            >
              {doc.code}
            </span>
          )}
          {doc?.category && (
            <span
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: "oklch(0.94 0.008 255)", border: "1px solid oklch(0.86 0.010 255)", color: "oklch(0.40 0.04 255)" }}
            >
              {doc.category}
            </span>
          )}
          {doc?.owner && (
            <span
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: "oklch(0.94 0.008 255)", border: "1px solid oklch(0.86 0.010 255)", color: "oklch(0.40 0.04 255)" }}
            >
              <User className="h-3 w-3" />
              {doc.owner}
            </span>
          )}
          {doc?.fileUrl && (
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ background: "oklch(0.38 0.16 265 / 0.08)", border: "1px solid oklch(0.38 0.16 265 / 0.20)", color: "oklch(0.45 0.18 265)" }}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open Original
            </a>
          )}
          {modifiedFileUrl && (
            <a
              href={modifiedFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ background: "oklch(0.45 0.12 145 / 0.10)", border: "1px solid oklch(0.45 0.12 145 / 0.30)", color: "oklch(0.40 0.14 145)" }}
            >
              <Download className="h-3.5 w-3.5" /> Download Modified
            </a>
          )}
        </div>

        {/* ── Content Area ── */}
        {viewMode === "split" ? (
          <div className="grid grid-cols-2 gap-4" style={{ minHeight: "620px" }}>

            {/* ── LEFT: Original Document ── */}
            <div
              className="rounded-2xl overflow-hidden flex flex-col"
              style={{
                background: "oklch(1 0 0)",
                border: "1px solid oklch(0.88 0.008 255)",
                boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)",
              }}
            >
              {/* Panel header */}
              <div
                className="flex items-center justify-between px-5 py-3 shrink-0"
                style={{ borderBottom: "1px solid oklch(0.88 0.008 255)", background: "oklch(0.975 0.004 250)" }}
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  Original Document
                </span>
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-md truncate max-w-[200px]"
                  style={{ background: "oklch(0.92 0.006 255)", color: "oklch(0.50 0.04 255)" }}
                  title={leftPanelLabel}
                >
                  {leftPanelLabel}
                </span>
              </div>

              {/* Panel body — inline document viewer */}
              <div className="flex-1 overflow-auto">
                <LeftPanelContent doc={doc ?? null} />
              </div>
            </div>

            {/* ── RIGHT: AI-Generated Draft ── */}
            <div
              className="rounded-2xl overflow-hidden flex flex-col"
              style={{
                background: "oklch(1 0 0)",
                border: "1px solid oklch(0.38 0.16 265 / 0.30)",
                boxShadow: "0 1px 6px oklch(0.38 0.16 265 / 0.08)",
              }}
            >
              {/* Panel header */}
              <div
                className="flex items-center justify-between px-5 py-3 shrink-0"
                style={{
                  borderBottom: "1px solid oklch(0.38 0.16 265 / 0.15)",
                  background: "oklch(0.38 0.16 265 / 0.05)",
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span
                    className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2"
                    style={{ color: "oklch(0.42 0.18 265)" }}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {hasModifiedFile ? "Updated Document" : "AI Change Summary"}
                  </span>
                  {hasModifiedFile && (
                    <span className="text-[10px] text-muted-foreground" style={{ paddingLeft: "18px" }}>
                      Same document as left — only changed values are updated &amp; highlighted in yellow
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasModifiedFile && doc?.fileName && (
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-md truncate max-w-[160px]"
                      style={{ background: "oklch(0.45 0.12 145 / 0.15)", color: "oklch(0.38 0.14 145)" }}
                      title={`Updated: ${doc.fileName}`}
                    >
                      {doc.fileName}
                    </span>
                  )}
                  {isActionable && !isEditing && (
                    <Button size="sm" variant="outline" onClick={handleStartEdit} className="gap-1.5 text-xs h-7">
                      <Edit3 className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                  {isEditing && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="text-xs h-7">
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit} className="gap-1.5 text-xs h-7">
                        {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Change legend */}
              <div
                className="flex items-center gap-4 px-5 py-2 shrink-0 text-[11px] font-medium"
                style={{ borderBottom: "1px solid oklch(0.38 0.16 265 / 0.10)", background: "oklch(0.38 0.16 265 / 0.03)" }}
              >
                {hasModifiedFile ? (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "oklch(0.92 0.14 85)" }} />
                      <span style={{ color: "oklch(0.45 0.10 75)" }}>Yellow cells = changed values</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "oklch(0.94 0.008 255)" }} />
                      <span style={{ color: "oklch(0.55 0.04 255)" }}>White cells = unchanged</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "oklch(0.92 0.08 85)" }} />
                      <span style={{ color: "oklch(0.50 0.06 85)" }}>Updated sections</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "oklch(0.94 0.06 145)" }} />
                      <span style={{ color: "oklch(0.45 0.10 145)" }}>New content</span>
                    </span>
                  </>
                )}
              </div>

              {/* Panel body */}
              <div className="flex-1 overflow-auto" style={{ maxHeight: "700px" }}>
                {hasModifiedFile && modifiedFileUrl && !isEditing ? (
                  /* Show the actual modified file (Excel/PDF) */
                  <ModifiedDocViewer
                    modifiedFileUrl={modifiedFileUrl}
                    fileName={doc?.fileName ?? doc?.name}
                    mimeType={doc?.mimeType}
                    changeLog={parsedChangeLog}
                  />
                ) : !hasModifiedFile && draft.status === "generating" ? (
                  /* Generating state */
                  <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
                    <Loader2 className="h-8 w-8 animate-spin" style={{ color: "oklch(0.55 0.18 265)" }} />
                    <p className="text-sm font-medium" style={{ color: "oklch(0.45 0.12 265)" }}>Generating modified document...</p>
                    <p className="text-xs text-muted-foreground text-center max-w-xs">The AI is editing your original document with the identified changes. This may take a moment.</p>
                  </div>
                ) : isEditing ? (
                  <div className="p-6">
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    rows={25}
                    className="font-mono text-sm resize-none w-full h-full bg-background border-border text-foreground placeholder:text-muted-foreground/50"
                  />
                  </div>
                ) : (
                  <div
                    className="p-6 prose prose-sm max-w-none"
                    style={{
                      "--tw-prose-headings": "oklch(0.25 0.04 255)",
                      "--tw-prose-body": "oklch(0.30 0.02 255)",
                    } as React.CSSProperties}
                  >
                    {/* Inject CSS to highlight AI change markers */}
                    <style>{`
                      .ai-draft-content h2,
                      .ai-draft-content h3 {
                        padding: 6px 10px;
                        border-radius: 6px;
                        background: oklch(0.93 0.012 265 / 0.5);
                        border-left: 3px solid oklch(0.50 0.18 265);
                        color: oklch(0.30 0.12 265);
                        margin-top: 1.2em;
                      }
                      .ai-draft-content h3 {
                        background: oklch(0.94 0.008 85 / 0.5);
                        border-left-color: oklch(0.65 0.14 85);
                        color: oklch(0.38 0.10 75);
                      }
                      .ai-draft-content ul,
                      .ai-draft-content ol {
                        background: oklch(0.975 0.004 250);
                        border-radius: 8px;
                        padding: 10px 10px 10px 28px;
                        border: 1px solid oklch(0.90 0.006 255);
                      }
                      .ai-draft-content strong {
                        color: oklch(0.28 0.06 265);
                        background: oklch(0.92 0.012 265 / 0.4);
                        padding: 1px 4px;
                        border-radius: 3px;
                      }
                      .ai-draft-content blockquote {
                        border-left: 3px solid oklch(0.55 0.18 145);
                        background: oklch(0.96 0.012 145 / 0.5);
                        border-radius: 0 6px 6px 0;
                        color: oklch(0.35 0.10 145);
                        padding: 8px 12px;
                      }
                      .ai-draft-content code {
                        background: oklch(0.94 0.008 255);
                        border: 1px solid oklch(0.88 0.008 255);
                        border-radius: 4px;
                        padding: 1px 5px;
                        font-size: 0.85em;
                        color: oklch(0.38 0.08 265);
                      }
                      .ai-draft-content p {
                        color: oklch(0.28 0.02 255);
                        line-height: 1.7;
                      }
                    `}</style>
                    <div className="ai-draft-content">
                      <Streamdown>{draft.draftContent ?? "No content generated."}</Streamdown>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── Single view ── */
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
          >
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid oklch(0.88 0.008 255)", background: "oklch(0.975 0.004 250)" }}
            >
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">AI-Generated Draft</span>
              <div className="flex items-center gap-2">
                {!isEditing ? (
                  <Button size="sm" variant="outline" onClick={handleStartEdit} className="gap-1.5 text-xs" disabled={!isActionable}>
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="text-xs">Cancel</Button>
                    <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit} className="gap-1.5 text-xs">
                      {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="p-6">
              {isEditing ? (
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  rows={30}
                  className="font-mono text-sm resize-none w-full bg-background border-border text-foreground placeholder:text-muted-foreground/50"
                />
              ) : (
                <>
                  <style>{`
                    .ai-draft-single h2, .ai-draft-single h3 {
                      padding: 6px 10px; border-radius: 6px;
                      background: oklch(0.93 0.012 265 / 0.5);
                      border-left: 3px solid oklch(0.50 0.18 265);
                      color: oklch(0.30 0.12 265); margin-top: 1.2em;
                    }
                    .ai-draft-single h3 {
                      background: oklch(0.94 0.008 85 / 0.5);
                      border-left-color: oklch(0.65 0.14 85); color: oklch(0.38 0.10 75);
                    }
                    .ai-draft-single strong {
                      color: oklch(0.28 0.06 265);
                      background: oklch(0.92 0.012 265 / 0.4);
                      padding: 1px 4px; border-radius: 3px;
                    }
                    .ai-draft-single p { color: oklch(0.28 0.02 255); line-height: 1.7; }
                  `}</style>
                  <div className="ai-draft-single prose prose-sm max-w-none">
                    <Streamdown>{draft.draftContent ?? "No content generated."}</Streamdown>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Review & Approval Actions ── */}
        {isActionable && (
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
          >
            <div className="flex items-center gap-2">
              <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.38 0.16 265)" }} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Review Decision</p>
            </div>

            {/* Route for approval */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Send for Approval via Email</Label>
                <p className="text-xs text-muted-foreground mt-0.5">The approver will receive an email with a direct link to approve or reject this document.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder={doc?.owner ? `e.g., ${doc.owner}` : "Approver name (optional)"}
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2"
                    style={{ background: "oklch(0.975 0.004 250)", border: "1px solid oklch(0.86 0.010 255)" }}
                  />
                </div>
                <div className="relative">
                  <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="approver@company.com (required)"
                    value={approverEmail}
                    onChange={(e) => setApproverEmail(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2"
                    style={{ background: "oklch(0.975 0.004 250)", border: `1px solid ${approverEmail.trim() ? "oklch(0.86 0.010 255)" : "oklch(0.82 0.06 25 / 0.5)"}` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleRouteForApproval}
                  disabled={routeMutation.isPending || !approverEmail.trim()}
                  className="gap-2"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.38 0.16 265), oklch(0.32 0.14 275))",
                    border: "none",
                    boxShadow: "0 4px 12px oklch(0.38 0.16 265 / 0.25)",
                  }}
                >
                  {routeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Approval Request
                </Button>
                {doc?.owner && (
                  <p className="text-xs text-muted-foreground">
                    Suggested approver: <span className="text-foreground font-medium">{doc.owner}</span>
                  </p>
                )}
              </div>
              {/* Show approval link after routing */}
              {routeSuccess && (
                <div
                  className="rounded-xl p-4 space-y-2"
                  style={{ background: "oklch(0.95 0.012 145 / 0.3)", border: "1px solid oklch(0.65 0.18 145 / 0.3)" }}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" style={{ color: "oklch(0.50 0.16 145)" }} />
                    <p className="text-xs font-semibold" style={{ color: "oklch(0.38 0.14 145)" }}>
                      {routeSuccess.emailSent ? `Email sent to ${approverEmail}` : "Routed — copy link to share"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={routeSuccess.approvalLink}
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg font-mono"
                      style={{ background: "oklch(0.975 0.004 250)", border: "1px solid oklch(0.86 0.010 255)", color: "oklch(0.40 0.04 255)" }}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs shrink-0"
                      onClick={() => { navigator.clipboard.writeText(routeSuccess.approvalLink); toast.success("Link copied!"); }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 space-y-3" style={{ borderTop: "1px solid oklch(0.90 0.006 255)" }}>
              <Label htmlFor="reviewNotes" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Review Notes{" "}
                <span className="text-muted-foreground/60 normal-case font-normal">
                  (optional for approval, required for revision request)
                </span>
              </Label>
              <Textarea
                id="reviewNotes"
                placeholder="Add any comments, corrections, or instructions for revision…"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                className="resize-none text-sm bg-background border-border text-foreground placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="flex gap-3 flex-wrap pt-1">
              <Button
                onClick={handleApprove}
                disabled={approveMutation.isPending}
                className="gap-2"
                style={{
                  background: "linear-gradient(135deg, oklch(0.50 0.16 145), oklch(0.44 0.14 155))",
                  border: "none",
                  boxShadow: "0 4px 12px oklch(0.50 0.16 145 / 0.3)",
                }}
              >
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve
              </Button>
              <Button
                onClick={handleRequestRevision}
                disabled={revisionMutation.isPending}
                variant="outline"
                className="gap-2"
              >
                {revisionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                Request Revision
              </Button>
              <Button
                onClick={handleReject}
                disabled={rejectMutation.isPending}
                variant="outline"
                className="gap-2 text-destructive hover:text-destructive"
              >
                {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reject
              </Button>
            </div>
          </div>
        )}

        {/* ── Routed / Approved / Rejected status card ── */}
        {!isActionable && (
          <div
            className="rounded-2xl p-6"
            style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.008 255)" }}
          >
            <div className="flex items-center gap-3">
              {status === "approved" && <CheckCircle2 className="h-5 w-5" style={{ color: "oklch(0.50 0.16 145)" }} />}
              {status === "rejected" && <XCircle className="h-5 w-5" style={{ color: "oklch(0.55 0.18 25)" }} />}
              {status === "routed_for_approval" && <Send className="h-5 w-5" style={{ color: "oklch(0.45 0.16 265)" }} />}
              <div>
                <p className="text-sm font-semibold text-foreground">{statusLabel[status] ?? status}</p>
                {draft.reviewNotes && (
                  <p className="text-xs text-muted-foreground mt-0.5">{draft.reviewNotes}</p>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
