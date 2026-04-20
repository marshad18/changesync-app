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
    draft: { background: "oklch(0.94 0.008 255)", color: "oklch(0.35 0.06 255)", border: "1px solid oklch(0.82 0.012 255)" },
    analyzing: { background: "oklch(0.93 0.012 265)", color: "oklch(0.38 0.16 265)", border: "1px solid oklch(0.80 0.015 265)" },
    analysis_complete: { background: "oklch(0.96 0.012 85)", color: "oklch(0.42 0.14 75)", border: "1px solid oklch(0.82 0.06 85)" },
    generating_drafts: { background: "oklch(0.93 0.012 265)", color: "oklch(0.38 0.16 265)", border: "1px solid oklch(0.80 0.015 265)" },
    pending_approval: { background: "oklch(0.96 0.012 85)", color: "oklch(0.42 0.14 75)", border: "1px solid oklch(0.82 0.06 85)" },
    approved: { background: "oklch(0.95 0.012 145)", color: "oklch(0.38 0.14 145)", border: "1px solid oklch(0.80 0.06 145)" },
    rejected: { background: "oklch(0.96 0.012 25)", color: "oklch(0.42 0.16 25)", border: "1px solid oklch(0.82 0.06 25)" },
  };
  return map[status] ?? map.draft;
}

