import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
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
    <div className="min-h-screen flex">

      {/* ── Left brand panel — navy ──────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[48%] flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background: "linear-gradient(160deg, oklch(0.28 0.060 265) 0%, oklch(0.20 0.040 260) 50%, oklch(0.16 0.030 255) 100%)",
        }}
      >
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle, oklch(1 0 0) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center"
            style={{ background: "oklch(1 0 0 / 0.15)", border: "1px solid oklch(1 0 0 / 0.25)" }}
          >
            <GitBranch className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight text-white">ChangeSync</p>
            <p className="text-[10px] text-white/50 uppercase tracking-widest">Enterprise</p>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1
              className="text-4xl font-bold tracking-tight leading-[1.15] text-white"
              style={{ letterSpacing: "-0.03em" }}
            >
              Engineering change
              <br />
              <span style={{ color: "oklch(0.82 0.12 200)" }}>at the speed of AI.</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed max-w-sm" style={{ color: "oklch(1 0 0 / 0.65)" }}>
              The intelligent change management platform trusted by world-class manufacturing organisations. From part swaps to process updates — ChangeSync handles the documentation so your team can focus on the work.
            </p>
          </div>

          <div className="space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: "oklch(1 0 0 / 0.10)", border: "1px solid oklch(1 0 0 / 0.18)" }}
                >
                  <f.icon className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: "oklch(1 0 0 / 0.55)" }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-[11px]" style={{ color: "oklch(1 0 0 / 0.35)" }}>
            © {new Date().getFullYear()} ChangeSync. Built for manufacturing excellence.
          </p>
        </div>
      </div>

      {/* ── Right form panel — white ─────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-[400px] space-y-8">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3">
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, oklch(0.42 0.18 265), oklch(0.36 0.16 275))" }}
            >
              <GitBranch className="h-4 w-4 text-white" />
            </div>
            <p className="text-base font-bold tracking-tight text-foreground">ChangeSync</p>
          </div>

          {/* Header */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground" style={{ letterSpacing: "-0.025em" }}>
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
                className="h-11 text-sm bg-card border-border text-foreground placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Password
                </Label>
                <Link href="/forgot-password" className="text-xs font-medium transition-colors" style={{ color: "oklch(0.42 0.18 265)" }}>
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
                  className="h-11 text-sm pr-10 bg-card border-border text-foreground placeholder:text-muted-foreground/50"
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
              className="w-full gap-2 font-semibold h-11 text-white"
              disabled={loginMutation.isPending}
              style={{
                background: "linear-gradient(135deg, oklch(0.42 0.18 265), oklch(0.36 0.16 275))",
                border: "none",
                boxShadow: "0 4px 12px oklch(0.42 0.18 265 / 0.25)",
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
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Register link */}
          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="font-semibold transition-colors" style={{ color: "oklch(0.42 0.18 265)" }}>
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
