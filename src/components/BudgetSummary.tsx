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

  const updateBudget = (platformId: string, percentage: number) => {
    setPlatforms(
      platforms.map((p) =>
        p.id === platformId ? { ...p, budgetPercentage: Math.max(0, Math.min(100, percentage)) } : p
      )
    );
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
                    onChange={(e) => updateBudget(platform.id, parseFloat(e.target.value) || 0)}
                    className="w-14 h-7 text-xs text-right p-1"
                    min="0"
                    max="100"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <Progress value={platform.budgetPercentage} className="h-1 flex-1 mr-2" />
                <span className="whitespace-nowrap">${platformBudget.toLocaleString()}</span>
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
