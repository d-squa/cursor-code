import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, TrendingDown, AlertTriangle, Check, 
  Clock, BarChart3, MessageSquare, Zap 
} from "lucide-react";
import { format, differenceInDays, differenceInHours } from "date-fns";
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
  modificationRequests: {
    total: number;
    pending: number;
  };
  hasRecentAnalysis: boolean;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  live: { label: "Live", variant: "default" },
  ended: { label: "Ended", variant: "secondary" },
  pushed_to_dsp: { label: "Pushed to DSP", variant: "outline" },
};

export function CampaignOverviewCard({
  campaign,
  platformPacing,
  totalBudgetSpent,
  totalTimePct,
  totalBudgetPct,
  totalPacingDiff,
  modificationRequests,
  hasRecentAnalysis,
}: CampaignOverviewCardProps) {
  const navigate = useNavigate();

  const pacingStatus = useMemo(() => {
    const absDiff = Math.abs(totalPacingDiff);
    if (absDiff <= 5) return { status: "on-track", icon: Check, color: "text-green-500" };
    if (totalPacingDiff > 5) return { status: "overspending", icon: TrendingUp, color: "text-destructive" };
    return { status: "underspending", icon: TrendingDown, color: "text-amber-500" };
  }, [totalPacingDiff]);

  const PacingIcon = pacingStatus.icon;

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold truncate">{campaign.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span>{format(new Date(campaign.start_date), "MMM d")} - {format(new Date(campaign.end_date), "MMM d, yyyy")}</span>
            </div>
          </div>
          <Badge variant={statusConfig[campaign.status]?.variant || "outline"}>
            {statusConfig[campaign.status]?.label || campaign.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Overall Budget Pacing */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Budget Pacing</span>
            <div className="flex items-center gap-1.5">
              <PacingIcon className={cn("h-4 w-4", pacingStatus.color)} />
              <span className={cn("font-medium", pacingStatus.color)}>
                {totalPacingDiff > 0 ? "+" : ""}{totalPacingDiff.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Time: {totalTimePct.toFixed(0)}%</span>
              <span>Budget: {totalBudgetPct.toFixed(0)}% ({formatCurrency(totalBudgetSpent)} / {formatCurrency(campaign.total_budget)})</span>
            </div>
            <div className="relative h-2 bg-muted rounded-full overflow-hidden">
              <Progress value={totalTimePct} className="h-2 bg-muted-foreground/30" />
              <div 
                className={cn(
                  "absolute top-0 h-2 rounded-full transition-all",
                  totalPacingDiff > 5 ? "bg-destructive" : totalPacingDiff < -5 ? "bg-amber-500" : "bg-primary"
                )}
                style={{ width: `${Math.min(totalBudgetPct, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Platform Breakdown */}
        <div className="space-y-2">
          <span className="text-sm font-medium">By Platform</span>
          <div className="space-y-2">
            {platformPacing.map((platform) => {
              const isPacingOff = Math.abs(platform.pacingDiff) > 5;
              return (
                <div key={platform.platform} className="flex items-center gap-2 text-xs">
                  <span className="w-16 font-medium capitalize">{platform.platform}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full",
                        platform.pacingDiff > 5 ? "bg-destructive" : platform.pacingDiff < -5 ? "bg-amber-500" : "bg-primary"
                      )}
                      style={{ width: `${Math.min(platform.budgetPct, 100)}%` }}
                    />
                  </div>
                  <span className={cn(
                    "w-12 text-right",
                    isPacingOff && (platform.pacingDiff > 5 ? "text-destructive" : "text-amber-500")
                  )}>
                    {platform.pacingDiff > 0 ? "+" : ""}{platform.pacingDiff.toFixed(0)}%
                  </span>
                  <div className="w-5 flex justify-center" title={platform.hasRecentImpressions ? "Active in last hour" : "No recent impressions"}>
                    {platform.hasRecentImpressions ? (
                      <Zap className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  {isPacingOff && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{modificationRequests.total} requests</span>
            {modificationRequests.pending > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {modificationRequests.pending} pending
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            {hasRecentAnalysis ? (
              <span className="text-green-600">Analyzed this week</span>
            ) : (
              <span className="text-muted-foreground">No recent analysis</span>
            )}
          </div>
        </div>

        {/* Action Button */}
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full mt-2"
          onClick={() => navigate(`/actiplans/${campaign.id}/report`)}
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          Check Performance
        </Button>
      </CardContent>
    </Card>
  );
}
