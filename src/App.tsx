import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import AppHome from "./pages/AppHome";
import Overview from "./pages/Overview";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import ChoosePlan from "./pages/ChoosePlan";
import ManageClientAccounts from "./pages/ManageClientAccounts";
import Teams from "./pages/Teams";
import Settings from "./pages/Settings";
import ActiPlans from "./pages/ActiPlans";
import Performance from "./pages/Performance";
import PerformanceReport from "./pages/PerformanceReport";
import AcceptInvitation from "./pages/AcceptInvitation";
import Clients from "./pages/Clients";
import UserManagement from "./pages/settings/UserManagement";
import AccountSettings from "./pages/settings/AccountSettings";
import PlanManagement from "./pages/settings/PlanManagement";
import BillingManagement from "./pages/settings/BillingManagement";
import PlatformConnections from "./pages/PlatformConnections";
import LaunchStatus from "./pages/LaunchStatus";
import InsightsRecommendations from "./pages/InsightsRecommendations";
import OperationsAnalytics from "./pages/OperationsAnalytics";
import OperationsReports from "./pages/settings/OperationsReports";
import CreativeLibrary from "./pages/CreativeLibrary";
import CreativeMatching from "./pages/CreativeMatching";
import TaskManagement from "./pages/TaskManagement";
import NotFound from "./pages/NotFound";
import { BugReportButton } from "./components/BugReportButton";
import { SubscriptionGuard } from "./components/SubscriptionGuard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
            <Route path="/choose-plan" element={<ChoosePlan />} />
            
            {/* Protected app routes - require subscription */}
            <Route path="/overview" element={<SubscriptionGuard><Overview /></SubscriptionGuard>} />
            <Route path="/app" element={<SubscriptionGuard><AppHome /></SubscriptionGuard>} />
            <Route path="/app/new" element={<SubscriptionGuard><Navigate to="/app" replace /></SubscriptionGuard>} />
            <Route path="/actiplans" element={<SubscriptionGuard><ActiPlans /></SubscriptionGuard>} />
            <Route path="/actiplans/:campaignId/launch" element={<SubscriptionGuard><LaunchStatus /></SubscriptionGuard>} />
            <Route path="/actiplans/:campaignId/report" element={<SubscriptionGuard><PerformanceReport /></SubscriptionGuard>} />
            <Route path="/actiplans/:campaignId/insights" element={<SubscriptionGuard><InsightsRecommendations /></SubscriptionGuard>} />
            <Route path="/insights" element={<SubscriptionGuard><InsightsRecommendations /></SubscriptionGuard>} />
            <Route path="/operations-analytics" element={<SubscriptionGuard><OperationsAnalytics /></SubscriptionGuard>} />
            <Route path="/tasks" element={<SubscriptionGuard><TaskManagement /></SubscriptionGuard>} />
            <Route path="/performance/:id" element={<SubscriptionGuard><Performance /></SubscriptionGuard>} />
            <Route path="/performance" element={<SubscriptionGuard><Performance /></SubscriptionGuard>} />
            <Route path="/clients" element={<SubscriptionGuard><Clients /></SubscriptionGuard>} />
            <Route path="/creatives" element={<SubscriptionGuard><CreativeLibrary /></SubscriptionGuard>} />
            <Route path="/creatives/match" element={<SubscriptionGuard><CreativeMatching /></SubscriptionGuard>} />
            <Route path="/manage-accounts" element={<SubscriptionGuard><ManageClientAccounts /></SubscriptionGuard>} />
            <Route path="/teams" element={<SubscriptionGuard><Teams /></SubscriptionGuard>} />
            <Route path="/settings" element={<SubscriptionGuard><Settings /></SubscriptionGuard>}>
              <Route index element={<Navigate to="/settings/users" replace />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="accounts" element={<ManageClientAccounts />} />
              <Route path="platforms" element={<PlatformConnections />} />
              <Route path="teams" element={<Teams />} />
              <Route path="account" element={<AccountSettings />} />
              <Route path="plans" element={<PlanManagement />} />
              <Route path="billing" element={<BillingManagement />} />
              <Route path="operations-reports" element={<OperationsReports />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          
          {/* Global floating bug report button */}
          <BugReportButton />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
