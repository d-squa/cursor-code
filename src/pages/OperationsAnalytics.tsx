import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, differenceInHours, differenceInMinutes } from "date-fns";
import { Loader2, CalendarIcon, Clock, Users, TrendingUp, ArrowLeft, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeatureGate } from "@/components/FeatureGate";
import { QCAnalyticsTab } from "@/components/QCAnalyticsTab";
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

interface Client {
  id: string;
  name: string;
}

interface Campaign {
  id: string;
  name: string;
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
  campaign_name?: string;
  time_to_complete?: number; // in hours
}

interface OperationDefault {
  operation_type: string;
  operation_subtype: string;
  estimated_hours: number;
}

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function OperationsAnalytics() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [operations, setOperations] = useState<OperationRecord[]>([]);
  const [defaults, setDefaults] = useState<OperationDefault[]>([]);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [dimensionFilter, setDimensionFilter] = useState<string>("user");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Read client ID and campaign ID from URL params on mount
  useEffect(() => {
    const clientFromUrl = searchParams.get('client');
    const campaignFromUrl = searchParams.get('campaign');
    if (clientFromUrl) {
      setSelectedClient(clientFromUrl);
    }
    if (campaignFromUrl) {
      setSelectedCampaign(campaignFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, selectedClient, selectedCampaign]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load clients
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      setClients(clientsData || []);

      // Load campaigns
      const { data: campaignsData } = await supabase
        .from("campaigns")
        .select("id, name")
        .order("name");
      setCampaigns(campaignsData || []);

      // Load operation defaults for selected client
      let defaultsQuery = supabase.from('client_operation_defaults').select('*');
      if (selectedClient !== 'all') {
        defaultsQuery = defaultsQuery.eq('client_id', selectedClient);
      }
      const { data: defaultsData } = await defaultsQuery;
      setDefaults(defaultsData || []);

      // Load modification requests
      let modRequestsQuery = supabase
        .from("modification_requests")
        .select(`
          id, change_type, requester_id, status, created_at, 
          estimated_hours, actual_hours, completed_by, completed_at,
          campaign_id,
          campaigns!inner(id, name)
        `)
        .order("created_at", { ascending: false });
      
      if (selectedCampaign !== 'all') {
        modRequestsQuery = modRequestsQuery.eq('campaign_id', selectedCampaign);
      }
      
      const { data: modRequests, error: modError } = await modRequestsQuery;

      if (modError) throw modError;

      // Load activity logs
      let activityLogsQuery = supabase
        .from("activity_logs")
        .select(`
          id, action_type, user_id, created_at,
          estimated_hours, actual_hours,
          campaign_id,
          campaigns!inner(id, name)
        `)
        .order("created_at", { ascending: false });
      
      if (selectedCampaign !== 'all') {
        activityLogsQuery = activityLogsQuery.eq('campaign_id', selectedCampaign);
      }
      
      const { data: activityLogs, error: actError } = await activityLogsQuery;

      if (actError) throw actError;

      // Collect all user IDs
      const userIds = new Set<string>();
      modRequests?.forEach(r => {
        userIds.add(r.requester_id);
        if (r.completed_by) userIds.add(r.completed_by);
      });
      activityLogs?.forEach(a => userIds.add(a.user_id));

      // Fetch user emails
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(userIds));

      const emailMap = Object.fromEntries((profiles || []).map(p => [p.id, p.email]));

      // Combine operations
      const combinedOperations: OperationRecord[] = [];

      modRequests?.forEach(r => {
        const timeToComplete = r.completed_at 
          ? differenceInMinutes(new Date(r.completed_at), new Date(r.created_at)) / 60
          : undefined;

        // Get estimated hours from defaults if not set
        let estimatedHours = r.estimated_hours;
        if (!estimatedHours) {
          const defaultEntry = defaults.find(
            d => d.operation_type === 'change_request' && d.operation_subtype === r.change_type
          );
          estimatedHours = defaultEntry?.estimated_hours;
        }

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
          estimated_hours: estimatedHours,
          actual_hours: r.actual_hours || undefined,
          status: r.status,
          campaign_name: (r.campaigns as any)?.name,
          time_to_complete: timeToComplete,
        });
      });

      activityLogs?.forEach(a => {
        // Get estimated hours from defaults if not set
        let estimatedHours = a.estimated_hours;
        if (!estimatedHours) {
          const defaultEntry = defaults.find(
            d => d.operation_type === 'logged_action' && d.operation_subtype === a.action_type
          );
          estimatedHours = defaultEntry?.estimated_hours;
        }

        combinedOperations.push({
          id: a.id,
          type: 'logged_action',
          subtype: a.action_type,
          requester_id: a.user_id,
          requester_email: emailMap[a.user_id],
          created_at: a.created_at,
          estimated_hours: estimatedHours,
          actual_hours: a.actual_hours || undefined,
          status: 'logged',
          campaign_name: (a.campaigns as any)?.name,
        });
      });

      setOperations(combinedOperations);
    } catch (error: any) {
      console.error("Error loading operations data:", error);
      toast.error("Failed to load operations data");
    } finally {
      setLoading(false);
    }
  };

  const handleActualHoursUpdate = async (operation: OperationRecord, hours: number) => {
    try {
      if (operation.type === 'change_request') {
        await supabase
          .from('modification_requests')
          .update({ actual_hours: hours })
          .eq('id', operation.id);
      } else {
        await supabase
          .from('activity_logs')
          .update({ actual_hours: hours })
          .eq('id', operation.id);
      }
      toast.success('Hours updated');
      await loadData();
    } catch (error) {
      toast.error('Failed to update hours');
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
      return true;
    });
  }, [operations, dateRange, typeFilter]);

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
      name,
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

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <FeatureGate feature="operations_analytics">
      <div className="container mx-auto py-8 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/overview')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Operations Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Track team workload and performance across change requests and logged actions
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium">Client</label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">ActiPlan</label>
                <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All ActiPlans" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ActiPlans</SelectItem>
                    {campaigns.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
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
                        "w-[240px] justify-start text-left font-normal",
                        !dateRange.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd, yyyy")}
                          </>
                        ) : (
                          format(dateRange.from, "MMM dd, yyyy")
                        )
                      ) : (
                        <span>Pick a date range</span>
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
                  <SelectTrigger className="w-[180px]">
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
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="type">Type</SelectItem>
                    <SelectItem value="subtype">Subtype</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(dateRange.from || typeFilter !== 'all' || selectedCampaign !== 'all' || selectedClient !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateRange({ from: undefined, to: undefined });
                    setTypeFilter('all');
                    setSelectedCampaign('all');
                    setSelectedClient('all');
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

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
                  <p className="text-sm text-muted-foreground">Avg. Completion Time</p>
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
              <CardTitle>Hours by {dimensionFilter === 'user' ? 'User' : dimensionFilter === 'type' ? 'Type' : 'Subtype'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={groupedData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="estimated" fill="hsl(var(--primary))" name="Estimated Hours" />
                    <Bar dataKey="actual" fill="hsl(var(--accent))" name="Actual Hours" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operations by Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {typeDistribution.map((_, index) => (
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

        {/* Detailed Table */}
        <Card>
          <CardHeader>
            <CardTitle>Operations Details</CardTitle>
            <CardDescription>
              All change requests and logged actions with time tracking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Subtype</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Completed By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Est. Hours</TableHead>
                  <TableHead>Actual Hours</TableHead>
                  <TableHead>Time to Complete</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOperations.slice(0, 50).map((op) => (
                  <TableRow key={`${op.type}-${op.id}`}>
                    <TableCell>
                      <Badge variant={op.type === 'change_request' ? 'default' : 'secondary'}>
                        {op.type === 'change_request' ? 'Request' : 'Action'}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{op.subtype}</TableCell>
                    <TableCell className="max-w-[150px] truncate">{op.campaign_name}</TableCell>
                    <TableCell className="text-sm">{op.requester_email}</TableCell>
                    <TableCell className="text-sm">{op.completed_by_email || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={op.status === 'completed' || op.status === 'logged' ? 'default' : 'outline'}>
                        {op.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{op.estimated_hours ? `${op.estimated_hours}h` : '-'}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        className="w-20 h-8"
                        value={op.actual_hours || ''}
                        placeholder="-"
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value)) {
                            handleActualHoursUpdate(op, value);
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {op.time_to_complete ? `${op.time_to_complete.toFixed(1)}h` : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(op.created_at), "MMM dd, yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredOperations.length > 50 && (
              <p className="text-sm text-muted-foreground text-center mt-4">
                Showing 50 of {filteredOperations.length} operations
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </FeatureGate>
  );
}
