import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap } from "lucide-react";
import { toast } from "sonner";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out the platform",
    features: [
      "Up to 2 campaigns",
      "1 team member",
      "Basic reporting",
      "Email support",
    ],
    current: true,
  },
  {
    name: "Professional",
    price: "$49",
    period: "per month",
    description: "For growing businesses",
    features: [
      "Unlimited campaigns",
      "Up to 5 team members",
      "Advanced reporting",
      "Priority email support",
      "API access",
    ],
    current: false,
    recommended: false,
  },
  {
    name: "Agency",
    price: "$149",
    period: "per month",
    description: "For marketing agencies",
    features: [
      "Everything in Professional",
      "Unlimited team members",
      "Team collaboration features",
      "Approval workflows",
      "White-label reports",
      "Dedicated support",
    ],
    current: false,
    recommended: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact sales",
    description: "For large organizations",
    features: [
      "Everything in Agency",
      "Custom integrations",
      "Advanced security",
      "SLA guarantee",
      "Dedicated account manager",
      "Custom training",
    ],
    current: false,
    recommended: false,
  },
];

export default function PlanManagement() {
  const [selectedPlan, setSelectedPlan] = useState("Free");

  const handleUpgrade = (planName: string) => {
    toast.info(`Upgrading to ${planName} plan...`);
    // Implement actual upgrade logic here
  };

  const handleDowngrade = (planName: string) => {
    toast.info(`Downgrading to ${planName} plan...`);
    // Implement actual downgrade logic here
  };

  const handleCancelSubscription = () => {
    if (confirm("Are you sure you want to cancel your subscription?")) {
      toast.info("Subscription cancelled. You'll have access until the end of your billing period.");
      // Implement actual cancellation logic here
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Plan Management</h2>
        <p className="text-muted-foreground mt-2">
          Choose the plan that best fits your needs
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">Free Plan</p>
              <p className="text-muted-foreground">2/2 campaigns used</p>
            </div>
            <Button variant="outline" onClick={handleCancelSubscription}>
              Cancel Subscription
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {plans.map((plan) => (
          <Card 
            key={plan.name}
            className={plan.recommended ? "border-primary shadow-lg" : ""}
          >
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <CardTitle>{plan.name}</CardTitle>
                {plan.recommended && (
                  <Badge variant="default" className="bg-primary">
                    Recommended
                  </Badge>
                )}
                {plan.current && (
                  <Badge variant="secondary">Current</Badge>
                )}
              </div>
              <CardDescription>{plan.description}</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground ml-2">/{plan.period}</span>
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

              {!plan.current && (
                <Button 
                  className="w-full" 
                  variant={plan.recommended ? "default" : "outline"}
                  onClick={() => handleUpgrade(plan.name)}
                >
                  {plan.price === "Custom" ? "Contact Sales" : "Upgrade to " + plan.name}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan Comparison Note */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Agency and Enterprise plans include team collaboration features 
            and approval workflows. These features allow you to send campaigns for approval to team 
            members and manage user permissions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
