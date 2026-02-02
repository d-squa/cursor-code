import { useMemo } from "react";
import { format, differenceInDays, isToday, isBefore, isAfter } from "date-fns";
import { Calendar, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriptionTimelineProps {
  startDate: string;
  endDate: string;
  isOnTrial?: boolean;
  trialEndDate?: string | null;
  className?: string;
}

export function SubscriptionTimeline({
  startDate,
  endDate,
  isOnTrial = false,
  trialEndDate,
  className,
}: SubscriptionTimelineProps) {
  const timeline = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    const trialEnd = trialEndDate ? new Date(trialEndDate) : null;

    // For trial, use trial end date as the effective end
    const effectiveEnd = isOnTrial && trialEnd ? trialEnd : end;
    
    const totalDays = differenceInDays(effectiveEnd, start);
    const daysElapsed = differenceInDays(now, start);
    const daysRemaining = differenceInDays(effectiveEnd, now);
    
    // Calculate progress percentage (clamped between 0 and 100)
    const progressPercent = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));
    
    return {
      start,
      end: effectiveEnd,
      now,
      totalDays,
      daysElapsed,
      daysRemaining: Math.max(0, daysRemaining),
      progressPercent,
      isExpired: isBefore(effectiveEnd, now),
      hasStarted: isAfter(now, start) || isToday(start),
    };
  }, [startDate, endDate, isOnTrial, trialEndDate]);

  const formatShortDate = (date: Date) => format(date, "MMM d");
  const formatFullDate = (date: Date) => format(date, "MMM d, yyyy");

  return (
    <div className={cn("space-y-3", className)}>
      {/* Timeline Header with Days Remaining */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>Billing Period</span>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 font-medium",
          timeline.daysRemaining <= 7 && timeline.daysRemaining > 0 ? "text-amber-600" : "",
          timeline.daysRemaining === 0 ? "text-red-600" : "",
          timeline.daysRemaining > 7 ? "text-muted-foreground" : ""
        )}>
          <Clock className="h-4 w-4" />
          {timeline.isExpired ? (
            <span>Expired</span>
          ) : timeline.daysRemaining === 0 ? (
            <span>Expires today</span>
          ) : timeline.daysRemaining === 1 ? (
            <span>1 day remaining</span>
          ) : (
            <span>{timeline.daysRemaining} days remaining</span>
          )}
        </div>
      </div>

      {/* Timeline Visual */}
      <div className="relative">
        {/* Progress Track */}
        <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isOnTrial 
                ? "bg-gradient-to-r from-amber-400 to-amber-500" 
                : "bg-gradient-to-r from-primary to-primary/80"
            )}
            style={{ width: `${timeline.progressPercent}%` }}
          />
        </div>

        {/* Today Marker */}
        {timeline.hasStarted && !timeline.isExpired && (
          <div 
            className="absolute top-1/2 -translate-y-1/2 z-10"
            style={{ left: `calc(${timeline.progressPercent}% - 6px)` }}
          >
            <div className={cn(
              "w-3 h-3 rounded-full border-2 bg-background shadow-sm",
              isOnTrial ? "border-amber-500" : "border-primary"
            )} />
          </div>
        )}
      </div>

      {/* Timeline Labels */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-muted-foreground">
              {isOnTrial ? "Trial Started" : "Started"}
            </span>
            <span className="font-medium">{formatShortDate(timeline.start)}</span>
          </div>
        </div>

        {/* Today indicator in middle if applicable */}
        {timeline.hasStarted && !timeline.isExpired && timeline.progressPercent > 15 && timeline.progressPercent < 85 && (
          <div className="flex flex-col items-center">
            <span className="text-muted-foreground">Today</span>
            <span className="font-medium">{formatShortDate(timeline.now)}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-right">
          <div className="flex flex-col items-end">
            <span className="text-muted-foreground">
              {isOnTrial ? "Trial Ends" : "Renews"}
            </span>
            <span className={cn(
              "font-medium",
              timeline.daysRemaining <= 3 && !timeline.isExpired ? "text-amber-600" : ""
            )}>
              {formatShortDate(timeline.end)}
            </span>
          </div>
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Full date tooltip hint */}
      <div className="text-xs text-center text-muted-foreground">
        {formatFullDate(timeline.start)} → {formatFullDate(timeline.end)}
      </div>
    </div>
  );
}
