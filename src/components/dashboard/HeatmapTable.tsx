import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadCSV } from "@/utils/downloadUtils";
import { cn } from "@/lib/utils";

interface HeatmapTableProps {
  title: string;
  data: Record<string, any>[];
  rowKey: string;
  columns: { key: string; label: string }[];
  colorMetric: string;
  filename?: string;
}

export default function HeatmapTable({
  title,
  data,
  rowKey,
  columns,
  colorMetric,
  filename
}: HeatmapTableProps) {
  // Calculate min/max for color scaling
  const values = data.map(d => d[colorMetric] || 0);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  
  const getHeatColor = (value: number) => {
    if (maxVal === minVal) return 'bg-emerald-500/20';
    const ratio = (value - minVal) / (maxVal - minVal);
    if (ratio < 0.33) return 'bg-red-500/30';
    if (ratio < 0.66) return 'bg-amber-500/30';
    return 'bg-emerald-500/30';
  };

  const formatNumber = (num: number) => {
    if (typeof num !== 'number') return num;
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(num < 10 ? 2 : 0);
  };

  const handleDownload = () => {
    downloadCSV(data, filename || title.toLowerCase().replace(/\s+/g, '-'), [
      { key: rowKey, label: rowKey },
      ...columns
    ]);
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="ghost" size="sm" onClick={handleDownload}>
          <Download className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium text-muted-foreground">{rowKey}</th>
                {columns.map(col => (
                  <th key={col.key} className="text-right p-3 font-medium text-muted-foreground">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="p-3 font-medium">{row[rowKey]}</td>
                  {columns.map(col => (
                    <td 
                      key={col.key} 
                      className={cn(
                        "p-3 text-right transition-colors",
                        col.key === colorMetric && getHeatColor(row[col.key])
                      )}
                    >
                      {col.key.includes('budget') || col.key.includes('spend') || col.key.includes('cpm') || col.key.includes('cpc') 
                        ? `$${formatNumber(row[col.key])}` 
                        : col.key.includes('ctr') || col.key.includes('rate')
                        ? `${formatNumber(row[col.key])}%`
                        : formatNumber(row[col.key])
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
