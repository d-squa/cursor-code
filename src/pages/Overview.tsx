import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiplanLimits } from "@/hooks/useActiplanLimits";
import { useWorkspace } from "@/hooks/useWorkspace";
import { TIER_DISPLAY_NAMES, SubscriptionTier } from "@/config/subscriptionTiers";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { Button } from "@/components/ui/button";
import {
  Target,
  Zap,
  LogOut,
  Settings,
  Bug,
  RefreshCw,
  Plus,
  Rocket,
  LayoutDashboard,
  Lock,
  ClipboardList,
} from "lucide-react";
import { BugReportDialog } from "@/components/BugReportDialog";
import { CampaignOverviewCard, PlatformPerformance } from "@/components/overview/CampaignOverviewCard";
import { BlurredPlaceholderCard } from "@/components/overview/BlurredPlaceholderCard";
import { OverviewFiltersBar, OverviewFilters } from "@/components/overview/OverviewFilters";
import { PerformanceMetric, getPerformanceStatus } from "@/components/overview/PerformanceBar";
import { Loader2 } from "lucide-react";
import { differenceInDays, differenceInHours, startOfWeek, isAfter, subDays } from "date-fns";
import { TourDataBanner } from "@/components/TourDataBanner";
import { useSampleMode } from "@/contexts/SampleModeContext";

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_budget: number;
  start_date: string;
  end_date: string;
  updated_at: string;
  platforms?: any;
  forecast_data?: any;
  bo_number?: string;
  is_sample?: boolean;
}

interface CampaignInsight {
  campaign_id: string;
  platform: string;
  metrics: any;
  fetched_at: string;
}

interface ModificationRequest {
  campaign_id: string;
  status: string;
  change_type: string;
  updated_at: string;
}

interface SavedAnalysis {
  campaign_id: string;
  created_at: string;
}

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

// Curated demo overlay for the seeded tour ActiPlan (is_sample === true).
// Showcases the value of this card: time ~50% elapsed, overall overpacing,
// with one platform heavily overpacing, one on track, one underpacing.
// KPIs per platform also include underachieving / on track / overachieving.
interface DemoOverlay {
  platformPacing: PlatformPacing[];
  platformPerformance: PlatformPerformance[];
  totalBudgetSpent: number;
  totalTimePct: number;
  totalBudgetPct: number;
  totalPacingDiff: number;
  totalDays: number;
  elapsedDays: number;
  modificationRequests: { total: number; pending: number };
  completedByCategory: CompletedRequestsByCategory;
  hasRecentAnalysis: boolean;
  statsByDateRange: {
    lifetime: { changes: number; pending: number; optimized: number; notes: number };
    this_month: { changes: number; pending: number; optimized: number; notes: number };
    last_7_days: { changes: number; pending: number; optimized: number; notes: number };
  };
  platformStatsByDateRange: Record<
    string,
    {
      lifetime: { changes: number; pending: number; optimized: number; notes: number };
      this_month: { changes: number; pending: number; optimized: number; notes: number };
      last_7_days: { changes: number; pending: number; optimized: number; notes: number };
    }
  >;
  pacingStatus: "on-track" | "overpacing" | "underpacing";
  performanceStatus: ReturnType<typeof getPerformanceStatus> | null;
}

