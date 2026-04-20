/**
 * ApprovalPage — public page (no login required) that approvers land on
 * when they click the link in the approval email.
 *
 * URL format: /approve?token=<hex>&action=approve|reject
 *
 * The page:
 *  1. Reads the token from the URL
 *  2. Fetches draft info via drafts.getByToken (public procedure)
 *  3. Shows the change summary and document details
 *  4. Lets the approver confirm approve or reject (with optional notes)
 *  5. Calls drafts.approveByToken mutation
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Loader2, FileText, AlertCircle,
  ArrowRight, Building2, ClipboardList,
} from "lucide-react";

function getQueryParam(key: string): string {
  const params = new URLSearchParams(window.location.search);
  return params.get(key) ?? "";
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

  // Auto-confirm if action is in URL (direct email button click)
  useEffect(() => {
    if (!initialAction || !data || confirmed) return;
    if (data.draft.status === "approved" || data.draft.status === "rejected") {
      setConfirmed(true);
      setConfirmedStatus(data.draft.status as "approved" | "rejected");
    }
  }, [data, initialAction, confirmed]);

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

  // ── Already actioned ──────────────────────────────────────────────────────────
  const alreadyDone = confirmed || draft.status === "approved" || draft.status === "rejected";
  const finalStatus = confirmedStatus ?? (draft.status as "approved" | "rejected" | null);

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.97 0.004 250)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10"
        style={{ background: "oklch(1 0 0 / 0.96)", borderBottom: "1px solid oklch(0.88 0.008 255)", backdropFilter: "blur(12px)" }}
      >
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, oklch(0.30 0.16 265), oklch(0.25 0.14 275))" }}
            >
              <ClipboardList className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">ChangeSync</p>
              <p className="text-xs text-muted-foreground">Document Approval Request</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => setLocation("/")}
          >
            <ArrowRight className="h-3.5 w-3.5" /> Open ChangeSync
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">

        {/* ── Change summary card ── */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 4px oklch(0.18 0.020 255 / 0.06)" }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "oklch(0.38 0.16 265 / 0.10)", border: "1px solid oklch(0.38 0.16 265 / 0.20)" }}
            >
              <FileText className="h-5 w-5" style={{ color: "oklch(0.45 0.18 265)" }} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Approval Required</p>
              <h1 className="text-xl font-bold text-foreground">{event?.title ?? "Change Event"}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Document: <span className="font-semibold text-foreground">{doc?.name ?? `Document #${draft.documentId}`}</span>
              </p>
            </div>
          </div>

          {/* Document metadata */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {doc?.code && (
              <span className="text-xs px-2.5 py-1 rounded-lg font-mono font-medium" style={{ background: "oklch(0.94 0.008 255)", border: "1px solid oklch(0.86 0.010 255)", color: "oklch(0.40 0.04 255)" }}>
                {doc.code}
              </span>
            )}
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
          </div>
        </div>

        {/* ── Change details table ── */}
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

        {/* ── View document link ── */}
        {doc?.fileUrl && (
          <div
            className="flex items-center justify-between rounded-xl px-5 py-3"
            style={{ background: "oklch(0.38 0.16 265 / 0.05)", border: "1px solid oklch(0.38 0.16 265 / 0.20)" }}
          >
            <p className="text-sm text-foreground font-medium">View the full document comparison</p>
            <a
              href={`/drafts/${draft.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
              style={{ color: "oklch(0.45 0.18 265)" }}
            >
              Open in ChangeSync <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {/* ── Action area ── */}
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
                Review the change details above, then approve or reject this document update.
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

            {/* Auto-confirm if action was in URL */}
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
