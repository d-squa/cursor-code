import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { PRICE_IDS } from "@/config/subscriptionTiers";

const plans = [
  {
    id: "basic" as const,
    name: "Basic",
    monthlyPrice: 39,
    yearlyPrice: 397.80,
    description: "For individuals getting started",
    hasTrial: true,
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
    hasTrial: false,
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
    hasTrial: false,
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
    hasTrial: false,
    features: [
      "Unlimited ActiPlans",
      "Everything in Enterprise",
      "AI Knowledge Base",
      "10 team members",
      "Dedicated support",
    ],
  },
];

export default function ChoosePlan() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut, isEmailConfirmed } = useAuth();
  const { isSubscribed, loading: subLoading } = useSubscription();
  const [isYearly, setIsYearly] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);

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
    
    // Check onboarding status
    if (!authLoading && user && isEmailConfirmed) {
      const onboardingData = localStorage.getItem("actiplan_onboarding");
      const onboardingComplete = onboardingData && JSON.parse(onboardingData).completedAt;
      
      if (!onboardingComplete) {
        navigate("/onboarding");
        return;
      }
    }
    
    // Redirect to app if already subscribed
    if (!subLoading && isSubscribed) {
      navigate("/app");
    }
  }, [user, authLoading, isSubscribed, subLoading, navigate, isEmailConfirmed]);

  const handleSubscribe = async (planId: string) => {
    setLoading(planId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
                <Target className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  ActiPlan
                </h1>
                <p className="text-xs text-muted-foreground">Choose Your Plan</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
          <span className={`text-sm ${isYearly ? "font-semibold" : "text-muted-foreground"}`}>
            Yearly
          </span>
          <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
            Save 15%
          </Badge>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {plans.map((plan) => {
            const monthlyEquivalent = isYearly 
              ? (plan.yearlyPrice / 12).toFixed(2) 
              : plan.monthlyPrice.toFixed(2);

            return (
              <Card 
                key={plan.id}
                className={plan.recommended ? "border-primary shadow-lg ring-2 ring-primary/20" : ""}
              >
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
                        <span className="text-sm line-through text-muted-foreground">
                          ${plan.monthlyPrice}
                        </span>
                        <span className="text-3xl font-bold ml-2">${monthlyEquivalent}</span>
                        <span className="text-muted-foreground text-sm">/mo</span>
                        <p className="text-xs text-muted-foreground mt-1">
                          ${plan.yearlyPrice.toFixed(2)}/year
                        </p>
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
              <strong>Basic Plan:</strong> Includes a 30-day free trial. Your card won't be charged until the trial ends.
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
