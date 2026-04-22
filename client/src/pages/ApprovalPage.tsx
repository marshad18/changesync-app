/**
 * ApprovalPage — public page (no login required) that approvers land on
 * when they click the link in the approval email.
 *
 * URL format: /approve?token=<hex>
 *
 * Layout:
 *  1. Header (ChangeSync branding + change summary)
 *  2. Full-width split panel: LEFT = original doc (yellow highlights), RIGHT = modified doc (green highlights)
 *  3. Change log table (what changed)
 *  4. Approve / Reject form with notes — all on the same page, no separate clicks
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Loader2, FileText, AlertCircle,
  ArrowRight, Building2, Download,
} from "lucide-react";

function getQueryParam(key: string): string {
  const params = new URLSearchParams(window.location.search);
  return params.get(key) ?? "";
}

/** Render a document URL in an iframe (PDF/Word) or as an image */
function DocPanel({
  url,
  label,
  badge,
  badgeColor,
  fileName,
}: {
  url: string | null | undefined;
  label: string;
  badge: string;
  badgeColor: string;
  fileName?: string | null;
}) {
  if (!url) {
    return (
      <div className="flex flex-col h-full">
        <div
          className="flex items-center justify-between px-4 py-2.5 shrink-0"
          style={{ background: "oklch(0.975 0.004 250)", borderBottom: "1px solid oklch(0.88 0.008 255)" }}
        >
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: badgeColor, color: "#fff" }}>
            {badge}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center" style={{ background: "oklch(0.97 0.004 250)" }}>
          <div className="text-center space-y-2">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
            <p className="text-xs text-muted-foreground">Document not yet generated</p>
          </div>
        </div>
      </div>
    );
  }

  const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(url);
  const isWord = /\.(docx|doc)$/i.test(url) || (fileName && /\.(docx|doc)$/i.test(fileName));

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 shrink-0 gap-2"
        style={{ background: "oklch(0.975 0.004 250)", borderBottom: "1px solid oklch(0.88 0.008 255)" }}
      >
        <p className="text-xs font-semibold text-foreground truncate">{label}</p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white" style={{ background: badgeColor }}>
            {badge}
          </span>
          <a
            href={url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: "oklch(0.45 0.18 265)" }}
            title="Download this document"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Document viewer */}
      <div className="flex-1 overflow-hidden" style={{ background: "oklch(0.94 0.006 255)" }}>
        {isImage ? (
          <img src={url} alt={label} className="w-full h-full object-contain p-4" />
        ) : isWord ? (
          /* Word docs: show download prompt since browsers can't render .docx inline */
          <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
            <FileText className="h-12 w-12 text-muted-foreground opacity-50" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Word Document</p>
              <p className="text-xs text-muted-foreground">Download to view the {badge.toLowerCase()} version</p>
            </div>
            <a
              href={url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: badgeColor }}
            >
              <Download className="h-4 w-4" />
              Download {badge} Version
            </a>
          </div>
        ) : (
          <iframe
            src={url}
            className="w-full h-full border-0"
            title={label}
            sandbox="allow-same-origin allow-scripts allow-popups"
          />
        )}
      </div>
    </div>
  );
}

