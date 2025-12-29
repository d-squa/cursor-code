import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiplanLimits } from "@/hooks/useActiplanLimits";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { TIER_DISPLAY_NAMES, SubscriptionTier } from "@/config/subscriptionTiers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Clock,
  Rocket,
  Play,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Lock,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";

interface LaunchStatusEntry {
  id: string;
  campaign_id: string;
  platform: string;
  market: string;
  phase_name: string | null;
  entity_type: string;
  entity_name: string | null;
  dsp_entity_id: string | null;
  status: string;
  error_message: string | null;
  error_details: any;
  planned_budget: number | null;
  planned_impressions: number | null;
  planned_reach: number | null;
  planned_clicks: number | null;
  planned_conversions: number | null;
  dsp_status: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_budget: number;
  start_date: string;
  end_date: string;
}

type StatusType =
  | "pending_validation"
  | "validation_error"
  | "ready_for_push"
  | "pushing"
  | "pushed_to_dsp"
  | "partially_pushed"
  | "push_failed"
  | "live"
  | "paused";

const STATUS_CONFIG: Record<StatusType, { label: string; color: string; icon: React.ReactNode }> = {
  pending_validation: {
    label: "Pending Validation",
    color: "bg-muted text-muted-foreground",
    icon: <Clock className="h-4 w-4" />,
  },
  validation_error: {
    label: "Validation Error",
    color: "bg-destructive/10 text-destructive",
    icon: <XCircle className="h-4 w-4" />,
  },
  ready_for_push: {
    label: "Ready for Push",
    color: "bg-primary/10 text-primary",
    icon: <Rocket className="h-4 w-4" />,
  },
  pushing: {
    label: "Pushing...",
    color: "bg-warning/10 text-warning",
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
  },
  pushed_to_dsp: {
    label: "Pushed to DSP",
    color: "bg-blue-500/10 text-blue-600",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  partially_pushed: {
    label: "Partially Pushed",
    color: "bg-amber-500/10 text-amber-600",
    icon: <AlertCircle className="h-4 w-4" />,
  },
  push_failed: {
    label: "Push Failed",
    color: "bg-destructive/10 text-destructive",
    icon: <XCircle className="h-4 w-4" />,
  },
  live: { label: "Live", color: "bg-green-500/10 text-green-600", icon: <Play className="h-4 w-4" /> },
  paused: { label: "Paused", color: "bg-muted text-muted-foreground", icon: <Clock className="h-4 w-4" /> },
};

export default function LaunchStatus() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { dailyLimit, remaining, canCreate, refetch: refetchLimits } = useActiplanLimits();
  const { tier } = useFeatureAccess();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [statuses, setStatuses] = useState<LaunchStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());

  const getNextTierName = (): string => {
    const tierOrder: SubscriptionTier[] = ["trial", "basic", "freelancer", "enterprise", "agency"];
    const currentIndex = tierOrder.indexOf(tier);
    if (currentIndex < tierOrder.length - 1) {
      return TIER_DISPLAY_NAMES[tierOrder[currentIndex + 1]];
    }
    return TIER_DISPLAY_NAMES.agency;
  };

  const loadData = useCallback(async () => {
    if (!campaignId || !user) return;

    try {
      const [{ data: campaignData }, { data: statusData }] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", campaignId).single(),
        supabase
          .from("campaign_launch_status")
          .select("*")
          .eq("campaign_id", campaignId)
          .order("platform", { ascending: true }),
      ]);

      if (campaignData) setCampaign(campaignData);
      if (statusData) {
        setStatuses(statusData);
        // Auto-expand all platforms
        const platforms = new Set(statusData.map((s: LaunchStatusEntry) => s.platform));
        setExpandedPlatforms(platforms);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load launch status");
    } finally {
      setLoading(false);
    }
  }, [campaignId, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleValidate = async () => {
    if (!campaignId) return;

    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-campaign-launch", {
        body: { campaignId },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });

      if (error) throw error;

      if (data.valid) {
        toast.success("Validation passed! Ready to push to DSP.");
      } else {
        toast.error(`Validation failed: ${data.errors.length} error(s) found`);
      }

      await loadData();
    } catch (error: any) {
      console.error("Validation error:", error);

      const ctx = (error as any)?.context as Response | undefined;
      if (ctx) {
        let details = "";
        try {
          details = JSON.stringify(await ctx.clone().json());
        } catch {
          try {
            details = await ctx.clone().text();
          } catch {
            // ignore
          }
        }
        toast.error(`Validation failed (${ctx.status})`, {
          description: details || error.message,
        });
      } else {
        toast.error("Validation failed: " + error.message);
      }
    } finally {
      setValidating(false);
    }
  };

  const handlePush = async () => {
    if (!campaignId) return;

    // First validate
    setValidating(true);
    try {
      const { data: validationResult, error: validationError } = await supabase.functions.invoke(
        "validate-campaign-launch",
        {
          body: { campaignId },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        },
      );

      if (validationError) throw validationError;

      if (!validationResult.valid) {
        toast.error(`Cannot push: ${validationResult.errors.length} validation error(s)`);
        await loadData();
        setValidating(false);
        return;
      }

      setValidating(false);
      setPushing(true);

      // Update ONLY non-pushed statuses to "pushing" (skip already pushed_to_dsp entities)
      await supabase
        .from("campaign_launch_status")
        .update({ status: "pushing" })
        .eq("campaign_id", campaignId)
        .in("status", ["ready_for_push", "push_failed", "validation_error"]);

      await loadData();

      // Push to DSP
      const { data, error } = await supabase.functions.invoke("push-campaign-to-dsp", {
        body: { campaignId },
      });

      if (error) {
        // Supabase functions can return a generic message for non-2xx responses.
        // Try to extract the real JSON body + HTTP status from error.context.
        let errorMessage = error.message;
        let isRateLimitError = false;

        const ctx = (error as any)?.context as Response | undefined;
        const httpStatus = ctx?.status;

        let payload: any = null;
        if (ctx) {
          try {
            payload = await ctx.clone().json();
          } catch {
            try {
              payload = await ctx.clone().text();
            } catch {
              // ignore
            }
          }
        }

        let isBudgetValidationError = false;
        let budgetErrors: any[] = [];

        if (payload && typeof payload === "object") {
          errorMessage = payload.error || payload.message || errorMessage;

          if (payload.code === "DAILY_LIMIT_REACHED") {
            isRateLimitError = true;
          }

          // Check for budget validation errors
          if (payload.code === "BUDGET_VALIDATION_FAILED" && payload.validationErrors) {
            isBudgetValidationError = true;
            budgetErrors = payload.validationErrors;
          }
        }

        // Also detect by HTTP status / message keywords
        if (
          httpStatus === 429 ||
          errorMessage.includes("Daily DSP push limit reached") ||
          errorMessage.toLowerCase().includes("limit reached")
        ) {
          isRateLimitError = true;
        }

        // Detect budget errors from message content
        if (
          errorMessage.includes("minimum budget") ||
          errorMessage.includes("Budget validation failed") ||
          errorMessage.includes("below minimum")
        ) {
          isBudgetValidationError = true;
        }

        if (isRateLimitError) {
          const nextTier = getNextTierName();
          toast.error("Daily limit reached", {
            duration: 15000,
            description: `You've used all ${dailyLimit} DSP push${dailyLimit > 1 ? "es" : ""} for today. Upgrade to ${nextTier} to push more campaigns.`,
            action: {
              label: "Upgrade Now",
              onClick: () => navigate("/settings/plans"),
            },
          });

          // Revert pushing statuses to ready_for_push (not an API/push failure)
          await supabase
            .from("campaign_launch_status")
            .update({ status: "ready_for_push" })
            .eq("campaign_id", campaignId)
            .eq("status", "pushing");

          await loadData();
          await refetchLimits();
          return;
        }

        // Handle budget validation errors with clear messaging
        if (isBudgetValidationError) {
          const budgetErrorDetails =
            budgetErrors.length > 0
              ? budgetErrors
                  .map(
                    (e: any) =>
                      `${e.platform} ${e.market}/${e.phase}: €${e.currentBudget?.toFixed(2) || "0"} (min: €${e.minimumRequired?.toFixed(2) || "?"})`,
                  )
                  .join("\n")
              : "One or more campaigns have budgets below platform minimums.";

          toast.error("Budget Too Low", {
            duration: 15000,
            description: `${budgetErrorDetails}\n\nIncrease the budget or reduce campaign duration to meet platform requirements.`,
          });

          // Revert pushing statuses to validation_error
          await supabase
            .from("campaign_launch_status")
            .update({
              status: "validation_error",
              error_message: "Budget below platform minimum",
              error_details:
                budgetErrors.length > 0 ? budgetErrors : [{ message: errorMessage, type: "budget_validation" }],
            })
            .eq("campaign_id", campaignId)
            .eq("status", "pushing");

          await loadData();
          return;
        }

        throw new Error(errorMessage);
      }

      // Check if the response indicates failure
      if (!data?.success && data?.error) {
        // Check if error is rate limit related
        if (data.error.includes("Daily DSP push limit reached") || data.error.includes("limit reached")) {
          const nextTier = getNextTierName();
          toast.error(`Daily limit reached`, {
            duration: 15000,
            description: `You've used all ${dailyLimit} DSP push${dailyLimit > 1 ? "es" : ""} for today. Upgrade to ${nextTier} to push more campaigns.`,
            action: {
              label: "Upgrade Now",
              onClick: () => navigate("/settings/plans"),
            },
          });

          // Revert pushing statuses
          await supabase
            .from("campaign_launch_status")
            .update({ status: "ready_for_push" })
            .eq("campaign_id", campaignId)
            .eq("status", "pushing");

          await loadData();
          return;
        }
        throw new Error(data.error);
      }

      // The edge function now updates statuses and campaign status
      if (data?.hasErrors) {
        // Show detailed error info from results
        const errorCount = data.results?.filter((r: any) => r.error || r.errors?.length > 0).length || 0;
        toast.warning(`Campaign pushed with ${errorCount} error(s). Check status for details.`);
      } else {
        toast.success("Campaign pushed to DSP successfully!");
      }

      // Send notification email to all stakeholders
      try {
        const finalStatus = data?.finalStatus || (data?.hasErrors ? "partially_pushed" : "pushed_to_dsp");
        await supabase.functions.invoke("send-dsp-push-notification", {
          body: {
            campaignId,
            campaignName: campaign?.name || "Campaign",
            finalStatus,
            results: data?.results || [],
          },
        });
        console.log("DSP push notification sent");
      } catch (notifError) {
        console.error("Failed to send DSP push notification:", notifError);
        // Don't block the flow - notification is best-effort
      }

      // Refresh data to show updated statuses
      await loadData();
      // Refetch the limits since we just pushed
      await refetchLimits();
    } catch (error: any) {
      console.error("Push error:", error);

      // Show detailed error toast
      const errorMsg = error.message || "Unknown error occurred";
      toast.error(`Push failed: ${errorMsg}`, {
        duration: 10000, // Keep visible longer
        description: "Check the error details below for more information",
      });

      // Update ALL pushing statuses to push_failed with detailed error message
      const { error: updateError } = await supabase
        .from("campaign_launch_status")
        .update({
          status: "push_failed",
          error_message: errorMsg,
          error_details: [{ message: errorMsg, type: "api_error", fieldPath: "step1" }],
          updated_at: new Date().toISOString(),
        })
        .eq("campaign_id", campaignId)
        .eq("status", "pushing");

      if (updateError) {
        console.error("Failed to update statuses:", updateError);
      }

      await loadData();
    } finally {
      setValidating(false);
      setPushing(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!campaignId) return;

    setCheckingStatus(true);
    try {
      // Check status ONLY - do NOT call validate which resets statuses
      const { data, error } = await supabase.functions.invoke("check-campaign-dsp-status", {
        body: { campaignId },
      });

      if (error) throw error;

      if (data.allLive) {
        toast.success("All campaigns are now live!");
      } else {
        toast.info(`Status checked: ${data.results?.length || 0} entities updated`);
      }

      await loadData();
    } catch (error: any) {
      console.error("Status check error:", error);
      toast.error("Failed to check status: " + error.message);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleFixIssue = (fieldPath?: string) => {
    if (!campaignId) return;

    // Navigate to the appropriate step/page based on fieldPath
    if (fieldPath === "connections") {
      navigate("/settings/platforms");
    } else if (fieldPath === "step1") {
      navigate(`/actiplans?edit=${campaignId}&step=1`);
    } else if (fieldPath === "step2") {
      navigate(`/actiplans?edit=${campaignId}&step=2`);
    } else if (fieldPath === "step3") {
      navigate(`/actiplans?edit=${campaignId}&step=3`);
    } else {
      navigate(`/actiplans?edit=${campaignId}`);
    }
  };

  const togglePlatform = (platform: string) => {
    const newExpanded = new Set(expandedPlatforms);
    if (newExpanded.has(platform)) {
      newExpanded.delete(platform);
    } else {
      newExpanded.add(platform);
    }
    setExpandedPlatforms(newExpanded);
  };

  // Group statuses by platform, then by market
  const groupedStatuses = statuses.reduce(
    (acc, status) => {
      if (!acc[status.platform]) {
        acc[status.platform] = {};
      }
      if (!acc[status.platform][status.market]) {
        acc[status.platform][status.market] = [];
      }
      acc[status.platform][status.market].push(status);
      return acc;
    },
    {} as Record<string, Record<string, LaunchStatusEntry[]>>,
  );

  // Calculate overall progress
  const totalEntities = statuses.length;
  const pushedEntities = statuses.filter((s) => ["pushed_to_dsp", "live"].includes(s.status)).length;
  const liveEntities = statuses.filter((s) => s.status === "live").length;
  const errorEntities = statuses.filter((s) => ["validation_error", "push_failed"].includes(s.status)).length;
  const progressPercent = totalEntities > 0 ? (pushedEntities / totalEntities) * 100 : 0;

  // Determine if we can push - allow push if there are any ready_for_push, push_failed, or validation_error entities
  const pendingEntities = statuses.filter((s) =>
    ["ready_for_push", "push_failed", "validation_error"].includes(s.status),
  );
  const canPush = pendingEntities.length > 0 && !pushing && !validating;

  // Check if this is a retry (some already pushed)
  const isRetry = pushedEntities > 0 && pendingEntities.length > 0;

  const hasErrors = errorEntities > 0;
  const allLive = totalEntities > 0 && liveEntities === totalEntities;
  const allPushed = totalEntities > 0 && pushedEntities === totalEntities;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Campaign not found</p>
        <Button variant="outline" onClick={() => navigate("/actiplans")} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to ActiPlans
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/actiplans")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(campaign.start_date), "MMM dd")} - {format(new Date(campaign.end_date), "MMM dd, yyyy")}
            {" · "}€{campaign.total_budget.toLocaleString()}
          </p>
        </div>
        <Badge variant={allLive ? "default" : hasErrors ? "destructive" : "secondary"}>
          {allLive ? "All Live" : hasErrors ? "Has Errors" : campaign.status}
        </Badge>
      </div>

      {/* Progress Card */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium">Launch Progress</p>
              <p className="text-2xl font-bold">
                {pushedEntities} / {totalEntities} entities pushed
              </p>
              {dailyLimit !== Infinity && (
                <p className="text-xs text-muted-foreground mt-1">
                  {remaining}/{dailyLimit} DSP pushes remaining today
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleValidate} disabled={validating || pushing}>
                {validating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <AlertTriangle className="h-4 w-4 mr-2" />
                )}
                Validate
              </Button>
              <Button variant="outline" onClick={handleCheckStatus} disabled={checkingStatus || pushedEntities === 0}>
                {checkingStatus ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Check Status
              </Button>
              {canCreate ? (
                <Button onClick={handlePush} disabled={!canPush || allPushed}>
                  {pushing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
                  {isRetry ? `Retry Failed (${pendingEntities.length})` : "Push to DSP"}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => navigate("/settings/plans")} className="border-dashed">
                  <Lock className="h-4 w-4 mr-2" />
                  Limit Reached - Upgrade to {getNextTierName()}
                </Button>
              )}
            </div>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="flex gap-4 mt-3 text-sm">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {liveEntities} Live
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              {pushedEntities - liveEntities} Pushed
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-destructive" />
              {errorEntities} Errors
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-muted-foreground" />
              {totalEntities - pushedEntities - errorEntities} Pending
            </span>
          </div>
        </CardContent>
      </Card>

      {/* No data yet - show validate button */}
      {statuses.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No validation data yet</p>
            <p className="text-muted-foreground mb-4">Click Validate to check your campaign configuration</p>
            <Button onClick={handleValidate} disabled={validating}>
              {validating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <AlertTriangle className="h-4 w-4 mr-2" />
              )}
              Validate Campaign
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Status by Platform */}
      {Object.entries(groupedStatuses).map(([platform, markets]) => (
        <Collapsible
          key={platform}
          open={expandedPlatforms.has(platform)}
          onOpenChange={() => togglePlatform(platform)}
        >
          <Card className="mb-4">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {expandedPlatforms.has(platform) ? (
                      <ChevronDown className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                    <CardTitle className="text-lg">{platform}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const platformStatuses = Object.values(markets).flat();
                      const platformErrors = platformStatuses.filter((s) =>
                        ["validation_error", "push_failed"].includes(s.status),
                      ).length;
                      const platformLive = platformStatuses.filter((s) => s.status === "live").length;
                      const platformPushed = platformStatuses.filter((s) => s.status === "pushed_to_dsp").length;

                      if (platformErrors > 0) {
                        return <Badge variant="destructive">{platformErrors} Error(s)</Badge>;
                      }
                      if (platformLive === platformStatuses.length) {
                        return <Badge className="bg-green-500">All Live</Badge>;
                      }
                      if (platformPushed + platformLive > 0) {
                        return <Badge variant="secondary">{platformPushed + platformLive} Pushed</Badge>;
                      }
                      return <Badge variant="outline">Pending</Badge>;
                    })()}
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {Object.entries(markets).map(([market, entries], marketIdx) => (
                  <div key={market}>
                    {marketIdx > 0 && <Separator className="my-4" />}
                    <div className="mb-3">
                      <h4 className="font-medium text-sm text-muted-foreground">{market}</h4>
                    </div>
                    <div className="space-y-2">
                      {entries.map((entry) => {
                        const statusConfig =
                          STATUS_CONFIG[entry.status as StatusType] || STATUS_CONFIG.pending_validation;
                        const errorDetails: any[] = Array.isArray(entry.error_details) ? entry.error_details : [];
                        const hasErrors = entry.status === "validation_error" || entry.status === "push_failed";

                        return (
                          <div key={entry.id} className="rounded-lg bg-muted/30 overflow-hidden">
                            <div className="flex items-center justify-between p-3">
                              <div className="flex items-center gap-3 flex-1">
                                <div className={`p-1.5 rounded-full ${statusConfig.color}`}>{statusConfig.icon}</div>
                                <div className="flex-1">
                                  <p className="font-medium text-sm">
                                    {entry.phase_name || "Campaign"}
                                    <span className="text-muted-foreground font-normal"> · {entry.entity_type}</span>
                                  </p>
                                  {entry.dsp_entity_id && (
                                    <p className="text-xs text-muted-foreground">DSP ID: {entry.dsp_entity_id}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                {entry.planned_budget && entry.planned_budget > 0 && (
                                  <div className="text-right">
                                    <p className="text-xs text-muted-foreground">Budget</p>
                                    <p className="text-sm font-medium">€{entry.planned_budget.toLocaleString()}</p>
                                  </div>
                                )}
                                {entry.planned_reach && entry.planned_reach > 0 && (
                                  <div className="text-right">
                                    <p className="text-xs text-muted-foreground">Est. Reach</p>
                                    <p className="text-sm font-medium">{(entry.planned_reach / 1000).toFixed(1)}K</p>
                                  </div>
                                )}
                                <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
                              </div>
                            </div>

                            {/* Error Details Section */}
                            {hasErrors && (
                              <div className="border-t border-border/50 bg-destructive/5 p-3">
                                {errorDetails.length > 0 ? (
                                  <div className="space-y-2">
                                    {errorDetails.map((error, idx) => (
                                      <div key={idx} className="flex items-start justify-between gap-2">
                                        <div className="flex items-start gap-2 flex-1">
                                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                                          <div>
                                            <p className="text-sm text-destructive">
                                              {error.message || "Configuration error"}
                                            </p>
                                            {error.field && (
                                              <p className="text-xs text-muted-foreground">Field: {error.field}</p>
                                            )}
                                          </div>
                                        </div>
                                        {error.fieldPath && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs shrink-0"
                                            onClick={() => handleFixIssue(error.fieldPath)}
                                          >
                                            <ExternalLink className="h-3 w-3 mr-1" />
                                            Fix Issue
                                          </Button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : entry.error_message ? (
                                  (() => {
                                    const isGenericNon2xx = entry.error_message.toLowerCase().includes("non-2xx");
                                    const showLimitUpsell =
                                      isGenericNon2xx && Number.isFinite(dailyLimit) && remaining <= 0;

                                    if (showLimitUpsell) {
                                      const nextTier = getNextTierName();
                                      return (
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex items-start gap-2 flex-1">
                                            <Lock className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                                            <p className="text-sm text-destructive">
                                              Daily DSP push limit reached. Upgrade to {nextTier} to push more campaigns
                                              today.
                                            </p>
                                          </div>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs shrink-0"
                                            onClick={() => navigate("/settings/plans")}
                                          >
                                            Upgrade Now
                                          </Button>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-start gap-2 flex-1">
                                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                                          <p className="text-sm text-destructive">{entry.error_message}</p>
                                        </div>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs shrink-0"
                                          onClick={() => handleFixIssue("step1")}
                                        >
                                          <ExternalLink className="h-3 w-3 mr-1" />
                                          Fix Issue
                                        </Button>
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2 flex-1">
                                      <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                                      <p className="text-sm text-destructive">
                                        Validation error - check campaign configuration
                                      </p>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs shrink-0"
                                      onClick={() => handleFixIssue("step1")}
                                    >
                                      <ExternalLink className="h-3 w-3 mr-1" />
                                      Fix Issue
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}
