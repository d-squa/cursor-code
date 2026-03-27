import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, Check, X, ArrowRight } from "lucide-react";

interface MetricComparison {
  label: string;
  before: number;
  after: number;
  format: "number" | "currency" | "percent";
  inverted?: boolean; // true if lower is better (e.g., CPM)
}

interface PlatformComparison {
  platformName: string;
  metrics: MetricComparison[];
}

export interface MarkupPreviewData {
  markupDirection: "up" | "down";
  markupPercentage: number;
  totalComparison: MetricComparison[];
  platformComparisons: PlatformComparison[];
}

interface MarkupPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: MarkupPreviewData | null;
  onAccept: () => void;
  onReject: () => void;
}

const formatValue = (value: number, format: "number" | "currency" | "percent"): string => {
  if (format === "currency") {
    return `$${value >= 1000 ? (value / 1000).toFixed(2) + "K" : value.toFixed(2)}`;
  }
  if (format === "percent") {
    return `${value.toFixed(2)}%`;
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(0);
};

const getPercentChange = (before: number, after: number): number => {
  if (before === 0) return 0;
  return ((after - before) / before) * 100;
};

function MetricRow({ metric }: { metric: MetricComparison }) {
  const pctChange = getPercentChange(metric.before, metric.after);
  const isPositive = metric.inverted ? pctChange < 0 : pctChange > 0;
  const isNegative = metric.inverted ? pctChange > 0 : pctChange < 0;
  const isNeutral = Math.abs(pctChange) < 0.01;

  return (
    <TableRow>
      <TableCell className="text-xs font-medium">{metric.label}</TableCell>
      <TableCell className="text-xs text-right font-mono">{formatValue(metric.before, metric.format)}</TableCell>
      <TableCell className="text-center">
        <ArrowRight className="h-3 w-3 mx-auto text-muted-foreground" />
      </TableCell>
      <TableCell className="text-xs text-right font-mono">{formatValue(metric.after, metric.format)}</TableCell>
      <TableCell className="text-xs text-right">
        {isNeutral ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <Badge
            variant="outline"
            className={`text-[10px] ${
              isPositive
                ? "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400"
                : isNegative
                ? "border-red-300 text-red-700 dark:border-red-700 dark:text-red-400"
                : ""
            }`}
          >
            {pctChange > 0 ? "+" : ""}{pctChange.toFixed(1)}%
          </Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

export function MarkupPreviewDialog({ open, onOpenChange, data, onAccept, onReject }: MarkupPreviewDialogProps) {
  if (!data) return null;

  const directionLabel = data.markupDirection === "up" ? "Markup" : "Markdown";
  const directionSign = data.markupDirection === "up" ? "+" : "−";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {data.markupDirection === "up" ? (
              <TrendingUp className="h-5 w-5 text-amber-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-blue-500" />
            )}
            CPM {directionLabel} Preview — {directionSign}{data.markupPercentage}%
          </DialogTitle>
          <DialogDescription>
            Review the impact of the {directionSign}{data.markupPercentage}% CPM {directionLabel.toLowerCase()} on your plan before applying.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-4">
            {/* Total Plan Comparison */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Total Plan</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Metric</TableHead>
                    <TableHead className="text-[10px] text-right">Before</TableHead>
                    <TableHead className="text-[10px] text-center w-8"></TableHead>
                    <TableHead className="text-[10px] text-right">After</TableHead>
                    <TableHead className="text-[10px] text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.totalComparison.map((m, i) => (
                    <MetricRow key={i} metric={m} />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Per-Platform Comparison */}
            {data.platformComparisons.map((platform, idx) => (
              <div key={idx}>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {platform.platformName}
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Metric</TableHead>
                      <TableHead className="text-[10px] text-right">Before</TableHead>
                      <TableHead className="text-[10px] text-center w-8"></TableHead>
                      <TableHead className="text-[10px] text-right">After</TableHead>
                      <TableHead className="text-[10px] text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {platform.metrics.map((m, i) => (
                      <MetricRow key={i} metric={m} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onReject}>
            <X className="h-4 w-4 mr-1" />
            Reject
          </Button>
          <Button onClick={onAccept}>
            <Check className="h-4 w-4 mr-1" />
            Apply {directionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
