import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Loader2, ArrowLeft, RefreshCw, BarChart3, Download,
  Wallet, Eye, Users, MousePointerClick, Target
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { format, startOfWeek, endOfWeek, eachWeekOfInterval, eachMonthOfInterval, startOfMonth, endOfMonth, differenceInDays } from "date-fns";
import { DateRange } from "react-day-picker";

import DashboardFilters from "@/components/dashboard/DashboardFilters";
import MetricScorecard from "@/components/dashboard/MetricScorecard";
import TimeSeriesChart from "@/components/dashboard/TimeSeriesChart";
import BudgetPacingChart from "@/components/dashboard/BudgetPacingChart";
import CoverageEvolutionChart from "@/components/dashboard/CoverageEvolutionChart";
import FunnelAnalysisChart from "@/components/dashboard/FunnelAnalysisChart";
import PerformanceTable from "@/components/dashboard/PerformanceTable";
import PlatformComparisonSection from "@/components/dashboard/PlatformComparisonSection";
import MarketComparisonSection from "@/components/dashboard/MarketComparisonSection";
import DimensionBreakdownChart from "@/components/dashboard/DimensionBreakdownChart";
import MetricComparisonChart from "@/components/dashboard/MetricComparisonChart";

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_budget: number;
  start_date: string;
  end_date: string;
  objective: string;
  forecast_data?: any;
  platforms?: any;
}

interface LaunchStatusEntry {
  id: string;
  platform: string;
  market: string;
  phase_name: string | null;
  entity_type: string;
  entity_name: string | null;
  dsp_entity_id: string | null;
  status: string;
  dsp_status: string | null;
  planned_budget: number | null;
  planned_impressions: number | null;
  planned_reach: number | null;
  planned_clicks: number | null;
  planned_conversions: number | null;
}

interface CampaignInsight {
  id: string;
  platform: string;
  ad_account_id: string | null;
  campaign_dsp_id: string | null;
  metrics: any;
  weekly_metrics: any[];
  fetched_at: string;
}

const SAMPLE_CAMPAIGN_ID = "sample-campaign-1";

