import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  TrendingUp, TrendingDown, Check, 
  BarChart3, MessageSquare, Zap, Target, DollarSign, StickyNote, ChevronDown
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
    if (absDiff <= 5) return { status: "on-track", icon: Check, color: "text-green-600", bgColor: "bg-green-500", label: "On Track" };
    if (totalPacingDiff > 5) return { status: "overpacing", icon: TrendingUp, color: "text-destructive", bgColor: "bg-destructive", label: "Overpacing" };
    return { status: "underpacing", icon: TrendingDown, color: "text-amber-600", bgColor: "bg-amber-500", label: "Underpacing" };
  }, [totalPacingDiff]);

  const PacingIcon = pacingStatus.icon;

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const getPlatformPacingStatus = (pacingDiff: number) => {
    const absDiff = Math.abs(pacingDiff);
    if (absDiff <= 5) return { color: "text-green-600", bgColor: "bg-green-500", label: "On Track" };
    if (pacingDiff > 5) return { color: "text-destructive", bgColor: "bg-destructive", label: "Overpacing" };
    return { color: "text-amber-600", bgColor: "bg-amber-500", label: "Underpacing" };
  };

  const durationTooltip = `${format(new Date(campaign.start_date), "MMM d")} - ${format(new Date(campaign.end_date), "MMM d, yyyy")} (${totalDays} days)\n\n${elapsedDays} days (${totalTimePct.toFixed(1)}%) out of ${totalDays} days spent`;
  const budgetTooltip = `Spent: ${formatCurrency(totalBudgetSpent)} (${totalBudgetPct.toFixed(0)}%) out of ${formatCurrency(campaign.total_budget)}\n\nExpected: ${totalTimePct.toFixed(1)}% | Actual: ${totalBudgetPct.toFixed(0)}%\nDifference: ${totalPacingDiff > 0 ? "+" : ""}${totalPacingDiff.toFixed(1)}%`;

  return (
    <TooltipProvider>
      <Card className="hover:shadow-lg transition-shadow aspect-square flex flex-col">
        <CardContent className="p-4 flex flex-col h-full">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold truncate">{campaign.name}</h3>
              {isSampleData && (
                <Badge variant="outline" className="mt-0.5 text-[9px] h-4">Sample</Badge>
              )}
            </div>
            <Badge variant={statusConfig[campaign.status]?.variant || "outline"} className="text-[10px] h-5">
              {statusConfig[campaign.status]?.label || campaign.status}
            </Badge>
          </div>

          {/* Pacing Status */}
          <div className="flex items-center gap-1.5 mb-3">
            <PacingIcon className={cn("h-4 w-4", pacingStatus.color)} />
            <span className={cn("text-sm font-semibold", pacingStatus.color)}>
              {pacingStatus.label}
            </span>
          </div>

          {/* Budget Pacing Bar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="space-y-1 mb-3 cursor-help">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Budget Pacing</span>
                  <span>{totalBudgetPct.toFixed(0)}%</span>
                </div>
                <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                  {/* Ideal spend marker (time-based) */}
                  <div 
                    className="absolute top-0 h-3 bg-muted-foreground/20 rounded-full"
                    style={{ width: `${Math.min(totalTimePct, 100)}%` }}
                  />
                  {/* Actual spend bar */}
                  <div 
                    className={cn("absolute top-0 h-3 rounded-full transition-all", pacingStatus.bgColor)}
                    style={{ width: `${Math.min(totalBudgetPct, 100)}%` }}
                  />
                  {/* Ideal marker line */}
                  <div 
                    className="absolute top-0 h-3 w-0.5 bg-foreground/40"
                    style={{ left: `${Math.min(totalTimePct, 100)}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">
              <p className="font-medium mb-1">Duration</p>
              <p className="text-muted-foreground">{durationTooltip}</p>
              <p className="font-medium mt-2 mb-1">Budget</p>
              <p className="text-muted-foreground">{budgetTooltip}</p>
            </TooltipContent>
          </Tooltip>

          {/* Platform Breakdown Collapsible */}
          {platformPacing.length > 0 && (
            <Collapsible open={platformsOpen} onOpenChange={setPlatformsOpen} className="mb-3">
              <CollapsibleTrigger className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                <span>By Platform ({platformPacing.length})</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", platformsOpen && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                {platformPacing.map((platform) => {
                  const status = getPlatformPacingStatus(platform.pacingDiff);
                  const platformDurationTooltip = `${format(new Date(platform.startDate), "MMM d")} - ${format(new Date(platform.endDate), "MMM d, yyyy")} (${platform.totalDays} days)\n\n${platform.elapsedDays} days (${platform.timePct.toFixed(0)}%) out of ${platform.totalDays} days spent`;
                  const platformBudgetTooltip = `Spent: ${formatCurrency(platform.budgetSpent)} (${platform.budgetPct.toFixed(0)}%) out of ${formatCurrency(platform.budgetTotal)}\n\nExpected: ${platform.timePct.toFixed(0)}% | Actual: ${platform.budgetPct.toFixed(0)}%\nDifference: ${platform.pacingDiff > 0 ? "+" : ""}${platform.pacingDiff.toFixed(1)}%`;
                  
                  return (
                    <Tooltip key={platform.platform}>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <div className="flex items-center justify-between text-[10px] mb-0.5">
                            <div className="flex items-center gap-1">
                              <span className="capitalize font-medium">{platform.platform}</span>
                              {platform.hasRecentImpressions && (
                                <Zap className="h-2.5 w-2.5 text-green-500" />
                              )}
                            </div>
                            <span className={cn("font-medium", status.color)}>{status.label}</span>
                          </div>
                          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="absolute top-0 h-2 bg-muted-foreground/20 rounded-full"
                              style={{ width: `${Math.min(platform.timePct, 100)}%` }}
                            />
                            <div 
                              className={cn("absolute top-0 h-2 rounded-full", status.bgColor)}
                              style={{ width: `${Math.min(platform.budgetPct, 100)}%` }}
                            />
                            <div 
                              className="absolute top-0 h-2 w-0.5 bg-foreground/40"
                              style={{ left: `${Math.min(platform.timePct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">
                        <p className="font-medium mb-1">{platform.platform} Duration</p>
                        <p className="text-muted-foreground">{platformDurationTooltip}</p>
                        <p className="font-medium mt-2 mb-1">Budget</p>
                        <p className="text-muted-foreground">{platformBudgetTooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Stats Row */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground mt-auto mb-2">
            <div className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              <span>{modificationRequests.total}</span>
              {modificationRequests.pending > 0 && (
                <Badge variant="secondary" className="h-3.5 px-1 text-[8px]">
                  {modificationRequests.pending}
                </Badge>
              )}
            </div>
            {completedByCategory.optimization > 0 && (
              <div className="flex items-center gap-0.5">
                <Target className="h-3 w-3 text-green-500" />
                <span>{completedByCategory.optimization}</span>
              </div>
            )}
            {completedByCategory.budget > 0 && (
              <div className="flex items-center gap-0.5">
                <DollarSign className="h-3 w-3 text-green-500" />
                <span>{completedByCategory.budget}</span>
              </div>
            )}
            {completedByCategory.notesLast7Days > 0 && (
              <div className="flex items-center gap-0.5">
                <StickyNote className="h-3 w-3 text-blue-500" />
                <span>{completedByCategory.notesLast7Days}</span>
              </div>
            )}
            <div className="flex items-center gap-0.5">
              <BarChart3 className="h-3 w-3" />
              {hasRecentAnalysis ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <span className="text-[10px]">-</span>
              )}
            </div>
          </div>

          {/* Action Button */}
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full h-7 text-xs"
            onClick={() => !isSampleData && navigate(`/actiplans/${campaign.id}/report`)}
            disabled={isSampleData}
          >
            <BarChart3 className="h-3 w-3 mr-1" />
            Check Performance
          </Button>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}