import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, X, ArrowLeft, Sparkles, ArrowRight } from "lucide-react";
import SEO from "@/components/SEO";

const pricingTiers = [
  {
    key: "trial",
    name: "Trial",
    monthlyPrice: 0,
    yearlyMonthly: 0,
    yearlyTotal: 0,
    period: "30 days free",
    description: "Perfect for exploring ActiPlan capabilities",
    operationalLimits: "1 ActiPlan/Day • 1 Owner",
    cta: "Start 30-Day Free Trial",
    popular: false,
    note: "Credit card required. Cancel anytime!",
  },
  {
    key: "basic",
    name: "Basic",
    monthlyPrice: 39,
    yearlyMonthly: 33.15,
    yearlyTotal: 397.8,
    period: "/month",
    description: "For individual media buyers getting started",
    operationalLimits: "1 ActiPlan/Day • 1 Owner • 1 ad account/platform",
    cta: "Start 30-Day Free Trial",
    popular: false,
  },
  {
    key: "freelancer",
    name: "Freelancer",
    monthlyPrice: 99,
    yearlyMonthly: 84.15,
    yearlyTotal: 1009.8,
    period: "/month",
    description: "For growing professionals",
    operationalLimits: "2 ActiPlans/Day • 1 Owner • 3 ad accounts/platform",
    cta: "Get Started",
    popular: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    monthlyPrice: 249,
    yearlyMonthly: 211.65,
    yearlyTotal: 2539.8,
    period: "/month",
    description: "For teams and growing agencies",
    operationalLimits: "5 ActiPlans/Day • 5 team members • 150 ad accounts",
    cta: "Get Started",
    popular: false,
  },
  {
    key: "agency",
    name: "Agency",
    monthlyPrice: 699,
    yearlyMonthly: 594.15,
    yearlyTotal: 7129.8,
    period: "/month",
    description: "For large agencies with dedicated support",
    operationalLimits: "Unlimited • 10 team members • 300 ad accounts",
    cta: "Get Started",
    popular: false,
  },
];

const featureCategories = [
  {
    name: "Core Features",
    features: [
      { label: "ActiPlans per day", values: ["1", "1", "2", "5", "Unlimited"] },
      { label: "Intuitive Campaign creator", values: [true, true, true, true, true] },
      { label: "Media plan creator", values: [true, true, true, true, true] },
      { label: "Visual Dashboard", values: [true, true, true, true, true] },
      { label: "Bulk cross-platform activation", values: [true, true, true, true, true] },
      { label: "Live insights & recommendations", values: [true, true, true, true, true] },
    ],
  },
  {
    name: "Platform & Accounts",
    features: [
      { label: "User connections per platform", values: ["1", "1", "1", "3", "6"] },
      { label: "Ad accounts per platform", values: ["1", "1", "3", "150", "300"] },
      { label: "Ad account swaps/month", values: ["1", "1", "3", "3", "6"] },
    ],
  },
  {
    name: "Advanced Features",
    features: [
      { label: "Priority support", values: [false, false, true, true, true] },
      { label: "Advanced reporting", values: [false, false, true, true, true] },
      { label: "Guaranteed planning", values: [false, false, false, true, true] },
      { label: "All-levels duplication", values: [false, false, false, true, true] },
      { label: "Advanced performance dashboard", values: [false, false, false, true, true] },
      { label: "Approval & Requests workflows", values: [false, false, false, true, true] },
      { label: "Task Management & Change history", values: [false, false, false, true, true] },
      { label: "Export & Share (Excel & PDF)", values: [false, false, false, true, true] },
      { label: "Creative meshing", values: [false, false, false, true, true] },
    ],
  },
  {
    name: "Agency Features",
    features: [
      { label: "Client portfolio management", values: [false, false, false, false, true] },
      { label: "Client preferences & safeguards", values: [false, false, false, false, true] },
      { label: "AI knowledge base", values: [false, false, false, false, true] },
      { label: "Operations statistics", values: [false, false, false, false, true] },
      { label: "Cross-platform unified taxonomy", values: [false, false, false, false, true] },
    ],
  },
  {
    name: "Team & Support",
    features: [
      { label: "Team members", values: ["1", "1", "1", "5", "10"] },
      { label: "Email support", values: [true, true, true, true, true] },
      { label: "Dedicated support", values: [false, false, false, false, true] },
      { label: "Platform onboarding included", values: [false, false, false, false, true] },
    ],
  },
];

