import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { differenceInDays, differenceInHours } from "date-fns";
import { getNextBillingReset } from "@/hooks/useAdAccountLimits";

interface SwapCounterBadgeProps {
  label: string;
  used: number;
  allowed: number;
  subscriptionStart?: string | null;
}

/**
 * Returns time until the next reset based on billing cycle
 */
function getTimeUntilReset(subscriptionStart: string | null): string {
  const nextReset = getNextBillingReset(subscriptionStart);
  const now = new Date();
  
  const daysRemaining = differenceInDays(nextReset, now);
  const hoursRemaining = differenceInHours(nextReset, now) % 24;
  
  if (daysRemaining > 1) {
    return `${daysRemaining} days`;
  } else if (daysRemaining === 1) {
    return `1 day, ${hoursRemaining} hours`;
  } else if (hoursRemaining > 0) {
    return `${hoursRemaining} hours`;
  } else {
    return "less than 1 hour";
  }
}

export default function SwapCounterBadge({
  label,
  used,
  allowed,
  subscriptionStart,
}: SwapCounterBadgeProps) {
  const displayAllowed = allowed === Infinity ? '∞' : allowed;
  const isAtLimit = used >= allowed && allowed !== Infinity;
  const hasNoSwaps = allowed === 0;
  
  // Determine badge variant based on status
  const variant = isAtLimit ? 'destructive' : hasNoSwaps ? 'secondary' : 'outline';
  
  const timeUntilReset = getTimeUntilReset(subscriptionStart ?? null);
  
  const tooltipContent = hasNoSwaps 
    ? `Your current plan doesn't include swaps. Upgrade to Freelancer+ for swap allowance.`
    : isAtLimit
    ? `You've used all swaps this billing period. Resets in ${timeUntilReset}.`
    : `${used} of ${displayAllowed} swaps used this billing period. Resets in ${timeUntilReset}.`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={variant} 
            className={`gap-1 cursor-help ${isAtLimit ? 'animate-pulse' : ''}`}
          >
            {label}: {used}/{displayAllowed}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-sm">{tooltipContent}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
