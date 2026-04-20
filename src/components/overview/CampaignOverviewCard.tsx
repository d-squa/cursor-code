import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  TrendingUp, TrendingDown, Check, 
  BarChart3, Zap, ChevronDown
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { PerformanceBar, PerformanceMetric, getPerformanceStatus } from "./PerformanceBar";

interface PlatformPacing {
  platform: string;
  budgetSpent: number;
  budgetTotal: number;
  budgetPct: number;
  timePct: number;
  pacingDiff: number;
  hasRecentImpressions: boolean;
  lastImpressionAt?: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  elapsedDays: number;
}

export interface PlatformPerformance {
  platform: string;
  metrics: PerformanceMetric[];
}

interface CompletedRequestsByCategory {
  optimization: number;
  budget: number;
  notesLast7Days: number;
}

interface PlatformStats {
  platform: string;
  changes: number;
  pending: number;
  optimized: number;
  notes: number;
}

type DateRangeFilter = "lifetime" | "this_month" | "last_7_days";

interface CampaignOverviewCardProps {
  campaign: {
    id: string;
    name: string;
    status: string;
    total_budget: number;
    start_date: string;
    end_date: string;
    updated_at: string;
    bo_number?: string;
  };
  platformPacing: PlatformPacing[];
  platformPerformance?: PlatformPerformance[];
  totalBudgetSpent: number;
  totalTimePct: number;
  totalBudgetPct: number;
  totalPacingDiff: number;
  totalDays: number;
  elapsedDays: number;
  modificationRequests: {
    total: number;
    pending: number;
  };
  completedByCategory: CompletedRequestsByCategory;
  hasRecentAnalysis: boolean;
  isSampleData?: boolean;
  platformStats?: PlatformStats[];
  // Stats by date range
  statsByDateRange?: {
    lifetime: { changes: number; pending: number; optimized: number; notes: number };
    this_month: { changes: number; pending: number; optimized: number; notes: number };
    last_7_days: { changes: number; pending: number; optimized: number; notes: number };
  };
  platformStatsByDateRange?: {
    [platform: string]: {
      lifetime: { changes: number; pending: number; optimized: number; notes: number };
      this_month: { changes: number; pending: number; optimized: number; notes: number };
      last_7_days: { changes: number; pending: number; optimized: number; notes: number };
    };
  };
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  live: { label: "Live", variant: "default" },
  ended: { label: "Ended", variant: "secondary" },
  pushed_to_dsp: { label: "Pushed", variant: "outline" },
  partially_pushed: { label: "Partial", variant: "destructive" },
};

