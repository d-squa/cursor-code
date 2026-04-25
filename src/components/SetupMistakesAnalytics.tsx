import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { format, differenceInHours } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface Props {
  selectedCampaign: string;
  selectedClient: string;
  dateRange: { from: Date | undefined; to: Date | undefined };
}

interface MistakeRow {
  id: string;
  campaign_id: string;
  team_id: string | null;
  platform: string | null;
  market: string | null;
  phase_name: string | null;
  ad_set_name: string | null;
  ad_name: string | null;
  entity_type: string | null;
  title: string;
  status: "open" | "resolved";
  created_by: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  campaign_name?: string;
  created_by_email?: string;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--secondary))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
];

export function SetupMistakesAnalytics({ selectedCampaign, selectedClient, dateRange }: Props) {
  const [loading, setLoading] = useState(true);
  const [mistakes, setMistakes] = useState<MistakeRow[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        let query = (supabase.from("setup_mistakes" as any) as any)
          .select("*")
          .order("created_at", { ascending: false });

        if (selectedCampaign && selectedCampaign !== "all") {
          query = query.eq("campaign_id", selectedCampaign);
        }
        if (dateRange.from) query = query.gte("created_at", dateRange.from.toISOString());
        if (dateRange.to) query = query.lte("created_at", dateRange.to.toISOString());

        const { data, error } = await query;
        if (error) throw error;

        let rows = (data || []) as MistakeRow[];

        // Hydrate campaign names + client filter
        const campaignIds = Array.from(new Set(rows.map((r) => r.campaign_id))).filter(Boolean);
        if (campaignIds.length > 0) {
          const { data: campaigns } = await supabase
            .from("campaigns")
            .select("id, name, generic_config")
            .in("id", campaignIds);
          const map = new Map((campaigns || []).map((c: any) => [c.id, c]));
          rows = rows
            .map((r) => ({ ...r, campaign_name: (map.get(r.campaign_id) as any)?.name }))
            .filter((r) => {
              if (selectedClient === "all") return true;
              const c = map.get(r.campaign_id) as any;
              return c?.generic_config?.client_id === selectedClient;
            });
        }

        // Hydrate user emails
        const userIds = Array.from(
          new Set(rows.map((r) => r.created_by).filter(Boolean))
        );
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, email")
            .in("id", userIds);
          const pmap = new Map((profs || []).map((p: any) => [p.id, p.email]));
          rows = rows.map((r) => ({ ...r, created_by_email: pmap.get(r.created_by) }));
        }

        setMistakes(rows);
      } catch (e) {
        console.error("Error loading setup mistakes:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedCampaign, selectedClient, dateRange.from, dateRange.to]);

  const stats = useMemo(() => {
    const total = mistakes.length;
    const open = mistakes.filter((m) => m.status === "open").length;
    const resolved = mistakes.filter((m) => m.status === "resolved").length;
    const resolvedWithTimes = mistakes.filter((m) => m.status === "resolved" && m.resolved_at);
    const avgResolveHours =
      resolvedWithTimes.length > 0
        ? resolvedWithTimes.reduce(
            (acc, m) => acc + differenceInHours(new Date(m.resolved_at!), new Date(m.created_at)),
            0
          ) / resolvedWithTimes.length
        : 0;
    return { total, open, resolved, avgResolveHours };
  }, [mistakes]);

  const groupBy = (key: keyof MistakeRow) => {
    const map = new Map<string, { name: string; open: number; resolved: number; total: number }>();
    mistakes.forEach((m) => {
      const v = (m[key] as string) || "—";
      const cur = map.get(v) || { name: v, open: 0, resolved: 0, total: 0 };
      cur.total += 1;
      if (m.status === "open") cur.open += 1;
      else cur.resolved += 1;
      map.set(v, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  };

  const byActiplan = useMemo(() => {
    const map = new Map<string, { name: string; open: number; resolved: number; total: number }>();
    mistakes.forEach((m) => {
      const v = m.campaign_name || m.campaign_id || "—";
      const cur = map.get(v) || { name: v, open: 0, resolved: 0, total: 0 };
      cur.total += 1;
      if (m.status === "open") cur.open += 1;
      else cur.resolved += 1;
      map.set(v, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [mistakes]);

  const byPlatform = useMemo(() => groupBy("platform"), [mistakes]);
  const byPhase = useMemo(() => groupBy("phase_name"), [mistakes]);
  const byUser = useMemo(() => {
    const map = new Map<string, { name: string; open: number; resolved: number; total: number }>();
    mistakes.forEach((m) => {
      const v = m.created_by_email || m.created_by || "—";
      const cur = map.get(v) || { name: v, open: 0, resolved: 0, total: 0 };
      cur.total += 1;
      if (m.status === "open") cur.open += 1;
      else cur.resolved += 1;
      map.set(v, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [mistakes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderBreakdown = (title: string, data: typeof byActiplan) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="open" stackId="a" fill="hsl(var(--destructive))" name="Open" />
              <Bar dataKey="resolved" stackId="a" fill="hsl(var(--primary))" name="Resolved" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Scorecards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Setup Mistakes</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Open</p>
                <p className="text-2xl font-bold">{stats.open}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Resolved</p>
                <p className="text-2xl font-bold">{stats.resolved}</p>
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
                <p className="text-sm text-muted-foreground">Avg. Time to Resolve</p>
                <p className="text-2xl font-bold">{stats.avgResolveHours.toFixed(1)}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderBreakdown("By ActiPlan (top 10)", byActiplan)}
        {renderBreakdown("By Platform", byPlatform)}
        {renderBreakdown("By Phase", byPhase)}
        {renderBreakdown("By User (top 10)", byUser)}
      </div>

      {/* Detail table */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Mistakes Details</CardTitle>
          <CardDescription>All logged setup mistakes with current status</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>ActiPlan</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Ad Set</TableHead>
                <TableHead>Ad</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mistakes.slice(0, 100).map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Badge variant={m.status === "open" ? "destructive" : "default"}>
                      {m.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{m.title}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{m.campaign_name || "—"}</TableCell>
                  <TableCell>{m.platform || "—"}</TableCell>
                  <TableCell>{m.market || "—"}</TableCell>
                  <TableCell>{m.phase_name || "—"}</TableCell>
                  <TableCell className="max-w-[140px] truncate">{m.ad_set_name || "—"}</TableCell>
                  <TableCell className="max-w-[140px] truncate">{m.ad_name || "—"}</TableCell>
                  <TableCell className="text-sm">{m.created_by_email || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(m.created_at), "MMM dd, yyyy")}
                  </TableCell>
                </TableRow>
              ))}
              {mistakes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No setup mistakes logged for the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {mistakes.length > 100 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Showing 100 of {mistakes.length} mistakes
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
