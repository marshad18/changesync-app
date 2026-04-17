import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import NewChange from "./pages/NewChange";
import ChangeDetail from "./pages/ChangeDetail";
import DocumentLibrary from "./pages/DocumentLibrary";
import DraftReview from "./pages/DraftReview";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import UserManagement from "./pages/UserManagement";

// Public auth routes — rendered without DashboardLayout
const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

function Router() {
  const [location] = useLocation();
  const isAuthRoute = AUTH_ROUTES.some((r) => location.startsWith(r));

  if (isAuthRoute) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
      </Switch>
    );
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
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
