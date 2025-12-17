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
    if (absDiff <= 5) return { status: "on-track", icon: Check, label: "On Track", actualColor: "bg-green-400", idealColor: "bg-green-600" };
    if (totalPacingDiff > 5) return { status: "overpacing", icon: TrendingUp, label: "Overpacing", actualColor: "bg-red-400", idealColor: "bg-red-600" };
    return { status: "underpacing", icon: TrendingDown, label: "Underpacing", actualColor: "bg-amber-400", idealColor: "bg-amber-600" };
  }, [totalPacingDiff]);

  const PacingIcon = pacingStatus.icon;

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const getPlatformPacingStatus = (pacingDiff: number) => {
    const absDiff = Math.abs(pacingDiff);
    if (absDiff <= 5) return { label: "On Track", actualColor: "bg-green-400", idealColor: "bg-green-600" };
    if (pacingDiff > 5) return { label: "Overpacing", actualColor: "bg-red-400", idealColor: "bg-red-600" };
    return { label: "Underpacing", actualColor: "bg-amber-400", idealColor: "bg-amber-600" };
  };

  const durationTooltip = `${format(new Date(campaign.start_date), "MMM d")} - ${format(new Date(campaign.end_date), "MMM d, yyyy")} (${totalDays} days)\n\n${elapsedDays} days (${totalTimePct.toFixed(1)}%) out of ${totalDays} days spent`;
  const budgetTooltip = `Spent: ${formatCurrency(totalBudgetSpent)} (${totalBudgetPct.toFixed(0)}%) out of ${formatCurrency(campaign.total_budget)}\n\nExpected: ${totalTimePct.toFixed(1)}% | Actual: ${totalBudgetPct.toFixed(0)}%\nDifference: ${totalPacingDiff > 0 ? "+" : ""}${totalPacingDiff.toFixed(1)}%`;

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

          {/* Pacing Status */}
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

          {/* ActiPlan Duration Bar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="space-y-1 mb-2 cursor-help">
                <div className="text-[10px] text-muted-foreground font-medium">ActiPlan Duration</div>
                <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
                  {/* Ideal time marker (darker) */}
                  <div 
                    className={cn("absolute top-0 h-2.5 rounded-full", pacingStatus.idealColor)}
                    style={{ width: `${Math.min(totalTimePct, 100)}%` }}
                  />
                  {/* Remaining time (grey) - already shown as bg-muted */}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">
              <p className="text-muted-foreground">{durationTooltip}</p>
            </TooltipContent>
          </Tooltip>

          {/* ActiPlan Budget Bar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="space-y-1 mb-3 cursor-help">
                <div className="text-[10px] text-muted-foreground font-medium">ActiPlan Budget</div>
                <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
                  {/* Ideal spend marker (darker) */}
                  <div 
                    className={cn("absolute top-0 h-2.5 rounded-full", pacingStatus.idealColor)}
                    style={{ width: `${Math.min(totalTimePct, 100)}%` }}
                  />
                  {/* Actual spend bar (lighter, overlaid) */}
                  <div 
                    className={cn("absolute top-0 h-2.5 rounded-full transition-all", pacingStatus.actualColor)}
                    style={{ width: `${Math.min(totalBudgetPct, 100)}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">
              <p className="text-muted-foreground">{budgetTooltip}</p>
            </TooltipContent>
          </Tooltip>

          {/* Platform Breakdown Collapsible */}
          {platformPacing.length > 0 && (
            <Collapsible open={platformsOpen} onOpenChange={setPlatformsOpen} className="mb-3">
              <CollapsibleTrigger className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-2">
                <span className="font-medium">By Platform ({platformPacing.length})</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", platformsOpen && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                {platformPacing.map((platform) => {
                  const status = getPlatformPacingStatus(platform.pacingDiff);
                  const platformDurationTooltip = `${format(new Date(platform.startDate), "MMM d")} - ${format(new Date(platform.endDate), "MMM d, yyyy")} (${platform.totalDays} days)\n\n${platform.elapsedDays} days (${platform.timePct.toFixed(0)}%) out of ${platform.totalDays} days spent`;
                  const platformBudgetTooltip = `Spent: ${formatCurrency(platform.budgetSpent)} (${platform.budgetPct.toFixed(0)}%) out of ${formatCurrency(platform.budgetTotal)}\n\nExpected: ${platform.timePct.toFixed(0)}% | Actual: ${platform.budgetPct.toFixed(0)}%\nDifference: ${platform.pacingDiff > 0 ? "+" : ""}${platform.pacingDiff.toFixed(1)}%`;
                  
                  return (
                    <div key={platform.platform} className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1">
                          <span className="capitalize font-medium">{platform.platform}</span>
                          {platform.hasRecentImpressions && (
                            <Zap className="h-2.5 w-2.5 text-green-500" />
                          )}
                        </div>
                        <span className={cn(
                          "font-medium",
                          status.label === "On Track" && "text-green-600",
                          status.label === "Overpacing" && "text-red-600",
                          status.label === "Underpacing" && "text-amber-600"
                        )}>{status.label}</span>
                      </div>
                      
                      {/* Platform Duration */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <div className="text-[9px] text-muted-foreground mb-0.5">Duration</div>
                            <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={cn("absolute top-0 h-2 rounded-full", status.idealColor)}
                                style={{ width: `${Math.min(platform.timePct, 100)}%` }}
                              />
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">
                          <p className="text-muted-foreground">{platformDurationTooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                      
                      {/* Platform Budget */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <div className="text-[9px] text-muted-foreground mb-0.5">Budget</div>
                            <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={cn("absolute top-0 h-2 rounded-full", status.idealColor)}
                                style={{ width: `${Math.min(platform.timePct, 100)}%` }}
                              />
                              <div 
                                className={cn("absolute top-0 h-2 rounded-full", status.actualColor)}
                                style={{ width: `${Math.min(platform.budgetPct, 100)}%` }}
                              />
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">
                          <p className="text-muted-foreground">{platformBudgetTooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
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
