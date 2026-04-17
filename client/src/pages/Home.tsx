import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  GitBranch,
  FileText,
  CheckCircle2,
  Clock,
  Plus,
  ArrowRight,
  ChevronRight,
  Activity,
  Zap,
  AlertCircle,
  Shield,
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

function StatCard({
  label,
  value,
  icon: Icon,
  accentColor,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accentColor: string;
  sub?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl p-5 flex flex-col gap-3 bg-card"
      style={{
        border: "1px solid oklch(0.88 0.008 255)",
        boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.07)",
      }}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ background: `${accentColor}14`, border: `1px solid ${accentColor}28` }}
        >
          <Icon className="h-4 w-4" style={{ color: accentColor }} />
        </div>
      </div>
      <div>
        <p
          className="text-3xl font-bold tracking-tight text-foreground"
          style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl"
        style={{ background: `linear-gradient(90deg, ${accentColor}50, transparent)` }}
      />
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: changes, isLoading: changesLoading } = trpc.changeEvents.list.useQuery();
  const { data: documents } = trpc.documents.list.useQuery();

  const totalChanges = changes?.length ?? 0;
  const pendingApproval = (changes as any[])?.filter(
    (c: any) => c.status === "pending_approval" || c.status === "routed_for_approval"
  ).length ?? 0;
  const approved = (changes as any[])?.filter((c: any) => c.status === "approved").length ?? 0;
  const totalDocs = documents?.length ?? 0;

  const recentChanges = (changes as any[])?.slice(0, 6) ?? [];

  const changeTypeLabel = (t: string) => {
    if (t === "part_change") return "Part Change";
    if (t === "weight_change") return "Weight Change";
    if (t === "price_change") return "Price Change";
    return t;
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-full bg-background">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div
        className="px-8 py-7 bg-card"
        style={{ borderBottom: "1px solid oklch(0.88 0.008 255)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-0.5">
              {greeting()}, <span className="font-medium text-foreground">{user?.name?.split(" ")[0] ?? "there"}</span>
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Operations Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor and manage all engineering change events across your facility.
            </p>
          </div>
          <Button
            onClick={() => setLocation("/changes/new")}
            size="default"
            className="gap-2 font-semibold text-white shadow-md"
            style={{
              background: "linear-gradient(135deg, oklch(0.42 0.18 265), oklch(0.36 0.16 275))",
              border: "none",
              boxShadow: "0 4px 12px oklch(0.42 0.18 265 / 0.25)",
            }}
          >
            <Plus className="h-4 w-4" />
            New Change Event
          </Button>
        </div>
      </div>

      <div className="px-8 py-8 space-y-8">

        {/* ── KPI Stats ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Changes"
            value={totalChanges}
            icon={GitBranch}
            accentColor="oklch(0.42 0.18 265)"
            sub="All time"
          />
          <StatCard
            label="Pending Approval"
            value={pendingApproval}
            icon={Clock}
            accentColor="oklch(0.58 0.18 75)"
            sub={pendingApproval > 0 ? "Requires attention" : "All clear"}
          />
          <StatCard
            label="Approved"
            value={approved}
            icon={CheckCircle2}
            accentColor="oklch(0.48 0.18 145)"
            sub="Completed changes"
          />
          <StatCard
            label="Documents"
            value={totalDocs}
            icon={FileText}
            accentColor="oklch(0.45 0.16 200)"
            sub="In library"
          />
        </div>

        {/* ── Main content grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Change Events list — 2/3 width */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Recent Change Events</h2>
              </div>
              <button
                onClick={() => setLocation("/changes/new")}
                className="text-xs font-medium flex items-center gap-1 transition-colors"
                style={{ color: "oklch(0.42 0.18 265)" }}
              >
                View all <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            <div
              className="rounded-xl overflow-hidden bg-card"
              style={{ border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 3px oklch(0.18 0.020 255 / 0.06)" }}
            >
              {changesLoading ? (
                <div className="p-8 text-center">
                  <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <div
                      className="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin"
                      style={{ borderColor: "oklch(0.42 0.18 265 / 0.3)", borderTopColor: "oklch(0.42 0.18 265)" }}
                    />
                    Loading change events…
                  </div>
                </div>
              ) : recentChanges.length === 0 ? (
                <div className="p-12 text-center">
                  <div
                    className="h-12 w-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: "oklch(0.92 0.012 265)", border: "1px solid oklch(0.82 0.015 265)" }}
                  >
                    <GitBranch className="h-6 w-6" style={{ color: "oklch(0.42 0.18 265)" }} />
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-1">No change events yet</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Create your first change event to get started.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setLocation("/changes/new")}
                    className="gap-1.5 text-xs text-white"
                    style={{
                      background: "linear-gradient(135deg, oklch(0.42 0.18 265), oklch(0.36 0.16 275))",
                      border: "none",
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Create Change Event
                  </Button>
                </div>
              ) : (
                <div>
                  {/* Table header */}
                  <div
                    className="grid grid-cols-[1fr_auto] px-5 py-2.5"
                    style={{
                      borderBottom: "1px solid oklch(0.88 0.008 255)",
                      background: "oklch(0.975 0.004 250)",
                    }}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Change Event</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</span>
                  </div>
                  <div className="divide-y" style={{ borderColor: "oklch(0.92 0.006 250)" }}>
                    {recentChanges.map((change: any) => (
                      <button
                        key={change.id}
                        onClick={() => setLocation(`/changes/${change.id}`)}
                        className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/60 transition-colors text-left group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {change.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-muted-foreground font-medium">
                              {changeTypeLabel(change.changeType)}
                            </span>
                            {change.equipmentTag && (
                              <>
                                <span className="text-muted-foreground/40">·</span>
                                <span className="text-[11px] text-muted-foreground">{change.equipmentTag}</span>
                              </>
                            )}
                            <span className="text-muted-foreground/40">·</span>
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date(change.createdAt), "d MMM yyyy")}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <StatusBadge status={change.status} />
                          <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right column — 1/3 width */}
          <div className="space-y-4">

            {/* Quick actions */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
              </div>
              <div className="space-y-2">
                {[
                  {
                    icon: Plus,
                    label: "New Change Event",
                    sub: "Log a part, weight, or price change",
                    path: "/changes/new",
                    accent: "oklch(0.42 0.18 265)",
                  },
                  {
                    icon: FileText,
                    label: "Document Library",
                    sub: "Manage and import documents",
                    path: "/documents",
                    accent: "oklch(0.45 0.16 200)",
                  },
                ].map((action) => (
                  <button
                    key={action.path}
                    onClick={() => setLocation(action.path)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left hover:bg-secondary transition-all group bg-card"
                    style={{ border: "1px solid oklch(0.88 0.008 255)", boxShadow: "0 1px 2px oklch(0.18 0.020 255 / 0.05)" }}
                  >
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${action.accent}12`, border: `1px solid ${action.accent}22` }}
                    >
                      <action.icon className="h-4 w-4" style={{ color: action.accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{action.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{action.sub}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  </button>
                ))}
              </div>
            </div>

            {/* Platform info card */}
            <div
              className="rounded-xl p-5 bg-card"
              style={{
                border: "1px solid oklch(0.82 0.015 265)",
                background: "linear-gradient(145deg, oklch(0.96 0.010 265) 0%, oklch(0.98 0.006 250) 100%)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4" style={{ color: "oklch(0.42 0.18 265)" }} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "oklch(0.42 0.18 265)" }}>
                  ChangeSync Enterprise
                </p>
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">
                AI-powered change management
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Automatically identifies impacted documents, generates AI-updated drafts, and routes them for approval — all in one workflow.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["Part Changes", "Weight Changes", "Price Changes"].map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: "oklch(0.92 0.012 265)",
                      border: "1px solid oklch(0.80 0.015 265)",
                      color: "oklch(0.38 0.18 265)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Document library empty warning */}
            {totalDocs === 0 && (
              <div
                className="rounded-xl p-4 bg-card"
                style={{ border: "1px solid oklch(0.86 0.018 85)" }}
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "oklch(0.58 0.18 75)" }} />
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">
                      Document Library is empty
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Import documents from GitHub to enable AI impact analysis on change events.
                    </p>
                    <button
                      onClick={() => setLocation("/documents")}
                      className="text-xs font-semibold flex items-center gap-1 transition-colors"
                      style={{ color: "oklch(0.58 0.18 75)" }}
                    >
                      Go to Document Library <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
