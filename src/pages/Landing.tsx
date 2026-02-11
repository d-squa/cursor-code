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

const benefits = [
  {
    icon: Zap,
    title: "Faster Execution",
    description: "From plan to launch in just a few minutes",
  },
  {
    icon: Layers,
    title: "Centralized Clarity",
    description: "One dashboard. Zero chaos.",
  },
  {
    icon: Target,
    title: "Standardized Creation",
    description: "Consistent workflow for every team.",
  },
  {
    icon: TrendingUp,
    title: "Scale Easily",
    description: "ActiPlan flexes with your team.",
  },
];
const supportingbullets = [
  {
    icon: TrendingUp,
    title: "Predict campaign delivery before launch.",
  },
  {
    icon: TrendingUp,
    title: "Activate ads across platforms in one workflow.",
  },
  {
    icon: TrendingUp,
    title: "Replace spreadsheets with AI-driven planning.",
  },
  {
    icon: TrendingUp,
    title: "Built by agency veterans for agencies & performance teams.",
  },
];

const features = [
  {
    icon: Sparkles,
    title: "Ready-To-Run Planning",
    description:
      "Create AI-assisted, ready-to-run media plans with clear deliverables, cost breakdowns, KPIs, and benchmarks — all in minutes.",
  },
  {
    icon: Globe,
    title: "Bulk Cross-Platform Activation",
    description:
      "Plan, launch and monitor your paid media campaigns across all major ad platforms from one intuitive centralized activation tool.",
  },
  {
    icon: Switch,
    title: "Creative Meshing",
    description:
      "Upload creatives from different platforms in bulk and ActiPlan will assign them automatically to your campaign shell.",
  },
  {
    icon: Zap,
    title: "Live Insights & Recommendations",
    description:
      "Get on-the-go campaign insights and AI-driven recommendations to boost performance without switching between tools.",
  },
  {
    icon: BarChart3,
    title: "Real-time Performance Dashboard",
    description:
      "Visualize cross-platform ad performance in real time with dedicated campaign dashboards that combine planned and actual results.",
  },
  {
    icon: Shield,
    title: "Media Plan Approvals",
    description:
      "Streamline your media planning process from brainstorming to execution with built-in approval workflows that keep everyone in the loop.",
  },
  {
    icon: Globe,
    title: "Client Portfolio Management",
    description:
      "Organize your client ad accounts under one portfolio allowing higher performance & planning accuracy, maximum control and minimal mistakes",
  },
  {
    icon: Switch,
    title: "Portfolio Governance & Preferences",
    description:
      "Set client preferences, customize and auto-load the most important ad account and campaign configurations such as campaign taxonomy, campaign parameters, UTM tracking",
  },
  {
    icon: Layers,
    title: "AI-Powered Knowledge Base",
    description:
      "Ask ActiPlan's AI Knowledge Base anything from digital marketing concepts to optimization tips and get instant, expert answers.",
  },
  {
    icon: Target,
    title: "Team Management",
    description:
      "Structure your campaign workflow to match your team's hierarchy, and collaborate seamlessly across activation stakeholders.",
  },
];

// Stripe Price IDs
const PRICE_IDS = {
  basic: {
    monthly: "price_1ScnObKrTGU4P754AAJ9Q5NU",
    yearly: "price_1ScnL9KrTGU4P754QirsF0Sd",
  },
  freelancer: {
    monthly: "price_1SyXF5KrTGU4P7548Gb4bgd6",
    yearly: "price_1SyXYDKrTGU4P75427F7A2ge",
  },
  enterprise: {
    monthly: "price_1SyX3xKrTGU4P754lgSWx7dq",
    yearly: "price_1SyX8xKrTGU4P754mXynM6Qn",
  },
  agency: {
    monthly: "price_1SyXAnKrTGU4P754hsNny2H7",
    yearly: "price_1SyXD1KrTGU4P7541vWVImFY",
  },
};

