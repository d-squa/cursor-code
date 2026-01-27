import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface PerformanceMetric {
  label: string;
  kpi: string;
  targetValue: number;
  actualValue: number;
  timePct: number;
  unit?: string;
}

interface PerformanceBarProps {
  metric: PerformanceMetric;
}

export function PerformanceBar({ metric }: PerformanceBarProps) {
  const { label, kpi, targetValue, actualValue, timePct, unit = '' } = metric;
  
  // Calculate expected value based on time elapsed
  const expectedValue = (targetValue * timePct) / 100;
  
  // Calculate actual percentage of target achieved
  const actualPct = targetValue > 0 ? (actualValue / targetValue) * 100 : 0;
  
  // Calculate performance diff vs expected (based on time)
  const performanceDiff = actualPct - timePct;
  
  const isOnTarget = Math.abs(performanceDiff) <= 10;
  const isOverachieving = performanceDiff > 10;
  const isUnderachieving = performanceDiff < -10;
  
  // Determine colors based on performance
  const getColors = () => {
    if (isOnTarget) {
      return { base: "bg-blue-500", diff: "bg-blue-300", text: "text-blue-600", bg: "bg-blue-100" };
    }
    if (isOverachieving) {
      return { base: "bg-blue-500", diff: "bg-green-500", text: "text-green-600", bg: "bg-green-100" };
    }
    return { base: "bg-blue-500", diff: "bg-orange-400", text: "text-orange-600", bg: "bg-orange-100" };
  };
  
  const colors = getColors();
  const statusLabel = isOnTarget ? "On Target" : isOverachieving ? "Ahead" : "Behind";
  
  // Format value for display
  const formatValue = (value: number): string => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  };
  
  // Calculate bar segments
  const expected = Math.min(timePct, 100);
  const actual = Math.min(actualPct, 100);
  
  const tooltipContent = `${kpi}: ${formatValue(actualValue)}${unit} of ${formatValue(targetValue)}${unit} target\n` +
    `Progress: ${actualPct.toFixed(1)}% (Expected: ${timePct.toFixed(1)}%)\n` +
    `${performanceDiff >= 0 ? "+" : ""}${performanceDiff.toFixed(1)}% vs expected`;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] font-medium text-muted-foreground">{label}</span>
            <span className={cn("text-[8px] font-medium", colors.text)}>{statusLabel}</span>
          </div>
          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
            {isOverachieving ? (
              <>
                {/* Expected portion (blue) */}
                <div 
                  className={cn("absolute top-0 h-2 rounded-l-full", colors.base)}
                  style={{ width: `${expected}%` }}
                />
                {/* Over-achievement portion (green) */}
                <div 
                  className={cn("absolute top-0 h-2", colors.diff)}
                  style={{ left: `${expected}%`, width: `${Math.min(actual - expected, 100 - expected)}%` }}
                />
              </>
            ) : isUnderachieving ? (
              <>
                {/* Actual progress (blue) */}
                <div 
                  className={cn("absolute top-0 h-2 rounded-l-full", colors.base)}
                  style={{ width: `${actual}%` }}
                />
                {/* Under-achievement gap (orange) */}
                <div 
                  className={cn("absolute top-0 h-2", colors.diff)}
                  style={{ left: `${actual}%`, width: `${expected - actual}%` }}
                />
              </>
            ) : (
              /* On target - just show actual in blue */
              <div 
                className={cn("absolute top-0 h-2 rounded-l-full", colors.base)}
                style={{ width: `${actual}%` }}
              />
            )}
            {/* Expected marker line */}
            <div 
              className="absolute top-0 h-2 w-0.5 bg-foreground/40"
              style={{ left: `${expected}%` }}
            />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">
        <p className="text-muted-foreground">{tooltipContent}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function getPerformanceStatus(metrics: PerformanceMetric[]): 'overachieving' | 'on-target' | 'underachieving' {
  if (metrics.length === 0) return 'on-target';
  
  const avgDiff = metrics.reduce((sum, m) => {
    const targetPct = m.targetValue > 0 ? (m.actualValue / m.targetValue) * 100 : 0;
    return sum + (targetPct - m.timePct);
  }, 0) / metrics.length;
  
  if (avgDiff > 10) return 'overachieving';
  if (avgDiff < -10) return 'underachieving';
  return 'on-target';
}
