import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PlatformWithMarkets } from "@/types/mediaplan";
import { GenericConfig } from "./GenericStrategyConfig";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2, Loader2 } from "lucide-react";
import { determineStrategyFocus, getOptimizationGoalForFocus } from "@/utils/strategyFocusMapping";
import { generateAutoDetectPhases, getDefaultPhases } from "@/utils/funnelPhases";
import { CampaignPublisherConfig } from "./CampaignPublisherConfig";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getObjectiveFromPhaseName, getStrategyLabel } from "@/utils/phaseObjectiveMapping";
import { TargetingConfigComponent } from "./TargetingConfig";
import { HierarchicalTimelineScheduler } from "./HierarchicalTimelineScheduler";
import { GlobalFunnelPhasing } from "./GlobalFunnelPhasing";
import { toast } from "sonner";

interface StrategyCampaignConfigProps {
  platforms: PlatformWithMarkets[];
  genericConfig: GenericConfig;
  onPlatformsUpdate: (platforms: PlatformWithMarkets[]) => void;
  onGenericConfigUpdate: (config: GenericConfig) => void;
  onNext: () => void;
  onBack: () => void;
  startDate: string;
  endDate: string;
  globalFunnel: any[];
  onGlobalFunnelChange: (funnel: any[]) => void;
}