const pricingTiers = [
  {
    key: "trial",
    name: "Trial",
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyMonthly: 0,
    yearlyTotal: 0,
    period: "30 days free",
    description: "Perfect for exploring ActiPlan capabilities",
    features: [
      "1 ActiPlan per day",
      "Intuitive Campaign creator",
      "Media plan creator",
      "Visual Dashboard",
      "Bulk cross-platform activation",
      "Live insights & recommendations",
      "Email support",
    ],
    limitations: [
      "Priority support",
      "Advanced reporting",
      "Advanced performance dashboard",
      "Approval & Requests workflows",
      "Task Management & Change history",
      "Export & Share",
      "Creative meshing",
      "Client portfolio management",
      "Operations statistics",
    ],
    operationalLimits: "1 ActiPlan/Day • 1 Owner",
    cta: "Start Free Trial",
    popular: false,
    note: "Credit card required. Cancel anytime!",
  },
  {
    key: "basic",
    name: "Basic",
    monthlyPrice: 39,
    yearlyPrice: 397.8,
    yearlyMonthly: 33.15,
    yearlyTotal: 397.8,
    period: "/month",
    description: "For individual media buyers getting started",
    features: [
      "1 ActiPlan per day",
      "Intuitive Campaign creator",
      "Media plan creator",
      "Visual Dashboard",
      "Bulk cross-platform activation",
      "Live insights & recommendations",
      "Email support",
    ],
    limitations: [
      "Priority support",
      "Advanced reporting",
      "Advanced performance dashboard",
      "Approval & Requests workflows",
      "Task Management & Change history",
      "Export & Share",
      "Creative meshing",
      "Client portfolio management",
      "Operations statistics",
    ],
    operationalLimits: "1 ActiPlan/Day • 1 Owner • 1 ad account/platform",
    cta: "Get Started",
    popular: false,
  },
  {
    key: "freelancer",
    name: "Freelancer",
    monthlyPrice: 99,
    yearlyPrice: 1009.8,
    yearlyMonthly: 84.15,
    yearlyTotal: 1009.8,
    period: "/month",
    description: "For growing professionals",
    features: [
      "2 ActiPlans per day",
      "1 user connection per platform",
      "3 ad accounts per platform",
      "3 ad account swaps/month",
      "Everything in Basic",
      "Priority support",
      "Advanced reporting",
    ],
    limitations: [
      "Advanced performance dashboard",
      "Approval & Requests workflows",
      "Task Management & Change history",
      "Export & Share",
      "Creative meshing",
      "Client portfolio management",
      "Operations statistics",
    ],
    operationalLimits: "2 ActiPlans/Day • 1 Owner • 3 ad accounts/platform",
    cta: "Get Started",
    popular: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    monthlyPrice: 249,
    yearlyPrice: 2539.8,
    yearlyMonthly: 211.65,
    yearlyTotal: 2539.8,
    period: "/month",
    description: "For teams and growing agencies",
    features: [
      "5 ActiPlans per day",
      "3 user connections per platform",
      "150 ad accounts per platform",
      "3 ad account swaps/month",
      "Everything in Freelancer",
      "Guaranteed planning",
      "All-levels duplication",
      "Advanced performance dashboard",
      "Approval & Requests workflows",
      "Task Management & Change history",
      "Export & Share",
      "Creative meshing",
      "5 team members",
    ],
    limitations: [
      "Client portfolio management",
      "Client preferences & safeguards",
      "AI knowledge base",
      "Operations statistics",
      "Cross-platform taxonomy",
    ],
    operationalLimits: "5 ActiPlans/Day • 5 team members • 150 ad accounts",
    cta: "Get Started",
    popular: false,
  },
  {
    key: "agency",
    name: "Agency",
    monthlyPrice: 699,
    yearlyPrice: 7129.8,
    yearlyMonthly: 594.15,
    yearlyTotal: 7129.8,
    period: "/month",
    description: "For large agencies with dedicated support",
    features: [
      "Unlimited ActiPlans per day",
      "6 user connections per platform",
      "300 ad accounts per platform",
      "6 ad account swaps/month",
      "Everything in Enterprise",
      "Client portfolio management",
      "Client preferences & safeguards",
      "AI knowledge base",
      "Operations statistics",
      "Cross-platform unified taxonomy",
      "10 team members",
      "Dedicated support",
      "Platform onboarding included",
    ],
    limitations: [],
    operationalLimits: "Unlimited • 10 team members • 300 ad accounts",
    cta: "Get Started",
    popular: false,
  },
];

