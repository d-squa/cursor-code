import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PerformanceRow {
  name: string;
  platform?: string;
  market?: string;
  plannedBudget: number;
  actualSpend: number;
  plannedImpressions: number;
  actualImpressions: number;
  plannedReach: number;
  actualReach: number;
  plannedClicks: number;
  actualClicks: number;
  ctr?: number;
  cpm?: number;
  cpc?: number;
}

interface PerformanceTableProps {
  data: PerformanceRow[];
  title: string;
  groupBy?: 'platform' | 'market' | 'phase';
}

export default function PerformanceTable({ data, title, groupBy }: PerformanceTableProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  const getVarianceBadge = (planned: number, actual: number, invertVariance = false) => {
    if (planned === 0) return null;
    const variance = ((actual - planned) / planned) * 100;
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

  const MetricCell = ({ planned, actual, prefix = "", invertVariance = false }: { planned: number; actual: number; prefix?: string; invertVariance?: boolean }) => (
    <div className="flex flex-col">
      <span className="font-medium">{prefix}{formatNumber(actual)}</span>
      <span className="text-xs text-muted-foreground">{prefix}{formatNumber(planned)} planned</span>
      {getVarianceBadge(planned, actual, invertVariance)}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">Name</TableHead>
                {groupBy !== 'platform' && <TableHead>Platform</TableHead>}
                {groupBy !== 'market' && <TableHead>Market</TableHead>}
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
                  <TableCell className="font-medium">{row.name}</TableCell>
                  {groupBy !== 'platform' && (
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{row.platform}</Badge>
                    </TableCell>
                  )}
                  {groupBy !== 'market' && (
                    <TableCell>
                      <Badge variant="secondary">{row.market}</Badge>
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <MetricCell planned={row.plannedBudget} actual={row.actualSpend} prefix="$" invertVariance />
                  </TableCell>
                  <TableCell className="text-right">
                    <MetricCell planned={row.plannedImpressions} actual={row.actualImpressions} />
                  </TableCell>
                  <TableCell className="text-right">
                    <MetricCell planned={row.plannedReach} actual={row.actualReach} />
                  </TableCell>
                  <TableCell className="text-right">
                    <MetricCell planned={row.plannedClicks} actual={row.actualClicks} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-medium">{row.ctr?.toFixed(2)}%</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-medium">${row.cpm?.toFixed(2)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-medium">${row.cpc?.toFixed(2)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
