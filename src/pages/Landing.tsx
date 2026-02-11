import { useState } from "react";
import SEO from "@/components/SEO";
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
     <SEO
  title="ActiPlan: Create One Campaign Blueprint & Activate Across All Platforms"
  description="ActiPlan lets media planners and agencies create a single campaign blueprint and automatically deploy it across multiple platforms like Meta, TikTok, Google, LinkedIn, Pinterest & more. Save time, reduce duplication, and scale campaigns efficiently."
  keywords="cross-platform campaign, AI media planning, paid media automation, campaign blueprint, media planning tool, media buying platform, bulk ad deployment, digital marketing software"
  ogTitle="ActiPlan: Create One Campaign Blueprint & Activate Across All Platforms"
  ogDescription="Create a single campaign blueprint in ActiPlan and deploy it automatically across multiple platforms. Save time, reduce duplication, and scale campaigns efficiently."
  ogImage="https://storage.googleapis.com/gpt-engineer-file-uploads/VuvQwKFcSYVB8pjmkGgvmjMDEvF3/social-images/social-1767660811434-logo-product-square transparent.png"
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
{/* Pricing Section */} <section id="pricing" className="py-20 bg-muted/50"> <div className="container mx-auto px-4"> <div className="text-center mb-12"> <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, Transparent Pricing</h2> <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8"> Start with a 30-day free trial on Basic Monthly. Upgrade anytime to unlock more features. </p> {/* Billing Toggle */} <div className="flex items-center justify-center gap-4 mb-4"> <span className={text-sm font-medium ${!isYearly ? "text-foreground" : "text-muted-foreground"}}> Monthly </span> <div className="relative"> <Switch checked={isYearly} onCheckedChange={setIsYearly} className="data-[state=checked]:bg-primary" /> </div> <span className={text-sm font-medium ${isYearly ? "text-foreground" : "text-muted-foreground"}}> Yearly </span> </div> {/* Savings Banner */} <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full"> <Sparkles className="h-4 w-4" /> <span className="font-semibold">Save 15% with yearly billing!</span> </div> </div> <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6 max-w-7xl mx-auto"> {pricingTiers.map((tier) => ( <Card key={tier.name} className={relative flex flex-col ${tier.popular ? "border-primary shadow-lg lg:scale-105" : ""}} > {tier.popular && ( <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">Most Popular</Badge> )} <CardHeader className="pb-4"> <CardTitle>{tier.name}</CardTitle> {/* Pricing Display */} <div className="mt-2"> {tier.monthlyPrice === 0 ? ( <div> <span className="text-3xl font-bold">Free</span> <span className="text-muted-foreground ml-1">{tier.period}</span> </div> ) : isYearly ? ( <div className="space-y-1"> {/* Strikethrough monthly price */} <div className="flex items-center gap-2"> <span className="text-lg text-muted-foreground line-through"> ${formatPrice(tier.monthlyPrice)} </span> <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" > -{getSavingsPercentage(tier.monthlyPrice, tier.yearlyMonthly)}% </Badge> </div> {/* Yearly equivalent monthly price */} <div> <span className="text-3xl font-bold">${formatPrice(tier.yearlyMonthly)}</span> <span className="text-muted-foreground">/month</span> </div> {/* Total yearly commitment */} <div className="text-sm text-muted-foreground pt-1 border-t mt-2"> <span className="font-medium text-foreground">${formatPrice(tier.yearlyTotal)}</span> <span> billed yearly</span> </div> </div> ) : ( <div> <span className="text-3xl font-bold">${formatPrice(tier.monthlyPrice)}</span> <span className="text-muted-foreground">/month</span> </div> )} </div> <CardDescription className="mt-2">{tier.description}</CardDescription> </CardHeader> <CardContent className="flex-1 flex flex-col"> {/* Operational Limits */} <div className="bg-muted/50 rounded-lg p-3 mb-4 text-sm"> <span className="font-medium">{tier.operationalLimits}</span> </div> {/* Features */} <ul className="space-y-2 mb-4 flex-1"> {tier.features.map((feature) => ( <li key={feature} className="flex items-start gap-2 text-sm"> <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" /> <span>{feature}</span> </li> ))} {tier.limitations.map((limit) => ( <li key={limit} className="flex items-start gap-2 text-sm text-muted-foreground"> <X className="h-4 w-4 flex-shrink-0 mt-0.5 opacity-50" /> <span>{limit}</span> </li> ))} </ul> {tier.note && <p className="text-xs text-muted-foreground mb-4">{tier.note}</p>} <Button className="w-full mt-auto" variant={tier.popular ? "default" : "outline"} onClick={() => navigate("/auth?mode=signup")} > {tier.cta} </Button> {(tier.key === "enterprise" || tier.key === "agency") && ( <Button variant="ghost" className="w-full mt-2" onClick={() => navigate("/book-demo")}> Book a Demo </Button> )} </CardContent> </Card> ))} </div> <p className="text-center text-sm text-muted-foreground mt-8"> All signups start with a 30-day free trial on Basic Monthly. Credit card required. Cancel anytime! </p> </div> </section> {/* CTA Section */} <section className="py-20"> <div className="container mx-auto px-4"> <Card className="max-w-3xl mx-auto bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20"> <CardContent className="p-8 md:p-12 text-center"> <h2 className="text-2xl md:text-3xl font-bold mb-4"> Ready to Transform Your Media Team To ActiPlanners? </h2> <p className="text-muted-foreground mb-8 max-w-xl mx-auto"> Start your 30-day free trial today and experience the power of cross-platform activation management. </p> <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="gap-2"> Start Free Trial <ArrowRight className="h-4 w-4" /> </Button> </CardContent> </Card> </div> </section> {/* Footer */} <footer className="py-12 border-t bg-muted/30"> <div className="container mx-auto px-4"> <div className="flex flex-col md:flex-row items-center justify-between gap-4"> <div className="flex items-center gap-3"> <img src="/logo.png" alt="ActiPlan" className="h-8 w-auto" /> </div> <div className="flex items-center gap-6 text-sm text-muted-foreground"> <Link to="/terms" className="hover:text-foreground transition-colors"> Terms & Conditions </Link> <Link to="/privacy" className="hover:text-foreground transition-colors"> Privacy Policy </Link> </div> <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ActiPlan. All rights reserved.</p> </div> </div> </footer>
    </div>
  );
};

export default Landing;
