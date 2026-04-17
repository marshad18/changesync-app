import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "@/components/StatusBadge";
import {
  GitBranch,
  FileText,
  CheckCircle2,
  Clock,
  Plus,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  Activity,
  Layers,
  Shield,
  Zap,
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accent: string;
  sub?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl p-5 flex flex-col gap-3"
      style={{
        background: "linear-gradient(145deg, oklch(0.13 0.022 255) 0%, oklch(0.11 0.018 255) 100%)",
        border: "1px solid oklch(0.22 0.022 255)",
        boxShadow: "0 1px 3px oklch(0 0 0 / 0.3)",
      }}
    >
      {/* Background glow */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 blur-2xl"
        style={{ background: accent }}
      />
      <div className="flex items-start justify-between relative z-10">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          {label}
        </p>
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
      </div>
      <div className="relative z-10">
        <p
          className="text-3xl font-bold tracking-tight"
          style={{
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.03em",
          }}
        >
          {value}
        </p>
        {sub && (
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: changes, isLoading: changesLoading } = trpc.changes.list.useQuery();
  const { data: documents } = trpc.documents.list.useQuery();

  const totalChanges = changes?.length ?? 0;
  const pendingApproval = changes?.filter(
    (c) => c.status === "pending_approval" || c.status === "routed_for_approval"
  ).length ?? 0;
  const approved = changes?.filter((c) => c.status === "approved").length ?? 0;
  const totalDocs = documents?.length ?? 0;

  const recentChanges = changes?.slice(0, 6) ?? [];

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
    <div className="min-h-full">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div
        className="px-8 py-8 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.12 0.025 258) 0%, oklch(0.09 0.018 255) 100%)",
          borderBottom: "1px solid oklch(0.22 0.022 255)",
        }}
      >
        {/* Decorative grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(0.94 0.008 240) 1px, transparent 1px), linear-gradient(90deg, oklch(0.94 0.008 240) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              {greeting()}, {user?.name?.split(" ")[0] ?? "there"}
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
            className="gap-2 font-medium shadow-lg"
            style={{
              background: "linear-gradient(135deg, oklch(0.58 0.22 260), oklch(0.52 0.20 280))",
              border: "none",
              boxShadow: "0 4px 16px oklch(0.58 0.22 260 / 0.3)",
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
            accent="oklch(0.58 0.22 260)"
            sub="All time"
          />
          <StatCard
            label="Pending Approval"
            value={pendingApproval}
            icon={Clock}
            accent="oklch(0.72 0.18 75)"
            sub={pendingApproval > 0 ? "Requires attention" : "All clear"}
          />
          <StatCard
            label="Approved"
            value={approved}
            icon={CheckCircle2}
            accent="oklch(0.65 0.18 145)"
            sub="Completed changes"
          />
          <StatCard
            label="Documents"
            value={totalDocs}
            icon={FileText}
            accent="oklch(0.65 0.16 200)"
            sub="In library"
          />
        </div>

        {/* ── Main content grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Change Events list — 2/3 width */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Recent Change Events</h2>
              </div>
              <button
                onClick={() => setLocation("/changes/new")}
                className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                View all <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            <div
              className="rounded-xl overflow-hidden"
              style={{
                border: "1px solid oklch(0.22 0.022 255)",
                background: "oklch(0.11 0.020 255)",
              }}
            >
              {changesLoading ? (
                <div className="p-8 text-center">
                  <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    Loading change events…
                  </div>
                </div>
              ) : recentChanges.length === 0 ? (
                <div className="p-12 text-center">
                  <div
                    className="h-12 w-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: "oklch(0.58 0.22 260 / 0.1)", border: "1px solid oklch(0.58 0.22 260 / 0.2)" }}
                  >
                    <GitBranch className="h-6 w-6 text-primary/60" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">No change events yet</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Create your first change event to get started.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setLocation("/changes/new")}
                    className="gap-1.5 text-xs"
                    style={{
                      background: "linear-gradient(135deg, oklch(0.58 0.22 260), oklch(0.52 0.20 280))",
                      border: "none",
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Create Change Event
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentChanges.map((change, i) => (
                    <button
                      key={change.id}
                      onClick={() => setLocation(`/changes/${change.id}`)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.03] transition-colors text-left group"
                    >
                      {/* Index number */}
                      <div
                        className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                        style={{
                          background: "oklch(0.58 0.22 260 / 0.08)",
                          color: "oklch(0.72 0.18 255)",
                          border: "1px solid oklch(0.58 0.22 260 / 0.15)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {change.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground/60 font-medium uppercase tracking-wide">
                            {changeTypeLabel(change.changeType)}
                          </span>
                          {change.equipmentTag && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-[11px] text-muted-foreground/60">
                                {change.equipmentTag}
                              </span>
                            </>
                          )}
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-[11px] text-muted-foreground/50">
                            {format(new Date(change.createdAt), "d MMM yyyy")}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <StatusBadge status={change.status} />
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      </div>
                    </button>
                  ))}
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
                    accent: "oklch(0.58 0.22 260)",
                  },
                  {
                    icon: FileText,
                    label: "Document Library",
                    sub: "Manage and import documents",
                    path: "/documents",
                    accent: "oklch(0.65 0.16 200)",
                  },
                ].map((action) => (
                  <button
                    key={action.path}
                    onClick={() => setLocation(action.path)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left hover:bg-white/[0.04] transition-all group"
                    style={{
                      background: "oklch(0.12 0.020 255)",
                      border: "1px solid oklch(0.22 0.022 255)",
                    }}
                  >
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: `${action.accent}15`,
                        border: `1px solid ${action.accent}25`,
                      }}
                    >
                      <action.icon className="h-4 w-4" style={{ color: action.accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{action.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{action.sub}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                  </button>
                ))}
              </div>
            </div>

            {/* Platform info */}
            <div
              className="rounded-xl p-5 relative overflow-hidden"
              style={{
                background: "linear-gradient(145deg, oklch(0.14 0.030 260) 0%, oklch(0.11 0.022 255) 100%)",
                border: "1px solid oklch(0.58 0.22 260 / 0.2)",
              }}
            >
              <div
                className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-3xl"
                style={{ background: "oklch(0.58 0.22 260)" }}
              />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4 text-primary/70" />
                  <p className="text-xs font-semibold text-primary/80 uppercase tracking-wider">
                    ChangeSync Enterprise
                  </p>
                </div>
                <p className="text-sm text-foreground font-medium mb-1">
                  AI-powered change management
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Automatically identifies impacted documents, generates AI-updated drafts, and routes them for approval — all in one workflow.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["Part Changes", "Weight Changes", "Price Changes"].map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{
                        background: "oklch(0.58 0.22 260 / 0.12)",
                        border: "1px solid oklch(0.58 0.22 260 / 0.2)",
                        color: "oklch(0.72 0.18 255)",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Document library summary */}
            {totalDocs === 0 && (
              <div
                className="rounded-xl p-5"
                style={{
                  background: "oklch(0.12 0.020 255)",
                  border: "1px solid oklch(0.72 0.18 75 / 0.2)",
                }}
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">
                      Document Library is empty
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Import documents from GitHub to enable AI impact analysis on change events.
                    </p>
                    <button
                      onClick={() => setLocation("/documents")}
                      className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1"
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
