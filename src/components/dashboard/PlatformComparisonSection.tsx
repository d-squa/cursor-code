import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, TrendingDown, Minus, Zap } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, RadialBarChart, RadialBar } from "recharts";
import { downloadCSV } from "@/utils/downloadUtils";
import { cn } from "@/lib/utils";
import { LockedFeatureButton } from "@/components/ui/locked-feature-button";

interface PlatformData {
  platform: string;
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

interface PlatformComparisonSectionProps {
  data: PlatformData[];
}

const PLATFORM_COLORS: Record<string, string> = {
  meta: '#0081FB',
  tiktok: '#00F2EA',
  google: '#4285F4',
  linkedin: '#0A66C2',
  twitter: '#1DA1F2',
  snapchat: '#FFFC00',
  pinterest: '#E60023',
};

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function PlatformComparisonSection({ data }: PlatformComparisonSectionProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  const getVariance = (planned: number, actual: number) => {
    if (planned === 0) return 0;
    return ((actual - planned) / planned) * 100;
  };

  const getPlatformColor = (platform: string, index: number) => {
    return PLATFORM_COLORS[platform.toLowerCase()] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
  };

  const getVarianceIndicator = (variance: number, invertVariance = false) => {
    const isPositive = invertVariance ? variance < 0 : variance > 0;
    const isNeutral = Math.abs(variance) < 5;

    return (
      <span className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isNeutral ? "text-muted-foreground" :
        isPositive ? "text-emerald-600 dark:text-emerald-400" : 
        "text-red-600 dark:text-red-400"
      )}>
        {isNeutral ? <Minus className="h-3 w-3" /> : isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {variance > 0 ? '+' : ''}{variance.toFixed(0)}%
      </span>
    );
  };

  // Pie chart data for budget distribution
  const budgetPieData = data.map((d, i) => ({
    name: d.platform,
    value: d.actualSpend,
    fill: getPlatformColor(d.platform, i)
  }));

  // Radial bar data for delivery
  const deliveryData = data.map((d, i) => ({
    platform: d.platform,
    delivery: d.plannedBudget > 0 ? Math.min(100, (d.actualSpend / d.plannedBudget) * 100) : 0,
    fill: getPlatformColor(d.platform, i)
  }));

  // Bar chart data for comparison
  const barChartData = data.map((d, i) => ({
    platform: d.platform,
    'Planned': d.plannedBudget,
    'Actual': d.actualSpend,
    fill: getPlatformColor(d.platform, i)
  }));

  const handleDownload = () => {
    downloadCSV(data, 'platform-comparison', [
      { key: 'platform', label: 'Platform' },
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
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Zap className="h-5 w-5 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold">Platform Performance Comparison</h2>
        </div>
        <LockedFeatureButton feature="download_charts_csv">
          <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
        </LockedFeatureButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Budget Distribution Pie */}
        <Card className="overflow-hidden hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-2 bg-gradient-to-r from-blue-500/5 to-transparent">
            <CardTitle className="text-base">Spend Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    {budgetPieData.map((entry, index) => (
                      <linearGradient key={`pie-gradient-${index}`} id={`pie-gradient-${index}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={entry.fill} stopOpacity={1} />
                        <stop offset="100%" stopColor={entry.fill} stopOpacity={0.6} />
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie
                    data={budgetPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                    animationDuration={1000}
                  >
                    {budgetPieData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={`url(#pie-gradient-${index})`}
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => `${value.toLocaleString()}`}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
                    }}
                  />
                  <Legend iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Planned vs Actual Bar Chart */}
        <Card className="overflow-hidden hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-2 bg-gradient-to-r from-emerald-500/5 to-transparent">
            <CardTitle className="text-base">Planned vs Actual Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} barGap={2}>
                  <defs>
                    <linearGradient id="plannedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.2} />
                    </linearGradient>
                    <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={1} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                  <XAxis 
                    dataKey="platform" 
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    tickFormatter={(v) => `${v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}`} 
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <Tooltip 
                    formatter={(value: number) => `${value.toLocaleString()}`}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
                    }}
                  />
                  <Legend iconType="circle" />
                  <Bar 
                    dataKey="Planned" 
                    fill="url(#plannedGradient)"
                    radius={[6, 6, 0, 0]}
                    animationDuration={1000}
                  />
                  <Bar 
                    dataKey="Actual" 
                    fill="url(#actualGradient)"
                    radius={[6, 6, 0, 0]}
                    animationDuration={1000}
                    animationBegin={200}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Progress */}
        <Card className="overflow-hidden hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-2 bg-gradient-to-r from-purple-500/5 to-transparent">
            <CardTitle className="text-base">Budget Delivery by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.map((d, i) => {
                const delivery = d.plannedBudget > 0 ? Math.min(100, (d.actualSpend / d.plannedBudget) * 100) : 0;
                const color = getPlatformColor(d.platform, i);
                return (
                  <div key={d.platform} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium capitalize">{d.platform}</span>
                      <span className="text-muted-foreground">{delivery.toFixed(0)}%</span>
                    </div>
                    <div className="relative h-2.5 bg-muted/50 rounded-full overflow-hidden">
                      <div 
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
                        style={{ 
                          width: `${delivery}%`,
                          background: `linear-gradient(90deg, ${color}, ${color}99)`,
                          boxShadow: `0 0 10px ${color}50`
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 bg-gradient-to-r from-muted/30 to-transparent">
          <CardTitle className="text-base">Platform Performance Details</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold">Platform</TableHead>
                  <TableHead className="text-right font-semibold">Budget / Spend</TableHead>
                  <TableHead className="text-right font-semibold">Impressions</TableHead>
                  <TableHead className="text-right font-semibold">Reach</TableHead>
                  <TableHead className="text-right font-semibold">Clicks</TableHead>
                  <TableHead className="text-right font-semibold">CTR</TableHead>
                  <TableHead className="text-right font-semibold">CPM</TableHead>
                  <TableHead className="text-right font-semibold">CPC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, idx) => (
                  <TableRow key={idx} className="group hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getPlatformColor(row.platform, idx) }}
                        />
                        <Badge variant="outline" className="capitalize font-medium">{row.platform}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-semibold">${formatNumber(row.actualSpend)}</span>
                        <span className="text-xs text-muted-foreground">${formatNumber(row.plannedBudget)} planned</span>
                        {getVarianceIndicator(getVariance(row.plannedBudget, row.actualSpend), true)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-semibold">{formatNumber(row.actualImpressions)}</span>
                        <span className="text-xs text-muted-foreground">{formatNumber(row.plannedImpressions)} planned</span>
                        {getVarianceIndicator(getVariance(row.plannedImpressions, row.actualImpressions))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-semibold">{formatNumber(row.actualReach)}</span>
                        <span className="text-xs text-muted-foreground">{formatNumber(row.plannedReach)} planned</span>
                        {getVarianceIndicator(getVariance(row.plannedReach, row.actualReach))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-semibold">{formatNumber(row.actualClicks)}</span>
                        <span className="text-xs text-muted-foreground">{formatNumber(row.plannedClicks)} planned</span>
                        {getVarianceIndicator(getVariance(row.plannedClicks, row.actualClicks))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{row.ctr.toFixed(2)}%</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">${row.cpm.toFixed(2)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-purple-600 dark:text-purple-400">${row.cpc.toFixed(2)}</span>
                    </TableCell>
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
