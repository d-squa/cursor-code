import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Users, BarChart3, Zap, Globe, CreditCard, Activity, TrendingUp, Layers, RefreshCw, ShieldCheck, Image, Send, ArrowLeft, Filter, X, ChevronsUpDown, Check, TestTube, LogOut, Calendar as CalendarIcon, Clock } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import MetaDryRunValidation from "@/components/MetaDryRunValidation";
import TikTokDryRunValidation from "@/components/TikTokDryRunValidation";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#94a3b8",
];

interface FilterOptions {
  users: Array<{ id: string; email: string; name: string | null }>;
  teams: Array<{ id: string; name: string; ownerId: string }>;
  billingCustomers: Array<{ userId: string; stripeCustomerId: string; email: string }>;
  userTeams?: Record<string, string[]>; // userId -> teamId[]
}

interface PlatformStats {
  totalUsers: number;
  usersThisMonth: number;
  totalWorkspaces: number;
  subscriptions: { active: number; trialing: number; canceled: number; past_due: number; total_customers: number };
  totalCampaigns: number;
  campaignsThisMonth: number;
  campaignStatuses: Record<string, number>;
  campaignsByMonth: Record<string, number>;
  totalConnections: number;
  activeConnections: number;
  platformBreakdown: Record<string, number>;
  metaAdAccounts: number;
  tiktokAdAccounts: number;
  totalAssets: number;
  assetsByAdvertiser: Record<string, number>;
  totalCreatives: number;
  totalAssignments: number;
  totalLaunches: number;
  launchStatuses: Record<string, number>;
  totalPushConfigs: number;
  pushStatuses: Record<string, number>;
  totalPushJobs: number;
  totalSwaps: number;
  swapsThisMonth: number;
  totalInsights: number;
  totalActivityLogs: number;
  roleDistribution: Record<string, number>;
  totalInvitations: number;
  recentCampaigns: Array<{ id: string; name: string; status: string; created_at: string; total_budget: number }>;
  filterOptions?: FilterOptions;
}

interface Filters {
  userId?: string;
  teamId?: string;
  stripeCustomerId?: string;
  dateFrom?: string;
  dateTo?: string;
}

