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
  FileText, Edit3, Eye, Save, Columns2, LayoutTemplate,
} from "lucide-react";

export default function DraftReview() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);
  const [, setLocation] = useLocation();

  const [reviewNotes, setReviewNotes] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [viewMode, setViewMode] = useState<"single" | "split">("single");

  const { data, isLoading, refetch } = trpc.drafts.getById.useQuery({ id }, { enabled: !!id });
  const approveMutation = trpc.drafts.approve.useMutation();
  const rejectMutation = trpc.drafts.reject.useMutation();
  const revisionMutation = trpc.drafts.requestRevision.useMutation();
  const updateContentMutation = trpc.drafts.updateContent.useMutation();

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
        <Button onClick={() => setLocation("/")} variant="outline" className="mt-4">Back to Dashboard</Button>
      </div>
    );
  }

  const { draft, document: doc } = data;
  const status = draft.status ?? "pending_review";
  const isActionable = status === "pending_review" || status === "revision_requested";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => history.back()} className="text-muted-foreground hover:text-foreground transition-colors mt-1">
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
          <p className="text-sm text-muted-foreground">
            AI-generated draft — review and approve, request revision, or reject.
          </p>
        </div>
        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 shrink-0">
          <button
            onClick={() => setViewMode("single")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${viewMode === "single" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            Single
          </button>
          <button
            onClick={() => setViewMode("split")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${viewMode === "split" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Columns2 className="h-3.5 w-3.5" />
            Split View
          </button>
        </div>
      </div>

      {/* Document metadata */}
      {doc && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          {doc.code && <span className="px-2 py-0.5 rounded bg-secondary border border-border font-mono">{doc.code}</span>}
          {doc.category && <span>Category: <span className="text-foreground/70">{doc.category}</span></span>}
          {doc.owner && <span>Owner: <span className="text-foreground/70">{doc.owner}</span></span>}
          {doc.fileUrl && (
            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
              <Eye className="h-3.5 w-3.5" /> View Original Document
            </a>
          )}
        </div>
      )}

      {/* Content area — single or split */}
      {viewMode === "split" ? (
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Original */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-secondary/30">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Original Document
              </span>
              {doc?.fileUrl && (
                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Open
                </a>
              )}
            </div>
            <div className="p-6 min-h-64">
              {doc?.fileUrl ? (
                <div className="text-center py-8">
                  <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Original document stored in library.</p>
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Eye className="h-4 w-4" /> Open Original
                    </Button>
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No original document on file.</p>
              )}
            </div>
          </div>

          {/* Right: AI Draft */}
          <div className="bg-card border border-primary/30 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-primary/5">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-primary" />
                AI-Generated Draft
              </span>
              {isActionable && !isEditing && (
                <Button size="sm" variant="outline" onClick={handleStartEdit} className="gap-1.5 text-xs">
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
              {isEditing && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="text-xs">Cancel</Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit} className="gap-1.5 text-xs">
                    {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                </div>
              )}
            </div>
            <div className="p-6 overflow-auto max-h-[600px] scrollbar-thin">
              {isEditing ? (
                <Textarea value={editedContent} onChange={(e) => setEditedContent(e.target.value)} rows={25} className="bg-background border-border font-mono text-sm resize-none w-full" />
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
              <Textarea value={editedContent} onChange={(e) => setEditedContent(e.target.value)} rows={30} className="bg-background border-border font-mono text-sm resize-none w-full" />
            ) : (
              <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80 prose-strong:text-foreground prose-invert">
                <Streamdown>{draft.draftContent ?? "No content generated."}</Streamdown>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approval Actions */}
      {isActionable && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Review Decision
          </h3>
          <div className="space-y-1.5">
            <Label htmlFor="reviewNotes" className="text-xs">Review Notes (optional for approval, required for revision request)</Label>
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
            <Button onClick={handleApprove} disabled={approveMutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Approve
            </Button>
            <Button onClick={handleRequestRevision} disabled={revisionMutation.isPending} variant="outline" className="gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
              {revisionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              Request Revision
            </Button>
            <Button onClick={handleReject} disabled={rejectMutation.isPending} variant="outline" className="gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10">
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* Approved / Rejected state */}
      {!isActionable && (
        <div className={`rounded-xl p-5 border ${status === "approved" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
          <div className="flex items-center gap-3">
            {status === "approved" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : (
              <XCircle className="h-5 w-5 text-red-400" />
            )}
            <div>
              <p className={`text-sm font-semibold ${status === "approved" ? "text-emerald-400" : "text-red-400"}`}>
                {status === "approved" ? "Draft Approved" : "Draft Rejected"}
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
