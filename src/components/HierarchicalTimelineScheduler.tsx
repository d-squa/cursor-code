import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Plus, X, Copy, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { PlatformWithMarkets, Market, Phase, Campaign, FunnelStage } from "@/types/mediaplan";
import { format, parseISO, addDays, differenceInDays } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface HierarchicalTimelineSchedulerProps {
  platforms: PlatformWithMarkets[];
  setPlatforms: (platforms: PlatformWithMarkets[]) => void;
  startDate: string;
  endDate: string;
  globalFunnel: FunnelStage[];
}

export function HierarchicalTimelineScheduler({
  platforms,
  setPlatforms,
  startDate,
  endDate,
  globalFunnel,
}: HierarchicalTimelineSchedulerProps) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());

  const applyGlobalFunnelToMarket = (platformId: string, marketId: string) => {
    setPlatforms(
      platforms.map(p => {
        if (p.id === platformId) {
          return {
            ...p,
            markets: p.markets.map(m => {
              if (m.id === marketId) {
                const phases: Phase[] = globalFunnel.map(stage => ({
                  id: `phase-${stage.id}-${Date.now()}`,
                  name: stage.name,
                  startDate: stage.startDate,
                  endDate: stage.endDate,
                  budgetPercentage: stage.budgetPercentage,
                }));
                return { ...m, phases, useGlobalFunnel: true };
              }
              return m;
            })
          };
        }
        return p;
      })
    );
  };

  const resetToGlobalFunnel = (platformId: string, marketId: string) => {
    applyGlobalFunnelToMarket(platformId, marketId);
  };

  const markAsCustom = (platformId: string, marketId: string) => {
    setPlatforms(
      platforms.map(p => {
        if (p.id === platformId) {
          return {
            ...p,
            markets: p.markets.map(m => {
              if (m.id === marketId) {
                return { ...m, useGlobalFunnel: false };
              }
              return m;
            })
          };
        }
        return p;
      })
    );
  };

  const enabledPlatforms = platforms.filter(p => p.id !== "");

  if (!startDate || !endDate) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            Please complete Activation Details first.
          </p>
        </CardContent>
      </Card>
    );
  }

  const campaignStart = parseISO(startDate);
  const campaignEnd = parseISO(endDate);
  const totalDays = differenceInDays(campaignEnd, campaignStart);

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

  const addPhase = (platformId: string, marketId: string) => {
    setPlatforms(
      platforms.map(p => {
        if (p.id === platformId) {
          return {
            ...p,
            markets: p.markets.map(m => {
              if (m.id === marketId) {
                const newPhase: Phase = {
                  id: `phase-${Date.now()}`,
                  name: `Phase ${(m.phases?.length || 0) + 1}`,
                  startDate: format(campaignStart, "yyyy-MM-dd"),
                  endDate: format(addDays(campaignStart, 7), "yyyy-MM-dd"),
                  budgetPercentage: 0,
                };
                return { ...m, phases: [...(m.phases || []), newPhase], useGlobalFunnel: false };
              }
              return m;
            })
          };
        }
        return p;
      })
    );
  };

  const duplicatePhase = (platformId: string, marketId: string, phaseId: string) => {
    setPlatforms(
      platforms.map(p => {
        if (p.id === platformId) {
          return {
            ...p,
            markets: p.markets.map(m => {
              if (m.id === marketId) {
                const phaseToDup = m.phases?.find(ph => ph.id === phaseId);
                if (phaseToDup) {
                  const newPhase: Phase = {
                    ...phaseToDup,
                    id: `phase-${Date.now()}`,
                    name: `${phaseToDup.name} (Copy)`,
                  };
                  return { ...m, phases: [...(m.phases || []), newPhase] };
                }
              }
              return m;
            })
          };
        }
        return p;
      })
    );
  };

  const removePhase = (platformId: string, marketId: string, phaseId: string) => {
    setPlatforms(
      platforms.map(p => {
        if (p.id === platformId) {
          return {
            ...p,
            markets: p.markets.map(m => {
              if (m.id === marketId) {
                return { ...m, phases: m.phases?.filter(ph => ph.id !== phaseId) };
              }
              return m;
            })
          };
        }
        return p;
      })
    );
  };

  const updatePhaseName = (platformId: string, marketId: string, phaseId: string, name: string) => {
    setPlatforms(
      platforms.map(p => {
        if (p.id === platformId) {
          return {
            ...p,
            markets: p.markets.map(m => {
              if (m.id === marketId) {
                return {
                  ...m,
                  useGlobalFunnel: false,
                  phases: m.phases?.map(ph => ph.id === phaseId ? { ...ph, name } : ph)
                };
              }
              return m;
            })
          };
        }
        return p;
      })
    );
  };

  const updatePhaseBudget = (platformId: string, marketId: string, phaseId: string, percentage: number) => {
    setPlatforms(
      platforms.map(p => {
        if (p.id === platformId) {
          return {
            ...p,
            markets: p.markets.map(m => {
              if (m.id === marketId) {
                return {
                  ...m,
                  useGlobalFunnel: false,
                  phases: m.phases?.map(ph => 
                    ph.id === phaseId 
                      ? { ...ph, budgetPercentage: Math.max(0, Math.min(100, percentage)) }
                      : ph
                  )
                };
              }
              return m;
            })
          };
        }
        return p;
      })
    );
  };

  // Campaign management removed - phases ARE campaigns

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phasing</CardTitle>
        <p className="text-xs text-muted-foreground">
          {format(campaignStart, "MMM d, yyyy")} - {format(campaignEnd, "MMM d, yyyy")} ({totalDays + 1} days)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {enabledPlatforms.map((platform) => (
          <Collapsible
            key={platform.id}
            open={expandedPlatforms.has(platform.id)}
            onOpenChange={() => togglePlatform(platform.id)}
          >
            <div className="border rounded-lg">
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    {expandedPlatforms.has(platform.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium">{platform.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {platform.budgetPercentage.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="p-3 space-y-3 border-t">
                  {platform.markets.map((market) => {
                    const phaseAllocated = market.phases?.reduce((sum, p) => sum + p.budgetPercentage, 0) || 0;
                    
                    return (
                      <Collapsible
                        key={market.id}
                        open={expandedMarkets.has(market.id)}
                        onOpenChange={() => toggleMarket(market.id)}
                      >
                        <div className="border rounded-md bg-muted/30">
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/50">
                              <div className="flex items-center gap-2">
                                {expandedMarkets.has(market.id) ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                                <span className="text-sm font-medium">{market.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {market.budgetPercentage.toFixed(1)}%
                                </Badge>
                                {market.useGlobalFunnel && (
                                  <Badge variant="secondary" className="text-xs">
                                    Global Strategy
                                  </Badge>
                                )}
                              </div>
                              <div className="flex gap-1">
                                {market.useGlobalFunnel === false && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      resetToGlobalFunnel(platform.id, market.id);
                                    }}
                                    className="h-6 gap-1"
                                    title="Reset to global funnel"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    Reset
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addPhase(platform.id, market.id);
                                  }}
                                  className="h-6 gap-1"
                                >
                                  <Plus className="h-3 w-3" />
                                  Add Phase
                                </Button>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="p-2 space-y-2 border-t">
                              {market.phases?.map((phase) => (
                                <div key={phase.id} className="p-2 bg-background rounded border space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <Input
                                      value={phase.name}
                                      onChange={(e) => updatePhaseName(platform.id, market.id, phase.id, e.target.value)}
                                      className="h-7 text-sm flex-1"
                                    />
                                    <Badge variant="secondary" className="text-xs">
                                      {phase.budgetPercentage.toFixed(1)}%
                                    </Badge>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => duplicatePhase(platform.id, market.id, phase.id)}
                                      className="h-6 w-6 p-0"
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removePhase(platform.id, market.id, phase.id)}
                                      className="h-6 w-6 p-0"
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  
                                  <Slider
                                    value={[phase.budgetPercentage]}
                                    onValueChange={([value]) => updatePhaseBudget(platform.id, market.id, phase.id, value)}
                                    min={0}
                                    max={100}
                                    step={0.5}
                                    className="w-full"
                                  />
                                </div>
                              ))}
                              
                              {market.phases && market.phases.length > 0 && (
                                <div className="text-xs text-muted-foreground pt-1">
                                  Phase allocation: {phaseAllocated.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
}
