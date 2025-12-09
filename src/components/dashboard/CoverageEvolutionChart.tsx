import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";
import ChartDataTable from "./ChartDataTable";

interface CoverageEvolutionChartProps {
  data: {
    period: string;
    audienceSize: number;
    cumulativeReach: number;
    targetReach: number;
    sov: number;
    targetSov: number;
    cumulativeSov: number;
  }[];
}

export default function CoverageEvolutionChart({ data }: CoverageEvolutionChartProps) {
  const reachColumns = [
    { key: 'period', label: 'Period' },
    { key: 'audienceSize', label: 'Audience Size' },
    { key: 'cumulativeReach', label: 'Cumulative Reach' },
    { key: 'targetReach', label: 'Target Reach' }
  ];

  const sovColumns = [
    { key: 'period', label: 'Period' },
    { key: 'sov', label: 'SOV' },
    { key: 'cumulativeSov', label: 'Cumulative SOV' },
    { key: 'targetSov', label: 'Target SOV' }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Reach Evolution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Reach Evolution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="period" 
                  className="text-xs"
                  tick={{ fontSize: 10 }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  formatter={(value: number) => value >= 1000000 ? `${(value/1000000).toFixed(2)}M` : value >= 1000 ? `${(value/1000).toFixed(0)}K` : value}
                />
                <Legend />
                
                <Area
                  dataKey="audienceSize"
                  name="Audience Size"
                  fill="#60a5fa"
                  stroke="#60a5fa"
                  fillOpacity={0.2}
                />
                <Area
                  dataKey="cumulativeReach"
                  name="Cumulative Reach"
                  fill="#f97316"
                  stroke="#f97316"
                  fillOpacity={0.4}
                />
                <Line
                  dataKey="targetReach"
                  name="Target Reach"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ fill: '#ef4444', r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ChartDataTable 
            data={data} 
            columns={reachColumns} 
            filename="reach-evolution" 
          />
        </CardContent>
      </Card>

      {/* SOV Evolution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Share of Voice Evolution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="period" 
                  className="text-xs"
                  tick={{ fontSize: 10 }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fontSize: 10 }}
                  domain={[0, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                />
                <Legend />
                
                <Area
                  dataKey="targetSov"
                  name="Target SOV"
                  fill="#60a5fa"
                  stroke="#60a5fa"
                  fillOpacity={0.2}
                />
                <Area
                  dataKey="cumulativeSov"
                  name="Cumulative SOV"
                  fill="#22c55e"
                  stroke="#22c55e"
                  fillOpacity={0.4}
                />
                <Line
                  dataKey="sov"
                  name="SOV"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ fill: '#ef4444', r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ChartDataTable 
            data={data} 
            columns={sovColumns} 
            filename="sov-evolution" 
          />
        </CardContent>
      </Card>
    </div>
  );
}