function MetricCard({ title, value, icon: Icon, description, color }: { title: string; value: string | number; icon: any; description?: string; color?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [activeFilters, setActiveFilters] = useState<Filters>({});
  const [openCombobox, setOpenCombobox] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [overrideUserId, setOverrideUserId] = useState("");
  const [overrideTier, setOverrideTier] = useState<string>("basic");
  const [overridePeriod, setOverridePeriod] = useState<string>("monthly");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [existingOverrides, setExistingOverrides] = useState<Array<{ id: string; user_id: string; tier: string; billing_period: string; notes: string | null; created_at: string }>>([]);

  const fetchOverrides = useCallback(async () => {
    const { data } = await supabase.from("subscription_overrides").select("*").order("created_at", { ascending: false });
    if (data) setExistingOverrides(data);
  }, []);

  useEffect(() => { fetchOverrides(); }, [fetchOverrides]);

  const setOverride = async () => {
    if (!overrideUserId.trim()) { toast.error("Enter a user ID"); return; }
    setOverrideLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("set-subscription-override", {
        body: {
          action: "set",
          targetUserId: overrideUserId.trim(),
          tier: overrideTier,
          billingPeriod: overridePeriod,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Override set: ${overrideTier} (${overridePeriod}) — Stripe subscription created`);
      setOverrideUserId("");
      setOverrideNotes("");
      fetchOverrides();
    } catch (e: any) {
      toast.error(e.message || "Failed to set override");
    } finally {
      setOverrideLoading(false);
    }
  };

  const removeOverride = async (userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("set-subscription-override", {
        body: { action: "remove", targetUserId: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Override removed — Stripe subscription cancelled");
      fetchOverrides();
    } catch (e: any) {
      toast.error(e.message || "Failed to remove override");
    }
  };

  const fetchStats = useCallback(async (appliedFilters: Filters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const hasFilters = Object.values(appliedFilters).some(Boolean);
      const { data, error: fnError } = hasFilters
        ? await supabase.functions.invoke("admin-platform-stats", {
            method: "POST",
            body: { filters: appliedFilters },
          })
        : await supabase.functions.invoke("admin-platform-stats");
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setStats(data);
      if (data?.filterOptions && !filterOptions) {
        setFilterOptions(data.filterOptions);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [filterOptions]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchStats();
    } else if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user]);

  const applyFilters = () => {
    const filtersWithDates = {
      ...filters,
      dateFrom: dateRange?.from ? dateRange.from.toISOString() : undefined,
      dateTo: dateRange?.to ? dateRange.to.toISOString() : undefined,
    };
    setActiveFilters({ ...filtersWithDates });
    fetchStats(filtersWithDates);
  };

  const clearFilters = () => {
    setFilters({});
    setActiveFilters({});
    setDateRange(undefined);
    fetchStats({});
  };

  const hasActiveFilters = Object.values(activeFilters).some(Boolean);

  if (authLoading || (loading && !stats)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <ShieldCheck className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={() => navigate("/")}>Go Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) return null;

  const campaignChartData = Object.entries(stats.campaignsByMonth).map(([month, count]) => ({
    month: month.slice(5),
    count,
  }));

  const statusChartData = Object.entries(stats.campaignStatuses).map(([status, count]) => ({
    name: status,
    value: count,
  }));

  const platformChartData = Object.entries(stats.platformBreakdown).map(([platform, count]) => ({
    name: platform,
    value: count,
  }));

  const roleChartData = Object.entries(stats.roleDistribution).map(([role, count]) => ({
    name: role,
    value: count,
  }));

  const launchChartData = Object.entries(stats.launchStatuses).map(([status, count]) => ({
    name: status,
    value: count,
  }));

  const opts = filterOptions || stats.filterOptions;

  // Derive dependent filter options based on selected subscription
  const selectedBilling = opts?.billingCustomers?.find(b => b.stripeCustomerId === filters.stripeCustomerId);
  const subscriptionUserId = selectedBilling?.userId;

  // Users available: if subscription selected, only the user linked to that subscription
  const availableUsers = filters.stripeCustomerId
    ? (opts?.users || []).filter(u => u.id === subscriptionUserId)
    : [];

  // Workspaces available: if a user is resolved (from subscription), show their workspaces
  const resolvedUserId = filters.userId || subscriptionUserId;
  const availableTeams = resolvedUserId && opts?.userTeams?.[resolvedUserId]
    ? (opts?.teams || []).filter(t => opts.userTeams![resolvedUserId].includes(t.id))
    : filters.stripeCustomerId
      ? [] // subscription selected but no user found
      : [];

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Platform Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">Real-time platform utilization & analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => fetchStats(activeFilters)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 h-9 px-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {user?.email?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium max-w-[180px] truncate hidden sm:inline">
                    {user?.email}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">{user?.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.id}</p>
                </div>
                <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2 text-xs">Active</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              {/* Subscription ID — primary filter */}
              <div className="flex-1 min-w-[220px]">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Subscription ID</label>
                <Popover open={openCombobox === "subscription"} onOpenChange={(o) => setOpenCombobox(o ? "subscription" : null)}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full h-9 justify-between font-normal">
                      <span className="truncate">
                        {filters.stripeCustomerId
                          ? (opts?.billingCustomers || []).find(b => b.stripeCustomerId === filters.stripeCustomerId)?.email || filters.stripeCustomerId
                          : "All subscriptions"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0 z-50 bg-popover" align="start">
                    <Command>
                      <CommandInput placeholder="Search subscription..." />
                      <CommandList>
                        <CommandEmpty>No subscription found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem onSelect={() => { setFilters({ stripeCustomerId: undefined, userId: undefined, teamId: undefined }); setOpenCombobox(null); }}>
                            <Check className={cn("mr-2 h-4 w-4", !filters.stripeCustomerId ? "opacity-100" : "opacity-0")} />
                            All subscriptions
                          </CommandItem>
                          {(opts?.billingCustomers || []).map((b) => (
                            <CommandItem key={b.stripeCustomerId} value={`${b.email} ${b.stripeCustomerId}`} onSelect={() => { setFilters({ stripeCustomerId: b.stripeCustomerId, userId: undefined, teamId: undefined }); setOpenCombobox(null); }}>
                              <Check className={cn("mr-2 h-4 w-4", filters.stripeCustomerId === b.stripeCustomerId ? "opacity-100" : "opacity-0")} />
                              <div className="flex flex-col">
                                <span>{b.email}</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{b.stripeCustomerId}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Workspace — dependent on subscription */}
              <div className="flex-1 min-w-[220px]">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Workspace</label>
                <Popover open={openCombobox === "workspace"} onOpenChange={(o) => setOpenCombobox(o ? "workspace" : null)}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full h-9 justify-between font-normal" disabled={!filters.stripeCustomerId}>
                      <span className="truncate">
                        {filters.teamId
                          ? availableTeams.find(t => t.id === filters.teamId)?.name || filters.teamId
                          : filters.stripeCustomerId ? "All workspaces" : "Select subscription first"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0 z-50 bg-popover" align="start">
                    <Command>
                      <CommandInput placeholder="Search workspace..." />
                      <CommandList>
                        <CommandEmpty>No workspace found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem onSelect={() => { setFilters(prev => ({ ...prev, teamId: undefined })); setOpenCombobox(null); }}>
                            <Check className={cn("mr-2 h-4 w-4", !filters.teamId ? "opacity-100" : "opacity-0")} />
                            All workspaces
                          </CommandItem>
                          {availableTeams.map((t) => (
                            <CommandItem key={t.id} value={`${t.name} ${t.id}`} onSelect={() => { setFilters(prev => ({ ...prev, teamId: t.id })); setOpenCombobox(null); }}>
                              <Check className={cn("mr-2 h-4 w-4", filters.teamId === t.id ? "opacity-100" : "opacity-0")} />
                              <div className="flex flex-col">
                                <span>{t.name}</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{t.id}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* User — dependent on subscription */}
              <div className="flex-1 min-w-[220px]">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">User</label>
                <Popover open={openCombobox === "user"} onOpenChange={(o) => setOpenCombobox(o ? "user" : null)}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full h-9 justify-between font-normal" disabled={!filters.stripeCustomerId}>
                      <span className="truncate">
                        {filters.userId
                          ? availableUsers.find(u => u.id === filters.userId)?.email || filters.userId
                          : filters.stripeCustomerId ? "All users" : "Select subscription first"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0 z-50 bg-popover" align="start">
                    <Command>
                      <CommandInput placeholder="Search user..." />
                      <CommandList>
                        <CommandEmpty>No user found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem onSelect={() => { setFilters(prev => ({ ...prev, userId: undefined, teamId: undefined })); setOpenCombobox(null); }}>
                            <Check className={cn("mr-2 h-4 w-4", !filters.userId ? "opacity-100" : "opacity-0")} />
                            All users
                          </CommandItem>
                          {availableUsers.map((u) => (
                            <CommandItem key={u.id} value={`${u.email} ${u.name || ""} ${u.id}`} onSelect={() => { setFilters(prev => ({ ...prev, userId: u.id, teamId: undefined })); setOpenCombobox(null); }}>
                              <Check className={cn("mr-2 h-4 w-4", filters.userId === u.id ? "opacity-100" : "opacity-0")} />
                              <div className="flex flex-col">
                                <span>{u.email} {u.name ? `(${u.name})` : ""}</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{u.id}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={applyFilters} disabled={loading}>
                  {loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Apply
                </Button>
                {hasActiveFilters && (
                  <Button size="sm" variant="ghost" onClick={clearFilters} disabled={loading}>
                    <X className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Active filter reference IDs */}
            {hasActiveFilters && (
              <div className="mt-3 pt-3 border-t flex flex-wrap gap-3 text-xs">
                {activeFilters.userId && (
                  <div className="bg-muted rounded px-2 py-1">
                    <span className="text-muted-foreground">User ID: </span>
                    <span className="font-mono">{activeFilters.userId}</span>
                  </div>
                )}
                {activeFilters.teamId && (
                  <div className="bg-muted rounded px-2 py-1">
                    <span className="text-muted-foreground">Workspace ID: </span>
                    <span className="font-mono">{activeFilters.teamId}</span>
                  </div>
                )}
                {activeFilters.stripeCustomerId && (
                  <div className="bg-muted rounded px-2 py-1">
                    <span className="text-muted-foreground">Subscription ID: </span>
                    <span className="font-mono">{activeFilters.stripeCustomerId}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription KPIs */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Subscriptions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricCard title="Active" value={stats.subscriptions.active} icon={CreditCard} color="text-green-500" />
            <MetricCard title="Trialing" value={stats.subscriptions.trialing} icon={CreditCard} color="text-blue-500" />
            <MetricCard title="Past Due" value={stats.subscriptions.past_due} icon={CreditCard} color="text-amber-500" />
            <MetricCard title="Canceled" value={stats.subscriptions.canceled} icon={CreditCard} color="text-red-500" />
            <MetricCard title="Total Customers" value={stats.subscriptions.total_customers} icon={CreditCard} />
          </div>
        </div>

        {/* Users & Workspaces */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Users className="h-5 w-5" /> Users & Workspaces
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard title="Total Users" value={stats.totalUsers} icon={Users} description={`+${stats.usersThisMonth} this month`} />
            <MetricCard title="Workspaces" value={stats.totalWorkspaces} icon={Layers} />
            <MetricCard title="Role Assignments" value={stats.totalInvitations} icon={Users} description="Across all workspaces" />
            <MetricCard title="Activity Logs" value={stats.totalActivityLogs} icon={Activity} />
          </div>
        </div>

        {/* Campaigns / ActiPlans */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> ActiPlans (Media Plans)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <MetricCard title="Total ActiPlans" value={stats.totalCampaigns} icon={BarChart3} description={`+${stats.campaignsThisMonth} this month`} />
            <MetricCard title="Total Launches" value={stats.totalLaunches} icon={Zap} />
            <MetricCard title="Push Configs" value={stats.totalPushConfigs} icon={Send} />
            <MetricCard title="Push Jobs" value={stats.totalPushJobs} icon={Send} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">ActiPlans Created (Last 6 Months)</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaignChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">ActiPlan Status Distribution</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {statusChartData.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Platforms & Ad Accounts */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Globe className="h-5 w-5" /> Platforms & Ad Accounts
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <MetricCard title="Total Connections" value={stats.totalConnections} icon={Globe} description={`${stats.activeConnections} active`} />
            <MetricCard title="Meta Ad Accounts" value={stats.metaAdAccounts} icon={Globe} color="text-blue-500" />
            <MetricCard title="TikTok Ad Accounts" value={stats.tiktokAdAccounts} icon={Globe} color="text-pink-500" />
            <MetricCard title="Total Swaps" value={stats.totalSwaps} icon={RefreshCw} description={`${stats.swapsThisMonth} this month`} />
            <MetricCard title="Insights Generated" value={stats.totalInsights} icon={TrendingUp} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Platform Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={platformChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {platformChartData.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Role Distribution</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={roleChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {roleChartData.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Creatives */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Image className="h-5 w-5" /> Creative Assets
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <MetricCard title="Library Assets" value={stats.totalAssets} icon={Image} />
            <MetricCard title="Creatives" value={stats.totalCreatives} icon={Image} />
            <MetricCard title="Assignments" value={stats.totalAssignments} icon={Layers} />
            <MetricCard title="Unique Ad Accounts w/ Assets" value={Object.keys(stats.assetsByAdvertiser).length} icon={Image} />
          </div>

          {Object.keys(stats.assetsByAdvertiser).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Assets by Ad Account</CardTitle>
                <CardDescription>Top ad accounts by number of synced assets</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-48 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Platform : Ad Account</TableHead>
                        <TableHead className="text-right">Assets</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(stats.assetsByAdvertiser)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 20)
                        .map(([key, count]) => (
                          <TableRow key={key}>
                            <TableCell className="font-mono text-xs">{key}</TableCell>
                            <TableCell className="text-right">{count}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Launch & Push Status */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Zap className="h-5 w-5" /> Launch & Push Status
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Launch Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={launchChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {launchChartData.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Push Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(stats.pushStatuses).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <Badge variant="outline" className="capitalize">{status}</Badge>
                      <span className="font-mono text-sm">{count}</span>
                    </div>
                  ))}
                  {Object.keys(stats.pushStatuses).length === 0 && (
                    <p className="text-muted-foreground text-sm">No push data yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent ActiPlans */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent ActiPlans</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentCampaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{c.status || "draft"}</Badge>
                    </TableCell>
                    <TableCell>${(c.total_budget || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(c.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Meta API Dry-Run Validation */}
        <MetaDryRunValidation />

        {/* TikTok API Dry-Run Validation */}
        <TikTokDryRunValidation />

        {/* Subscription Override Management */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <TestTube className="h-5 w-5" /> Subscription Overrides (Test Users)
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Set Override</CardTitle>
                <CardDescription>Assign a tier to a user without Stripe checkout</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">User ID</Label>
                  <Input value={overrideUserId} onChange={(e) => setOverrideUserId(e.target.value)} placeholder="Paste user UUID" className="font-mono text-sm h-9" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tier</Label>
                    <Select value={overrideTier} onValueChange={setOverrideTier}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="freelancer">Freelancer</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                        <SelectItem value="agency">Agency</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Period</Label>
                    <Select value={overridePeriod} onValueChange={setOverridePeriod}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Input value={overrideNotes} onChange={(e) => setOverrideNotes(e.target.value)} placeholder="e.g. Test user for QA" className="h-9" />
                </div>
                <Button size="sm" onClick={setOverride} disabled={overrideLoading}>
                  {overrideLoading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Set Override
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Active Overrides</CardTitle>
                <CardDescription>{existingOverrides.length} override(s)</CardDescription>
              </CardHeader>
              <CardContent>
                {existingOverrides.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No overrides set</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-auto">
                    {existingOverrides.map((o) => (
                      <div key={o.id} className="flex items-center justify-between border rounded px-3 py-2">
                        <div>
                          <p className="font-mono text-xs">{o.user_id}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="secondary" className="capitalize text-xs">{o.tier}</Badge>
                            <Badge variant="outline" className="text-xs">{o.billing_period}</Badge>
                          </div>
                          {o.notes && <p className="text-xs text-muted-foreground mt-1">{o.notes}</p>}
                        </div>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeOverride(o.user_id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
