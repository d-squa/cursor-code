import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Area
} from "recharts";
import ChartDataTable from "./ChartDataTable";
import { cn } from "@/lib/utils";

interface MetricOption {
  key: string;
  label: string;
  color: string;
  type: 'bar' | 'line' | 'area';
  yAxisId?: 'left' | 'right';
}

interface TimeSeriesChartProps {
  title: string;
  data: any[];
  metricOptions: MetricOption[];
  defaultMetrics?: string[];
  xAxisKey?: string;
  filename?: string;
}

export default function TimeSeriesChart({
  title,
  data,
  metricOptions,
  defaultMetrics,
  xAxisKey = 'period',
  filename,
}: TimeSeriesChartProps) {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
    defaultMetrics || metricOptions.slice(0, 3).map(m => m.key)
  );

  const toggleMetric = (key: string) => {
    setSelectedMetrics(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const activeMetrics = metricOptions.filter(m => selectedMetrics.includes(m.key));
  const hasRightAxis = activeMetrics.some(m => m.yAxisId === 'right');

  const tableColumns = [
    { key: xAxisKey, label: 'Period' },
    ...metricOptions.map(m => ({ key: m.key, label: m.label }))
  ];

  return (
    <Card className="overflow-hidden group hover:shadow-lg transition-all duration-300">
      <CardHeader className="pb-2 bg-gradient-to-r from-muted/30 to-transparent">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          <div className="flex flex-wrap gap-1">
            {metricOptions.map((metric) => (
              <Badge
                key={metric.key}
                variant={selectedMetrics.includes(metric.key) ? "default" : "outline"}
                className={cn(
                  "cursor-pointer text-xs transition-all duration-200 hover:scale-105",
                  selectedMetrics.includes(metric.key) && "shadow-sm"
                )}
                style={{
                  backgroundColor: selectedMetrics.includes(metric.key) ? metric.color : undefined,
                  borderColor: metric.color,
                  color: selectedMetrics.includes(metric.key) ? 'white' : metric.color,
                }}
                onClick={() => toggleMetric(metric.key)}
              >
                {metric.label}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <defs>
                {metricOptions.map(metric => (
                  <linearGradient key={`gradient-${metric.key}`} id={`gradient-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={metric.color} stopOpacity={0.8} />
                    <stop offset="100%" stopColor={metric.color} stopOpacity={0.1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
              <XAxis 
                dataKey={xAxisKey} 
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
                tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
              />
              {hasRightAxis && (
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  className="text-xs"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                  tickFormatter={(v) => typeof v === 'number' && v < 100 ? v.toFixed(2) : v}
                />
              )}
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  fontSize: '12px',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
                }}
                formatter={(value: number, name: string) => {
                  const metric = metricOptions.find(m => m.key === name);
                  if (value >= 1000000) return [`${(value / 1000000).toFixed(2)}M`, metric?.label || name];
                  if (value >= 1000) return [`${(value / 1000).toFixed(2)}K`, metric?.label || name];
                  return [value.toFixed(2), metric?.label || name];
                }}
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
              />
              <Legend 
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                iconType="circle"
              />
              
              {activeMetrics.map((metric) => {
                const commonProps = {
                  key: metric.key,
                  dataKey: metric.key,
                  name: metric.label,
                  yAxisId: metric.yAxisId || 'left',
                };

                if (metric.type === 'bar') {
                  return (
                    <Bar
                      {...commonProps}
                      fill={`url(#gradient-${metric.key})`}
                      radius={[6, 6, 0, 0]}
                      animationDuration={1000}
                      animationBegin={200}
                    />
                  );
                }
                if (metric.type === 'area') {
                  return (
                    <Area
                      {...commonProps}
                      fill={`url(#gradient-${metric.key})`}
                      stroke={metric.color}
                      strokeWidth={2}
                      animationDuration={1000}
                    />
                  );
                }
                return (
                  <Line
                    {...commonProps}
                    stroke={metric.color}
                    strokeWidth={3}
                    dot={{ fill: metric.color, r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                    activeDot={{ r: 7, strokeWidth: 3, stroke: 'hsl(var(--background))' }}
                    animationDuration={1000}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <ChartDataTable 
          data={data} 
          columns={tableColumns} 
          filename={filename || title.toLowerCase().replace(/\s+/g, '-')} 
        />
      </CardContent>
    </Card>
  );
}
