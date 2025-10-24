import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Copy } from "lucide-react";
import { PlatformWithMarkets, Market } from "@/types/mediaplan";

interface PlatformMarketBudgetSelectorProps {
  platforms: PlatformWithMarkets[];
  setPlatforms: (platforms: PlatformWithMarkets[]) => void;
  totalBudget: number;
}

export function PlatformMarketBudgetSelector({ 
  platforms, 
  setPlatforms,
  totalBudget 
}: PlatformMarketBudgetSelectorProps) {
  const enabledPlatforms = platforms.filter(p => p.enabled);
  const totalAllocated = enabledPlatforms.reduce((sum, p) => sum + p.budgetPercentage, 0);

  const togglePlatform = (platformId: string) => {
    setPlatforms(
      platforms.map(p => 
        p.id === platformId 
          ? { 
              ...p, 
              enabled: !p.enabled,
              markets: !p.enabled && p.markets.length === 0 
                ? [{ id: `${platformId}-market-1`, name: "Market 1", budgetPercentage: 100, phases: [] }]
                : p.markets
            }
          : p
      )
    );
  };

  const updatePlatformBudget = (platformId: string, percentage: number) => {
    setPlatforms(
      platforms.map(p => 
        p.id === platformId 
          ? { ...p, budgetPercentage: Math.max(0, Math.min(100, percentage)) }
          : p
      )
    );
  };

  const addMarket = (platformId: string) => {
    setPlatforms(
      platforms.map(p => {
        if (p.id === platformId) {
          const newMarket: Market = {
            id: `${platformId}-market-${p.markets.length + 1}-${Date.now()}`,
            name: `Market ${p.markets.length + 1}`,
            budgetPercentage: 0,
            phases: []
          };
          return { ...p, markets: [...p.markets, newMarket] };
        }
        return p;
      })
    );
  };

  const duplicateMarket = (platformId: string, marketId: string) => {
    setPlatforms(
      platforms.map(p => {
        if (p.id === platformId) {
          const marketToDup = p.markets.find(m => m.id === marketId);
          if (marketToDup) {
            const newMarket: Market = {
              ...marketToDup,
              id: `${platformId}-market-dup-${Date.now()}`,
              name: `${marketToDup.name} (Copy)`,
            };
            return { ...p, markets: [...p.markets, newMarket] };
          }
        }
        return p;
      })
    );
  };

  const removeMarket = (platformId: string, marketId: string) => {
    setPlatforms(
      platforms.map(p => 
        p.id === platformId 
          ? { ...p, markets: p.markets.filter(m => m.id !== marketId) }
          : p
      )
    );
  };

  const updateMarketName = (platformId: string, marketId: string, name: string) => {
    setPlatforms(
      platforms.map(p => 
        p.id === platformId 
          ? { 
              ...p, 
              markets: p.markets.map(m => 
                m.id === marketId ? { ...m, name } : m
              )
            }
          : p
      )
    );
  };

  const updateMarketBudget = (platformId: string, marketId: string, percentage: number) => {
    setPlatforms(
      platforms.map(p => 
        p.id === platformId 
          ? { 
              ...p, 
              markets: p.markets.map(m => 
                m.id === marketId 
                  ? { ...m, budgetPercentage: Math.max(0, Math.min(100, percentage)) }
                  : m
              )
            }
          : p
      )
    );
  };

  const duplicatePlatform = (platformId: string) => {
    const platformToDup = platforms.find(p => p.id === platformId);
    if (platformToDup) {
      const newPlatform: PlatformWithMarkets = {
        ...platformToDup,
        id: `${platformId}-dup-${Date.now()}`,
        name: `${platformToDup.name} (Copy)`,
        budgetPercentage: 0,
        markets: platformToDup.markets.map(m => ({
          ...m,
          id: `${platformId}-dup-${Date.now()}-${m.id}`
        }))
      };
      setPlatforms([...platforms, newPlatform]);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform & Market Selection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {platforms.map((platform) => (
            <div key={platform.id} className="space-y-3 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={platform.id}
                    checked={platform.enabled}
                    onCheckedChange={() => togglePlatform(platform.id)}
                  />
                  <Label htmlFor={platform.id} className="text-base font-medium cursor-pointer">
                    {platform.name}
                  </Label>
                  {platform.enabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => duplicatePlatform(platform.id)}
                      className="h-7 gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      Duplicate
                    </Button>
                  )}
                </div>
                {platform.enabled && (
                  <Badge variant="secondary">
                    {platform.budgetPercentage.toFixed(1)}% (${((totalBudget * platform.budgetPercentage) / 100).toLocaleString()})
                  </Badge>
                )}
              </div>

              {platform.enabled && (
                <div className="space-y-4 ml-6">
                  <div className="space-y-2">
                    <Label className="text-sm">Platform Budget Allocation</Label>
                    <Slider
                      value={[platform.budgetPercentage]}
                      onValueChange={([value]) => updatePlatformBudget(platform.id, value)}
                      min={0}
                      max={100}
                      step={0.5}
                      className="w-full"
                    />
                    <Input
                      type="number"
                      value={platform.budgetPercentage.toFixed(1)}
                      onChange={(e) => updatePlatformBudget(platform.id, parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                      min="0"
                      max="100"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Markets</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addMarket(platform.id)}
                        className="h-7 gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Add Market
                      </Button>
                    </div>

                    {platform.markets.map((market) => {
                      const marketBudget = (totalBudget * platform.budgetPercentage * market.budgetPercentage) / 10000;
                      const marketAllocated = platform.markets.reduce((sum, m) => sum + m.budgetPercentage, 0);

                      return (
                        <div key={market.id} className="p-3 bg-muted/50 rounded-md space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Input
                              value={market.name}
                              onChange={(e) => updateMarketName(platform.id, market.id, e.target.value)}
                              className="h-7 text-sm flex-1"
                              placeholder="Market name"
                            />
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => duplicateMarket(platform.id, market.id)}
                                className="h-7 w-7 p-0"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeMarket(platform.id, market.id)}
                                className="h-7 w-7 p-0"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Market Budget</span>
                              <Badge variant="outline" className="text-xs">
                                {market.budgetPercentage.toFixed(1)}% (${marketBudget.toLocaleString()})
                              </Badge>
                            </div>
                            <Slider
                              value={[market.budgetPercentage]}
                              onValueChange={([value]) => updateMarketBudget(platform.id, market.id, value)}
                              min={0}
                              max={100}
                              step={0.5}
                              className="w-full"
                            />
                          </div>
                        </div>
                      );
                    })}

                    {platform.markets.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Total market allocation: {platform.markets.reduce((sum, m) => sum + m.budgetPercentage, 0).toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {enabledPlatforms.length > 0 && (
          <div className="pt-4 border-t space-y-2">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Total Platform Budget</span>
              <span className={totalAllocated > 100 ? "text-destructive" : totalAllocated < 100 ? "text-amber-500" : "text-primary"}>
                {totalAllocated.toFixed(1)}%
              </span>
            </div>
            {totalAllocated !== 100 && (
              <p className="text-xs text-muted-foreground">
                {totalAllocated < 100 
                  ? `${(100 - totalAllocated).toFixed(1)}% unallocated`
                  : `${(totalAllocated - 100).toFixed(1)}% over budget`
                }
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
