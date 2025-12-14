import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Loader2, ArrowLeft, Sparkles, BarChart3, TrendingUp, 
  Target, Lightbulb, AlertCircle, ChevronDown, Play
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LockedFeatureButton } from "@/components/ui/locked-feature-button";

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_budget: number;
  start_date: string;
  end_date: string;
  objective: string;
  platforms?: any;
}

interface ConnectedPlatform {
  id: string;
  platform_type: string;
  platform_name: string;
  ad_account_id: string | null;
  ad_account_name: string | null;
}

const TIME_COMPARISON_PRESETS = [
  { value: 'week_vs_prev_week', label: 'This Week vs Previous Week' },
  { value: 'month_vs_prev_month', label: 'This Month vs Previous Month' },
  { value: 'quarter_vs_prev_quarter', label: 'This Quarter vs Previous Quarter' },
  { value: 'month_vs_last_year', label: 'This Month vs Same Month Last Year' },
  { value: 'quarter_vs_last_year', label: 'This Quarter vs Same Quarter Last Year' },
  { value: 'ytd_vs_last_year', label: 'Year to Date vs Same Period Last Year' },
  { value: 'last_7_days', label: 'Last 7 Days vs Previous 7 Days' },
  { value: 'last_14_days', label: 'Last 14 Days vs Previous 14 Days' },
  { value: 'last_30_days', label: 'Last 30 Days vs Previous 30 Days' },
];

const BREAKDOWN_DIMENSIONS = [
  { value: 'age', label: 'Age' },
  { value: 'gender', label: 'Gender' },
  { value: 'country', label: 'Location (Country)' },
  { value: 'region', label: 'Location (Region)' },
  { value: 'device_platform', label: 'Device' },
  { value: 'placement', label: 'Placement' },
  { value: 'publisher_platform', label: 'Publisher Platform' },
];

