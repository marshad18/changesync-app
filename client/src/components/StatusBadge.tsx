import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:              { label: "Draft",              className: "bg-muted text-muted-foreground" },
  analyzing:          { label: "Analyzing…",         className: "bg-blue-500/15 text-blue-400" },
  analysis_complete:  { label: "Analysis Ready",     className: "bg-cyan-500/15 text-cyan-400" },
  generating_drafts:  { label: "Generating Drafts…", className: "bg-violet-500/15 text-violet-400" },
  pending_approval:   { label: "Pending Approval",   className: "bg-amber-500/15 text-amber-400" },
  approved:           { label: "Approved",           className: "bg-emerald-500/15 text-emerald-400" },
  rejected:           { label: "Rejected",           className: "bg-red-500/15 text-red-400" },
  pending_review:     { label: "Pending Review",     className: "bg-amber-500/15 text-amber-400" },
  revision_requested: { label: "Revision Requested", className: "bg-orange-500/15 text-orange-400" },
  confirmed:          { label: "Confirmed",          className: "bg-emerald-500/15 text-emerald-400" },
  dismissed:          { label: "Dismissed",          className: "bg-muted text-muted-foreground" },
  pending:            { label: "Pending",            className: "bg-amber-500/15 text-amber-400" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", config.className, className)}>
      {config.label}
    </span>
  );
}
