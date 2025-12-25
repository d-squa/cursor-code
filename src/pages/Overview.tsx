import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiplanLimits } from "@/hooks/useActiplanLimits";
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
  LayoutDashboard,
  Lock,
} from "lucide-react";
import { BugReportDialog } from "@/components/BugReportDialog";
import { CampaignOverviewCard } from "@/components/overview/CampaignOverviewCard";
import { BlurredPlaceholderCard } from "@/components/overview/BlurredPlaceholderCard";
import { Loader2 } from "lucide-react";
import { differenceInDays, differenceInHours, startOfWeek, isAfter, subDays } from "date-fns";

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_budget: number;
  start_date: string;
  end_date: string;
  updated_at: string;
  platforms?: any;
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

// Generate sample data for mid-January scenario
const generateSampleData = () => {
  const sampleCampaign: Campaign = {
    id: "sample-campaign-1",
    name: "Q4 Holiday Campaign 2025",
    status: "live",
    total_budget: 80000,
    start_date: "2025-12-16T00:00:00Z",
    end_date: "2026-01-31T23:59:59Z",
    updated_at: new Date().toISOString(),
    platforms: [
      { name: "Meta", enabled: true, budgetPercentage: 62.5 }, // 50k of 80k
      { name: "TikTok", enabled: true, budgetPercentage: 37.5 }, // 30k of 80k
    ],
  };

  // Simulate mid-January (Jan 16, 2026)
  const sampleInsights: CampaignInsight[] = [
    {
      campaign_id: "sample-campaign-1",
      platform: "meta",
      metrics: { spend: 41000, impressions: 2500000 },
      fetched_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    },
    {
      campaign_id: "sample-campaign-1",
      platform: "tiktok",
      metrics: { spend: 14000, impressions: 1800000 },
      fetched_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    },
  ];

  const sampleModRequests: ModificationRequest[] = [
    { campaign_id: "sample-campaign-1", status: "completed", change_type: "budget", updated_at: subDays(new Date(), 2).toISOString() },
    { campaign_id: "sample-campaign-1", status: "completed", change_type: "targeting", updated_at: subDays(new Date(), 5).toISOString() },
    { campaign_id: "sample-campaign-1", status: "pending", change_type: "creative", updated_at: subDays(new Date(), 1).toISOString() },
    { campaign_id: "sample-campaign-1", status: "completed", change_type: "note", updated_at: subDays(new Date(), 3).toISOString() },
    { campaign_id: "sample-campaign-1", status: "completed", change_type: "note", updated_at: subDays(new Date(), 1).toISOString() },
  ];

  const sampleAnalyses: SavedAnalysis[] = [
    { campaign_id: "sample-campaign-1", created_at: subDays(new Date(), 2).toISOString() },
  ];

  return { sampleCampaign, sampleInsights, sampleModRequests, sampleAnalyses };
};

