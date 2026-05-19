import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend
} from "recharts";
import { cn } from "@/lib/utils";

interface DimensionBreakdownChartProps {
  data: any[];
  title?: string;
}

const VOLUME_METRICS = [
  { key: 'impressions', label: 'Impressions' },
  { key: 'reach', label: 'Reach' },
  { key: 'spend', label: 'Spend' },
  { key: 'results', label: 'Results' },
  { key: 'clicks', label: 'Clicks' },
];

const DIMENSIONS = [
  { key: 'placement', label: 'Placement' },
  { key: 'city', label: 'City' },
  { key: 'age', label: 'Age' },
  { key: 'gender', label: 'Gender' },
  { key: 'device', label: 'Device' },
  { key: 'os', label: 'OS' },
];

const CHART_COLORS = [
  'hsl(217, 91%, 60%)', // blue
  'hsl(142, 76%, 36%)', // green  
  'hsl(45, 93%, 47%)',  // yellow
  'hsl(0, 84%, 60%)',   // red
  'hsl(262, 83%, 58%)', // purple
  'hsl(25, 95%, 53%)',  // orange
  'hsl(173, 80%, 40%)', // teal
  'hsl(330, 81%, 60%)', // pink
];

const formatValue = (value: number, metricKey: string): string => {
  if (metricKey === 'spend') {
    return `$${value >= 1000 ? (value / 1000).toFixed(1) + 'K' : value.toFixed(0)}`;
  }
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
};

// Mock breakdown data generator - in production, this would come from the API
const generateBreakdownData = (dimension: string, total: number) => {
  const breakdownConfigs: Record<string, string[]> = {
    placement: ['Feed', 'Stories', 'Reels', 'Audience Network'],
    city: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Fujairah'],
    age: ['18-24', '25-35', '35-45', '45+'],
    gender: ['Male', 'Female', 'Unknown'],
    device: ['Smartphone', 'Tablet', 'Computer'],
    os: ['iOS', 'Android', 'Other'],
  };

  const labels = breakdownConfigs[dimension] || ['Other'];
  
  // Generate random distribution that adds up to total
  const randomWeights = labels.map(() => Math.random());
  const totalWeight = randomWeights.reduce((a, b) => a + b, 0);
  
  return labels.map((label, i) => ({
    name: label,
    value: Math.round(total * (randomWeights[i] / totalWeight)),
  }));
};

export default function DimensionBreakdownChart({
  data,
  title = "Performance Breakdowns"
}: DimensionBreakdownChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<string>('impressions');

  // Aggregate totals from data
  const totals = data.reduce((acc, row) => ({
    impressions: (acc.impressions || 0) + (row.actualImpressions || row.impressions || 0),
    reach: (acc.reach || 0) + (row.actualReach || row.reach || 0),
    spend: (acc.spend || 0) + (row.actualSpend || row.spend || 0),
    results: (acc.results || 0) + (row.results || row.conversions || 0),
    clicks: (acc.clicks || 0) + (row.actualClicks || row.clicks || 0),
  }), {} as Record<string, number>);

  const metricTotal = totals[selectedMetric] || 0;

  const renderPieChart = (dimension: { key: string; label: string }) => {
    const breakdownData = generateBreakdownData(dimension.key, metricTotal);
    
    return (
      <Card key={dimension.key} className="overflow-hidden">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-sm font-medium text-center">{dimension.label}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={breakdownData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={65}
                  paddingAngle={2}
                  dataKey="value"
                  animationDuration={800}
                >
                  {breakdownData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [formatValue(value, selectedMetric), VOLUME_METRICS.find(m => m.key === selectedMetric)?.label]}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '10px', paddingTop: '5px' }}
                  iconSize={8}
                  iconType="circle"
                  layout="horizontal"
                  align="center"
                  formatter={(value: string, entry: any) => {
                    const pct = ((entry.payload.value / metricTotal) * 100).toFixed(1);
                    return <span className="text-[10px]">{value} ({pct}%)</span>;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium">Volume Metrics</span>
              <span className="text-xs text-muted-foreground">Choose 1</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {VOLUME_METRICS.map((metric) => (
                <Badge
                  key={metric.key}
                  variant={selectedMetric === metric.key ? "default" : "outline"}
                  className={cn(
                    "cursor-pointer text-xs transition-all duration-200 hover:scale-105",
                    selectedMetric === metric.key 
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-muted"
                  )}
                  onClick={() => setSelectedMetric(metric.key)}
                >
                  <span className="text-muted-foreground mr-1 text-[10px]">Actual</span>
                  {metric.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {DIMENSIONS.map(renderPieChart)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
