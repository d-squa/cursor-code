import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, differenceInHours, differenceInDays } from "date-fns";
import { CalendarIcon, Loader2, Clock, Users, FileText, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface ModificationRequestsAnalyticsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AnalyticsData {
  totalRequests: number;
  avgTimeToComplete: number;
  requestsByUser: { user: string; count: number }[];
  assignmentsByUser: { user: string; count: number }[];
  requestsByType: { type: string; count: number }[];
  requestsByStatus: { status: string; count: number }[];
  avgCampaignLifecycle: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];

export function ModificationRequestsAnalytics({
  open,
  onOpenChange,
}: ModificationRequestsAnalyticsProps) {
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (open) {
      loadCampaigns();
      loadAnalytics();
    }
  }, [open, dateRange, campaignFilter]);

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name")
        .order("name");

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error: any) {
      console.error("Error loading campaigns:", error);
    }
  };

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Build query
      let query = supabase
        .from("modification_requests")
        .select("*, campaigns!inner(name, created_at, published_at, user_id)");

      if (campaignFilter !== "all") {
        query = query.eq("campaign_id", campaignFilter);
      }

      if (dateRange.from) {
        query = query.gte("created_at", dateRange.from.toISOString());
      }

      if (dateRange.to) {
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("created_at", endOfDay.toISOString());
      }

      const { data: requests, error } = await query;

      if (error) throw error;

      // Fetch user profiles
      const userIds = new Set<string>();
      requests?.forEach((r: any) => {
        userIds.add(r.requester_id);
        if (r.assigned_to) {
          r.assigned_to.forEach((id: string) => userIds.add(id));
        }
        userIds.add(r.campaigns.user_id);
      });

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(userIds));

      const profilesMap = Object.fromEntries((profiles || []).map((p) => [p.id, p.email]));

      // Calculate analytics
      const totalRequests = requests?.length || 0;

      // Avg time to complete (only completed requests)
      const completedRequests = requests?.filter((r: any) => r.status === "completed") || [];
      const completionTimes = completedRequests.map((r: any) => {
        const created = new Date(r.created_at);
        const completed = new Date(r.updated_at);
        return differenceInHours(completed, created);
      });
      const avgTimeToComplete = completionTimes.length > 0
        ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
        : 0;

      // Requests by user
      const requestsByUserMap = new Map<string, number>();
      requests?.forEach((r: any) => {
        const email = profilesMap[r.requester_id] || "Unknown";
        requestsByUserMap.set(email, (requestsByUserMap.get(email) || 0) + 1);
      });
      const requestsByUser = Array.from(requestsByUserMap.entries())
        .map(([user, count]) => ({ user, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Assignments by user
      const assignmentsByUserMap = new Map<string, number>();
      requests?.forEach((r: any) => {
        if (r.assigned_to) {
          r.assigned_to.forEach((userId: string) => {
            const email = profilesMap[userId] || "Unknown";
            assignmentsByUserMap.set(email, (assignmentsByUserMap.get(email) || 0) + 1);
          });
        }
      });
      const assignmentsByUser = Array.from(assignmentsByUserMap.entries())
        .map(([user, count]) => ({ user, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Requests by type
      const requestsByTypeMap = new Map<string, number>();
      requests?.forEach((r: any) => {
        requestsByTypeMap.set(r.change_type, (requestsByTypeMap.get(r.change_type) || 0) + 1);
      });
      const requestsByType = Array.from(requestsByTypeMap.entries())
        .map(([type, count]) => ({ type, count }));

      // Requests by status
      const requestsByStatusMap = new Map<string, number>();
      requests?.forEach((r: any) => {
        requestsByStatusMap.set(r.status, (requestsByStatusMap.get(r.status) || 0) + 1);
      });
      const requestsByStatus = Array.from(requestsByStatusMap.entries())
        .map(([status, count]) => ({ status, count }));

      // Avg campaign lifecycle (draft to published)
      const campaignsWithPublish = requests
        ?.map((r: any) => r.campaigns)
        .filter((c: any) => c.published_at) || [];
      
      const lifecycleTimes = campaignsWithPublish.map((c: any) => {
        const created = new Date(c.created_at);
        const published = new Date(c.published_at);
        return differenceInDays(published, created);
      });
      const avgCampaignLifecycle = lifecycleTimes.length > 0
        ? lifecycleTimes.reduce((a, b) => a + b, 0) / lifecycleTimes.length
        : 0;

      setAnalytics({
        totalRequests,
        avgTimeToComplete,
        requestsByUser,
        assignmentsByUser,
        requestsByType,
        requestsByStatus,
        avgCampaignLifecycle,
      });
    } catch (error: any) {
      console.error("Error loading analytics:", error);
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Modification Requests Analytics</DialogTitle>
          <DialogDescription>
            Track performance metrics and insights across all campaigns
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-auto">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Date Range</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[240px] justify-start text-left font-normal",
                        !dateRange.from && !dateRange.to && "text-muted-foreground"
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
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Campaign</label>
                <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(dateRange.from || dateRange.to || campaignFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateRange({ from: undefined, to: undefined });
                    setCampaignFilter("all");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>

            {analytics && (
              <>
                {/* Scorecards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{analytics.totalRequests}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Avg. Completion Time</CardTitle>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {analytics.avgTimeToComplete.toFixed(1)}h
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Avg. Campaign Lifecycle</CardTitle>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {analytics.avgCampaignLifecycle.toFixed(1)} days
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Draft to Published</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {analytics.requestsByUser.length}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Requests by User</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analytics.requestsByUser}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="user" 
                            angle={-45} 
                            textAnchor="end" 
                            height={100}
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis />
                          <RechartsTooltip />
                          <Bar dataKey="count" fill="hsl(var(--primary))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Assignments by User</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analytics.assignmentsByUser}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="user" 
                            angle={-45} 
                            textAnchor="end" 
                            height={100}
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis />
                          <RechartsTooltip />
                          <Bar dataKey="count" fill="hsl(var(--secondary))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Requests by Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={analytics.requestsByType}
                            dataKey="count"
                            nameKey="type"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label
                          >
                            {analytics.requestsByType.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Requests by Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={analytics.requestsByStatus}
                            dataKey="count"
                            nameKey="status"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label
                          >
                            {analytics.requestsByStatus.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
