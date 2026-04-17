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
  FileText, Edit3, Eye, Save, Columns2, LayoutTemplate, Send,
  User,
} from "lucide-react";
import ChangeProgressStepper from "@/components/ChangeProgressStepper";

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
      toast.success("Draft approved and routed!");
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
    try {
      await routeMutation.mutateAsync({
        id,
        approverName: approverName.trim() || undefined,
        reviewNotes: reviewNotes.trim() || undefined,
      });
      await refetch();
      toast.success(approverName.trim() ? `Routed to ${approverName} for approval!` : "Routed for approval!");
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

  const { draft, document: doc } = data;
  const status = draft.status ?? "pending_review";
  const isActionable = status === "pending_review" || status === "revision_requested";
  const isRouted = status === "routed_for_approval";

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
          <div className="h-4 w-px" style={{ background: "oklch(0.25 0.020 255)" }} />
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
                ? { background: "oklch(0.58 0.22 260)", color: "white" }
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
                ? { background: "oklch(0.58 0.22 260)", color: "white" }
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

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

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
              style={{ background: "oklch(0.58 0.22 260 / 0.10)", border: "1px solid oklch(0.58 0.22 260 / 0.25)", color: "oklch(0.72 0.18 260)" }}
            >
              <Eye className="h-3.5 w-3.5" /> View Original File
            </a>
          )}
        </div>

        {/* ── Content Area ── */}
        {viewMode === "split" ? (
          <div className="grid grid-cols-2 gap-4 min-h-[500px]">
            {/* Left: Original Document */}
            <div
              className="rounded-2xl overflow-hidden flex flex-col"
              style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
            >
              <div
                className="flex items-center justify-between px-5 py-3.5 shrink-0"
                style={{ borderBottom: "1px solid oklch(0.88 0.008 255)", background: "oklch(0.975 0.004 250)" }}
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  Original Document
                </span>
                {doc?.fileUrl && (
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs flex items-center gap-1 transition-colors"
                    style={{ color: "oklch(0.65 0.18 260)" }}
                  >
                    <Eye className="h-3 w-3" /> Open
                  </a>
                )}
              </div>
              <div className="flex-1 p-8 flex flex-col items-center justify-center">
                {doc?.fileUrl ? (
                  <>
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                      style={{ background: "oklch(0.16 0.022 255)", border: "1px solid oklch(0.22 0.020 255)" }}
                    >
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-semibold text-foreground mb-1">{doc.name}</p>
                    {doc.owner && (
                      <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1">
                        <User className="h-3 w-3" /> Owned by {doc.owner}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground text-center mb-6 max-w-xs leading-relaxed">
                      The original document is stored in the Document Library. Open it to compare with the AI-generated changes on the right.
                    </p>
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Eye className="h-4 w-4" /> Open Original Document
                      </Button>
                    </a>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No original document on file.</p>
                )}
              </div>
            </div>

            {/* Right: AI-Generated Draft */}
            <div
              className="rounded-2xl overflow-hidden flex flex-col"
              style={{
                background: "oklch(1 0 0)",
                border: "1px solid oklch(0.58 0.22 260 / 0.25)",
              }}
            >
              <div
                className="flex items-center justify-between px-5 py-3.5 shrink-0"
                style={{
                  borderBottom: "1px solid oklch(0.58 0.22 260 / 0.15)",
                  background: "oklch(0.58 0.22 260 / 0.06)",
                }}
              >
                <span className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2" style={{ color: "oklch(0.72 0.18 260)" }}>
                  <Edit3 className="h-3.5 w-3.5" />
                  AI-Generated Changes
                </span>
                {isActionable && !isEditing && (
                  <Button size="sm" variant="outline" onClick={handleStartEdit} className="gap-1.5 text-xs">
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
                {isEditing && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="text-xs">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit} className="gap-1.5 text-xs">
                      {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex-1 p-6 overflow-auto max-h-[600px]">
                {isEditing ? (
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    rows={25}
                    className="font-mono text-sm resize-none w-full h-full bg-background border-border text-foreground placeholder:text-muted-foreground/50"
                  />
                ) : (
                  <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80 prose-strong:text-foreground prose-invert">
                    <Streamdown>{draft.draftContent ?? "No content generated."}</Streamdown>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Single view */
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleStartEdit}
                    className="gap-1.5 text-xs"
                    disabled={!isActionable}
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="text-xs">
                      Cancel
                    </Button>
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
                <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80 prose-strong:text-foreground prose-invert">
                  <Streamdown>{draft.draftContent ?? "No content generated."}</Streamdown>
                </div>
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
              <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.58 0.22 260)" }} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Review Decision</p>
            </div>

            {/* Route for approval — approver name */}
            <div className="space-y-2">
              <Label htmlFor="approverName" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Route to Approver{" "}
                <span className="text-muted-foreground/60 normal-case font-normal">(optional — enter the document owner's name)</span>
              </Label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    id="approverName"
                    type="text"
                    placeholder={doc?.owner ? `e.g., ${doc.owner}` : "e.g., John Smith — Maintenance Lead"}
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2"
                    style={{
                      background: "oklch(0.975 0.004 250)",
                      border: "1px solid oklch(0.25 0.022 255)",
                    }}
                  />
                </div>
                <Button
                  onClick={handleRouteForApproval}
                  disabled={routeMutation.isPending}
                  className="gap-2 shrink-0"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.42 0.18 265), oklch(0.36 0.16 275))",
                    border: "none",
                    boxShadow: "0 4px 12px oklch(0.42 0.18 265 / 0.25)",
                  }}
                >
                  {routeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Route for Approval
                </Button>
              </div>
              {doc?.owner && (
                <p className="text-xs text-muted-foreground">
                  Suggested approver based on document owner: <span className="text-foreground">{doc.owner}</span>
                </p>
              )}
            </div>

            <div className="pt-4 space-y-3" style={{ borderTop: "1px solid oklch(0.18 0.020 255)" }}>
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
                  background: "linear-gradient(135deg, oklch(0.55 0.18 145), oklch(0.48 0.16 155))",
                  border: "none",
                  boxShadow: "0 4px 12px oklch(0.55 0.18 145 / 0.3)",
                }}
              >
                {approveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                onClick={handleRequestRevision}
                disabled={revisionMutation.isPending}
                variant="outline"
                className="gap-2"
                style={{ borderColor: "oklch(0.75 0.18 85 / 0.40)", color: "oklch(0.80 0.16 85)" }}
              >
                {revisionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                Request Revision
              </Button>
              <Button
                onClick={handleReject}
                disabled={rejectMutation.isPending}
                variant="outline"
                className="gap-2"
                style={{ borderColor: "oklch(0.55 0.22 25 / 0.40)", color: "oklch(0.65 0.20 25)" }}
              >
                {rejectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </Button>
            </div>
          </div>
        )}

        {/* ── Routed for Approval Status ── */}
        {isRouted && (
          <div
            className="rounded-2xl p-5"
            style={{ background: "oklch(0.58 0.22 260 / 0.06)", border: "1px solid oklch(0.58 0.22 260 / 0.25)" }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "oklch(0.58 0.22 260 / 0.15)" }}
              >
                <Send className="h-5 w-5" style={{ color: "oklch(0.72 0.18 260)" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: "oklch(0.72 0.18 260)" }}>Routed for Approval</p>
                {draft.reviewNotes && (
                  <p className="text-xs text-muted-foreground mt-1">{draft.reviewNotes}</p>
                )}
                <div className="flex gap-2 mt-4">
                  <Button
                    size="sm"
                    onClick={handleApprove}
                    disabled={approveMutation.isPending}
                    className="gap-1.5 text-xs"
                    style={{
                      background: "linear-gradient(135deg, oklch(0.55 0.18 145), oklch(0.48 0.16 155))",
                      border: "none",
                    }}
                  >
                    {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReject}
                    disabled={rejectMutation.isPending}
                    className="gap-1.5 text-xs"
                    style={{ borderColor: "oklch(0.55 0.22 25 / 0.40)", color: "oklch(0.65 0.20 25)" }}
                  >
                    {rejectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Final Status ── */}
        {!isActionable && !isRouted && (
          <div
            className="rounded-2xl p-5"
            style={
              status === "approved"
                ? { background: "oklch(0.65 0.18 145 / 0.06)", border: "1px solid oklch(0.65 0.18 145 / 0.25)" }
                : { background: "oklch(0.55 0.22 25 / 0.06)", border: "1px solid oklch(0.55 0.22 25 / 0.25)" }
            }
          >
            <div className="flex items-center gap-3">
              {status === "approved" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "oklch(0.65 0.18 145)" }} />
              ) : (
                <XCircle className="h-5 w-5 shrink-0" style={{ color: "oklch(0.65 0.20 25)" }} />
              )}
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: status === "approved" ? "oklch(0.65 0.18 145)" : "oklch(0.65 0.20 25)" }}
                >
                  {status === "approved" ? "Draft Approved & Routed" : "Draft Rejected"}
                </p>
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
