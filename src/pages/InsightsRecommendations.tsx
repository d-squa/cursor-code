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
  Target, Lightbulb, AlertCircle, ChevronDown, Play,
  Save, Mail, History, Trash2, Lock, Users
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LockedFeatureButton } from "@/components/ui/locked-feature-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

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

interface SavedAnalysis {
  id: string;
  campaign_name: string;
  platforms: string[];
  breakdowns: string[];
  time_comparison: string;
  analysis_result: string;
  raw_data: any;
  created_at: string;
}

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
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
  const [saving, setSaving] = useState(false);
  
  // Selection states
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [timeComparison, setTimeComparison] = useState('week_vs_prev_week');
  const [selectedBreakdowns, setSelectedBreakdowns] = useState<string[]>(['age', 'gender']);
  
  // Results
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [rawData, setRawData] = useState<any>(null);
  const [configOpen, setConfigOpen] = useState(true);
  
  // Saved analyses
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('new');
  const [todaySaveCount, setTodaySaveCount] = useState(0);
  
  // Email dialog
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Feature access checks
  const canAccessCrossPlatform = hasAccess('cross_platform_insights' as any) || 
    tier === 'enterprise' || tier === 'agency';
  const canSaveUnlimited = hasAccess('unlimited_insights_saves' as any) || 
    tier === 'enterprise' || tier === 'agency';
  const canShareEmail = hasAccess('share_insights_email' as any) || 
    tier === 'enterprise' || tier === 'agency';
  
  // Daily save limit for basic/freelancer
  const dailySaveLimit = canSaveUnlimited ? Infinity : 1;
  const canSaveMore = canSaveUnlimited || todaySaveCount < dailySaveLimit;

  useEffect(() => {
    loadData();
  }, [user, campaignId]);

  const loadData = async () => {
    if (!user) return;
    
    try {
      const [campaignsRes, platformsRes, savedRes] = await Promise.all([
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
          .eq('is_active', true),
        supabase
          .from('saved_insights_analyses')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
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
      
      if (savedRes.data) {
        setSavedAnalyses(savedRes.data as SavedAnalysis[]);
        
        // Count today's saves
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCount = savedRes.data.filter(s => 
          new Date(s.created_at) >= today
        ).length;
        setTodaySaveCount(todayCount);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadTeamMembers = async () => {
    if (!user) return;
    
    try {
      // Get user's team memberships
      const { data: roles } = await supabase
        .from('user_roles')
        .select('team_id')
        .eq('user_id', user.id);
      
      if (!roles || roles.length === 0) return;
      
      const teamIds = roles.map(r => r.team_id).filter(Boolean);
      if (teamIds.length === 0) return;
      
      // Get all team members from those teams
      const { data: teamRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('team_id', teamIds);
      
      if (!teamRoles) return;
      
      const userIds = [...new Set(teamRoles.map(r => r.user_id).filter(id => id !== user.id))];
      if (userIds.length === 0) return;
      
      // Get profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);
      
      if (profiles) {
        setTeamMembers(profiles);
      }
    } catch (error) {
      console.error('Error loading team members:', error);
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

  const toggleRecipient = (email: string) => {
    setSelectedRecipients(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
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

  const saveAnalysis = async () => {
    if (!analysisResult || !user) return;
    
    if (!canSaveMore) {
      toast.error('Daily save limit reached. Upgrade to Enterprise for unlimited saves.');
      return;
    }

    setSaving(true);
    try {
      const selectedCampaign = campaigns.find(c => selectedCampaignIds.includes(c.id));
      const campaignName = selectedCampaign?.name || 'Multiple Campaigns';

      const { error } = await supabase
        .from('saved_insights_analyses')
        .insert({
          user_id: user.id,
          campaign_id: selectedCampaignIds.length === 1 ? selectedCampaignIds[0] : null,
          campaign_name: campaignName,
          platforms: selectedPlatforms,
          breakdowns: selectedBreakdowns,
          time_comparison: timeComparison,
          analysis_result: analysisResult,
          raw_data: rawData
        });

      if (error) throw error;

      toast.success('Analysis saved successfully!');
      setTodaySaveCount(prev => prev + 1);
      
      // Reload saved analyses
      const { data: savedRes } = await supabase
        .from('saved_insights_analyses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (savedRes) {
        setSavedAnalyses(savedRes as SavedAnalysis[]);
      }
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error('Failed to save analysis: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteSavedAnalysis = async (id: string) => {
    try {
      const { error } = await supabase
        .from('saved_insights_analyses')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setSavedAnalyses(prev => prev.filter(a => a.id !== id));
      toast.success('Analysis deleted');
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Failed to delete analysis');
    }
  };

  const loadSavedAnalysis = (analysis: SavedAnalysis) => {
    setAnalysisResult(analysis.analysis_result);
    setRawData(analysis.raw_data);
    setSelectedPlatforms(analysis.platforms);
    setSelectedBreakdowns(analysis.breakdowns);
    setTimeComparison(analysis.time_comparison);
    setActiveTab('new');
    setConfigOpen(false);
  };

  const openEmailDialog = () => {
    loadTeamMembers();
    setSelectedRecipients([]);
    setEmailDialogOpen(true);
  };

  const sendEmail = async () => {
    if (selectedRecipients.length === 0) {
      toast.error('Please select at least one recipient');
      return;
    }

    if (!analysisResult) return;

    setSendingEmail(true);
    try {
      const selectedCampaign = campaigns.find(c => selectedCampaignIds.includes(c.id));
      const campaignName = selectedCampaign?.name || 'Multiple Campaigns';

      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', user?.id)
        .single();

      const { error } = await supabase.functions.invoke('send-insights-email', {
        body: {
          recipientEmails: selectedRecipients,
          campaignName,
          platforms: selectedPlatforms,
          analysisResult,
          senderName: profile?.full_name || profile?.email || 'Team Member'
        }
      });

      if (error) throw error;

      toast.success('Insights shared successfully!');
      setEmailDialogOpen(false);
    } catch (error: any) {
      console.error('Email error:', error);
      toast.error('Failed to send email: ' + error.message);
    } finally {
      setSendingEmail(false);
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
        <div className="mb-6 flex items-center gap-2">
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
          {!canSaveUnlimited && (
            <Badge variant="outline">
              {dailySaveLimit - todaySaveCount} save{dailySaveLimit - todaySaveCount !== 1 ? 's' : ''} remaining today
            </Badge>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="new">New Analysis</TabsTrigger>
            <TabsTrigger value="saved">
              Saved Analyses ({savedAnalyses.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="saved">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Saved Analyses
                </CardTitle>
                <CardDescription>
                  View and manage your previously saved insights analyses
                </CardDescription>
              </CardHeader>
              <CardContent>
                {savedAnalyses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>No saved analyses yet</p>
                    <p className="text-sm">Run an analysis and save it to see it here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedAnalyses.map(analysis => (
                      <div 
                        key={analysis.id} 
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{analysis.campaign_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {analysis.platforms.map(p => (
                              <Badge key={p} variant="outline" className="text-xs">
                                {p === 'meta' ? 'Meta' : p}
                              </Badge>
                            ))}
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(analysis.created_at), 'MMM dd, yyyy HH:mm')}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Breakdowns: {analysis.breakdowns.join(', ')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => loadSavedAnalysis(analysis)}
                          >
                            View
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => deleteSavedAnalysis(analysis.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="new">
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
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={saveAnalysis}
                        disabled={saving || !canSaveMore}
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Analysis
                      </Button>
                      
                      {canShareEmail ? (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={openEmailDialog}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Share via Email
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm"
                          disabled
                          className="opacity-50"
                          onClick={() => navigate('/settings/plans')}
                        >
                          <Lock className="h-4 w-4 mr-2" />
                          Share via Email
                          <Badge variant="secondary" className="ml-2 text-xs">Enterprise</Badge>
                        </Button>
                      )}
                    </div>

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
          </TabsContent>
        </Tabs>
      </div>

      {/* Email Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Share Insights via Email
            </DialogTitle>
            <DialogDescription>
              Select team members to share this analysis with
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {teamMembers.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No team members found</p>
                <p className="text-xs">Add team members in Settings to share insights</p>
              </div>
            ) : (
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {teamMembers.map(member => (
                    <div key={member.id} className="flex items-center space-x-3 p-2 rounded hover:bg-muted">
                      <Checkbox
                        id={`member-${member.id}`}
                        checked={selectedRecipients.includes(member.email)}
                        onCheckedChange={() => toggleRecipient(member.email)}
                      />
                      <label htmlFor={`member-${member.id}`} className="flex-1 cursor-pointer">
                        <p className="text-sm font-medium">{member.full_name || member.email}</p>
                        {member.full_name && (
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={sendEmail} 
              disabled={sendingEmail || selectedRecipients.length === 0}
            >
              {sendingEmail ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send to {selectedRecipients.length} recipient{selectedRecipients.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}