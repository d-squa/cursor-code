// Visual confidence score indicator
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MatchConfidenceIndicatorProps {
  score: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showPercentage?: boolean;
  className?: string;
}

export function MatchConfidenceIndicator({
  score,
  size = 'md',
  showLabel = false,
  showPercentage = true,
  className,
}: MatchConfidenceIndicatorProps) {
  // Determine confidence level and color
  const getConfidenceLevel = (s: number) => {
    if (s >= 85) return { level: 'high', label: 'High Match', color: 'bg-emerald-500' };
    if (s >= 60) return { level: 'medium', label: 'Medium Match', color: 'bg-amber-500' };
    if (s >= 40) return { level: 'low', label: 'Low Match', color: 'bg-orange-500' };
    return { level: 'poor', label: 'Poor Match', color: 'bg-destructive' };
  };

  const { level, label, color } = getConfidenceLevel(score);

  const sizeClasses = {
    sm: { container: 'h-1.5 w-16', text: 'text-xs' },
    md: { container: 'h-2 w-24', text: 'text-sm' },
    lg: { container: 'h-3 w-32', text: 'text-base' },
  };

  const { container, text } = sizeClasses[size];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-2', className)}>
            {/* Progress bar */}
            <div className={cn('bg-muted rounded-full overflow-hidden', container)}>
              <div 
                className={cn('h-full rounded-full transition-all duration-300', color)}
                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
              />
            </div>
            
            {/* Percentage */}
            {showPercentage && (
              <span className={cn('font-medium tabular-nums', text)}>
                {Math.round(score)}%
              </span>
            )}
            
            {/* Label */}
            {showLabel && (
              <span className={cn('text-muted-foreground', text)}>
                {label}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">Confidence: {Math.round(score)}%</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
