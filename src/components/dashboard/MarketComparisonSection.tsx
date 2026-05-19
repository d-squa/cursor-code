import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { downloadCSV } from "@/utils/downloadUtils";
import { cn } from "@/lib/utils";
import { LockedFeatureButton } from "@/components/ui/locked-feature-button";

interface MarketData {
  market: string;
  plannedBudget: number;
  actualSpend: number;
  plannedImpressions: number;
  actualImpressions: number;
  plannedReach: number;
  actualReach: number;
  plannedClicks: number;
  actualClicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
}

interface MarketComparisonSectionProps {
  data: MarketData[];
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function MarketComparisonSection({ data }: MarketComparisonSectionProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  const getVariance = (planned: number, actual: number) => {
    if (planned === 0) return 0;
    return ((actual - planned) / planned) * 100;
  };

  const getVarianceIndicator = (variance: number, invertVariance = false) => {
    const isPositive = invertVariance ? variance < 0 : variance > 0;
    const isNeutral = Math.abs(variance) < 5;

    return (
      <span className={cn(
        "inline-flex items-center gap-0.5 text-xs",
        isNeutral ? "text-muted-foreground" :
        isPositive ? "text-green-600 dark:text-green-400" : 
        "text-red-600 dark:text-red-400"
      )}>
        {isNeutral ? <Minus className="h-3 w-3" /> : isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {variance > 0 ? '+' : ''}{variance.toFixed(0)}%
      </span>
    );
  };

  // Pie chart data for budget distribution
  const budgetPieData = data.map((d, i) => ({
    name: d.market,
    value: d.actualSpend,
    fill: COLORS[i % COLORS.length]
  }));

  // Bar chart data for comparison
  const barChartData = data.map(d => ({
    market: d.market,
    'Planned Budget': d.plannedBudget,
    'Actual Spend': d.actualSpend
  }));

  const handleDownload = () => {
    downloadCSV(data, 'market-comparison', [
      { key: 'market', label: 'Market' },
      { key: 'plannedBudget', label: 'Planned Budget' },
      { key: 'actualSpend', label: 'Actual Spend' },
      { key: 'plannedImpressions', label: 'Planned Impressions' },
      { key: 'actualImpressions', label: 'Actual Impressions' },
      { key: 'plannedReach', label: 'Planned Reach' },
      { key: 'actualReach', label: 'Actual Reach' },
      { key: 'ctr', label: 'CTR (%)' },
      { key: 'cpm', label: 'CPM' },
      { key: 'cpc', label: 'CPC' }
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Market Performance Comparison</h2>
        <LockedFeatureButton feature="download_charts_csv">
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download CSV
          </Button>
        </LockedFeatureButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Budget Distribution Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spend Distribution by Market</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={budgetPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {budgetPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Planned vs Actual Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Planned vs Actual Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="market" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `${v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => `${value.toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="Planned Budget" fill="hsl(var(--muted-foreground))" opacity={0.5} />
                  <Bar dataKey="Actual Spend" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Market Performance Details</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Market</TableHead>
                  <TableHead className="text-right">Budget / Spend</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Reach</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPM</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Badge variant="secondary">{row.market}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-medium">${formatNumber(row.actualSpend)}</span>
                        <span className="text-xs text-muted-foreground">${formatNumber(row.plannedBudget)} planned</span>
                        {getVarianceIndicator(getVariance(row.plannedBudget, row.actualSpend), true)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-medium">{formatNumber(row.actualImpressions)}</span>
                        <span className="text-xs text-muted-foreground">{formatNumber(row.plannedImpressions)} planned</span>
                        {getVarianceIndicator(getVariance(row.plannedImpressions, row.actualImpressions))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-medium">{formatNumber(row.actualReach)}</span>
                        <span className="text-xs text-muted-foreground">{formatNumber(row.plannedReach)} planned</span>
                        {getVarianceIndicator(getVariance(row.plannedReach, row.actualReach))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-medium">{formatNumber(row.actualClicks)}</span>
                        <span className="text-xs text-muted-foreground">{formatNumber(row.plannedClicks)} planned</span>
                        {getVarianceIndicator(getVariance(row.plannedClicks, row.actualClicks))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{row.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right font-medium">${row.cpm.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium">${row.cpc.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