export function StrategyCampaignConfig({
  platforms,
  genericConfig,
  onPlatformsUpdate,
  onGenericConfigUpdate,
  onNext,
  onBack,
  startDate,
  endDate,
  globalFunnel,
  onGlobalFunnelChange,
}: StrategyCampaignConfigProps) {
  const [expandedCampaigns, setExpandedCampaigns] = useState<{ [key: string]: boolean }>({});
  const [activeTab, setActiveTab] = useState("strategy");

  // Real-time sync: When genericConfig changes, regenerate market phases
  useEffect(() => {
    if (!startDate || !endDate) return;
    
    const updated = platforms.map((platform) => {
      const updatedMarkets = platform.markets.map((market) => {
        const adFormats = market.adFormats || genericConfig.targeting?.adFormats || [];
        const hasPixel = !!market.pixel;
        const hasCatalog = !!market.catalog;

        // Determine strategy focus for this market
        const detectedFocus = determineStrategyFocus({
          adFormats,
          hasPixel,
          hasCatalog,
        });
        const focusToUse = market.strategyFocus || detectedFocus || genericConfig.strategyFocus || "conversions";

        let updatedPhases = market.phases || [];

        // Regenerate phases based on strategy
        if (genericConfig.strategy === "auto-detect") {
          // Only regenerate if phases don't exist or strategy/dates changed
          if (!market.phases || market.phases.length === 0) {
            const generatedPhases = generateAutoDetectPhases(
              adFormats,
              hasPixel,
              hasCatalog,
              startDate,
              endDate
            );
            updatedPhases = generatedPhases.map((p, idx) => ({
              ...p,
              id: `phase-${market.id}-${idx}`,
              objective: p.objective || getObjectiveFromPhaseName(p.name, focusToUse).objective,
              optimizationGoal: p.optimizationGoal || getObjectiveFromPhaseName(p.name, focusToUse).optimizationGoal,
            }));
          } else {
            // Update objectives/goals for existing phases if not manually set
            updatedPhases = market.phases.map(phase => {
              if (!phase.objective || !phase.optimizationGoal) {
                const autoDetected = getObjectiveFromPhaseName(phase.name, focusToUse);
                return {
                  ...phase,
                  objective: phase.objective || autoDetected.objective,
                  optimizationGoal: phase.optimizationGoal || autoDetected.optimizationGoal,
                };
              }
              return phase;
            });
          }
        } else if (genericConfig.strategy === "full-funnel" && genericConfig.strategyFocus && genericConfig.strategyFocus !== "auto") {
          // Full-funnel: Use default phases for the strategy focus
          if (!market.phases || market.phases.length === 0) {
            const defaultPhases = getDefaultPhases(genericConfig.strategyFocus, startDate, endDate);
            updatedPhases = defaultPhases.map((p, idx) => ({
              ...p,
              id: `phase-${market.id}-${idx}`,
              objective: p.objective || getObjectiveFromPhaseName(p.name, genericConfig.strategyFocus).objective,
              optimizationGoal: p.optimizationGoal || getObjectiveFromPhaseName(p.name, genericConfig.strategyFocus).optimizationGoal,
            }));
          } else {
            // Update objectives/goals for existing phases
            updatedPhases = market.phases.map(phase => {
              if (!phase.objective || !phase.optimizationGoal) {
                const autoDetected = getObjectiveFromPhaseName(phase.name, genericConfig.strategyFocus);
                return {
                  ...phase,
                  objective: phase.objective || autoDetected.objective,
                  optimizationGoal: phase.optimizationGoal || autoDetected.optimizationGoal,
                };
              }
              return phase;
            });
          }
        } else if (genericConfig.strategy === "manual") {
          // Manual: Create empty phase if none exist
          if (!market.phases || market.phases.length === 0) {
            updatedPhases = [{
              id: `phase-${market.id}-${Date.now()}`,
              name: "Campaign 1",
              startDate: startDate,
              endDate: endDate,
              budgetPercentage: 100,
            }];
          }
        }

        return {
          ...market,
          strategyFocus: focusToUse,
          phases: updatedPhases,
        };
      });

      return { ...platform, markets: updatedMarkets };
    });

    onPlatformsUpdate(updated);
  }, [genericConfig.strategy, genericConfig.strategyFocus, genericConfig.targeting?.adFormats, startDate, endDate]);

  const updateCampaignField = (
    platformId: string,
    marketId: string,
    phaseId: string,
    field: string,
    value: any
  ) => {
    const updatedPlatforms = platforms.map(p => {
      if (p.id === platformId) {
        return {
          ...p,
          markets: p.markets.map(m =>
            m.id === marketId
              ? {
                  ...m,
                  phases: (m.phases || []).map(phase =>
                    phase.id === phaseId ? { ...phase, [field]: value } : phase
                  ),
                }
              : m
          ),
        };
      }
      return p;
    });
    onPlatformsUpdate(updatedPlatforms);
  };

  const isStrategyComplete = () => {
    if (!genericConfig.strategy) return false;
    if (genericConfig.strategy === "auto-detect") return true;
    if (genericConfig.strategy === "full-funnel") {
      return !!(genericConfig.strategyFocus && genericConfig.strategyFocus !== "auto");
    }
    return true;
  };

  const isTargetingComplete = () => {
    return !!(
      genericConfig.targeting?.ageMin &&
      genericConfig.targeting?.ageMax
    );
  };

  const isCustomizationComplete = () => {
    return platforms.every(platform =>
      platform.markets.every(market =>
        market.phases && market.phases.length > 0
      )
    );
  };

  const canProceed = isStrategyComplete() && isTargetingComplete() && isCustomizationComplete();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Step 2: Strategy & Campaign Configuration</CardTitle>
            <CardDescription>Define strategy, targeting, phasing, and campaign details</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isStrategyComplete() && <Badge variant="outline" className="bg-green-50"><CheckCircle2 className="w-3 h-3 mr-1" />Strategy</Badge>}
            {isTargetingComplete() && <Badge variant="outline" className="bg-green-50"><CheckCircle2 className="w-3 h-3 mr-1" />Targeting</Badge>}
            {isCustomizationComplete() && <Badge variant="outline" className="bg-green-50"><CheckCircle2 className="w-3 h-3 mr-1" />Phasing</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="strategy">Strategy & Targeting</TabsTrigger>
            <TabsTrigger value="phasing">Phasing</TabsTrigger>
            <TabsTrigger value="publishers">Publishers & Placements</TabsTrigger>
            <TabsTrigger value="details">Campaign Details</TabsTrigger>
          </TabsList>

          {/* Tab 1: Strategy & Targeting */}
          <TabsContent value="strategy" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Strategy Type</Label>
                <Select
                  value={genericConfig.strategy || ""}
                  onValueChange={(value) => onGenericConfigUpdate({ ...genericConfig, strategy: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="auto-detect">Auto-Detect (Based on selections)</SelectItem>
                    <SelectItem value="full-funnel">Pre-Defined Full-Funnel</SelectItem>
                    <SelectItem value="manual">Manual Strategy</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {genericConfig.strategy !== "manual" && (
                <div className="space-y-2">
                  <Label>Strategy Focus</Label>
                  {genericConfig.strategy === "auto-detect" ? (
                    <Input
                      value="Auto"
                      disabled
                      className="bg-muted"
                    />
                  ) : (
                    <Select
                      value={genericConfig.strategyFocus || ""}
                      onValueChange={(value) => {
                        onGenericConfigUpdate({ ...genericConfig, strategyFocus: value as any });
                        if (startDate && endDate) {
                          const phases = getDefaultPhases(value, startDate, endDate);
                          onGlobalFunnelChange(phases);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select focus" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="Awareness">Awareness</SelectItem>
                        <SelectItem value="Market Presence">Market Presence</SelectItem>
                        <SelectItem value="In-App Actions">In-App Actions</SelectItem>
                        <SelectItem value="Purchases">Purchases</SelectItem>
                        <SelectItem value="Actions">Actions</SelectItem>
                        <SelectItem value="Conversions">Conversions</SelectItem>
                        <SelectItem value="Leads">Leads</SelectItem>
                        <SelectItem value="Revenue">Revenue</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">Targeting Configuration</h3>
              <TargetingConfigComponent
                targeting={genericConfig.targeting || {}}
                onUpdate={(targeting) => onGenericConfigUpdate({ ...genericConfig, targeting })}
                platformName={platforms[0]?.name || "Facebook (Meta)"}
              />
            </div>
          </TabsContent>

          {/* Tab 2: Phasing */}
          <TabsContent value="phasing" className="space-y-4">
            {genericConfig.strategy === "full-funnel" && (
              <GlobalFunnelPhasing
                globalFunnel={globalFunnel}
                onGlobalFunnelChange={(newFunnel) => {
                  onGlobalFunnelChange(newFunnel);
                  const updated = platforms.map(p => ({
                    ...p,
                    markets: p.markets.map(m => ({
                      ...m,
                      useGlobalFunnel: true,
                    })),
                  }));
                  onPlatformsUpdate(updated);
                }}
                onSaveGlobal={() => {
                  toast.success("Global funnel phases updated");
                }}
                startDate={startDate}
                endDate={endDate}
              />
            )}

            <HierarchicalTimelineScheduler
              platforms={platforms}
              setPlatforms={onPlatformsUpdate}
              startDate={startDate}
              endDate={endDate}
              globalFunnel={globalFunnel}
            />
          </TabsContent>

          {/* Tab 3: Publishers & Placements */}
          <TabsContent value="publishers" className="space-y-4">
            {platforms.map((platform) => (
              <Accordion type="multiple" key={platform.id} className="space-y-2">
                {platform.markets.map((market) => (
                  <AccordionItem key={market.id} value={market.id} className="border rounded-lg">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{market.name}</span>
                          <Badge variant="outline">{market.adAccountId || 'No account'}</Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <CampaignPublisherConfig
                        platformName={platform.name}
                        publisherPlatforms={market.publisherPlatforms || []}
                        positions={market.positions || {}}
                        onPublisherPlatformsChange={(pubs) => {
                          const updated = platforms.map(p => {
                            if (p.id === platform.id) {
                              return {
                                ...p,
                                markets: p.markets.map(m =>
                                  m.id === market.id ? { ...m, publisherPlatforms: pubs } : m
                                ),
                              };
                            }
                            return p;
                          });
                          onPlatformsUpdate(updated);
                        }}
                        onPositionsChange={(pos) => {
                          const updated = platforms.map(p => {
                            if (p.id === platform.id) {
                              return {
                                ...p,
                                markets: p.markets.map(m =>
                                  m.id === market.id ? { ...m, positions: pos } : m
                                ),
                              };
                            }
                            return p;
                          });
                          onPlatformsUpdate(updated);
                        }}
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ))}
          </TabsContent>

          {/* Tab 4: Campaign Details */}
          <TabsContent value="details" className="space-y-4">
            {platforms.map((platform) => (
              <Accordion type="multiple" key={platform.id} className="space-y-2">
                {platform.markets.map((market) => (
                  <AccordionItem key={market.id} value={market.id} className="border rounded-lg">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{market.name}</span>
                          <Badge variant="outline">{(market.phases || []).length} phases</Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {(market.phases || []).map((phase) => (
                        <Collapsible key={phase.id}>
                          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted rounded-lg hover:bg-muted/80">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{phase.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                {phase.startDate} → {phase.endDate}
                              </Badge>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="p-4 space-y-4 border-t">
                              {/* Objective & Optimization Goal */}
                              <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
                                <Label className="text-sm font-medium">Campaign Objective & Optimization Goal</Label>
                                {(() => {
                                  const autoDetected = getObjectiveFromPhaseName(
                                    phase.name,
                                    market.strategyFocus || genericConfig.strategyFocus
                                  );
                                  const currentObjective = phase.objective || autoDetected.objective;
                                  const currentOptGoal = phase.optimizationGoal || autoDetected.optimizationGoal;
                                  const isAutoDetected = !phase.objective && !phase.optimizationGoal;
                                  
                                  return (
                                    <>
                                      <p className="text-xs text-muted-foreground">
                                        {isAutoDetected ? "Auto-detected from phase name" : "Manually configured"}
                                      </p>
                                      <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-1">
                                          <Label htmlFor={`objective-${phase.id}`} className="text-xs">
                                            Objective {isAutoDetected && <span className="text-blue-600">(Auto)</span>}
                                          </Label>
                                          <Select
                                            value={currentObjective}
                                            onValueChange={(value) => {
                                              if (value === "AUTO_DETECT") {
                                                updateCampaignField(platform.id, market.id, phase.id, "objective", undefined);
                                                updateCampaignField(platform.id, market.id, phase.id, "optimizationGoal", undefined);
                                              } else {
                                                updateCampaignField(platform.id, market.id, phase.id, "objective", value);
                                              }
                                            }}
                                          >
                                            <SelectTrigger id={`objective-${phase.id}`}>
                                              <SelectValue placeholder="Select objective" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-background z-50">
                                              <SelectItem value="AUTO_DETECT" className="text-blue-600 font-medium">
                                                🔄 Auto-detect
                                              </SelectItem>
                                              <SelectItem value="OUTCOME_AWARENESS">Awareness</SelectItem>
                                              <SelectItem value="OUTCOME_TRAFFIC">Traffic</SelectItem>
                                              <SelectItem value="OUTCOME_ENGAGEMENT">Engagement</SelectItem>
                                              <SelectItem value="OUTCOME_LEADS">Leads</SelectItem>
                                              <SelectItem value="OUTCOME_APP_PROMOTION">App Promotion</SelectItem>
                                              <SelectItem value="OUTCOME_SALES">Sales</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div className="space-y-1">
                                          <Label htmlFor={`opt-goal-${phase.id}`} className="text-xs">
                                            Optimization Goal {isAutoDetected && <span className="text-blue-600">(Auto)</span>}
                                          </Label>
                                          <Select
                                            value={currentOptGoal}
                                            onValueChange={(value) => {
                                              if (value === "AUTO_DETECT") {
                                                updateCampaignField(platform.id, market.id, phase.id, "optimizationGoal", undefined);
                                              } else {
                                                updateCampaignField(platform.id, market.id, phase.id, "optimizationGoal", value);
                                              }
                                            }}
                                          >
                                            <SelectTrigger id={`opt-goal-${phase.id}`}>
                                              <SelectValue placeholder="Select goal" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-background z-50">
                                              <SelectItem value="AUTO_DETECT" className="text-blue-600 font-medium">
                                                🔄 Auto-detect
                                              </SelectItem>
                                              <SelectItem value="LINK_CLICKS">Link Clicks</SelectItem>
                                              <SelectItem value="LANDING_PAGE_VIEWS">Landing Page Views</SelectItem>
                                              <SelectItem value="LEADS">Leads</SelectItem>
                                              <SelectItem value="OFFSITE_CONVERSIONS">Conversions</SelectItem>
                                              <SelectItem value="APP_INSTALLS">App Installs</SelectItem>
                                              <SelectItem value="POST_ENGAGEMENT">Post Engagement</SelectItem>
                                              <SelectItem value="THRUPLAY">ThruPlay</SelectItem>
                                              <SelectItem value="REACH">Reach</SelectItem>
                                              <SelectItem value="IMPRESSIONS">Impressions</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ))}
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-6 border-t mt-6">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onNext} disabled={!canProceed}>
            {!canProceed && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Next: Forecast & Metrics
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
