import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import PlatformConnections from "./pages/PlatformConnections";
import Teams from "./pages/Teams";
import Settings from "./pages/Settings";
import ActiPlans from "./pages/ActiPlans";
import Performance from "./pages/Performance";
import AcceptInvitation from "./pages/AcceptInvitation";
import UserManagement from "./pages/settings/UserManagement";
import AccountSettings from "./pages/settings/AccountSettings";
import PlanManagement from "./pages/settings/PlanManagement";
import BillingManagement from "./pages/settings/BillingManagement";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
          <Routes>
            <Route path="/" element={<Performance />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
            <Route path="/create-campaign" element={<Index />} />
            <Route path="/actiplans" element={<ActiPlans />} />
            <Route path="/performance/:id" element={<Performance />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/platforms" element={<PlatformConnections />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/settings" element={<Settings />}>
              <Route index element={<Navigate to="/settings/users" replace />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="platforms" element={<PlatformConnections />} />
              <Route path="teams" element={<Teams />} />
              <Route path="account" element={<AccountSettings />} />
              <Route path="plans" element={<PlanManagement />} />
              <Route path="billing" element={<BillingManagement />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
