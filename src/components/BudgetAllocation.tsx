import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

import { Platform } from "./PlatformConfiguration";

interface BudgetAllocationProps {
  platforms: Platform[];
  setPlatforms: (platforms: Platform[]) => void;
  totalBudget: number;
}

export function BudgetAllocation({ platforms, setPlatforms, totalBudget }: BudgetAllocationProps) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget Allocation</CardTitle>
        <CardDescription>
          Distribute your ${totalBudget.toLocaleString()} budget across selected platforms
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {enabledPlatforms.map((platform) => {
            const platformBudget = (totalBudget * platform.budgetPercentage) / 100;
            return (
              <div key={platform.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`budget-${platform.id}`} className="text-base font-medium">
                    {platform.name}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`budget-${platform.id}`}
                      type="number"
                      value={platform.budgetPercentage}
                      onChange={(e) => updateBudget(platform.id, parseFloat(e.target.value) || 0)}
                      className="w-20 text-right"
                      min="0"
                      max="100"
                    />
                    <span className="text-sm text-muted-foreground w-24">
                      ${platformBudget.toLocaleString()}
                    </span>
                  </div>
                </div>
                <Progress value={platform.budgetPercentage} className="h-2" />
              </div>
            );
          })}
        </div>

        <div className="pt-4 border-t">
          <div className="flex items-center justify-between text-lg font-semibold">
            <span>Total Allocated</span>
            <span className={remaining < 0 ? "text-destructive" : remaining > 0 ? "text-accent" : "text-primary"}>
              {totalAllocated}% ({remaining > 0 ? `${remaining}% remaining` : remaining < 0 ? `${Math.abs(remaining)}% over` : "complete"})
            </span>
          </div>
          <Progress value={totalAllocated} className="h-3 mt-2" />
        </div>
      </CardContent>
    </Card>
  );
}
