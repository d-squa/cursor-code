import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

interface SparklineCardProps {
  title: string;
  value: number;
  change?: number;
  changeLabel?: string;
  data: { value: number }[];
  prefix?: string;
  suffix?: string;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink';
}

const colorConfig = {
  blue: { stroke: '#3b82f6', fill: '#3b82f6' },
  green: { stroke: '#10b981', fill: '#10b981' },
  purple: { stroke: '#8b5cf6', fill: '#8b5cf6' },
  orange: { stroke: '#f97316', fill: '#f97316' },
  pink: { stroke: '#ec4899', fill: '#ec4899' },
};

export default function SparklineCard({
  title,
  value,
  change,
  changeLabel,
  data,
  prefix = '',
  suffix = '',
  color = 'blue'
}: SparklineCardProps) {
  const isPositive = (change ?? 0) > 0;
  const isNeutral = Math.abs(change ?? 0) < 1;
  const colors = colorConfig[color];

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  return (
    <Card className="overflow-hidden group hover:shadow-lg transition-all duration-300">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold mt-1">{prefix}{formatNumber(value)}{suffix}</p>
          </div>
          
          {change !== undefined && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold",
              isNeutral ? "bg-muted text-muted-foreground" :
              isPositive ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : 
              "bg-red-500/15 text-red-600 dark:text-red-400"
            )}>
              {isNeutral ? (
                <Minus className="h-3 w-3" />
              ) : isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {change > 0 ? '+' : ''}{change.toFixed(1)}%
            </div>
          )}
        </div>

        {changeLabel && (
          <p className="text-xs text-muted-foreground mb-2">{changeLabel}</p>
        )}

        <div className="h-12 -mx-4 -mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`sparkline-${color}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.fill} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={colors.fill} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-popover border border-border rounded-lg px-2 py-1 shadow-lg text-xs">
                        {prefix}{formatNumber(payload[0].value as number)}{suffix}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={colors.stroke}
                strokeWidth={2}
                fill={`url(#sparkline-${color})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
