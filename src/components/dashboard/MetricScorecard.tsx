import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricScorecardProps {
  title: string;
  planned: number;
  actual: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  invertVariance?: boolean;
  compact?: boolean;
}

export default function MetricScorecard({
  title,
  planned,
  actual,
  prefix = "",
  suffix = "",
  decimals = 0,
  invertVariance = false,
  compact = false,
}: MetricScorecardProps) {
  const variance = planned > 0 ? ((actual - planned) / planned) * 100 : 0;
  const isPositive = invertVariance ? variance < 0 : variance > 0;
  const isNeutral = Math.abs(variance) < 1;

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(decimals);
  };

  const deliveryPct = planned > 0 ? (actual / planned) * 100 : 0;

  return (
    <Card className={cn("overflow-hidden", compact && "p-2")}>
      <CardContent className={cn("p-4", compact && "p-2")}>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
          
          <div className="flex items-end justify-between">
            <div className="flex flex-col">
              <span className="text-2xl font-bold">{prefix}{formatNumber(actual)}{suffix}</span>
              <span className="text-xs text-muted-foreground">
                of {prefix}{formatNumber(planned)}{suffix} planned
              </span>
            </div>
            
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
              isNeutral ? "bg-muted text-muted-foreground" :
              isPositive ? "bg-green-500/10 text-green-600 dark:text-green-400" : 
              "bg-red-500/10 text-red-600 dark:text-red-400"
            )}>
              {isNeutral ? (
                <Minus className="h-3 w-3" />
              ) : isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-all",
                deliveryPct >= 100 ? (invertVariance ? "bg-red-500" : "bg-green-500") :
                deliveryPct >= 80 ? "bg-primary" :
                deliveryPct >= 50 ? "bg-yellow-500" :
                "bg-orange-500"
              )}
              style={{ width: `${Math.min(100, deliveryPct)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground text-right">{deliveryPct.toFixed(0)}% delivered</span>
        </div>
      </CardContent>
    </Card>
  );
}
