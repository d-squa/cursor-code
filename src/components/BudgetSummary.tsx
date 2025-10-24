import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Platform } from "./PlatformConfiguration";

interface BudgetSummaryProps {
  platforms: Platform[];
  setPlatforms: (platforms: Platform[]) => void;
  totalBudget: number;
}

export function BudgetSummary({ platforms, setPlatforms, totalBudget }: BudgetSummaryProps) {
  const enabledPlatforms = platforms.filter((p) => p.enabled);
  const totalAllocated = enabledPlatforms.reduce((sum, p) => sum + p.budgetPercentage, 0);
  const remaining = 100 - totalAllocated;

  const updateBudgetPercentage = (platformId: string, percentage: number) => {
    setPlatforms(
      platforms.map((p) =>
        p.id === platformId ? { ...p, budgetPercentage: Math.max(0, Math.min(100, percentage)) } : p
      )
    );
  };

  const updateBudgetAmount = (platformId: string, amount: number) => {
    if (totalBudget > 0) {
      const percentage = (amount / totalBudget) * 100;
      setPlatforms(
        platforms.map((p) =>
          p.id === platformId ? { ...p, budgetPercentage: Math.max(0, Math.min(100, percentage)) } : p
        )
      );
    }
  };

  if (enabledPlatforms.length === 0) {
    return null;
  }

  return (
    <Card className="sticky top-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Budget Split</CardTitle>
        <p className="text-sm text-muted-foreground">${totalBudget.toLocaleString()}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {enabledPlatforms.map((platform) => {
          const platformBudget = (totalBudget * platform.budgetPercentage) / 100;
          return (
            <div key={platform.id} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{platform.name}</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={platform.budgetPercentage}
                    onChange={(e) => updateBudgetPercentage(platform.id, parseFloat(e.target.value) || 0)}
                    className="w-14 h-7 text-xs text-right p-1"
                    min="0"
                    max="100"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs gap-2">
                <Progress value={platform.budgetPercentage} className="h-1 flex-1" />
                <div className="flex items-center">
                  <span className="text-xs text-muted-foreground mr-1">$</span>
                  <Input
                    type="number"
                    value={Math.round(platformBudget)}
                    onChange={(e) => updateBudgetAmount(platform.id, parseFloat(e.target.value) || 0)}
                    className="w-20 h-6 text-xs text-right p-1"
                    min="0"
                  />
                </div>
              </div>
            </div>
          );
        })}

        <div className="pt-2 border-t">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total</span>
            <span className={remaining < 0 ? "text-destructive" : remaining > 0 ? "text-accent" : "text-primary"}>
              {totalAllocated}%
            </span>
          </div>
          {remaining !== 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {remaining > 0 ? `${remaining}% unallocated` : `${Math.abs(remaining)}% over budget`}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
