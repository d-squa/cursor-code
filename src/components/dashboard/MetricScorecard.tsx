import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
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
  icon?: React.ReactNode;
  accentColor?: 'blue' | 'green' | 'purple' | 'orange' | 'pink';
}

const accentColors = {
  blue: {
    gradient: 'from-blue-500/20 via-blue-500/5 to-transparent',
    bar: 'bg-blue-500',
    icon: 'text-blue-500',
    glow: 'shadow-blue-500/20',
  },
  green: {
    gradient: 'from-emerald-500/20 via-emerald-500/5 to-transparent',
    bar: 'bg-emerald-500',
    icon: 'text-emerald-500',
    glow: 'shadow-emerald-500/20',
  },
  purple: {
    gradient: 'from-purple-500/20 via-purple-500/5 to-transparent',
    bar: 'bg-purple-500',
    icon: 'text-purple-500',
    glow: 'shadow-purple-500/20',
  },
  orange: {
    gradient: 'from-orange-500/20 via-orange-500/5 to-transparent',
    bar: 'bg-orange-500',
    icon: 'text-orange-500',
    glow: 'shadow-orange-500/20',
  },
  pink: {
    gradient: 'from-pink-500/20 via-pink-500/5 to-transparent',
    bar: 'bg-pink-500',
    icon: 'text-pink-500',
    glow: 'shadow-pink-500/20',
  },
};

export default function MetricScorecard({
  title,
  planned,
  actual,
  prefix = "",
  suffix = "",
  decimals = 0,
  invertVariance = false,
  compact = false,
  icon,
  accentColor = 'blue',
}: MetricScorecardProps) {
  const variance = planned > 0 ? ((actual - planned) / planned) * 100 : 0;
  const isPositive = invertVariance ? variance < 0 : variance > 0;
  const isNeutral = Math.abs(variance) < 1;
  const colors = accentColors[accentColor];

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(decimals);
  };

  const deliveryPct = planned > 0 ? (actual / planned) * 100 : 0;

  return (
    <Card className={cn(
      "overflow-hidden relative group transition-all duration-300 hover:shadow-lg",
      compact && "p-2",
      colors.glow
    )}>
      {/* Gradient overlay */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-60 transition-opacity group-hover:opacity-100",
        colors.gradient
      )} />
      
      {/* Animated sparkle effect on hover */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Sparkles className={cn("h-4 w-4 animate-pulse", colors.icon)} />
      </div>

      <CardContent className={cn("p-5 relative z-10", compact && "p-3")}>
        <div className="flex flex-col gap-3">
          {/* Header with icon */}
          <div className="flex items-center gap-2">
            {icon && <div className={cn("p-1.5 rounded-lg bg-background/50", colors.icon)}>{icon}</div>}
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
          </div>
          
          {/* Main value and variance */}
          <div className="flex items-end justify-between">
            <div className="flex flex-col">
              <span className="text-3xl font-bold tracking-tight animate-fade-in">
                {prefix}{formatNumber(actual)}{suffix}
              </span>
              <span className="text-sm text-muted-foreground mt-1">
                of {prefix}{formatNumber(planned)}{suffix} planned
              </span>
            </div>
            
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-transform group-hover:scale-105",
              isNeutral ? "bg-muted text-muted-foreground" :
              isPositive ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : 
              "bg-red-500/15 text-red-600 dark:text-red-400"
            )}>
              {isNeutral ? (
                <Minus className="h-4 w-4" />
              ) : isPositive ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
            </div>
          </div>
          
          {/* Progress bar with glow effect */}
          <div className="space-y-2">
            <div className="relative h-2.5 bg-muted/50 rounded-full overflow-hidden backdrop-blur-sm">
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-30" 
                style={{ 
                  backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)' 
                }} 
              />
              
              {/* Progress fill */}
              <div 
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out",
                  deliveryPct >= 100 ? (invertVariance ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-emerald-500 to-emerald-400") :
                  deliveryPct >= 80 ? colors.bar :
                  deliveryPct >= 50 ? "bg-gradient-to-r from-yellow-500 to-amber-400" :
                  "bg-gradient-to-r from-orange-500 to-orange-400"
                )}
                style={{ 
                  width: `${Math.min(100, deliveryPct)}%`,
                  boxShadow: `0 0 12px ${deliveryPct >= 80 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(234, 179, 8, 0.5)'}`
                }}
              />
              
              {/* Animated shimmer */}
              <div 
                className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
                style={{ width: `${Math.min(100, deliveryPct)}%` }}
              />
            </div>
            
            {/* Delivery percentage */}
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Delivery Progress</span>
              <span className={cn(
                "text-xs font-semibold",
                deliveryPct >= 80 ? "text-emerald-600 dark:text-emerald-400" : 
                deliveryPct >= 50 ? "text-amber-600 dark:text-amber-400" : 
                "text-orange-600 dark:text-orange-400"
              )}>
                {deliveryPct.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
