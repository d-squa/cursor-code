import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Copy } from "lucide-react";
import { PlatformWithMarkets, Market } from "@/types/mediaplan";

interface PlatformMarketBudgetSelectorProps {
  platforms: PlatformWithMarkets[];
  setPlatforms: (platforms: PlatformWithMarkets[]) => void;
  totalBudget: number;
}

const AVAILABLE_PLATFORMS = [
  { id: "meta", name: "Meta" },
  { id: "google", name: "Google Ads" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "tiktok", name: "TikTok" },
  { id: "snapchat", name: "Snapchat" },
  { id: "pinterest", name: "Pinterest" },
];

export function PlatformMarketBudgetSelector({ 
  platforms, 
  setPlatforms,
  totalBudget 
}: PlatformMarketBudgetSelectorProps) {
  const totalAllocated = platforms.reduce((sum, p) => sum + p.budgetPercentage, 0);
  const usedPlatformIds = platforms.map(p => p.id).filter(id => id !== "");

  const addPlatform = () => {
    const newPlatform: PlatformWithMarkets = {
      id: "",
      name: "",
      enabled: true,
      budgetPercentage: 0,
      markets: [{ id: `market-1-${Date.now()}`, name: "Market 1", budgetPercentage: 100, phases: [] }]
    };
    setPlatforms([...platforms, newPlatform]);
  };

  const removePlatform = (index: number) => {
    setPlatforms(platforms.filter((_, i) => i !== index));
  };

  const updatePlatformSelection = (index: number, platformId: string) => {
    const selectedPlatform = AVAILABLE_PLATFORMS.find(p => p.id === platformId);
    if (selectedPlatform) {
      setPlatforms(
        platforms.map((p, i) => 
          i === index 
            ? { ...p, id: selectedPlatform.id, name: selectedPlatform.name }
            : p
        )
      );
    }
  };

  const duplicatePlatform = (index: number) => {
    const platformToDup = platforms[index];
    const newPlatform: PlatformWithMarkets = {
      id: "",
      name: "",
      enabled: true,
      budgetPercentage: platformToDup.budgetPercentage,
      markets: platformToDup.markets.map(m => ({
        ...m,
        id: `${m.id}-dup-${Date.now()}`
      }))
    };
    setPlatforms([...platforms, newPlatform]);
  };

  const updatePlatformBudget = (index: number, percentage: number) => {
    setPlatforms(
      platforms.map((p, i) => 
        i === index 
          ? { ...p, budgetPercentage: Math.max(0, Math.min(100, percentage)) }
          : p
      )
    );
  };

  const addMarket = (index: number) => {
    setPlatforms(
      platforms.map((p, i) => {
        if (i === index) {
          const usedMarketNames = p.markets.map(m => m.name.toLowerCase());
          let marketNum = p.markets.length + 1;
          let marketName = `Market ${marketNum}`;
          
          while (usedMarketNames.includes(marketName.toLowerCase())) {
            marketNum++;
            marketName = `Market ${marketNum}`;
          }
          
          const newMarket: Market = {
            id: `market-${Date.now()}`,
            name: marketName,
            budgetPercentage: 0,
            phases: []
          };
          return { ...p, markets: [...p.markets, newMarket] };
        }
        return p;
      })
    );
  };

  const duplicateMarket = (platformIndex: number, marketId: string) => {
    setPlatforms(
      platforms.map((p, i) => {
        if (i === platformIndex) {
          const marketToDup = p.markets.find(m => m.id === marketId);
          if (marketToDup) {
            const usedMarketNames = p.markets.map(m => m.name.toLowerCase());
            let newName = `${marketToDup.name} (Copy)`;
            let counter = 1;
            
            while (usedMarketNames.includes(newName.toLowerCase())) {
              counter++;
              newName = `${marketToDup.name} (Copy ${counter})`;
            }
            
            const newMarket: Market = {
              ...marketToDup,
              id: `market-dup-${Date.now()}`,
              name: newName,
            };
            return { ...p, markets: [...p.markets, newMarket] };
          }
        }
        return p;
      })
    );
  };

  const removeMarket = (platformIndex: number, marketId: string) => {
    setPlatforms(
      platforms.map((p, i) => 
        i === platformIndex 
          ? { ...p, markets: p.markets.filter(m => m.id !== marketId) }
          : p
      )
    );
  };

  const updateMarketName = (platformIndex: number, marketId: string, name: string) => {
    setPlatforms(
      platforms.map((p, i) => 
        i === platformIndex 
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

  const updateMarketBudget = (platformIndex: number, marketId: string, percentage: number) => {
    setPlatforms(
      platforms.map((p, i) => 
        i === platformIndex 
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

  const getAvailablePlatforms = (currentPlatformId: string) => {
    return AVAILABLE_PLATFORMS.filter(
      ap => !usedPlatformIds.includes(ap.id) || ap.id === currentPlatformId
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Platform & Market Selection</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPlatform}
            className="gap-1"
            disabled={platforms.length >= AVAILABLE_PLATFORMS.length}
          >
            <Plus className="h-3 w-3" />
            Add Platform
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {platforms.map((platform, platformIndex) => {
            const availablePlatforms = getAvailablePlatforms(platform.id);
            
            return (
              <div key={platformIndex} className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between gap-3">
                  <Select
                    value={platform.id}
                    onValueChange={(value) => updatePlatformSelection(platformIndex, value)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePlatforms.map((ap) => (
                        <SelectItem key={ap.id} value={ap.id}>
                          {ap.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {platform.budgetPercentage.toFixed(1)}% (${((totalBudget * platform.budgetPercentage) / 100).toLocaleString()})
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => duplicatePlatform(platformIndex)}
                      className="h-7 w-7 p-0"
                      disabled={platforms.length >= AVAILABLE_PLATFORMS.length}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePlatform(platformIndex)}
                      className="h-7 w-7 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {platform.id && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Platform Budget Allocation</Label>
                      <Slider
                        value={[platform.budgetPercentage]}
                        onValueChange={([value]) => updatePlatformBudget(platformIndex, value)}
                        min={0}
                        max={100}
                        step={0.5}
                        className="w-full"
                      />
                      <Input
                        type="number"
                        value={platform.budgetPercentage.toFixed(1)}
                        onChange={(e) => updatePlatformBudget(platformIndex, parseFloat(e.target.value) || 0)}
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
                          onClick={() => addMarket(platformIndex)}
                          className="h-7 gap-1"
                        >
                          <Plus className="h-3 w-3" />
                          Add Market
                        </Button>
                      </div>

                      {platform.markets.map((market) => {
                        const marketBudget = (totalBudget * platform.budgetPercentage * market.budgetPercentage) / 10000;

                        return (
                          <div key={market.id} className="p-3 bg-muted/50 rounded-md space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <Input
                                value={market.name}
                                onChange={(e) => updateMarketName(platformIndex, market.id, e.target.value)}
                                className="h-7 text-sm flex-1"
                                placeholder="Market name"
                              />
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => duplicateMarket(platformIndex, market.id)}
                                  className="h-7 w-7 p-0"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeMarket(platformIndex, market.id)}
                                  className="h-7 w-7 p-0"
                                  disabled={platform.markets.length === 1}
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
                                onValueChange={([value]) => updateMarketBudget(platformIndex, market.id, value)}
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
            );
          })}
        </div>

        {platforms.length > 0 && (
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
