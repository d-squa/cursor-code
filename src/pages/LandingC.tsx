import { useState, useEffect } from "react";
import Autoplay from "embla-carousel-autoplay";
import SEO from "@/components/SEO";
import HeroVideoPlayer, { triggerHeroVideo } from "@/components/HeroVideoPlayer";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
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
  Puzzle,
  Lightbulb,
  Briefcase,
  SlidersHorizontal,
  Brain,
  Users,
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
    icon: Puzzle,
    title: "Creative Meshing",
    description:
      "Upload creatives from different platforms in bulk and ActiPlan will assign them automatically to your campaign shell.",
  },
  {
    icon: Lightbulb,
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
    icon: Briefcase,
    title: "Client Portfolio Management",
    description:
      "Organize your client ad accounts under one portfolio allowing higher performance & planning accuracy, maximum control and minimal mistakes",
  },
  {
    icon: SlidersHorizontal,
    title: "Portfolio Governance & Preferences",
    description:
      "Set client preferences, customize and auto-load the most important ad account and campaign configurations such as campaign taxonomy, campaign parameters, UTM tracking",
  },
  {
    icon: Brain,
    title: "AI-Powered Knowledge Base",
    description:
      "Ask ActiPlan's AI Knowledge Base anything from digital marketing concepts to optimization tips and get instant, expert answers.",
  },
  {
    icon: Users,
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
    cta: "Start 30-Day Free Trial",
    popular: false,
    note: "No credit card required!",
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
    cta: "Start 30-Day Free Trial",
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

  useEffect(() => {
    localStorage.setItem("actiplan_signup_source", "landing");
  }, []);

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
    <>
      <SEO
        title="AI Media Buyer | Cross-Platform Ad Management | ActiPlan"
        description="ActiPlan is a powerful AI media buyer that lets teams launch, manage, and optimize paid campaigns across Meta, Google, TikTok, LinkedIn, and more from one platform."
        keywords="ai media buyer, media buying Platform, paid media buying platform, ad buying Platform, cross-platform campaign management, programmatic workflow tool"
        ogTitle="ActiPlan | AI Media Buyer for Performance Teams"
        ogDescription="Launch and manage paid media campaigns across platforms using one centralized buying workflow."
        ogImage="https://storage.googleapis.com/gpt-engineer-file-uploads/VuvQwKFcSYVB8pjmkGgvmjMDEvF3/social-images/social-1767660811434-logo-product-square transparent.png"
        canonical="https://cursor-code-1uryu5q86-d-squas-projects.vercel.app/media-buying-software"
      />

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
                data-gtm="nav-capabilities"
              >
                Capabilities
              </button>
              <button
                onClick={() => scrollToSection("pricing")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-gtm="nav-pricing"
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
                data-gtm="nav-sign-in"
              >
                Sign In
              </Button>
              <Button
                onClick={() => navigate("/auth?mode=signup")}
                size="sm"
                className="text-xs md:text-sm px-2 md:px-4 whitespace-nowrap"
                data-gtm="nav-start-trial"
              >
                Start Trial
              </Button>
            </div>
          </nav>
        </header>

        {/* Hero Section */}
        <section className="container mx-auto px-4 md:py-32 py-[60px]">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="secondary" className="mb-4 md:mb-6 text-xs md:text-sm shadow-md border-transparent bg-gradient-to-r from-primary to-purple-600 text-primary-foreground hover:from-primary hover:to-purple-600">
              <Sparkles className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Professional AI Media Buyer</span>
              <span className="sm:hidden">Professional AI Media Buyer</span>
            </Badge>
            <h1 className="text-3xl sm:text-4xl mb-4 md:mb-6 leading-tight font-extrabold md:text-4xl">
              Launch & Manage
              <br />
              <span className="bg-[length:200%_auto] animate-gradient-x bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                Paid Campaigns Across Platform
              </span>
              <br />
              With One Buying Workflow
            </h1>
            <p className="text-base md:text-xl text-muted-foreground mb-6 md:mb-8 max-w-2xl mx-auto px-2">
              ActiPlan streamlines media buying by letting you create once and activate across Meta, Google, TikTok,
              LinkedIn, Snapchat, and more — eliminating duplication and manual errors.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center">
              <Button
                size="lg"
                onClick={() => navigate("/auth?mode=signup")}
                className="gap-2"
                data-gtm="hero-start-trial"
              >
                Start 30-Day Free Trial <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => scrollToSection("capabilities")}
                data-gtm="hero-see-capabilities"
              >
                See Capabilities
              </Button>
              <Button size="lg" variant="ghost" onClick={triggerHeroVideo} className="gap-2" data-gtm="hero-watch-demo">
                ▶ See How It Works
              </Button>
            </div>
            <ul className="flex flex-col sm:grid sm:grid-cols-2 gap-x-6 gap-y-2 max-w-lg mx-auto text-left mb-0 px-0 py-[20px]">
              {[
                "Launch campaigns across platforms in minutes",
                "Eliminate repetitive ad account setup",
                "Centralize buying, monitoring & optimization",
                "Built for agencies & performance marketers",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm md:text-base text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <HeroVideoPlayer />
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

            <div className="relative px-4 md:px-16 overflow-hidden">
              <Carousel
                opts={{ align: "start", loop: true, dragFree: false }}
                plugins={[
                  Autoplay({ delay: 3000, stopOnInteraction: false, stopOnMouseEnter: true, playOnInit: true }),
                ]}
                className="w-full"
              >
                <CarouselContent className="-ml-2 md:-ml-4">
                  {features.map((feature) => (
                    <CarouselItem key={feature.title} className="basis-[85%] pl-2 md:pl-4 md:basis-1/2 lg:basis-[24%]">
                      <Card className="bg-card hover:shadow-lg transition-shadow h-full">
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
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="hidden md:inline-flex -left-6" />
                <CarouselNext className="hidden md:inline-flex -right-6" />
              </Carousel>
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
                  <Switch
                    checked={isYearly}
                    onCheckedChange={setIsYearly}
                    className="data-[state=checked]:bg-primary"
                    data-gtm="pricing-billing-toggle"
                  />
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

            {/* Mobile: Carousel */}
            <div className="md:hidden relative px-4 overflow-hidden">
              <Carousel opts={{ align: "start", loop: false, dragFree: false, startIndex: 0 }} className="w-full">
                <CarouselContent className="-ml-2">
                  {pricingTiers.map((tier) => (
                    <CarouselItem key={tier.name} className="basis-[90%] pl-2 pt-3">
                      <Card
                        className={`relative flex flex-col h-full ${tier.popular ? "border-primary shadow-lg" : ""}`}
                      >
                        {tier.popular && (
                          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary z-10">
                            Most Popular
                          </Badge>
                        )}
                        <CardHeader className="pb-4">
                          <CardTitle>{tier.name}</CardTitle>
                          <div className="mt-2">
                            {tier.monthlyPrice === 0 ? (
                              <div>
                                <span className="text-3xl font-bold">Free</span>
                                <span className="text-muted-foreground ml-1">{tier.period}</span>
                              </div>
                            ) : isYearly ? (
                              <div className="space-y-1">
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
                                <div>
                                  <span className="text-3xl font-bold">${formatPrice(tier.yearlyMonthly)}</span>
                                  <span className="text-muted-foreground">/month</span>
                                </div>
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
                          <div className="bg-muted/50 rounded-lg p-3 mb-4 text-sm">
                            <span className="font-medium">{tier.operationalLimits}</span>
                          </div>
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
                            data-gtm={`pricing-cta-${tier.key}`}
                          >
                            {tier.cta}
                          </Button>
                          {(tier.key === "enterprise" || tier.key === "agency") && (
                            <Button
                              variant="ghost"
                              className="w-full mt-2"
                              onClick={() => navigate("/book-demo")}
                              data-gtm={`pricing-book-demo-${tier.key}`}
                            >
                              Book a Demo
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            className="w-full mt-2 text-xs"
                            onClick={() => navigate("/compare-plans")}
                            data-gtm={`pricing-compare-${tier.key}`}
                          >
                            Compare Plans
                          </Button>
                        </CardContent>
                      </Card>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
            </div>

            {/* Desktop: Grid */}
            <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-7xl mx-auto px-4">
              {pricingTiers.map((tier) => (
                <Card
                  key={tier.name}
                  className={`relative flex flex-col h-full ${tier.popular ? "border-primary shadow-lg" : ""}`}
                >
                  {tier.popular && (
                    <Badge className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary z-10">
                      Most Popular
                    </Badge>
                  )}
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base">{tier.name}</CardTitle>
                    <div className="mt-2">
                      {tier.monthlyPrice === 0 ? (
                        <div>
                          <span className="text-2xl font-bold">Free</span>
                          <span className="text-muted-foreground text-sm ml-1">{tier.period}</span>
                        </div>
                      ) : isYearly ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-muted-foreground line-through">
                              ${formatPrice(tier.monthlyPrice)}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            >
                              -{getSavingsPercentage(tier.monthlyPrice, tier.yearlyMonthly)}%
                            </Badge>
                          </div>
                          <div>
                            <span className="text-2xl font-bold">${formatPrice(tier.yearlyMonthly)}</span>
                            <span className="text-muted-foreground text-sm">/mo</span>
                          </div>
                          <div className="text-xs text-muted-foreground pt-1 border-t mt-1">
                            ${formatPrice(tier.yearlyTotal)} billed yearly
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="text-2xl font-bold">${formatPrice(tier.monthlyPrice)}</span>
                          <span className="text-muted-foreground text-sm">/mo</span>
                        </div>
                      )}
                    </div>
                    <CardDescription className="mt-2 text-xs">{tier.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <div className="bg-muted/50 rounded-lg p-2 mb-3 text-xs">
                      <span className="font-medium">{tier.operationalLimits}</span>
                    </div>
                    <Button
                      className="w-full"
                      size="sm"
                      variant={tier.popular ? "default" : "outline"}
                      onClick={() => navigate("/auth?mode=signup")}
                      data-gtm={`pricing-cta-${tier.key}`}
                    >
                      {tier.cta}
                    </Button>
                    {(tier.key === "enterprise" || tier.key === "agency") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-xs"
                        onClick={() => navigate("/book-demo")}
                        data-gtm={`pricing-book-demo-${tier.key}`}
                      >
                        Book a Demo
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 text-xs"
                      onClick={() => navigate("/compare-plans")}
                      data-gtm={`pricing-compare-${tier.key}`}
                    >
                      Compare Plans
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <p className="text-center text-sm text-muted-foreground mt-8">
              All signups start with a 30-day free trial on Basic Monthly. No credit card required!
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
                <Button
                  size="lg"
                  onClick={() => navigate("/auth?mode=signup")}
                  className="gap-2"
                  data-gtm="cta-bottom-start-trial"
                >
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
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} ActiPlan. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default Landing;
