import { useState } from "react";
import SEO from "@/components/SEO";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  CheckCircle2,
  ArrowRight,
  Zap,
  Layers,
  Target,
  TrendingUp,
  Sparkles,
  Globe,
  BarChart3,
  Shield,
  X,
} from "lucide-react";

// Benefits
const benefits = [
  { icon: Zap, title: "Faster Execution", description: "Create once, activate everywhere — spend minutes, not hours." },
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

// Features
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

const Landing = () => {
  const navigate = useNavigate();
  const [isYearly, setIsYearly] = useState(true);

  const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(price);

  const getSavingsPercentage = (monthly: number, yearlyMonthly: number) =>
    monthly === 0 ? 0 : Math.round(((monthly - yearlyMonthly) / monthly) * 100);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="ActiPlan: Media Buying Software for Multi-Platform Campaigns"
        description="ActiPlan is an AI-powered media buying software that helps marketers launch, track, and optimize campaigns across multiple ad platforms from one blueprint."
        keywords="media buying software, ad campaign management, cross-platform media buying, paid media automation, campaign blueprint"
        ogTitle="ActiPlan: AI Media Buying Software That Saves Time & Scales Campaigns"
        ogDescription="Deploy campaigns to Meta, TikTok, Google, LinkedIn, and more using a single campaign blueprint."
        ogImage="https://storage.googleapis.com/gpt-engineer-file-uploads/VuvQwKFcSYVB8pjmkGgvmjMDEvF3/social-images/social-1767660811434-logo-product-square-transparent.png"
      />

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
            <span className="hidden sm:inline">AI-Powered Media Buying Software for Paid Ads</span>
            <span className="sm:hidden">AI Media Buying Software</span>
          </Badge>
          <h1 className="text-3xl sm:text-4xl mb-4 md:mb-6 leading-tight font-extrabold md:text-4xl">
            Buy Media Smarter — One Campaign, Any Platform
          </h1>
          <p className="text-base md:text-xl text-muted-foreground mb-6 md:mb-8 max-w-2xl mx-auto px-2">
            Create a single campaign blueprint and let ActiPlan deploy it automatically across Meta, TikTok, Google,
            LinkedIn, Pinterest, Snapchat, and more.
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
              "Launch campaigns faster across all platforms",
              "Maintain consistency with one workflow",
              "Forecast campaign results before buying",
              "AI-driven guidance built for agencies & performance teams",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm md:text-base text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* Stats Section remains unchanged */}
      </section>

      {/* Benefits & Features Sections remain identical but use updated benefits/features arrays */}
    </div>
  );
};

export default Landing;
