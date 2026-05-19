import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";
import ChartDataTable from "./ChartDataTable";

interface BudgetPacingChartProps {
  data: {
    period: string;
    plannedBudget: number;
    actualSpend: number;
    cumulativePlanned: number;
    cumulativeActual: number;
    pctTimeElapsed: number;
    pctBudgetSpent: number;
  }[];
  totalPlannedBudget: number;
}

export default function BudgetPacingChart({ data, totalPlannedBudget }: BudgetPacingChartProps) {
  const latestPct = data.length > 0 ? data[data.length - 1] : null;

  const tableColumns = [
    { key: 'period', label: 'Period' },
    { key: 'plannedBudget', label: 'Planned Budget' },
    { key: 'actualSpend', label: 'Actual Spend' },
    { key: 'cumulativePlanned', label: 'Cumulative Planned' },
    { key: 'cumulativeActual', label: 'Cumulative Actual' },
    { key: 'pctTimeElapsed', label: '% Time Elapsed' },
    { key: 'pctBudgetSpent', label: '% Budget Spent' }
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Budget Pacing</CardTitle>
          {latestPct && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span>{latestPct.pctTimeElapsed.toFixed(0)}% Time Spent</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>{latestPct.pctBudgetSpent.toFixed(0)}% Budget Spent</span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="period" 
                className="text-xs"
                tick={{ fontSize: 10 }}
              />
              <YAxis 
                yAxisId="left"
                className="text-xs"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}`}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                className="text-xs"
                tick={{ fontSize: 10 }}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: number, name: string) => {
                  if (name.includes('%')) return [`${value.toFixed(1)}%`, name];
                  return [`${value.toLocaleString()}`, name];
                }}
              />
              <Legend />
              
              <Bar
                dataKey="plannedBudget"
                name="Planned Budget"
                yAxisId="left"
                fill="hsl(var(--muted-foreground))"
                opacity={0.5}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="actualSpend"
                name="Actual Spend"
                yAxisId="left"
                fill="#22c55e"
                radius={[4, 4, 0, 0]}
              />
              <Line
                dataKey="pctTimeElapsed"
                name="% Time Spent"
                yAxisId="right"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ fill: '#f59e0b', r: 3 }}
                strokeDasharray="5 5"
              />
              <Line
                dataKey="pctBudgetSpent"
                name="% Budget Spent"
                yAxisId="right"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: '#22c55e', r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <ChartDataTable 
          data={data} 
          columns={tableColumns} 
          filename="budget-pacing" 
        />
      </CardContent>
    </Card>
  );
}