export default function PerformanceReport() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Legacy hardcoded placeholder no longer exists — redirect away cleanly.
  useEffect(() => {
    if (campaignId === SAMPLE_CAMPAIGN_ID) {
      navigate("/overview", { replace: true });
    }
  }, [campaignId, navigate]);

  // Automatically determine data source based on campaign ID
  const isSampleCampaign = campaignId === SAMPLE_CAMPAIGN_ID;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [launchStatuses, setLaunchStatuses] = useState<LaunchStatusEntry[]>([]);
  const [insights, setInsights] = useState<CampaignInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter states
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [selectedObjective, setSelectedObjective] = useState<string>('all');
  const [selectedOptimizationGoal, setSelectedOptimizationGoal] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [granularity, setGranularity] = useState<'weekly' | 'monthly'>('weekly');

  const generateSampleInsights = useCallback((statusData: LaunchStatusEntry[], campaignData: Campaign | null): CampaignInsight[] => {
    // Generate sample insights based on planned data with realistic fluctuations
    const platformInsights: Record<string, CampaignInsight> = {};
    
    // For sample data, always generate 12 weeks of data regardless of campaign dates
    const sampleWeekCount = 12;
    const startDate = campaignData?.start_date ? new Date(campaignData.start_date) : new Date();
    const sampleEndDate = new Date(startDate);
    sampleEndDate.setDate(sampleEndDate.getDate() + (sampleWeekCount * 7));
    const weeks = eachWeekOfInterval({ start: startDate, end: sampleEndDate }, { weekStartsOn: 1 });
    const weekCount = Math.max(weeks.length, sampleWeekCount);
    
    // Only populate data for the first half of weeks (mid-campaign simulation)
    const weeksWithData = Math.ceil(weekCount / 2);
    
    statusData.forEach(status => {
      if (!platformInsights[status.platform]) {
        platformInsights[status.platform] = {
          id: `sample-${status.platform}`,
          platform: status.platform,
          ad_account_id: null,
          campaign_dsp_id: null,
          metrics: {
            spend: 0,
            impressions: 0,
            reach: 0,
            clicks: 0,
            conversions: 0,
          },
          weekly_metrics: [],
          fetched_at: new Date().toISOString(),
        };
      }
      
      // Scale variance for mid-campaign (only ~50% of planned spent)
      const midCampaignScale = weeksWithData / weekCount;
      const variance = () => 0.85 + Math.random() * 0.3; // 85%-115% variance
      platformInsights[status.platform].metrics.spend += (status.planned_budget || 0) * midCampaignScale * variance();
      platformInsights[status.platform].metrics.impressions += (status.planned_impressions || 0) * midCampaignScale * variance();
      platformInsights[status.platform].metrics.reach += (status.planned_reach || 0) * midCampaignScale * variance();
      platformInsights[status.platform].metrics.clicks += (status.planned_clicks || 0) * midCampaignScale * variance();
      platformInsights[status.platform].metrics.conversions += (status.planned_conversions || 0) * midCampaignScale * variance();
    });

    // Generate weekly metrics with realistic fluctuations
    Object.values(platformInsights).forEach(insight => {
      const weeklyBudget = insight.metrics.spend / weeksWithData;
      const weeklyImpressions = insight.metrics.impressions / weeksWithData;
      const weeklyReach = insight.metrics.reach / weeksWithData;
      const weeklyClicks = insight.metrics.clicks / weeksWithData;
      const weeklyConversions = insight.metrics.conversions / weeksWithData;
      
      // Create a seed for consistent but varied patterns
      let trendFactor = 1;
      
      insight.weekly_metrics = weeks.map((weekStart, idx) => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        const isFutureWeek = idx >= weeksWithData;
        
        if (isFutureWeek) {
          // Future weeks have null/zero actual values
          return {
            date_start: format(weekStart, 'yyyy-MM-dd'),
            date_end: format(weekEnd, 'yyyy-MM-dd'),
            week: `Week ${idx + 1}`,
            spend: null,
            impressions: null,
            reach: null,
            clicks: null,
            conversions: null,
            results: null,
          };
        }
        
        // Create realistic fluctuations with patterns
        // Simulate: ramp-up in first weeks, some weekly patterns, random noise
        const rampUp = Math.min(1, (idx + 1) / 3); // Ramp up over first 3 weeks
        const weeklyPattern = 1 + Math.sin(idx * 0.8) * 0.15; // Subtle wave pattern
        const randomNoise = 0.85 + Math.random() * 0.3; // 85%-115% noise
        
        // Gradual trend (slight improvement over time)
        trendFactor = 1 + (idx * 0.02);
        
        const fluctuation = rampUp * weeklyPattern * randomNoise * Math.min(trendFactor, 1.15);
        
        return {
          date_start: format(weekStart, 'yyyy-MM-dd'),
          date_end: format(weekEnd, 'yyyy-MM-dd'),
          week: `Week ${idx + 1}`,
          spend: Math.round(weeklyBudget * fluctuation * 100) / 100,
          impressions: Math.round(weeklyImpressions * fluctuation),
          reach: Math.round(weeklyReach * fluctuation * (0.9 + Math.random() * 0.2)),
          clicks: Math.round(weeklyClicks * fluctuation * (0.85 + Math.random() * 0.3)),
          conversions: Math.round(weeklyConversions * fluctuation * (0.8 + Math.random() * 0.4)),
          results: Math.round(weeklyConversions * fluctuation * (0.8 + Math.random() * 0.4)),
        };
      });
    });

    return Object.values(platformInsights);
  }, []);

  const loadData = useCallback(async () => {
    if (!campaignId || !user) return;
    
    // For sample campaign, generate sample data; for real campaigns, fetch live data
    if (isSampleCampaign) {
      // Generate sample campaign data
      const sampleCampaignData: Campaign = {
        id: SAMPLE_CAMPAIGN_ID,
        name: "Q4 Holiday Campaign 2025",
        status: "live",
        total_budget: 80000,
        start_date: "2025-12-16T00:00:00Z",
        end_date: "2026-01-31T23:59:59Z",
        objective: "conversions",
        platforms: [
          { name: "Meta", enabled: true, budgetPercentage: 62.5 },
          { name: "TikTok", enabled: true, budgetPercentage: 37.5 },
        ],
      };
      
      const sampleStatuses: LaunchStatusEntry[] = [
        { id: "s1", platform: "meta", market: "US", phase_name: "Awareness", entity_type: "campaign", entity_name: "Meta Campaign", dsp_entity_id: "123", status: "pushed_to_dsp", dsp_status: "ACTIVE", planned_budget: 50000, planned_impressions: 5000000, planned_reach: 2000000, planned_clicks: 50000, planned_conversions: 2500 },
        { id: "s2", platform: "tiktok", market: "US", phase_name: "Consideration", entity_type: "campaign", entity_name: "TikTok Campaign", dsp_entity_id: "456", status: "pushed_to_dsp", dsp_status: "ACTIVE", planned_budget: 30000, planned_impressions: 3000000, planned_reach: 1200000, planned_clicks: 30000, planned_conversions: 1500 },
      ];
      
      setCampaign(sampleCampaignData);
      setLaunchStatuses(sampleStatuses);
      setInsights(generateSampleInsights(sampleStatuses, sampleCampaignData));
      setLoading(false);
      return;
    }
    
    try {
      const [
        { data: campaignData }, 
        { data: statusData },
        { data: insightsData }
      ] = await Promise.all([
        supabase.from('campaigns').select('*').eq('id', campaignId).single(),
        supabase.from('campaign_launch_status').select('*').eq('campaign_id', campaignId),
        supabase.from('campaign_insights').select('*').eq('campaign_id', campaignId).order('fetched_at', { ascending: false })
      ]);
      
      if (campaignData) setCampaign(campaignData);
      if (statusData) {
        setLaunchStatuses(statusData);
        if (insightsData && insightsData.length > 0) {
          setInsights(insightsData as CampaignInsight[]);
        } else {
          // Fall back to generated sample data if no live insights
          setInsights(generateSampleInsights(statusData, campaignData));
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, [campaignId, user, isSampleCampaign, generateSampleInsights]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Set default date range from campaign start to now
  useEffect(() => {
    if (campaign?.start_date && !dateRange) {
      setDateRange({
        from: new Date(campaign.start_date),
        to: new Date()
      });
    }
  }, [campaign?.start_date]);

  const handleRefresh = async () => {
    if (!campaignId) return;
    
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-campaign-insights', {
        body: { campaignId, forceRefresh: true }
      });
      
      if (error) throw error;
      
      toast.success('Performance data refreshed');
      await loadData();
    } catch (error: any) {
      console.error('Refresh error:', error);
      toast.error('Failed to refresh: ' + error.message);
    } finally {
      setRefreshing(false);
    }
  };

  // Extract filter options from data
  const filterOptions = useMemo(() => {
    const platforms = [...new Set(launchStatuses.map(s => s.platform))];
    const markets = [...new Set(launchStatuses.map(s => s.market))];
    const phases = [...new Set(launchStatuses.map(s => s.phase_name).filter(Boolean))] as string[];
    const objectives = campaign?.objective ? [campaign.objective] : [];
    const optimizationGoals: string[] = [];
    
    return { platforms, markets, phases, objectives, optimizationGoals };
  }, [launchStatuses, campaign]);

  // Apply filters to data
  const filteredData = useMemo(() => {
    let filteredStatuses = launchStatuses;
    let filteredInsights = insights;

    if (selectedPlatforms.length > 0) {
      filteredStatuses = filteredStatuses.filter(s => selectedPlatforms.includes(s.platform));
      filteredInsights = filteredInsights.filter(i => selectedPlatforms.includes(i.platform));
    }

    if (selectedMarkets.length > 0) {
      filteredStatuses = filteredStatuses.filter(s => selectedMarkets.includes(s.market));
    }

    if (selectedPhases.length > 0) {
      filteredStatuses = filteredStatuses.filter(s => s.phase_name && selectedPhases.includes(s.phase_name));
    }

    return { statuses: filteredStatuses, insights: filteredInsights };
  }, [launchStatuses, insights, selectedPlatforms, selectedMarkets, selectedPhases]);

  // Calculate aggregated metrics
  const metrics = useMemo(() => {
    const planned = {
      budget: filteredData.statuses.reduce((sum, s) => sum + (s.planned_budget || 0), 0),
      impressions: filteredData.statuses.reduce((sum, s) => sum + (s.planned_impressions || 0), 0),
      reach: filteredData.statuses.reduce((sum, s) => sum + (s.planned_reach || 0), 0),
      clicks: filteredData.statuses.reduce((sum, s) => sum + (s.planned_clicks || 0), 0),
      conversions: filteredData.statuses.reduce((sum, s) => sum + (s.planned_conversions || 0), 0),
    };

    const actual = filteredData.insights.reduce((acc, insight) => {
      const m = insight.metrics || {};
      return {
        spend: acc.spend + (m.spend || 0),
        impressions: acc.impressions + (m.impressions || 0),
        reach: acc.reach + (m.reach || 0),
        clicks: acc.clicks + (m.clicks || 0),
        conversions: acc.conversions + (m.conversions || m.results || 0),
        frequency: m.frequency || acc.frequency,
        ctr: m.ctr || acc.ctr,
        cpm: m.cpm || acc.cpm,
        cpc: m.cpc || acc.cpc,
      };
    }, { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0, frequency: 0, ctr: 0, cpm: 0, cpc: 0 });

    // Calculate derived metrics
    actual.ctr = actual.impressions > 0 ? (actual.clicks / actual.impressions) * 100 : 0;
    actual.cpm = actual.impressions > 0 ? (actual.spend / actual.impressions) * 1000 : 0;
    actual.cpc = actual.clicks > 0 ? actual.spend / actual.clicks : 0;
    actual.frequency = actual.reach > 0 ? actual.impressions / actual.reach : 0;

    return { planned, actual };
  }, [filteredData]);

  // Generate time series data
  const timeSeriesData = useMemo(() => {
    if (!campaign?.start_date) return [];

    const start = new Date(campaign.start_date);
    // For sample data, ensure we have enough periods for visualization
    const minWeeks = isSampleCampaign ? 12 : 1;
    const minMonths = isSampleCampaign ? 6 : 1;
    
    const sampleEndDate = new Date(start);
    if (granularity === 'weekly') {
      sampleEndDate.setDate(sampleEndDate.getDate() + (minWeeks * 7));
    } else {
      sampleEndDate.setMonth(sampleEndDate.getMonth() + minMonths);
    }
    
    const end = campaign.end_date ? new Date(campaign.end_date) : sampleEndDate;
    const effectiveEnd = isSampleCampaign ? (sampleEndDate > end ? sampleEndDate : end) : end;
    const now = new Date();
    const campaignDays = differenceInDays(effectiveEnd, start) + 1;

    const intervals = granularity === 'weekly'
      ? eachWeekOfInterval({ start, end: isSampleCampaign ? effectiveEnd : (now < effectiveEnd ? now : effectiveEnd) })
      : eachMonthOfInterval({ start, end: isSampleCampaign ? effectiveEnd : (now < effectiveEnd ? now : effectiveEnd) });

    // Get weekly metrics from insights
    const allWeeklyMetrics: any[] = [];
    filteredData.insights.forEach(insight => {
      if (Array.isArray(insight.weekly_metrics)) {
        insight.weekly_metrics.forEach(wm => {
          allWeeklyMetrics.push({ ...wm, platform: insight.platform });
        });
      }
    });

    // Calculate planned per period
    const periodsCount = intervals.length || 1;
    const plannedPerPeriod = {
      budget: metrics.planned.budget / periodsCount,
      impressions: metrics.planned.impressions / periodsCount,
      reach: metrics.planned.reach / periodsCount,
      clicks: metrics.planned.clicks / periodsCount,
    };

    let cumulativePlanned = 0;
    let cumulativeActual = 0;
    let cumulativeReach = 0;

    return intervals.map((periodStart, index) => {
      const periodEnd = granularity === 'weekly' 
        ? endOfWeek(periodStart, { weekStartsOn: 1 })
        : endOfMonth(periodStart);
      
      const periodLabel = granularity === 'weekly'
        ? format(periodStart, 'MMM d')
        : format(periodStart, 'MMM yyyy');

      // Aggregate actual metrics for this period
      const periodMetrics = allWeeklyMetrics.filter(wm => {
        if (!wm.date_start) return false;
        const wmDate = new Date(wm.date_start);
        return wmDate >= periodStart && wmDate <= periodEnd;
      });

      // Check if this period has actual data (not null/future weeks)
      const hasActualData = periodMetrics.length > 0 && periodMetrics.some(wm => wm.spend !== null && wm.spend !== undefined);

      const periodActual = periodMetrics.reduce((acc, wm) => ({
        spend: acc.spend + (wm.spend || 0),
        impressions: acc.impressions + (wm.impressions || 0),
        reach: acc.reach + (wm.reach || 0),
        clicks: acc.clicks + (wm.clicks || 0),
        conversions: acc.conversions + (wm.conversions || wm.results || 0),
      }), { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0 });

      // For future weeks (no actual data), use null to show empty bars
      const isFutureWeek = !hasActualData && isSampleCampaign;
      const actualSpend = isFutureWeek ? null : (hasActualData ? periodActual.spend : metrics.actual.spend / periodsCount);
      const actualImpressions = isFutureWeek ? null : (hasActualData ? periodActual.impressions : metrics.actual.impressions / periodsCount);
      const actualReach = isFutureWeek ? null : (hasActualData ? periodActual.reach : metrics.actual.reach / periodsCount);
      const actualClicks = isFutureWeek ? null : (hasActualData ? periodActual.clicks : metrics.actual.clicks / periodsCount);

      cumulativePlanned += plannedPerPeriod.budget;
      cumulativeActual += actualSpend || 0;
      cumulativeReach += actualReach || 0;

      // Time elapsed calculation
      const periodDays = differenceInDays(periodEnd, start);
      const pctTimeElapsed = Math.min(100, (periodDays / campaignDays) * 100);
      const pctBudgetSpent = metrics.planned.budget > 0 ? (cumulativeActual / metrics.planned.budget) * 100 : 0;

      // CPM and CPC for this period
      const periodCpm = actualImpressions && actualImpressions > 0 ? ((actualSpend || 0) / actualImpressions) * 1000 : 0;
      const periodCpc = actualClicks && actualClicks > 0 ? (actualSpend || 0) / actualClicks : 0;
      const periodCtr = actualImpressions && actualImpressions > 0 ? ((actualClicks || 0) / actualImpressions) * 100 : 0;

      // Frequency
      const periodFrequency = actualReach && actualReach > 0 ? (actualImpressions || 0) / actualReach : 0;

      // Coverage / SOV estimates
      const audienceSize = metrics.planned.reach * 1.5; // Estimate
      const targetReach = metrics.planned.reach;
      const targetSov = 0.15; // 15% target
      const sov = audienceSize > 0 ? cumulativeReach / audienceSize : 0;

      return {
        period: periodLabel,
        // Budget pacing
        plannedBudget: plannedPerPeriod.budget,
        actualSpend,
        cumulativePlanned,
        cumulativeActual,
        pctTimeElapsed,
        pctBudgetSpent,
        // Reach metrics
        plannedReach: plannedPerPeriod.reach,
        actualReach,
        reach: actualReach,
        impressions: actualImpressions,
        frequency: periodFrequency,
        // Performance metrics
        plannedImpressions: plannedPerPeriod.impressions,
        actualImpressions,
        plannedClicks: plannedPerPeriod.clicks,
        actualClicks,
        clicks: actualClicks,
        ctr: periodCtr,
        cpm: periodCpm,
        cpc: periodCpc,
        // Coverage
        audienceSize,
        cumulativeReach,
        targetReach: targetReach / periodsCount * (index + 1),
        sov,
        targetSov,
        cumulativeSov: sov,
        // Results
        results: isFutureWeek ? null : (hasActualData ? periodActual.conversions : metrics.actual.conversions / periodsCount),
        resultRate: actualClicks && actualClicks > 0 ? ((hasActualData ? periodActual.conversions : metrics.actual.conversions / periodsCount) / actualClicks) * 100 : 0,
        costPerResult: (hasActualData ? periodActual.conversions : metrics.actual.conversions / periodsCount) > 0 
          ? (actualSpend || 0) / (hasActualData ? periodActual.conversions : metrics.actual.conversions / periodsCount) 
          : 0,
      };
    });
  }, [campaign, filteredData, metrics, granularity]);

  // Platform breakdown for table - show each phase separately
  const platformBreakdown = useMemo(() => {
    const breakdown: Record<string, any> = {};
    
    filteredData.statuses.forEach(status => {
      // Include phase_name in key to show each phase separately
      const phaseName = status.phase_name || 'Unknown';
      const key = `${status.platform}-${status.market}-${phaseName}`;
      if (!breakdown[key]) {
        breakdown[key] = {
          name: status.phase_name || status.entity_name || status.platform,
          platform: status.platform,
          market: status.market,
          phase: phaseName,
          plannedBudget: 0,
          actualSpend: 0,
          plannedImpressions: 0,
          actualImpressions: 0,
          plannedReach: 0,
          actualReach: 0,
          plannedClicks: 0,
          actualClicks: 0,
        };
      }
      breakdown[key].plannedBudget += status.planned_budget || 0;
      breakdown[key].plannedImpressions += status.planned_impressions || 0;
      breakdown[key].plannedReach += status.planned_reach || 0;
      breakdown[key].plannedClicks += status.planned_clicks || 0;
    });

    filteredData.insights.forEach(insight => {
      const m = insight.metrics || {};
      Object.keys(breakdown).forEach(key => {
        if (breakdown[key].platform === insight.platform) {
          breakdown[key].actualSpend += m.spend || 0;
          breakdown[key].actualImpressions += m.impressions || 0;
          breakdown[key].actualReach += m.reach || 0;
          breakdown[key].actualClicks += m.clicks || 0;
        }
      });
    });

    Object.values(breakdown).forEach((row: any) => {
      row.ctr = row.actualImpressions > 0 ? (row.actualClicks / row.actualImpressions) * 100 : 0;
      row.cpm = row.actualImpressions > 0 ? (row.actualSpend / row.actualImpressions) * 1000 : 0;
      row.cpc = row.actualClicks > 0 ? row.actualSpend / row.actualClicks : 0;
    });

    return Object.values(breakdown);
  }, [filteredData]);

  // Platform aggregated data
  const platformData = useMemo(() => {
    const byPlatform: Record<string, any> = {};
    platformBreakdown.forEach((row: any) => {
      if (!byPlatform[row.platform]) {
        byPlatform[row.platform] = { platform: row.platform, plannedBudget: 0, actualSpend: 0, plannedImpressions: 0, actualImpressions: 0, plannedReach: 0, actualReach: 0, plannedClicks: 0, actualClicks: 0 };
      }
      byPlatform[row.platform].plannedBudget += row.plannedBudget;
      byPlatform[row.platform].actualSpend += row.actualSpend;
      byPlatform[row.platform].plannedImpressions += row.plannedImpressions;
      byPlatform[row.platform].actualImpressions += row.actualImpressions;
      byPlatform[row.platform].plannedReach += row.plannedReach;
      byPlatform[row.platform].actualReach += row.actualReach;
      byPlatform[row.platform].plannedClicks += row.plannedClicks;
      byPlatform[row.platform].actualClicks += row.actualClicks;
    });
    return Object.values(byPlatform).map((p: any) => ({
      ...p,
      ctr: p.actualImpressions > 0 ? (p.actualClicks / p.actualImpressions) * 100 : 0,
      cpm: p.actualImpressions > 0 ? (p.actualSpend / p.actualImpressions) * 1000 : 0,
      cpc: p.actualClicks > 0 ? p.actualSpend / p.actualClicks : 0,
    }));
  }, [platformBreakdown]);

  // Market aggregated data
  const marketData = useMemo(() => {
    const byMarket: Record<string, any> = {};
    platformBreakdown.forEach((row: any) => {
      if (!byMarket[row.market]) {
        byMarket[row.market] = { market: row.market, plannedBudget: 0, actualSpend: 0, plannedImpressions: 0, actualImpressions: 0, plannedReach: 0, actualReach: 0, plannedClicks: 0, actualClicks: 0 };
      }
      byMarket[row.market].plannedBudget += row.plannedBudget;
      byMarket[row.market].actualSpend += row.actualSpend;
      byMarket[row.market].plannedImpressions += row.plannedImpressions;
      byMarket[row.market].actualImpressions += row.actualImpressions;
      byMarket[row.market].plannedReach += row.plannedReach;
      byMarket[row.market].actualReach += row.actualReach;
      byMarket[row.market].plannedClicks += row.plannedClicks;
      byMarket[row.market].actualClicks += row.actualClicks;
    });
    return Object.values(byMarket).map((m: any) => ({
      ...m,
      ctr: m.actualImpressions > 0 ? (m.actualClicks / m.actualImpressions) * 100 : 0,
      cpm: m.actualImpressions > 0 ? (m.actualSpend / m.actualImpressions) * 1000 : 0,
      cpc: m.actualClicks > 0 ? m.actualSpend / m.actualClicks : 0,
    }));
  }, [platformBreakdown]);

  // Filter handlers
  const handlePlatformToggle = (platform: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    );
  };

  const handleMarketToggle = (market: string) => {
    setSelectedMarkets(prev => 
      prev.includes(market) ? prev.filter(m => m !== market) : [...prev, market]
    );
  };

  const handlePhaseToggle = (phase: string) => {
    setSelectedPhases(prev => 
      prev.includes(phase) ? prev.filter(p => p !== phase) : [...prev, phase]
    );
  };

  const handleClearFilters = () => {
    setSelectedPlatforms([]);
    setSelectedMarkets([]);
    setSelectedPhases([]);
    setSelectedObjective('all');
    setSelectedOptimizationGoal('all');
    setDateRange(undefined);
  };

  // Chart metric options
  const actualVsPlannedReachMetrics = [
    { key: 'plannedReach', label: 'Planned Reach', color: '#ef4444', type: 'line' as const },
    { key: 'actualReach', label: 'Reach', color: '#f59e0b', type: 'bar' as const },
    { key: 'cpm', label: 'CPM', color: '#3b82f6', type: 'line' as const, yAxisId: 'right' as const },
  ];

  const actualVsPlannedImpressionsMetrics = [
    { key: 'plannedImpressions', label: 'Planned Impressions', color: '#ef4444', type: 'line' as const },
    { key: 'actualImpressions', label: 'Impressions', color: '#f59e0b', type: 'bar' as const },
    { key: 'cpm', label: 'CPM', color: '#3b82f6', type: 'line' as const, yAxisId: 'right' as const },
  ];

  const performanceMetrics1 = [
    { key: 'reach', label: 'Reach', color: '#ef4444', type: 'bar' as const },
    { key: 'impressions', label: 'Impressions', color: '#f59e0b', type: 'bar' as const },
    { key: 'frequency', label: 'Frequency', color: '#3b82f6', type: 'line' as const, yAxisId: 'right' as const },
  ];

  const performanceMetrics2 = [
    { key: 'clicks', label: 'Clicks', color: '#f59e0b', type: 'bar' as const },
    { key: 'ctr', label: 'CTR', color: '#ef4444', type: 'line' as const, yAxisId: 'right' as const },
    { key: 'cpc', label: 'CPC', color: '#3b82f6', type: 'line' as const, yAxisId: 'right' as const },
  ];

  const performanceMetrics3 = [
    { key: 'results', label: 'Results', color: '#22c55e', type: 'bar' as const },
    { key: 'resultRate', label: 'Result Rate', color: '#ef4444', type: 'line' as const, yAxisId: 'right' as const },
    { key: 'costPerResult', label: 'Cost Per Result', color: '#3b82f6', type: 'line' as const, yAxisId: 'right' as const },
  ];

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
        <Button variant="outline" onClick={() => navigate('/actiplans')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to ActiPlans
        </Button>
      </div>
    );
  }

  const hasData = launchStatuses.length > 0;
  const lastFetched = insights[0]?.fetched_at;

  return (
    <div className="container mx-auto p-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/actiplans')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            Performance Dashboard · {format(new Date(campaign.start_date), 'MMM dd')} - {format(new Date(campaign.end_date), 'MMM dd, yyyy')}
            {lastFetched && ` · Last updated: ${format(new Date(lastFetched), 'MMM dd, HH:mm')}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={campaign.status === 'live' ? 'default' : 'secondary'} className="capitalize">
            {campaign.status?.replace(/_/g, ' ')}
          </Badge>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Filters */}
        <DashboardFilters
            platforms={filterOptions.platforms}
            markets={filterOptions.markets}
            phases={filterOptions.phases}
            objectives={filterOptions.objectives}
            optimizationGoals={filterOptions.optimizationGoals}
            selectedPlatforms={selectedPlatforms}
            selectedMarkets={selectedMarkets}
            selectedPhases={selectedPhases}
            selectedObjective={selectedObjective}
            selectedOptimizationGoal={selectedOptimizationGoal}
            dateRange={dateRange}
            granularity={granularity}
            onPlatformToggle={handlePlatformToggle}
            onMarketToggle={handleMarketToggle}
            onPhaseToggle={handlePhaseToggle}
            onObjectiveChange={setSelectedObjective}
            onOptimizationGoalChange={setSelectedOptimizationGoal}
            onDateRangeChange={setDateRange}
            onGranularityChange={setGranularity}
            onClearFilters={handleClearFilters}
          />

          {!hasData ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No performance data yet</p>
                <p className="text-muted-foreground mb-4">
                  Push your campaign to DSP first to see performance metrics
                </p>
                <Button onClick={() => navigate(`/actiplans/${campaignId}/launch`)}>
                  Go to Launch Status
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* KPI Scorecards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricScorecard
              title="Budget / Spend"
              planned={metrics.planned.budget}
              actual={metrics.actual.spend}
              prefix="€"
              invertVariance
              icon={<Wallet className="h-4 w-4" />}
              accentColor="green"
            />
            <MetricScorecard
              title="Impressions"
              planned={metrics.planned.impressions}
              actual={metrics.actual.impressions}
              icon={<Eye className="h-4 w-4" />}
              accentColor="blue"
            />
            <MetricScorecard
              title="Reach"
              planned={metrics.planned.reach}
              actual={metrics.actual.reach}
              icon={<Users className="h-4 w-4" />}
              accentColor="purple"
            />
            <MetricScorecard
              title="Clicks"
              planned={metrics.planned.clicks}
              actual={metrics.actual.clicks}
              icon={<MousePointerClick className="h-4 w-4" />}
              accentColor="orange"
            />
            <MetricScorecard
              title="Conversions"
              planned={metrics.planned.conversions}
              actual={metrics.actual.conversions}
              icon={<Target className="h-4 w-4" />}
              accentColor="pink"
            />
          </div>

          {/* Efficiency Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-background to-muted/20 border-none shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">CTR</p>
                <p className="text-2xl font-bold text-blue-500">{metrics.actual.ctr.toFixed(2)}%</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-background to-muted/20 border-none shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">CPM</p>
                <p className="text-2xl font-bold text-emerald-500">€{metrics.actual.cpm.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-background to-muted/20 border-none shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">CPC</p>
                <p className="text-2xl font-bold text-purple-500">€{metrics.actual.cpc.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-background to-muted/20 border-none shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Frequency</p>
                <p className="text-2xl font-bold text-orange-500">{metrics.actual.frequency.toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Funnel Analysis */}
          {campaign && (
            <FunnelAnalysisChart
              campaign={campaign}
              insights={filteredData.insights}
              actualMetrics={{
                reach: metrics.actual.reach,
                impressions: metrics.actual.impressions,
                clicks: metrics.actual.clicks,
                spend: metrics.actual.spend,
              }}
            />
          )}

          <Separator />

          {/* Actual vs Planned Section */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Actual vs Planned</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TimeSeriesChart
                title="Reach & CPR"
                data={timeSeriesData}
                metricOptions={actualVsPlannedReachMetrics}
                defaultMetrics={['actualReach', 'plannedReach', 'cpm']}
              />
              <TimeSeriesChart
                title="Impressions & CPM"
                data={timeSeriesData}
                metricOptions={actualVsPlannedImpressionsMetrics}
                defaultMetrics={['actualImpressions', 'plannedImpressions', 'cpm']}
              />
              <BudgetPacingChart
                data={timeSeriesData}
                totalPlannedBudget={metrics.planned.budget}
              />
            </div>
          </div>

          <Separator />

          {/* Coverage Evolution Section */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Coverage Evolution</h2>
            <CoverageEvolutionChart data={timeSeriesData} />
          </div>

          <Separator />

          {/* Performance Evolution Section */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Performance Evolution</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TimeSeriesChart
                title="Reach, Frequency & Impressions"
                data={timeSeriesData}
                metricOptions={performanceMetrics1}
                defaultMetrics={['reach', 'impressions', 'frequency']}
              />
              <TimeSeriesChart
                title="CTR, CPC & Clicks"
                data={timeSeriesData}
                metricOptions={performanceMetrics2}
                defaultMetrics={['clicks', 'ctr', 'cpc']}
              />
              <TimeSeriesChart
                title="Results & Cost Per Result"
                data={timeSeriesData}
                metricOptions={performanceMetrics3}
                defaultMetrics={['results', 'resultRate', 'costPerResult']}
              />
            </div>
          </div>

          <Separator />

          {/* Performance Breakdowns Section */}
          <DimensionBreakdownChart data={timeSeriesData} />

          <Separator />

          {/* Cost & Rate Metrics Comparison */}
          <MetricComparisonChart 
            data={timeSeriesData} 
            plannedMetrics={{
              cpm: metrics.planned.impressions > 0 ? (metrics.planned.budget / metrics.planned.impressions) * 1000 : 0,
              cpr: metrics.planned.reach > 0 ? (metrics.planned.budget / metrics.planned.reach) * 1000 : 0,
              sov: 15, // Target 15% SOV
              frequency: metrics.planned.reach > 0 ? metrics.planned.impressions / metrics.planned.reach : 0,
              ctr: metrics.planned.impressions > 0 ? (metrics.planned.clicks / metrics.planned.impressions) * 100 : 0,
              cpc: metrics.planned.clicks > 0 ? metrics.planned.budget / metrics.planned.clicks : 0,
              costPerResult: metrics.planned.conversions > 0 ? metrics.planned.budget / metrics.planned.conversions : 0,
              resultRate: metrics.planned.clicks > 0 ? (metrics.planned.conversions / metrics.planned.clicks) * 100 : 0,
            }}
          />

          <Separator />

          {/* Platform Comparison */}
          <PlatformComparisonSection data={platformData} />

          <Separator />

          {/* Market Comparison */}
          <MarketComparisonSection data={marketData} />

          <Separator />

          {/* Detailed Table */}
          <PerformanceTable
            data={platformBreakdown}
            title="Performance by Platform & Market"
          />
            </>
          )}
        </div>
    </div>
  );
}
