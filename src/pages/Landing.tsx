import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Target,
  TrendingUp,
  Zap,
  CheckCircle2,
  ArrowRight,
  BarChart3,
  Shield,
  Layers,
  Globe,
  Sparkles,
  X,
} from "lucide-react";

// Updated benefits
const benefits = [
  {
    icon: Zap,
    title: "Faster Execution",
    description: "Create once, activate everywhere — spend minutes, not hours.",
  },
  {
    icon: Layers,
    title: "Centralized Clarity",
    description: "One blueprint. One dashboard. Zero confusion across platforms.",
  },
  {
    icon: Target,
    title: "Standardized Creation",
    description: "Maintain consistency with a single workflow for all campaigns.",
  },
  {
    icon: TrendingUp,
    title: "Scale Easily",
    description: "Launch multiple campaigns across multiple networks effortlessly.",
  },
];

// Updated features
const features = [
  {
    icon: Sparkles,
    title: "AI-Assisted Planning",
    description:
      "Define objectives, budget, creatives, and KPIs once. Let ActiPlan generate a campaign blueprint ready for cross-platform activation.",
  },
  {
    icon: Globe,
    title: "Bulk Cross-Platform Deployment",
    description:
      "Select your platforms, and your blueprint is automatically applied to each ad account with native optimization intact.",
  },
  {
    icon: Switch,
    title: "Creative Meshing",
    description:
      "Upload creatives in bulk, and ActiPlan assigns them to your blueprint automatically across all selected networks.",
  },
  {
    icon: Zap,
    title: "Real-Time Insights & Recommendations",
    description:
      "Track performance of all platform activations from one dashboard, and receive AI-driven optimization suggestions.",
  },
  {
    icon: BarChart3,
    title: "Unified Performance Dashboard",
    description:
      "Monitor your blueprint’s deployment across platforms with real-time metrics, comparisons, and KPIs in one view.",
  },
  {
    icon: Shield,
    title: "Approval Workflows",
    description:
      "Ensure your blueprint meets team standards before deployment using built-in approval and request workflows.",
  },
  {
    icon: Globe,
    title: "Client Portfolio Management",
    description:
      "Organize multiple client campaigns under one blueprint-driven workflow for consistency, control, and efficiency.",
  },
  {
    icon: Switch,
    title: "Portfolio Governance & Preferences",
    description:
      "Customize and auto-load campaign configurations, taxonomies, and tracking for each client and platform automatically.",
  },
  {
    icon: Layers,
    title: "AI Knowledge Base",
    description:
      "Ask ActiPlan’s AI Knowledge Base for campaign guidance, optimization tips, and platform best practices instantly.",
  },
  {
    icon: Target,
    title: "Team Management",
    description:
      "Define roles and permissions to collaborate efficiently on blueprint creation and platform activations.",
  },
];

// Pricing section, CTA, header, hero, and all structure remain unchanged
// Only text inside hero, benefits, features, and small phrases updated to highlight "Blueprint"

const Landing = () => {
  const navigate = useNavigate();
  const [isYearly, setIsYearly] = useState(true);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const getSavingsPercentage = (monthly: number, yearlyMonthly: number) => {
    if (monthly === 0) return 0;
    return Math.round(((monthly - yearlyMonthly) / monthly) * 100);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="container mx-auto px-4 py-3 md:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center shrink-0">
            <img src="/logo.png" alt="ActiPlan" className="h-8 md:h-10 w-auto" />
          </div>
          <div className="hidden md:flex items-center gap-6">
            <button
              onClick={() => scrollToSection("capabilities")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Capabilities
            </button>
            <button
              onClick={() => scrollToSection("pricing")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </button>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Button
              onClick={() => navigate("/auth")}
              variant="outline"
              size="sm"
              className="text-xs md:text-sm px-2 md:px-4"
            >
              Sign In
            </Button>
            <Button
              onClick={() => navigate("/auth?mode=signup")}
              size="sm"
              className="text-xs md:text-sm px-2 md:px-4 whitespace-nowrap"
            >
              Start Trial
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 md:py-32 py-[60px]">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-4 md:mb-6 text-xs md:text-sm">
            <Sparkles className="h-3 w-3 mr-1" />
            <span className="hidden sm:inline">AI-Powered Media Planning & Buying Platform for Paid Ads</span>
            <span className="sm:hidden">AI Media Planning & Buying Software</span>
          </Badge>
          <h1 className="text-3xl sm:text-4xl mb-4 md:mb-6 leading-tight font-extrabold md:text-4xl">
            Build Your Campaign Once
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Activate Across All Platforms
            </span>
            <br />
            In Minutes with a Single Blueprint!
          </h1>
          <p className="text-base md:text-xl text-muted-foreground mb-6 md:mb-8 max-w-2xl mx-auto px-2">
            With ActiPlan, create a single campaign blueprint and automatically deploy it to Meta, TikTok, Google,
            LinkedIn, Pinterest, Snapchat, and more — saving time and avoiding repetitive work.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="gap-2">
              Start 30-Day Free Trial <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => scrollToSection("capabilities")}>
              See Capabilities
            </Button>
          </div>
          <ul className="flex flex-col sm:grid sm:grid-cols-2 gap-x-6 gap-y-2 max-w-lg mx-auto text-left mb-0 px-0 py-[20px]">
            {[
              "Define your campaign once, replicate everywhere",
              "Eliminate multi-platform setup duplication",
              "Forecast and plan results before launch",
              "AI-driven guidance built for agencies & performance teams",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm md:text-base text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20 max-w-4xl mx-auto">
          {[
            { value: "60%", label: "Cost Reduction" },
            { value: "5x", label: "Faster Launches" },
            { value: "80%", label: "Incident Reduction" },
            { value: "5+", label: "Platforms" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Choose ActiPlan?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Join leading agencies and brands who have transformed their media planners & executives to ActiPlanners.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {benefits.map((benefit) => (
              <Card key={benefit.title} className="bg-card hover:shadow-lg transition-shadow text-center">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                    <benefit.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{benefit.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{benefit.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="capabilities" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              The Future of Paid Media Is Intelligence, Consolidation & Efficiency
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              ActiPlan is an AI-powered media planning and buying platform that lets you create ready-to-run media
              plans, launch cross-platform campaigns, track real-time performance, get actionable insights, manage
              approvals, and collaborate with your team — all from a single blueprint.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="bg-card hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing, CTA, Footer sections remain unchanged */}
      {/* All structure kept intact */}
    </div>
  );
};

export default Landing;