// Pacing bar component - shows actual spend vs expected with over/under indication
function PacingBar({ 
  timePct, 
  budgetPct, 
  pacingDiff,
  label,
  tooltipContent,
  hasRecentImpressions,
}: { 
  timePct: number; 
  budgetPct: number; 
  pacingDiff: number;
  label: string;
  tooltipContent: string;
  hasRecentImpressions?: boolean;
}) {
  const absDiff = Math.abs(pacingDiff);
  const isOnTrack = absDiff <= 5;
  const isOverpacing = pacingDiff > 5;
  const isUnderpacing = pacingDiff < -5;

  // Calculate bar segments
  const expected = Math.min(timePct, 100);
  const actual = Math.min(budgetPct, 100);
  
  // Determine colors based on status
  const getColors = () => {
    if (isOnTrack) {
      return { base: "bg-green-500", diff: "bg-green-300", text: "text-green-600" };
    }
    if (isOverpacing) {
      return { base: "bg-green-500", diff: "bg-red-500", text: "text-red-600" };
    }
    return { base: "bg-green-500", diff: "bg-amber-400", text: "text-amber-600" };
  };

  const colors = getColors();
  const statusLabel = isOnTrack ? "On Track" : isOverpacing ? "Overpacing" : "Underpacing";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-medium text-foreground">{label}</span>
              {hasRecentImpressions && (
                <Zap className="h-2.5 w-2.5 text-green-500" />
              )}
            </div>
            <span className={cn("text-[9px] font-medium", colors.text)}>{statusLabel}</span>
          </div>
          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
            {isOverpacing ? (
              <>
                {/* Expected portion (green) */}
                <div 
                  className={cn("absolute top-0 h-3 rounded-l-full", colors.base)}
                  style={{ width: `${expected}%` }}
                />
                {/* Overspend portion (red) */}
                <div 
                  className={cn("absolute top-0 h-3", colors.diff)}
                  style={{ left: `${expected}%`, width: `${Math.min(actual - expected, 100 - expected)}%` }}
                />
              </>
            ) : isUnderpacing ? (
              <>
                {/* Actual spend (green) */}
                <div 
                  className={cn("absolute top-0 h-3 rounded-l-full", colors.base)}
                  style={{ width: `${actual}%` }}
                />
                {/* Underspend gap (amber/muted) */}
                <div 
                  className={cn("absolute top-0 h-3", colors.diff)}
                  style={{ left: `${actual}%`, width: `${expected - actual}%` }}
                />
              </>
            ) : (
              /* On track - just show actual in green */
              <div 
                className={cn("absolute top-0 h-3 rounded-l-full", colors.base)}
                style={{ width: `${actual}%` }}
              />
            )}
            {/* Expected marker line */}
            <div 
              className="absolute top-0 h-3 w-0.5 bg-foreground/60"
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

// Stats row component for reuse
function StatsRow({ 
  stats, 
  label,
  showLabel = true 
}: { 
  stats: { changes: number; pending: number; optimized: number; notes: number }; 
  label?: string;
  showLabel?: boolean;
}) {
  return (
    <div className="space-y-1">
      {showLabel && label && (
        <span className="text-[9px] font-medium text-muted-foreground">{label}</span>
      )}
      <div className="grid grid-cols-4 gap-1 text-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center cursor-help">
              <span className="text-[8px] text-muted-foreground uppercase tracking-tight">Changes</span>
              <span className="text-sm font-semibold">{stats.changes}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Total modification requests</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center cursor-help">
              <span className="text-[8px] text-muted-foreground uppercase tracking-tight">Pending</span>
              <span className={cn(
                "text-sm font-semibold",
                stats.pending > 0 && "text-amber-600"
              )}>
                {stats.pending}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Pending requests awaiting action</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center cursor-help">
              <span className="text-[8px] text-muted-foreground uppercase tracking-tight">Optimized</span>
              <span className={cn(
                "text-sm font-semibold",
                stats.optimized > 0 && "text-green-600"
              )}>
                {stats.optimized}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Completed optimization requests</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center cursor-help">
              <span className="text-[8px] text-muted-foreground uppercase tracking-tight">Notes</span>
              <span className={cn(
                "text-sm font-semibold",
                stats.notes > 0 && "text-blue-600"
              )}>
                {stats.notes}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Notes added</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

const dateRangeLabels: Record<DateRangeFilter, string> = {
  lifetime: "Lifetime",
  this_month: "This Month",
  last_7_days: "Last 7 Days",
};

export function CampaignOverviewCard({
  campaign,
  platformPacing,
  platformPerformance,
  totalBudgetSpent,
  totalTimePct,
  totalBudgetPct,
  totalPacingDiff,
  totalDays,
  elapsedDays,
  modificationRequests,
  completedByCategory,
  hasRecentAnalysis,
  isSampleData,
  statsByDateRange,
  platformStatsByDateRange,
}: CampaignOverviewCardProps) {
  const navigate = useNavigate();
  const [platformsOpen, setPlatformsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeFilter>("lifetime");

  // Calculate overall performance status
  const overallPerformanceStatus = useMemo(() => {
    if (!platformPerformance || platformPerformance.length === 0) return null;
    const allMetrics = platformPerformance.flatMap(p => p.metrics);
    return getPerformanceStatus(allMetrics);
  }, [platformPerformance]);

  const pacingStatus = useMemo(() => {
    const absDiff = Math.abs(totalPacingDiff);
    if (absDiff <= 5) return { status: "on-track", icon: Check, label: "On Track" };
    if (totalPacingDiff > 5) return { status: "overpacing", icon: TrendingUp, label: "Overpacing" };
    return { status: "underpacing", icon: TrendingDown, label: "Underpacing" };
  }, [totalPacingDiff]);

  const PacingIcon = pacingStatus.icon;

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  // Get current stats based on date range
  const currentStats = useMemo(() => {
    if (statsByDateRange) {
      return statsByDateRange[dateRange];
    }
    // Fallback to existing props
    return {
      changes: modificationRequests.total,
      pending: modificationRequests.pending,
      optimized: completedByCategory.optimization,
      notes: completedByCategory.notesLast7Days,
    };
  }, [dateRange, statsByDateRange, modificationRequests, completedByCategory]);

  // Get platform stats for current date range
  const currentPlatformStats = useMemo(() => {
    if (!platformStatsByDateRange) return [];
    return platformPacing.map(p => ({
      platform: p.platform,
      stats: platformStatsByDateRange[p.platform]?.[dateRange] || { changes: 0, pending: 0, optimized: 0, notes: 0 },
    }));
  }, [dateRange, platformStatsByDateRange, platformPacing]);

  const actiplanTooltip = `${format(new Date(campaign.start_date), "MMM d")} - ${format(new Date(campaign.end_date), "MMM d, yyyy")} (${totalDays} days)\n${elapsedDays} days (${totalTimePct.toFixed(0)}%) elapsed\n\nBudget: ${formatCurrency(totalBudgetSpent)} of ${formatCurrency(campaign.total_budget)} (${totalBudgetPct.toFixed(0)}%)\nExpected: ${totalTimePct.toFixed(0)}% | Actual: ${totalBudgetPct.toFixed(0)}%\nDiff: ${totalPacingDiff > 0 ? "+" : ""}${totalPacingDiff.toFixed(1)}%`;

  return (
    <TooltipProvider>
      <Card className="hover:shadow-lg transition-shadow w-full max-w-[320px]">
        <CardContent className="p-4 flex flex-col">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold truncate">{campaign.name}</h3>
              {campaign.bo_number && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  BO: {campaign.bo_number}
                </span>
              )}
              {isSampleData && (
                <Badge variant="outline" className="mt-0.5 text-[9px] h-4 ml-1">Sample</Badge>
              )}
            </div>
            <Badge 
              variant={statusConfig[campaign.status]?.variant || "outline"} 
              className={cn(
                "text-[10px] h-5",
                campaign.status === "live" && "bg-green-500 hover:bg-green-600 text-white border-green-500"
              )}
            >
              {statusConfig[campaign.status]?.label || campaign.status}
            </Badge>
          </div>

          {/* Overall Pacing Status */}
          <div className="flex items-center gap-1.5 mb-3">
            <PacingIcon className={cn(
              "h-4 w-4",
              pacingStatus.status === "on-track" && "text-green-600",
              pacingStatus.status === "overpacing" && "text-red-600",
              pacingStatus.status === "underpacing" && "text-amber-600"
            )} />
            <span className={cn(
              "text-sm font-semibold",
              pacingStatus.status === "on-track" && "text-green-600",
              pacingStatus.status === "overpacing" && "text-red-600",
              pacingStatus.status === "underpacing" && "text-amber-600"
            )}>
              {pacingStatus.label}
            </span>
          </div>

          {/* ActiPlan Pacing Bar */}
          <div className="mb-3">
            <PacingBar
              timePct={totalTimePct}
              budgetPct={totalBudgetPct}
              pacingDiff={totalPacingDiff}
              label="ActiPlan"
              tooltipContent={actiplanTooltip}
            />
          </div>

          {/* Platform Breakdown Collapsible */}
          {platformPacing.length > 0 && (
            <Collapsible open={platformsOpen} onOpenChange={setPlatformsOpen} className="mb-3">
              <CollapsibleTrigger className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-2">
                <span className="font-medium">By Platform ({platformPacing.length})</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", platformsOpen && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                {platformPacing.map((platform) => {
                  const platformTooltip = `${format(new Date(platform.startDate), "MMM d")} - ${format(new Date(platform.endDate), "MMM d, yyyy")} (${platform.totalDays} days)\n${platform.elapsedDays} days (${platform.timePct.toFixed(0)}%) elapsed\n\nBudget: ${formatCurrency(platform.budgetSpent)} of ${formatCurrency(platform.budgetTotal)} (${platform.budgetPct.toFixed(0)}%)\nExpected: ${platform.timePct.toFixed(0)}% | Actual: ${platform.budgetPct.toFixed(0)}%\nDiff: ${platform.pacingDiff > 0 ? "+" : ""}${platform.pacingDiff.toFixed(1)}%`;
                  
                  // Get performance metrics for this platform
                  const perfData = platformPerformance?.find(p => p.platform.toLowerCase() === platform.platform.toLowerCase());
                  
                  return (
                    <div key={platform.platform} className="space-y-1.5">
                      {/* Budget Pacing Bar */}
                      <PacingBar
                        timePct={platform.timePct}
                        budgetPct={platform.budgetPct}
                        pacingDiff={platform.pacingDiff}
                        label={platform.platform.charAt(0).toUpperCase() + platform.platform.slice(1)}
                        tooltipContent={platformTooltip}
                        hasRecentImpressions={platform.hasRecentImpressions}
                      />
                      
                      {/* Performance KPI Bars */}
                      {perfData && perfData.metrics.length > 0 && (
                        <div className="pl-2 border-l-2 border-muted space-y-1">
                          {perfData.metrics.map((metric, idx) => (
                            <PerformanceBar key={`${platform.platform}-${metric.kpi}-${idx}`} metric={metric} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Activity Stats Section */}
          <div className="border-t pt-2 mt-auto mb-2">
            {/* Title and Date Range Toggle */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground">Activity Stats</span>
              <div className="flex gap-0.5">
                {(["lifetime", "this_month", "last_7_days"] as DateRangeFilter[]).map((range) => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    className={cn(
                      "px-1.5 py-0.5 text-[8px] rounded transition-colors",
                      dateRange === range
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {range === "lifetime" ? "All" : range === "this_month" ? "Month" : "7D"}
                  </button>
                ))}
              </div>
            </div>

            {/* ActiPlan Level Stats (Aggregated) */}
            <StatsRow stats={currentStats} label="All Platforms" showLabel={false} />

            {/* Platform Level Stats Collapsible */}
            {currentPlatformStats.length > 0 && (
              <Collapsible open={statsOpen} onOpenChange={setStatsOpen} className="mt-2">
                <CollapsibleTrigger className="flex items-center justify-between w-full text-[9px] text-muted-foreground hover:text-foreground transition-colors py-1">
                  <span className="font-medium">Stats by Platform</span>
                  <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", statsOpen && "rotate-180")} />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-1">
                  {currentPlatformStats.map(({ platform, stats }) => (
                    <div key={platform} className="pl-2 border-l-2 border-muted">
                      <span className="text-[9px] font-medium text-muted-foreground mb-1 block">
                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </span>
                      <div className="grid grid-cols-4 gap-1 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-[7px] text-muted-foreground uppercase">Chg</span>
                          <span className="text-xs font-semibold">{stats.changes}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[7px] text-muted-foreground uppercase">Pnd</span>
                          <span className={cn("text-xs font-semibold", stats.pending > 0 && "text-amber-600")}>{stats.pending}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[7px] text-muted-foreground uppercase">Opt</span>
                          <span className={cn("text-xs font-semibold", stats.optimized > 0 && "text-green-600")}>{stats.optimized}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[7px] text-muted-foreground uppercase">Nts</span>
                          <span className={cn("text-xs font-semibold", stats.notes > 0 && "text-blue-600")}>{stats.notes}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>

          {/* Action Button */}
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full h-7 text-xs"
            onClick={() => navigate(`/app/actiplans/${campaign.id}/report`)}
          >
            <BarChart3 className="h-3 w-3 mr-1" />
            Check Performance
          </Button>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