// Removed - using benefits array instead

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
      <section className="container mx-auto px-4 py-12 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-4 md:mb-6 text-xs md:text-sm">
            <Sparkles className="h-3 w-3 mr-1" />
            <span className="hidden sm:inline">
              AI-Powered Media Planning & Buying Software for Cross-Platform Paid Ads Activations
            </span>
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4 md:mb-6 leading-tight">
            Plan, Forecast & Launch
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Cross-Platform Campaigns
            </span>
            <br />
            From One Unified Workspace in Minutes
          </h1>
          <p className="text-base md:text-xl text-muted-foreground mb-6 md:mb-8 max-w-2xl mx-auto px-2">
            ActiPlan is Built for professional media buyers managing Meta, TikTok, Google, LinkedIn, Snapchat, Pinterest
            & more at scale.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="gap-2">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => scrollToSection("capabilities")}>
              See Capabilities
            </Button>
          </div>
        </div>
        {/* supporting bullets */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {supportingbullets.map((supportingbullets) => (
            <Card key={supportingbullets.title} className="bg-card hover:shadow-lg transition-shadow text-center">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                  <benefit.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{benefit.title}</CardTitle>
              </CardHeader>
            </Card>
          ))}
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
              approvals, and collaborate with your team — all in one centralized dashboard.
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

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Start with a 30-day free trial on Basic Monthly. Upgrade anytime to unlock more features.
            </p>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <span className={`text-sm font-medium ${!isYearly ? "text-foreground" : "text-muted-foreground"}`}>
                Monthly
              </span>
              <div className="relative">
                <Switch checked={isYearly} onCheckedChange={setIsYearly} className="data-[state=checked]:bg-primary" />
              </div>
              <span className={`text-sm font-medium ${isYearly ? "text-foreground" : "text-muted-foreground"}`}>
                Yearly
              </span>
            </div>

            {/* Savings Banner */}
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full">
              <Sparkles className="h-4 w-4" />
              <span className="font-semibold">Save 15% with yearly billing!</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6 max-w-7xl mx-auto">
            {pricingTiers.map((tier) => (
              <Card
                key={tier.name}
                className={`relative flex flex-col ${tier.popular ? "border-primary shadow-lg lg:scale-105" : ""}`}
              >
                {tier.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">Most Popular</Badge>
                )}
                <CardHeader className="pb-4">
                  <CardTitle>{tier.name}</CardTitle>

                  {/* Pricing Display */}
                  <div className="mt-2">
                    {tier.monthlyPrice === 0 ? (
                      <div>
                        <span className="text-3xl font-bold">Free</span>
                        <span className="text-muted-foreground ml-1">{tier.period}</span>
                      </div>
                    ) : isYearly ? (
                      <div className="space-y-1">
                        {/* Strikethrough monthly price */}
                        <div className="flex items-center gap-2">
                          <span className="text-lg text-muted-foreground line-through">
                            ${formatPrice(tier.monthlyPrice)}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          >
                            -{getSavingsPercentage(tier.monthlyPrice, tier.yearlyMonthly)}%
                          </Badge>
                        </div>
                        {/* Yearly equivalent monthly price */}
                        <div>
                          <span className="text-3xl font-bold">${formatPrice(tier.yearlyMonthly)}</span>
                          <span className="text-muted-foreground">/month</span>
                        </div>
                        {/* Total yearly commitment */}
                        <div className="text-sm text-muted-foreground pt-1 border-t mt-2">
                          <span className="font-medium text-foreground">${formatPrice(tier.yearlyTotal)}</span>
                          <span> billed yearly</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="text-3xl font-bold">${formatPrice(tier.monthlyPrice)}</span>
                        <span className="text-muted-foreground">/month</span>
                      </div>
                    )}
                  </div>

                  <CardDescription className="mt-2">{tier.description}</CardDescription>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col">
                  {/* Operational Limits */}
                  <div className="bg-muted/50 rounded-lg p-3 mb-4 text-sm">
                    <span className="font-medium">{tier.operationalLimits}</span>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2 mb-4 flex-1">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                    {tier.limitations.map((limit) => (
                      <li key={limit} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <X className="h-4 w-4 flex-shrink-0 mt-0.5 opacity-50" />
                        <span>{limit}</span>
                      </li>
                    ))}
                  </ul>

                  {tier.note && <p className="text-xs text-muted-foreground mb-4">{tier.note}</p>}

                  <Button
                    className="w-full mt-auto"
                    variant={tier.popular ? "default" : "outline"}
                    onClick={() => navigate("/auth?mode=signup")}
                  >
                    {tier.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8">
            All signups start with a 30-day free trial on Basic Monthly. Credit card required. Cancel anytime!
          </p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <Card className="max-w-3xl mx-auto bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <CardContent className="p-8 md:p-12 text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Ready to Transform Your Media Team To ActiPlanners?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Start your 30-day free trial today and experience the power of cross-platform activation management.
              </p>
              <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="gap-2">
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="ActiPlan" className="h-8 w-auto" />
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link to="/terms" className="hover:text-foreground transition-colors">
                Terms & Conditions
              </Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ActiPlan. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
