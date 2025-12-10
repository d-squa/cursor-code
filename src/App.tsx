import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import AppHome from "./pages/AppHome";
import Auth from "./pages/Auth";
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
import NotFound from "./pages/NotFound";
import { BugReportButton } from "./components/BugReportButton";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
          <Routes>
            {/* Public landing page */}
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
            
            {/* Authenticated app routes */}
            <Route path="/app" element={<AppHome />} />
            <Route path="/actiplans" element={<ActiPlans />} />
            <Route path="/actiplans/:campaignId/launch" element={<LaunchStatus />} />
            <Route path="/actiplans/:campaignId/report" element={<PerformanceReport />} />
            <Route path="/performance/:id" element={<Performance />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/manage-accounts" element={<ManageClientAccounts />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/settings" element={<Settings />}>
              <Route index element={<Navigate to="/settings/users" replace />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="accounts" element={<ManageClientAccounts />} />
              <Route path="platforms" element={<PlatformConnections />} />
              <Route path="teams" element={<Teams />} />
              <Route path="account" element={<AccountSettings />} />
              <Route path="plans" element={<PlanManagement />} />
              <Route path="billing" element={<BillingManagement />} />
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
