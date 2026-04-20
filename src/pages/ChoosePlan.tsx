import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { PRICE_IDS } from "@/config/subscriptionTiers";
import { fireSubscribeConversion } from "@/utils/conversionTracking";

const plans = [
  {
    id: "basic" as const,
    name: "Basic",
    monthlyPrice: 39,
    yearlyPrice: 397.8,
    description: "For individuals getting started",
    hasTrial: true,
    features: [
      "1 ActiPlan per day",
      "Intuitive Campaign creator",
      "Media plan creator",
      "Visual Dashboard",
      "Bulk cross-platform activation",
      "Live insights & recommendations",
      "Email support",
    ],
  },
  {
    id: "freelancer" as const,
    name: "Freelancer",
    monthlyPrice: 99,
    yearlyPrice: 1009.8,
    description: "For growing professionals",
    hasTrial: false,
    features: [
      "2 ActiPlans per day",
      "2 integrated media platforms (Meta & Tiktok)",
      "1 user connection per platform",
      "3 ad accounts per platform",
      "2 platforms per ActiPlan at a time",
      "3 ad account swaps per platform every month",
      "Everything in Basic plan",
      "Priority support",
      "Advanced reporting",
    ],
  },
  {
    id: "enterprise" as const,
    name: "Enterprise",
    monthlyPrice: 249,
    yearlyPrice: 2539.8,
    description: "For teams and agencies",
    hasTrial: false,
    features: [
      "5 ActiPlans per day",
      "2 integrated media platforms (Meta & Tiktok)",
      "3 user connections per platform",
      "150 ad accounts per platform",
      "2 platforms per ActiPlan at a time",
      "3 ad account swaps per platform every month",
      "Everything in Freelancer",
      "Guaranteed planning",
      "All-levels duplication (ActiPlan, Platform & Market)",
      "Advanced performance dashboard (planned vs actual)",
      "Approval workflows",
      "Requests workflows",
      "Task Management",
      "Change history",
      "Export & Share in excel & pdf formats",
      "Creative meshing",
      "5 team members",
    ],
    recommended: true,
  },
  {
    id: "agency" as const,
    name: "Agency",
    monthlyPrice: 699,
    yearlyPrice: 7129.8,
    description: "For large agencies",
    hasTrial: false,
    features: [
      "Unlimited ActiPlans per day",
      "2 integrated media platforms (Meta & Tiktok)",
      "6 user connections per platform",
      "300 ad accounts per platform",
      "2 platforms per ActiPlan at a time",
      "6 ad account swaps per platform every month",
      "Everything in Enterprise",
      "Client portfolio management",
      "Client default preferences & safeguards",
      "AI knowledge base",
      "Operations statistics",
      "Cross-platform unified taxonomy",
      "10 team members",
      "Dedicated support",
      "Platform onboarding included",
    ],
  },
];

