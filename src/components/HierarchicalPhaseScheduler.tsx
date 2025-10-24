import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Copy, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { PlatformHierarchy, Market, Phase } from "@/types/hierarchy";
import { PhaseTimeline } from "./PhaseTimeline";
import { format, parseISO } from "date-fns";

interface HierarchicalPhaseSchedulerProps {
  platforms: PlatformHierarchy[];
  onPlatformsChange: (platforms: PlatformHierarchy[]) => void;
  startDate: string;
  endDate: string;
}

export function HierarchicalPhaseScheduler({ 
  platforms, 
  onPlatformsChange, 
  startDate, 
  endDate 
}: HierarchicalPhaseSchedulerProps) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());

  const togglePlatform = (platformId: string) => {
    const newExpanded = new Set(expandedPlatforms);
    if (newExpanded.has(platformId)) {
      newExpanded.delete(platformId);
    } else {
      newExpanded.add(platformId);
    }
    setExpandedPlatforms(newExpanded);
  };

  const toggleMarket = (marketId: string) => {
    const newExpanded = new Set(expandedMarkets);
    if (newExpanded.has(marketId)) {
      newExpanded.delete(marketId);
    } else {
      newExpanded.add(marketId);
    }
    setExpandedMarkets(newExpanded);
  };

  const duplicatePlatform = (platformId: string) => {
    const platform = platforms.find(p => p.id === platformId);
    if (!platform) return;

    const newPlatform: PlatformHierarchy = {
      ...platform,
      id: `${platform.id}-copy-${Date.now()}`,
      name: `${platform.name} (Copy)`,
      markets: platform.markets.map(market => ({
        ...market,
        id: `${market.id}-copy-${Date.now()}`,
        phases: market.phases.map(phase => ({
          ...phase,
          id: `${phase.id}-copy-${Date.now()}`,
          campaigns: phase.campaigns.map(campaign => ({
            ...campaign,
            id: `${campaign.id}-copy-${Date.now()}`
          }))
        }))
      }))
    };

    onPlatformsChange([...platforms, newPlatform]);
  };

  const duplicateMarket = (platformId: string, marketId: string) => {
    const updatedPlatforms = platforms.map(platform => {
      if (platform.id === platformId) {
        const market = platform.markets.find(m => m.id === marketId);
        if (!market) return platform;

        const newMarket: Market = {
          ...market,
          id: `${market.id}-copy-${Date.now()}`,
          name: `${market.name} (Copy)`,
          phases: market.phases.map(phase => ({
            ...phase,
            id: `${phase.id}-copy-${Date.now()}`,
            campaigns: phase.campaigns.map(campaign => ({
              ...campaign,
              id: `${campaign.id}-copy-${Date.now()}`
            }))
          }))
        };

        return {
          ...platform,
          markets: [...platform.markets, newMarket]
        };
      }
      return platform;
    });

    onPlatformsChange(updatedPlatforms);
  };

  const addMarket = (platformId: string) => {
    const updatedPlatforms = platforms.map(platform => {
      if (platform.id === platformId) {
        const newMarket: Market = {
          id: `market-${Date.now()}`,
          name: `Market ${platform.markets.length + 1}`,
          budgetPercentage: 0,
          phases: []
        };

        return {
          ...platform,
          markets: [...platform.markets, newMarket]
        };
      }
      return platform;
    });

    onPlatformsChange(updatedPlatforms);
  };

  const removeMarket = (platformId: string, marketId: string) => {
    const updatedPlatforms = platforms.map(platform => {
      if (platform.id === platformId) {
        return {
          ...platform,
          markets: platform.markets.filter(m => m.id !== marketId)
        };
      }
      return platform;
    });

    onPlatformsChange(updatedPlatforms);
  };

  const updateMarketBudget = (platformId: string, marketId: string, budget: number) => {
    const updatedPlatforms = platforms.map(platform => {
      if (platform.id === platformId) {
        return {
          ...platform,
          markets: platform.markets.map(m => 
            m.id === marketId ? { ...m, budgetPercentage: budget } : m
          )
        };
      }
      return platform;
    });

    onPlatformsChange(updatedPlatforms);
  };

  const updateMarketName = (platformId: string, marketId: string, name: string) => {
    const updatedPlatforms = platforms.map(platform => {
      if (platform.id === platformId) {
        return {
          ...platform,
          markets: platform.markets.map(m => 
            m.id === marketId ? { ...m, name } : m
          )
        };
      }
      return platform;
    });

    onPlatformsChange(updatedPlatforms);
  };

  const updateMarketPhases = (platformId: string, marketId: string, phases: Phase[]) => {
    const updatedPlatforms = platforms.map(platform => {
      if (platform.id === platformId) {
        return {
          ...platform,
          markets: platform.markets.map(m => 
            m.id === marketId ? { ...m, phases } : m
          )
        };
      }
      return platform;
    });

    onPlatformsChange(updatedPlatforms);
  };

  const updatePlatformBudget = (platformId: string, budget: number) => {
    const updatedPlatforms = platforms.map(platform => 
      platform.id === platformId ? { ...platform, budgetPercentage: budget } : platform
    );
    onPlatformsChange(updatedPlatforms);
  };

  const enabledPlatforms = platforms.filter(p => p.enabled);

  if (enabledPlatforms.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Phase Scheduling</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Please select at least one platform to begin phase scheduling.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hierarchical Phase Scheduling</CardTitle>
        <p className="text-sm text-muted-foreground">
          Organize your campaign by Platform → Market → Phase → Campaign
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {enabledPlatforms.map((platform) => {
          const isExpanded = expandedPlatforms.has(platform.id);
          const marketTotal = platform.markets.reduce((sum, m) => sum + m.budgetPercentage, 0);

          return (
            <div key={platform.id} className="border rounded-lg p-4 space-y-4">
              {/* Platform Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePlatform(platform.id)}
                    className="p-0 h-6 w-6"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                  <h3 className="font-semibold text-lg">{platform.name}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {platform.budgetPercentage.toFixed(1)}% of Total Budget
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Platform Budget:</span>
                    <Input
                      type="number"
                      value={platform.budgetPercentage}
                      onChange={(e) => updatePlatformBudget(platform.id, parseFloat(e.target.value) || 0)}
                      className="w-20 h-8 text-sm"
                      min="0"
                      max="100"
                    />
                    <span className="text-sm">%</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => duplicatePlatform(platform.id)}
                    className="gap-2"
                  >
                    <Copy className="h-3 w-3" />
                    Duplicate Platform
                  </Button>
                </div>
              </div>

              {/* Markets Section */}
              {isExpanded && (
                <div className="ml-8 space-y-4">
                  {platform.markets.map((market) => {
                    const isMarketExpanded = expandedMarkets.has(market.id);
                    const phaseTotal = market.phases.reduce((sum, p) => sum + p.budgetPercentage, 0);

                    return (
                      <div key={market.id} className="border border-primary/20 rounded-lg p-4 space-y-3 bg-muted/30">
                        {/* Market Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleMarket(market.id)}
                              className="p-0 h-6 w-6"
                            >
                              {isMarketExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                            <Input
                              value={market.name}
                              onChange={(e) => updateMarketName(platform.id, market.id, e.target.value)}
                              className="w-48 h-8 font-medium"
                            />
                            <Badge variant="outline" className="text-xs">
                              {market.budgetPercentage.toFixed(1)}% of Platform Budget
                            </Badge>
                            {phaseTotal !== 100 && (
                              <Badge variant="destructive" className="text-xs">
                                Phases total: {phaseTotal.toFixed(1)}%
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Market Budget:</span>
                              <Input
                                type="number"
                                value={market.budgetPercentage}
                                onChange={(e) => updateMarketBudget(platform.id, market.id, parseFloat(e.target.value) || 0)}
                                className="w-20 h-8 text-sm"
                                min="0"
                                max="100"
                              />
                              <span className="text-sm">%</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => duplicateMarket(platform.id, market.id)}
                              className="gap-2"
                            >
                              <Copy className="h-3 w-3" />
                              Duplicate
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeMarket(platform.id, market.id)}
                              className="gap-2 text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Phase Timeline */}
                        {isMarketExpanded && (
                          <div className="ml-8">
                            <PhaseTimeline
                              phases={market.phases}
                              onPhasesChange={(phases) => updateMarketPhases(platform.id, market.id, phases)}
                              startDate={startDate}
                              endDate={endDate}
                              platformId={platform.id}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addMarket(platform.id)}
                    className="gap-2 mt-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Market
                  </Button>

                  {marketTotal !== 100 && (
                    <div className="text-sm text-muted-foreground">
                      Total market allocation: <span className={marketTotal === 100 ? "text-primary font-medium" : "text-destructive font-medium"}>
                        {marketTotal.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
