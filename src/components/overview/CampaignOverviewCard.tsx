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

interface CompletedRequestsByCategory {
  optimization: number;
  budget: number;
  notesLast7Days: number;
}

interface CampaignOverviewCardProps {
  campaign: {
    id: string;
    name: string;
    status: string;
    total_budget: number;
    start_date: string;
    end_date: string;
    updated_at: string;
  };
  platformPacing: PlatformPacing[];
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
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  live: { label: "Live", variant: "default" },
  ended: { label: "Ended", variant: "secondary" },
  pushed_to_dsp: { label: "Pushed", variant: "outline" },
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

export function CampaignOverviewCard({
  campaign,
  platformPacing,
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
}: CampaignOverviewCardProps) {
  const navigate = useNavigate();
  const [platformsOpen, setPlatformsOpen] = useState(false);

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

  const actiplanTooltip = `${format(new Date(campaign.start_date), "MMM d")} - ${format(new Date(campaign.end_date), "MMM d, yyyy")} (${totalDays} days)\n${elapsedDays} days (${totalTimePct.toFixed(0)}%) elapsed\n\nBudget: ${formatCurrency(totalBudgetSpent)} of ${formatCurrency(campaign.total_budget)} (${totalBudgetPct.toFixed(0)}%)\nExpected: ${totalTimePct.toFixed(0)}% | Actual: ${totalBudgetPct.toFixed(0)}%\nDiff: ${totalPacingDiff > 0 ? "+" : ""}${totalPacingDiff.toFixed(1)}%`;

  return (
    <TooltipProvider>
      <Card className="hover:shadow-lg transition-shadow w-full max-w-[280px]">
        <CardContent className="p-4 flex flex-col">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold truncate">{campaign.name}</h3>
              {isSampleData && (
                <Badge variant="outline" className="mt-0.5 text-[9px] h-4">Sample</Badge>
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
              <CollapsibleContent className="space-y-3 pt-2">
                {platformPacing.map((platform) => {
                  const platformTooltip = `${format(new Date(platform.startDate), "MMM d")} - ${format(new Date(platform.endDate), "MMM d, yyyy")} (${platform.totalDays} days)\n${platform.elapsedDays} days (${platform.timePct.toFixed(0)}%) elapsed\n\nBudget: ${formatCurrency(platform.budgetSpent)} of ${formatCurrency(platform.budgetTotal)} (${platform.budgetPct.toFixed(0)}%)\nExpected: ${platform.timePct.toFixed(0)}% | Actual: ${platform.budgetPct.toFixed(0)}%\nDiff: ${platform.pacingDiff > 0 ? "+" : ""}${platform.pacingDiff.toFixed(1)}%`;
                  
                  return (
                    <PacingBar
                      key={platform.platform}
                      timePct={platform.timePct}
                      budgetPct={platform.budgetPct}
                      pacingDiff={platform.pacingDiff}
                      label={platform.platform.charAt(0).toUpperCase() + platform.platform.slice(1)}
                      tooltipContent={platformTooltip}
                      hasRecentImpressions={platform.hasRecentImpressions}
                    />
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-1 text-center mt-auto mb-2 border-t pt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center cursor-help">
                  <span className="text-[8px] text-muted-foreground uppercase tracking-tight">Changes</span>
                  <span className="text-sm font-semibold">{modificationRequests.total}</span>
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
                    modificationRequests.pending > 0 && "text-amber-600"
                  )}>
                    {modificationRequests.pending}
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
                    completedByCategory.optimization > 0 && "text-green-600"
                  )}>
                    {completedByCategory.optimization}
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
                    completedByCategory.notesLast7Days > 0 && "text-blue-600"
                  )}>
                    {completedByCategory.notesLast7Days}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Notes created in the last 7 days</TooltipContent>
            </Tooltip>
          </div>

          {/* Action Button */}
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full h-7 text-xs"
            onClick={() => navigate(`/actiplans/${campaign.id}/report`)}
          >
            <BarChart3 className="h-3 w-3 mr-1" />
            Check Performance
          </Button>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
