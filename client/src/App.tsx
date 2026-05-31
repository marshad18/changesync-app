import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import NewChange from "./pages/NewChange";
import ChangeDetail from "./pages/ChangeDetail";
import DocumentLibrary from "./pages/DocumentLibrary";
import DraftReview from "./pages/DraftReview";
import UserManagement from "./pages/UserManagement";
import ApprovalPage from "./pages/ApprovalPage";
import LLMSettings from "./pages/LLMSettings";

function Router() {
  const [location] = useLocation();

  // /approve is a standalone page for external approvers (no sidebar needed)
  if (location.startsWith("/approve")) {
    return (
      <Switch>
        <Route path="/approve" component={ApprovalPage} />
      </Switch>
    );
  }

  // Redirect stale auth routes to home — login is no longer required
  if (
    location.startsWith("/login") ||
    location.startsWith("/forgot-password") ||
    location.startsWith("/reset-password")
  ) {
    return <Redirect to="/" />;
  }

  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/changes/new" component={NewChange} />
        <Route path="/changes/:id" component={ChangeDetail} />
        <Route path="/documents" component={DocumentLibrary} />
        <Route path="/drafts/:id" component={DraftReview} />
        <Route path="/admin/users" component={UserManagement} />
        <Route path="/settings/llm" component={LLMSettings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
