import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Platform } from "./PlatformConfiguration";
import { format, parseISO } from "date-fns";

interface BudgetSummaryProps {
  platforms: Platform[];
  setPlatforms: (platforms: Platform[]) => void;
  totalBudget: number;
  startDate?: string;
  endDate?: string;
}

export function BudgetSummary({ platforms, setPlatforms, totalBudget, startDate, endDate }: BudgetSummaryProps) {
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
        <CardTitle className="text-base">Budget Allocation</CardTitle>
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center justify-between">
            <span>Total Budget:</span>
            <span className="font-semibold">${totalBudget.toLocaleString()}</span>
          </div>
          {startDate && endDate && (
            <div className="flex items-center justify-between">
              <span>Duration:</span>
              <span className="font-medium">
                {format(parseISO(startDate), "MMM d")} - {format(parseISO(endDate), "MMM d, yyyy")}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {enabledPlatforms.map((platform) => {
          const platformBudget = (totalBudget * platform.budgetPercentage) / 100;
          const platformStartDate = platform.config?.phases?.[0]?.startDate || startDate;
          const platformEndDate = platform.config?.phases?.[platform.config.phases.length - 1]?.endDate || endDate;

          return (
            <div key={platform.id} className="space-y-2 pb-3 border-b last:border-b-0 last:pb-0">
              <div className="flex items-center justify-between text-sm">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{platform.name}</span>
                  {platformStartDate && platformEndDate && (
                    <span className="text-[10px] text-muted-foreground">
                      {format(parseISO(platformStartDate), "MMM d")} - {format(parseISO(platformEndDate), "MMM d")}
                    </span>
                  )}
                </div>
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

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <Label className="text-[10px]">Percentage</Label>
                  <Input
                    type="number"
                    value={platform.budgetPercentage.toFixed(1)}
                    onChange={(e) => updateBudgetPercentage(platform.id, parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs p-1"
                    min="0"
                    max="100"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Amount ($)</Label>
                  <Input
                    type="number"
                    value={Math.round(platformBudget)}
                    onChange={(e) => updateBudgetAmount(platform.id, parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs p-1"
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
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground truncate max-w-[120px]" title={phase.name}>
                            {phase.name}
                          </span>
                          {phase.startDate && phase.endDate && (
                            <span className="text-[10px] text-muted-foreground/70">
                              {format(parseISO(phase.startDate), "MMM d")} - {format(parseISO(phase.endDate), "MMM d")}
                            </span>
                          )}
                        </div>
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

              {platform.config?.campaigns && platform.config.campaigns.length > 0 && (
                <div className="mt-2 space-y-1 pl-2 border-l-2 border-primary/30">
                  <p className="text-xs font-medium text-muted-foreground">Campaigns</p>
                  {platform.config.campaigns.map((campaign) => (
                    <div key={campaign.id} className="text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground truncate max-w-[140px]" title={campaign.name}>
                            {campaign.name}
                          </span>
                          {startDate && endDate && (
                            <span className="text-[10px] text-muted-foreground/70">
                              {format(parseISO(startDate), "MMM d")} - {format(parseISO(endDate), "MMM d")}
                            </span>
                          )}
                        </div>
                        {campaign.funnelStage && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            {campaign.funnelStage}
                          </Badge>
                        )}
                      </div>
                      {campaign.objective && (
                        <div className="text-[10px] text-muted-foreground/80 truncate" title={campaign.objective}>
                          {campaign.objective}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-2 border-t">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total</span>
            <span className={remaining < 0 ? "text-destructive" : remaining > 0 ? "text-accent" : "text-primary"}>
              {totalAllocated.toFixed(1)}%
            </span>
          </div>
          {remaining !== 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {remaining > 0 ? `${remaining.toFixed(1)}% unallocated` : `${Math.abs(remaining).toFixed(1)}% over budget`}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
