import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { StatusBadge } from "@/components/StatusBadge";
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Progress Stepper ── */}
      <ChangeProgressStepper
        currentStep={4}
        completedSteps={[1, 2, 3]}
      />

      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => history.back()}
          className="text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {doc?.name ?? `Document #${draft.documentId}`}
            </h1>
            <StatusBadge status={status} />
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            {doc?.code && (
              <span className="px-2 py-0.5 rounded bg-secondary border border-border font-mono">
                {doc.code}
              </span>
            )}
            {doc?.category && <span>Category: <span className="text-foreground/70">{doc.category}</span></span>}
            {doc?.owner && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Owner: <span className="text-foreground/70">{doc.owner}</span>
              </span>
            )}
            {doc?.fileUrl && (
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Eye className="h-3.5 w-3.5" /> View Original File
              </a>
            )}
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 shrink-0">
          <button
            onClick={() => setViewMode("single")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              viewMode === "single" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            Single
          </button>
          <button
            onClick={() => setViewMode("split")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              viewMode === "split" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" />
            Split View
          </button>
        </div>
      </div>

      {/* ── Content Area ── */}
      {viewMode === "split" ? (
        <div className="grid grid-cols-2 gap-4 min-h-[500px]">
          {/* Left: Original Document */}
          <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-secondary/30 shrink-0">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Original Document
              </span>
              {doc?.fileUrl && (
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Eye className="h-3 w-3" /> Open
                </a>
              )}
            </div>
            <div className="flex-1 p-6 flex flex-col items-center justify-center">
              {doc?.fileUrl ? (
                <>
                  <div className="w-16 h-16 rounded-xl bg-secondary/50 flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">{doc.name}</p>
                  {doc.owner && (
                    <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1">
                      <User className="h-3 w-3" /> Owned by {doc.owner}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground text-center mb-5 max-w-xs">
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
          <div className="bg-card border border-primary/30 rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-primary/5 shrink-0">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-primary" />
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
                  className="bg-background border-border font-mono text-sm resize-none w-full h-full"
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
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">AI-Generated Draft</span>
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
                className="bg-background border-border font-mono text-sm resize-none w-full"
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
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Review Decision
          </h3>

          {/* Route for approval — approver name */}
          <div className="space-y-2">
            <Label htmlFor="approverName" className="text-xs">
              Route to Approver{" "}
              <span className="text-muted-foreground font-normal">(optional — enter the document owner's name)</span>
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
                  className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <Button
                onClick={handleRouteForApproval}
                disabled={approveMutation.isPending}
                className="gap-2 bg-primary shrink-0"
              >
                {approveMutation.isPending ? (
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

          <div className="border-t border-border pt-4 space-y-3">
            <Label htmlFor="reviewNotes" className="text-xs">
              Review Notes{" "}
              <span className="text-muted-foreground font-normal">
                (optional for approval, required for revision request)
              </span>
            </Label>
            <Textarea
              id="reviewNotes"
              placeholder="Add any comments, corrections, or instructions for revision…"
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={3}
              className="bg-background border-border resize-none text-sm"
            />
          </div>

          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={handleApprove}
              disabled={approveMutation.isPending}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
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
              className="gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
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
              className="gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10"
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
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <Send className="h-5 w-5 text-blue-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-400">Routed for Approval</p>
              {draft.reviewNotes && (
                <p className="text-xs text-muted-foreground mt-0.5">{draft.reviewNotes}</p>
              )}
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                >
                  {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReject}
                  disabled={rejectMutation.isPending}
                  className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs"
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
          className={`rounded-xl p-5 border ${
            status === "approved"
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}
        >
          <div className="flex items-center gap-3">
            {status === "approved" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-red-400 shrink-0" />
            )}
            <div>
              <p
                className={`text-sm font-semibold ${
                  status === "approved" ? "text-emerald-400" : "text-red-400"
                }`}
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
  );
}
