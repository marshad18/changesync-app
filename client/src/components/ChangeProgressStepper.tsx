import { Check, FilePlus, Search, FileEdit, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkflowStep = 1 | 2 | 3 | 4;

const STEPS = [
  {
    id: 1 as WorkflowStep,
    label: "Create Change",
    description: "Define the change type and details",
    icon: FilePlus,
  },
  {
    id: 2 as WorkflowStep,
    label: "Impact Analysis",
    description: "Identify affected documents",
    icon: Search,
  },
  {
    id: 3 as WorkflowStep,
    label: "Generate Drafts",
    description: "AI updates the impacted docs",
    icon: FileEdit,
  },
  {
    id: 4 as WorkflowStep,
    label: "Review & Approve",
    description: "Review changes and route for approval",
    icon: BadgeCheck,
  },
];

interface ChangeProgressStepperProps {
  currentStep: WorkflowStep;
  /** Optional: override which steps are marked complete (defaults to all steps before currentStep) */
  completedSteps?: WorkflowStep[];
}

export default function ChangeProgressStepper({
  currentStep,
  completedSteps,
}: ChangeProgressStepperProps) {
  const isComplete = (stepId: WorkflowStep) => {
    if (completedSteps) return completedSteps.includes(stepId);
    return stepId < currentStep;
  };

  const isCurrent = (stepId: WorkflowStep) => stepId === currentStep;

  return (
    <div className="w-full bg-card border border-border rounded-xl px-6 py-5">
      <div className="flex items-start justify-between relative">
        {/* Connecting line behind the circles */}
        <div
          className="absolute top-4 left-0 right-0 h-px bg-border"
          style={{ left: "calc(12.5%)", right: "calc(12.5%)" }}
          aria-hidden
        />

        {STEPS.map((step) => {
          const done = isComplete(step.id);
          const active = isCurrent(step.id);
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              className="flex flex-col items-center gap-2 flex-1 relative z-10"
            >
              {/* Circle */}
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                  done
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : active
                    ? "bg-primary border-primary text-primary-foreground shadow-md shadow-primary/30"
                    : "bg-card border-border text-muted-foreground"
                )}
              >
                {done ? (
                  <Check className="w-4 h-4" strokeWidth={2.5} />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>

              {/* Labels */}
              <div className="text-center">
                <p
                  className={cn(
                    "text-xs font-semibold leading-tight",
                    done
                      ? "text-emerald-400"
                      : active
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
                <p
                  className={cn(
                    "text-[10px] leading-tight mt-0.5 hidden sm:block",
                    active ? "text-muted-foreground" : "text-muted-foreground/60"
                  )}
                >
                  {step.description}
                </p>
              </div>

              {/* Step number badge */}
              <span
                className={cn(
                  "text-[9px] font-bold uppercase tracking-widest",
                  done
                    ? "text-emerald-500/70"
                    : active
                    ? "text-primary/70"
                    : "text-muted-foreground/40"
                )}
              >
                Step {step.id}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
