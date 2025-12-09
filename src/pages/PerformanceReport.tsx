import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Loader2, ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
  Target, DollarSign, Eye, Users, BarChart3
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, Cell
} from "recharts";

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_budget: number;
  start_date: string;
  end_date: string;
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
  weekly_metrics: any;
  fetched_at: string;
}

interface MetricSummary {
  planned: number;
  actual: number;
  variance: number;
  variancePercent: number;
}

export default function PerformanceReport() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [launchStatuses, setLaunchStatuses] = useState<LaunchStatusEntry[]>([]);
  const [insights, setInsights] = useState<CampaignInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!campaignId || !user) return;
    
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
      if (statusData) setLaunchStatuses(statusData);
      if (insightsData) setInsights(insightsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, [campaignId, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // Calculate totals from launch statuses (planned) and insights (actual)
  const calculateMetrics = () => {
    const planned = {
      budget: launchStatuses.reduce((sum, s) => sum + (s.planned_budget || 0), 0),
      impressions: launchStatuses.reduce((sum, s) => sum + (s.planned_impressions || 0), 0),
      reach: launchStatuses.reduce((sum, s) => sum + (s.planned_reach || 0), 0),
      clicks: launchStatuses.reduce((sum, s) => sum + (s.planned_clicks || 0), 0),
      conversions: launchStatuses.reduce((sum, s) => sum + (s.planned_conversions || 0), 0),
    };

    // Aggregate actual metrics from insights
    const actual = insights.reduce((acc, insight) => {
      const metrics = insight.metrics || {};
      return {
        spend: acc.spend + (metrics.spend || 0),
        impressions: acc.impressions + (metrics.impressions || 0),
        reach: acc.reach + (metrics.reach || 0),
        clicks: acc.clicks + (metrics.clicks || 0),
        conversions: acc.conversions + (metrics.conversions || metrics.results || 0),
      };
    }, { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0 });

    return { planned, actual };
  };

  const { planned, actual } = calculateMetrics();

  const createMetricSummary = (plannedVal: number, actualVal: number): MetricSummary => {
    const variance = actualVal - plannedVal;
    const variancePercent = plannedVal > 0 ? ((actualVal - plannedVal) / plannedVal) * 100 : 0;
    return { planned: plannedVal, actual: actualVal, variance, variancePercent };
  };

  const metrics = {
    budget: createMetricSummary(planned.budget, actual.spend),
    impressions: createMetricSummary(planned.impressions, actual.impressions),
    reach: createMetricSummary(planned.reach, actual.reach),
    clicks: createMetricSummary(planned.clicks, actual.clicks),
    conversions: createMetricSummary(planned.conversions, actual.conversions),
  };

  // Group by platform for breakdown
  const platformBreakdown = launchStatuses.reduce((acc, status) => {
    if (!acc[status.platform]) {
      acc[status.platform] = {
        planned: { budget: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0 },
        actual: { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0 },
        markets: new Set<string>(),
        liveCount: 0,
        totalCount: 0
      };
    }
    
    acc[status.platform].planned.budget += status.planned_budget || 0;
    acc[status.platform].planned.impressions += status.planned_impressions || 0;
    acc[status.platform].planned.reach += status.planned_reach || 0;
    acc[status.platform].planned.clicks += status.planned_clicks || 0;
    acc[status.platform].planned.conversions += status.planned_conversions || 0;
    acc[status.platform].markets.add(status.market);
    acc[status.platform].totalCount++;
    if (status.status === 'live') acc[status.platform].liveCount++;
    
    return acc;
  }, {} as Record<string, any>);

  // Add actual metrics from insights to platform breakdown
  insights.forEach(insight => {
    if (platformBreakdown[insight.platform]) {
      const m = insight.metrics || {};
      platformBreakdown[insight.platform].actual.spend += m.spend || 0;
      platformBreakdown[insight.platform].actual.impressions += m.impressions || 0;
      platformBreakdown[insight.platform].actual.reach += m.reach || 0;
      platformBreakdown[insight.platform].actual.clicks += m.clicks || 0;
      platformBreakdown[insight.platform].actual.conversions += m.conversions || m.results || 0;
    }
  });

  // Chart data
  const comparisonChartData = [
    { name: 'Budget/Spend', planned: planned.budget, actual: actual.spend },
    { name: 'Impressions', planned: planned.impressions / 1000, actual: actual.impressions / 1000 },
    { name: 'Reach', planned: planned.reach / 1000, actual: actual.reach / 1000 },
    { name: 'Clicks', planned: planned.clicks, actual: actual.clicks },
  ];

  const platformChartData = Object.entries(platformBreakdown).map(([platform, data]: [string, any]) => ({
    platform,
    plannedSpend: data.planned.budget,
    actualSpend: data.actual.spend,
    plannedImpressions: data.planned.impressions / 1000,
    actualImpressions: data.actual.impressions / 1000,
  }));

  // Calculate overall pacing
  const campaignProgress = campaign ? (() => {
    const start = new Date(campaign.start_date).getTime();
    const end = new Date(campaign.end_date).getTime();
    const now = Date.now();
    const elapsed = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
    return elapsed;
  })() : 0;

  const spendPacing = planned.budget > 0 ? (actual.spend / planned.budget) * 100 : 0;
  const isPacingAhead = spendPacing > campaignProgress;

  const MetricCard = ({ 
    title, 
    icon: Icon, 
    metric, 
    prefix = "", 
    suffix = "",
    invertVariance = false 
  }: { 
    title: string; 
    icon: any; 
    metric: MetricSummary; 
    prefix?: string; 
    suffix?: string;
    invertVariance?: boolean;
  }) => {
    const isPositive = invertVariance ? metric.variancePercent < 0 : metric.variancePercent >= 0;
    
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Planned</p>
                <p className="text-lg font-semibold">{prefix}{metric.planned.toLocaleString()}{suffix}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Actual</p>
                <p className="text-lg font-semibold">{prefix}{metric.actual.toLocaleString()}{suffix}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {metric.variancePercent >= 0 ? '+' : ''}{metric.variancePercent.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">
                ({prefix}{Math.abs(metric.variance).toLocaleString()}{suffix} {metric.variance >= 0 ? 'above' : 'below'})
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

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
  const hasInsights = insights.length > 0;
  const lastFetched = insights[0]?.fetched_at;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/actiplans')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            Performance Report · {format(new Date(campaign.start_date), 'MMM dd')} - {format(new Date(campaign.end_date), 'MMM dd, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={campaign.status === 'live' ? 'default' : 'secondary'}>
            {campaign.status}
          </Badge>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </div>

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
          {/* Pacing Overview */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Campaign Pacing</CardTitle>
                  <CardDescription>
                    {lastFetched && `Last updated: ${format(new Date(lastFetched), 'MMM dd, yyyy HH:mm')}`}
                  </CardDescription>
                </div>
                <Badge variant={isPacingAhead ? 'destructive' : 'default'}>
                  {isPacingAhead ? 'Over Pacing' : 'On Track'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Campaign Timeline</span>
                    <span>{campaignProgress.toFixed(0)}% elapsed</span>
                  </div>
                  <Progress value={campaignProgress} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Budget Spend</span>
                    <span>{spendPacing.toFixed(0)}% spent (€{actual.spend.toLocaleString()} / €{planned.budget.toLocaleString()})</span>
                  </div>
                  <Progress value={Math.min(100, spendPacing)} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPI Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <MetricCard 
              title="Budget / Spend" 
              icon={DollarSign} 
              metric={metrics.budget} 
              prefix="€"
              invertVariance={true}
            />
            <MetricCard 
              title="Impressions" 
              icon={Eye} 
              metric={metrics.impressions} 
            />
            <MetricCard 
              title="Reach" 
              icon={Users} 
              metric={metrics.reach} 
            />
            <MetricCard 
              title="Clicks" 
              icon={Target} 
              metric={metrics.clicks} 
            />
            <MetricCard 
              title="Conversions" 
              icon={TrendingUp} 
              metric={metrics.conversions} 
            />
          </div>

          {/* Charts */}
          <Tabs defaultValue="comparison" className="mb-6">
            <TabsList>
              <TabsTrigger value="comparison">Planned vs Actual</TabsTrigger>
              <TabsTrigger value="platform">Platform Breakdown</TabsTrigger>
            </TabsList>

            <TabsContent value="comparison">
              <Card>
                <CardHeader>
                  <CardTitle>Planned vs Actual Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparisonChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--popover))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                        <Bar dataKey="planned" name="Planned" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="actual" name="Actual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="platform">
              <Card>
                <CardHeader>
                  <CardTitle>Platform Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={platformChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" className="text-xs" />
                        <YAxis type="category" dataKey="platform" className="text-xs" width={80} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--popover))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                        <Bar dataKey="plannedSpend" name="Planned Spend (€)" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="actualSpend" name="Actual Spend (€)" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Platform Details */}
          <Card>
            <CardHeader>
              <CardTitle>Platform Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(platformBreakdown).map(([platform, data]: [string, any]) => (
                  <div key={platform} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="font-semibold">{platform}</h4>
                        <p className="text-sm text-muted-foreground">
                          {data.markets.size} market(s) · {data.liveCount}/{data.totalCount} live
                        </p>
                      </div>
                      <Badge variant={data.liveCount === data.totalCount ? 'default' : 'secondary'}>
                        {data.liveCount === data.totalCount ? 'All Live' : `${data.liveCount} Live`}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Spend</p>
                        <p className="font-medium">€{data.actual.spend.toLocaleString()} / €{data.planned.budget.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Impressions</p>
                        <p className="font-medium">{data.actual.impressions.toLocaleString()} / {data.planned.impressions.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Reach</p>
                        <p className="font-medium">{data.actual.reach.toLocaleString()} / {data.planned.reach.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Clicks</p>
                        <p className="font-medium">{data.actual.clicks.toLocaleString()} / {data.planned.clicks.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Conversions</p>
                        <p className="font-medium">{data.actual.conversions.toLocaleString()} / {data.planned.conversions.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
