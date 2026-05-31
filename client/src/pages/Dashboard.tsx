import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  GitBranch, Plus, FileText, CheckCircle2, Clock, AlertTriangle,
  ChevronRight, Layers, TrendingUp,
} from "lucide-react";

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
};

function statusClass(status: string) {
  const map: Record<string, string> = {
    draft: "status-draft",
    analyzing: "status-analyzing",
    analysis_complete: "status-analysis_complete",
    generating_drafts: "status-generating_drafts",
    pending_approval: "status-pending_approval",
    approved: "status-approved",
    rejected: "status-rejected",
  };
  return map[status] ?? "status-draft";
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  // Refetch on window focus so the dashboard shows updated approved counts
  // when the user returns after approving a document in another tab.
  const { data: events, isLoading } = trpc.changeEvents.list.useQuery(
    undefined,
    { refetchOnWindowFocus: true }
  );
  const { data: documents } = trpc.documents.list.useQuery(
    undefined,
    { refetchOnWindowFocus: true }
  );

  const stats = {
    total: events?.length ?? 0,
    pending: events?.filter((e) => e.status === "pending_approval").length ?? 0,
    approved: events?.filter((e) => e.status === "approved").length ?? 0,
    docs: documents?.length ?? 0,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            ChangeSync
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered engineering change management
          </p>
        </div>
        <Button onClick={() => setLocation("/changes/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          New Change Event
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Changes", value: stats.total, icon: GitBranch, color: "text-primary" },
          { label: "Pending Approval", value: stats.pending, icon: Clock, color: "text-amber-400" },
          { label: "Approved", value: stats.approved, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Documents in Library", value: stats.docs, icon: FileText, color: "text-violet-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</span>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Change Events List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Change Events
          </h2>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                <div className="h-3 bg-muted rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : events && events.length > 0 ? (
          <div className="space-y-3">
            {events.map((event) => (
              <button
                key={event.id}
                onClick={() => setLocation(`/changes/${event.id}`)}
                className="w-full bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 hover:bg-accent/20 transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="font-semibold text-foreground truncate">{event.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass(event.status ?? "draft")}`}>
                        {STATUS_LABELS[event.status ?? "draft"] ?? event.status}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                        {CHANGE_TYPE_LABELS[event.changeType] ?? event.changeType}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {event.affectedEquipment && (
                        <span>Equipment: <span className="text-foreground/70">{event.affectedEquipment}</span></span>
                      )}
                      {event.affectedSku && (
                        <span>SKU: <span className="text-foreground/70">{event.affectedSku}</span></span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(event.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                        {', '}
                        {new Date(event.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:text-primary transition-colors" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">No change events yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Create your first change event to start analyzing document impacts.
            </p>
            <Button onClick={() => setLocation("/changes/new")} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Change Event
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
