import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAdminAccess } from "@/hooks/useWorkspaceAdminAccess";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, differenceInMinutes, differenceInHours } from "date-fns";
import { Loader2, CalendarIcon, Clock, Users, TrendingUp, AlertTriangle, Timer, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeatureGate } from "@/components/FeatureGate";
import { formatActiveTime } from "@/hooks/useActiplanTimeTracking";
import { QCAnalyticsTab } from "@/components/QCAnalyticsTab";

interface ActiPlanSummary {
  id: string;
  name: string;
  status: string | null;
  created_at: string;
  published_at: string | null;
  draftingWorkSeconds: number;
  planToLaunchHours: number | null;
}
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface Campaign {
  id: string;
  name: string;
  team_id?: string;
  status?: string | null;
  created_at?: string;
  published_at?: string | null;
}

interface OperationRecord {
  id: string;
  type: 'change_request' | 'logged_action';
  subtype: string;
  requester_id: string;
  requester_email?: string;
  completed_by?: string;
  completed_by_email?: string;
  created_at: string;
  completed_at?: string;
  estimated_hours?: number;
  actual_hours?: number;
  status: string;
  campaign_id?: string;
  campaign_name?: string;
  team_id?: string;
  team_name?: string;
  platforms?: string[];
  markets?: string[];
  time_to_complete?: number;
}

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function OperationsReports() {
  const { user, loading: authLoading } = useAuth();
  const { canAccess: hasAccess, loading: accessLoading } = useWorkspaceAdminAccess();
  const { activeWorkspaceId, activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const roleLoading = accessLoading || workspaceLoading;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  // Filter states
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedMarket, setSelectedMarket] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [dimensionFilter, setDimensionFilter] = useState<string>("user");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  
  // Data
  const [operations, setOperations] = useState<OperationRecord[]>([]);
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
  const [availableMarkets, setAvailableMarkets] = useState<string[]>([]);
  const [timeTrackingData, setTimeTrackingData] = useState<Record<string, number>>({});
  const [actiplanSummaries, setActiplanSummaries] = useState<ActiPlanSummary[]>([]);

  // Only redirect AFTER we have a definitive answer (loading complete AND access denied)
  useEffect(() => {
    // Don't do anything while still loading
    if (authLoading || roleLoading) {
      return;
    }
    
    // If we're done loading and don't have access, redirect
    if (!hasAccess) {
      console.warn("[OperationsReports] Access denied after loading complete", { 
        hasAccess, 
        authLoading, 
        roleLoading,
        userId: user?.id 
      });
      toast.error("Access denied. Admin or Owner role required.");
      navigate("/app/settings/account");
    }
  }, [hasAccess, authLoading, roleLoading, navigate, user?.id]);

  useEffect(() => {
    if (user && hasAccess) {
      loadInitialData();
    }
  }, [user, hasAccess, activeWorkspaceId]);

  useEffect(() => {
    if (user && hasAccess && activeWorkspaceId && campaigns.length > 0) {
      loadOperationsData();
    }
  }, [user, hasAccess, activeWorkspaceId, selectedCampaign, campaigns]);

  const loadInitialData = async () => {
    if (!activeWorkspaceId) return;
    
    try {
      setLoading(true);

      // Load campaigns for the active workspace only with additional fields for time metrics
      const { data: campaignsData } = await supabase
        .from("campaigns")
        .select("id, name, team_id, status, created_at, published_at")
        .eq("team_id", activeWorkspaceId)
        .order("name");
      setCampaigns(campaignsData || []);
    } catch (error: any) {
      console.error("Error loading initial data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const loadOperationsData = async () => {
    if (!activeWorkspaceId) return;
    
    try {
      setLoading(true);

      // Get campaign IDs for the active workspace
      const campaignIdsForWorkspace = campaigns.map(c => c.id);

      if (campaignIdsForWorkspace.length === 0) {
        setOperations([]);
        setAvailablePlatforms([]);
        setAvailableMarkets([]);
        setLoading(false);
        return;
      }

      // Load modification requests for active workspace
      let modQuery = supabase
        .from("modification_requests")
        .select(`
          id, change_type, requester_id, status, created_at, 
          estimated_hours, actual_hours, completed_by, completed_at,
          campaigns!inner(id, name, team_id, platforms, market_splits)
        `)
        .in('campaign_id', campaignIdsForWorkspace)
        .order("created_at", { ascending: false });

      if (selectedCampaign !== 'all') {
        modQuery = modQuery.eq('campaign_id', selectedCampaign);
      }

      const { data: modRequests, error: modError } = await modQuery;
      if (modError) throw modError;

      // Load activity logs for active workspace
      let actQuery = supabase
        .from("activity_logs")
        .select(`
          id, action_type, user_id, created_at,
          estimated_hours, actual_hours,
          affected_platforms, affected_markets,
          campaigns!inner(id, name, team_id, platforms, market_splits)
        `)
        .in('campaign_id', campaignIdsForWorkspace)
        .order("created_at", { ascending: false });

      if (selectedCampaign !== 'all') {
        actQuery = actQuery.eq('campaign_id', selectedCampaign);
      }

      const { data: activityLogs, error: actError } = await actQuery;
      if (actError) throw actError;

      let historyQuery = supabase
        .from("campaign_change_history")
        .select(`
          id, action, change_type, user_id, created_at, description,
          campaigns!inner(id, name, team_id, platforms, market_splits)
        `)
        .in('campaign_id', campaignIdsForWorkspace)
        .order("created_at", { ascending: false });

      if (selectedCampaign !== 'all') {
        historyQuery = historyQuery.eq('campaign_id', selectedCampaign);
      }

      const { data: historyLogs, error: historyError } = await historyQuery;
      if (historyError) throw historyError;

      // Collect all user IDs
      const userIds = new Set<string>();
      modRequests?.forEach(r => {
        userIds.add(r.requester_id);
        if (r.completed_by) userIds.add(r.completed_by);
      });
      activityLogs?.forEach(a => userIds.add(a.user_id));
      historyLogs?.forEach((h: any) => userIds.add(h.user_id));

      // Fetch user emails
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(userIds));

      const emailMap = Object.fromEntries((profiles || []).map(p => [p.id, p.email]));

      // Fetch team names
      const teamIds = new Set<string>();
      modRequests?.forEach(r => {
        const campaign = r.campaigns as any;
        if (campaign?.team_id) teamIds.add(campaign.team_id);
      });
      activityLogs?.forEach(a => {
        const campaign = a.campaigns as any;
        if (campaign?.team_id) teamIds.add(campaign.team_id);
      });
      historyLogs?.forEach((h: any) => {
        const campaign = h.campaigns as any;
        if (campaign?.team_id) teamIds.add(campaign.team_id);
      });

      const { data: teamData } = await supabase
        .from("teams")
        .select("id, name")
        .in("id", Array.from(teamIds));

      const teamMap = Object.fromEntries((teamData || []).map(t => [t.id, t.name]));

      // Build operations and collect platforms/markets
      const platformSet = new Set<string>();
      const marketSet = new Set<string>();
      const combinedOperations: OperationRecord[] = [];

      modRequests?.forEach(r => {
        const campaign = r.campaigns as any;
        const platforms = (campaign?.platforms || []).map((p: any) => p.name || p.id).filter(Boolean);
        const markets = Object.values(campaign?.market_splits || {})
          .flat()
          .map((m: any) => m?.name || m?.id)
          .filter(Boolean);

        platforms.forEach((p: string) => platformSet.add(p));
        markets.forEach((m: string) => marketSet.add(m));

        const timeToComplete = r.completed_at 
          ? differenceInMinutes(new Date(r.completed_at), new Date(r.created_at)) / 60
          : undefined;

        combinedOperations.push({
          id: r.id,
          type: 'change_request',
          subtype: r.change_type,
          requester_id: r.requester_id,
          requester_email: emailMap[r.requester_id],
          completed_by: r.completed_by || undefined,
          completed_by_email: r.completed_by ? emailMap[r.completed_by] : undefined,
          created_at: r.created_at,
          completed_at: r.completed_at || undefined,
          estimated_hours: r.estimated_hours || undefined,
          actual_hours: r.actual_hours || undefined,
          status: r.status,
          campaign_id: campaign?.id,
          campaign_name: campaign?.name,
          team_id: campaign?.team_id,
          team_name: campaign?.team_id ? teamMap[campaign.team_id] : undefined,
          platforms,
          markets,
          time_to_complete: timeToComplete,
        });
      });

      activityLogs?.forEach(a => {
        const campaign = a.campaigns as any;
        const platforms = a.affected_platforms || (campaign?.platforms || []).map((p: any) => p.name || p.id).filter(Boolean);
        const markets = a.affected_markets || Object.values(campaign?.market_splits || {})
          .flat()
          .map((m: any) => m?.name || m?.id)
          .filter(Boolean);

        platforms.forEach((p: string) => platformSet.add(p));
        markets.forEach((m: string) => marketSet.add(m));

        combinedOperations.push({
          id: a.id,
          type: 'logged_action',
          subtype: a.action_type,
          requester_id: a.user_id,
          requester_email: emailMap[a.user_id],
          created_at: a.created_at,
          estimated_hours: a.estimated_hours || undefined,
          actual_hours: a.actual_hours || undefined,
          status: 'logged',
          campaign_id: campaign?.id,
          campaign_name: campaign?.name,
          team_id: campaign?.team_id,
          team_name: campaign?.team_id ? teamMap[campaign.team_id] : undefined,
          platforms,
          markets,
        });
      });

      historyLogs?.forEach((h: any) => {
        const campaign = h.campaigns as any;
        const platforms = (campaign?.platforms || []).map((p: any) => p.name || p.id).filter(Boolean);
        const markets = Object.values(campaign?.market_splits || {})
          .flat()
          .map((m: any) => m?.name || m?.id)
          .filter(Boolean);

        platforms.forEach((p: string) => platformSet.add(p));
        markets.forEach((m: string) => marketSet.add(m));

        combinedOperations.push({
          id: `history-${h.id}`,
          type: 'logged_action',
          subtype: h.change_type || h.action,
          requester_id: h.user_id,
          requester_email: emailMap[h.user_id],
          created_at: h.created_at,
          status: 'logged',
          campaign_id: campaign?.id,
          campaign_name: campaign?.name,
          team_id: campaign?.team_id,
          team_name: campaign?.team_id ? teamMap[campaign.team_id] : undefined,
          platforms,
          markets,
        });
      });

      setOperations(combinedOperations);
      setAvailablePlatforms(Array.from(platformSet));
      setAvailableMarkets(Array.from(marketSet));

      // Fetch time tracking data for campaigns
      const { data: timeSessions } = await supabase
        .from("actiplan_time_sessions")
        .select("campaign_id, active_seconds")
        .in("campaign_id", campaignIdsForWorkspace);

      // Aggregate time by campaign
      const timeByPlan: Record<string, number> = {};
      timeSessions?.forEach(session => {
        if (!timeByPlan[session.campaign_id]) {
          timeByPlan[session.campaign_id] = 0;
        }
        timeByPlan[session.campaign_id] += session.active_seconds || 0;
      });
      setTimeTrackingData(timeByPlan);

      // Build ActiPlan summaries with drafting work and plan-to-launch metrics
      const summaries: ActiPlanSummary[] = campaigns.map(c => {
        const draftingWorkSeconds = timeByPlan[c.id] || 0;
        const planToLaunchHours = c.published_at && c.created_at
          ? differenceInHours(new Date(c.published_at), new Date(c.created_at))
          : null;
        
        return {
          id: c.id,
          name: c.name,
          status: c.status || null,
          created_at: c.created_at || '',
          published_at: c.published_at || null,
          draftingWorkSeconds,
          planToLaunchHours,
        };
      });
      setActiplanSummaries(summaries);

    } catch (error: any) {
      console.error("Error loading operations data:", error);
      toast.error("Failed to load operations data");
    } finally {
      setLoading(false);
    }
  };

  const filteredOperations = useMemo(() => {
    return operations.filter(op => {
      if (dateRange.from) {
        const opDate = new Date(op.created_at);
        if (opDate < dateRange.from) return false;
      }
      if (dateRange.to) {
        const opDate = new Date(op.created_at);
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        if (opDate > endOfDay) return false;
      }
      if (typeFilter !== 'all' && op.type !== typeFilter) return false;
      // Workspace filtering is already done at the query level
      if (selectedPlatform !== 'all' && !op.platforms?.includes(selectedPlatform)) return false;
      if (selectedMarket !== 'all' && !op.markets?.includes(selectedMarket)) return false;
      return true;
    });
  }, [operations, dateRange, typeFilter, selectedPlatform, selectedMarket]);

  // Calculate statistics
  const stats = useMemo(() => {
    const totalEstimated = filteredOperations.reduce((sum, op) => sum + (op.estimated_hours || 0), 0);
    const totalActual = filteredOperations.reduce((sum, op) => sum + (op.actual_hours || 0), 0);
    const completedOps = filteredOperations.filter(op => op.status === 'completed' || op.type === 'logged_action');
    const avgTimeToComplete = completedOps.length > 0
      ? completedOps.reduce((sum, op) => sum + (op.time_to_complete || 0), 0) / completedOps.length
      : 0;

    return {
      totalOperations: filteredOperations.length,
      totalEstimatedHours: totalEstimated,
      totalActualHours: totalActual,
      avgTimeToComplete,
      completedCount: completedOps.length,
    };
  }, [filteredOperations]);

  // Group by dimension
  const groupedData = useMemo(() => {
    const grouped: Record<string, { estimated: number; actual: number; count: number }> = {};

    filteredOperations.forEach(op => {
      let key = '';
      if (dimensionFilter === 'user') {
        key = op.completed_by_email || op.requester_email || 'Unknown';
      } else if (dimensionFilter === 'team') {
        key = op.team_name || 'No Team';
      } else if (dimensionFilter === 'campaign') {
        key = op.campaign_name || 'Unknown';
      } else if (dimensionFilter === 'platform') {
        (op.platforms || []).forEach(p => {
          if (!grouped[p]) grouped[p] = { estimated: 0, actual: 0, count: 0 };
          grouped[p].estimated += (op.estimated_hours || 0) / (op.platforms?.length || 1);
          grouped[p].actual += (op.actual_hours || 0) / (op.platforms?.length || 1);
          grouped[p].count += 1 / (op.platforms?.length || 1);
        });
        return;
      } else if (dimensionFilter === 'market') {
        (op.markets || []).forEach(m => {
          if (!grouped[m]) grouped[m] = { estimated: 0, actual: 0, count: 0 };
          grouped[m].estimated += (op.estimated_hours || 0) / (op.markets?.length || 1);
          grouped[m].actual += (op.actual_hours || 0) / (op.markets?.length || 1);
          grouped[m].count += 1 / (op.markets?.length || 1);
        });
        return;
      } else if (dimensionFilter === 'type') {
        key = op.type === 'change_request' ? 'Change Requests' : 'Logged Actions';
      } else if (dimensionFilter === 'subtype') {
        key = op.subtype;
      }

      if (!grouped[key]) {
        grouped[key] = { estimated: 0, actual: 0, count: 0 };
      }
      grouped[key].estimated += op.estimated_hours || 0;
      grouped[key].actual += op.actual_hours || 0;
      grouped[key].count += 1;
    });

    return Object.entries(grouped).map(([name, data]) => ({
      name: name.length > 15 ? name.substring(0, 15) + '...' : name,
      fullName: name,
      ...data,
    }));
  }, [filteredOperations, dimensionFilter]);

  // Type distribution for pie chart
  const typeDistribution = useMemo(() => {
    const types: Record<string, number> = {};
    filteredOperations.forEach(op => {
      const key = op.subtype;
      types[key] = (types[key] || 0) + 1;
    });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [filteredOperations]);

  if (authLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center space-y-2">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h3 className="text-lg font-semibold">Access Denied</h3>
            <p className="text-muted-foreground">Only admins and owners can access Operations Reports.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <FeatureGate feature="operations_analytics">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Operations Reports</h2>
          <p className="text-muted-foreground mt-1">
            View operations analytics for <span className="font-medium">{activeWorkspace?.name || "your workspace"}</span>
          </p>
        </div>

        {!activeWorkspaceId ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-2">
                <Users className="h-12 w-12 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">No workspace selected. Select a workspace from the top menu.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Campaign</label>
                    <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="All Campaigns" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Campaigns</SelectItem>
                        {campaigns.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Platform</label>
                    <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="All Platforms" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Platforms</SelectItem>
                        {availablePlatforms.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Market</label>
                    <Select value={selectedMarket} onValueChange={setSelectedMarket}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="All Markets" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Markets</SelectItem>
                        {availableMarkets.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date Range</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-[200px] justify-start text-left font-normal",
                            !dateRange.from && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange.from ? (
                            dateRange.to ? (
                              <>
                                {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd")}
                              </>
                            ) : (
                              format(dateRange.from, "MMM dd, yyyy")
                            )
                          ) : (
                            <span>Pick dates</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="range"
                          selected={{ from: dateRange.from, to: dateRange.to }}
                          onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Type</label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="change_request">Change Requests</SelectItem>
                        <SelectItem value="logged_action">Logged Actions</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Group By</label>
                    <Select value={dimensionFilter} onValueChange={setDimensionFilter}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="team">Team</SelectItem>
                        <SelectItem value="campaign">ActiPlan</SelectItem>
                        <SelectItem value="platform">Platform</SelectItem>
                        <SelectItem value="market">Market</SelectItem>
                        <SelectItem value="type">Type</SelectItem>
                        <SelectItem value="subtype">Subtype</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <>
                {/* Scorecards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <TrendingUp className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Total Operations</p>
                          <p className="text-2xl font-bold">{stats.totalOperations}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Clock className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Estimated Hours</p>
                          <p className="text-2xl font-bold">{stats.totalEstimatedHours.toFixed(1)}h</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Clock className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Actual Hours</p>
                          <p className="text-2xl font-bold">{stats.totalActualHours.toFixed(1)}h</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Avg. Completion</p>
                          <p className="text-2xl font-bold">{stats.avgTimeToComplete.toFixed(1)}h</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Hours by {dimensionFilter.charAt(0).toUpperCase() + dimensionFilter.slice(1)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={groupedData.slice(0, 10)} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={100} />
                            <Tooltip 
                              formatter={(value: number) => `${value.toFixed(1)}h`}
                              labelFormatter={(label) => groupedData.find(d => d.name === label)?.fullName || label}
                            />
                            <Legend />
                            <Bar dataKey="estimated" name="Estimated" fill="hsl(var(--primary))" />
                            <Bar dataKey="actual" name="Actual" fill="hsl(var(--secondary))" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Operation Type Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={typeDistribution.slice(0, 8)}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                              label={({ name, percent }) => `${name.substring(0, 10)}... (${(percent * 100).toFixed(0)}%)`}
                            >
                              {typeDistribution.slice(0, 8).map((_, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ActiPlans Summary Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      ActiPlans Time Metrics
                    </CardTitle>
                    <CardDescription>
                      Drafting works measures effective active time spent. Plan to launch measures total elapsed time.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ActiPlan Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Published</TableHead>
                          <TableHead>
                            <div className="flex items-center gap-1">
                              <Timer className="h-4 w-4" />
                              ActiPlan Drafting Works
                            </div>
                          </TableHead>
                          <TableHead>Plan to Launch Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {actiplanSummaries
                          .filter(s => selectedCampaign === 'all' || s.id === selectedCampaign)
                          .map((summary) => (
                          <TableRow key={summary.id}>
                            <TableCell className="font-medium max-w-[200px] truncate">
                              {summary.name}
                            </TableCell>
                            <TableCell>
                              <Badge variant={summary.status === 'live' ? 'default' : 'secondary'}>
                                {summary.status || 'draft'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {summary.created_at 
                                ? format(new Date(summary.created_at), "MMM dd, yyyy") 
                                : '-'}
                            </TableCell>
                            <TableCell>
                              {summary.published_at 
                                ? format(new Date(summary.published_at), "MMM dd, yyyy")
                                : '-'}
                            </TableCell>
                            <TableCell className="font-medium text-primary">
                              {summary.draftingWorkSeconds > 0 
                                ? formatActiveTime(summary.draftingWorkSeconds)
                                : '-'}
                            </TableCell>
                            <TableCell>
                              {summary.planToLaunchHours !== null 
                                ? `${summary.planToLaunchHours}h`
                                : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                        {actiplanSummaries.filter(s => selectedCampaign === 'all' || s.id === selectedCampaign).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              No ActiPlans found in this workspace
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Operations Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Operations</CardTitle>
                    <CardDescription>
                      Individual tasks, requests, and optimizations with user-defined hours
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>ActiPlan</TableHead>
                          <TableHead>Team</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Est. Hours</TableHead>
                          <TableHead>Actual Hours</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOperations.slice(0, 20).map((op) => (
                          <TableRow key={op.id}>
                            <TableCell>
                              <Badge variant="outline">{op.subtype}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate">{op.campaign_name || '-'}</TableCell>
                            <TableCell>{op.team_name || '-'}</TableCell>
                            <TableCell>{op.requester_email?.split('@')[0] || '-'}</TableCell>
                            <TableCell>{op.estimated_hours ? `${op.estimated_hours}h` : '-'}</TableCell>
                            <TableCell>{op.actual_hours ? `${op.actual_hours}h` : '-'}</TableCell>
                            <TableCell>
                              <Badge variant={op.status === 'completed' ? 'default' : 'secondary'}>
                                {op.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{format(new Date(op.created_at), "MMM dd, yyyy")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <QCAnalyticsTab
                  userId={user?.id || ''}
                  selectedCampaign={selectedCampaign}
                  dateRange={dateRange}
                />
              </>
            )}
          </>
        )}
      </div>
    </FeatureGate>
  );
}