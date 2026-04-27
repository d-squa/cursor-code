import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { DspConfigChangesView } from "@/components/launch/DspConfigChangesView";
import { useDspConfigSync } from "@/hooks/useDspConfigSync";
import { useQCTracking } from "@/hooks/useQCTracking";
import { useQCChecklist } from "@/hooks/useQCChecklist";
import { logCampaignActivity, logCampaignHistoryEntry } from "@/utils/campaignHistory";
import { downloadActiplanShell } from "@/utils/actiplanShellExport";
import { Download } from "lucide-react";
import { PushConfirmationDialog } from "@/components/creative/PushConfirmationDialog";
import { QCCheckSection } from "@/components/launch/QCCheckSection";

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
  updated_at?: string;
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
  const { user, getAccessToken } = useAuth();
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
  
  // Confirmation dialog state
  const [showCreativePushConfirm, setShowCreativePushConfirm] = useState(false);
  const [showCampaignPushConfirm, setShowCampaignPushConfirm] = useState(false);
  const [pushPageInfos, setPushPageInfos] = useState<
    Array<{
      pageId: string;
      pageName: string;
      platform: 'meta' | 'tiktok';
      adAccountId?: string;
      adAccountName?: string;
    }>
  >([]);
  const [campaignPushAccounts, setCampaignPushAccounts] = useState<
    Array<{ platform: 'meta' | 'tiktok' | 'google'; accountId: string; accountName?: string; entityCount?: number }>
  >([]);
  // Tracks the (market|phaseName) currently being pushed via push-pmax-asset-groups
  // so the per-PMax-campaign button can show a spinner.
  const [pushingPmaxKey, setPushingPmaxKey] = useState<string | null>(null);
  const [qcSectionOpen, setQcSectionOpen] = useState<boolean>(true);

  // Use the new real-time progress hook
  const {
    adSetStatuses: liveAdSetStatuses,
    creativeAssignments: liveCreativeAssignments,
    loading: progressLoading,
    refresh: refreshProgress,
  } = useLaunchProgress({ campaignId, enabled: !!campaignId && !!user });

  // DSP config sync - auto-syncs on mount for pushed campaigns
  const hasPushedEntities = statuses.some(s => ['pushed_to_dsp', 'live', 'partially_pushed'].includes(s.status));
  const {
    changes: dspChanges,
    unacknowledgedCount: dspUnacknowledgedCount,
    syncing: dspSyncing,
    lastSyncedAt: dspLastSyncedAt,
    syncFromDsp,
    acknowledgeChange,
    acknowledgeAll,
  } = useDspConfigSync({
    campaignId,
    enabled: !!campaignId && !!user && hasPushedEntities,
    autoSyncOnMount: hasPushedEntities,
  });

  // QC Tracking
  const { items: qcItems, transitions: qcTransitions, loading: qcLoading, summary: qcSummary, initializeTracking, updateState: updateQCState } = useQCTracking({
    campaignId,
    enabled: !!campaignId && !!user && hasPushedEntities,
  });

  // QC Checklist
  const {
    getChecklist,
    getCompletions,
    getCompletionCount,
    isAllChecked,
    toggleItem: toggleChecklistItem,
    toggleAll: toggleAllChecklist,
    loading: checklistLoading,
  } = useQCChecklist({
    campaignId,
    enabled: !!campaignId && !!user && hasPushedEntities,
  });

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
    const accessToken = getAccessToken();

    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-campaign-launch", {
        body: { campaignId },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (error) throw error;

      if (data.valid) {
        toast.success("Validation passed! Ready to push to DSP.");
      } else {
        const errors = data.errors || [];
        const errorMessages = errors
          .map((e: any) => {
            const parts: string[] = [];
            if (e.platform) parts.push(e.platform);
            if (e.market) parts.push(e.market);
            if (e.phase) parts.push(e.phase);
            const location = parts.length > 0 ? `[${parts.join(" · ")}] ` : "";
            return `${location}${e.message || "Unknown error"}`;
          })
          .slice(0, 5);
        
        toast.error(`Validation failed: ${errors.length} error(s) found`, {
          description: errorMessages.join("\n"),
          duration: 10000,
        });
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
    const accessToken = getAccessToken();

    // First validate
    setValidating(true);
    try {
      const { data: validationResult, error: validationError } = await supabase.functions.invoke(
        "validate-campaign-launch",
        {
          body: { campaignId },
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        },
      );

      if (validationError) throw validationError;

      if (!validationResult.valid) {
        const errors = validationResult.errors || [];
        const errorMessages = errors
          .map((e: any) => {
            const parts: string[] = [];
            if (e.platform) parts.push(e.platform);
            if (e.market) parts.push(e.market);
            if (e.phase) parts.push(e.phase);
            const location = parts.length > 0 ? `[${parts.join(" · ")}] ` : "";
            return `${location}${e.message || "Unknown error"}`;
          })
          .slice(0, 5);
        
        toast.error(`Cannot push: ${errors.length} validation error(s)`, {
          description: errorMessages.join("\n"),
          duration: 10000,
        });
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
        body: { campaignId, skipCreatives: true },
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
              onClick: () => navigate("/app/settings/plans"),
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
              onClick: () => navigate("/app/settings/plans"),
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
      const finalStatus = data?.finalStatus || (data?.hasErrors ? "partially_pushed" : "pushed_to_dsp");
      await Promise.all([
        logCampaignHistoryEntry({
          campaignId,
          userId: user?.id,
          action: finalStatus,
          changeType: "launch",
          description: `Campaign shell push completed with status ${finalStatus}`,
        }),
        logCampaignActivity({
          campaignId,
          userId: user?.id,
          actionType: "campaign_shell_push",
          title: "Campaign pushed to DSP",
          description: `Campaign shell push completed with status ${finalStatus}`,
          metadata: {
            finalStatus,
            resultCount: data?.results?.length || 0,
            hasErrors: Boolean(data?.hasErrors),
          },
        }),
      ]);

      await loadData();
      await initializeTracking();
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

  // Get page info for confirmation dialog
  const getPageInfoForPush = useCallback(async () => {
    if (!campaignId) return [];
    
    try {
      // Fetch campaign market_splits to extract pages/identities
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select('market_splits')
        .eq('id', campaignId)
        .single();
      
      if (!campaignData?.market_splits) return [];
      
      const marketSplits = campaignData.market_splits as Record<string, any>;

      const isUuid = (v: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

      // One entry per destination page/identity + destination ad account.
      const metaTargets = new Map<string, { pageRef: string; adAccountId?: string; adAccountName?: string }>();
      const tiktokTargets = new Map<string, { identityId: string; identityName?: string; advertiserId?: string }>();

      for (const [platformKey, markets] of Object.entries(marketSplits)) {
        if (!Array.isArray(markets)) continue;

        const pk = platformKey.toLowerCase();
        const isMeta = pk.includes('meta') || pk.includes('facebook') || pk.includes('instagram');
        const isTikTok = pk.includes('tiktok');

        for (const market of markets as any[]) {
          if (isMeta) {
            const pageRef = market?.pageId ?? market?.page ?? market?.metaPageId;
            const adAccountId = market?.adAccountId ?? market?.ad_account_id;
            const adAccountName = market?.accountName ?? market?.adAccountName;

            if (pageRef && !metaTargets.has(String(pageRef))) {
              metaTargets.set(String(pageRef), {
                pageRef: String(pageRef),
                adAccountId: adAccountId ? String(adAccountId) : undefined,
                adAccountName: adAccountName ? String(adAccountName) : undefined,
              });
            }

            // Also check phases for page IDs
            const phases = Array.isArray(market?.phases) ? market.phases : [];
            for (const phase of phases) {
              const phasePageRef = phase?.pageId ?? phase?.page ?? phase?.metaPageId;
              if (phasePageRef && !metaTargets.has(String(phasePageRef))) {
                metaTargets.set(String(phasePageRef), {
                  pageRef: String(phasePageRef),
                  adAccountId: adAccountId ? String(adAccountId) : undefined,
                  adAccountName: adAccountName ? String(adAccountName) : undefined,
                });
              }
            }
          }

          if (isTikTok) {
            const identityId = market?.tiktokIdentityId ?? market?.tiktokIdentity;
            const advertiserId = market?.tiktokAdvertiserId ?? market?.adAccountId ?? market?.advertiser_id;

            if (identityId && !tiktokTargets.has(String(identityId))) {
              tiktokTargets.set(String(identityId), {
                identityId: String(identityId),
                identityName: market?.tiktokIdentityName ? String(market.tiktokIdentityName) : undefined,
                advertiserId: advertiserId ? String(advertiserId) : undefined,
              });
            }

            // Also check phases for identities
            const phases = Array.isArray(market?.phases) ? market.phases : [];
            for (const phase of phases) {
              const phaseIdentity = phase?.tiktokIdentityId ?? phase?.tiktokIdentity;
              if (phaseIdentity && !tiktokTargets.has(String(phaseIdentity))) {
                tiktokTargets.set(String(phaseIdentity), {
                  identityId: String(phaseIdentity),
                  identityName: phase?.tiktokIdentityName
                    ? String(phase.tiktokIdentityName)
                    : market?.tiktokIdentityName
                      ? String(market.tiktokIdentityName)
                      : undefined,
                  advertiserId: advertiserId ? String(advertiserId) : undefined,
                });
              }
            }
          }
        }
      }

      // Resolve Meta page names (supports either storing meta_pages.page_id or meta_pages.id)
      const metaKeys = Array.from(metaTargets.keys());
      const metaDbIds = metaKeys.filter(isUuid);
      const metaExternalIds = metaKeys.filter((v) => !isUuid(v));

      const metaPageMap = new Map<string, { pageId: string; pageName: string }>();

      if (metaDbIds.length > 0) {
        const { data: metaPagesById } = await supabase
          .from('meta_pages')
          .select('id, page_id, page_name')
          .in('id', metaDbIds);

        (metaPagesById || []).forEach((p: any) => {
          if (p?.id) metaPageMap.set(String(p.id), { pageId: String(p.page_id), pageName: String(p.page_name) });
          if (p?.page_id) metaPageMap.set(String(p.page_id), { pageId: String(p.page_id), pageName: String(p.page_name) });
        });
      }

      if (metaExternalIds.length > 0) {
        const { data: metaPagesByExternal } = await supabase
          .from('meta_pages')
          .select('id, page_id, page_name')
          .in('page_id', metaExternalIds);

        (metaPagesByExternal || []).forEach((p: any) => {
          if (p?.id) metaPageMap.set(String(p.id), { pageId: String(p.page_id), pageName: String(p.page_name) });
          if (p?.page_id) metaPageMap.set(String(p.page_id), { pageId: String(p.page_id), pageName: String(p.page_name) });
        });
      }

      // Resolve Meta ad account names
      const metaAdAccountNameMap = new Map<string, string>();
      const rawMetaAdAccountIds = Array.from(
        new Set(Array.from(metaTargets.values()).map((t) => t.adAccountId).filter(Boolean) as string[])
      );

      if (rawMetaAdAccountIds.length > 0) {
        const normalized = Array.from(new Set(rawMetaAdAccountIds.map((id) => id.replace(/^act_/, ''))));
        const orFilter = normalized
          .flatMap((id) => [`account_id.eq.${id}`, `account_id.eq.act_${id}`])
          .join(',');

        if (orFilter) {
          const { data: metaAccounts } = await supabase
            .from('meta_ad_accounts')
            .select('account_id, account_name')
            .or(orFilter);

          (metaAccounts || []).forEach((a: any) => {
            if (!a?.account_id) return;
            metaAdAccountNameMap.set(String(a.account_id), String(a.account_name));
            metaAdAccountNameMap.set(String(a.account_id).replace(/^act_/, ''), String(a.account_name));
          });
        }
      }

      // Resolve TikTok advertiser names
      const tiktokAdvertiserNameMap = new Map<string, string>();
      const tiktokAdvertiserIds = Array.from(
        new Set(Array.from(tiktokTargets.values()).map((t) => t.advertiserId).filter(Boolean) as string[])
      );

      if (tiktokAdvertiserIds.length > 0) {
        const { data: tiktokAccounts } = await supabase
          .from('tiktok_ad_accounts')
          .select('advertiser_id, account_name')
          .in('advertiser_id', tiktokAdvertiserIds);

        (tiktokAccounts || []).forEach((a: any) => {
          if (a?.advertiser_id) tiktokAdvertiserNameMap.set(String(a.advertiser_id), String(a.account_name));
        });
      }

      const pages: Array<{
        pageId: string;
        pageName: string;
        platform: 'meta' | 'tiktok';
        adAccountId?: string;
        adAccountName?: string;
      }> = [];

      metaTargets.forEach((t, key) => {
        const resolved = metaPageMap.get(key);
        const pageId = resolved?.pageId || t.pageRef;
        const pageName = resolved?.pageName || t.pageRef;

        const adAccountId = t.adAccountId;
        const adAccountName =
          t.adAccountName ||
          (adAccountId
            ? metaAdAccountNameMap.get(adAccountId) || metaAdAccountNameMap.get(adAccountId.replace(/^act_/, ''))
            : undefined);

        pages.push({
          pageId,
          pageName,
          platform: 'meta',
          adAccountId,
          adAccountName,
        });
      });

      tiktokTargets.forEach((t) => {
        pages.push({
          pageId: t.identityId,
          pageName: t.identityName || t.identityId,
          platform: 'tiktok',
          adAccountId: t.advertiserId,
          adAccountName: t.advertiserId ? tiktokAdvertiserNameMap.get(t.advertiserId) : undefined,
        });
      });

      return pages;
    } catch (err) {
      console.error('Error extracting page info:', err);
      return [];
    }
  }, [campaignId]);

  // Show confirmation before pushing creatives
  const handlePushCreativesClick = async () => {
    const pages = await getPageInfoForPush();
    
    // Filter to only platforms that have actual creative assignments
    const platformsWithCreatives = new Set(
      liveCreativeAssignments.map((a) => a.platform?.toLowerCase()).filter(Boolean)
    );
    const filteredPages = pages.filter((p) => platformsWithCreatives.has(p.platform));
    
    setPushPageInfos(filteredPages);
    setShowCreativePushConfirm(true);
  };

  // Actual push creatives function
  const handlePushCreatives = async () => {
    if (!campaignId) return;
    const accessToken = getAccessToken();
    setShowCreativePushConfirm(false);

    setPushingCreatives(true);
    try {
      const { data, error } = await supabase.functions.invoke("push-creatives-to-dsp", {
        body: { campaignId },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (error) throw error;
      
      // Handle partial results (timeout but some creatives pushed)
      if (data?.partial) {
        toast.warning(data.message || "Partial results - run again to continue", {
          duration: 10000,
          description: `Pushed: ${data.pushedCount || 0}, Failed: ${data.failedCount || 0}. Some creatives may need another push.`,
        });
        await loadData();
        await initializeTracking();
        return;
      }
      
      // Handle complete failure
      if (data?.success === false && !data?.partial) {
        throw new Error(data?.error || "Failed to push creatives");
      }

      // Handle success with failures
      if (data?.failedCount > 0) {
        toast.warning(`Creatives push completed with ${data.failedCount} failure(s)`, {
          duration: 8000,
          description: `Pushed: ${data.pushedCount || 0}, Failed: ${data.failedCount}. Check individual creative status for details.`,
        });
      } else {
        toast.success(`Creatives push completed! ${data?.pushedCount || 0} creative(s) pushed.`);
      }

      await Promise.all([
        logCampaignHistoryEntry({
          campaignId,
          userId: user?.id,
          action: "creatives_pushed_to_dsp",
          changeType: "launch",
          description: `Creative push completed. Pushed: ${data?.pushedCount || 0}, Failed: ${data?.failedCount || 0}`,
        }),
        logCampaignActivity({
          campaignId,
          userId: user?.id,
          actionType: "creative_push",
          title: "Creatives pushed to DSP",
          description: `Creative push completed. Pushed: ${data?.pushedCount || 0}, Failed: ${data?.failedCount || 0}`,
          metadata: {
            pushedCount: data?.pushedCount || 0,
            failedCount: data?.failedCount || 0,
            partial: Boolean(data?.partial),
          },
        }),
      ]);
      
      await loadData();
      await initializeTracking();
    } catch (error: any) {
      console.error("Push creatives error:", error);
      toast.error("Failed to push creatives: " + (error?.message || "Unknown error"));
    } finally {
      setPushingCreatives(false);
    }
  };

  // Show confirmation before pushing campaign shell
  const handlePushCampaignClick = async () => {
    type Plat = 'meta' | 'tiktok' | 'google';
    const accountsMap = new Map<
      string,
      { platform: Plat; accountId: string; accountName?: string; entityCount: number }
    >();

    try {
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select('market_splits')
        .eq('id', campaignId!)
        .single();

      const marketSplits = (campaignData?.market_splits || {}) as Record<string, any>;

      // Build (platform, market) -> { accountId, accountName }
      const marketAccount = new Map<string, { platform: Plat; accountId: string; accountName?: string }>();

      for (const [platformKey, markets] of Object.entries(marketSplits)) {
        if (!Array.isArray(markets)) continue;
        const pk = String(platformKey).toLowerCase();
        let platform: Plat | null = null;
        if (pk.includes('meta') || pk.includes('facebook') || pk.includes('instagram')) platform = 'meta';
        else if (pk.includes('tiktok')) platform = 'tiktok';
        else if (pk.includes('google')) platform = 'google';
        if (!platform) continue;

        for (const market of markets as any[]) {
          const marketName = market?.market || market?.name || market?.country;
          const accountId =
            market?.adAccountId ??
            market?.ad_account_id ??
            market?.tiktokAdvertiserId ??
            market?.tiktok_advertiser_id ??
            market?.advertiser_id ??
            market?.googleCustomerId ??
            market?.google_customer_id ??
            market?.customerId ??
            market?.customer_id;
          const accountName = market?.accountName ?? market?.adAccountName ?? market?.account_name;
          if (!marketName || !accountId) continue;

          marketAccount.set(`${platform}:${String(marketName).toLowerCase()}`, {
            platform,
            accountId: String(accountId),
            accountName: accountName ? String(accountName) : undefined,
          });
        }
      }

      // Count pending entities per (platform, market) account
      for (const e of pendingEntities) {
        const ep = String(e.platform || '').toLowerCase();
        let platform: Plat | null = null;
        if (ep.includes('meta') || ep.includes('facebook') || ep.includes('instagram')) platform = 'meta';
        else if (ep.includes('tiktok')) platform = 'tiktok';
        else if (ep.includes('google')) platform = 'google';
        if (!platform) continue;

        const key = `${platform}:${String(e.market || '').toLowerCase()}`;
        const acc = marketAccount.get(key);
        if (!acc) continue;

        const aggKey = `${platform}:${acc.accountId}`;
        const existing = accountsMap.get(aggKey);
        if (existing) {
          existing.entityCount += 1;
        } else {
          accountsMap.set(aggKey, { ...acc, entityCount: 1 });
        }
      }

      // Resolve missing account names (Meta + TikTok + Google) from connected_platforms
      const needNames = Array.from(accountsMap.values()).filter((a) => !a.accountName);
      if (needNames.length > 0) {
        const ids = Array.from(new Set(needNames.flatMap((a) => [a.accountId, a.accountId.replace(/^act_/, '')])));
        const { data: cps } = await supabase
          .from('connected_platforms')
          .select('platform_type, ad_account_id, ad_account_name')
          .in('ad_account_id', ids);
        const nameMap = new Map<string, string>();
        (cps || []).forEach((c: any) => {
          if (c?.ad_account_id && c?.ad_account_name) {
            nameMap.set(`${String(c.platform_type).toLowerCase()}:${c.ad_account_id}`, c.ad_account_name);
            nameMap.set(
              `${String(c.platform_type).toLowerCase()}:${String(c.ad_account_id).replace(/^act_/, '')}`,
              c.ad_account_name,
            );
          }
        });
        accountsMap.forEach((acc) => {
          if (!acc.accountName) {
            acc.accountName =
              nameMap.get(`${acc.platform}:${acc.accountId}`) ||
              nameMap.get(`${acc.platform}:${acc.accountId.replace(/^act_/, '')}`);
          }
        });
      }
    } catch (err) {
      console.error('Error building campaign push accounts:', err);
    }

    setCampaignPushAccounts(Array.from(accountsMap.values()));
    setShowCampaignPushConfirm(true);
  };

  // Modified handlePush to be used after confirmation
  const handleConfirmedCampaignPush = async () => {
    setShowCampaignPushConfirm(false);
    await handlePush();
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

  const handleDeleteCreativeAssignment = async (assignmentId: string) => {
    try {
      // Delete the creative assignment from the database
      const { error } = await supabase
        .from("creative_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;

      toast.success("Creative assignment removed");
      
      // Refresh the progress data
      refreshProgress();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error("Failed to delete: " + error.message);
      throw error;
    }
  };

  // Triggers the new push-pmax-asset-groups edge function for a single
  // PMax campaign (scoped to market+phaseName). Used both as the manual
  // /status fallback button and the auto-trigger from TextAssetsStep.
  const handlePushPmaxAssetGroups = async (
    market: string,
    phaseName: string,
    opts: { silent?: boolean; chainDepth?: number } = {},
  ) => {
    if (!campaignId) return;
    const key = `${market}|${phaseName}`;
    const chainDepth = opts.chainDepth ?? 0;
    // Hard ceiling so a misbehaving response can never loop forever.
    const MAX_CHAIN = 25;
    setPushingPmaxKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("push-pmax-asset-groups", {
        body: { campaignId, market, phaseName, retryFailed: true },
      });
      if (error) throw error;
      const deferred = data?.deferred ?? 0;
      const pushed = data?.pushed ?? 0;
      const failed = data?.failed ?? 0;

      if (!opts.silent) {
        if (failed > 0) {
          toast.error(`${failed} asset group${failed === 1 ? '' : 's'} failed`, {
            description: pushed > 0 ? `${pushed} succeeded.` : undefined,
          });
        } else if (pushed > 0 && deferred === 0) {
          toast.success(`Pushed ${pushed} PMax asset group${pushed === 1 ? '' : 's'}`);
        } else if (pushed === 0 && deferred === 0) {
          toast.info(data?.message || "No asset groups awaiting push");
        }
      }

      refreshProgress();

      // Chain the next push automatically while there are still deferred groups
      // and we made forward progress on this iteration. This avoids relying on
      // the realtime effect to retrigger (which caused infinite loops when
      // status updates were briefly stale).
      if (deferred > 0 && pushed > 0 && failed === 0 && chainDepth < MAX_CHAIN) {
        // Keep the dedupe key marked so the auto-push effect does not also fire.
        autoPushedPmaxKeysRef.current.add(key);
        await handlePushPmaxAssetGroups(market, phaseName, {
          silent: true,
          chainDepth: chainDepth + 1,
        });
        return;
      }
    } catch (err: any) {
      console.error("push-pmax-asset-groups error:", err);
      toast.error("Failed to push asset groups: " + (err?.message || String(err)));
      // Allow manual retry on failure
      autoPushedPmaxKeysRef.current.delete(`${market}|${phaseName}`);
    } finally {
      setPushingPmaxKey(null);
    }
  };

  // Auto-trigger PMax asset-group push as soon as a (market, phase) shell is
  // ready and has asset groups awaiting push. The user no longer needs to
  // click the "Push Asset Groups" button — the edge function itself defers
  // groups whose minimum requirements aren't met, so it's safe to fire as
  // soon as we see pushable entities. We dedupe per key to avoid loops.
  const autoPushedPmaxKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!campaignId || !user) return;
    if (!liveAdSetStatuses || liveAdSetStatuses.length === 0) return;

    // Group live statuses by (platform, market, phase) to mirror the tracker logic.
    const grouped: Record<string, typeof liveAdSetStatuses> = {};
    for (const s of liveAdSetStatuses) {
      const key = `${s.platform}||${s.market}||${s.phaseName}`;
      (grouped[key] ||= []).push(s);
    }

    for (const [key, entries] of Object.entries(grouped)) {
      const [platform, market, phase] = key.split("||");
      if (platform !== "Google Ads") continue;

      const campaignEntity = entries.find((e) => e.entityType === "campaign");
      const adSetEntities = entries.filter((e) => e.entityType === "adset");

      const isPmax =
        campaignEntity?.entityName?.toUpperCase().startsWith("PMAX") ||
        adSetEntities.some((a) =>
          ["awaiting_assets", "assets_incomplete"].includes(a.status),
        );
      if (!isPmax) continue;

      const shellReady =
        campaignEntity &&
        ["pushed", "pushed_to_dsp", "live"].includes(campaignEntity.status);
      const hasPushable = adSetEntities.some((a) =>
        ["awaiting_assets", "push_failed", "assets_incomplete"].includes(a.status),
      );
      if (!shellReady || !hasPushable) continue;

      const dedupeKey = `${market}|${phase}`;
      if (autoPushedPmaxKeysRef.current.has(dedupeKey)) continue;
      if (pushingPmaxKey === dedupeKey) continue;

      autoPushedPmaxKeysRef.current.add(dedupeKey);
      handlePushPmaxAssetGroups(market, phase);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveAdSetStatuses, campaignId, user, pushingPmaxKey]);

  const handleFixIssue = (fieldPath?: string) => {
    if (!campaignId) return;

    // Navigate to the appropriate step/page based on fieldPath
    if (fieldPath === "connections") {
      navigate("/app/settings/platforms");
    } else if (fieldPath === "step1") {
      navigate(`/app/actiplans?edit=${campaignId}&step=1`);
    } else if (fieldPath === "step2") {
      navigate(`/app/actiplans?edit=${campaignId}&step=2`);
    } else if (fieldPath === "step3") {
      navigate(`/app/actiplans?edit=${campaignId}&step=3`);
    } else {
      navigate(`/app/actiplans?edit=${campaignId}`);
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

      // Fetch PMax asset groups (shared asset pool model) for this campaign.
      // These power a dedicated sheet and let us suppress per-ad text rows for PMax ads.
      const { fetchPmaxAssetGroups } = await import("@/utils/pmaxAssetGroupRepo");
      const pmaxGroups = await fetchPmaxAssetGroups(campaignId);
      const pmaxKeys = new Set(
        pmaxGroups.map((g) => `${g.group.market}||${g.group.phase_name}||${g.group.ad_group_name}`)
      );

      // Resolve creative_id -> media URL/name for the PMax sheet.
      const allPmaxCreativeIds = Array.from(new Set(
        pmaxGroups.flatMap((g) => Object.values(g.creativesByBucket).flat())
      ));
      const creativeMediaMap = new Map<string, { name: string | null; url: string | null }>();
      if (allPmaxCreativeIds.length > 0) {
        const { data: cData } = await supabase
          .from("creatives")
          .select("id, name, media_urls, thumbnail_url")
          .in("id", allPmaxCreativeIds);
        for (const c of cData || []) {
          const url = (c.media_urls && c.media_urls[0]) || c.thumbnail_url || null;
          creativeMediaMap.set(c.id, { name: c.name, url });
        }
      }

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

      downloadActiplanShell(campaign, mappedAssignments, { pmaxGroups, pmaxKeys, creativeMediaMap });
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
    
    // Categorize by creative type
    const organic = liveCreativeAssignments.filter((c) => c.creativeType === "existing_post").length;
    const carousel = liveCreativeAssignments.filter((c) => c.creativeType === "carousel").length;
    const dark = total - organic; // All non-organic are considered dark ads
    
    return { total, pushed, pending, errors, pushing, organic, carousel, dark };
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
        <Button variant="outline" onClick={() => navigate("/app/actiplans")} className="mt-4">
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
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/actiplans")}>
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

      {/* Stale shell detection - campaign updated after last validation */}
      {(() => {
        const campaignUpdatedAt = campaign?.updated_at ? new Date(campaign.updated_at).getTime() : 0;
        const latestStatusCreatedAt = statuses.length > 0 
          ? Math.max(...statuses.map(s => new Date(s.created_at).getTime()))
          : 0;
        const isStale = campaignUpdatedAt > 0 && latestStatusCreatedAt > 0 && campaignUpdatedAt > latestStatusCreatedAt;
        const hasNoStatuses = statuses.length === 0 && !loading;
        
        if (isStale || hasNoStatuses) {
          return (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-sm">
                  {hasNoStatuses 
                    ? "Campaign shell hasn't been generated yet. Validate to build the campaign structure."
                    : "Campaign structure has been updated since the last validation. Re-validate to refresh the campaign shell."
                  }
                </span>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleValidate} disabled={validating}>
                {validating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                {hasNoStatuses ? "Validate" : "Re-validate"}
              </Button>
            </div>
          );
        }
        return null;
      })()}

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
                  <Button onClick={handlePushCampaignClick} disabled={!canPush || allPushed}>
                    {pushing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
                    {isRetry ? `Retry Failed (${pendingEntities.length})` : "Push to DSP"}
                  </Button>
                  {allAdSetsPushed && creativePushStats.total > 0 && (
                    <Button 
                      onClick={handlePushCreativesClick} 
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
                <Button variant="outline" onClick={() => navigate("/app/settings/plans")} className="border-dashed">
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

      {/* DSP Config Sync - collapsible, shows when campaign has been pushed */}
      {hasPushedEntities && campaignId && (
        <div className="mb-6">
          <Collapsible defaultOpen={dspUnacknowledgedCount > 0}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 text-sm font-medium">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                <span>Live Sync</span>
                {dspUnacknowledgedCount > 0 && (
                  <Badge variant="destructive" className="text-xs">{dspUnacknowledgedCount}</Badge>
                )}
              </div>
              <ChevronDown className="h-4 w-4 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2">
                <DspConfigChangesView
                  changes={dspChanges}
                  unacknowledgedCount={dspUnacknowledgedCount}
                  syncing={dspSyncing}
                  lastSyncedAt={dspLastSyncedAt}
                  onSync={syncFromDsp}
                  onAcknowledge={acknowledgeChange}
                  onAcknowledgeAll={acknowledgeAll}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
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
            onDeleteCreativeAssignment={handleDeleteCreativeAssignment}
            onPushPmaxAssetGroups={handlePushPmaxAssetGroups}
            pushingPmaxKey={pushingPmaxKey}
            qcNavItems={qcItems.map((it) => ({
              platform: it.platform,
              market: it.market,
              phase_name: it.phase_name,
            }))}
            onNavigateQC={() => {
              setQcSectionOpen(true);
              requestAnimationFrame(() => {
                document
                  .getElementById("nav-section-qc")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }}
          />
        </div>
      )}

      {/* Quality Check Section - collapsible, at the bottom */}
      {hasPushedEntities && campaignId && (
        <Collapsible open={qcSectionOpen} onOpenChange={setQcSectionOpen}>
          <Card id="nav-section-qc" className="scroll-mt-24 transition-all">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      Quality Check
                      {qcSummary.total > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {qcSummary.delivering + qcSummary.pushedLive}/{qcSummary.total} progressed
                        </Badge>
                      )}
                    </CardTitle>
                    {qcSummary.total > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {qcSummary.delivering + qcSummary.pushedLive}/{qcSummary.total} progressed
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {qcSectionOpen ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <QCCheckSection
                  items={qcItems}
                  loading={qcLoading || checklistLoading}
                  campaignId={campaignId}
                  summary={qcSummary}
                  getChecklist={getChecklist}
                  getCompletions={getCompletions}
                  getCompletionCount={getCompletionCount}
                  isAllChecked={isAllChecked}
                  onToggleItem={toggleChecklistItem}
                  onToggleAll={toggleAllChecklist}
                  onUpdateState={updateQCState}
                  onInitialize={initializeTracking}
                />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Confirmation Dialogs */}
      <PushConfirmationDialog
        open={showCreativePushConfirm}
        onOpenChange={setShowCreativePushConfirm}
        onConfirm={handlePushCreatives}
        type="ads"
        adCount={creativePushStats.pending}
        pages={pushPageInfos}
        adSummary={{
          total: creativePushStats.total,
          dark: creativePushStats.dark,
          organic: creativePushStats.organic,
          carousel: creativePushStats.carousel,
        }}
        isLoading={pushingCreatives}
      />
      
      <PushConfirmationDialog
        open={showCampaignPushConfirm}
        onOpenChange={setShowCampaignPushConfirm}
        onConfirm={handleConfirmedCampaignPush}
        type="campaign"
        campaignCount={pendingEntities.length}
        accounts={campaignPushAccounts}
        isLoading={pushing}
      />

    </div>
  );
}
