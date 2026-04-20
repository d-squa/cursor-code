import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useSampleMode } from "@/contexts/SampleModeContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Loader2, ArrowLeft, Sparkles, BarChart3, TrendingUp, 
  Target, Lightbulb, AlertCircle, ChevronDown, Play,
  Save, Mail, History, Trash2, Lock, Users, Database
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
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
  generic_config?: any;
  market_splits?: any;
  is_sample?: boolean;
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

interface Client {
  id: string;
  name: string;
  industry: string;
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

type InsightsDraft = {
  updatedAt: string;
  selectedCampaignIds: string[];
  selectedPlatforms: string[];
  timeComparison: string;
  selectedBreakdowns: string[];
  analysisResult: string | null;
  rawData: any;
  configOpen: boolean;
  activeTab: string;
};

const getInsightsDraftKey = (userId: string, campaignId?: string) =>
  `insights_draft_${userId}_${campaignId ?? "global"}`;

const readInsightsDraft = (userId: string, campaignId?: string): InsightsDraft | null => {
  try {
    const raw = localStorage.getItem(getInsightsDraftKey(userId, campaignId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<InsightsDraft>;
    if (!parsed.updatedAt) return null;

    const updatedAtMs = new Date(parsed.updatedAt).getTime();
    if (Number.isNaN(updatedAtMs)) return null;

    // Only restore fairly recent drafts (prevents stale restores days later)
    const ageMs = Date.now() - updatedAtMs;
    if (ageMs > 1000 * 60 * 60 * 24) return null;

    return parsed as InsightsDraft;
  } catch {
    return null;
  }
};

const writeInsightsDraft = (userId: string, campaignId: string | undefined, draft: InsightsDraft) => {
  const key = getInsightsDraftKey(userId, campaignId);

  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // If localStorage quota is hit (rawData can be big), retry without rawData.
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { rawData, ...rest } = draft;
      localStorage.setItem(key, JSON.stringify(rest));
    } catch {
      // Ignore persistence failures
    }
  }
};

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
  const [isGeneralPerformance, setIsGeneralPerformance] = useState(false);
  
