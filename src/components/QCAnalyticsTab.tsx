import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInMinutes, differenceInHours } from "date-fns";
import { Loader2, ShieldCheck, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
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
import { QC_STATE_LABELS, QC_STAGE_ORDER, getQCColorClass } from "@/utils/qcUtils";
import type { QCState } from "@/utils/qcUtils";

interface QCAnalyticsTabProps {
  userId: string;
  selectedCampaign?: string;
  dateRange?: { from: Date | undefined; to: Date | undefined };
}

interface QCTrackingRow {
  id: string;
  campaign_id: string;
  platform: string;
  entity_type: string;
  entity_name: string | null;
  current_state: QCState;
  auto_completed: boolean;
  is_valid: boolean;
  validation_error: string | null;
  created_at: string;
  updated_at: string;
}

interface QCCheckCompletionRow {
  id: string;
  qc_tracking_id: string;
  item_key: string;
  is_checked: boolean;
  check_method: string;
}

interface QCTransitionRow {
  id: string;
  qc_tracking_id: string;
  campaign_id: string;
  from_state: QCState | null;
  to_state: QCState;
  transitioned_at: string;
  detected_via: string;
  impressions_at_transition: number;
  metadata: any;
}

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];

export function QCAnalyticsTab({ userId, selectedCampaign, dateRange }: QCAnalyticsTabProps) {
  const [tracking, setTracking] = useState<QCTrackingRow[]>([]);
  const [transitions, setTransitions] = useState<QCTransitionRow[]>([]);
  const [checkCompletions, setCheckCompletions] = useState<QCCheckCompletionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [userId, selectedCampaign, dateRange]);

  const loadData = async () => {
    try {
      setLoading(true);

      let trackingQuery = supabase.from("qc_tracking").select("*").eq("user_id", userId);
      let transitionsQuery = supabase.from("qc_state_transitions").select("*");

      if (selectedCampaign && selectedCampaign !== "all") {
        trackingQuery = trackingQuery.eq("campaign_id", selectedCampaign);
        transitionsQuery = transitionsQuery.eq("campaign_id", selectedCampaign);
      }

      if (dateRange?.from) {
        trackingQuery = trackingQuery.gte("created_at", dateRange.from.toISOString());
        transitionsQuery = transitionsQuery.gte("transitioned_at", dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        trackingQuery = trackingQuery.lte("created_at", dateRange.to.toISOString());
        transitionsQuery = transitionsQuery.lte("transitioned_at", dateRange.to.toISOString());
      }

      const [trackingRes, transitionsRes] = await Promise.all([
        trackingQuery.order("created_at", { ascending: false }),
        transitionsQuery.order("transitioned_at", { ascending: true }),
      ]);

      const trackingData = (trackingRes.data || []) as unknown as QCTrackingRow[];
      setTracking(trackingData);
      setTransitions((transitionsRes.data || []) as unknown as QCTransitionRow[]);

      // Fetch check completions for PWR calculation
      if (trackingData.length > 0) {
        const trackingIds = trackingData.map(t => t.id);
        const { data: completionsData } = await supabase
          .from("qc_checklist_completions")
          .select("id, qc_tracking_id, item_key, is_checked, check_method")
          .in("qc_tracking_id", trackingIds)
          .eq("is_checked", true);
        setCheckCompletions((completionsData || []) as unknown as QCCheckCompletionRow[]);
      } else {
        setCheckCompletions([]);
      }
    } catch (error) {
      console.error("Error loading QC analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  // Stage distribution
  const stageDistribution = useMemo(() => {
    return QC_STAGE_ORDER.map(stage => ({
      name: QC_STATE_LABELS[stage],
      count: tracking.filter(t => t.current_state === stage).length,
    }));
  }, [tracking]);

  // Average time between stages
  const avgStageTimes = useMemo(() => {
    const stagePairs: { from: QCState; to: QCState; durations: number[] }[] = [];

    for (let i = 0; i < QC_STAGE_ORDER.length - 1; i++) {
      const from = QC_STAGE_ORDER[i];
      const to = QC_STAGE_ORDER[i + 1];
      stagePairs.push({ from, to, durations: [] });
    }

    // Group transitions by tracking ID
    const byTracking = transitions.reduce<Record<string, QCTransitionRow[]>>((acc, t) => {
      if (!acc[t.qc_tracking_id]) acc[t.qc_tracking_id] = [];
      acc[t.qc_tracking_id].push(t);
      return acc;
    }, {});

    for (const itemTransitions of Object.values(byTracking)) {
      for (let i = 1; i < itemTransitions.length; i++) {
        const prev = itemTransitions[i - 1];
        const curr = itemTransitions[i];
        const pair = stagePairs.find(p => p.from === prev.to_state && p.to === curr.to_state);
        if (pair) {
          const mins = differenceInMinutes(new Date(curr.transitioned_at), new Date(prev.transitioned_at));
          pair.durations.push(mins);
        }
      }
    }

    return stagePairs.map(p => ({
      name: `${QC_STATE_LABELS[p.from].substring(0, 8)} → ${QC_STATE_LABELS[p.to].substring(0, 8)}`,
      avgMinutes: p.durations.length > 0 ? Math.round(p.durations.reduce((a, b) => a + b, 0) / p.durations.length) : 0,
      avgHours: p.durations.length > 0 ? +(p.durations.reduce((a, b) => a + b, 0) / p.durations.length / 60).toFixed(1) : 0,
      count: p.durations.length,
    }));
  }, [transitions]);

  // Sequential integrity violations
  const violations = useMemo(() => {
    return transitions.filter(t => t.metadata?.skipped_stages && t.metadata.skipped_stages.length > 0);
  }, [transitions]);

  // Errors
  const errors = useMemo(() => {
    return tracking.filter(t => !t.is_valid);
  }, [tracking]);

  // Platform breakdown
  const platformBreakdown = useMemo(() => {
    const byPlatform: Record<string, Record<string, number>> = {};
    tracking.forEach(t => {
      if (!byPlatform[t.platform]) byPlatform[t.platform] = {};
      byPlatform[t.platform][t.current_state] = (byPlatform[t.platform][t.current_state] || 0) + 1;
    });

    return Object.entries(byPlatform).map(([platform, states]) => ({
      platform,
      ...QC_STAGE_ORDER.reduce((acc, stage) => ({ ...acc, [QC_STATE_LABELS[stage]]: states[stage] || 0 }), {}),
    }));
  }, [tracking]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tracking.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No QC tracking data available for the selected filters.</p>
        </CardContent>
      </Card>
    );
  }

  const totalToDelivering = tracking.filter(t => t.current_state === 'delivering').length;
  const autoCompletedCount = tracking.filter(t => t.auto_completed).length;

  // PWR (Pencil Whip Rate) calculation
  const bulkChecks = checkCompletions.filter(c => c.check_method === 'bulk').length;
  const individualChecks = checkCompletions.filter(c => c.check_method === 'individual').length;
  const totalChecks = bulkChecks + individualChecks;
  const pwrRate = totalChecks > 0 ? ((bulkChecks / totalChecks) * 100).toFixed(1) : '0.0';
  const pwrColor = parseFloat(pwrRate) > 50 ? 'text-destructive' : parseFloat(pwrRate) > 25 ? 'text-amber-600' : 'text-green-600';

  return (
    <div className="space-y-6">
      {/* QC Scorecards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total Tracked</p>
              <p className="text-2xl font-bold">{tracking.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Delivering (Live)</p>
              <p className="text-2xl font-bold text-green-600">{totalToDelivering}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Auto-Completed</p>
              <p className="text-2xl font-bold">{autoCompletedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Violations</p>
              <p className="text-2xl font-bold text-amber-600">{violations.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Errors</p>
              <p className="text-2xl font-bold text-destructive">{errors.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground" title={`Bulk: ${bulkChecks} | Individual: ${individualChecks}. High rate may indicate checks are being rushed.`}>
                PWR (Pencil Whip Rate)
              </p>
              <p className={`text-2xl font-bold ${pwrColor}`}>{pwrRate}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stage Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Stage Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" name="Entities" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Avg Time Between Stages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avg. Time Between QC Stages</CardTitle>
            <CardDescription>Average hours between each QC transition</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={avgStageTimes} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: number) => [`${val}h`, 'Avg Hours']} />
                  <Bar dataKey="avgHours" fill="hsl(var(--accent))" name="Avg Hours" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Breakdown */}
      {platformBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">QC Status by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="platform" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {QC_STAGE_ORDER.map((stage, i) => (
                    <Bar key={stage} dataKey={QC_STATE_LABELS[stage]} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Violations & Errors Table */}
      {(violations.length > 0 || errors.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              QC Issues
            </CardTitle>
            <CardDescription>Skipped stages and validation errors</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {violations.map(v => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Skipped Stage
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{v.qc_tracking_id.substring(0, 8)}...</TableCell>
                    <TableCell className="text-sm">-</TableCell>
                    <TableCell className="text-sm">
                      Skipped: {(v.metadata.skipped_stages as QCState[]).map(s => QC_STATE_LABELS[s]).join(', ')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(v.transitioned_at), 'MMM d, HH:mm')}
                    </TableCell>
                  </TableRow>
                ))}
                {errors.map(e => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Badge variant="destructive">Error</Badge>
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[200px]">{e.entity_name || '-'}</TableCell>
                    <TableCell className="text-sm capitalize">{e.platform}</TableCell>
                    <TableCell className="text-sm">{e.validation_error}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(e.updated_at), 'MMM d, HH:mm')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
