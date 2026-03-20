import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Lightbulb, Check, X, TrendingUp, TrendingDown } from "lucide-react";
import { BudgetOptimizationResult } from "@/utils/budgetOptimization";

interface BudgetRecommendationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  optimization: BudgetOptimizationResult;
  onAccept: () => void;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
}

function ChangeIndicator({ value }: { value: number }) {
  if (Math.abs(value) < 0.1) return <span className="text-xs text-muted-foreground">—</span>;
  const isPositive = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isPositive ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

export function BudgetRecommendationDialog({
  open,
  onOpenChange,
  optimization,
  onAccept,
}: BudgetRecommendationDialogProps) {
  if (!optimization.hasRecommendations) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Budget Optimization Recommendation
          </DialogTitle>
          <DialogDescription>
            We analyzed your forecast and found opportunities to improve results by shifting budget between platforms sharing the same optimization goals.
          </DialogDescription>
        </DialogHeader>

        {/* Platform Summary */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Platform Budget Summary</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Platform</TableHead>
                <TableHead className="text-xs text-right">Current Budget</TableHead>
                <TableHead className="text-xs text-center w-8"></TableHead>
                <TableHead className="text-xs text-right">Recommended Budget</TableHead>
                <TableHead className="text-xs text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(optimization.platformSummary).map(([platformId, summary]) => (
                <TableRow key={platformId}>
                  <TableCell className="text-xs font-medium">{summary.platformName}</TableCell>
                  <TableCell className="text-xs text-right">{formatCurrency(summary.oldBudget)}</TableCell>
                  <TableCell className="text-center">
                    <ArrowRight className="h-3 w-3 text-muted-foreground mx-auto" />
                  </TableCell>
                  <TableCell className="text-xs text-right font-medium">{formatCurrency(summary.newBudget)}</TableCell>
                  <TableCell className="text-xs text-right">
                    <ChangeIndicator value={summary.budgetChangePercent} />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold border-t-2">
                <TableCell className="text-xs">Total</TableCell>
                <TableCell className="text-xs text-right">
                  {formatCurrency(Object.values(optimization.platformSummary).reduce((s, p) => s + p.oldBudget, 0))}
                </TableCell>
                <TableCell></TableCell>
                <TableCell className="text-xs text-right">
                  {formatCurrency(Object.values(optimization.platformSummary).reduce((s, p) => s + p.newBudget, 0))}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <Separator />

        {/* Per-Goal Breakdown */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Breakdown by Optimization Goal</h4>
          {optimization.recommendations.map((rec) => (
            <div key={rec.normalizedGoal} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-semibold">{rec.displayName}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Total budget: {formatCurrency(rec.totalBudget)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Result impact:</span>
                  <ChangeIndicator value={rec.resultChangePercent} />
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Platform</TableHead>
                    <TableHead className="text-xs text-right">Current Budget</TableHead>
                    <TableHead className="text-xs text-center w-8"></TableHead>
                    <TableHead className="text-xs text-right">Recommended</TableHead>
                    <TableHead className="text-xs text-right">CPR</TableHead>
                    <TableHead className="text-xs text-right">Current Results</TableHead>
                    <TableHead className="text-xs text-center w-8"></TableHead>
                    <TableHead className="text-xs text-right">Projected Results</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(rec.newByPlatform).map(([platformName, newData]) => {
                    const oldData = rec.oldByPlatform[platformName];
                    if (!oldData) return null;
                    const budgetChange = oldData.budget > 0 ? ((newData.budget - oldData.budget) / oldData.budget) * 100 : 0;
                    const resultChange = oldData.result > 0 ? ((newData.result - oldData.result) / oldData.result) * 100 : 0;

                    return (
                      <TableRow key={platformName}>
                        <TableCell className="text-xs font-medium">{platformName}</TableCell>
                        <TableCell className="text-xs text-right">{formatCurrency(oldData.budget)}</TableCell>
                        <TableCell className="text-center">
                          <ArrowRight className="h-3 w-3 text-muted-foreground mx-auto" />
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          <span className="font-medium">{formatCurrency(newData.budget)}</span>
                          {Math.abs(budgetChange) > 0.5 && (
                            <span className="ml-1"><ChangeIndicator value={budgetChange} /></span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">
                          ${newData.costPerResult.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-right">{formatNumber(oldData.result)}</TableCell>
                        <TableCell className="text-center">
                          <ArrowRight className="h-3 w-3 text-muted-foreground mx-auto" />
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          <span className="font-medium">{formatNumber(newData.result)}</span>
                          {Math.abs(resultChange) > 0.5 && (
                            <span className="ml-1"><ChangeIndicator value={resultChange} /></span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-semibold border-t-2">
                    <TableCell className="text-xs">Total</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(rec.totalBudget)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(rec.totalBudget)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-xs text-right">{formatNumber(rec.oldTotalResult)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-xs text-right">{formatNumber(rec.newTotalResult)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ))}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1.5" />
            Dismiss
          </Button>
          <Button onClick={() => { onAccept(); onOpenChange(false); }}>
            <Check className="h-4 w-4 mr-1.5" />
            Apply Optimization
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