function confidenceStyle(c: string): React.CSSProperties {
  if (c === "high") return { background: "oklch(0.95 0.012 145)", color: "oklch(0.38 0.14 145)", border: "1px solid oklch(0.80 0.06 145)" };
  if (c === "medium") return { background: "oklch(0.96 0.012 85)", color: "oklch(0.42 0.14 75)", border: "1px solid oklch(0.82 0.06 85)" };
  return { background: "oklch(0.96 0.012 25)", color: "oklch(0.42 0.16 25)", border: "1px solid oklch(0.82 0.06 25)" };
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
            style={{ background: "oklch(0.94 0.008 255)", border: "1px solid oklch(0.86 0.010 255)", color: "oklch(0.40 0.04 255)" }}
          >
            <ChangeIcon className="h-3.5 w-3.5" />
            {CHANGE_TYPE_LABELS[event.changeType] ?? event.changeType}
          </span>
          {(event as any).partSubType && (
            <span
              className="text-xs px-3 py-1.5 rounded-lg font-medium capitalize"
              style={{ background: "oklch(0.94 0.008 255)", border: "1px solid oklch(0.86 0.010 255)", color: "oklch(0.40 0.04 255)" }}
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
              style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
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
              style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
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
              style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
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
            style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
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
                  background: "linear-gradient(135deg, oklch(0.42 0.18 265), oklch(0.36 0.16 275))",
                  border: "none",
                  boxShadow: "0 4px 12px oklch(0.42 0.18 265 / 0.25)",
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
            style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.82 0.015 265)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
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

            {/* ── Summary stats bar ── */}
            <div className="grid grid-cols-3 gap-4">
              <div
                className="rounded-2xl p-5 flex items-center gap-4"
                style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.94 0.008 255)" }}>
                  <FileText className="h-5 w-5" style={{ color: "oklch(0.45 0.06 255)" }} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{analyses.length}</p>
                  <p className="text-xs text-muted-foreground">Total Documents</p>
                </div>
              </div>
              <div
                className="rounded-2xl p-5 flex items-center gap-4"
                style={{ background: "oklch(0.98 0.010 85)", border: "1px solid oklch(0.82 0.10 85 / 0.40)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.92 0.14 85 / 0.50)" }}>
                  <AlertTriangle className="h-5 w-5" style={{ color: "oklch(0.62 0.16 75)" }} />
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: "oklch(0.50 0.16 75)" }}>{impactedAnalyses.length}</p>
                  <p className="text-xs" style={{ color: "oklch(0.62 0.10 75)" }}>Need Updating</p>
                </div>
              </div>
              <div
                className="rounded-2xl p-5 flex items-center gap-4"
                style={{ background: "oklch(0.97 0.010 145)", border: "1px solid oklch(0.75 0.12 145 / 0.35)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.88 0.12 145 / 0.50)" }}>
                  <CheckCircle2 className="h-5 w-5" style={{ color: "oklch(0.48 0.16 145)" }} />
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: "oklch(0.40 0.16 145)" }}>{notImpactedAnalyses.length}</p>
                  <p className="text-xs" style={{ color: "oklch(0.50 0.12 145)" }}>No Changes Needed</p>
                </div>
              </div>
            </div>

            {/* ── Documents requiring updates ── */}
            {impactedAnalyses.length > 0 && (
              <div className="space-y-3">
                <div
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                  style={{ background: "oklch(0.98 0.010 75)", border: "1px solid oklch(0.82 0.10 75 / 0.35)" }}
                >
                  <AlertTriangle className="h-4 w-4" style={{ color: "oklch(0.62 0.16 75)" }} />
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "oklch(0.50 0.14 75)" }}>
                    {impactedAnalyses.length} Document{impactedAnalyses.length !== 1 ? "s" : ""} Require Updates
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
                        background: "oklch(1 0 0)",
                        border: "1px solid oklch(0.82 0.10 75 / 0.25)",
                        boxShadow: "0 2px 8px oklch(0.62 0.16 75 / 0.06)",
                      }}
                    >
                      {/* Card top accent bar */}
                      <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, oklch(0.75 0.18 75), oklch(0.82 0.14 85))" }} />
                      <div className="p-5">
                        <div className="flex items-start gap-4">
                          {/* Icon */}
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                            style={{ background: "oklch(0.92 0.12 85 / 0.40)", border: "1px solid oklch(0.82 0.10 75 / 0.30)" }}
                          >
                            <AlertTriangle className="h-5 w-5" style={{ color: "oklch(0.62 0.16 75)" }} />
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="font-bold text-base text-foreground">
                                {analysis.documentName ?? `Document #${analysis.documentId}`}
                              </span>
                              <span
                                className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold"
                                style={confidenceStyle(analysis.confidence ?? "low")}
                              >
                                {analysis.confidence} confidence
                              </span>
                              {analysis.status === "confirmed" && (
                                <span
                                  className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold"
                                  style={{ background: "oklch(0.92 0.12 145 / 0.40)", color: "oklch(0.42 0.16 145)", border: "1px solid oklch(0.65 0.18 145 / 0.30)" }}
                                >
                                  ✓ Confirmed
                                </span>
                              )}
                              {analysis.status === "dismissed" && (
                                <span
                                  className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold"
                                  style={{ background: "oklch(0.94 0.008 255)", color: "oklch(0.50 0.04 255)", border: "1px solid oklch(0.86 0.010 255)" }}
                                >
                                  Dismissed
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{analysis.reasoning}</p>
                            {isExpanded && analysis.impactedSections && (
                              <div
                                className="mt-4 pt-4 space-y-2"
                                style={{ borderTop: "1px solid oklch(0.90 0.006 255)" }}
                              >
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                  Sections to Update
                                </p>
                                <p className="text-sm leading-relaxed" style={{ color: "oklch(0.35 0.04 255)" }}>
                                  {analysis.impactedSections}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Action row */}
                        <div
                          className="flex items-center justify-between mt-4 pt-4"
                          style={{ borderTop: "1px solid oklch(0.92 0.006 255)" }}
                        >
                          <button
                            onClick={() => setExpandedAnalysis(isExpanded ? null : analysis.id)}
                            className="text-xs font-medium transition-colors flex items-center gap-1"
                            style={{ color: "oklch(0.55 0.04 255)" }}
                          >
                            {isExpanded ? "Show less ↑" : "Show details ↓"}
                          </button>
                          <div className="flex items-center gap-2">
                            {analysis.status === "pending" && (
                              <>
                                <button
                                  onClick={() => handleConfirm(analysis.id, "confirmed")}
                                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                                  style={{ background: "oklch(0.92 0.12 145 / 0.30)", color: "oklch(0.42 0.16 145)", border: "1px solid oklch(0.65 0.18 145 / 0.30)" }}
                                  title="Confirm impact"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
                                </button>
                                <button
                                  onClick={() => handleConfirm(analysis.id, "dismissed")}
                                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                                  style={{ background: "oklch(0.96 0.008 25 / 0.30)", color: "oklch(0.50 0.16 25)", border: "1px solid oklch(0.75 0.14 25 / 0.30)" }}
                                  title="Dismiss"
                                >
                                  <XCircle className="h-3.5 w-3.5" /> Dismiss
                                </button>
                              </>
                            )}
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
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Documents not impacted ── */}
            {notImpactedAnalyses.length > 0 && (
              <div className="space-y-3">
                <div
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                  style={{ background: "oklch(0.97 0.010 145)", border: "1px solid oklch(0.75 0.12 145 / 0.35)" }}
                >
                  <CheckCircle2 className="h-4 w-4" style={{ color: "oklch(0.48 0.16 145)" }} />
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "oklch(0.40 0.14 145)" }}>
                    {notImpactedAnalyses.length} Document{notImpactedAnalyses.length !== 1 ? "s" : ""} — No Changes Required
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {notImpactedAnalyses.map((analysis) => (
                    <div
                      key={analysis.id}
                      className="flex items-center gap-3 p-3.5 rounded-xl"
                      style={{
                        background: "oklch(0.97 0.010 145)",
                        border: "1px solid oklch(0.75 0.12 145 / 0.30)",
                      }}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "oklch(0.88 0.12 145 / 0.50)" }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "oklch(0.48 0.16 145)" }} />
                      </div>
                      <span className="text-sm font-medium truncate" style={{ color: "oklch(0.35 0.08 145)" }}>
                        {analysis.documentName ?? `Document #${analysis.documentId}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP 3: Generate Drafts CTA — bottom-left aligned ── */}
            {impactedAnalyses.length > 0 && drafts.length === 0 && (
              <div
                className="rounded-2xl p-6"
                style={{
                  background: "oklch(1 0 0)",
                  border: "1px solid oklch(0.88 0.008 255)",
                  boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)",
                }}
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Next Step</p>
                    <h3 className="font-bold text-lg text-foreground mb-1">Generate Updated Document Drafts</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
                      The AI will produce updated drafts for the <strong>{impactedAnalyses.length}</strong> impacted document{impactedAnalyses.length !== 1 ? "s" : ""}.
                      Each draft will show the original alongside the proposed changes for your review.
                    </p>
                  </div>
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: "oklch(0.38 0.16 265 / 0.10)", border: "1px solid oklch(0.38 0.16 265 / 0.20)" }}
                  >
                    <Zap className="h-6 w-6" style={{ color: "oklch(0.45 0.18 265)" }} />
                  </div>
                </div>
                {/* Bottom-left button placement */}
                <div className="flex justify-start mt-5 pt-5" style={{ borderTop: "1px solid oklch(0.90 0.006 255)" }}>
                  <Button
                    onClick={handleGenerateDrafts}
                    disabled={isGenerating}
                    size="lg"
                    className="gap-2"
                    style={{
                      background: "linear-gradient(135deg, oklch(0.42 0.18 265), oklch(0.36 0.16 275))",
                      border: "none",
                      boxShadow: "0 4px 12px oklch(0.42 0.18 265 / 0.25)",
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
            )}
          </div>
        )}

        {/* ── Generating spinner ── */}
        {isGenerating && (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.82 0.015 265)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
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
                    background: "oklch(1 0 0)",
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
