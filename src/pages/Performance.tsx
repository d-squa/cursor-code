import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, ArrowLeft, RefreshCcw } from "lucide-react";
import { format, eachWeekOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Campaign {
  id: string;
  name: string;
  platforms: any[];
  start_date: string;
  end_date: string;
  total_budget: number;
  forecast_data?: any;
  status: string;
}

interface PerformanceMetrics {
  reach: number;
  impressions: number;
  spend: number;
  cpm: number;
  frequency: number;
}

interface WeeklyData {
  week: string;
  plannedReach: number;
  actualReach: number;
  plannedImpressions: number;
  actualImpressions: number;
  plannedSpend: number;
  actualSpend: number;
}

export default function Performance() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedAdSet, setSelectedAdSet] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [actualMetrics, setActualMetrics] = useState<PerformanceMetrics | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);

  useEffect(() => {
    if (user) {
      loadCampaigns();
    }
  }, [user]);

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
      loadActualMetrics();
    }
  }, [selectedCampaign, selectedPlatform, selectedAdSet]);

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("status", "live")
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
      // TODO: Call Meta Insights API to get actual performance data
      // For now, simulate with random data
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const plannedMetrics = selectedCampaign.forecast_data?.totalMetrics || {};
      
      // Simulate actual metrics (80-120% of planned)
      const variance = () => 0.8 + Math.random() * 0.4;
      setActualMetrics({
        reach: Math.round((plannedMetrics.reach || 0) * variance()),
        impressions: Math.round((plannedMetrics.impressions || 0) * variance()),
        spend: Math.round((selectedCampaign.total_budget || 0) * variance() * 100) / 100,
        cpm: Math.round(((plannedMetrics.cpm || 0) * variance()) * 100) / 100,
        frequency: Math.round(((plannedMetrics.frequency || 2) * variance()) * 100) / 100,
      });

      // Generate weekly data
      generateWeeklyData();
    } catch (error: any) {
      console.error("Error loading metrics:", error);
      toast.error("Failed to load performance metrics");
    } finally {
      setMetricsLoading(false);
    }
  };

  const generateWeeklyData = () => {
    if (!selectedCampaign) return;

    const weeks = eachWeekOfInterval({
      start: new Date(selectedCampaign.start_date),
      end: new Date(selectedCampaign.end_date),
    });

    const plannedMetrics = selectedCampaign.forecast_data?.totalMetrics || {};
    const weekCount = weeks.length;
    
    const weeklyPlanned = {
      reach: Math.round((plannedMetrics.reach || 0) / weekCount),
      impressions: Math.round((plannedMetrics.impressions || 0) / weekCount),
      spend: Math.round((selectedCampaign.total_budget || 0) / weekCount * 100) / 100,
    };

    const data: WeeklyData[] = weeks.map((weekStart, idx) => {
      const variance = () => 0.8 + Math.random() * 0.4;
      const weekEnd = endOfWeek(weekStart);
      
      return {
        week: `Week ${idx + 1}\n${format(weekStart, "MMM d")}`,
        plannedReach: weeklyPlanned.reach,
        actualReach: Math.round(weeklyPlanned.reach * variance()),
        plannedImpressions: weeklyPlanned.impressions,
        actualImpressions: Math.round(weeklyPlanned.impressions * variance()),
        plannedSpend: weeklyPlanned.spend,
        actualSpend: Math.round(weeklyPlanned.spend * variance() * 100) / 100,
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      <div className="container mx-auto py-6 space-y-6">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <MetricCard
                    title="Reach"
                    planned={plannedMetrics?.reach}
                    actual={actualMetrics.reach}
                  />
                  <MetricCard
                    title="Impressions"
                    planned={plannedMetrics?.impressions}
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
                    planned={plannedMetrics?.cpm}
                    actual={actualMetrics.cpm}
                    prefix="$"
                  />
                  <MetricCard
                    title="Frequency"
                    planned={plannedMetrics?.frequency || 2}
                    actual={actualMetrics.frequency}
                  />
                </div>

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
  );
}
