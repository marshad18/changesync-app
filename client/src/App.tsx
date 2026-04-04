import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import NewChange from "./pages/NewChange";
import ChangeDetail from "./pages/ChangeDetail";
import DocumentLibrary from "./pages/DocumentLibrary";
import DraftReview from "./pages/DraftReview";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/changes/new" component={NewChange} />
      <Route path="/changes/:id" component={ChangeDetail} />
      <Route path="/documents" component={DocumentLibrary} />
      <Route path="/drafts/:id" component={DraftReview} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <DashboardLayout>
            <Router />
          </DashboardLayout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
