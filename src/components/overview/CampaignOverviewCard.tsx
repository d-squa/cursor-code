import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, TrendingDown, AlertTriangle, Check, 
  Clock, BarChart3, MessageSquare, Zap, FileText, Target, DollarSign, StickyNote
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
  pushed_to_dsp: { label: "Pushed to DSP", variant: "outline" },
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

  const pacingStatus = useMemo(() => {
    const absDiff = Math.abs(totalPacingDiff);
    if (absDiff <= 5) return { status: "on-track", icon: Check, color: "text-green-500", label: "On Track" };
    if (totalPacingDiff > 5) return { status: "overspending", icon: TrendingUp, color: "text-destructive", label: "Overpacing" };
    return { status: "underspending", icon: TrendingDown, color: "text-amber-500", label: "Underpacing" };
  }, [totalPacingDiff]);

  const PacingIcon = pacingStatus.icon;

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return `${value.toFixed(0)}`;
  };

  const getPlatformPacingStatus = (pacingDiff: number) => {
    const absDiff = Math.abs(pacingDiff);
    if (absDiff <= 5) return { color: "text-green-500", bgColor: "bg-green-500", label: "Good" };
    if (pacingDiff > 5) return { color: "text-destructive", bgColor: "bg-destructive", label: "Overpacing" };
    return { color: "text-amber-500", bgColor: "bg-amber-500", label: "Underpacing" };
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold truncate">{campaign.name}</CardTitle>
            {isSampleData && (
              <Badge variant="outline" className="mt-1 text-[10px]">Sample Data</Badge>
            )}
          </div>
          <Badge variant={statusConfig[campaign.status]?.variant || "outline"}>
            {statusConfig[campaign.status]?.label || campaign.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ActiPlan Duration */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>ActiPlan Duration</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(campaign.start_date), "MMM d")} - {format(new Date(campaign.end_date), "MMM d, yyyy")} ({totalDays} days)
          </p>
          <p className="text-xs">
            <span className="font-medium">{elapsedDays} days ({totalTimePct.toFixed(1)}%)</span>
            <span className="text-muted-foreground"> out of {totalDays} days spent</span>
          </p>
        </div>

        {/* ActiPlan Budget */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>ActiPlan Budget</span>
            </div>
            <div className="flex items-center gap-1.5">
              <PacingIcon className={cn("h-4 w-4", pacingStatus.color)} />
              <span className={cn("text-xs font-medium", pacingStatus.color)}>
                {pacingStatus.label}
              </span>
            </div>
          </div>
          <p className="text-xs">
            <span className="font-medium">Spent: ${formatCurrency(totalBudgetSpent)} ({totalBudgetPct.toFixed(0)}%)</span>
            <span className="text-muted-foreground"> out of ${formatCurrency(campaign.total_budget)}</span>
          </p>
          {Math.abs(totalPacingDiff) > 5 && (
            <div className="flex items-center gap-1.5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-amber-600">
                {totalPacingDiff > 0 ? "Overpacing" : "Underpacing"} by {Math.abs(totalPacingDiff).toFixed(1)}%
              </span>
            </div>
          )}
          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="absolute top-0 h-2 bg-muted-foreground/30 rounded-full"
              style={{ width: `${Math.min(totalTimePct, 100)}%` }}
            />
            <div 
              className={cn(
                "absolute top-0 h-2 rounded-full transition-all",
                Math.abs(totalPacingDiff) <= 5 ? "bg-green-500" : totalPacingDiff > 5 ? "bg-destructive" : "bg-amber-500"
              )}
              style={{ width: `${Math.min(totalBudgetPct, 100)}%` }}
            />
          </div>
        </div>

        {/* Platform Breakdown */}
        {platformPacing.length > 0 && (
          <div className="space-y-3 pt-2 border-t">
            <span className="text-sm font-medium">By Platform</span>
            <div className="space-y-4">
              {platformPacing.map((platform) => {
                const status = getPlatformPacingStatus(platform.pacingDiff);
                return (
                  <div key={platform.platform} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">{platform.platform}</span>
                      <div className="flex items-center gap-1.5">
                        {platform.hasRecentImpressions ? (
                          <span title="Active in last hour"><Zap className="h-3.5 w-3.5 text-green-500" /></span>
                        ) : (
                          <span title="No recent impressions"><Clock className="h-3.5 w-3.5 text-muted-foreground" /></span>
                        )}
                        <span className={cn("text-xs font-medium", status.color)}>{status.label}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(platform.startDate), "MMM d")} - {format(new Date(platform.endDate), "MMM d, yyyy")} ({platform.totalDays} days)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {platform.elapsedDays} days ({platform.timePct.toFixed(0)}%) out of {platform.totalDays} days spent
                    </p>
                    <p className="text-xs">
                      <span className="font-medium">Spent: ${formatCurrency(platform.budgetSpent)} ({platform.budgetPct.toFixed(0)}%)</span>
                      <span className="text-muted-foreground"> out of ${formatCurrency(platform.budgetTotal)}</span>
                    </p>
                    {Math.abs(platform.pacingDiff) > 5 && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                        <span className="text-amber-600">
                          {platform.pacingDiff > 0 ? "+" : ""}{platform.pacingDiff.toFixed(1)}% vs expected
                        </span>
                      </div>
                    )}
                    <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="absolute top-0 h-1.5 bg-muted-foreground/30 rounded-full"
                        style={{ width: `${Math.min(platform.timePct, 100)}%` }}
                      />
                      <div 
                        className={cn("absolute top-0 h-1.5 rounded-full", status.bgColor)}
                        style={{ width: `${Math.min(platform.budgetPct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats Row - Requests & Completed */}
        <div className="pt-2 border-t space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{modificationRequests.total} requests</span>
              {modificationRequests.pending > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {modificationRequests.pending} pending
                </Badge>
              )}
            </div>
          </div>
          
          {/* Completed by category */}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {completedByCategory.optimization > 0 && (
              <div className="flex items-center gap-1">
                <Target className="h-3 w-3 text-green-500" />
                <span>{completedByCategory.optimization} optimization done</span>
              </div>
            )}
            {completedByCategory.budget > 0 && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-green-500" />
                <span>{completedByCategory.budget} budget done</span>
              </div>
            )}
            {completedByCategory.notesLast7Days > 0 && (
              <div className="flex items-center gap-1">
                <StickyNote className="h-3 w-3 text-blue-500" />
                <span>{completedByCategory.notesLast7Days} notes (7d)</span>
              </div>
            )}
          </div>

          {/* Analysis status */}
          <div className="flex items-center gap-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
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
          onClick={() => !isSampleData && navigate(`/actiplans/${campaign.id}/report`)}
          disabled={isSampleData}
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          Check Performance
        </Button>
      </CardContent>
    </Card>
  );
}