import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { differenceInDays } from "date-fns";

interface SwapCounterBadgeProps {
  label: string;
  used: number;
  allowed: number;
  subscriptionEnd?: string | null;
}

/**
 * Returns days until the subscription renewal/reset.
 * Uses subscriptionEnd directly so it matches the billing timeline exactly.
 */
function getDaysUntilReset(subscriptionEnd: string | null): number {
  if (!subscriptionEnd) {
    // Fallback: 1st of next month
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return Math.max(0, differenceInDays(nextMonth, now));
  }
  return Math.max(0, differenceInDays(new Date(subscriptionEnd), new Date()));
}

export default function SwapCounterBadge({
  label,
  used,
  allowed,
  subscriptionEnd,
}: SwapCounterBadgeProps) {
  const displayAllowed = allowed === Infinity ? '∞' : allowed;
  const isAtLimit = used >= allowed && allowed !== Infinity;
  const hasNoSwaps = allowed === 0;
  
  // Determine badge variant based on status
  const variant = isAtLimit ? 'destructive' : hasNoSwaps ? 'secondary' : 'outline';
  
  const daysUntilReset = getDaysUntilReset(subscriptionEnd ?? null);
  const timeUntilReset = daysUntilReset === 0 ? "less than 1 day" : daysUntilReset === 1 ? "1 day" : `${daysUntilReset} days`;
  
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
