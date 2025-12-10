import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  X
} from "lucide-react";

const capabilities = [
  {
    icon: Target,
    title: "Guided Media Plan Creation",
    description: "Build comprehensive media plans with step-by-step guidance that ensures no detail is missed."
  },
  {
    icon: Sparkles,
    title: "AI-Powered Plan Generation",
    description: "Create base plans from high-level text prompts using advanced AI that understands your marketing goals."
  },
  {
    icon: Layers,
    title: "Excel & Sheets Import",
    description: "Seamlessly import existing media plans from Microsoft Excel or Google Sheets."
  },
  {
    icon: BarChart3,
    title: "Media Cost & Benchmarks",
    description: "Get accurate cost estimates and industry benchmarks for informed decision-making."
  },
  {
    icon: TrendingUp,
    title: "Performance Reports",
    description: "Track actual vs planned performance with comprehensive topline reports."
  },
  {
    icon: Globe,
    title: "Cross-Platform Activation",
    description: "Launch campaigns across Meta, Google, TikTok, LinkedIn, Snapchat & Pinterest simultaneously."
  },
  {
    icon: Zap,
    title: "Live Insights & Recommendations",
    description: "Real-time campaign insights with AI-powered optimization recommendations."
  },
  {
    icon: Shield,
    title: "Approval Workflows",
    description: "Enterprise-grade approval processes for campaign launches and modifications."
  }
];

// Stripe Price IDs
const PRICE_IDS = {
  basic: {
    monthly: "price_1ScnObKrTGU4P754AAJ9Q5NU",
    yearly: "price_1ScnL9KrTGU4P754QirsF0Sd"
  },
  freelancer: {
    monthly: "price_1ScnOcKrTGU4P754y5pmh5jf",
    yearly: "price_1ScnNYKrTGU4P754hbyoSjdc"
  },
  enterprise: {
    monthly: "price_1ScnOdKrTGU4P7542mtt9uyC",
    yearly: "price_1ScnOOKrTGU4P754r7bdJ94j"
  },
  agency: {
    monthly: "price_1ScnOeKrTGU4P75446dvndr3",
    yearly: "price_1ScnOPKrTGU4P754sNgouHiL"
  }
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
      "Guided Media Plan Creation",
      "ActiPlan Creation (Media Cost, Deliverables & Benchmark)",
      "Topline Performance Report",
      "Cross-Platform Campaign Activation",
      "Live Insights & Recommendations"
    ],
    limitations: ["Visual Performance Dashboard", "Approval Workflow", "HawkView Reports", "AI Knowledge Base", "Team Management"],
    operationalLimits: "1 ActiPlan/Day & 1 Owner",
    cta: "Start Free Trial",
    popular: false,
    note: "No credit card required"
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
      "Guided Media Plan Creation",
      "ActiPlan Creation (Media Cost, Deliverables & Benchmark)",
      "Topline Performance Report",
      "Cross-Platform Campaign Activation",
      "Live Insights & Recommendations",
      "Visual Performance Dashboard"
    ],
    limitations: ["Approval Workflow", "HawkView Reports", "AI Knowledge Base", "Team Management"],
    operationalLimits: "1 ActiPlan/Day & 1 Owner",
    cta: "Get Started",
    popular: false
  },
  {
    key: "freelancer",
    name: "Freelancer",
    monthlyPrice: 89,
    yearlyPrice: 907.8,
    yearlyMonthly: 75.65,
    yearlyTotal: 907.8,
    period: "/month",
    description: "For professional media planners",
    features: [
      "Guided Media Plan Creation",
      "ActiPlan Creation (Media Cost, Deliverables & Benchmark)",
      "Topline Performance Report",
      "Cross-Platform Campaign Activation",
      "Live Insights & Recommendations",
      "Visual Performance Dashboard"
    ],
    limitations: ["Approval Workflow", "HawkView Reports", "AI Knowledge Base", "Team Management"],
    operationalLimits: "2 ActiPlans/Day & 1 Owner",
    cta: "Get Started",
    popular: true
  },
  {
    key: "enterprise",
    name: "Enterprise",
    monthlyPrice: 189,
    yearlyPrice: 1927.8,
    yearlyMonthly: 160.65,
    yearlyTotal: 1927.8,
    period: "/month",
    description: "For teams and growing agencies",
    features: [
      "Guided Media Plan Creation",
      "ActiPlan Creation (Media Cost, Deliverables & Benchmark)",
      "Topline Performance Report",
      "Cross-Platform Campaign Activation",
      "Live Insights & Recommendations",
      "Visual Performance Dashboard",
      "Approval Workflow",
      "HawkView Intuitive Performance Report",
      "AI-based Knowledge Base",
      "Users, Accesses & Permissions"
    ],
    limitations: ["Team Management", "Account Manager Support"],
    operationalLimits: "5 ActiPlans/Day, 1 Owner & 4 Team Members",
    cta: "Get Started",
    popular: false
  },
  {
    key: "agency",
    name: "Agency",
    monthlyPrice: 999,
    yearlyPrice: 10189.8,
    yearlyMonthly: 849.15,
    yearlyTotal: 10189.8,
    period: "/month",
    description: "For large agencies with dedicated support",
    features: [
      "Guided Media Plan Creation",
      "ActiPlan Creation (Media Cost, Deliverables & Benchmark)",
      "Topline Performance Report",
      "Cross-Platform Campaign Activation",
      "Live Insights & Recommendations",
      "Visual Performance Dashboard",
      "Approval Workflow",
      "HawkView Intuitive Performance Report",
      "AI-based Knowledge Base",
      "Users, Accesses & Permissions",
      "Team Management",
      "Account Manager + Working Hours Support"
    ],
    limitations: [],
    operationalLimits: "Unlimited ActiPlans, 1 Owner, 1 Admin & 8 Team Members",
    cta: "Get Started",
    popular: false
  }
];

