import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
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
      <CardContent className="space-y-4">
        {enabledPlatforms.map((platform) => {
          const platformBudget = (totalBudget * platform.budgetPercentage) / 100;
          return (
            <div key={platform.id} className="space-y-2 pb-3 border-b last:border-b-0 last:pb-0">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{platform.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {platform.budgetPercentage.toFixed(1)}%
                </Badge>
              </div>
              
              <Slider
                value={[platform.budgetPercentage]}
                onValueChange={([value]) => updateBudgetPercentage(platform.id, value)}
                min={0}
                max={100}
                step={0.5}
                className="w-full"
              />

              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-muted-foreground">Platform Budget</span>
                <div className="flex items-center">
                  <span className="text-xs text-muted-foreground mr-1">$</span>
                  <Input
                    type="number"
                    value={Math.round(platformBudget)}
                    onChange={(e) => updateBudgetAmount(platform.id, parseFloat(e.target.value) || 0)}
                    className="w-24 h-6 text-xs text-right p-1"
                    min="0"
                  />
                </div>
              </div>

              {platform.config?.hasPhases && platform.config.phases && platform.config.phases.length > 0 && (
                <div className="mt-2 space-y-1 pl-2 border-l-2 border-muted">
                  <p className="text-xs font-medium text-muted-foreground">Phases</p>
                  {platform.config.phases.map((phase) => {
                    const phaseBudget = (platformBudget * phase.budgetPercentage) / 100;
                    return (
                      <div key={phase.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate max-w-[120px]" title={phase.name}>
                          {phase.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{phase.budgetPercentage}%</span>
                          <span className="text-muted-foreground">${Math.round(phaseBudget).toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-1 border-t border-muted/50">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span>Total Phases</span>
                      <span>
                        {platform.config.phases.reduce((sum, p) => sum + p.budgetPercentage, 0)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
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
