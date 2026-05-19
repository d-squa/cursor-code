import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { cn } from "@/lib/utils";
import ChartDataTable from "./ChartDataTable";

interface MetricComparisonChartProps {
  data: any[];
  plannedMetrics: {
    cpm?: number;
    cpr?: number;
    sov?: number;
    frequency?: number;
    ctr?: number;
    cpc?: number;
    costPerResult?: number;
    resultRate?: number;
  };
  title?: string;
}

const ACTUAL_METRICS = [
  { key: 'actual_cpm', dataKey: 'cpm', label: 'CPM', type: 'actual' },
  { key: 'actual_cpr', dataKey: 'cpr', label: 'CPR', type: 'actual' },
  { key: 'actual_sov', dataKey: 'sov', label: 'SOV', type: 'actual' },
  { key: 'actual_frequency', dataKey: 'frequency', label: 'Frequency', type: 'actual' },
  { key: 'actual_ctr', dataKey: 'ctr', label: 'CTR', type: 'actual' },
  { key: 'actual_cpc', dataKey: 'cpc', label: 'CPC', type: 'actual' },
  { key: 'actual_costPerResult', dataKey: 'costPerResult', label: 'Cost Per Results', type: 'actual' },
  { key: 'actual_resultRate', dataKey: 'resultRate', label: 'Result Rate', type: 'actual' },
];

const PLANNED_METRICS = [
  { key: 'planned_cpm', dataKey: 'plannedCpm', label: 'CPM', type: 'planned' },
  { key: 'planned_cpr', dataKey: 'plannedCpr', label: 'CPR', type: 'planned' },
  { key: 'planned_sov', dataKey: 'plannedSov', label: 'SOV', type: 'planned' },
  { key: 'planned_frequency', dataKey: 'plannedFrequency', label: 'Frequency', type: 'planned' },
  { key: 'planned_ctr', dataKey: 'plannedCtr', label: 'CTR', type: 'planned' },
  { key: 'planned_cpc', dataKey: 'plannedCpc', label: 'CPC', type: 'planned' },
  { key: 'planned_costPerResult', dataKey: 'plannedCostPerResult', label: 'Cost Per Results', type: 'planned' },
  { key: 'planned_resultRate', dataKey: 'plannedResultRate', label: 'Result Rate', type: 'planned' },
];

const ALL_METRICS = [...ACTUAL_METRICS, ...PLANNED_METRICS];

const LINE_COLORS = {
  metric1: 'hsl(217, 91%, 60%)', // blue
  metric2: 'hsl(0, 84%, 60%)',   // red
};

