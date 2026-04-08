import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Zap, FileText, CheckCircle2, XCircle,
  Eye, AlertTriangle, Clock, Weight, DollarSign, Package, Send,
} from "lucide-react";
import { Streamdown } from "streamdown";

// ─── Labels & helpers ─────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  analyzing: "Analyzing…",
  analysis_complete: "Analysis Ready",
  generating_drafts: "Generating Drafts…",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  hardware: "Hardware", process: "Process", material: "Material",
  packaging: "Packaging", supplier: "Supplier", regulatory: "Regulatory",
  safety: "Safety Incident", maintenance: "Maintenance Finding",
  part_change: "Part Change", weight_change: "Weight Change", price_change: "Price Change",
};

const CHANGE_TYPE_ICONS: Record<string, React.ElementType> = {
  part_change: Package,
  weight_change: Weight,
  price_change: DollarSign,
};

function statusClass(status: string) {
  const map: Record<string, string> = {
    draft: "status-draft", analyzing: "status-analyzing",
    analysis_complete: "status-analysis_complete", generating_drafts: "status-generating_drafts",
    pending_approval: "status-pending_approval", approved: "status-approved", rejected: "status-rejected",
  };
  return map[status] ?? "status-draft";
}

function confidenceClass(c: string) {
  return c === "high" ? "confidence-high" : c === "medium" ? "confidence-medium" : "confidence-low";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChangeDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const [expandedAnalysis, setExpandedAnalysis] = useState<number | null>(null);

  const { data, isLoading, refetch } = trpc.changeEvents.getById.useQuery({ id }, { enabled: !!id });
  const analyzeMutation = trpc.changeEvents.analyzeImpact.useMutation();
  const generateMutation = trpc.changeEvents.generateDrafts.useMutation();
  const confirmMutation = trpc.analyses.confirmStatus.useMutation();

  const handleAnalyze = async () => {
    try {
      toast.info("Running AI impact analysis… this may take a minute.");
      await analyzeMutation.mutateAsync({ changeEventId: id });
      await refetch();
      toast.success("Impact analysis complete!");
    } catch {
      toast.error("Analysis failed. Please try again.");
    }
  };

  const handleGenerateDrafts = async () => {
    try {
      toast.info("Generating document drafts… this may take a few minutes.");
      const result = await generateMutation.mutateAsync({ changeEventId: id });
      await refetch();
      toast.success(`${result.draftsCreated} draft(s) generated successfully!`);
    } catch {
      toast.error("Draft generation failed. Please try again.");
    }
  };

  const handleConfirm = async (analysisId: number, status: "confirmed" | "dismissed") => {
    await confirmMutation.mutateAsync({ id: analysisId, status });
    await refetch();
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
        <p className="text-muted-foreground">Change event not found.</p>
        <Button onClick={() => setLocation("/")} variant="outline" className="mt-4">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const { event, assets, skus, analyses, drafts } = data;
  const impactedAnalyses = analyses.filter((a) => a.impacted);
  const notImpactedAnalyses = analyses.filter((a) => !a.impacted);
  const status = event.status ?? "draft";
  const ChangeIcon = CHANGE_TYPE_ICONS[event.changeType] ?? Package;

  const isAnalyzing = analyzeMutation.isPending || status === "analyzing";
  const isGenerating = generateMutation.isPending || status === "generating_drafts";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => setLocation("/")}
          className="text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <h1 className="text-xl font-bold text-foreground">{event.title}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusClass(status)}`}>
              {STATUS_LABELS[status] ?? status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-secondary border border-border">
              <ChangeIcon className="h-3.5 w-3.5" />
              {CHANGE_TYPE_LABELS[event.changeType] ?? event.changeType}
            </span>
            {(event as any).partSubType && (
              <span className="px-2 py-0.5 rounded bg-secondary border border-border capitalize">
                {(event as any).partSubType}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Change Summary Card ── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Parameter changes (weight / price) */}
        {skus.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Parameter Changes</h3>
            <div className="space-y-3">
              {skus.map((sku) => (
                <div key={sku.id} className="flex items-center gap-3">
                  <span className="text-muted-foreground text-sm w-24 shrink-0">{sku.fieldName}</span>
                  <span className="text-sm font-medium text-red-400 line-through">{sku.oldValue ?? "—"}</span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <span className="text-sm font-medium text-emerald-400">{sku.newValue ?? "—"}</span>
                  {sku.unit && <span className="text-xs text-muted-foreground">{sku.unit}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Uploaded assets (part change) */}
        {assets.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Uploaded Files</h3>
            <div className="space-y-2">
              {assets.map((asset) => (
                <a
                  key={asset.id}
                  href={asset.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{asset.fileName}</span>
                  <span className="text-xs text-muted-foreground shrink-0 capitalize">
                    ({asset.assetType.replace("_", " ")})
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {event.textNotes && (
          <div className="bg-card border border-border rounded-xl p-5 md:col-span-2">
            <h3 className="text-sm font-semibold text-foreground mb-2">Change Description</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{event.textNotes}</p>
          </div>
        )}
      </div>

      {/* ── STEP 1: Run Analysis ── */}
      {(status === "draft" || status === "analysis_complete") && analyses.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Zap className="h-7 w-7 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground text-lg mb-2">Step 1 — Run Impact Analysis</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            The AI will scan all documents in your library and identify which ones need to be updated based on this change.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button variant="outline" onClick={() => setLocation("/documents")} className="gap-2">
              <FileText className="h-4 w-4" /> View Document Library
            </Button>
            <Button onClick={handleAnalyze} disabled={isAnalyzing} className="gap-2 min-w-[180px]">
              {isAnalyzing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</>
              ) : (
                <><Zap className="h-4 w-4" /> Run AI Impact Analysis</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Analyzing spinner ── */}
      {isAnalyzing && (
        <div className="bg-card border border-primary/20 rounded-xl p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-foreground font-medium">Analysing impact across all documents…</p>
          <p className="text-xs text-muted-foreground mt-1">This usually takes 15–30 seconds</p>
        </div>
      )}

      {/* ── STEP 2: Impact Analysis Results ── */}
      {analyses.length > 0 && !isGenerating && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">Impact Analysis Results</h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 font-medium">
                {impactedAnalyses.length} impacted
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">
                {notImpactedAnalyses.length} not impacted
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="gap-1.5 text-xs"
            >
              <Zap className="h-3.5 w-3.5" /> Re-Analyse
            </Button>
          </div>

          {/* Documents requiring updates */}
          {impactedAnalyses.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Documents Requiring Updates ({impactedAnalyses.length})
              </h3>
              {impactedAnalyses.map((analysis) => {
                const draft = drafts.find((d) => d.documentId === analysis.documentId);
                const isExpanded = expandedAnalysis === analysis.id;
                return (
                  <div
                    key={analysis.id}
                    className="bg-card border border-amber-500/20 rounded-xl overflow-hidden"
                  >
                    <div className="flex items-start gap-4 p-4">
                      <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm text-foreground">
                            {analysis.documentName ?? `Document #${analysis.documentId}`}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceClass(analysis.confidence ?? "low")}`}>
                            {analysis.confidence} confidence
                          </span>
                          {analysis.status === "confirmed" && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                              Confirmed
                            </span>
                          )}
                          {analysis.status === "dismissed" && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              Dismissed
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{analysis.reasoning}</p>
                        {isExpanded && analysis.impactedSections && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                              Sections to Update
                            </p>
                            <p className="text-sm text-foreground/80 leading-relaxed">
                              {analysis.impactedSections}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {draft && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLocation(`/drafts/${draft.id}`)}
                            className="gap-1.5 text-xs"
                          >
                            <FileText className="h-3.5 w-3.5" /> Review Draft
                          </Button>
                        )}
                        {analysis.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleConfirm(analysis.id, "confirmed")}
                              className="text-emerald-400 hover:text-emerald-300 transition-colors"
                              title="Confirm impact"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleConfirm(analysis.id, "dismissed")}
                              className="text-muted-foreground hover:text-red-400 transition-colors"
                              title="Dismiss"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setExpandedAnalysis(isExpanded ? null : analysis.id)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
                        >
                          {isExpanded ? "Less" : "More"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Documents not impacted */}
          {notImpactedAnalyses.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Documents Not Impacted ({notImpactedAnalyses.length})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {notImpactedAnalyses.map((analysis) => (
                  <div
                    key={analysis.id}
                    className="flex items-center gap-2 p-3 bg-card border border-border rounded-lg text-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span className="text-muted-foreground truncate">
                      {analysis.documentName ?? `Document #${analysis.documentId}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 3: Generate Drafts ── */}
          {impactedAnalyses.length > 0 && drafts.length === 0 && (
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/30 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">
                    Step 2 — Generate Updated Documents
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    The AI will generate updated drafts for the {impactedAnalyses.length} impacted document
                    {impactedAnalyses.length !== 1 ? "s" : ""}. You can then review each one side-by-side with the original before routing for approval.
                  </p>
                  <Button
                    onClick={handleGenerateDrafts}
                    disabled={isGenerating}
                    className="gap-2"
                    size="lg"
                  >
                    {isGenerating ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                    ) : (
                      <><Zap className="h-4 w-4" /> Generate Document Drafts</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Generating spinner ── */}
      {isGenerating && (
        <div className="bg-card border border-primary/20 rounded-xl p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-foreground font-medium">Generating document drafts…</p>
          <p className="text-xs text-muted-foreground mt-1">This usually takes 30–60 seconds</p>
        </div>
      )}

      {/* ── STEP 3: Document Drafts List ── */}
      {drafts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              Document Drafts ({drafts.length})
            </h2>
            <span className="text-xs text-muted-foreground">
              {drafts.filter((d) => d.status === "approved").length} of {drafts.length} approved
            </span>
          </div>

          <div className="space-y-3">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-primary/30 transition-all"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {draft.documentName ?? `Document #${draft.documentId}`}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {(draft.status ?? "pending_review").replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {draft.status === "approved" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  )}
                  {draft.status === "routed_for_approval" && (
                    <Send className="h-4 w-4 text-blue-400" />
                  )}
                  {draft.status === "pending_review" && (
                    <Clock className="h-4 w-4 text-amber-400" />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLocation(`/drafts/${draft.id}`)}
                    className="gap-1.5 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5" /> Review &amp; Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* All approved — route for approval CTA */}
          {drafts.every((d) => d.status === "approved") && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 flex items-center gap-4">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">All drafts approved</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All {drafts.length} document drafts have been reviewed and approved.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
