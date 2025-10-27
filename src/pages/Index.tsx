import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MediaPlanEditor } from "@/components/MediaPlanEditor";
import { GoogleAdsForecastTest } from "@/components/GoogleAdsForecastTest";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Target, TrendingUp, Zap, LogOut, Loader2 } from "lucide-react";

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
                <Target className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  CampaignHub
                </h1>
                <p className="text-xs text-muted-foreground">Multi-Platform Campaign Manager</p>
              </div>
            </div>
            <nav className="flex items-center gap-2">
              <button 
                onClick={() => navigate("/platforms")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                Connect Platforms
              </button>
              <button className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors">
                Dashboard
              </button>
              <button className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors">
                Campaigns
              </button>
              <button className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors">
                Analytics
              </button>
              <Button variant="outline" size="sm" onClick={signOut} className="gap-2 ml-2">
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
            <span className="text-sm font-medium text-primary">Unified Campaign Management</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent">
            Create Cross-Platform Campaigns in Minutes
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl">
            Build, optimize, and launch paid advertising campaigns across Meta, Google Ads, LinkedIn, TikTok, 
            Snapchat, and Pinterest from a single interface.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border shadow-sm">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Unified Planning</h3>
                <p className="text-sm text-muted-foreground">One media plan across all platforms</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border shadow-sm">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Smart Optimization</h3>
                <p className="text-sm text-muted-foreground">Auto-translate objectives to platform goals</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border shadow-sm">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Instant Launch</h3>
                <p className="text-sm text-muted-foreground">Deploy to all platforms at once</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Google Ads API Test */}
      <section className="container mx-auto px-4 pb-8">
        <GoogleAdsForecastTest />
      </section>

      {/* Main Editor */}
      <section className="container mx-auto px-4 pb-16">
        <MediaPlanEditor />
      </section>
    </div>
  );
};

export default Index;
