import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { differenceInDays, differenceInHours, startOfMonth, addMonths } from "date-fns";

interface SwapCounterBadgeProps {
  label: string;
  used: number;
  allowed: number;
  resetPeriod?: 'monthly' | 'weekly';
}

/**
 * Returns time until the next reset based on period
 */
function getTimeUntilReset(period: 'monthly' | 'weekly'): string {
  const now = new Date();
  
  if (period === 'monthly') {
    // Swaps reset on 1st of next month (UTC)
    const nextReset = startOfMonth(addMonths(now, 1));
    const daysRemaining = differenceInDays(nextReset, now);
    const hoursRemaining = differenceInHours(nextReset, now) % 24;
    
    if (daysRemaining > 1) {
      return `${daysRemaining} days`;
    } else if (daysRemaining === 1) {
      return `1 day, ${hoursRemaining} hours`;
    } else {
      return `${hoursRemaining} hours`;
    }
  }
  
  // Weekly reset - find next Monday
  const dayOfWeek = now.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  
  const daysRemaining = differenceInDays(nextMonday, now);
  const hoursRemaining = differenceInHours(nextMonday, now) % 24;
  
  if (daysRemaining > 1) {
    return `${daysRemaining} days`;
  } else if (daysRemaining === 1) {
    return `1 day, ${hoursRemaining} hours`;
  } else {
    return `${hoursRemaining} hours`;
  }
}

export default function SwapCounterBadge({
  label,
  used,
  allowed,
  resetPeriod = 'monthly',
}: SwapCounterBadgeProps) {
  const displayAllowed = allowed === Infinity ? '∞' : allowed;
  const isAtLimit = used >= allowed && allowed !== Infinity;
  const hasNoSwaps = allowed === 0;
  
  // Determine badge variant based on status
  const variant = isAtLimit ? 'destructive' : hasNoSwaps ? 'secondary' : 'outline';
  
  const timeUntilReset = getTimeUntilReset(resetPeriod);
  const periodLabel = resetPeriod === 'monthly' ? 'month' : 'week';
  
  const tooltipContent = hasNoSwaps 
    ? `Your current plan doesn't include swaps. Upgrade to Freelancer+ for swap allowance.`
    : isAtLimit
    ? `You've used all swaps this ${periodLabel}. Resets in ${timeUntilReset}.`
    : `${used} of ${displayAllowed} swaps used this ${periodLabel}. Resets in ${timeUntilReset}.`;

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