export default function ChoosePlan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, signOut, isEmailConfirmed } = useAuth();
  const { isSubscribed, loading: subLoading, refetch } = useSubscription();
  const [isYearly, setIsYearly] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  // Handle successful checkout redirect
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setCheckoutSuccess(true);
      const planName = searchParams.get("plan_name") || "your plan";
      const isTrial = searchParams.get("is_trial") === "true";

      // Fire conversion tracking
      fireSubscribeConversion(`subscribe-${searchParams.get("session_id") || "checkout"}`);

      // Poll subscription status and redirect when ready
      const pollInterval = setInterval(async () => {
        await refetch({ force: true, showLoading: false });
      }, 3000);

      // Auto-redirect after max 15 seconds regardless
      const timeout = setTimeout(() => {
        clearInterval(pollInterval);
        navigate("/app/overview");
      }, 15000);

      return () => {
        clearInterval(pollInterval);
        clearTimeout(timeout);
      };
    }
  }, [searchParams]);

  // Redirect to overview once subscription is confirmed after checkout
  useEffect(() => {
    if (checkoutSuccess && isSubscribed) {
      toast.success("Welcome! Your subscription is now active.");
      navigate("/app/overview");
    }
  }, [checkoutSuccess, isSubscribed, navigate]);

  useEffect(() => {
    // Redirect to auth if not logged in
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }

    // Redirect to auth if email not confirmed
    if (!authLoading && user && !isEmailConfirmed) {
      navigate("/auth?confirm_email=true");
      return;
    }

    // Super admin bypass - redirect to admin dashboard
    if (!authLoading && user && user.email === "superadmin@actiplan.app") {
      navigate("/app/admin");
      return;
    }

    // Check onboarding status and landing source for auto-trial
    if (!authLoading && user && isEmailConfirmed) {
      const onboardingData = localStorage.getItem("actiplan_onboarding");
      const onboardingComplete = onboardingData && JSON.parse(onboardingData).completedAt;

      if (!onboardingComplete) {
        navigate("/onboarding");
        return;
      }

      // If user came from custom landing page, auto-activate trial
      const signupSource = localStorage.getItem("actiplan_signup_source");
      const alreadyActivating = sessionStorage.getItem("actiplan_trial_activating");
      if (signupSource === "landing" && !alreadyActivating) {
        const activateTrial = async () => {
          try {
            sessionStorage.setItem("actiplan_trial_activating", "true");
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
              sessionStorage.removeItem("actiplan_trial_activating");
              return;
            }

            const { data, error } = await supabase.functions.invoke("activate-free-trial", {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            });

            if (!error && data?.success) {
              localStorage.removeItem("actiplan_signup_source");
              sessionStorage.removeItem("actiplan_trial_activating");
              toast.success("Welcome! Your 30-day free trial has started.");
              navigate("/app/overview");
            } else {
              sessionStorage.removeItem("actiplan_trial_activating");
            }
          } catch (err) {
            console.error("Error activating free trial:", err);
            sessionStorage.removeItem("actiplan_trial_activating");
            // Fall through to show plan selection
          }
        };
        activateTrial();
        return;
      }
    }

    // Redirect to overview if already subscribed
    if (!subLoading && isSubscribed) {
      navigate("/app/overview");
    }
  }, [user, authLoading, isSubscribed, subLoading, navigate, isEmailConfirmed]);

  const handleSubscribe = async (planId: string) => {
    setLoading(planId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to subscribe");
        navigate("/auth");
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

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (checkoutSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="text-center space-y-4">
          <CheckCircle className="h-16 w-16 text-primary mx-auto" />
          <h2 className="text-2xl font-bold">Subscription Successful!</h2>
          <p className="text-muted-foreground">Setting up your account, please wait...</p>
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="ActiPlan" className="h-10 w-auto" />
              <p className="text-xs text-muted-foreground hidden md:block">Choose Your Plan</p>
            </div>
            <div className="flex items-center gap-4">
              <WorkspaceSwitcher />
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Welcome Message */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Welcome to ActiPlan!</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose a plan to start your 30-day free trial. Your card won't be charged until the trial ends.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-3 mb-8">
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
          <span className={`text-sm ${isYearly ? "font-semibold" : "text-muted-foreground"}`}>Yearly</span>
          <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
            Save 15%
          </Badge>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {plans.map((plan) => {
            const monthlyEquivalent = isYearly ? (plan.yearlyPrice / 12).toFixed(2) : plan.monthlyPrice.toFixed(2);

            return (
              <Card key={plan.id} className={plan.recommended ? "border-primary shadow-lg ring-2 ring-primary/20" : ""}>
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {plan.recommended && (
                      <Badge variant="default" className="bg-primary text-xs">
                        Best Value
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-sm">{plan.description}</CardDescription>
                  <div className="mt-4">
                    {isYearly ? (
                      <>
                        <span className="text-sm line-through text-muted-foreground">${plan.monthlyPrice}</span>
                        <span className="text-3xl font-bold ml-2">${monthlyEquivalent}</span>
                        <span className="text-muted-foreground text-sm">/mo</span>
                        <p className="text-xs text-muted-foreground mt-1">${plan.yearlyPrice.toFixed(2)}/year</p>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">${plan.monthlyPrice}</span>
                        <span className="text-muted-foreground text-sm">/mo</span>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full"
                    variant={plan.recommended ? "default" : "outline"}
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loading === plan.id}
                  >
                    {loading === plan.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {plan.hasTrial ? "Start 30-Day Free Trial" : "Subscribe Now"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Info Note */}
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              <strong>Basic Plan:</strong> Includes a 30-day free trial. Your card won't be charged until the trial
              ends.
              <br />
              <strong>Freelancer, Enterprise & Agency:</strong> Billing starts immediately upon subscription.
              <br />
              You can cancel or change your plan anytime.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
