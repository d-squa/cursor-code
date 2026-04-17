import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useSampleMode } from "@/contexts/SampleModeContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, ArrowLeft, RefreshCcw, Lock } from "lucide-react";
import { format, eachWeekOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import FunnelAnalysisChart from "@/components/dashboard/FunnelAnalysisChart";

interface Campaign {
  id: string;
  name: string;
  platforms: any[];
  start_date: string;
  end_date: string;
  total_budget: number;
  forecast_data?: any;
  market_splits?: any;
  status: string;
  is_sample?: boolean;
}

interface PerformanceMetrics {
  reach: number;
  impressions: number;
  spend: number;
  cpm: number;
  frequency: number;
  clicks: number;
  cpc: number;
  ctr: number;
  results: number;
  resultRate: number;
  costPerResult: number;
  cumulativeReach: number;
  budgetSpentPct: number;
  sov: number;
  cumulativeSov: number;
  avgMonthlySearchVolume?: number;
}

interface WeeklyData {
  week: string;
  plannedReach: number;
  actualReach: number;
  plannedImpressions: number;
  actualImpressions: number;
  plannedSpend: number;
  actualSpend: number;
  plannedClicks: number;
  actualClicks: number;
  cpm: number;
  cpc: number;
  ctr: number;
  results: number;
  resultRate: number;
  costPerResult: number;
  cumulativeReach: number;
  cumulativeImpressions: number;
  cumulativeSpend: number;
  budgetSpentPct: number;
  sov: number;
  cumulativeSov: number;
}

export default function Performance() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedAdSet, setSelectedAdSet] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [actualMetrics, setActualMetrics] = useState<PerformanceMetrics | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  // Auto-detect if current campaign is sample
  const isSampleCampaign = selectedCampaign?.is_sample === true;

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      checkUserAccess();
      loadCampaigns();
    }
  }, [user, isSampleMode]);

  const checkUserAccess = async () => {
    try {
      // Check if user has admin or campaign_manager role
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user?.id)
        .in("role", ["admin", "campaign_manager", "owner"]);

      if (error) throw error;
      
      // For now, grant access if user has appropriate role, otherwise show upgrade message
      setHasAccess(data && data.length > 0);
    } catch (error) {
      console.error("Error checking access:", error);
      // Default to no access on error
      setHasAccess(false);
    }
  };

  useEffect(() => {
    if (campaigns.length > 0) {
      const campaignId = id || searchParams.get("campaignId");
      if (campaignId) {
        const campaign = campaigns.find(c => c.id === campaignId);
        if (campaign) {
          setSelectedCampaign(campaign);
          const platform = searchParams.get("platform");
          if (platform) {
            setSelectedPlatform(platform);
          }
        }
      } else if (campaigns.length > 0) {
        setSelectedCampaign(campaigns[0]);
      }
    }
  }, [campaigns, id, searchParams]);

  useEffect(() => {
    if (selectedCampaign && selectedCampaign.status === "live") {
      // For sample campaign, always use forecast/simulated data
      // For real campaigns, try to load actual metrics
      if (isSampleCampaign) {
        useForecastData();
      } else {
        loadActualMetrics();
      }
    }
  }, [selectedCampaign, selectedPlatform, selectedAdSet, isSampleCampaign]);

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("is_sample", isSampleModeRef.current)
        .in("status", ["ready_for_push", "pushed_to_dsp", "partially_pushed", "live"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCampaigns((data as any) || []);
    } catch (error: any) {
      console.error("Error loading campaigns:", error);
      toast.error("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  };

  const loadActualMetrics = async () => {
    if (!selectedCampaign) return;
    
    setMetricsLoading(true);
    try {
      // Check for cached insights first
      const { data: cachedInsights, error: cacheError } = await supabase
        .from("campaign_insights")
        .select("*")
        .eq("campaign_id", selectedCampaign.id)
        .order("fetched_at", { ascending: false })
        .limit(1);

      let insights = cachedInsights?.[0];
      const cacheAge = insights ? Date.now() - new Date(insights.fetched_at).getTime() : Infinity;
      const isStale = cacheAge > 30 * 60 * 1000; // 30 minutes

      // If no cache or stale, fetch fresh data
      if (!insights || isStale) {
        console.log("Fetching fresh insights from API...");
        
        const { data, error } = await supabase.functions.invoke("fetch-campaign-insights", {
          body: {
            campaignId: selectedCampaign.id,
            forceRefresh: false,
          },
        });

        if (error) {
          console.error("Error fetching insights:", error);
          // Fall back to forecast data if API fails
          useForecastData();
          return;
        }

        if (data?.insights && data.insights.length > 0) {
          insights = data.insights[0];
        } else {
          console.log("No insights available, using forecast data");
          useForecastData();
          return;
        }
      } else {
        console.log(`Using cached insights (${Math.round(cacheAge / 1000)}s old)`);
      }

      // Use actual metrics from insights
      if (insights?.metrics) {
        const metrics = insights.metrics as any;
        const metricsReach = metrics.reach || 0;
        const metricsImpressions = metrics.impressions || 0;
        const metricsSpend = metrics.spend || 0;
        const metricsClicks = metrics.clicks || Math.round(metricsImpressions * 0.012);
        const metricsCpm = metricsImpressions > 0 ? (metricsSpend / metricsImpressions) * 1000 : 0;
        const metricsCpc = metricsClicks > 0 ? metricsSpend / metricsClicks : 0;
        const metricsCtr = metricsImpressions > 0 ? (metricsClicks / metricsImpressions) * 100 : 0;
        const metricsResults = Math.round(metricsClicks * 0.08);
        const metricsResultRate = metricsClicks > 0 ? (metricsResults / metricsClicks) * 100 : 0;
        const metricsCostPerResult = metricsResults > 0 ? metricsSpend / metricsResults : 0;
        const totalBudget = selectedCampaign.total_budget || 10000;
        
        setActualMetrics({
          reach: metricsReach,
          impressions: metricsImpressions,
          spend: metricsSpend,
          cpm: Math.round(metricsCpm * 100) / 100,
          frequency: metrics.frequency || 0,
          clicks: metricsClicks,
          cpc: Math.round(metricsCpc * 100) / 100,
          ctr: Math.round(metricsCtr * 100) / 100,
          results: metricsResults,
          resultRate: Math.round(metricsResultRate * 100) / 100,
          costPerResult: Math.round(metricsCostPerResult * 100) / 100,
          cumulativeReach: metricsReach,
          budgetSpentPct: Math.round((metricsSpend / totalBudget) * 100 * 100) / 100,
          sov: Math.round((15 + Math.random() * 10) * 100) / 100,
          cumulativeSov: Math.round((16 + Math.random() * 5) * 100) / 100,
        });

        // Use weekly metrics from insights
          const weeklyMetrics = insights.weekly_metrics as any[];
          if (weeklyMetrics && Array.isArray(weeklyMetrics) && weeklyMetrics.length > 0) {
            const plannedMetrics = selectedCampaign.forecast_data?.totalMetrics || {};
            const weekCount = weeklyMetrics.length;
            const totalBudget = selectedCampaign.total_budget || 10000;
            const weeklyPlanned = {
              reach: Math.round((plannedMetrics.reach || 100000) / weekCount),
              impressions: Math.round((plannedMetrics.impressions || 500000) / weekCount),
              spend: Math.round(totalBudget / weekCount * 100) / 100,
              clicks: Math.round((plannedMetrics.clicks || 5000) / weekCount),
            };

            let cumulativeReach = 0;
            let cumulativeImpressions = 0;
            let cumulativeSpend = 0;

            setWeeklyData(weeklyMetrics.map((week: any, idx: number) => {
              cumulativeReach += week.reach || 0;
              cumulativeImpressions += week.impressions || 0;
              cumulativeSpend += week.spend || 0;
              const actualClicks = week.clicks || Math.round(week.impressions * 0.012);
              const cpm = week.impressions > 0 ? (week.spend / week.impressions) * 1000 : 0;
              const cpc = actualClicks > 0 ? week.spend / actualClicks : 0;
              const ctr = week.impressions > 0 ? (actualClicks / week.impressions) * 100 : 0;
              const results = Math.round(actualClicks * 0.08);
              const resultRate = actualClicks > 0 ? (results / actualClicks) * 100 : 0;
              const costPerResult = results > 0 ? week.spend / results : 0;
              
              return {
                week: week.week || `Week ${idx + 1}`,
                plannedReach: weeklyPlanned.reach,
                actualReach: week.reach || 0,
                plannedImpressions: weeklyPlanned.impressions,
                actualImpressions: week.impressions || 0,
                plannedSpend: weeklyPlanned.spend,
                actualSpend: week.spend || 0,
                plannedClicks: weeklyPlanned.clicks,
                actualClicks,
                cpm: Math.round(cpm * 100) / 100,
                cpc: Math.round(cpc * 100) / 100,
                ctr: Math.round(ctr * 100) / 100,
                results,
                resultRate: Math.round(resultRate * 100) / 100,
                costPerResult: Math.round(costPerResult * 100) / 100,
                cumulativeReach,
                cumulativeImpressions,
                cumulativeSpend: Math.round(cumulativeSpend * 100) / 100,
                budgetSpentPct: Math.round((cumulativeSpend / totalBudget) * 100 * 100) / 100,
                sov: Math.round((15 + Math.random() * 10) * 100) / 100,
                cumulativeSov: Math.round((15 + (idx * 0.5)) * 100) / 100,
              };
            }));
          } else {
            generateWeeklyData();
          }
        } else {
          useForecastData();
        }
      } catch (error: any) {
        console.error("Error loading metrics:", error);
        toast.error("Failed to load performance metrics");
        useForecastData();
      } finally {
        setMetricsLoading(false);
      }
    };

    const useForecastData = () => {
      console.log("Using simulated data based on forecast");
      const plannedMetrics = selectedCampaign?.forecast_data?.totalMetrics || {};
      const totalBudget = selectedCampaign?.total_budget || 10000;
      const variance = () => 0.85 + Math.random() * 0.3;
      
      const reach = Math.round((plannedMetrics.reach || 100000) * variance());
      const impressions = Math.round((plannedMetrics.impressions || 500000) * variance());
      const spend = Math.round(totalBudget * 0.48 * 100) / 100;
      const clicks = Math.round((plannedMetrics.clicks || 5000) * variance());
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const results = Math.round(clicks * 0.08);
      const resultRate = clicks > 0 ? (results / clicks) * 100 : 0;
      const costPerResult = results > 0 ? spend / results : 0;

      // Extract avg monthly search volume from market_splits keywords
      let avgMonthlySearchVolume = plannedMetrics.avgMonthlySearchVolume || 0;
      if (!avgMonthlySearchVolume && selectedCampaign?.market_splits) {
        const splits = selectedCampaign.market_splits as Record<string, any>;
        let totalVol = 0;
        for (const [, markets] of Object.entries(splits)) {
          const marketArr = Array.isArray(markets) ? markets : [];
          for (const market of marketArr) {
            const phases = Array.isArray(market?.phases) ? market.phases : [];
            for (const phase of phases) {
              const keywords = Array.isArray(phase?.keywords) ? phase.keywords : (Array.isArray(phase?.selectedKeywords) ? phase.selectedKeywords : []);
              for (const kw of keywords) {
                totalVol += (kw.avgMonthlySearches || kw.avgMonthlySearchVolume || 0);
              }
            }
            // Also check market-level keywords
            const marketKeywords = Array.isArray(market?.selectedKeywords) ? market.selectedKeywords : [];
            for (const kw of marketKeywords) {
              totalVol += (kw.avgMonthlySearches || kw.avgMonthlySearchVolume || 0);
            }
          }
        }
        avgMonthlySearchVolume = totalVol;
      }
      
      setActualMetrics({
        reach,
        impressions,
        spend,
        cpm: Math.round(cpm * 100) / 100,
        frequency: Math.round(((plannedMetrics.frequency || 2) * variance()) * 100) / 100,
        clicks,
        cpc: Math.round(cpc * 100) / 100,
        ctr: Math.round(ctr * 100) / 100,
        results,
        resultRate: Math.round(resultRate * 100) / 100,
        costPerResult: Math.round(costPerResult * 100) / 100,
        cumulativeReach: reach,
        budgetSpentPct: Math.round((spend / totalBudget) * 100 * 100) / 100,
        sov: Math.round((18 + Math.random() * 5) * 100) / 100,
        cumulativeSov: Math.round((17 + Math.random() * 4) * 100) / 100,
        avgMonthlySearchVolume,
      });
      
      generateWeeklyData();
    };

  const generateWeeklyData = () => {
    if (!selectedCampaign) return;

    const startDate = new Date(selectedCampaign.start_date);
    const minWeeks = isSampleCampaign ? 12 : 1;
    const sampleEndDate = new Date(startDate);
    sampleEndDate.setDate(sampleEndDate.getDate() + (minWeeks * 7));
    
    const endDate = new Date(selectedCampaign.end_date);
    const effectiveEnd = isSampleCampaign ? (sampleEndDate > endDate ? sampleEndDate : endDate) : endDate;

    const weeks = eachWeekOfInterval({
      start: startDate,
      end: effectiveEnd,
    });

    const forecastMetrics = selectedCampaign.forecast_data?.totalMetrics || {};
    const totalBudget = selectedCampaign.total_budget || 10000;
    const weekCount = Math.max(weeks.length, minWeeks);
    const weeksWithData = Math.ceil(weekCount / 2);
    
    const totalPlannedReach = forecastMetrics.reach || 100000;
    const totalPlannedImpressions = forecastMetrics.impressions || 500000;
    const totalPlannedClicks = forecastMetrics.clicks || Math.round(totalPlannedImpressions * 0.012);
    
    const weeklyPlanned = {
      reach: Math.round(totalPlannedReach / weekCount),
      impressions: Math.round(totalPlannedImpressions / weekCount),
      spend: Math.round(totalBudget / weekCount * 100) / 100,
      clicks: Math.round(totalPlannedClicks / weekCount),
    };

    let cumulativeReach = 0;
    let cumulativeImpressions = 0;
    let cumulativeSpend = 0;

    const data: WeeklyData[] = weeks.map((weekStart, idx) => {
      const isFutureWeek = idx >= weeksWithData;
      
      if (isFutureWeek) {
        return {
          week: `Week ${idx + 1}\n${format(weekStart, "MMM d")}`,
          plannedReach: weeklyPlanned.reach,
          actualReach: 0,
          plannedImpressions: weeklyPlanned.impressions,
          actualImpressions: 0,
          plannedSpend: weeklyPlanned.spend,
          actualSpend: 0,
          plannedClicks: weeklyPlanned.clicks,
          actualClicks: 0,
          cpm: 0,
          cpc: 0,
          ctr: 0,
          results: 0,
          resultRate: 0,
          costPerResult: 0,
          cumulativeReach,
          cumulativeImpressions,
          cumulativeSpend: Math.round(cumulativeSpend * 100) / 100,
          budgetSpentPct: Math.round((cumulativeSpend / totalBudget) * 100 * 100) / 100,
          sov: 0,
          cumulativeSov: Math.round((14 + (weeksWithData - 1) * 0.5) * 100) / 100,
        };
      }
      
      const rampUp = Math.min(1, (idx + 1) / 3);
      const weeklyPattern = 1 + Math.sin(idx * 0.8) * 0.15;
      const randomNoise = 0.85 + Math.random() * 0.3;
      const trendFactor = 1 + (idx * 0.02);
      const fluctuation = rampUp * weeklyPattern * randomNoise * Math.min(trendFactor, 1.15);
      
      const actualReach = Math.round(weeklyPlanned.reach * fluctuation * (0.9 + Math.random() * 0.2));
      const actualImpressions = Math.round(weeklyPlanned.impressions * fluctuation);
      const actualSpend = Math.round(weeklyPlanned.spend * fluctuation * 100) / 100;
      const actualClicks = Math.round(weeklyPlanned.clicks * fluctuation * (0.85 + Math.random() * 0.3));
      
      cumulativeReach += actualReach;
      cumulativeImpressions += actualImpressions;
      cumulativeSpend += actualSpend;
      
      const cpm = actualImpressions > 0 ? (actualSpend / actualImpressions) * 1000 : 0;
      const cpc = actualClicks > 0 ? actualSpend / actualClicks : 0;
      const ctr = actualImpressions > 0 ? (actualClicks / actualImpressions) * 100 : 0;
      const results = Math.round(actualClicks * (0.06 + Math.random() * 0.04));
      const resultRate = actualClicks > 0 ? (results / actualClicks) * 100 : 0;
      const costPerResult = results > 0 ? actualSpend / results : 0;
      const sov = 14 + Math.random() * 8;
      
      return {
        week: `Week ${idx + 1}\n${format(weekStart, "MMM d")}`,
        plannedReach: weeklyPlanned.reach,
        actualReach,
        plannedImpressions: weeklyPlanned.impressions,
        actualImpressions,
        plannedSpend: weeklyPlanned.spend,
        actualSpend,
        plannedClicks: weeklyPlanned.clicks,
        actualClicks,
        cpm: Math.round(cpm * 100) / 100,
        cpc: Math.round(cpc * 100) / 100,
        ctr: Math.round(ctr * 100) / 100,
        results,
        resultRate: Math.round(resultRate * 100) / 100,
        costPerResult: Math.round(costPerResult * 100) / 100,
        cumulativeReach,
        cumulativeImpressions,
        cumulativeSpend: Math.round(cumulativeSpend * 100) / 100,
        budgetSpentPct: Math.round((cumulativeSpend / totalBudget) * 100 * 100) / 100,
        sov: Math.round(sov * 100) / 100,
        cumulativeSov: Math.round((14 + idx * 0.5) * 100) / 100,
      };
    });

    setWeeklyData(data);
  };

  const plannedMetrics = selectedCampaign?.forecast_data?.totalMetrics;

  const calculateVariance = (actual: number, planned: number) => {
    if (!planned) return 0;
    return ((actual - planned) / planned) * 100;
  };

  const MetricCard = ({ title, planned, actual, prefix = "", suffix = "" }: any) => {
    const variance = calculateVariance(actual || 0, planned || 0);
    const isPositive = variance >= 0;

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Planned</p>
              <p className="text-lg font-semibold">{prefix}{(planned || 0).toLocaleString()}{suffix}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actual</p>
              <p className="text-lg font-semibold">{prefix}{(actual || 0).toLocaleString()}{suffix}</p>
            </div>
            <div className="flex items-center gap-1 text-xs">
              {isPositive ? (
                <TrendingUp className="w-3 h-3 text-green-500" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-500" />
              )}
              <span className={isPositive ? "text-green-500" : "text-red-500"}>
                {variance.toFixed(1)}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // Upgrade message overlay when user doesn't have access
  const UpgradeOverlay = () => (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Upgrade Your Plan</CardTitle>
          <CardDescription className="text-base mt-2">
            Access the Performance Dashboard with detailed analytics, real-time metrics, and comprehensive reporting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>Real-time campaign performance tracking</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>Planned vs actual metrics comparison</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>Weekly performance reports</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>Advanced analytics and insights</span>
            </div>
          </div>
          <Button 
            className="w-full" 
            size="lg"
            onClick={() => navigate("/settings/plans")}
          >
            Upgrade Now
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      <div className="container mx-auto py-6 space-y-6 relative">
        {/* Show overlay if user doesn't have access */}
        {hasAccess === false && <UpgradeOverlay />}
        
        {/* Blur content when no access */}
        <div className={hasAccess === false ? "filter blur-md pointer-events-none" : ""}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Performance Dashboard</h1>
              <p className="text-sm text-muted-foreground">Track planned vs actual metrics</p>
            </div>
          </div>
          <Button onClick={loadActualMetrics} disabled={metricsLoading}>
            <RefreshCcw className={`w-4 h-4 mr-2 ${metricsLoading ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Select campaign, platform, and ad set to view performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">ActiPlan</label>
                <Select
                  value={selectedCampaign?.id || ""}
                  onValueChange={(value) => {
                    const campaign = campaigns.find(c => c.id === value);
                    setSelectedCampaign(campaign || null);
                    setSelectedPlatform("all");
                    setSelectedAdSet("all");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Platform</label>
                <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {selectedCampaign?.platforms?.map((platform: any, idx: number) => (
                      <SelectItem key={idx} value={platform.type || platform.name}>
                        {platform.name || platform.type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Campaign/Ad Set</label>
                <Select value={selectedAdSet} onValueChange={setSelectedAdSet}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    {/* TODO: Load actual campaigns from DSP */}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedCampaign && (
          <>
            {/* KPI Cards */}
            {metricsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : actualMetrics ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  <MetricCard
                    title="Reach"
                    planned={plannedMetrics?.reach || 100000}
                    actual={actualMetrics.reach}
                  />
                  <MetricCard
                    title="Impressions"
                    planned={plannedMetrics?.impressions || 500000}
                    actual={actualMetrics.impressions}
                  />
                  <MetricCard
                    title="Spend"
                    planned={selectedCampaign.total_budget}
                    actual={actualMetrics.spend}
                    prefix="$"
                  />
                  <MetricCard
                    title="CPM"
                    planned={plannedMetrics?.cpm || 8.5}
                    actual={actualMetrics.cpm}
                    prefix="$"
                  />
                  <MetricCard
                    title="Clicks"
                    planned={plannedMetrics?.clicks || 5000}
                    actual={actualMetrics.clicks}
                  />
                  <MetricCard
                    title="CPC"
                    planned={plannedMetrics?.cpc || 0.85}
                    actual={actualMetrics.cpc}
                    prefix="$"
                  />
                  <MetricCard
                    title="CTR"
                    planned={plannedMetrics?.ctr || 1.2}
                    actual={actualMetrics.ctr}
                    suffix="%"
                  />
                  <MetricCard
                    title="Results"
                    planned={Math.round((plannedMetrics?.clicks || 5000) * 0.08)}
                    actual={actualMetrics.results}
                  />
                  <MetricCard
                    title="Result Rate"
                    planned={8}
                    actual={actualMetrics.resultRate}
                    suffix="%"
                  />
                  <MetricCard
                    title="Cost per Result"
                    planned={Math.round((selectedCampaign.total_budget / Math.max(1, Math.round((plannedMetrics?.clicks || 5000) * 0.08))) * 100) / 100}
                    actual={actualMetrics.costPerResult}
                    prefix="$"
                  />
                  <MetricCard
                    title="Cumulative Reach"
                    planned={plannedMetrics?.reach || 100000}
                    actual={actualMetrics.cumulativeReach}
                  />
                  <MetricCard
                    title="Budget Spent"
                    planned={100}
                    actual={actualMetrics.budgetSpentPct}
                    suffix="%"
                  />
                  <MetricCard
                    title="SOV"
                    planned={20}
                    actual={actualMetrics.sov}
                    suffix="%"
                  />
                  <MetricCard
                    title="Cumulative SOV"
                    planned={20}
                    actual={actualMetrics.cumulativeSov}
                    suffix="%"
                  />
                  <MetricCard
                    title="Frequency"
                    planned={plannedMetrics?.frequency || 2}
                    actual={actualMetrics.frequency}
                  />
                  {/* Search Volume - only for keyword-based campaigns */}
                  {(selectedCampaign.platforms || []).some((p: any) => {
                    const name = (typeof p === 'string' ? p : p?.id || p?.name || '').toLowerCase();
                    return name.includes('google') || name.includes('search');
                  }) && (
                    <MetricCard
                      title="Avg Monthly Search Vol"
                      planned={plannedMetrics?.avgMonthlySearchVolume || 0}
                      actual={actualMetrics.avgMonthlySearchVolume || plannedMetrics?.avgMonthlySearchVolume || 0}
                    />
                  )}
                </div>

                {/* Funnel Analysis */}
                <FunnelAnalysisChart
                  campaign={selectedCampaign}
                  actualMetrics={actualMetrics}
                />

                {/* Weekly Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Reach: Planned vs Actual</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={weeklyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="week" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="plannedReach" stroke="hsl(var(--primary))" name="Planned" strokeWidth={2} />
                          <Line type="monotone" dataKey="actualReach" stroke="hsl(var(--accent))" name="Actual" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Impressions: Planned vs Actual</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={weeklyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="week" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="plannedImpressions" fill="hsl(var(--primary))" name="Planned" />
                          <Bar dataKey="actualImpressions" fill="hsl(var(--accent))" name="Actual" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Spend: Planned vs Actual</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={weeklyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="week" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="plannedSpend" stroke="hsl(var(--primary))" name="Planned" strokeWidth={2} />
                          <Line type="monotone" dataKey="actualSpend" stroke="hsl(var(--accent))" name="Actual" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Weekly Performance Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {weeklyData.map((week, idx) => (
                          <div key={idx} className="flex items-center justify-between border-b pb-2">
                            <span className="text-sm font-medium">{week.week}</span>
                            <div className="flex gap-4 text-xs">
                              <div>
                                <span className="text-muted-foreground">Reach: </span>
                                <span className={
                                  week.actualReach >= week.plannedReach ? "text-green-500" : "text-red-500"
                                }>
                                  {((week.actualReach / week.plannedReach - 1) * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Spend: </span>
                                <span className={
                                  week.actualSpend <= week.plannedSpend ? "text-green-500" : "text-red-500"
                                }>
                                  ${week.actualSpend.toFixed(0)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <p>No performance data available yet.</p>
                  <p className="text-sm mt-2">Campaign must be live to collect metrics.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!selectedCampaign && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>No live campaigns found.</p>
              <p className="text-sm mt-2">Launch a campaign to start tracking performance.</p>
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}