const Overview = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tier } = useFeatureAccess();
  const { dailyLimit, remaining, canCreate } = useActiplanLimits();
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [insights, setInsights] = useState<CampaignInsight[]>([]);
  const [modRequests, setModRequests] = useState<ModificationRequest[]>([]);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);

  const getNextTierName = (): string => {
    const tierOrder: SubscriptionTier[] = ['trial', 'basic', 'freelancer', 'enterprise', 'agency'];
    const currentIndex = tierOrder.indexOf(tier);
    if (currentIndex < tierOrder.length - 1) {
      return TIER_DISPLAY_NAMES[tierOrder[currentIndex + 1]];
    }
    return 'Agency';
  };

  // Handle new=true query param - redirect to app for creating new ActiPlan
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      navigate("/app", { replace: true });
    }
  }, [searchParams, navigate]);
  const loadData = async () => {
    if (!user) return;
    
    try {
      // Fetch campaigns with relevant statuses
      const { data: campaignData } = await supabase
        .from("campaigns")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["pushed_to_dsp", "live", "ended"])
        .order("updated_at", { ascending: false });

      if (campaignData) {
        setCampaigns(campaignData);

        // Fetch insights for these campaigns
        const campaignIds = campaignData.map(c => c.id);
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
            supabase
              .from("saved_insights_analyses")
              .select("campaign_id, created_at")
              .in("campaign_id", campaignIds)
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
    loadData();
  }, [user]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Get sample data
  const sampleData = useMemo(() => generateSampleData(), []);

  // Always include sample card first, then live campaigns
  const displayData = useMemo(() => {
    const { sampleCampaign, sampleInsights, sampleModRequests, sampleAnalyses } = sampleData;
    
    return {
      campaigns: [sampleCampaign, ...campaigns],
      insights: [...sampleInsights, ...insights],
      modRequests: [...sampleModRequests, ...modRequests],
      savedAnalyses: [...sampleAnalyses, ...savedAnalyses],
      sampleCampaignId: sampleCampaign.id,
    };
  }, [campaigns, insights, modRequests, savedAnalyses, sampleData]);

  // Sort campaigns: live first, then ended, then by most recent
  const sortedCampaigns = useMemo(() => {
    return [...displayData.campaigns].sort((a, b) => {
      const statusOrder: Record<string, number> = { live: 0, ended: 1, pushed_to_dsp: 2 };
      const aOrder = statusOrder[a.status] ?? 3;
      const bOrder = statusOrder[b.status] ?? 3;
      
      if (aOrder !== bOrder) return aOrder - bOrder;
      
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [displayData.campaigns]);

  // Calculate pacing for each campaign
  const campaignPacingData = useMemo(() => {
    const realNow = new Date();
    const sampleNow = new Date("2026-01-16T12:00:00Z");

    return sortedCampaigns.map(campaign => {
      // Use mid-January 2026 for sample campaign, real date for others
      const now = campaign.id === "sample-campaign-1" ? sampleNow : realNow;
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const sevenDaysAgo = subDays(now, 7);
      
      const startDate = new Date(campaign.start_date);
      const endDate = new Date(campaign.end_date);
      const totalDays = Math.max(differenceInDays(endDate, startDate), 1);
      const elapsedDays = Math.min(Math.max(differenceInDays(now, startDate), 0), totalDays);
      const timePct = (elapsedDays / totalDays) * 100;

      // Get insights for this campaign
      const campaignInsights = displayData.insights.filter(i => i.campaign_id === campaign.id);
      
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

      // For sample campaign, set platform-specific dates
      if (campaign.id === "sample-campaign-1") {
        platformConfig["tiktok"] = {
          ...platformConfig["tiktok"],
          budget: 30000,
          startDate: "2026-01-01T00:00:00Z",
          endDate: "2026-01-31T23:59:59Z",
        };
        platformConfig["meta"] = {
          ...platformConfig["meta"],
          budget: 50000,
          startDate: "2025-12-16T00:00:00Z",
          endDate: "2026-01-31T23:59:59Z",
        };
      }

      campaignInsights.forEach(insight => {
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
          platformMap[platform].budgetPct = platformMap[platform].budgetTotal > 0 
            ? (platformMap[platform].budgetSpent / platformMap[platform].budgetTotal) * 100 
            : 0;
          platformMap[platform].pacingDiff = platformMap[platform].budgetPct - platformMap[platform].timePct;
        }
      });

      const platformPacing = Object.values(platformMap);
      const totalBudgetPct = campaign.total_budget > 0 ? (totalSpent / campaign.total_budget) * 100 : 0;
      const totalPacingDiff = totalBudgetPct - timePct;

      // Modification requests for this campaign
      const campaignModRequests = displayData.modRequests.filter(m => m.campaign_id === campaign.id);
      const pendingRequests = campaignModRequests.filter(m => m.status === "pending" || m.status === "sent").length;
      
      // Calculate stats by different date ranges
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      
      const getStatsForDateRange = (requests: ModificationRequest[], rangeStart: Date | null) => {
        const filteredRequests = rangeStart 
          ? requests.filter(m => isAfter(new Date(m.updated_at), rangeStart))
          : requests;
        
        return {
          changes: filteredRequests.length,
          pending: filteredRequests.filter(m => m.status === "pending" || m.status === "sent").length,
          optimized: filteredRequests.filter(m => 
            m.status === "completed" && (m.change_type === "targeting" || m.change_type === "goals")
          ).length,
          notes: filteredRequests.filter(m => m.change_type === "note").length,
        };
      };

      const statsByDateRange = {
        lifetime: getStatsForDateRange(campaignModRequests, null),
        this_month: getStatsForDateRange(campaignModRequests, thisMonthStart),
        last_7_days: getStatsForDateRange(campaignModRequests, sevenDaysAgo),
      };

      // Platform-level stats by date range
      const platformStatsByDateRange: Record<string, typeof statsByDateRange> = {};
      platformPacing.forEach(p => {
        // In a real scenario, mod requests would be tagged by platform
        // For now, simulate platform distribution
        const platformRequests = campaignModRequests.filter((_, idx) => {
          // Simple distribution: even indices for first platform, odd for second
          const platformIdx = platformPacing.findIndex(pp => pp.platform === p.platform);
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
        optimization: campaignModRequests.filter(m => 
          m.status === "completed" && (m.change_type === "targeting" || m.change_type === "goals")
        ).length,
        budget: campaignModRequests.filter(m => 
          m.status === "completed" && m.change_type === "budget"
        ).length,
        notesLast7Days: campaignModRequests.filter(m => 
          m.change_type === "note" && isAfter(new Date(m.updated_at), sevenDaysAgo)
        ).length,
      };

      // Check for recent analysis this week
      const campaignAnalyses = displayData.savedAnalyses.filter(a => a.campaign_id === campaign.id);
      const hasRecentAnalysis = campaignAnalyses.some(a => isAfter(new Date(a.created_at), weekStart));

      return {
        campaign,
        platformPacing,
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
      };
    });
  }, [sortedCampaigns, displayData]);

  const hasAnyCampaigns = campaigns.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
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
            <h2 className="text-3xl font-bold">Campaign Performance</h2>
            <p className="text-muted-foreground mt-1">Monitor your active campaigns at a glance</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <div className="flex items-center gap-2">
              {dailyLimit !== Infinity && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {remaining}/{dailyLimit} DSP pushes today
                </span>
              )}
              <Button onClick={() => {
                localStorage.removeItem('draftCampaignId');
                localStorage.removeItem('basicTargeting');
                navigate("/app?new=true");
              }} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New ActiPlan
              </Button>
            </div>
          </div>
        </div>

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
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {campaignPacingData.map(data => (
              <CampaignOverviewCard
                key={data.campaign.id}
                campaign={data.campaign}
                platformPacing={data.platformPacing}
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
