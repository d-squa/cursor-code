import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Loader2, ExternalLink, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";

// Stripe price IDs from your Stripe account
const PRICE_IDS = {
  basic: {
    monthly: "price_1ScnObKrTGU4P754AAJ9Q5NU",
    yearly: "price_1ScnL9KrTGU4P754QirsF0Sd",
    productId: "prod_SSWF7TKJNNXtqD"
  },
  freelancer: {
    monthly: "price_1ScnOcKrTGU4P754y5pmh5jf",
    yearly: "price_1ScnNYKrTGU4P754hbyoSjdc",
    productId: "prod_SSWRPgpWgLnZJb"
  },
  enterprise: {
    monthly: "price_1ScnOdKrTGU4P7542mtt9uyC",
    yearly: "price_1ScnOOKrTGU4P754r7bdJ94j",
    productId: "prod_SSWVDHzEQ8w2WJ"
  },
  agency: {
    monthly: "price_1ScnOeKrTGU4P75446dvndr3",
    yearly: "price_1ScnOPKrTGU4P754sNgouHiL",
    productId: "prod_SSWVFLkGsMC0W6"
  }
};

const plans = [
  {
    id: "basic",
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
    id: "freelancer",
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
    id: "enterprise",
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
    id: "agency",
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

interface SubscriptionStatus {
  subscribed: boolean;
  onTrial: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  trialEnd: string | null;
  status?: string;
}

export default function PlanManagement() {
  const [searchParams] = useSearchParams();
  const [isYearly, setIsYearly] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(true);

  useEffect(() => {
    // Check for success/canceled from Stripe redirect
    if (searchParams.get("success") === "true") {
      toast.success("Successfully subscribed! Your 30-day trial has started.");
      checkSubscription();
    } else if (searchParams.get("canceled") === "true") {
      toast.info("Checkout was canceled.");
    }
  }, [searchParams]);

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke("check-subscription", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      setSubscription(data);
    } catch (error) {
      console.error("Error checking subscription:", error);
    } finally {
      setCheckingSubscription(false);
    }
  };

  const getCurrentPlanId = (): string | null => {
    if (!subscription?.productId) return null;
    
    for (const [planId, priceInfo] of Object.entries(PRICE_IDS)) {
      if (priceInfo.productId === subscription.productId) {
        return planId;
      }
    }
    return null;
  };

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

      // Redirect to Stripe Checkout in a new tab
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error.message || "Failed to start checkout");
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

  const currentPlanId = getCurrentPlanId();
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Plan Management</h2>
        <p className="text-muted-foreground mt-2">
          Choose the plan that best fits your needs. All plans include a 30-day free trial.
        </p>
      </div>

      {/* Current Plan Card */}
      <Card className="border-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Your Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {checkingSubscription ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking subscription...</span>
            </div>
          ) : subscription?.subscribed ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold capitalize">
                    {currentPlanId || "Active"} Plan
                    {subscription.onTrial && (
                      <Badge variant="secondary" className="ml-2">
                        <Clock className="h-3 w-3 mr-1" />
                        Trial
                      </Badge>
                    )}
                  </p>
                  {subscription.onTrial && subscription.trialEnd && (
                    <p className="text-muted-foreground">
                      Trial ends: {formatDate(subscription.trialEnd)}
                    </p>
                  )}
                  {!subscription.onTrial && subscription.subscriptionEnd && (
                    <p className="text-muted-foreground">
                      Next billing: {formatDate(subscription.subscriptionEnd)}
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
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">Free Plan</p>
                <p className="text-muted-foreground">Start your 30-day trial with any plan below</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-4">
        <span className={!isYearly ? "font-semibold" : "text-muted-foreground"}>Monthly</span>
        <button
          onClick={() => setIsYearly(!isYearly)}
          className={`relative w-14 h-7 rounded-full transition-colors ${
            isYearly ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
              isYearly ? "translate-x-8" : "translate-x-1"
            }`}
          />
        </button>
        <span className={isYearly ? "font-semibold" : "text-muted-foreground"}>
          Yearly
          <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800">
            Save 15%
          </Badge>
        </span>
      </div>

      {/* Available Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = currentPlanId === plan.id;
          const monthlyEquivalent = isYearly 
            ? (plan.yearlyPrice / 12).toFixed(2) 
            : plan.monthlyPrice.toFixed(2);

          return (
            <Card 
              key={plan.id}
              className={`${plan.recommended ? "border-primary shadow-lg ring-2 ring-primary/20" : ""} ${
                isCurrentPlan ? "bg-primary/5" : ""
              }`}
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.recommended && (
                    <Badge variant="default" className="bg-primary">
                      Recommended
                    </Badge>
                  )}
                  {isCurrentPlan && (
                    <Badge variant="secondary">Your Plan</Badge>
                  )}
                </div>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  {isYearly ? (
                    <>
                      <span className="text-lg line-through text-muted-foreground">
                        ${plan.monthlyPrice}
                      </span>
                      <span className="text-4xl font-bold ml-2">${monthlyEquivalent}</span>
                      <span className="text-muted-foreground">/month</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        ${plan.yearlyPrice.toFixed(2)} billed yearly
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="text-4xl font-bold">${plan.monthlyPrice}</span>
                      <span className="text-muted-foreground">/month</span>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {!isCurrentPlan && (
                  <Button 
                    className="w-full" 
                    variant={plan.recommended ? "default" : "outline"}
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loading === plan.id}
                  >
                    {loading === plan.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {subscription?.subscribed 
                      ? `Switch to ${plan.name}`
                      : `Start 30-Day Trial`
                    }
                  </Button>
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
            <strong>30-Day Free Trial:</strong> All plans start with a 30-day free trial. 
            Your card will be charged at the end of the trial period. You can cancel anytime 
            during the trial at no cost. Upgrades and downgrades are prorated automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
