import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { 
  Target, Zap, LogOut, Settings, Bug, RefreshCw, Plus, 
  LayoutDashboard 
} from "lucide-react";
import { BugReportDialog } from "@/components/BugReportDialog";
import { CampaignOverviewCard } from "@/components/overview/CampaignOverviewCard";
import { BlurredPlaceholderCard } from "@/components/overview/BlurredPlaceholderCard";
import { Loader2 } from "lucide-react";
import { differenceInDays, differenceInHours, startOfWeek, isAfter } from "date-fns";

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
}

const Overview = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [insights, setInsights] = useState<CampaignInsight[]>([]);
  const [modRequests, setModRequests] = useState<ModificationRequest[]>([]);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);

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
              .select("campaign_id, status")
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

  // Sort campaigns: live first, then ended, then by most recent
  const sortedCampaigns = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const statusOrder: Record<string, number> = { live: 0, ended: 1, pushed_to_dsp: 2 };
      const aOrder = statusOrder[a.status] ?? 3;
      const bOrder = statusOrder[b.status] ?? 3;
      
      if (aOrder !== bOrder) return aOrder - bOrder;
      
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [campaigns]);

  // Calculate pacing for each campaign
  const campaignPacingData = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });

    return sortedCampaigns.map(campaign => {
      const startDate = new Date(campaign.start_date);
      const endDate = new Date(campaign.end_date);
      const totalDays = Math.max(differenceInDays(endDate, startDate), 1);
      const elapsedDays = Math.min(Math.max(differenceInDays(now, startDate), 0), totalDays);
      const timePct = (elapsedDays / totalDays) * 100;

      // Get insights for this campaign
      const campaignInsights = insights.filter(i => i.campaign_id === campaign.id);
      
      // Calculate platform pacing
      const platformMap: Record<string, PlatformPacing> = {};
      let totalSpent = 0;

      // Get platform budgets from campaign.platforms
      const platformBudgets: Record<string, number> = {};
      if (campaign.platforms && Array.isArray(campaign.platforms)) {
        campaign.platforms.forEach((p: any) => {
          if (p.enabled && p.name) {
            const pctAllocation = p.budgetPercentage || 0;
            platformBudgets[p.name.toLowerCase()] = (campaign.total_budget * pctAllocation) / 100;
          }
        });
      }

      campaignInsights.forEach(insight => {
        const platform = insight.platform.toLowerCase();
        const spent = insight.metrics?.spend || 0;
        const fetchedAt = new Date(insight.fetched_at);
        const hoursSinceFetch = differenceInHours(now, fetchedAt);
        
        totalSpent += spent;
        
        if (!platformMap[platform]) {
          const budgetTotal = platformBudgets[platform] || campaign.total_budget / (campaignInsights.length || 1);
          const budgetPct = budgetTotal > 0 ? (spent / budgetTotal) * 100 : 0;
          const pacingDiff = budgetPct - timePct;

          platformMap[platform] = {
            platform,
            budgetSpent: spent,
            budgetTotal,
            budgetPct,
            timePct,
            pacingDiff,
            hasRecentImpressions: hoursSinceFetch <= 1 && (insight.metrics?.impressions || 0) > 0,
            lastImpressionAt: insight.fetched_at,
          };
        } else {
          platformMap[platform].budgetSpent += spent;
          platformMap[platform].budgetPct = platformMap[platform].budgetTotal > 0 
            ? (platformMap[platform].budgetSpent / platformMap[platform].budgetTotal) * 100 
            : 0;
          platformMap[platform].pacingDiff = platformMap[platform].budgetPct - timePct;
        }
      });

      const platformPacing = Object.values(platformMap);
      const totalBudgetPct = campaign.total_budget > 0 ? (totalSpent / campaign.total_budget) * 100 : 0;
      const totalPacingDiff = totalBudgetPct - timePct;

      // Modification requests for this campaign
      const campaignModRequests = modRequests.filter(m => m.campaign_id === campaign.id);
      const pendingRequests = campaignModRequests.filter(m => m.status === "pending").length;

      // Check for recent analysis this week
      const campaignAnalyses = savedAnalyses.filter(a => a.campaign_id === campaign.id);
      const hasRecentAnalysis = campaignAnalyses.some(a => isAfter(new Date(a.created_at), weekStart));

      return {
        campaign,
        platformPacing,
        totalBudgetSpent: totalSpent,
        totalTimePct: timePct,
        totalBudgetPct,
        totalPacingDiff,
        modificationRequests: {
          total: campaignModRequests.length,
          pending: pendingRequests,
        },
        hasRecentAnalysis,
      };
    });
  }, [sortedCampaigns, insights, modRequests, savedAnalyses]);

  const hasAnyCampaigns = campaigns.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
                <Target className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  ActiPlan
                </h1>
                <p className="text-xs text-muted-foreground">Cross-Platform Activation Manager</p>
              </div>
            </div>
            <nav className="flex items-center gap-2">
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
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={() => navigate("/app/new")} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New ActiPlan
            </Button>
          </div>
        </div>

        {/* Campaign Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !hasAnyCampaigns ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <BlurredPlaceholderCard />
            <BlurredPlaceholderCard />
            <BlurredPlaceholderCard />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaignPacingData.map(data => (
              <CampaignOverviewCard
                key={data.campaign.id}
                campaign={data.campaign}
                platformPacing={data.platformPacing}
                totalBudgetSpent={data.totalBudgetSpent}
                totalTimePct={data.totalTimePct}
                totalBudgetPct={data.totalBudgetPct}
                totalPacingDiff={data.totalPacingDiff}
                modificationRequests={data.modificationRequests}
                hasRecentAnalysis={data.hasRecentAnalysis}
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