const buildDemoOverlay = (campaign: Campaign): DemoOverlay => {
  // Reference "now" sits roughly mid-flight of the campaign.
  const start = new Date(campaign.start_date);
  const end = new Date(campaign.end_date);
  const totalDays = Math.max(differenceInDays(end, start), 1);
  const elapsedDays = Math.round(totalDays * 0.5); // ~50% time elapsed
  const timePct = (elapsedDays / totalDays) * 100;

  const totalBudget = campaign.total_budget || 100000;

  // Per-platform scenarios (budget % of totalBudget, pacing behavior).
  const meta = {
    name: "meta",
    budgetTotal: totalBudget * 0.5,
    // heavy overpacing: spent ~75% of budget at ~50% time → +25pp
    budgetPct: timePct + 25,
  };
  const tiktok = {
    name: "tiktok",
    budgetTotal: totalBudget * 0.3,
    // on track: spent matches time
    budgetPct: timePct + 1,
  };
  const google = {
    name: "google",
    budgetTotal: totalBudget * 0.2,
    // slightly underpacing
    budgetPct: timePct - 9,
  };

  const platformPacing: PlatformPacing[] = [meta, tiktok, google].map((p) => {
    const budgetSpent = (p.budgetTotal * p.budgetPct) / 100;
    return {
      platform: p.name,
      budgetSpent,
      budgetTotal: p.budgetTotal,
      budgetPct: p.budgetPct,
      timePct,
      pacingDiff: p.budgetPct - timePct,
      hasRecentImpressions: true,
      lastImpressionAt: new Date().toISOString(),
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      totalDays,
      elapsedDays,
    };
  });

  const totalBudgetSpent = platformPacing.reduce((s, p) => s + p.budgetSpent, 0);
  const totalBudgetPct = (totalBudgetSpent / totalBudget) * 100;
  const totalPacingDiff = totalBudgetPct - timePct;

  // KPI targets per platform — under / on / over.
  // PerformanceBar status uses (actual / target) vs timePct. We pick actuals
  // relative to timePct to land in the desired band.
  const mkMetric = (
    label: string,
    kpi: string,
    targetValue: number,
    deltaPct: number, // delta from "on pace" (timePct), in percentage points
  ): PerformanceMetric => ({
    label,
    kpi,
    targetValue,
    actualValue: targetValue * Math.max(0, (timePct + deltaPct) / 100),
    timePct,
  });

  const platformPerformance: PlatformPerformance[] = [
    {
      platform: "meta",
      metrics: [
        mkMetric("Impressions", "Impressions", 8_000_000, +18), // overachieving
        mkMetric("Reach", "Reach", 3_500_000, +2), // on track
        mkMetric("Conversions", "Conversions", 12_000, -22), // underachieving
      ],
    },
    {
      platform: "tiktok",
      metrics: [
        mkMetric("Impressions", "Impressions", 5_000_000, +1), // on track
        mkMetric("Video Views", "Video Views", 2_000_000, +15), // overachieving
        mkMetric("Clicks", "Clicks", 60_000, -18), // underachieving
      ],
    },
    {
      platform: "google",
      metrics: [
        mkMetric("Impressions", "Impressions", 4_000_000, -20), // underachieving
        mkMetric("Clicks", "Clicks", 90_000, +1), // on track
        mkMetric("Conversions", "Conversions", 5_500, +14), // overachieving
      ],
    },
  ];

  // Activity stats — designed to read as an actively-managed campaign.
  const statsByDateRange = {
    lifetime: { changes: 14, pending: 2, optimized: 6, notes: 4 },
    this_month: { changes: 7, pending: 2, optimized: 3, notes: 2 },
    last_7_days: { changes: 3, pending: 1, optimized: 1, notes: 1 },
  };

  const platformStatsByDateRange: DemoOverlay["platformStatsByDateRange"] = {
    meta: {
      lifetime: { changes: 7, pending: 1, optimized: 3, notes: 2 },
      this_month: { changes: 4, pending: 1, optimized: 2, notes: 1 },
      last_7_days: { changes: 2, pending: 1, optimized: 1, notes: 0 },
    },
    tiktok: {
      lifetime: { changes: 4, pending: 0, optimized: 2, notes: 1 },
      this_month: { changes: 2, pending: 0, optimized: 1, notes: 1 },
      last_7_days: { changes: 1, pending: 0, optimized: 0, notes: 1 },
    },
    google: {
      lifetime: { changes: 3, pending: 1, optimized: 1, notes: 1 },
      this_month: { changes: 1, pending: 1, optimized: 0, notes: 0 },
      last_7_days: { changes: 0, pending: 0, optimized: 0, notes: 0 },
    },
  };

  const pacingStatus: "on-track" | "overpacing" | "underpacing" =
    Math.abs(totalPacingDiff) <= 5 ? "on-track" : totalPacingDiff > 5 ? "overpacing" : "underpacing";

  const performanceStatus = getPerformanceStatus(platformPerformance.flatMap((p) => p.metrics));

  return {
    platformPacing,
    platformPerformance,
    totalBudgetSpent,
    totalTimePct: timePct,
    totalBudgetPct,
    totalPacingDiff,
    totalDays,
    elapsedDays,
    modificationRequests: {
      total: statsByDateRange.lifetime.changes,
      pending: statsByDateRange.lifetime.pending,
    },
    completedByCategory: {
      optimization: statsByDateRange.lifetime.optimized,
      budget: 3,
      notesLast7Days: statsByDateRange.last_7_days.notes,
    },
    hasRecentAnalysis: true,
    statsByDateRange,
    platformStatsByDateRange,
    pacingStatus,
    performanceStatus,
  };
};


