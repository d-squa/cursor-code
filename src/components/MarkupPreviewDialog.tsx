import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { TrendingUp, TrendingDown, Check, X, ArrowRight, Calendar, BarChart3 } from "lucide-react";

interface GranularRow {
  platform: string;
  market: string;
  phase: string;
  optimizationGoal: string;
  kpi: string;
  beforeCPR: number;
  afterCPR: number;
  beforeResult: number;
  afterResult: number;
  beforeImpressions: number;
  afterImpressions: number;
  beforeCPM: number;
  afterCPM: number;
  budget: number;
  campaignCount: number;
  isBenchmarkBased: boolean;
}

interface TotalSummary {
  label: string;
  before: number;
  after: number;
  format: "number" | "currency" | "percent";
  inverted?: boolean;
}

export interface MarkupPreviewData {
  markupDirection: "up" | "down";
  markupPercentage: number;
  totalComparison: TotalSummary[];
  granularRows: GranularRow[];
  mode?: "markup" | "dateRange";
  dateRangeLabel?: string;
  // Keep backward compat
  platformComparisons?: Array<{ platformName: string; metrics: TotalSummary[] }>;
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
    if (value < 0.01 && value > 0) return `$${value.toFixed(4)}`;
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

function ChangeCell({ before, after, inverted }: { before: number; after: number; inverted?: boolean }) {
  const pctChange = getPercentChange(before, after);
  const isPositive = inverted ? pctChange < 0 : pctChange > 0;
  const isNegative = inverted ? pctChange > 0 : pctChange < 0;
  const isNeutral = Math.abs(pctChange) < 0.01;

  if (isNeutral) return <span className="text-muted-foreground">—</span>;

  return (
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
  );
}

function SummaryRow({ item }: { item: TotalSummary }) {
  return (
    <TableRow>
      <TableCell className="text-xs font-medium">{item.label}</TableCell>
      <TableCell className="text-xs text-right font-mono">{formatValue(item.before, item.format)}</TableCell>
      <TableCell className="text-center"><ArrowRight className="h-3 w-3 mx-auto text-muted-foreground" /></TableCell>
      <TableCell className="text-xs text-right font-mono">{formatValue(item.after, item.format)}</TableCell>
      <TableCell className="text-xs text-right">
        <ChangeCell before={item.before} after={item.after} inverted={item.inverted} />
      </TableCell>
    </TableRow>
  );
}

export function MarkupPreviewDialog({ open, onOpenChange, data, onAccept, onReject }: MarkupPreviewDialogProps) {
  if (!data) return null;

  const isDateRange = data.mode === "dateRange";
  const directionLabel = data.markupDirection === "up" ? "Markup" : "Markdown";
  const directionSign = data.markupDirection === "up" ? "+" : "−";

  const title = isDateRange
    ? `Benchmark Date Range Change`
    : `CPM ${directionLabel} Preview — ${directionSign}${data.markupPercentage}%`;

  const description = isDateRange
    ? `Review how switching benchmarks to "${data.dateRangeLabel}" affects your plan before applying.`
    : `Review the impact of the ${directionSign}${data.markupPercentage}% CPM ${directionLabel.toLowerCase()} on your plan before applying.`;

  const acceptLabel = isDateRange ? "Apply New Benchmarks" : `Apply ${directionLabel}`;

  // Group granular rows by platform → market
  const rows = data.granularRows || [];
  const platformGroups = new Map<string, Map<string, GranularRow[]>>();
  for (const row of rows) {
    if (!platformGroups.has(row.platform)) platformGroups.set(row.platform, new Map());
    const marketMap = platformGroups.get(row.platform)!;
    if (!marketMap.has(row.market)) marketMap.set(row.market, []);
    marketMap.get(row.market)!.push(row);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[780px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDateRange ? (
              <Calendar className="h-5 w-5 text-primary" />
            ) : data.markupDirection === "up" ? (
              <TrendingUp className="h-5 w-5 text-amber-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-blue-500" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4">
            {/* Total Plan Summary */}
            {data.totalComparison.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Plan Summary</h4>
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
                      <SummaryRow key={i} item={m} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Granular Breakdown */}
            {platformGroups.size > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Detailed Breakdown
                </h4>
                <Accordion type="multiple" className="w-full">
                  {Array.from(platformGroups.entries()).map(([platform, marketMap]) => (
                    <AccordionItem key={platform} value={platform}>
                      <AccordionTrigger className="text-xs font-semibold py-2">
                        {platform}
                      </AccordionTrigger>
                      <AccordionContent>
                        {Array.from(marketMap.entries()).map(([market, marketRows]) => (
                          <div key={market} className="mb-3">
                            <h5 className="text-[11px] font-medium text-muted-foreground mb-1 pl-1">{market}</h5>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-[10px]">Phase</TableHead>
                                  <TableHead className="text-[10px]">Goal</TableHead>
                                  <TableHead className="text-[10px] text-right">Cost/Result</TableHead>
                                  <TableHead className="text-[10px] text-center w-6"></TableHead>
                                  <TableHead className="text-[10px] text-right">New C/R</TableHead>
                                  <TableHead className="text-[10px] text-right">Results</TableHead>
                                  <TableHead className="text-[10px] text-center w-6"></TableHead>
                                  <TableHead className="text-[10px] text-right">New Res.</TableHead>
                                  <TableHead className="text-[10px] text-right">Δ</TableHead>
                                  <TableHead className="text-[10px] text-right">
                                    <span className="flex items-center justify-end gap-1">
                                      <BarChart3 className="h-3 w-3" />
                                      Campaigns
                                    </span>
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {marketRows.map((row, i) => {
                                  const cprChange = getPercentChange(row.beforeCPR, row.afterCPR);
                                  return (
                                    <TableRow key={i}>
                                      <TableCell className="text-[11px] max-w-[100px] truncate">{row.phase}</TableCell>
                                      <TableCell className="text-[11px]">
                                        <Badge variant="outline" className="text-[9px] font-mono">{row.kpi}</Badge>
                                      </TableCell>
                                      <TableCell className="text-[11px] text-right font-mono">
                                        ${row.beforeCPR < 1 ? row.beforeCPR.toFixed(3) : row.beforeCPR.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <ArrowRight className="h-2.5 w-2.5 mx-auto text-muted-foreground" />
                                      </TableCell>
                                      <TableCell className="text-[11px] text-right font-mono">
                                        ${row.afterCPR < 1 ? row.afterCPR.toFixed(3) : row.afterCPR.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-[11px] text-right font-mono">
                                        {formatValue(row.beforeResult, "number")}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <ArrowRight className="h-2.5 w-2.5 mx-auto text-muted-foreground" />
                                      </TableCell>
                                      <TableCell className="text-[11px] text-right font-mono">
                                        {formatValue(row.afterResult, "number")}
                                      </TableCell>
                                      <TableCell className="text-[11px] text-right">
                                        <ChangeCell before={row.beforeCPR} after={row.afterCPR} inverted={true} />
                                      </TableCell>
                                      <TableCell className="text-[11px] text-right">
                                        {row.isBenchmarkBased ? (
                                          <Badge variant="secondary" className="text-[9px]">
                                            {row.campaignCount}
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-[9px] text-muted-foreground border-dashed">
                                            0 campaigns
                                          </Badge>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onReject}>
            <X className="h-4 w-4 mr-1" />
            Reject
          </Button>
          <Button onClick={onAccept}>
            <Check className="h-4 w-4 mr-1" />
            {acceptLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