export default function ComparePlans() {
  const navigate = useNavigate();
  const [isYearly, setIsYearly] = useState(true);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(price);

  const getSavingsPercentage = (monthly: number, yearlyMonthly: number) => {
    if (monthly === 0) return 0;
    return Math.round(((monthly - yearlyMonthly) / monthly) * 100);
  };

  return (
    <>
      <SEO
        title="Compare Plans - ActiPlan Pricing"
        description="Compare ActiPlan pricing plans side by side. Find the perfect plan for your media planning and buying needs."
      />

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <nav className="container mx-auto px-4 py-3 md:py-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <img src="/logo.png" alt="ActiPlan" className="h-8 md:h-10 w-auto" />
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <Button onClick={() => navigate("/auth")} variant="outline" size="sm">
                Sign In
              </Button>
              <Button onClick={() => navigate("/auth?mode=signup")} size="sm">
                Start Trial
              </Button>
            </div>
          </nav>
        </header>

        <div className="container mx-auto px-4 py-12 max-w-7xl">
          {/* Title */}
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Compare Plans</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Find the perfect plan for your team. All plans include a 30-day free trial on Basic.
            </p>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <span className={`text-sm font-medium ${!isYearly ? "text-foreground" : "text-muted-foreground"}`}>
                Monthly
              </span>
              <Switch checked={isYearly} onCheckedChange={setIsYearly} className="data-[state=checked]:bg-primary" />
              <span className={`text-sm font-medium ${isYearly ? "text-foreground" : "text-muted-foreground"}`}>
                Yearly
              </span>
            </div>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full">
              <Sparkles className="h-4 w-4" />
              <span className="font-semibold text-sm">Save 15% with yearly billing!</span>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              {/* Sticky plan header */}
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 min-w-[200px] bg-background sticky left-0 z-10" />
                  {pricingTiers.map((tier) => (
                    <th
                      key={tier.key}
                      className={`p-4 text-center min-w-[160px] ${tier.popular ? "bg-primary/5 border-x-2 border-t-2 border-primary rounded-t-lg" : ""}`}
                    >
                      <div className="space-y-2">
                        {tier.popular && <Badge className="bg-primary text-xs">Most Popular</Badge>}
                        <div className="font-bold text-lg">{tier.name}</div>
                        <div className="text-xs text-muted-foreground">{tier.description}</div>
                        <div className="mt-2">
                          {tier.monthlyPrice === 0 ? (
                            <div>
                              <span className="text-2xl font-bold">Free</span>
                              <span className="text-muted-foreground text-xs ml-1">{tier.period}</span>
                            </div>
                          ) : isYearly ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-center gap-1">
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
                                <span className="text-muted-foreground text-xs">/mo</span>
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                ${formatPrice(tier.yearlyTotal)} billed yearly
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="text-2xl font-bold">${formatPrice(tier.monthlyPrice)}</span>
                              <span className="text-muted-foreground text-xs">/mo</span>
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          className="w-full mt-2"
                          variant={tier.popular ? "default" : "outline"}
                          onClick={() => navigate("/auth?mode=signup")}
                        >
                          {tier.cta}
                        </Button>
                        {(tier.key === "enterprise" || tier.key === "agency") && (
                          <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => navigate("/book-demo")}>
                            Book a Demo
                          </Button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {featureCategories.map((category) => (
                  <>
                    <tr key={category.name}>
                      <td
                        colSpan={6}
                        className="p-4 pt-8 pb-2 font-bold text-sm text-foreground uppercase tracking-wider bg-background sticky left-0 z-10"
                      >
                        {category.name}
                      </td>
                    </tr>
                    {category.features.map((feature) => (
                      <tr key={feature.label} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-sm text-muted-foreground bg-background sticky left-0 z-10">
                          {feature.label}
                        </td>
                        {feature.values.map((value, i) => (
                          <td
                            key={i}
                            className={`p-3 text-center ${pricingTiers[i]?.popular ? "bg-primary/5 border-x-2 border-primary" : ""}`}
                          >
                            {typeof value === "boolean" ? (
                              value ? (
                                <CheckCircle2 className="h-4 w-4 text-primary mx-auto" />
                              ) : (
                                <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                              )
                            ) : (
                              <span className="text-sm font-medium">{value}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom CTA */}
          <div className="text-center mt-12">
            <p className="text-sm text-muted-foreground mb-6">
              All signups start with a 30-day free trial on Basic Monthly. Credit card required. Cancel anytime!
            </p>
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="gap-2">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-12 border-t bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <img src="/logo.png" alt="ActiPlan" className="h-8 w-auto" />
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
    </>
  );
}
