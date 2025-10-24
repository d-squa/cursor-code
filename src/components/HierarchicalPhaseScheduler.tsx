import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { differenceInDays, format, parseISO } from "date-fns";
import { PlatformWithMarkets } from "./PlatformMarketSelector";
import { Phase } from "./PlatformConfiguration";

interface HierarchicalPhaseSchedulerProps {
  platforms: PlatformWithMarkets[];
  setPlatforms: (platforms: PlatformWithMarkets[]) => void;
  phases: Phase[];
  startDate: string;
  endDate: string;
  onPhasesChange: (phases: Phase[]) => void;
}

export function HierarchicalPhaseScheduler({ 
  platforms,
  setPlatforms,
  phases, 
  startDate, 
  endDate,
  onPhasesChange 
}: HierarchicalPhaseSchedulerProps) {
  const enabledPlatforms = platforms.filter(p => p.enabled);
  const totalDays = differenceInDays(parseISO(endDate), parseISO(startDate));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Phase Scheduling</CardTitle>
            <CardDescription>
              Hierarchical budget allocation: Activation → Platform → Market → Phase → Campaign
              <span className="block mt-1 text-xs">Duration: {totalDays} days ({format(parseISO(startDate), "MMM d")} - {format(parseISO(endDate), "MMM d, yyyy")})</span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {enabledPlatforms.map((platform) => (
          <div key={platform.id} className="p-4 border rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold">{platform.name}</h4>
                <p className="text-xs text-muted-foreground">Platform Budget: % of Total</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={platform.budgetPercentage || 0}
                  onChange={(e) => {
                    const newPlatforms = platforms.map(p =>
                      p.id === platform.id
                        ? { ...p, budgetPercentage: parseFloat(e.target.value) || 0 }
                        : p
                    );
                    setPlatforms(newPlatforms);
                  }}
                  className="w-20 text-right"
                  min="0"
                  max="100"
                />
                <span className="text-sm font-medium">%</span>
              </div>
            </div>

            {/* Markets */}
            <div className="pl-4 space-y-3 border-l-2 border-muted">
              {platform.markets.map((market) => (
                <div key={market.id} className="p-3 bg-muted/30 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-medium text-sm">{market.name}</h5>
                      <p className="text-xs text-muted-foreground">Market Budget: % of {platform.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={market.budgetPercentage || 0}
                        onChange={(e) => {
                          const newPlatforms = platforms.map(p =>
                            p.id === platform.id
                              ? {
                                  ...p,
                                  markets: p.markets.map(m =>
                                    m.id === market.id
                                      ? { ...m, budgetPercentage: parseFloat(e.target.value) || 0 }
                                      : m
                                  ),
                                }
                              : p
                          );
                          setPlatforms(newPlatforms);
                        }}
                        className="w-20 text-right"
                        min="0"
                        max="100"
                      />
                      <span className="text-sm font-medium">%</span>
                    </div>
                  </div>

                  {/* Phases for this market */}
                  <div className="pl-4 space-y-2 border-l-2 border-border">
                    {phases.map((phase) => {
                      const phaseDays = differenceInDays(
                        parseISO(phase.endDate),
                        parseISO(phase.startDate)
                      ) + 1;
                      const timePercentage = ((phaseDays / totalDays) * 100).toFixed(0);

                      return (
                        <div key={phase.id} className="p-2 bg-background rounded border text-xs">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">{phase.name}</span>
                              <span className="text-muted-foreground ml-2">
                                {phaseDays} days ({timePercentage}% of timeline)
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={phase.budgetPercentage || 0}
                                onChange={(e) => {
                                  const updatedPhases = phases.map(p =>
                                    p.id === phase.id
                                      ? { ...p, budgetPercentage: parseFloat(e.target.value) || 0 }
                                      : p
                                  );
                                  onPhasesChange(updatedPhases);
                                }}
                                className="w-16 text-right h-7"
                                min="0"
                                max="100"
                              />
                              <span className="text-xs">%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted-foreground italic">
                      Phase budget: % of {market.name} budget
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {enabledPlatforms.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            No platforms enabled. Please select platforms in Activation Details.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