const Overview = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tier } = useFeatureAccess();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { isSampleMode } = useSampleMode();
  const { dailyLimit, remaining, usedToday, canCreate } = useActiplanLimits();
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [insights, setInsights] = useState<CampaignInsight[]>([]);
  const [modRequests, setModRequests] = useState<ModificationRequest[]>([]);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [filters, setFilters] = useState<OverviewFilters>({
    status: null,
    pacingStatus: null,
    platform: null,
    performanceStatus: null,
    boSearch: null,
    nameSearch: null,
    activityStatus: null,
  });

  const getNextTierName = (): string => {
    const tierOrder: SubscriptionTier[] = ["trial", "basic", "freelancer", "enterprise", "agency"];
    const currentIndex = tierOrder.indexOf(tier);
    if (currentIndex < tierOrder.length - 1) {
      return TIER_DISPLAY_NAMES[tierOrder[currentIndex + 1]];
    }
    return "Agency";
  };

  // Handle new=true query param - redirect to app for creating new ActiPlan
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      navigate("/app", { replace: true });
    }
  }, [searchParams, navigate]);
  const loadData = async () => {
    // Wait for user and workspace to be fully resolved before loading
    // workspaceLoading now includes the workspace resolution step, so we only need to check it
    if (!user || workspaceLoading) return;

    try {
      // Fetch campaigns with relevant statuses for the active workspace
      // Use team_id filter exclusively when a workspace is selected
      // RLS policies handle access control - we just need to filter to the right workspace
      let campaignData: Campaign[] | null = null;

      if (activeWorkspaceId) {
        const { data } = await supabase
          .from("campaigns")
          .select("*")
          .eq("team_id", activeWorkspaceId)
          .eq("is_sample", isSampleMode)
          .in("status", ["pushed_to_dsp", "partially_pushed", "live", "ended"])
          .order("updated_at", { ascending: false });
        campaignData = data;
      } else {
        const { data } = await supabase
          .from("campaigns")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_sample", isSampleMode)
          .in("status", ["pushed_to_dsp", "partially_pushed", "live", "ended"])
          .order("updated_at", { ascending: false });
        campaignData = data;
      }

      if (campaignData) {
        setCampaigns(campaignData);

        // Fetch insights for these campaigns
        const campaignIds = campaignData.map((c) => c.id);
        if (campaignIds.length > 0) {
          const [insightsResult, modRequestsResult, analysesResult] = await Promise.all([
            supabase
              .from("campaign_insights")
              .select("campaign_id, platform, metrics, fetched_at")
              .in("campaign_id", campaignIds),
            supabase
              .from("modification_requests")
              .select("campaign_id, status, change_type, updated_at")
              .in("campaign_id", campaignIds),
            supabase.from("saved_insights_analyses").select("campaign_id, created_at").in("campaign_id", campaignIds),
          ]);

          if (insightsResult.data) setInsights(insightsResult.data);
          if (modRequestsResult.data) setModRequests(modRequestsResult.data);
          if (analysesResult.data) setSavedAnalyses(analysesResult.data);
        }
      }
    } catch (error) {
      console.error("Error loading overview data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Reset state when workspace changes to prevent stale data
    setLoading(true);
    setCampaigns([]);
    setInsights([]);
    setModRequests([]);
    setSavedAnalyses([]);
    loadData();
  }, [user, activeWorkspaceId, workspaceLoading, isSampleMode]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Aggregate data (no more hardcoded sample card; the seeded tour ActiPlan
  // already comes from the database when sample mode is enabled).
  const displayData = useMemo(() => {
    return {
      campaigns,
      insights,
      modRequests,
      savedAnalyses,
    };
  }, [campaigns, insights, modRequests, savedAnalyses]);

  // Sort campaigns: live first, then partially_pushed, then pushed_to_dsp, then ended, then by most recent
  const sortedCampaigns = useMemo(() => {
    return [...displayData.campaigns].sort((a, b) => {
      const statusOrder: Record<string, number> = {
        live: 0,
        partially_pushed: 1,
        pushed_to_dsp: 2,
        ended: 3,
      };
      const aOrder = statusOrder[a.status] ?? 4;
      const bOrder = statusOrder[b.status] ?? 4;

      if (aOrder !== bOrder) return aOrder - bOrder;

      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [displayData.campaigns]);

  // Calculate pacing for each campaign
  const campaignPacingData = useMemo(() => {
    const realNow = new Date();

    return sortedCampaigns.map((campaign) => {
      const now = realNow;
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const sevenDaysAgo = subDays(now, 7);

      const startDate = new Date(campaign.start_date);
      const endDate = new Date(campaign.end_date);
      const totalDays = Math.max(differenceInDays(endDate, startDate), 1);
      const elapsedDays = Math.min(Math.max(differenceInDays(now, startDate), 0), totalDays);
      const timePct = (elapsedDays / totalDays) * 100;

      // Get insights for this campaign
      const campaignInsights = displayData.insights.filter((i) => i.campaign_id === campaign.id);

      // Calculate platform pacing
      const platformMap: Record<string, PlatformPacing> = {};
      let totalSpent = 0;

      // Get platform budgets and dates from campaign.platforms
      const platformConfig: Record<string, { budget: number; startDate?: string; endDate?: string }> = {};
      if (campaign.platforms && Array.isArray(campaign.platforms)) {
        campaign.platforms.forEach((p: any) => {
          if (p.enabled && p.name) {
            const pctAllocation = p.budgetPercentage || 0;
            platformConfig[p.name.toLowerCase()] = {
              budget: (campaign.total_budget * pctAllocation) / 100,
              startDate: p.startDate || campaign.start_date,
              endDate: p.endDate || campaign.end_date,
            };
          }
        });
      }

      campaignInsights.forEach((insight) => {
        const platform = insight.platform.toLowerCase();
        const spent = insight.metrics?.spend || 0;
        const fetchedAt = new Date(insight.fetched_at);
        const hoursSinceFetch = differenceInHours(now, fetchedAt);

        totalSpent += spent;

        if (!platformMap[platform]) {
          const config = platformConfig[platform] || { budget: campaign.total_budget / (campaignInsights.length || 1) };
          const budgetTotal = config.budget;
          const pStartDate = new Date(config.startDate || campaign.start_date);
          const pEndDate = new Date(config.endDate || campaign.end_date);
          const pTotalDays = Math.max(differenceInDays(pEndDate, pStartDate), 1);
          const pElapsedDays = Math.min(Math.max(differenceInDays(now, pStartDate), 0), pTotalDays);
          const pTimePct = (pElapsedDays / pTotalDays) * 100;
          const budgetPct = budgetTotal > 0 ? (spent / budgetTotal) * 100 : 0;
          const pacingDiff = budgetPct - pTimePct;

          platformMap[platform] = {
            platform,
            budgetSpent: spent,
            budgetTotal,
            budgetPct,
            timePct: pTimePct,
            pacingDiff,
            hasRecentImpressions: hoursSinceFetch <= 1 && (insight.metrics?.impressions || 0) > 0,
            lastImpressionAt: insight.fetched_at,
            startDate: config.startDate || campaign.start_date,
            endDate: config.endDate || campaign.end_date,
            totalDays: pTotalDays,
            elapsedDays: pElapsedDays,
          };
        } else {
          platformMap[platform].budgetSpent += spent;
          platformMap[platform].budgetPct =
            platformMap[platform].budgetTotal > 0
              ? (platformMap[platform].budgetSpent / platformMap[platform].budgetTotal) * 100
              : 0;
          platformMap[platform].pacingDiff = platformMap[platform].budgetPct - platformMap[platform].timePct;
        }
      });

      const platformPacing = Object.values(platformMap);
      const totalBudgetPct = campaign.total_budget > 0 ? (totalSpent / campaign.total_budget) * 100 : 0;
      const totalPacingDiff = totalBudgetPct - timePct;

      // Extract performance metrics from forecast_data and campaign_insights
      const platformPerformance: PlatformPerformance[] = [];
      const actiplanForecast = campaign.forecast_data?.actiplanForecast;

      if (actiplanForecast?.platforms) {
        actiplanForecast.platforms.forEach((pf: any) => {
          const platformName = (pf.platformName || pf.platformId || "").toLowerCase();
          const insight = campaignInsights.find((i) => i.platform.toLowerCase() === platformName);
          const pConfig = platformMap[platformName];
          const pTimePct = pConfig?.timePct || timePct;

          const metrics: PerformanceMetric[] = [];

          // Aggregate targets from all markets for this platform
          let totalTargetImpressions = 0;
          let totalTargetReach = 0;
          let totalTargetClicks = 0;
          let totalTargetConversions = 0;

          (pf.markets || []).forEach((market: any) => {
            totalTargetImpressions += market.impressions || 0;
            totalTargetReach += market.reach || 0;
            // Calculate results from phases based on optimization goals
            (market.phases || []).forEach((phase: any) => {
              if (phase.optimizationGoal === "LINK_CLICKS" || phase.optimizationGoal === "LANDING_PAGE_VIEWS") {
                totalTargetClicks += phase.result || 0;
              }
              if (phase.optimizationGoal === "CONVERSIONS" || phase.optimizationGoal === "OFFSITE_CONVERSIONS") {
                totalTargetConversions += phase.result || 0;
              }
            });
          });

          // Get actual metrics from insights
          const actualImpressions = insight?.metrics?.impressions || 0;
          const actualReach = insight?.metrics?.reach || 0;
          const actualClicks = insight?.metrics?.clicks || 0;
          const actualConversions = insight?.metrics?.conversion || insight?.metrics?.conversions || 0;

          // Add metrics that have targets
          if (totalTargetImpressions > 0) {
            metrics.push({
              label: "Impressions",
              kpi: "Impressions",
              targetValue: totalTargetImpressions,
              actualValue: actualImpressions,
              timePct: pTimePct,
            });
          }

          if (totalTargetReach > 0) {
            metrics.push({
              label: "Reach",
              kpi: "Reach",
              targetValue: totalTargetReach,
              actualValue: actualReach,
              timePct: pTimePct,
            });
          }

          if (totalTargetClicks > 0) {
            metrics.push({
              label: "Clicks",
              kpi: "Clicks",
              targetValue: totalTargetClicks,
              actualValue: actualClicks,
              timePct: pTimePct,
            });
          }

          if (totalTargetConversions > 0) {
            metrics.push({
              label: "Conversions",
              kpi: "Conversions",
              targetValue: totalTargetConversions,
              actualValue: actualConversions,
              timePct: pTimePct,
            });
          }

          if (metrics.length > 0) {
            platformPerformance.push({ platform: platformName, metrics });
          }
        });
      }

      // For sample campaign, add mock performance data
      if (campaign.id === "sample-campaign-1") {
        const metaTimePct = platformMap["meta"]?.timePct || timePct;
        const tiktokTimePct = platformMap["tiktok"]?.timePct || timePct;

        platformPerformance.push({
          platform: "meta",
          metrics: [
            {
              label: "Impressions",
              kpi: "Impressions",
              targetValue: 8000000,
              actualValue: 2500000,
              timePct: metaTimePct,
            },
            { label: "Reach", kpi: "Reach", targetValue: 3500000, actualValue: 1200000, timePct: metaTimePct },
          ],
        });
        platformPerformance.push({
          platform: "tiktok",
          metrics: [
            {
              label: "Impressions",
              kpi: "Impressions",
              targetValue: 5000000,
              actualValue: 1800000,
              timePct: tiktokTimePct,
            },
            { label: "Views", kpi: "Video Views", targetValue: 2000000, actualValue: 850000, timePct: tiktokTimePct },
          ],
        });
      }

      // Modification requests for this campaign
      const campaignModRequests = displayData.modRequests.filter((m) => m.campaign_id === campaign.id);
      const pendingRequests = campaignModRequests.filter((m) => m.status === "pending" || m.status === "sent").length;

      // Calculate stats by different date ranges
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const getStatsForDateRange = (requests: ModificationRequest[], rangeStart: Date | null) => {
        const filteredRequests = rangeStart
          ? requests.filter((m) => isAfter(new Date(m.updated_at), rangeStart))
          : requests;

        return {
          changes: filteredRequests.length,
          pending: filteredRequests.filter((m) => m.status === "pending" || m.status === "sent").length,
          optimized: filteredRequests.filter(
            (m) => m.status === "completed" && (m.change_type === "targeting" || m.change_type === "goals"),
          ).length,
          notes: filteredRequests.filter((m) => m.change_type === "note").length,
        };
      };

      const statsByDateRange = {
        lifetime: getStatsForDateRange(campaignModRequests, null),
        this_month: getStatsForDateRange(campaignModRequests, thisMonthStart),
        last_7_days: getStatsForDateRange(campaignModRequests, sevenDaysAgo),
      };

      // Platform-level stats by date range
      const platformStatsByDateRange: Record<string, typeof statsByDateRange> = {};
      platformPacing.forEach((p) => {
        // In a real scenario, mod requests would be tagged by platform
        // For now, simulate platform distribution
        const platformRequests = campaignModRequests.filter((_, idx) => {
          // Simple distribution: even indices for first platform, odd for second
          const platformIdx = platformPacing.findIndex((pp) => pp.platform === p.platform);
          return idx % platformPacing.length === platformIdx;
        });
        platformStatsByDateRange[p.platform] = {
          lifetime: getStatsForDateRange(platformRequests, null),
          this_month: getStatsForDateRange(platformRequests, thisMonthStart),
          last_7_days: getStatsForDateRange(platformRequests, sevenDaysAgo),
        };
      });

      // Completed requests by category (legacy, kept for backward compat)
      const completedByCategory: CompletedRequestsByCategory = {
        optimization: campaignModRequests.filter(
          (m) => m.status === "completed" && (m.change_type === "targeting" || m.change_type === "goals"),
        ).length,
        budget: campaignModRequests.filter((m) => m.status === "completed" && m.change_type === "budget").length,
        notesLast7Days: campaignModRequests.filter(
          (m) => m.change_type === "note" && isAfter(new Date(m.updated_at), sevenDaysAgo),
        ).length,
      };

      // Check for recent analysis this week
      const campaignAnalyses = displayData.savedAnalyses.filter((a) => a.campaign_id === campaign.id);
      const hasRecentAnalysis = campaignAnalyses.some((a) => isAfter(new Date(a.created_at), weekStart));

      // Calculate pacing status
      const pacingStatus =
        Math.abs(totalPacingDiff) <= 5 ? "on-track" : totalPacingDiff > 5 ? "overpacing" : "underpacing";

      // Calculate performance status
      const performanceStatus =
        platformPerformance.length > 0 ? getPerformanceStatus(platformPerformance.flatMap((p) => p.metrics)) : null;

      return {
        campaign,
        platformPacing,
        platformPerformance,
        totalBudgetSpent: totalSpent,
        totalTimePct: timePct,
        totalBudgetPct,
        totalPacingDiff,
        totalDays,
        elapsedDays,
        modificationRequests: {
          total: campaignModRequests.length,
          pending: pendingRequests,
        },
        completedByCategory,
        hasRecentAnalysis,
        statsByDateRange,
        platformStatsByDateRange,
        pacingStatus,
        performanceStatus,
      };
    });
  }, [sortedCampaigns, displayData]);

  // Get available platforms for filter
  const availablePlatforms = useMemo(() => {
    const platforms = new Set<string>();
    campaignPacingData.forEach((data) => {
      data.platformPacing.forEach((p) => platforms.add(p.platform));
    });
    return Array.from(platforms);
  }, [campaignPacingData]);

  // Get available BO numbers for filter
  const availableBoNumbers = useMemo(() => {
    const boNumbers = new Set<string>();
    campaignPacingData.forEach((data) => {
      if (data.campaign.bo_number) {
        boNumbers.add(data.campaign.bo_number);
      }
    });
    return Array.from(boNumbers).sort();
  }, [campaignPacingData]);

  // Get available campaign names for filter
  const availableNames = useMemo(() => {
    return campaignPacingData.map((data) => data.campaign.name).sort();
  }, [campaignPacingData]);

  // Apply filters
  const filteredCampaignData = useMemo(() => {
    return campaignPacingData.filter((data) => {
      // BO number filter
      if (filters.boSearch && data.campaign.bo_number !== filters.boSearch) {
        return false;
      }

      // Name filter
      if (filters.nameSearch && data.campaign.name !== filters.nameSearch) {
        return false;
      }

      // Status filter
      if (filters.status && data.campaign.status !== filters.status) {
        return false;
      }

      // Pacing status filter
      if (filters.pacingStatus && data.pacingStatus !== filters.pacingStatus) {
        return false;
      }

      // Platform filter - check if campaign has this platform
      if (filters.platform) {
        const hasPlatform = data.platformPacing.some(
          (p) => p.platform.toLowerCase() === filters.platform?.toLowerCase(),
        );
        if (!hasPlatform) return false;
      }

      // Performance status filter - now supports platform-specific format "platform:status"
      if (filters.performanceStatus) {
        const [filterPlatform, filterStatus] = filters.performanceStatus.includes(":")
          ? filters.performanceStatus.split(":")
          : [null, filters.performanceStatus];

        if (filterPlatform) {
          // Platform-specific performance filter
          const platformData = data.platformPerformance.find(
            (p) => p.platform.toLowerCase() === filterPlatform.toLowerCase(),
          );
          if (!platformData) return false;
          const platformStatus = getPerformanceStatus(platformData.metrics);
          if (platformStatus !== filterStatus) return false;
        } else {
          // Global performance filter (legacy)
          if (!data.performanceStatus) return false;
          if (data.performanceStatus !== filterStatus) return false;
        }
      }

      // Activity status filter
      if (filters.activityStatus) {
        const stats30d = data.statsByDateRange?.this_month || { changes: 0, optimized: 0, notes: 0 };
        const stats7d = data.statsByDateRange?.last_7_days || { changes: 0, optimized: 0, notes: 0 };

        switch (filters.activityStatus) {
          case "no_changes_30d":
            if (stats30d.changes > 0) return false;
            break;
          case "no_changes_7d":
            if (stats7d.changes > 0) return false;
            break;
          case "no_optimization_30d":
            if (stats30d.optimized > 0) return false;
            break;
          case "no_optimization_7d":
            if (stats7d.optimized > 0) return false;
            break;
          case "no_notes_30d":
            if (stats30d.notes > 0) return false;
            break;
          case "no_notes_7d":
            if (stats7d.notes > 0) return false;
            break;
        }
      }

      return true;
    });
  }, [campaignPacingData, filters]);

  const hasAnyCampaigns = campaigns.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      <TourDataBanner />
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="ActiPlan" className="h-10 w-auto" />
              <p className="text-xs text-muted-foreground hidden md:block">Cross-Platform Activation Manager</p>
            </div>
            <nav className="flex items-center gap-2">
              <button
                onClick={() => navigate("/overview")}
                className="px-4 py-2 text-sm font-medium text-primary border-b-2 border-primary transition-colors"
              >
                Overview
              </button>
              <button
                onClick={() => navigate("/actiplans")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                ActiPlans
              </button>
              <button
                onClick={() => navigate("/insights")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                Insights
              </button>
              <button
                onClick={() => navigate("/creatives")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                Creative Mesh
              </button>
              <button
                onClick={() => navigate("/tasks")}
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                My Tasks
              </button>

              <WorkspaceSwitcher className="hidden md:flex ml-2" />

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBugDialogOpen(true)}
                className="gap-2"
                title="Report a Bug"
              >
                <Bug className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} className="gap-2">
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 mb-4">
              <LayoutDashboard className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Overview</span>
            </div>
            <h2 className="text-3xl font-bold">ActiPlan Performance</h2>
            <p className="text-muted-foreground mt-1">Monitor your ActiPlan Performance at a glance</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <div className="flex items-center gap-2">
              {dailyLimit !== Infinity && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 border border-border">
                  <Rocket className="h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                      {usedToday}/{dailyLimit} DSP pushes
                    </span>
                    {remaining === 0 ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs text-primary"
                        onClick={() => navigate("/settings/plans")}
                      >
                        Upgrade to {getNextTierName()} →
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Upgrade to {getNextTierName()} →</span>
                    )}
                  </div>
                </div>
              )}
              <Button
                onClick={() => {
                  localStorage.removeItem("draftCampaignId");
                  localStorage.removeItem("basicTargeting");
                  navigate("/app?new=true");
                }}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                New ActiPlan
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        {hasAnyCampaigns && (
          <OverviewFiltersBar
            filters={filters}
            onFiltersChange={setFilters}
            availablePlatforms={availablePlatforms}
            availableBoNumbers={availableBoNumbers}
            availableNames={availableNames}
          />
        )}

        {/* Campaign Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !hasAnyCampaigns ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <BlurredPlaceholderCard />
            <BlurredPlaceholderCard />
            <BlurredPlaceholderCard />
          </div>
        ) : filteredCampaignData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No campaigns match the selected filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredCampaignData.map((data) => (
              <CampaignOverviewCard
                key={data.campaign.id}
                campaign={data.campaign}
                platformPacing={data.platformPacing}
                platformPerformance={data.platformPerformance}
                totalBudgetSpent={data.totalBudgetSpent}
                totalTimePct={data.totalTimePct}
                totalBudgetPct={data.totalBudgetPct}
                totalPacingDiff={data.totalPacingDiff}
                totalDays={data.totalDays}
                elapsedDays={data.elapsedDays}
                modificationRequests={data.modificationRequests}
                completedByCategory={data.completedByCategory}
                hasRecentAnalysis={data.hasRecentAnalysis}
                isSampleData={data.campaign.id === displayData.sampleCampaignId}
                statsByDateRange={data.statsByDateRange}
                platformStatsByDateRange={data.platformStatsByDateRange}
              />
            ))}
          </div>
        )}
      </section>

      {/* Bug Report Dialog */}
      <BugReportDialog open={bugDialogOpen} onOpenChange={setBugDialogOpen} />
    </div>
  );
};

export default Overview;
