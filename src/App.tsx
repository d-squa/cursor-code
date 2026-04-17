import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import { TourResumeButton } from "./components/TourResumeButton";
import { TourRibbon } from "./components/TourRibbon";
import { SampleModeBadge } from "./components/SampleModeBadge";
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
            
            {/* Protected app routes - require subscription */}
            <Route path="/overview" element={<SubscriptionGuard><Overview /></SubscriptionGuard>} />
            <Route path="/app" element={<SubscriptionGuard><ExtensionModeProvider><AppHome /></ExtensionModeProvider></SubscriptionGuard>} />
            <Route path="/app/new" element={<SubscriptionGuard><ExtensionModeProvider><Navigate to="/app" replace /></ExtensionModeProvider></SubscriptionGuard>} />
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
            <Route path="/creatives" element={<SubscriptionGuard><CreativeMatching /></SubscriptionGuard>} />
            <Route path="/creatives/match" element={<SubscriptionGuard><Navigate to="/creatives" replace /></SubscriptionGuard>} />
            <Route path="/creatives/library" element={<SubscriptionGuard><CreativeLibrary /></SubscriptionGuard>} />
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
              <Route path="usage" element={<UsageMonitoring />} />
            </Route>
            <Route path="/admin" element={<AdminDashboard />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          
          {/* Global floating components */}
          <BugReportButton />
          <AIAssistantSidebar />
          <TourResumeButton onResume={() => (window as any).__resumeOnboardingTour?.()} />
          </SampleModeProvider>
        </TourDataProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
