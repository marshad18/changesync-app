import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, Link } from "wouter";
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
  const [, setLocation] = useLocation();
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
    <div className="min-h-screen flex" style={{ background: "oklch(0.09 0.018 255)" }}>
      {/* ── Left brand panel ─────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[48%] flex-col justify-between p-12 relative overflow-hidden"
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
          className="absolute top-1/3 right-1/4 w-80 h-80 rounded-full opacity-10 blur-[80px]"
          style={{ background: "oklch(0.58 0.22 260)" }}
        />
        <div
          className="absolute bottom-1/4 left-1/4 w-56 h-56 rounded-full opacity-[0.06] blur-[60px]"
          style={{ background: "oklch(0.65 0.18 145)" }}
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
              Start managing
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, oklch(0.72 0.18 255), oklch(0.65 0.20 280))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                changes smarter.
              </span>
            </h1>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-sm">
              Join manufacturing teams at world-class organisations who use ChangeSync to eliminate documentation errors and accelerate change approvals.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest mb-4">
              What you get
            </p>
            {BENEFITS.map((b) => (
              <div key={b} className="flex items-center gap-3">
                <div
                  className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "oklch(0.65 0.18 145 / 0.15)", border: "1px solid oklch(0.65 0.18 145 / 0.3)" }}
                >
                  <CheckCircle2 className="h-3 w-3" style={{ color: "oklch(0.65 0.18 145)" }} />
                </div>
                <p className="text-sm text-muted-foreground">{b}</p>
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
        <div className="w-full max-w-[420px] space-y-7">
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
              Create your account
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              Get started with ChangeSync in seconds.
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
                className="h-11 text-sm"
                style={{ background: "oklch(0.14 0.022 255)", border: "1px solid oklch(0.25 0.022 255)" }}
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
                className="h-11 text-sm"
                style={{ background: "oklch(0.14 0.022 255)", border: "1px solid oklch(0.25 0.022 255)" }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 8 chars"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-11 text-sm pr-10"
                    style={{ background: "oklch(0.14 0.022 255)", border: "1px solid oklch(0.25 0.022 255)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Confirm
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Re-enter"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-11 text-sm pr-10"
                    style={{
                      background: "oklch(0.14 0.022 255)",
                      border: `1px solid ${!passwordsMatch ? "oklch(0.55 0.22 25)" : "oklch(0.25 0.022 255)"}`,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirm ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            {!passwordsMatch && (
              <p className="text-xs" style={{ color: "oklch(0.65 0.20 25)" }}>
                Passwords do not match
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full gap-2 font-semibold h-11 mt-2"
              disabled={registerMutation.isPending || !passwordsMatch}
              style={{
                background: "linear-gradient(135deg, oklch(0.58 0.22 260), oklch(0.52 0.20 280))",
                border: "none",
                boxShadow: "0 4px 16px oklch(0.58 0.22 260 / 0.3)",
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
            <div className="flex-1 h-px" style={{ background: "oklch(0.22 0.022 255)" }} />
            <span className="text-[11px] text-muted-foreground/50 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px" style={{ background: "oklch(0.22 0.022 255)" }} />
          </div>

          {/* Login link */}
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:text-primary/80 font-semibold transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
