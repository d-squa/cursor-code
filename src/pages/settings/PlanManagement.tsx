import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Loader2, ExternalLink, Clock, Calendar, ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { PRICE_IDS, TIER_DISPLAY_NAMES, SubscriptionTier } from "@/config/subscriptionTiers";

const plans = [
  {
    id: "basic" as const,
    name: "Basic",
    monthlyPrice: 39,
    yearlyPrice: 397.80,
    description: "For individuals getting started",
    features: [
      "1 ActiPlan per day",
      "Visual Dashboard",
      "Bulk cross-platform activation",
      "Live insights & recommendations",
      "Email support",
    ],
  },
  {
    id: "freelancer" as const,
    name: "Freelancer",
    monthlyPrice: 89,
    yearlyPrice: 907.80,
    description: "For growing professionals",
    features: [
      "2 ActiPlans per day",
      "Everything in Basic",
      "Priority support",
      "Advanced reporting",
    ],
  },
  {
    id: "enterprise" as const,
    name: "Enterprise",
    monthlyPrice: 189,
    yearlyPrice: 1927.80,
    description: "For teams and agencies",
    features: [
      "5 ActiPlans per day",
      "Everything in Freelancer",
      "Approval workflows",
      "HawkView reports",
      "5 team members",
    ],
    recommended: true,
  },
  {
    id: "agency" as const,
    name: "Agency",
    monthlyPrice: 999,
    yearlyPrice: 10189.80,
    description: "For large agencies",
    features: [
      "Unlimited ActiPlans",
      "Everything in Enterprise",
      "AI Knowledge Base",
      "10 team members",
      "Dedicated support",
    ],
  },
];

