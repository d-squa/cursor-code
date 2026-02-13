import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Users, BarChart3, Zap, Globe, CreditCard, Activity, TrendingUp, Layers, RefreshCw, ShieldCheck, Image, Send, ArrowLeft } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#94a3b8",
];

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
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("admin-platform-stats");
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setStats(data);
    } catch (e: any) {
      setError(e.message || "Failed to load stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchStats();
    } else if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
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
          <Button variant="outline" size="sm" onClick={fetchStats}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
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
      </div>
    </div>
  );
}
