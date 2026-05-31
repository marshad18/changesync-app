import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Cpu, CheckCircle2, Zap, Brain, FlaskConical } from "lucide-react";
// ─── Available models ─────────────────────────────────────────────────────────

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
  strengths: string[];
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  icon: React.ReactNode;
  speed: "Fast" | "Medium" | "Slow";
  quality: "Good" | "Great" | "Best";
}

const MODELS: ModelOption[] = [
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google DeepMind",
    description: "The current default. Fast, cost-efficient, and strong at structured JSON extraction — ideal for impact analysis and change extraction across large document sets.",
    strengths: ["Fast responses", "Strong JSON output", "Large context window", "Good at structured extraction"],
    badge: "Default",
    badgeVariant: "default",
    icon: <Zap className="w-5 h-5" />,
    speed: "Fast",
    quality: "Great",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google DeepMind",
    description: "The most capable Gemini model. Better reasoning and more accurate impact analysis, especially for complex multi-document changes. Slower than Flash.",
    strengths: ["Best reasoning", "Complex document analysis", "Higher accuracy", "Better at edge cases"],
    badge: "Most Capable",
    badgeVariant: "secondary",
    icon: <Brain className="w-5 h-5" />,
    speed: "Slow",
    quality: "Best",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "Google DeepMind",
    description: "Previous generation Flash model. Reliable and well-tested for manufacturing document workflows.",
    strengths: ["Reliable", "Well-tested", "Consistent output"],
    icon: <Cpu className="w-5 h-5" />,
    speed: "Fast",
    quality: "Good",
  },
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    provider: "Google DeepMind",
    description: "Lightweight model optimised for speed. Best for simple weight/price changes where the old value is already known and the LLM is mainly confirming impact.",
    strengths: ["Fastest", "Lowest latency", "Simple changes"],
    badge: "Fastest",
    badgeVariant: "outline",
    icon: <Zap className="w-5 h-5 text-yellow-500" />,
    speed: "Fast",
    quality: "Good",
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "Anthropic",
    description: "Anthropic's balanced model. Excellent at following precise instructions and producing clean, structured output for document modification prompts.",
    strengths: ["Instruction following", "Clean structured output", "Good reasoning"],
    badge: "Experimental",
    badgeVariant: "outline",
    icon: <FlaskConical className="w-5 h-5 text-purple-500" />,
    speed: "Medium",
    quality: "Great",
  },
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    provider: "Anthropic",
    description: "Anthropic's most powerful model. Exceptional at nuanced document analysis and complex reasoning chains. Use for the most demanding change events.",
    strengths: ["Best reasoning", "Nuanced analysis", "Complex instructions"],
    badge: "Experimental",
    badgeVariant: "outline",
    icon: <FlaskConical className="w-5 h-5 text-purple-500" />,
    speed: "Slow",
    quality: "Best",
  },
];

// ─── Speed / quality dot indicators ──────────────────────────────────────────

const SpeedDots = ({ level }: { level: "Fast" | "Medium" | "Slow" }) => {
  const filled = level === "Fast" ? 3 : level === "Medium" ? 2 : 1;
  return (
    <div className="flex gap-1 items-center">
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full ${i <= filled ? "bg-emerald-500" : "bg-muted-foreground/20"}`}
        />
      ))}
    </div>
  );
};

const QualityDots = ({ level }: { level: "Good" | "Great" | "Best" }) => {
  const filled = level === "Best" ? 3 : level === "Great" ? 2 : 1;
  return (
    <div className="flex gap-1 items-center">
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full ${i <= filled ? "bg-blue-500" : "bg-muted-foreground/20"}`}
        />
      ))}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LLMSettings() {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.settings.getModel.useQuery();
  const [pendingModel, setPendingModel] = useState<string | null>(null);

  const setModel = trpc.settings.setModel.useMutation({
    onSuccess: (result) => {
      utils.settings.getModel.invalidate();
      setPendingModel(null);
      toast.success(`Now using ${MODELS.find(m => m.id === result.model)?.name ?? result.model} for all AI tasks.`);
    },
    onError: (err) => {
      setPendingModel(null);
      toast.error(`Failed to update model: ${err.message}`);
    },
  });

  const currentModel = data?.model ?? "gemini-2.5-flash";

  const handleSelect = (modelId: string) => {
    if (modelId === currentModel) return;
    setPendingModel(modelId);
    setModel.mutate({ model: modelId });
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Model Settings</h1>
          <p className="text-muted-foreground mt-1">
            Choose which AI model powers impact analysis, draft generation, and change extraction.
            The selected model applies to all new AI tasks — existing drafts are not affected.
          </p>
        </div>

        {/* Current model banner */}
        {!isLoading && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-muted-foreground">
              Currently active:{" "}
              <span className="font-medium text-foreground">
                {MODELS.find(m => m.id === currentModel)?.name ?? currentModel}
              </span>
            </span>
          </div>
        )}

        {/* Model cards */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading model settings...
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {MODELS.map((model) => {
              const isActive = model.id === currentModel;
              const isPending = pendingModel === model.id;

              return (
                <Card
                  key={model.id}
                  className={`relative cursor-pointer transition-all duration-150 hover:shadow-md ${
                    isActive
                      ? "border-primary ring-1 ring-primary bg-primary/5"
                      : "hover:border-primary/40"
                  }`}
                  onClick={() => handleSelect(model.id)}
                >
                  {/* Active checkmark */}
                  {isActive && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    </div>
                  )}

                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-md ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {model.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base">{model.name}</CardTitle>
                          {model.badge && (
                            <Badge variant={model.badgeVariant ?? "default"} className="text-xs">
                              {model.badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{model.provider}</p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <CardDescription className="text-sm leading-relaxed">
                      {model.description}
                    </CardDescription>

                    {/* Speed / Quality */}
                    <div className="flex gap-6 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>Speed</span>
                        <SpeedDots level={model.speed} />
                        <span className="text-foreground font-medium">{model.speed}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>Quality</span>
                        <QualityDots level={model.quality} />
                        <span className="text-foreground font-medium">{model.quality}</span>
                      </div>
                    </div>

                    {/* Strengths */}
                    <div className="flex flex-wrap gap-1.5">
                      {model.strengths.map((s) => (
                        <span
                          key={s}
                          className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>

                    {/* Select button */}
                    <Button
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      className="w-full mt-1"
                      disabled={isActive || isPending || setModel.isPending}
                      onClick={(e) => { e.stopPropagation(); handleSelect(model.id); }}
                    >
                      {isPending ? (
                        <><Loader2 className="w-3 h-3 animate-spin mr-1.5" />Applying...</>
                      ) : isActive ? (
                        <><CheckCircle2 className="w-3 h-3 mr-1.5" />Active</>
                      ) : (
                        "Use this model"
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Note */}
        <p className="text-xs text-muted-foreground">
          Model selection is global and applies to all users. Changes take effect immediately for the next AI task run.
          Experimental models (Claude) may not support all structured output formats — if you see JSON parse errors, switch back to a Gemini model.
        </p>
    </div>
  );
}
