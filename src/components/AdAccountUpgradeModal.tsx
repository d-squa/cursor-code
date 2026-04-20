import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowRight, Building2, Sparkles, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SubscriptionTier, TIER_DISPLAY_NAMES } from "@/config/subscriptionTiers";
import { AD_ACCOUNT_LIMITS, SWAP_LIMITS } from "@/hooks/useAdAccountLimits";

type LimitType = "account_limit" | "swap_limit" | "no_multiple_accounts";

interface AdAccountUpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limitType: LimitType;
  currentTier: SubscriptionTier;
  platform: "meta" | "tiktok";
  currentCount?: number;
  swapsUsed?: number;
}

const PLATFORM_NAMES = {
  meta: "Meta",
  tiktok: "TikTok",
};

export default function AdAccountUpgradeModal({
  open,
  onOpenChange,
  limitType,
  currentTier,
  platform,
  currentCount = 0,
  swapsUsed = 0,
}: AdAccountUpgradeModalProps) {
  const navigate = useNavigate();
  const platformName = PLATFORM_NAMES[platform];

  const getUpgradeTarget = (): SubscriptionTier => {
    if (currentTier === "trial" || currentTier === "basic") {
      return "freelancer";
    }
    if (currentTier === "freelancer") {
      return "enterprise";
    }
    return "agency";
  };

  const targetTier = getUpgradeTarget();

  const getTitle = () => {
    switch (limitType) {
      case "account_limit":
        return `${platformName} Ad Account Limit Reached`;
      case "swap_limit":
        return `Monthly Swap Limit Reached`;
      case "no_multiple_accounts":
        return `Upgrade to Link Multiple Accounts`;
      default:
        return "Upgrade Required";
    }
  };

  const getDescription = () => {
    switch (limitType) {
      case "account_limit":
        return `You've reached the maximum of ${AD_ACCOUNT_LIMITS[currentTier]} ${platformName} ad account${AD_ACCOUNT_LIMITS[currentTier] !== 1 ? "s" : ""} for your ${TIER_DISPLAY_NAMES[currentTier]} plan.`;
      case "swap_limit":
        return `You've used all ${SWAP_LIMITS[currentTier]} swap${SWAP_LIMITS[currentTier] !== 1 ? "s" : ""} for ${platformName} this month. Swaps reset on the 1st of each month (UTC).`;
      case "no_multiple_accounts":
        return `Your ${TIER_DISPLAY_NAMES[currentTier]} plan only allows 1 ad account per platform. Upgrade to link multiple ${platformName} ad accounts.`;
      default:
        return "Upgrade your plan to unlock this feature.";
    }
  };

  const getUpgradeBenefits = () => {
    const benefits = [];

    if (targetTier === "freelancer") {
      benefits.push({
        icon: Building2,
        title: "Up to 3 Ad Accounts",
        description: "Link up to 3 ad accounts per platform",
      });
      benefits.push({
        icon: Sparkles,
        title: "1 Swap per Month",
        description: "Swap out ad accounts once per month per platform",
      });
    } else if (targetTier === "enterprise") {
      benefits.push({
        icon: Building2,
        title: "Up to 30 Ad Accounts",
        description: "Link up to 30 ad accounts per platform",
      });
      benefits.push({
        icon: Sparkles,
        title: "3 Swaps per Month",
        description: "Swap out ad accounts 3 times per month per platform",
      });
      benefits.push({
        icon: Users,
        title: "Team Collaboration",
        description: "Invite up to 5 team members to collaborate",
      });
    } else if (targetTier === "agency") {
      benefits.push({
        icon: Building2,
        title: "Unlimited Ad Accounts",
        description: "Link unlimited ad accounts per platform",
      });
      benefits.push({
        icon: Sparkles,
        title: "Unlimited Swaps",
        description: "Swap ad accounts anytime without restrictions",
      });
      benefits.push({
        icon: Users,
        title: "Full Team",
        description: "Invite up to 10 team members",
      });
    }

    return benefits;
  };

  const handleUpgrade = () => {
    onOpenChange(false);
    navigate("/app/settings/plans");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <DialogTitle>{getTitle()}</DialogTitle>
            </div>
          </div>
          <DialogDescription className="pt-2">{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current Plan</span>
            <Badge variant="secondary">{TIER_DISPLAY_NAMES[currentTier]}</Badge>
          </div>

          {limitType === "account_limit" && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Accounts Linked</span>
              <span className="font-medium">
                {currentCount} / {AD_ACCOUNT_LIMITS[currentTier]}
              </span>
            </div>
          )}

          {limitType === "swap_limit" && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Swaps Used This Month</span>
              <span className="font-medium">
                {swapsUsed} / {SWAP_LIMITS[currentTier]}
              </span>
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Upgrade to {TIER_DISPLAY_NAMES[targetTier]} to unlock:</p>
            <div className="space-y-3">
              {getUpgradeBenefits().map((benefit, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <benefit.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{benefit.title}</p>
                    <p className="text-xs text-muted-foreground">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe Later
          </Button>
          <Button onClick={handleUpgrade} className="gap-2">
            Upgrade Plan
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
