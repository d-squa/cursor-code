import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, ArrowRight, Lightbulb, Check, X } from "lucide-react";
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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Budget Optimization Recommendation
          </DialogTitle>
          <DialogDescription>
            We analyzed your forecast and found opportunities to improve results by shifting budget between platforms for the same optimization goals.
          </DialogDescription>
        </DialogHeader>

        {/* Overall Impact Banner */}
        <div className="rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                Estimated Total Result Improvement
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                Same total budget, more results by shifting to cost-efficient platforms
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                +{optimization.totalResultChangePercent.toFixed(1)}%
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {formatNumber(optimization.totalOldResults)} → {formatNumber(optimization.totalNewResults)} total results
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="by-goal" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="by-goal">By Optimization Goal</TabsTrigger>
            <TabsTrigger value="by-platform">By Platform</TabsTrigger>
          </TabsList>

          {/* By Goal Tab */}
          <TabsContent value="by-goal" className="space-y-4 mt-4">
            {optimization.recommendations.map((rec) => (
              <div key={rec.normalizedGoal} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{rec.displayName}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Total: {formatCurrency(rec.totalBudget)}
                    </span>
                  </div>
                  <ChangeIndicator value={rec.resultChangePercent} />
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Platform</TableHead>
                      <TableHead className="text-xs text-right">Old Budget</TableHead>
                      <TableHead className="text-xs text-center w-8"></TableHead>
                      <TableHead className="text-xs text-right">New Budget</TableHead>
                      <TableHead className="text-xs text-right">CPR</TableHead>
                      <TableHead className="text-xs text-right">Old Results</TableHead>
                      <TableHead className="text-xs text-center w-8"></TableHead>
                      <TableHead className="text-xs text-right">New Results</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(rec.newByPlatform).map(([platformName, newData]) => {
                      const oldData = rec.oldByPlatform[platformName];
                      if (!oldData) return null;
                      const budgetChange = oldData.budget > 0 ? ((newData.budget - oldData.budget) / oldData.budget) * 100 : 0;
                      
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
                          <TableCell className="text-xs text-right font-medium">{formatNumber(newData.result)}</TableCell>
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
          </TabsContent>

          {/* By Platform Tab */}
          <TabsContent value="by-platform" className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Platform</TableHead>
                  <TableHead className="text-xs text-right">Old Budget</TableHead>
                  <TableHead className="text-xs text-center w-8"></TableHead>
                  <TableHead className="text-xs text-right">New Budget</TableHead>
                  <TableHead className="text-xs text-right">Budget Δ</TableHead>
                  <TableHead className="text-xs text-right">Old Results</TableHead>
                  <TableHead className="text-xs text-center w-8"></TableHead>
                  <TableHead className="text-xs text-right">New Results</TableHead>
                  <TableHead className="text-xs text-right">Results Δ</TableHead>
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
                    <TableCell className="text-xs text-right">{formatNumber(summary.oldResults)}</TableCell>
                    <TableCell className="text-center">
                      <ArrowRight className="h-3 w-3 text-muted-foreground mx-auto" />
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">{formatNumber(summary.newResults)}</TableCell>
                    <TableCell className="text-xs text-right">
                      <ChangeIndicator value={summary.resultChangePercent} />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold border-t-2 bg-muted/30">
                  <TableCell className="text-xs">Total</TableCell>
                  <TableCell className="text-xs text-right">
                    {formatCurrency(Object.values(optimization.platformSummary).reduce((s, p) => s + p.oldBudget, 0))}
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-xs text-right">
                    {formatCurrency(Object.values(optimization.platformSummary).reduce((s, p) => s + p.newBudget, 0))}
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-xs text-right">{formatNumber(optimization.totalOldResults)}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-xs text-right">{formatNumber(optimization.totalNewResults)}</TableCell>
                  <TableCell className="text-xs text-right">
                    <ChangeIndicator value={optimization.totalResultChangePercent} />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>

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