const advantages = [
  {
    title: "Reduce Operational Costs by 40%",
    description: "Eliminate manual work and human errors with automated campaign creation and management."
  },
  {
    title: "Scale Without Hiring",
    description: "Handle 3x more campaigns with the same team using intelligent automation."
  },
  {
    title: "Launch Campaigns 5x Faster",
    description: "From media plan to live campaign in minutes, not hours."
  },
  {
    title: "Zero Learning Curve",
    description: "Intuitive interface designed for media buyers, by media buyers."
  }
];

const Landing = () => {
  const navigate = useNavigate();
  const [isYearly, setIsYearly] = useState(true);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
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
        <nav className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Target className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">ActiPlan</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => scrollToSection("capabilities")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Capabilities
            </button>
            <button onClick={() => scrollToSection("pricing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </button>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => navigate("/auth")} variant="outline">
              Sign In
            </Button>
            <Button onClick={() => navigate("/auth?mode=signup")}>
              Start Free Trial
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6">
            <Sparkles className="h-3 w-3 mr-1" />
            AI-Powered Campaign Management
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Launch Cross-Platform{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Campaigns in Minutes
            </span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            ActiPlan transforms your media planning workflow. Create, optimize, and launch paid advertising 
            campaigns across Meta, Google, TikTok, LinkedIn, Snapchat, and Pinterest from a single interface.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="gap-2">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => scrollToSection("capabilities")}>
              See Capabilities
            </Button>
          </div>
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20 max-w-4xl mx-auto">
          {[
            { value: "40%", label: "Cost Reduction" },
            { value: "5x", label: "Faster Launches" },
            { value: "6+", label: "Platforms" },
            { value: "99.9%", label: "Uptime" }
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities Section */}
      <section id="capabilities" className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need to Scale Your Media Operations
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From planning to execution, ActiPlan streamlines every step of your campaign workflow.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {capabilities.map((cap) => (
              <Card key={cap.title} className="bg-card hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <cap.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{cap.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{cap.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Advantages Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Why Choose ActiPlan?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Join leading agencies and brands who have transformed their media operations.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {advantages.map((adv, idx) => (
              <div key={idx} className="flex gap-4 p-6 rounded-lg border bg-card">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg mb-2">{adv.title}</h3>
                  <p className="text-muted-foreground">{adv.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Choose the plan that fits your needs.
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
          
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6 max-w-7xl mx-auto">
            {pricingTiers.map((tier) => (
              <Card 
                key={tier.name} 
                className={`relative flex flex-col ${tier.popular ? "border-primary shadow-lg lg:scale-105" : ""}`}
              >
                {tier.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                    Most Popular
                  </Badge>
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
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
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
                  
                  {tier.note && (
                    <p className="text-xs text-muted-foreground mb-4">{tier.note}</p>
                  )}
                  
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
            All plans include a 30-day free trial. No credit card required to start.
          </p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <Card className="max-w-3xl mx-auto bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <CardContent className="p-8 md:p-12 text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Ready to Transform Your Media Operations?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Start your 30-day free trial today and experience the power of automated campaign management.
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
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Target className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">ActiPlan</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} ActiPlan. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
