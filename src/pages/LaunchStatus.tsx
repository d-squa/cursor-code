import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiplanLimits } from "@/hooks/useActiplanLimits";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useLaunchProgress } from "@/hooks/useLaunchProgress";
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
  Image,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";

import { LaunchProgressTracker } from "@/components/launch/LaunchProgressTracker";
import { LaunchFiltersBar, type LaunchFilters } from "@/components/launch/LaunchFilters";
import { downloadActiplanShell } from "@/utils/actiplanShellExport";
import { Download } from "lucide-react";

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
  const [pushingCreatives, setPushingCreatives] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());
  
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [launchFilters, setLaunchFilters] = useState<LaunchFilters>({ platform: null, market: null, phase: null, parameterSearch: null });
  const [downloadingShell, setDownloadingShell] = useState(false);

  // Use the new real-time progress hook
  const {
    adSetStatuses: liveAdSetStatuses,
    creativeAssignments: liveCreativeAssignments,
    loading: progressLoading,
    refresh: refreshProgress,
  } = useLaunchProgress({ campaignId, enabled: !!campaignId && !!user });

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
      const { data: campaignData } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", campaignId)
        .single();

      if (campaignData) setCampaign(campaignData);

      // Fetch statuses for the legacy view (platform-grouped collapsibles)
      const { data: statusData } = await supabase
        .from("campaign_launch_status")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("platform", { ascending: true });

      if (statusData) {
        setStatuses(statusData);
        const platforms = new Set(statusData.map((s: LaunchStatusEntry) => s.platform));
        setExpandedPlatforms(platforms);
      }

      // Refresh the real-time progress data as well
      refreshProgress();
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load launch status");
    } finally {
      setLoading(false);
    }
  }, [campaignId, user, refreshProgress]);

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

  const handlePushCreatives = async () => {
    if (!campaignId) return;

    setPushingCreatives(true);
    try {
      const { data, error } = await supabase.functions.invoke("push-creatives-to-dsp", {
        body: { campaignId },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });

      if (error) throw error;
      if (data?.success === false) {
        throw new Error(data?.error || "Failed to push creatives");
      }

      toast.success("Creatives push completed");
      
      await loadData();
    } catch (error: any) {
      console.error("Push creatives error:", error);
      toast.error("Failed to push creatives: " + (error?.message || "Unknown error"));
    } finally {
      setPushingCreatives(false);
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

  const handleDownloadShell = async () => {
    if (!campaign || !campaignId) return;

    setDownloadingShell(true);
    try {
      // Fetch full creative assignment data with all text asset fields + creative fallback data
      const { data: assignmentData, error } = await supabase
        .from("creative_assignments")
        .select(`
          id,
          platform,
          market,
          phase_name,
          ad_set_name,
          ad_set_id,
          creative_id,
          status,
          dsp_creative_id,
          destination_url,
          headline,
          headline_2,
          headline_3,
          headline_4,
          headline_5,
          primary_text,
          primary_text_2,
          primary_text_3,
          primary_text_4,
          primary_text_5,
          description,
          description_2,
          description_3,
          description_4,
          description_5,
          call_to_action,
          url_parameters,
          display_name,
          brand_name,
          creative:creatives(
            name,
            media_type,
            media_urls,
            thumbnail_url,
            headline,
            headline_2,
            headline_3,
            headline_4,
            headline_5,
            primary_text,
            primary_text_2,
            primary_text_3,
            primary_text_4,
            primary_text_5,
            description,
            description_2,
            description_3,
            description_4,
            description_5,
            call_to_action,
            destination_url,
            url_parameters,
            brand_name
          )
        `)
        .eq("campaign_id", campaignId);

      if (error) throw error;

      // Map the data for the export - fallback to creative data when assignment fields are empty
      const mappedAssignments = (assignmentData || []).map((a: any) => ({
        id: a.id,
        platform: a.platform,
        market: a.market,
        phase_name: a.phase_name,
        ad_set_name: a.ad_set_name,
        ad_set_id: a.ad_set_id,
        creative_id: a.creative_id,
        status: a.status,
        dsp_creative_id: a.dsp_creative_id,
        destination_url: a.destination_url || a.creative?.destination_url,
        headline: a.headline || a.creative?.headline,
        headline_2: a.headline_2 || a.creative?.headline_2,
        headline_3: a.headline_3 || a.creative?.headline_3,
        headline_4: a.headline_4 || a.creative?.headline_4,
        headline_5: a.headline_5 || a.creative?.headline_5,
        primary_text: a.primary_text || a.creative?.primary_text,
        primary_text_2: a.primary_text_2 || a.creative?.primary_text_2,
        primary_text_3: a.primary_text_3 || a.creative?.primary_text_3,
        primary_text_4: a.primary_text_4 || a.creative?.primary_text_4,
        primary_text_5: a.primary_text_5 || a.creative?.primary_text_5,
        description: a.description || a.creative?.description,
        description_2: a.description_2 || a.creative?.description_2,
        description_3: a.description_3 || a.creative?.description_3,
        description_4: a.description_4 || a.creative?.description_4,
        description_5: a.description_5 || a.creative?.description_5,
        call_to_action: a.call_to_action || a.creative?.call_to_action,
        url_parameters: a.url_parameters || a.creative?.url_parameters,
        display_name: a.display_name,
        brand_name: a.brand_name || a.creative?.brand_name,
        creative: a.creative ? {
          name: a.creative.name,
          media_type: a.creative.media_type,
          media_urls: a.creative.media_urls,
          thumbnail_url: a.creative.thumbnail_url,
        } : undefined,
      }));

      downloadActiplanShell(campaign, mappedAssignments);
    } catch (error: any) {
      console.error("Download shell error:", error);
      toast.error("Failed to download shell: " + error.message);
    } finally {
      setDownloadingShell(false);
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

  // Calculate creative push stats from live data
  const creativePushStats = useMemo(() => {
    const total = liveCreativeAssignments.length;
    const pushed = liveCreativeAssignments.filter((c) => c.status === "pushed").length;
    const pushing = liveCreativeAssignments.filter((c) => c.status === "pushing").length;
    const errors = liveCreativeAssignments.filter((c) => c.status === "error").length;
    const pending = total - pushed;
    return { total, pushed, pending, errors, pushing };
  }, [liveCreativeAssignments]);

  // Determine if we can push - allow push if there are any ready_for_push, push_failed, or validation_error entities
  const pendingEntities = statuses.filter((s) =>
    ["ready_for_push", "push_failed", "validation_error"].includes(s.status),
  );
  const canPush = pendingEntities.length > 0 && !pushing && !validating;

  // Creatives push requires campaign/adsets to be pushed first
  const allAdSetsPushed = pushedEntities === totalEntities && totalEntities > 0;
  const canPushCreatives = allAdSetsPushed && creativePushStats.pending > 0 && !pushingCreatives && !pushing && !validating;

  // Auto-advance step when all ad sets are pushed
  useEffect(() => {
    if (allAdSetsPushed && creativePushStats.total > 0) {
      setCurrentStep(2);
    } else if (!allAdSetsPushed) {
      setCurrentStep(1);
    }
  }, [allAdSetsPushed, creativePushStats.total]);

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
                {pushedEntities} / {totalEntities} campaigns/ad sets
                {creativePushStats.total > 0 && (
                  <span className="text-lg font-normal text-muted-foreground ml-2">
                    · {creativePushStats.pushed} / {creativePushStats.total} ads
                  </span>
                )}
              </p>
              {dailyLimit !== Infinity && (
                <p className="text-xs text-muted-foreground mt-1">
                  {remaining}/{dailyLimit} DSP pushes remaining today
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleValidate} disabled={validating || pushing || allPushed} title="Validates campaigns, ad sets and creatives configuration">
                {validating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <AlertTriangle className="h-4 w-4 mr-2" />
                )}
                Validate All
              </Button>
              <Button variant="outline" onClick={handleCheckStatus} disabled={checkingStatus || pushedEntities === 0} title="Checks DSP status for all pushed entities including ads">
                {checkingStatus ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Check All Status
              </Button>

              {canCreate ? (
                <>
                  <Button onClick={handlePush} disabled={!canPush || allPushed}>
                    {pushing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
                    {isRetry ? `Retry Failed (${pendingEntities.length})` : "Push to DSP"}
                  </Button>
                  {allAdSetsPushed && creativePushStats.total > 0 && (
                    <Button 
                      onClick={handlePushCreatives} 
                      disabled={!canPushCreatives}
                      variant={creativePushStats.pushed === creativePushStats.total ? "outline" : "default"}
                    >
                      {pushingCreatives ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Image className="h-4 w-4 mr-2" />
                      )}
                      {creativePushStats.pushed === creativePushStats.total 
                        ? "All Ads Pushed" 
                        : `Push Ads (${creativePushStats.pending})`}
                    </Button>
                  )}
                </>
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
            {creativePushStats.total > 0 && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <span className="flex items-center gap-1">
                  <Image className="h-3 w-3 text-primary" />
                  {creativePushStats.pushed} / {creativePushStats.total} Ads
                </span>
                {creativePushStats.errors > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <XCircle className="h-3 w-3" />
                    {creativePushStats.errors} Ad Errors
                  </span>
                )}
              </>
            )}
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

      {/* Filters + Download */}
      {statuses.length > 0 && (
        <div className="mb-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <LaunchFiltersBar
              filters={launchFilters}
              onFiltersChange={setLaunchFilters}
              availableOptions={{
                platforms: [...new Set(statuses.map(s => s.platform))],
                markets: [...new Set(statuses.map(s => s.market))],
                phases: [...new Set(statuses.filter(s => s.phase_name).map(s => s.phase_name!))],
              }}
            />
            <Button variant="outline" onClick={handleDownloadShell} disabled={downloadingShell}>
              {downloadingShell ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download Shell
            </Button>
          </div>
        </div>
      )}

      {/* Unified Launch Progress Tracker - 2 Step Flow */}
      {statuses.length > 0 && campaignId && (
        <div className="mb-6">
          <LaunchProgressTracker
            campaignId={campaignId}
            adSetStatuses={liveAdSetStatuses}
            creativeAssignments={liveCreativeAssignments}
            isPushingCampaign={pushing}
            isPushingCreatives={pushingCreatives}
            currentStep={currentStep}
            filters={launchFilters}
          />
        </div>
      )}

    </div>
  );
}