  // Competitor analysis (Enterprise/Agency only)
  const [includeCompetitorAnalysis, setIncludeCompetitorAnalysis] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientSource, setClientSource] = useState<'campaign' | 'list' | 'manual'>('campaign');
  const [campaignClientInfo, setCampaignClientInfo] = useState<{ name: string; industry: string } | null>(null);
  const [manualClientName, setManualClientName] = useState('');
  const [manualClientIndustry, setManualClientIndustry] = useState('');
  const [availableMarkets, setAvailableMarkets] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  
  // Results
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [rawData, setRawData] = useState<any>(null);
  const [configOpen, setConfigOpen] = useState(true);
  
  // Saved analyses
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('new');
  const [todaySaveCount, setTodaySaveCount] = useState(0);
  // Track individual segments used today (not combinations) - persisted to localStorage
  const [usedSegments, setUsedSegments] = useState<Set<string>>(() => {
    // Load from localStorage on init
    const today = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem(`insights_used_segments_${today}`);
    if (stored) {
      try {
        return new Set(JSON.parse(stored));
      } catch {
        return new Set();
      }
    }
    return new Set();
  });
  
  // Email dialog
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);

  const { isSampleMode } = useSampleMode();

  // Feature access checks (Sample Mode bypasses all gates for the tour)
  const canAccessCrossPlatform = isSampleMode || hasAccess('cross_platform_insights' as any) || 
    tier === 'enterprise' || tier === 'agency';
  const canSaveUnlimited = isSampleMode || hasAccess('unlimited_insights_saves' as any) || 
    tier === 'enterprise' || tier === 'agency';
  const canShareEmail = isSampleMode || hasAccess('share_insights_email' as any) || 
    tier === 'enterprise' || tier === 'agency';
  const canUseUnlimitedSegments = isSampleMode || hasAccess('unlimited_segment_usage' as any) ||
    tier === 'enterprise' || tier === 'agency';
  const canUseCompetitorAnalysis = isSampleMode || tier === 'enterprise' || tier === 'agency';
  
  // Daily save limit for basic/freelancer
  const dailySaveLimit = canSaveUnlimited ? Infinity : 1;
  const canSaveMore = canSaveUnlimited || todaySaveCount < dailySaveLimit;
  
  // Check if user has connected platforms with data
  const hasLiveDataAccess = connectedPlatforms.length > 0;

  const draftReadyRef = useRef(false);

  useEffect(() => {
    loadData();
  }, [user, campaignId, isSampleMode]);

  // Persist in-progress state so a refresh/remount doesn't wipe the current analysis.
  useEffect(() => {
    if (!user || !draftReadyRef.current) return;

    writeInsightsDraft(user.id, campaignId, {
      updatedAt: new Date().toISOString(),
      selectedCampaignIds,
      selectedPlatforms,
      timeComparison,
      selectedBreakdowns,
      analysisResult,
      rawData,
      configOpen,
      activeTab,
    });
  }, [
    user,
    campaignId,
    selectedCampaignIds,
    selectedPlatforms,
    timeComparison,
    selectedBreakdowns,
    analysisResult,
    rawData,
    configOpen,
    activeTab,
  ]);

  // Extract client info and markets from selected campaign
  useEffect(() => {
    if (selectedCampaignIds.length === 0) {
      setCampaignClientInfo(null);
      setClientSource(clients.length > 0 ? 'list' : 'manual');
      setAvailableMarkets([]);
      setSelectedMarkets([]);
      return;
    }

    // Get the first selected campaign
    const selectedCampaign = campaigns.find(c => selectedCampaignIds.includes(c.id));
    
    // Extract markets from market_splits
    if (selectedCampaign?.market_splits) {
      const marketSplits = selectedCampaign.market_splits;
      const markets: string[] = [];
      
      // market_splits is an object keyed by platform (meta, tiktok) with arrays of market objects
      Object.values(marketSplits).forEach((platformMarkets: any) => {
        if (Array.isArray(platformMarkets)) {
          platformMarkets.forEach((market: any) => {
            if (market.name && !markets.includes(market.name)) {
              markets.push(market.name);
            }
          });
        }
      });
      
      setAvailableMarkets(markets);
      setSelectedMarkets(markets); // Select all by default
    } else {
      setAvailableMarkets([]);
      setSelectedMarkets([]);
    }
    
    if (!selectedCampaign?.generic_config) {
      setCampaignClientInfo(null);
      setClientSource(clients.length > 0 ? 'list' : 'manual');
      return;
    }

    const config = selectedCampaign.generic_config;
    // Check if campaign has client info in activation details
    if (config.clientName && config.clientIndustry) {
      setCampaignClientInfo({
        name: config.clientName,
        industry: config.clientIndustry
      });
      setClientSource('campaign');
    } else if (config.client?.name && config.client?.industry) {
      // Alternative structure
      setCampaignClientInfo({
        name: config.client.name,
        industry: config.client.industry
      });
      setClientSource('campaign');
    } else {
      setCampaignClientInfo(null);
      setClientSource(clients.length > 0 ? 'list' : 'manual');
    }
  }, [selectedCampaignIds, campaigns, clients.length]);

  const loadData = async () => {
    if (!user) return;
    
    try {
      const campaignsQuery = supabase
        .from('campaigns')
        .select('id, name, status, total_budget, start_date, end_date, objective, platforms, generic_config, market_splits, is_sample')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // In Sample Mode, don't filter by status (seeded campaign may have any status)
      if (!isSampleMode) {
        campaignsQuery.in('status', ['pushed_to_dsp', 'live', 'partially_pushed', 'approved', 'ready_for_push']);
      }

      const [campaignsRes, platformsRes, savedRes, clientsRes] = await Promise.all([
        campaignsQuery,
        supabase
          .from('connected_platforms')
          .select('id, platform_type, platform_name, ad_account_id, ad_account_name')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('saved_insights_analyses')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('clients')
          .select('id, name, industry')
          .eq('user_id', user.id)
          .order('name', { ascending: true })
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
        const todayAnalyses = savedRes.data.filter(s => 
          new Date(s.created_at) >= today
        );
        setTodaySaveCount(todayAnalyses.length);
        
        // Merge saved analyses segments with localStorage (localStorage may have unsaved runs)
        const todayStr = new Date().toISOString().split('T')[0];
        const storedSegs = localStorage.getItem(`insights_used_segments_${todayStr}`);
        const fromStorage = storedSegs ? new Set<string>(JSON.parse(storedSegs)) : new Set<string>();
        
        // Add segments from saved analyses too
        todayAnalyses.forEach(analysis => {
          analysis.breakdowns.forEach(breakdown => {
            fromStorage.add(breakdown);
          });
        });
        
        // Update localStorage with merged data
        localStorage.setItem(`insights_used_segments_${todayStr}`, JSON.stringify([...fromStorage]));
        setUsedSegments(fromStorage);
      }
      
      if (clientsRes.data) {
        setClients(clientsRes.data as Client[]);
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
    // In Sample Mode, restrict to the seeded tour campaign(s) only
    let base = campaigns;
    if (isSampleMode) {
      base = campaigns.filter(c => (c as any).is_sample === true || /Q4 Holiday Campaign/i.test(c.name));
    }

    if (canAccessCrossPlatform) return base;

    // For basic/freelancer, only show campaigns that have selected platforms
    return base.filter(c => {
      const campaignPlatforms = c.platforms?.map((p: any) =>
        (p.type || p.name || '').toLowerCase()
      ) || [];
      return selectedPlatforms.some(sp =>
        campaignPlatforms.includes(sp.toLowerCase())
      );
    });
  }, [campaigns, selectedPlatforms, canAccessCrossPlatform, isSampleMode]);

  const runAnalysis = async () => {
    if (selectedCampaignIds.length === 0) {
      toast.error('Please select at least one campaign');
      return;
    }
    
    if (selectedPlatforms.length === 0) {
      toast.error('Please select at least one platform');
      return;
    }

    // General performance mode doesn't require breakdowns
    if (!isGeneralPerformance && selectedBreakdowns.length === 0) {
      toast.error('Please select at least one breakdown dimension or use General Performance mode');
      return;
    }

    // Check individual segment usage for non-enterprise users (skip for general performance mode)
    if (!isGeneralPerformance && !canUseUnlimitedSegments) {
      const alreadyUsedSegments = selectedBreakdowns.filter(s => usedSegments.has(s));
      if (alreadyUsedSegments.length > 0) {
        toast.error(
          `You have already used these segments today: ${alreadyUsedSegments.join(', ')}. Upgrade to Enterprise for unlimited segment analysis.`,
          { duration: 5000 }
        );
        return;
      }
    }

    setAnalyzing(true);
    setAnalysisResult(null);
    setConfigOpen(false);

    // Determine client data for competitor analysis based on source
    let clientName: string | undefined;
    let clientIndustry: string | undefined;
    let hasValidClient = false;

    if (includeCompetitorAnalysis && canUseCompetitorAnalysis) {
      if (clientSource === 'campaign' && campaignClientInfo) {
        clientName = campaignClientInfo.name;
        clientIndustry = campaignClientInfo.industry;
        hasValidClient = true;
      } else if (clientSource === 'list' && selectedClientId) {
        const selectedClient = clients.find(c => c.id === selectedClientId);
        if (selectedClient) {
          clientName = selectedClient.name;
          clientIndustry = selectedClient.industry;
          hasValidClient = true;
        }
      } else if (clientSource === 'manual' && manualClientName && manualClientIndustry) {
        clientName = manualClientName;
        clientIndustry = manualClientIndustry;
        hasValidClient = true;
      }
    }

    // Determine clientId for database tracking
    let clientIdForTracking: string | undefined;
    if (clientSource === 'list' && selectedClientId) {
      clientIdForTracking = selectedClientId;
    }

    try {
      const { data, error } = await supabase.functions.invoke('insights-recommendations', {
        body: {
          campaignIds: selectedCampaignIds,
          platforms: selectedPlatforms,
          timeComparison,
          breakdowns: isGeneralPerformance ? [] : selectedBreakdowns,
          crossPlatformEnabled: canAccessCrossPlatform,
          useSampleData: true, // Always use sample data for now
          includeActivityLogs: true,
          includeCompetitorAnalysis: includeCompetitorAnalysis && canUseCompetitorAnalysis && hasValidClient,
          clientId: clientIdForTracking, // Pass clientId for competitor database tracking
          clientName,
          clientIndustry,
          isGeneralPerformance,
          markets: selectedMarkets.length > 0 ? selectedMarkets : ['US'] // Pass markets for competitor analysis
        }
      });

      if (error) throw error;

      setAnalysisResult(data.analysis);
      setRawData(data.rawData);
      toast.success('Analysis complete!');
      
      // Track used segments immediately after run (not on save) for non-enterprise users
      // Skip tracking for general performance mode
      if (!isGeneralPerformance && !canUseUnlimitedSegments) {
        setUsedSegments(prev => {
          const newSet = new Set(prev);
          selectedBreakdowns.forEach(s => newSet.add(s));
          // Persist to localStorage
          const today = new Date().toISOString().split('T')[0];
          localStorage.setItem(`insights_used_segments_${today}`, JSON.stringify([...newSet]));
          return newSet;
        });
      }
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
      
      // Note: Segments are already tracked on run, not on save
      
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/app/overview')}>
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
                        <Separator />

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

                        {/* Competitor Analysis (Enterprise/Agency only) */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Competitor Analysis</Label>
                            {!canUseCompetitorAnalysis && (
                              <Badge variant="outline" className="text-xs">
                                <Lock className="h-3 w-3 mr-1" />
                                Enterprise+
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="competitor-analysis"
                              checked={includeCompetitorAnalysis}
                              onCheckedChange={(checked) => setIncludeCompetitorAnalysis(checked === true)}
                              disabled={!canUseCompetitorAnalysis}
                            />
                            <label 
                              htmlFor="competitor-analysis" 
                              className={`text-sm cursor-pointer ${!canUseCompetitorAnalysis ? 'text-muted-foreground' : ''}`}
                            >
                              Include competitor ad analysis
                            </label>
                          </div>
                          {includeCompetitorAnalysis && canUseCompetitorAnalysis && (
                            <div className="space-y-3 pl-6">
                              {/* Campaign client detected */}
                              {clientSource === 'campaign' && campaignClientInfo && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-xs">
                                      From ActiPlan
                                    </Badge>
                                  </div>
                                  <div className="p-3 bg-muted/50 rounded-md space-y-1">
                                    <p className="text-sm font-medium">{campaignClientInfo.name}</p>
                                    <p className="text-xs text-muted-foreground">{campaignClientInfo.industry}</p>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Client detected from selected ActiPlan's activation details
                                  </p>
                                </div>
                              )}
                              
                              {/* Client list selection */}
                              {clientSource === 'list' && clients.length > 0 && (
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground">Select Client</Label>
                                  <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                                    <SelectTrigger className="h-9">
                                      <SelectValue placeholder="Select a client..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {clients.map(client => (
                                        <SelectItem key={client.id} value={client.id}>
                                          <div className="flex flex-col">
                                            <span>{client.name}</span>
                                            <span className="text-xs text-muted-foreground">{client.industry}</span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                              
                              {/* Manual input fallback */}
                              {clientSource === 'manual' && (
                                <div className="space-y-3">
                                  <p className="text-xs text-amber-600 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    No client found. Enter details manually.
                                  </p>
                                  <div className="space-y-2">
                                    <Label className="text-xs">Client Name</Label>
                                    <Input
                                      placeholder="Enter client name..."
                                      value={manualClientName}
                                      onChange={(e) => setManualClientName(e.target.value)}
                                      className="h-9"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs">Industry</Label>
                                    <Input
                                      placeholder="Enter industry..."
                                      value={manualClientIndustry}
                                      onChange={(e) => setManualClientIndustry(e.target.value)}
                                      className="h-9"
                                    />
                                  </div>
                                </div>
                              )}
                              
                              {/* Market Filter */}
                              {availableMarkets.length > 0 && (
                                <div className="space-y-2 pt-3 border-t">
                                  <Label className="text-xs text-muted-foreground">Markets to Analyze</Label>
                                  <div className="flex flex-wrap gap-2">
                                    {availableMarkets.map(market => (
                                      <div key={market} className="flex items-center space-x-1">
                                        <Checkbox
                                          id={`market-${market}`}
                                          checked={selectedMarkets.includes(market)}
                                          onCheckedChange={(checked) => {
                                            if (checked) {
                                              setSelectedMarkets(prev => [...prev, market]);
                                            } else {
                                              setSelectedMarkets(prev => prev.filter(m => m !== market));
                                            }
                                          }}
                                        />
                                        <label htmlFor={`market-${market}`} className="text-xs cursor-pointer font-medium">
                                          {market}
                                        </label>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Competitor search runs separately for each market
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                          {!canUseCompetitorAnalysis && (
                            <p className="text-xs text-muted-foreground">
                              Upgrade to Enterprise to analyze competitor ads
                            </p>
                          )}
                        </div>

                        <Separator />

                        {/* Breakdown Dimensions */}
                        <div className="space-y-3">
                          <Label className="text-sm font-medium">Analysis Dimensions</Label>
                          
                          {/* General Performance Option */}
                          <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted/30">
                            <Checkbox
                              id="general-performance"
                              checked={isGeneralPerformance}
                              onCheckedChange={(checked) => {
                                const isChecked = checked === true;
                                setIsGeneralPerformance(isChecked);
                                if (isChecked) {
                                  // Clear breakdowns and auto-enable competitor analysis for enterprise users
                                  setSelectedBreakdowns([]);
                                  if (canUseCompetitorAnalysis) {
                                    setIncludeCompetitorAnalysis(true);
                                  }
                                } else {
                                  // Restore default breakdowns when unchecking
                                  setSelectedBreakdowns(['age', 'gender']);
                                  setIncludeCompetitorAnalysis(false);
                                }
                              }}
                            />
                            <div className="flex-1">
                              <label 
                                htmlFor="general-performance" 
                                className="text-sm font-medium cursor-pointer"
                              >
                                General Performance
                              </label>
                              <p className="text-xs text-muted-foreground">
                                Analyze overall performance using ad set naming conventions as differentiators
                              </p>
                            </div>
                          </div>
                          
                          {isGeneralPerformance && canUseCompetitorAnalysis && (
                            <p className="text-xs text-primary flex items-center gap-1">
                              <Sparkles className="h-3 w-3" />
                              Competitor analysis unlocked with General Performance
                            </p>
                          )}
                          
                          {isGeneralPerformance && !canUseCompetitorAnalysis && (
                            <p className="text-xs text-amber-600 flex items-center gap-1">
                              <Lock className="h-3 w-3" />
                              Upgrade to Enterprise to unlock competitor analysis with General Performance
                            </p>
                          )}
                          
                          {/* Segment Dimensions - disabled when General Performance selected */}
                          <div className={`grid grid-cols-2 gap-2 ${isGeneralPerformance ? 'opacity-50 pointer-events-none' : ''}`}>
                            {BREAKDOWN_DIMENSIONS.map(dim => (
                              <div key={dim.value} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`breakdown-${dim.value}`}
                                  checked={selectedBreakdowns.includes(dim.value)}
                                  onCheckedChange={() => toggleBreakdown(dim.value)}
                                  disabled={isGeneralPerformance}
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
                          
                          {!isGeneralPerformance && !canUseUnlimitedSegments && (
                            <>
                              {selectedBreakdowns.some(s => usedSegments.has(s)) ? (
                                <p className="text-xs text-destructive flex items-center gap-1">
                                  <Lock className="h-3 w-3" />
                                  Segments already used today: {selectedBreakdowns.filter(s => usedSegments.has(s)).join(', ')}. Upgrade to Enterprise.
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Each segment can only be used once per day.
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        <Separator />

                        {/* Run Analysis Button */}
                        <Button 
                          className="w-full" 
                          onClick={runAnalysis}
                          disabled={
                            analyzing || 
                            selectedCampaignIds.length === 0 ||
                            selectedPlatforms.length === 0 ||
                            // Need either general performance or at least one breakdown
                            (!isGeneralPerformance && selectedBreakdowns.length === 0) ||
                            // Disable if Basic/Freelancer selects more than one platform
                            (!canAccessCrossPlatform && selectedPlatforms.length > 1) ||
                            // Disable if any selected segment was already used today (for non-enterprise, only when not general performance)
                            (!isGeneralPerformance && !canUseUnlimitedSegments && selectedBreakdowns.some(s => usedSegments.has(s)))
                          }
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
                          onClick={() => navigate('/app/settings/plans')}
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
                            onClick={() => navigate('/app/settings/plans')}
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