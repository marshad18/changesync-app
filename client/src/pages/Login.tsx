import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitBranch, Eye, EyeOff, ArrowRight, Shield, Zap, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

const FEATURES = [
  {
    icon: Zap,
    title: "AI Impact Analysis",
    desc: "Instantly identifies every document affected by an engineering change.",
  },
  {
    icon: FileText,
    title: "Automated Document Updates",
    desc: "AI reads your documents and generates precise, targeted revisions.",
  },
  {
    icon: Shield,
    title: "Approval Workflows",
    desc: "Route updated documents to the right approvers with one click.",
  },
];

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message || "Login failed. Please check your credentials.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Please enter your email and password.");
      return;
    }
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex" style={{ background: "oklch(0.09 0.018 255)" }}>
      {/* ── Left brand panel ─────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[52%] flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background: "linear-gradient(145deg, oklch(0.12 0.030 260) 0%, oklch(0.09 0.018 255) 60%)",
          borderRight: "1px solid oklch(0.22 0.022 255)",
        }}
      >
        {/* Decorative grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(0.94 0.008 240) 1px, transparent 1px), linear-gradient(90deg, oklch(0.94 0.008 240) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Glow orbs */}
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10 blur-[80px]"
          style={{ background: "oklch(0.58 0.22 260)" }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-[0.06] blur-[60px]"
          style={{ background: "oklch(0.65 0.18 200)" }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, oklch(0.58 0.22 260), oklch(0.52 0.20 280))",
              boxShadow: "0 4px 16px oklch(0.58 0.22 260 / 0.4)",
            }}
          >
            <GitBranch className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight text-foreground">ChangeSync</p>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Enterprise</p>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight leading-[1.15]" style={{ letterSpacing: "-0.03em" }}>
              Engineering change
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, oklch(0.72 0.18 255), oklch(0.65 0.20 280))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                at the speed of AI.
              </span>
            </h1>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-sm">
              The intelligent change management platform trusted by world-class manufacturing organisations. From part swaps to process updates — ChangeSync handles the documentation so your team can focus on the work.
            </p>
          </div>

          <div className="space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: "oklch(0.58 0.22 260 / 0.12)",
                    border: "1px solid oklch(0.58 0.22 260 / 0.2)",
                  }}
                >
                  <f.icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{f.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-[11px] text-muted-foreground/40">
            © {new Date().getFullYear()} ChangeSync. Built for manufacturing excellence.
          </p>
        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[400px] space-y-8">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3">
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 260), oklch(0.52 0.20 280))" }}
            >
              <GitBranch className="h-4 w-4 text-white" />
            </div>
            <p className="text-base font-bold tracking-tight">ChangeSync</p>
          </div>

          {/* Header */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight" style={{ letterSpacing: "-0.025em" }}>
              Welcome back
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              Sign in to your workspace to continue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="h-11 text-sm"
                style={{
                  background: "oklch(0.14 0.022 255)",
                  border: "1px solid oklch(0.25 0.022 255)",
                }}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Password
                </Label>
                <Link href="/forgot-password" className="text-xs text-primary hover:text-primary/80 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-11 text-sm pr-10"
                  style={{
                    background: "oklch(0.14 0.022 255)",
                    border: "1px solid oklch(0.25 0.022 255)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full gap-2 font-semibold h-11"
              disabled={loginMutation.isPending}
              style={{
                background: "linear-gradient(135deg, oklch(0.58 0.22 260), oklch(0.52 0.20 280))",
                border: "none",
                boxShadow: "0 4px 16px oklch(0.58 0.22 260 / 0.3)",
              }}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: "oklch(0.22 0.022 255)" }} />
            <span className="text-[11px] text-muted-foreground/50 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px" style={{ background: "oklch(0.22 0.022 255)" }} />
          </div>

          {/* Register link */}
          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary hover:text-primary/80 font-semibold transition-colors">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
