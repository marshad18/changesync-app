import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitBranch, Eye, EyeOff, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const BENEFITS = [
  "AI-powered impact analysis across all documents",
  "Automated draft generation for impacted files",
  "One-click approval routing to document owners",
  "Full audit trail for every change event",
  "GitHub integration for document sync",
];

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message || "Registration failed. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error("Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    registerMutation.mutate({ name, email, password });
  };

  const passwordsMatch = confirmPassword.length === 0 || password === confirmPassword;

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
              Join the future
              <br />
              <span style={{ color: "oklch(0.82 0.12 200)" }}>of change management.</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed max-w-sm" style={{ color: "oklch(1 0 0 / 0.65)" }}>
              Set up your workspace in minutes and start managing engineering changes with AI precision.
            </p>
          </div>

          <div className="space-y-3">
            {BENEFITS.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "oklch(0.82 0.12 200)" }} />
                <p className="text-sm" style={{ color: "oklch(1 0 0 / 0.75)" }}>{benefit}</p>
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
      <div className="flex-1 flex items-center justify-center p-8 bg-background overflow-y-auto">
        <div className="w-full max-w-[420px] space-y-7 py-8">

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
              Create your account
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              Set up your workspace and get started today.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Full name
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="h-11 text-sm bg-card border-border text-foreground placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Work email
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
              <Label htmlFor="password" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
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

            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Confirm password
              </Label>
              <div className="relative">
                <Input
                  id="confirm"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className={`h-11 text-sm pr-10 bg-card border-border text-foreground placeholder:text-muted-foreground/50 ${
                    !passwordsMatch ? "border-destructive" : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {!passwordsMatch && (
                <p className="text-xs text-destructive">Passwords do not match.</p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full gap-2 font-semibold h-11 text-white mt-2"
              disabled={registerMutation.isPending || !passwordsMatch}
              style={{
                background: "linear-gradient(135deg, oklch(0.42 0.18 265), oklch(0.36 0.16 275))",
                border: "none",
                boxShadow: "0 4px 12px oklch(0.42 0.18 265 / 0.25)",
              }}
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  Create account
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

          {/* Login link */}
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold transition-colors" style={{ color: "oklch(0.42 0.18 265)" }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
