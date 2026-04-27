import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";

// Helper: redirect legacy /foo/* paths to /app/foo/* preserving the rest of the path + search/hash
const LegacyRedirect = ({ prefix }: { prefix: string }) => {
  const location = useLocation();
  const params = useParams();
  const splat = (params as any)["*"] || "";
  const target = `${prefix}${splat ? `/${splat}` : ""}${location.search}${location.hash}`;
  return <Navigate to={target} replace />;
};
import Landing from "./pages/Landing";
import ComparePlans from "./pages/ComparePlans";
import LandingB from "./pages/LandingB";
import LandingC from "./pages/LandingC";
import LandingD from "./pages/LandingD";
import LandingE from "./pages/LandingE";
import LandingF from "./pages/LandingF";
import BookDemo from "./pages/BookDemo";
import BookDemoConfirmation from "./pages/BookDemoConfirmation";
import TermsAndConditions from "./pages/TermsAndConditions";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import AppHome from "./pages/AppHome";
import Overview from "./pages/Overview";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
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
import UsageMonitoring from "./components/settings/UsageMonitoring";
import CreativeLibrary from "./pages/CreativeLibrary";
import CreativeMatching from "./pages/CreativeMatching";
import TaskManagement from "./pages/TaskManagement";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/AdminDashboard";
import { BugReportButton } from "./components/BugReportButton";
import { SubscriptionGuard } from "./components/SubscriptionGuard";
import { AIAssistantSidebar } from "./components/AIAssistantSidebar";
import { ExtensionModeProvider } from "./contexts/ExtensionModeContext";
import { TourDataProvider } from "./contexts/TourDataContext";
import { SampleModeProvider } from "./contexts/SampleModeContext";

import { TourRibbon } from "./components/TourRibbon";
import { SampleModeBadge } from "./components/SampleModeBadge";
import { useLocation } from "react-router-dom";

const AppOnlyTourUI = () => {
  const location = useLocation();
  if (!location.pathname.startsWith("/app")) return null;
  return (
    <>
      <TourRibbon />
      <SampleModeBadge />
    </>
  );
};
import { MarketingGTM } from "./components/MarketingGTM";
import { DataLayerUserID } from "./components/DataLayerUserID";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TourDataProvider>
          <SampleModeProvider>
          <MarketingGTM />
          <DataLayerUserID />
          <TourRibbon />
          <SampleModeBadge />
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/compare-plans" element={<ComparePlans />} />
            <Route path="/book-demo" element={<BookDemo />} />
            <Route path="/book-demo/confirmation" element={<BookDemoConfirmation />} />
            <Route path="/terms" element={<TermsAndConditions />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/generic" element={<LandingB />} />
            <Route path="/media-buying-software" element={<LandingC />} />
            <Route path="/media-planning-software" element={<LandingD />} />
            <Route path="/ai-media-buying-software" element={<LandingE />} />
            <Route path="/cross-platform-ad-management-software" element={<LandingF />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
            <Route path="/choose-plan" element={<ChoosePlan />} />
            
            {/* Protected app routes - require subscription. All app routes live under /app/* */}
            <Route path="/app" element={<SubscriptionGuard><ExtensionModeProvider><AppHome /></ExtensionModeProvider></SubscriptionGuard>} />
            <Route path="/app/new" element={<SubscriptionGuard><ExtensionModeProvider><Navigate to="/app" replace /></ExtensionModeProvider></SubscriptionGuard>} />
            <Route path="/app/overview" element={<SubscriptionGuard><Overview /></SubscriptionGuard>} />
            <Route path="/app/actiplans" element={<SubscriptionGuard><ActiPlans /></SubscriptionGuard>} />
            <Route path="/app/actiplans/:campaignId/launch" element={<SubscriptionGuard><LaunchStatus /></SubscriptionGuard>} />
            <Route path="/app/actiplans/:campaignId/report" element={<SubscriptionGuard><PerformanceReport /></SubscriptionGuard>} />
            <Route path="/app/actiplans/:campaignId/insights" element={<SubscriptionGuard><InsightsRecommendations /></SubscriptionGuard>} />
            <Route path="/app/insights" element={<SubscriptionGuard><InsightsRecommendations /></SubscriptionGuard>} />
            <Route path="/app/operations-analytics" element={<SubscriptionGuard><OperationsAnalytics /></SubscriptionGuard>} />
            <Route path="/app/tasks" element={<SubscriptionGuard><TaskManagement /></SubscriptionGuard>} />
            <Route path="/app/performance/:id" element={<SubscriptionGuard><Performance /></SubscriptionGuard>} />
            <Route path="/app/performance" element={<SubscriptionGuard><Performance /></SubscriptionGuard>} />
            <Route path="/app/clients" element={<SubscriptionGuard><Clients /></SubscriptionGuard>} />
            <Route path="/app/creatives" element={<SubscriptionGuard><CreativeMatching /></SubscriptionGuard>} />
            <Route path="/app/creatives/match" element={<SubscriptionGuard><Navigate to="/app/creatives" replace /></SubscriptionGuard>} />
            <Route path="/app/creatives/library" element={<SubscriptionGuard><CreativeLibrary /></SubscriptionGuard>} />
            <Route path="/app/manage-accounts" element={<SubscriptionGuard><ManageClientAccounts /></SubscriptionGuard>} />
            <Route path="/app/teams" element={<SubscriptionGuard><Teams /></SubscriptionGuard>} />
            <Route path="/app/settings" element={<SubscriptionGuard><Settings /></SubscriptionGuard>}>
              <Route index element={<Navigate to="/app/settings/users" replace />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="accounts" element={<ManageClientAccounts />} />
              <Route path="platforms" element={<PlatformConnections />} />
              <Route path="teams" element={<Teams />} />
              <Route path="account" element={<AccountSettings />} />
              <Route path="plans" element={<PlanManagement />} />
              <Route path="billing" element={<BillingManagement />} />
              <Route path="operations-reports" element={<OperationsReports />} />
              <Route path="usage" element={<UsageMonitoring />} />
            </Route>
            <Route path="/app/admin" element={<AdminDashboard />} />

            {/* Legacy redirects: old root paths -> /app/* (preserve subpaths via splat) */}
            <Route path="/overview" element={<Navigate to="/app/overview" replace />} />
            <Route path="/actiplans/*" element={<LegacyRedirect prefix="/app/actiplans" />} />
            <Route path="/insights/*" element={<LegacyRedirect prefix="/app/insights" />} />
            <Route path="/operations-analytics" element={<Navigate to="/app/operations-analytics" replace />} />
            <Route path="/tasks" element={<Navigate to="/app/tasks" replace />} />
            <Route path="/performance/*" element={<LegacyRedirect prefix="/app/performance" />} />
            <Route path="/clients" element={<Navigate to="/app/clients" replace />} />
            <Route path="/creatives/*" element={<LegacyRedirect prefix="/app/creatives" />} />
            <Route path="/manage-accounts" element={<Navigate to="/app/manage-accounts" replace />} />
            <Route path="/teams" element={<Navigate to="/app/teams" replace />} />
            <Route path="/settings/*" element={<LegacyRedirect prefix="/app/settings" />} />
            <Route path="/admin" element={<Navigate to="/app/admin" replace />} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          
          {/* Global floating components */}
          <BugReportButton />
          <AIAssistantSidebar />
          </SampleModeProvider>
        </TourDataProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
