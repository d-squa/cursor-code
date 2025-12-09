import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Area
} from "recharts";
import { Download } from "lucide-react";
import ChartDataTable from "./ChartDataTable";

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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex flex-wrap gap-1">
            {metricOptions.map((metric) => (
              <Badge
                key={metric.key}
                variant={selectedMetrics.includes(metric.key) ? "default" : "outline"}
                className="cursor-pointer text-xs"
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
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey={xAxisKey} 
                className="text-xs"
                tick={{ fontSize: 10 }}
              />
              <YAxis 
                yAxisId="left"
                className="text-xs"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
              />
              {hasRightAxis && (
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  className="text-xs"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => typeof v === 'number' && v < 100 ? v.toFixed(2) : v}
                />
              )}
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: number, name: string) => {
                  const metric = metricOptions.find(m => m.key === name);
                  if (value >= 1000000) return [`${(value / 1000000).toFixed(2)}M`, metric?.label || name];
                  if (value >= 1000) return [`${(value / 1000).toFixed(2)}K`, metric?.label || name];
                  return [value.toFixed(2), metric?.label || name];
                }}
              />
              <Legend />
              
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
                      fill={metric.color}
                      radius={[4, 4, 0, 0]}
                      opacity={0.8}
                    />
                  );
                }
                if (metric.type === 'area') {
                  return (
                    <Area
                      {...commonProps}
                      fill={metric.color}
                      stroke={metric.color}
                      fillOpacity={0.3}
                    />
                  );
                }
                return (
                  <Line
                    {...commonProps}
                    stroke={metric.color}
                    strokeWidth={2}
                    dot={{ fill: metric.color, r: 4 }}
                    activeDot={{ r: 6 }}
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
