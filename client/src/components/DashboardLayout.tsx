import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  LogOut,
  GitBranch,
  FileText,
  Users,
  ChevronLeft,
  ChevronRight,
  Settings,
  Bell,
  Shield,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  {
    section: "WORKSPACE",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/" },
      { icon: GitBranch, label: "Change Events", path: "/changes/new" },
      { icon: FileText, label: "Document Library", path: "/documents" },
    ],
  },
];

const adminItems = [
  { icon: Users, label: "User Management", path: "/admin/users" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% 0%, oklch(0.16 0.035 260 / 0.4), transparent), oklch(0.09 0.018 255)",
        }}
      >
        <div className="flex flex-col items-center gap-8 p-10 max-w-sm w-full">
          {/* Logo mark */}
          <div className="flex flex-col items-center gap-4">
            <div className="h-14 w-14 rounded-2xl gradient-primary flex items-center justify-center shadow-lg">
              <GitBranch className="h-7 w-7 text-white" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-tight">ChangeSync</h1>
              <p className="text-sm text-muted-foreground mt-1">Enterprise Change Management</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Sign in to access your workspace
            </p>
          </div>
          <Button
            onClick={() => {
              window.history.pushState(null, "", "/login");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
            size="lg"
            className="w-full gradient-primary border-0 shadow-lg hover:opacity-90 transition-opacity font-medium"
          >
            Sign in to continue
          </Button>
        </div>
      </div>
    );
  }

  const sidebarW = collapsed ? 72 : 256;

  return (
    <div className="flex min-h-screen" style={{ background: "oklch(0.09 0.018 255)" }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className="flex flex-col shrink-0 transition-all duration-300 ease-in-out relative"
        style={{
          width: sidebarW,
          background: "linear-gradient(180deg, oklch(0.11 0.022 255) 0%, oklch(0.10 0.020 255) 100%)",
          borderRight: "1px solid oklch(0.22 0.022 255)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center h-16 px-4 shrink-0"
          style={{ borderBottom: "1px solid oklch(0.22 0.022 255)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, oklch(0.58 0.22 260), oklch(0.52 0.20 280))",
                boxShadow: "0 2px 8px oklch(0.58 0.22 260 / 0.35)",
              }}
            >
              <GitBranch className="h-4 w-4 text-white" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight text-foreground truncate">
                  ChangeSync
                </p>
                <p className="text-[10px] text-muted-foreground/60 truncate tracking-wide uppercase">
                  Enterprise
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
          {navItems.map((section) => (
            <div key={section.section}>
              {!collapsed && (
                <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
                  {section.section}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = location === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => setLocation(item.path)}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group",
                        isActive
                          ? "bg-primary/12 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                      )}
                      style={
                        isActive
                          ? {
                              boxShadow: "inset 0 0 0 1px oklch(0.58 0.22 260 / 0.2)",
                            }
                          : undefined
                      }
                    >
                      <item.icon
                        className={cn(
                          "shrink-0 transition-colors",
                          collapsed ? "h-5 w-5" : "h-4 w-4",
                          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {isActive && !collapsed && (
                        <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Admin section */}
          {user?.role === "admin" && (
            <div>
              {!collapsed && (
                <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
                  Administration
                </p>
              )}
              <div className="space-y-0.5">
                {adminItems.map((item) => {
                  const isActive = location === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => setLocation(item.path)}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group",
                        isActive
                          ? "bg-primary/12 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "shrink-0",
                          collapsed ? "h-5 w-5" : "h-4 w-4",
                          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* User profile footer */}
        <div
          className="p-3 shrink-0"
          style={{ borderTop: "1px solid oklch(0.22 0.022 255)" }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  collapsed && "justify-center"
                )}
              >
                <Avatar className="h-8 w-8 shrink-0 border border-border">
                  <AvatarFallback
                    className="text-xs font-semibold"
                    style={{
                      background: "linear-gradient(135deg, oklch(0.58 0.22 260 / 0.3), oklch(0.52 0.20 280 / 0.3))",
                      color: "oklch(0.72 0.18 255)",
                    }}
                  >
                    {user?.name?.charAt(0).toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate text-foreground leading-none">
                      {user?.name || "User"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate mt-1">
                      {user?.email || ""}
                    </p>
                  </div>
                )}
                {!collapsed && user?.role === "admin" && (
                  <Shield className="h-3 w-3 text-primary/60 shrink-0" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              className="w-52 mb-1"
              style={{
                background: "oklch(0.14 0.022 255)",
                border: "1px solid oklch(0.22 0.022 255)",
              }}
            >
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-semibold text-foreground">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{user?.email}</p>
                {user?.role === "admin" && (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-semibold uppercase tracking-wider text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">
                    <Shield className="h-2.5 w-2.5" /> Admin
                  </span>
                )}
              </div>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={() => {
                  const { logout } = useAuth as any;
                }}
                className="cursor-pointer text-muted-foreground focus:text-foreground"
              >
                <Settings className="mr-2 h-3.5 w-3.5" />
                <span className="text-xs">Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={() => {
                  // Call logout via window reload to avoid hook-outside-component issue
                  document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
                  window.location.href = "/login";
                }}
                className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="mr-2 h-3.5 w-3.5" />
                <span className="text-xs">Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border border-border bg-card flex items-center justify-center hover:bg-accent transition-colors z-10 shadow-sm"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronLeft className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="h-14 flex items-center justify-between px-6 shrink-0 sticky top-0 z-30"
          style={{
            background: "oklch(0.09 0.018 255 / 0.95)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid oklch(0.22 0.022 255)",
          }}
        >
          <div className="flex items-center gap-2">
            {/* Breadcrumb placeholder — pages can override this */}
            <div id="page-breadcrumb" />
          </div>
          <div className="flex items-center gap-2">
            <button className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <Bell className="h-4 w-4" />
            </button>
            <div
              className="h-6 w-px mx-1"
              style={{ background: "oklch(0.22 0.022 255)" }}
            />
            <Avatar className="h-7 w-7 border border-border cursor-pointer">
              <AvatarFallback
                className="text-[10px] font-semibold"
                style={{
                  background: "linear-gradient(135deg, oklch(0.58 0.22 260 / 0.3), oklch(0.52 0.20 280 / 0.3))",
                  color: "oklch(0.72 0.18 255)",
                }}
              >
                {user?.name?.charAt(0).toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
