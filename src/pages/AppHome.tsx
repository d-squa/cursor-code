import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MediaPlanEditor } from "@/components/MediaPlanEditor";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Target, Zap, LogOut, Settings, Bug } from "lucide-react";

const AppHome = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [bugDialogOpen, setBugDialogOpen] = useState(false);

  // SubscriptionGuard handles all auth and subscription checks

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="ActiPlan" className="h-10 w-auto" />
              <p className="text-xs text-muted-foreground hidden md:block">Cross-Platform Activation Manager</p>
            </div>
            <nav className="flex items-center gap-2">
              <button
                onClick={() => navigate("/app/overview")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                Overview
              </button>
              <button
                onClick={() => navigate("/app/actiplans")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                ActiPlans
              </button>
              <button
                onClick={() => navigate("/app/insights")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                Insights
              </button>
              <button
                onClick={() => navigate("/app/creatives")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                Creative Mesh
              </button>
              <button
                onClick={() => navigate("/app/tasks")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                My Tasks
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBugDialogOpen(true)}
                className="gap-2"
                title="Report a Bug"
              >
                <Bug className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/app/settings")} className="gap-2">
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 mb-6">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Blueprint-driven workflow</span>
          </div>
          <h2 className="text-2xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent">
            Plan, Forecast & Launch A New ActiPlan using the blueprint-driven workflow for cross-platform activations
          </h2>
        </div>
      </section>

      {/* Main Editor */}
      <section className="container mx-auto px-4 pb-16">
        <MediaPlanEditor />
      </section>
    </div>
  );
};

export default AppHome;
