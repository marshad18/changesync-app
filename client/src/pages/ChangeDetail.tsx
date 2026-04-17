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
import ChangeProgressStepper, { WorkflowStep } from "@/components/ChangeProgressStepper";

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

function statusStyle(status: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    draft: { background: "oklch(0.40 0.05 255 / 0.15)", color: "oklch(0.65 0.08 255)", border: "1px solid oklch(0.40 0.05 255 / 0.30)" },
    analyzing: { background: "oklch(0.58 0.22 260 / 0.15)", color: "oklch(0.72 0.18 260)", border: "1px solid oklch(0.58 0.22 260 / 0.30)" },
    analysis_complete: { background: "oklch(0.75 0.18 85 / 0.15)", color: "oklch(0.80 0.16 85)", border: "1px solid oklch(0.75 0.18 85 / 0.30)" },
    generating_drafts: { background: "oklch(0.58 0.22 260 / 0.15)", color: "oklch(0.72 0.18 260)", border: "1px solid oklch(0.58 0.22 260 / 0.30)" },
    pending_approval: { background: "oklch(0.75 0.18 85 / 0.15)", color: "oklch(0.80 0.16 85)", border: "1px solid oklch(0.75 0.18 85 / 0.30)" },
    approved: { background: "oklch(0.65 0.18 145 / 0.15)", color: "oklch(0.70 0.18 145)", border: "1px solid oklch(0.65 0.18 145 / 0.30)" },
    rejected: { background: "oklch(0.55 0.22 25 / 0.15)", color: "oklch(0.65 0.20 25)", border: "1px solid oklch(0.55 0.22 25 / 0.30)" },
  };
  return map[status] ?? map.draft;
}