export default function ApprovalPage() {
  const [, setLocation] = useLocation();
  const [token] = useState(() => getQueryParam("token"));
  const [initialAction] = useState(() => getQueryParam("action") as "approve" | "reject" | "");
  const [reviewNotes, setReviewNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedStatus, setConfirmedStatus] = useState<"approved" | "rejected" | null>(null);

  const { data, isLoading, error } = trpc.drafts.getByToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );
  const approveMutation = trpc.drafts.approveByToken.useMutation();

  // Mark as already-done if draft was already actioned
  useEffect(() => {
    if (!data || confirmed) return;
    if (data.draft.status === "approved" || data.draft.status === "rejected") {
      setConfirmed(true);
      setConfirmedStatus(data.draft.status as "approved" | "rejected");
    }
  }, [data, confirmed]);

  const handleAction = async (action: "approve" | "reject") => {
    try {
      const result = await approveMutation.mutateAsync({ token, action, reviewNotes: reviewNotes.trim() || undefined });
      setConfirmed(true);
      setConfirmedStatus(action === "approve" ? "approved" : "rejected");
      if (result.alreadyActioned) {
        toast.info(`This document was already ${result.status}.`);
      } else {
        toast.success(action === "approve" ? "Document approved!" : "Document rejected.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Action failed. Please try again.");
    }
  };

  // ── No token ──────────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.97 0.004 250)" }}>
        <div className="text-center space-y-4 max-w-sm">
          <AlertCircle className="h-12 w-12 mx-auto" style={{ color: "oklch(0.55 0.18 25)" }} />
          <h1 className="text-xl font-semibold text-foreground">Invalid Link</h1>
          <p className="text-sm text-muted-foreground">This approval link is missing a token. Please check the email and click the link again.</p>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.97 0.004 250)" }}>
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto" style={{ color: "oklch(0.45 0.18 265)" }} />
          <p className="text-sm text-muted-foreground">Loading approval request…</p>
        </div>
      </div>
    );
  }

  // ── Error / not found ─────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.97 0.004 250)" }}>
        <div className="text-center space-y-4 max-w-sm">
          <AlertCircle className="h-12 w-12 mx-auto" style={{ color: "oklch(0.55 0.18 25)" }} />
          <h1 className="text-xl font-semibold text-foreground">Link Not Found</h1>
          <p className="text-sm text-muted-foreground">
            {error?.message ?? "This approval link is invalid or has expired. Please contact the person who sent it."}
          </p>
        </div>
      </div>
    );
  }

  const { draft, document: doc, event } = data;

  // Parse change log
  const changeLog: Array<{ fieldName?: string; oldValue?: string; newValue?: string; cellRef?: string; sheetName?: string }> = (() => {
    try { return JSON.parse(draft.changeLog ?? "[]"); } catch { return []; }
  })();

  const alreadyDone = confirmed || draft.status === "approved" || draft.status === "rejected";
  const finalStatus = confirmedStatus ?? (draft.status as "approved" | "rejected" | null);

  // Determine document URLs
  const originalDocUrl = (draft as Record<string, unknown>).annotatedOriginalUrl as string | null ?? doc?.fileUrl ?? null;
  const modifiedDocUrl = (draft as Record<string, unknown>).modifiedFileUrl as string | null ?? null;
  const cleanDownloadUrl = (draft as Record<string, unknown>).cleanModifiedUrl as string | null ?? modifiedDocUrl;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "oklch(0.97 0.004 250)" }}>

      {/* ── Sticky header ── */}
      <div
        className="sticky top-0 z-20 shrink-0"
        style={{ background: "oklch(1 0 0 / 0.97)", borderBottom: "1px solid oklch(0.88 0.008 255)", backdropFilter: "blur(12px)" }}
      >
        <div className="px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, oklch(0.30 0.16 265), oklch(0.25 0.14 275))" }}
            >
              <FileText className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">
                {event?.title ?? "Change Event"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                Approval required — {doc?.name ?? `Document #${draft.documentId}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {doc?.code && (
              <span className="hidden sm:inline text-xs px-2 py-0.5 rounded font-mono" style={{ background: "oklch(0.94 0.008 255)", color: "oklch(0.40 0.04 255)" }}>
                {doc.code}
              </span>
            )}
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => setLocation("/")}>
              <ArrowRight className="h-3.5 w-3.5" /> Open ChangeSync
            </Button>
          </div>
        </div>
      </div>

      {/* ── Document split panel ── */}
      <div
        className="shrink-0 mx-4 mt-4 rounded-2xl overflow-hidden"
        style={{
          height: "calc(100vh - 200px)",
          minHeight: "480px",
          border: "1px solid oklch(0.88 0.008 255)",
          boxShadow: "0 2px 8px oklch(0.18 0.020 255 / 0.08)",
          background: "oklch(1 0 0)",
        }}
      >
        {/* Split panel header */}
        <div
          className="flex items-center gap-3 px-5 py-3 shrink-0"
          style={{ background: "oklch(0.975 0.004 250)", borderBottom: "1px solid oklch(0.88 0.008 255)" }}
        >
          <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.45 0.18 265)" }} />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Document Comparison
          </p>
          <span className="text-xs text-muted-foreground ml-auto">
            Review both versions before making your decision
          </span>
        </div>

        {/* Two-column split */}
        <div className="flex h-full" style={{ height: "calc(100% - 44px)" }}>
          {/* LEFT: Original with yellow highlights */}
          <div className="flex-1 min-w-0 border-r" style={{ borderColor: "oklch(0.88 0.008 255)" }}>
            <DocPanel
              url={originalDocUrl}
              label={doc?.name ?? "Original Document"}
              badge="ORIGINAL"
              badgeColor="oklch(0.62 0.16 85)"
              fileName={doc?.fileName}
            />
          </div>
          {/* RIGHT: Modified with green highlights */}
          <div className="flex-1 min-w-0">
            <DocPanel
              url={modifiedDocUrl}
              label={doc?.name ?? "Modified Document"}
              badge="MODIFIED"
              badgeColor="oklch(0.50 0.16 145)"
              fileName={doc?.fileName}
            />
          </div>
        </div>
      </div>

      {/* ── Content below split panel ── */}
      <div className="px-4 pb-10 mt-4 space-y-4">

        {/* Change log table */}
        {changeLog.length > 0 && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 4px oklch(0.18 0.020 255 / 0.06)" }}
          >
            <div
              className="flex items-center gap-2 px-5 py-3"
              style={{ background: "oklch(0.975 0.004 250)", borderBottom: "1px solid oklch(0.88 0.008 255)" }}
            >
              <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.75 0.18 85)" }} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                {changeLog.length} Change{changeLog.length !== 1 ? "s" : ""} in This Document
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "oklch(0.97 0.004 250)", borderBottom: "1px solid oklch(0.90 0.006 255)" }}>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Field / Location</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Old Value</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Value</th>
                  </tr>
                </thead>
                <tbody>
                  {changeLog.map((c, i) => (
                    <tr
                      key={i}
                      style={{
                        background: i % 2 === 0 ? "oklch(1 0 0)" : "oklch(0.985 0.002 250)",
                        borderBottom: "1px solid oklch(0.93 0.004 255)",
                      }}
                    >
                      <td className="px-5 py-3 font-medium text-foreground">
                        {c.fieldName ?? (c.sheetName && c.cellRef ? `${c.sheetName}!${c.cellRef}` : c.cellRef ?? "—")}
                      </td>
                      <td className="px-5 py-3" style={{ color: "oklch(0.55 0.16 25)" }}>
                        <span className="line-through opacity-70">{c.oldValue ?? "—"}</span>
                      </td>
                      <td className="px-5 py-3 font-semibold" style={{ color: "oklch(0.42 0.14 145)" }}>
                        {c.newValue ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Document metadata row */}
        <div className="flex items-center gap-2 flex-wrap">
          {doc?.category && (
            <span className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: "oklch(0.94 0.008 255)", border: "1px solid oklch(0.86 0.010 255)", color: "oklch(0.40 0.04 255)" }}>
              {doc.category}
            </span>
          )}
          {doc?.owner && (
            <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: "oklch(0.94 0.008 255)", border: "1px solid oklch(0.86 0.010 255)", color: "oklch(0.40 0.04 255)" }}>
              <Building2 className="h-3 w-3" /> {doc.owner}
            </span>
          )}
          {cleanDownloadUrl && (
            <a
              href={cleanDownloadUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold transition-opacity hover:opacity-70"
              style={{ background: "oklch(0.38 0.16 265 / 0.08)", border: "1px solid oklch(0.38 0.16 265 / 0.25)", color: "oklch(0.45 0.18 265)" }}
            >
              <Download className="h-3 w-3" /> Download Clean Version
            </a>
          )}
        </div>

        {/* ── Decision area ── */}
        {alreadyDone ? (
          <div
            className="rounded-2xl p-8 text-center space-y-3"
            style={{
              background: finalStatus === "approved" ? "oklch(0.95 0.012 145 / 0.3)" : "oklch(0.96 0.012 25 / 0.3)",
              border: `1px solid ${finalStatus === "approved" ? "oklch(0.65 0.18 145 / 0.4)" : "oklch(0.55 0.18 25 / 0.4)"}`,
            }}
          >
            {finalStatus === "approved" ? (
              <CheckCircle2 className="h-12 w-12 mx-auto" style={{ color: "oklch(0.50 0.16 145)" }} />
            ) : (
              <XCircle className="h-12 w-12 mx-auto" style={{ color: "oklch(0.55 0.18 25)" }} />
            )}
            <h2 className="text-xl font-bold text-foreground">
              {finalStatus === "approved" ? "Document Approved" : "Document Rejected"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {finalStatus === "approved"
                ? "Thank you. The document has been approved and the change owner has been notified."
                : "Thank you. The document has been rejected and the change owner has been notified."}
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 4px oklch(0.18 0.020 255 / 0.06)" }}
          >
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Your Decision</p>
              <p className="text-xs text-muted-foreground">
                Review the documents above, then approve or reject this update.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Notes (optional)
              </label>
              <Textarea
                placeholder="Add any comments or reasons for your decision…"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                className="resize-none text-sm bg-background border-border text-foreground placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => handleAction("approve")}
                disabled={approveMutation.isPending}
                size="lg"
                className="flex-1 gap-2"
                style={{
                  background: "linear-gradient(135deg, oklch(0.50 0.16 145), oklch(0.44 0.14 155))",
                  border: "none",
                  boxShadow: "0 4px 12px oklch(0.50 0.16 145 / 0.3)",
                }}
              >
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                Approve Document
              </Button>
              <Button
                onClick={() => handleAction("reject")}
                disabled={approveMutation.isPending}
                size="lg"
                variant="outline"
                className="flex-1 gap-2"
                style={{ borderColor: "oklch(0.75 0.14 25)", color: "oklch(0.50 0.16 25)" }}
              >
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-5 w-5" />}
                Reject Document
              </Button>
            </div>

            {initialAction && !confirmed && (
              <div
                className="rounded-xl p-3 flex items-center gap-3"
                style={{ background: "oklch(0.96 0.012 85 / 0.3)", border: "1px solid oklch(0.75 0.14 85 / 0.4)" }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "oklch(0.55 0.14 75)" }} />
                <p className="text-xs" style={{ color: "oklch(0.45 0.10 75)" }}>
                  You clicked to <strong>{initialAction}</strong> this document. Please confirm your decision using the button above.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