export default function InsightsRecommendations() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tier, hasAccess } = useFeatureAccess();
  
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [connectedPlatforms, setConnectedPlatforms] = useState<ConnectedPlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  
  // Selection states
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [timeComparison, setTimeComparison] = useState('week_vs_prev_week');
  const [selectedBreakdowns, setSelectedBreakdowns] = useState<string[]>(['age', 'gender']);
  
  // Results
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [rawData, setRawData] = useState<any>(null);
  const [configOpen, setConfigOpen] = useState(true);

  // Feature access checks
  const canAccessCrossPlatform = hasAccess('cross_platform_insights' as any) || 
    tier === 'enterprise' || tier === 'agency';

  useEffect(() => {
    loadData();
  }, [user, campaignId]);

  const loadData = async () => {
    if (!user) return;
    
    try {
      const [campaignsRes, platformsRes] = await Promise.all([
        supabase
          .from('campaigns')
          .select('id, name, status, total_budget, start_date, end_date, objective, platforms')
          .eq('user_id', user.id)
          .in('status', ['pushed_to_dsp', 'live', 'partially_pushed', 'approved', 'ready_for_push'])
          .order('created_at', { ascending: false }),
        supabase
          .from('connected_platforms')
          .select('id, platform_type, platform_name, ad_account_id, ad_account_name')
          .eq('user_id', user.id)
          .eq('is_active', true)
      ]);

      if (campaignsRes.data) {
        setCampaigns(campaignsRes.data);
        
        // If campaignId provided, pre-select it
        if (campaignId) {
          const currentCampaign = campaignsRes.data.find(c => c.id === campaignId);
          if (currentCampaign) {
            setCampaign(currentCampaign);
            setSelectedCampaignIds([campaignId]);
          }
        }
      }
      
      if (platformsRes.data) {
        setConnectedPlatforms(platformsRes.data);
        // Pre-select all platforms
        const uniquePlatforms = [...new Set(platformsRes.data.map(p => p.platform_type))];
        setSelectedPlatforms(uniquePlatforms);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const toggleCampaign = (id: string) => {
    setSelectedCampaignIds(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    );
  };

  const toggleBreakdown = (breakdown: string) => {
    setSelectedBreakdowns(prev =>
      prev.includes(breakdown) ? prev.filter(b => b !== breakdown) : [...prev, breakdown]
    );
  };

  // Filter campaigns based on platform selection (for non-cross-platform tiers)
  const filteredCampaigns = useMemo(() => {
    if (canAccessCrossPlatform) return campaigns;
    
    // For basic/freelancer, only show campaigns that have selected platforms
    return campaigns.filter(c => {
      const campaignPlatforms = c.platforms?.map((p: any) => 
        (p.type || p.name || '').toLowerCase()
      ) || [];
      return selectedPlatforms.some(sp => 
        campaignPlatforms.includes(sp.toLowerCase())
      );
    });
  }, [campaigns, selectedPlatforms, canAccessCrossPlatform]);

  const runAnalysis = async () => {
    if (selectedCampaignIds.length === 0) {
      toast.error('Please select at least one campaign');
      return;
    }
    
    if (selectedPlatforms.length === 0) {
      toast.error('Please select at least one platform');
      return;
    }

    if (selectedBreakdowns.length === 0) {
      toast.error('Please select at least one breakdown dimension');
      return;
    }

    setAnalyzing(true);
    setAnalysisResult(null);
    setConfigOpen(false);

    try {
      const { data, error } = await supabase.functions.invoke('insights-recommendations', {
        body: {
          campaignIds: selectedCampaignIds,
          platforms: selectedPlatforms,
          timeComparison,
          breakdowns: selectedBreakdowns,
          crossPlatformEnabled: canAccessCrossPlatform,
          useSampleData: true // Always use sample data for now
        }
      });

      if (error) throw error;

      setAnalysisResult(data.analysis);
      setRawData(data.rawData);
      toast.success('Analysis complete!');
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast.error('Failed to run analysis: ' + error.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const availablePlatforms = useMemo(() => {
    return [...new Set(connectedPlatforms.map(p => p.platform_type))];
  }, [connectedPlatforms]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4 max-w-7xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/app')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Insights & Recommendations
            </h1>
            <p className="text-muted-foreground">
              AI-powered performance analysis and optimization suggestions
            </p>
          </div>
        </div>

        {/* Tier Badge */}
        <div className="mb-6">
          {canAccessCrossPlatform ? (
            <Badge className="bg-gradient-to-r from-primary to-purple-600 text-primary-foreground">
              Cross-Platform Analysis Enabled
            </Badge>
          ) : (
            <Badge variant="secondary">
              Single Platform Analysis 
              <span className="ml-2 text-xs opacity-70">
                (Upgrade to Enterprise for cross-platform)
              </span>
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Panel */}
          <div className="lg:col-span-1">
            <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
              <Card>
                <CardHeader className="pb-3">
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <CardTitle className="text-lg">Analysis Configuration</CardTitle>
                    <ChevronDown className={`h-5 w-5 transition-transform ${configOpen ? '' : '-rotate-90'}`} />
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-6">
                    {/* Platform Selection */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Platforms</Label>
                      <div className="space-y-2">
                        {availablePlatforms.map(platform => (
                          <div key={platform} className="flex items-center space-x-2">
                            <Checkbox
                              id={`platform-${platform}`}
                              checked={selectedPlatforms.includes(platform)}
                              onCheckedChange={() => togglePlatform(platform)}
                            />
                            <label htmlFor={`platform-${platform}`} className="text-sm capitalize cursor-pointer">
                              {platform === 'meta' ? 'Meta (Facebook/Instagram)' : platform}
                            </label>
                          </div>
                        ))}
                      </div>
                      {!canAccessCrossPlatform && selectedPlatforms.length > 1 && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Analysis limited to single platform on your plan
                        </p>
                      )}
                    </div>

                    <Separator />

                    {/* Campaign Selection */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">
                        Campaigns ({selectedCampaignIds.length} selected)
                      </Label>
                      <ScrollArea className="h-48 border rounded-md p-2">
                        <div className="space-y-2">
                          {filteredCampaigns.map(c => (
                            <div key={c.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`campaign-${c.id}`}
                                checked={selectedCampaignIds.includes(c.id)}
                                onCheckedChange={() => toggleCampaign(c.id)}
                                disabled={
                                  !canAccessCrossPlatform && 
                                  selectedCampaignIds.length > 0 && 
                                  !selectedCampaignIds.includes(c.id)
                                }
                              />
                              <label 
                                htmlFor={`campaign-${c.id}`} 
                                className="text-sm cursor-pointer flex-1 truncate"
                              >
                                {c.name}
                              </label>
                              <Badge variant="outline" className="text-xs">
                                {c.status}
                              </Badge>
                            </div>
                          ))}
                          {filteredCampaigns.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No campaigns found for selected platforms
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                      {!canAccessCrossPlatform && (
                        <p className="text-xs text-muted-foreground">
                          Single campaign analysis only. Upgrade for multi-campaign comparison.
                        </p>
                      )}
                    </div>

                    <Separator />

                    {/* Time Comparison */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Time Comparison</Label>
                      <Select value={timeComparison} onValueChange={setTimeComparison}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_COMPARISON_PRESETS.map(preset => (
                            <SelectItem key={preset.value} value={preset.value}>
                              {preset.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    {/* Breakdown Dimensions */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Analysis Dimensions</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {BREAKDOWN_DIMENSIONS.map(dim => (
                          <div key={dim.value} className="flex items-center space-x-2">
                            <Checkbox
                              id={`breakdown-${dim.value}`}
                              checked={selectedBreakdowns.includes(dim.value)}
                              onCheckedChange={() => toggleBreakdown(dim.value)}
                            />
                            <label 
                              htmlFor={`breakdown-${dim.value}`} 
                              className="text-xs cursor-pointer"
                            >
                              {dim.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Run Analysis Button */}
                    <Button 
                      className="w-full" 
                      onClick={runAnalysis}
                      disabled={analyzing || selectedCampaignIds.length === 0}
                    >
                      {analyzing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Run Analysis
                        </>
                      )}
                    </Button>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-2">
            {analyzing ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                  <p className="text-lg font-medium">Analyzing Performance Data...</p>
                  <p className="text-sm text-muted-foreground">
                    Fetching insights and generating recommendations
                  </p>
                </CardContent>
              </Card>
            ) : analysisResult ? (
              <div className="space-y-6">
                {/* Analysis Result */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-yellow-500" />
                      AI Analysis Results
                    </CardTitle>
                    <CardDescription>
                      {canAccessCrossPlatform 
                        ? 'Cross-platform performance analysis and recommendations'
                        : 'Single platform performance analysis'
                      }
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <div dangerouslySetInnerHTML={{ 
                        __html: analysisResult
                          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\n---\n/g, '<hr />')
                          .replace(/\n/g, '<br />')
                          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                          .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                          .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                      }} />
                    </div>
                  </CardContent>
                </Card>

                {/* Raw Data Summary */}
                {rawData && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Data Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-muted/50 rounded-lg">
                          <p className="text-2xl font-bold">{rawData.totalSpend?.toLocaleString() || '0'}</p>
                          <p className="text-xs text-muted-foreground">Total Spend</p>
                        </div>
                        <div className="text-center p-3 bg-muted/50 rounded-lg">
                          <p className="text-2xl font-bold">{rawData.totalResults?.toLocaleString() || '0'}</p>
                          <p className="text-xs text-muted-foreground">Total Results</p>
                        </div>
                        <div className="text-center p-3 bg-muted/50 rounded-lg">
                          <p className="text-2xl font-bold">${rawData.avgCPR?.toFixed(2) || '0.00'}</p>
                          <p className="text-xs text-muted-foreground">Avg Cost per Result</p>
                        </div>
                        <div className="text-center p-3 bg-muted/50 rounded-lg">
                          <p className="text-2xl font-bold">{rawData.avgResultRate?.toFixed(2) || '0.00'}%</p>
                          <p className="text-xs text-muted-foreground">Avg Result Rate</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Sparkles className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Ready to Analyze</h3>
                  <p className="text-muted-foreground max-w-md">
                    Select your campaigns, platforms, time period, and dimensions, 
                    then click "Run Analysis" to generate AI-powered insights and recommendations.
                  </p>
                  {!canAccessCrossPlatform && (
                    <div className="mt-6 p-4 border rounded-lg bg-muted/30 max-w-md">
                      <p className="text-sm text-muted-foreground mb-3">
                        <strong>Upgrade to Enterprise</strong> to unlock cross-platform comparison 
                        and analyze campaigns across Meta, TikTok, and more simultaneously.
                      </p>
                      <Button 
                        variant="outline"
                        onClick={() => navigate('/settings/plans')}
                      >
                        Upgrade for Cross-Platform
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