export default function MetricComparisonChart({
  data,
  plannedMetrics,
  title = "Cost & Rate Metrics Comparison"
}: MetricComparisonChartProps) {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['actual_resultRate', 'actual_cpm']);

  const toggleMetric = (key: string) => {
    setSelectedMetrics(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      }
      // Allow max 2 selections
      if (prev.length >= 2) {
        return [prev[1], key];
      }
      return [...prev, key];
    });
  };

  // Prepare data with planned metrics as constants across all periods
  const chartData = data.map(row => ({
    ...row,
    plannedCpm: plannedMetrics.cpm || 0,
    plannedCpr: plannedMetrics.cpr || 0,
    plannedSov: plannedMetrics.sov || 0,
    plannedFrequency: plannedMetrics.frequency || 0,
    plannedCtr: plannedMetrics.ctr || 0,
    plannedCpc: plannedMetrics.cpc || 0,
    plannedCostPerResult: plannedMetrics.costPerResult || 0,
    plannedResultRate: plannedMetrics.resultRate || 0,
    // Calculate CPR if not present
    cpr: row.cpr || (row.reach > 0 ? (row.actualSpend || row.spend || 0) / row.reach * 1000 : 0),
  }));

  const getMetricConfig = (key: string) => ALL_METRICS.find(m => m.key === key);

  const selectedConfig1 = getMetricConfig(selectedMetrics[0]);
  const selectedConfig2 = getMetricConfig(selectedMetrics[1]);

  const tableColumns = [
    { key: 'period', label: 'Period' },
    ...selectedMetrics.map(key => {
      const config = getMetricConfig(key);
      return { 
        key: config?.dataKey || key, 
        label: `${config?.type === 'planned' ? 'Planned ' : 'Actual '}${config?.label}` 
      };
    })
  ];

  const renderMetricSelector = (type: 'actual' | 'planned', metrics: typeof ACTUAL_METRICS) => (
    <div className="space-y-1">
      {metrics.map((metric) => (
        <Badge
          key={metric.key}
          variant={selectedMetrics.includes(metric.key) ? "default" : "outline"}
          className={cn(
            "cursor-pointer text-xs transition-all duration-200 mr-1 mb-1",
            selectedMetrics.includes(metric.key) 
              ? selectedMetrics[0] === metric.key 
                ? "bg-blue-500 text-white shadow-sm"
                : "bg-red-500 text-white shadow-sm"
              : "hover:bg-muted"
          )}
          onClick={() => toggleMetric(metric.key)}
        >
          <span className="text-muted-foreground mr-1 text-[10px] capitalize">{type}</span>
          {metric.label}
        </Badge>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-6">
            <div className="flex flex-col gap-1 min-w-[120px]">
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
              <span className="text-xs text-muted-foreground">Choose 2</span>
            </div>
            <div className="flex flex-col gap-2 flex-1">
              {renderMetricSelector('actual', ACTUAL_METRICS)}
              {renderMetricSelector('planned', PLANNED_METRICS)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="gradient-metric1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={LINE_COLORS.metric1} stopOpacity={0.8} />
                    <stop offset="100%" stopColor={LINE_COLORS.metric1} stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="gradient-metric2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={LINE_COLORS.metric2} stopOpacity={0.8} />
                    <stop offset="100%" stopColor={LINE_COLORS.metric2} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                <XAxis 
                  dataKey="period" 
                  className="text-xs"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  yAxisId="left"
                  className="text-xs"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                  tickFormatter={(v) => {
                    const config = selectedConfig1;
                    if (config?.label.includes('Rate') || config?.label === 'SOV' || config?.label === 'CTR') {
                      return `${v.toFixed(1)}%`;
                    }
                    if (config?.label === 'CPC' || config?.label === 'CPM' || config?.label === 'CPR' || config?.label.includes('Cost')) {
                      return `${v.toFixed(2)}`;
                    }
                    return v.toFixed(2);
                  }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  className="text-xs"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                  tickFormatter={(v) => {
                    const config = selectedConfig2;
                    if (config?.label.includes('Rate') || config?.label === 'SOV' || config?.label === 'CTR') {
                      return `${v.toFixed(1)}%`;
                    }
                    if (config?.label === 'CPC' || config?.label === 'CPM' || config?.label === 'CPR' || config?.label.includes('Cost')) {
                      return `${v.toFixed(2)}`;
                    }
                    return v.toFixed(2);
                  }}
                />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '12px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
                  }}
                  formatter={(value: number, name: string) => {
                    const metric = ALL_METRICS.find(m => m.dataKey === name);
                    const label = metric ? `${metric.type === 'planned' ? 'Planned ' : 'Actual '}${metric.label}` : name;
                    if (metric?.label.includes('Rate') || metric?.label === 'SOV' || metric?.label === 'CTR') {
                      return [`${value.toFixed(2)}%`, label];
                    }
                    if (metric?.label === 'CPC' || metric?.label === 'CPM' || metric?.label === 'CPR' || metric?.label.includes('Cost')) {
                      return [`${value.toFixed(2)}`, label];
                    }
                    return [value.toFixed(2), label];
                  }}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  iconType="circle"
                />
                
                {selectedConfig1 && (
                  <Line
                    yAxisId="left"
                    dataKey={selectedConfig1.dataKey}
                    name={selectedConfig1.dataKey}
                    stroke={LINE_COLORS.metric1}
                    strokeWidth={3}
                    dot={{ fill: LINE_COLORS.metric1, r: 5, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                    activeDot={{ r: 8, strokeWidth: 3, stroke: 'hsl(var(--background))' }}
                    animationDuration={1000}
                  />
                )}
                
                {selectedConfig2 && (
                  <Line
                    yAxisId="right"
                    dataKey={selectedConfig2.dataKey}
                    name={selectedConfig2.dataKey}
                    stroke={LINE_COLORS.metric2}
                    strokeWidth={3}
                    dot={{ fill: LINE_COLORS.metric2, r: 5, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                    activeDot={{ r: 8, strokeWidth: 3, stroke: 'hsl(var(--background))' }}
                    animationDuration={1000}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ChartDataTable 
            data={chartData} 
            columns={tableColumns} 
            filename="metric-comparison" 
          />
        </CardContent>
      </Card>
    </div>
  );
}