function confidenceStyle(c: string): React.CSSProperties {
  if (c === "high") return { background: "oklch(0.65 0.18 145 / 0.12)", color: "oklch(0.70 0.18 145)", border: "1px solid oklch(0.65 0.18 145 / 0.25)" };
  if (c === "medium") return { background: "oklch(0.75 0.18 85 / 0.12)", color: "oklch(0.80 0.16 85)", border: "1px solid oklch(0.75 0.18 85 / 0.25)" };
  return { background: "oklch(0.55 0.22 25 / 0.12)", color: "oklch(0.65 0.20 25)", border: "1px solid oklch(0.55 0.22 25 / 0.25)" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChangeDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const [expandedAnalysis, setExpandedAnalysis] = useState<number | null>(null);

  const { data, isLoading, refetch } = trpc.changeEvents.getById.useQuery({ id }, { enabled: !!id });
  const { data: libraryDocs } = trpc.documents.list.useQuery();
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

  // Determine stepper position based on event status
  const stepperStep: WorkflowStep =
    status === "draft" ? 2
    : status === "analyzing" || status === "analysis_complete" ? 2
    : status === "generating_drafts" ? 3
    : drafts.length > 0 ? 4
    : 2;

  const completedSteps: WorkflowStep[] = [];
  if (["analysis_complete", "generating_drafts", "pending_approval", "approved", "rejected"].includes(status)) completedSteps.push(1);
  if (["generating_drafts", "pending_approval", "approved", "rejected"].includes(status) || drafts.length > 0) completedSteps.push(2);
  if (drafts.length > 0 && ["pending_approval", "approved", "rejected"].includes(status)) completedSteps.push(3);

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.09 0.018 255)" }}>

      {/* ── Sticky header bar ── */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-8 py-4"
        style={{
          background: "oklch(0.11 0.020 255 / 0.95)",
          borderBottom: "1px solid oklch(0.20 0.020 255)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="h-4 w-px" style={{ background: "oklch(0.25 0.020 255)" }} />
          <div>
            <h1 className="text-base font-semibold text-foreground tracking-tight">{event.title}</h1>
            <p className="text-xs text-muted-foreground">Impact Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-xs px-3 py-1 rounded-full font-semibold"
            style={statusStyle(status)}
          >
            {STATUS_LABELS[status] ?? status}
          </span>
          {analyses.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="gap-1.5 text-xs"
            >
              <Zap className="h-3.5 w-3.5" /> Re-Analyse
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── Progress Stepper ── */}
        <ChangeProgressStepper currentStep={stepperStep} completedSteps={completedSteps} />

        {/* ── Change metadata row ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: "oklch(0.15 0.022 255)", border: "1px solid oklch(0.22 0.020 255)", color: "oklch(0.75 0.06 255)" }}
          >
            <ChangeIcon className="h-3.5 w-3.5" />
            {CHANGE_TYPE_LABELS[event.changeType] ?? event.changeType}
          </span>
          {(event as any).partSubType && (
            <span
              className="text-xs px-3 py-1.5 rounded-lg font-medium capitalize"
              style={{ background: "oklch(0.15 0.022 255)", border: "1px solid oklch(0.22 0.020 255)", color: "oklch(0.75 0.06 255)" }}
            >
              {(event as any).partSubType}
            </span>
          )}
        </div>

        {/* ── Change Summary Cards ── */}
        <div className="grid md:grid-cols-2 gap-5">
          {/* Parameter changes (weight / price) */}
          {skus.length > 0 && (
            <div
              className="rounded-2xl p-5"
              style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.20 0.020 255)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.75 0.18 85)" }} />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Parameter Changes</p>
              </div>
              <div className="space-y-3">
                {skus.map((sku) => (
                  <div key={sku.id} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: "oklch(0.18 0.020 255)" }}>
                    <span className="text-xs text-muted-foreground w-24 shrink-0 font-medium uppercase tracking-wide">{sku.fieldName}</span>
                    <span className="text-sm font-semibold line-through" style={{ color: "oklch(0.65 0.20 25)" }}>{sku.oldValue ?? "—"}</span>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className="text-sm font-semibold" style={{ color: "oklch(0.65 0.18 145)" }}>{sku.newValue ?? "—"}</span>
                    {sku.unit && <span className="text-xs text-muted-foreground">{sku.unit}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Uploaded assets (part change) */}
          {assets.length > 0 && (
            <div
              className="rounded-2xl p-5"
              style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.20 0.020 255)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.58 0.22 260)" }} />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Uploaded Files</p>
              </div>
              <div className="space-y-2">
                {assets.map((asset) => (
                  <a
                    key={asset.id}
                    href={asset.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm hover:text-foreground transition-colors py-1.5"
                    style={{ color: "oklch(0.65 0.18 260)" }}
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
            <div
              className="rounded-2xl p-5 md:col-span-2"
              style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.20 0.020 255)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.72 0.15 200)" }} />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Change Description</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{event.textNotes}</p>
            </div>
          )}
        </div>

        {/* ── Empty Library Warning ── */}
        {libraryDocs !== undefined && libraryDocs.length === 0 && (status === "draft" || status === "analysis_complete") && (
          <div
            className="flex items-start gap-4 rounded-2xl p-5"
            style={{ background: "oklch(0.75 0.18 85 / 0.06)", border: "1px solid oklch(0.75 0.18 85 / 0.25)" }}
          >
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "oklch(0.80 0.16 85)" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "oklch(0.85 0.12 85)" }}>Document Library is empty</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: "oklch(0.70 0.10 85)" }}>
                No documents have been uploaded yet. The impact analysis needs documents to compare against.
                Import your documents from GitHub or upload them manually before running the analysis.
              </p>
              <button
                onClick={() => setLocation("/documents")}
                className="text-xs underline mt-2 transition-colors"
                style={{ color: "oklch(0.80 0.16 85)" }}
              >
                Go to Document Library →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 1: Run Analysis (no results yet) ── */}
        {(status === "draft" || status === "analysis_complete") && analyses.length === 0 && (
          <div
            className="rounded-2xl p-12 text-center"
            style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.20 0.020 255)" }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: "oklch(0.58 0.22 260 / 0.12)", border: "1px solid oklch(0.58 0.22 260 / 0.25)" }}
            >
              <Zap className="h-8 w-8" style={{ color: "oklch(0.72 0.18 260)" }} />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Run AI Impact Analysis</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
              The AI will scan all documents in your library and identify which ones need to be updated based on this change.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="outline" onClick={() => setLocation("/documents")} className="gap-2">
                <FileText className="h-4 w-4" /> View Document Library
              </Button>
              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="gap-2 min-w-[200px]"
                style={{
                  background: "linear-gradient(135deg, oklch(0.58 0.22 260), oklch(0.52 0.20 280))",
                  border: "none",
                  boxShadow: "0 4px 16px oklch(0.58 0.22 260 / 0.3)",
                }}
              >
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
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.58 0.22 260 / 0.20)" }}
          >
            <div className="relative mx-auto mb-4 w-12 h-12">
              <Loader2 className="h-12 w-12 animate-spin" style={{ color: "oklch(0.58 0.22 260)" }} />
            </div>
            <p className="text-sm text-foreground font-semibold">Analysing impact across all documents…</p>
            <p className="text-xs text-muted-foreground mt-1">This usually takes 15–30 seconds</p>
          </div>
        )}

        {/* ── STEP 2: Impact Analysis Results ── */}
        {analyses.length > 0 && !isGenerating && (
          <div className="space-y-6">

            {/* Summary bar */}
            <div
              className="flex items-center justify-between p-4 rounded-2xl"
              style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.20 0.020 255)" }}
            >
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-foreground">Impact Analysis Results</p>
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-semibold"
                  style={{ background: "oklch(0.75 0.18 85 / 0.12)", color: "oklch(0.80 0.16 85)", border: "1px solid oklch(0.75 0.18 85 / 0.25)" }}
                >
                  {impactedAnalyses.length} impacted
                </span>
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-semibold"
                  style={{ background: "oklch(0.65 0.18 145 / 0.10)", color: "oklch(0.70 0.18 145)", border: "1px solid oklch(0.65 0.18 145 / 0.20)" }}
                >
                  {notImpactedAnalyses.length} clear
                </span>
              </div>
            </div>

            {/* Documents requiring updates */}
            {impactedAnalyses.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <AlertTriangle className="h-4 w-4" style={{ color: "oklch(0.80 0.16 85)" }} />
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "oklch(0.80 0.16 85)" }}>
                    Documents Requiring Updates — {impactedAnalyses.length}
                  </p>
                </div>
                {impactedAnalyses.map((analysis) => {
                  const draft = drafts.find((d) => d.documentId === analysis.documentId);
                  const isExpanded = expandedAnalysis === analysis.id;
                  return (
                    <div
                      key={analysis.id}
                      className="rounded-2xl overflow-hidden transition-all"
                      style={{
                        background: "oklch(0.12 0.022 255)",
                        border: "1px solid oklch(0.75 0.18 85 / 0.20)",
                      }}
                    >
                      <div className="flex items-start gap-4 p-5">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: "oklch(0.75 0.18 85 / 0.10)" }}
                        >
                          <AlertTriangle className="h-4 w-4" style={{ color: "oklch(0.80 0.16 85)" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="font-semibold text-sm text-foreground">
                              {analysis.documentName ?? `Document #${analysis.documentId}`}
                            </span>
                            <span
                              className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                              style={confidenceStyle(analysis.confidence ?? "low")}
                            >
                              {analysis.confidence} confidence
                            </span>
                            {analysis.status === "confirmed" && (
                              <span
                                className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: "oklch(0.65 0.18 145 / 0.12)", color: "oklch(0.70 0.18 145)", border: "1px solid oklch(0.65 0.18 145 / 0.25)" }}
                              >
                                Confirmed
                              </span>
                            )}
                            {analysis.status === "dismissed" && (
                              <span
                                className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: "oklch(0.18 0.020 255)", color: "oklch(0.50 0.04 255)", border: "1px solid oklch(0.25 0.020 255)" }}
                              >
                                Dismissed
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{analysis.reasoning}</p>
                          {isExpanded && analysis.impactedSections && (
                            <div
                              className="mt-3 pt-3"
                              style={{ borderTop: "1px solid oklch(0.20 0.020 255)" }}
                            >
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
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
                                className="transition-colors"
                                title="Confirm impact"
                                style={{ color: "oklch(0.65 0.18 145)" }}
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
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg"
                            style={{ background: "oklch(0.16 0.020 255)" }}
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
                <div className="flex items-center gap-2 px-1">
                  <CheckCircle2 className="h-4 w-4" style={{ color: "oklch(0.65 0.18 145)" }} />
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "oklch(0.65 0.18 145)" }}>
                    Documents Not Impacted — {notImpactedAnalyses.length}
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {notImpactedAnalyses.map((analysis) => (
                    <div
                      key={analysis.id}
                      className="flex items-center gap-2 p-3 rounded-xl text-sm"
                      style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.65 0.18 145 / 0.15)" }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "oklch(0.65 0.18 145)" }} />
                      <span className="text-muted-foreground truncate text-xs">
                        {analysis.documentName ?? `Document #${analysis.documentId}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP 3: Generate Drafts CTA ── */}
            {impactedAnalyses.length > 0 && drafts.length === 0 && (
              <div
                className="rounded-2xl p-6"
                style={{
                  background: "linear-gradient(135deg, oklch(0.58 0.22 260 / 0.08), oklch(0.52 0.20 280 / 0.04))",
                  border: "1px solid oklch(0.58 0.22 260 / 0.25)",
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "oklch(0.58 0.22 260 / 0.15)", border: "1px solid oklch(0.58 0.22 260 / 0.25)" }}
                  >
                    <FileText className="h-5 w-5" style={{ color: "oklch(0.72 0.18 260)" }} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-1">
                      Step 2 — Generate Updated Documents
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                      The AI will generate updated drafts for the {impactedAnalyses.length} impacted document
                      {impactedAnalyses.length !== 1 ? "s" : ""}. You can then review each one side-by-side with the original before routing for approval.
                    </p>
                    <Button
                      onClick={handleGenerateDrafts}
                      disabled={isGenerating}
                      size="lg"
                      className="gap-2"
                      style={{
                        background: "linear-gradient(135deg, oklch(0.58 0.22 260), oklch(0.52 0.20 280))",
                        border: "none",
                        boxShadow: "0 4px 16px oklch(0.58 0.22 260 / 0.3)",
                      }}
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
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.58 0.22 260 / 0.20)" }}
          >
            <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4" style={{ color: "oklch(0.58 0.22 260)" }} />
            <p className="text-sm text-foreground font-semibold">Generating document drafts…</p>
            <p className="text-xs text-muted-foreground mt-1">This usually takes 30–60 seconds</p>
          </div>
        )}

        {/* ── STEP 3: Document Drafts List ── */}
        {drafts.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Document Drafts</p>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: "oklch(0.58 0.22 260 / 0.12)", color: "oklch(0.72 0.18 260)", border: "1px solid oklch(0.58 0.22 260 / 0.25)" }}
                >
                  {drafts.length}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {drafts.filter((d) => d.status === "approved").length} of {drafts.length} approved
              </span>
            </div>

            <div className="space-y-2">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="flex items-center justify-between p-4 rounded-2xl transition-all"
                  style={{
                    background: "oklch(0.12 0.022 255)",
                    border: "1px solid oklch(0.20 0.020 255)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "oklch(0.16 0.022 255)" }}
                    >
                      {draft.status === "approved" && <CheckCircle2 className="h-4 w-4" style={{ color: "oklch(0.65 0.18 145)" }} />}
                      {draft.status === "routed_for_approval" && <Send className="h-4 w-4" style={{ color: "oklch(0.65 0.18 260)" }} />}
                      {(draft.status === "pending_review" || !draft.status) && <Clock className="h-4 w-4" style={{ color: "oklch(0.75 0.18 85)" }} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {draft.documentName ?? `Document #${draft.documentId}`}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {(draft.status ?? "pending_review").replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLocation(`/drafts/${draft.id}`)}
                    className="gap-1.5 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5" /> Review &amp; Approve
                  </Button>
                </div>
              ))}
            </div>

            {/* All approved banner */}
            {drafts.every((d) => d.status === "approved") && (
              <div
                className="flex items-center gap-4 rounded-2xl p-5"
                style={{ background: "oklch(0.65 0.18 145 / 0.06)", border: "1px solid oklch(0.65 0.18 145 / 0.25)" }}
              >
                <CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: "oklch(0.65 0.18 145)" }} />
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
    </div>
  );
}