export default function PlanManagement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { 
    isSubscribed, 
    isOnTrial,
    loading: hookLoading, 
    refetch,
    tier,
    tierDisplayName,
    billingPeriod,
    subscriptionEnd,
    trialEnd
  } = useSubscription();
  const [isYearly, setIsYearly] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    // Redirect unsubscribed users to choose plan page
    if (!hookLoading && !isSubscribed) {
      navigate("/choose-plan");
    }
  }, [hookLoading, isSubscribed, navigate]);

  useEffect(() => {
    // Check for success/canceled from Stripe redirect
    const handlePostCheckout = async () => {
      const success = searchParams.get("success");
      const canceled = searchParams.get("canceled");
      const portalReturn = searchParams.get("portal_return");

      if (success === "true") {
        toast.success("Subscription activated successfully!");
        refetch();
      } else if (portalReturn === "true") {
        // Returning from Customer Portal - refresh subscription status
        toast.success("Subscription updated!");
        refetch();
      } else if (canceled === "true") {
        toast.info("Checkout was canceled.");
      }
    };

    handlePostCheckout();
  }, [searchParams, refetch]);

  // Set initial yearly toggle based on current billing period
  useEffect(() => {
    if (billingPeriod) {
      setIsYearly(billingPeriod === 'yearly');
    }
  }, [billingPeriod]);

  const handleSubscribe = async (planId: string) => {
    setLoading(planId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to subscribe");
        return;
      }

      const priceId = isYearly 
        ? PRICE_IDS[planId as keyof typeof PRICE_IDS].yearly 
        : PRICE_IDS[planId as keyof typeof PRICE_IDS].monthly;

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Handle different response types
      if (data?.type === 'updated') {
        // Subscription was updated directly via API
        toast.success("Plan updated successfully!");
        refetch();
      } else if (data?.url) {
        // Redirect to Stripe checkout for new subscriptions
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error.message || "Failed to update plan");
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setLoading("manage");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in");
        return;
      }

      const { data, error } = await supabase.functions.invoke("customer-portal", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      console.error("Portal error:", error);
      toast.error(error.message || "Failed to open subscription management");
    } finally {
      setLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const isCurrentPlan = (planId: string): boolean => {
    return tier === planId;
  };

  const getPlanTierIndex = (planId: string): number => {
    const tierOrder: SubscriptionTier[] = ['trial', 'basic', 'freelancer', 'enterprise', 'agency'];
    return tierOrder.indexOf(planId as SubscriptionTier);
  };

  const isUpgrade = (planId: string): boolean => {
    return getPlanTierIndex(planId) > getPlanTierIndex(tier);
  };

  const isDowngrade = (planId: string): boolean => {
    return getPlanTierIndex(planId) < getPlanTierIndex(tier);
  };

  if (hookLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Plan Management</h2>
        <p className="text-muted-foreground mt-2">
          Manage your subscription and billing preferences.
        </p>
      </div>

      {/* Current Plan Card */}
      <Card className="border-primary border-2 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Your Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-2xl font-bold">{tierDisplayName} Plan</p>
                  {isOnTrial && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                      <Clock className="h-3 w-3 mr-1" />
                      Trial
                    </Badge>
                  )}
                  {billingPeriod && !isOnTrial && (
                    <Badge variant="outline" className="capitalize">
                      <Calendar className="h-3 w-3 mr-1" />
                      {billingPeriod}
                    </Badge>
                  )}
                </div>
                {isOnTrial && trialEnd && (
                  <p className="text-muted-foreground">
                    Trial ends: {formatDate(trialEnd)}
                  </p>
                )}
                {!isOnTrial && subscriptionEnd && (
                  <p className="text-muted-foreground">
                    Next billing: {formatDate(subscriptionEnd)}
                  </p>
                )}
              </div>
              <Button 
                variant="outline" 
                onClick={handleManageSubscription}
                disabled={loading === "manage"}
              >
                {loading === "manage" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <ExternalLink className="h-4 w-4 mr-2" />
                Manage Subscription
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              You can upgrade, downgrade, or cancel your subscription anytime. 
              Changes are prorated based on your remaining billing period.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm ${!isYearly ? "font-semibold" : "text-muted-foreground"}`}>Monthly</span>
        <button
          onClick={() => setIsYearly(!isYearly)}
          className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
            isYearly ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              isYearly ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
        <span className={`text-sm ${isYearly ? "font-semibold" : "text-muted-foreground"}`}>
          Yearly
        </span>
        <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
          Save 15%
        </Badge>
      </div>

      {/* Available Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {plans.map((plan) => {
          const isCurrent = isCurrentPlan(plan.id);
          const monthlyEquivalent = isYearly 
            ? (plan.yearlyPrice / 12).toFixed(2) 
            : plan.monthlyPrice.toFixed(2);
          const upgrading = isUpgrade(plan.id);
          const downgrading = isDowngrade(plan.id);

          return (
            <Card 
              key={plan.id}
              className={`relative transition-all ${
                isCurrent 
                  ? "border-primary border-2 ring-4 ring-primary/20 shadow-lg" 
                  : plan.recommended 
                    ? "border-primary/50 shadow-md" 
                    : ""
              }`}
            >
              {/* Current Plan Indicator */}
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground shadow-md">
                    <Check className="h-3 w-3 mr-1" />
                    Your Plan
                  </Badge>
                </div>
              )}
              
              <CardHeader className={isCurrent ? "pt-6" : ""}>
                <div className="flex items-center justify-between mb-2">
                  <CardTitle className={isCurrent ? "text-primary" : ""}>{plan.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    {plan.recommended && !isCurrent && (
                      <Badge variant="default" className="bg-primary">
                        Recommended
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  {isYearly ? (
                    <>
                      <span className="text-lg line-through text-muted-foreground">
                        ${plan.monthlyPrice}
                      </span>
                      <span className={`text-4xl font-bold ml-2 ${isCurrent ? "text-primary" : ""}`}>
                        ${monthlyEquivalent}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        ${plan.yearlyPrice.toFixed(2)} billed yearly
                      </p>
                    </>
                  ) : (
                    <>
                      <span className={`text-4xl font-bold ${isCurrent ? "text-primary" : ""}`}>
                        ${plan.monthlyPrice}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className={`h-5 w-5 flex-shrink-0 mt-0.5 ${isCurrent ? "text-primary" : "text-green-600"}`} />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {!isCurrent && (
                  <Button 
                    className="w-full" 
                    variant={upgrading ? "default" : "outline"}
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loading === plan.id}
                  >
                    {loading === plan.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {upgrading ? (
                      <>
                        <ArrowUp className="mr-2 h-4 w-4" />
                        Upgrade to {plan.name}
                      </>
                    ) : downgrading ? (
                      <>
                        <ArrowDown className="mr-2 h-4 w-4" />
                        Downgrade to {plan.name}
                      </>
                    ) : (
                      `Switch to ${plan.name}`
                    )}
                  </Button>
                )}
                
                {isCurrent && (
                  <div className="text-center py-3 rounded-md bg-primary/10 text-primary font-medium">
                    ✓ This is your current plan
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Plan Info Note */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Basic plan includes a 30-day free trial for new subscribers only. 
            Freelancer, Enterprise, and Agency plans start billing immediately. 
            Upgrades and downgrades are prorated automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
