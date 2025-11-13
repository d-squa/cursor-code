import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PlatformWithMarkets } from "@/types/mediaplan";
import { GenericConfig } from "./GenericStrategyConfig";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2 } from "lucide-react";
import { determineStrategyFocus } from "@/utils/strategyFocusMapping";
import { generateAutoDetectPhases } from "@/utils/funnelPhases";
import { CampaignPublisherConfig } from "./CampaignPublisherConfig";
import { getObjectiveFromPhaseName } from "@/utils/phaseObjectiveMapping";
import { TargetingConfigComponent } from "./TargetingConfig";

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
}: StrategyCampaignConfigProps) {

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
                const mapping = getObjectiveFromPhaseName(phase.name, focusToUse);
                return {
                  ...phase,
                  objective: phase.objective || mapping.objective,
                  optimizationGoal: phase.optimizationGoal || mapping.optimizationGoal,
                };
              }
              return phase;
            });
          }
        }

        return {
          ...market,
          phases: updatedPhases,
        };
      });

      return {
        ...platform,
        markets: updatedMarkets,
      };
    });

    // Only update if there are actual changes
    if (JSON.stringify(updated) !== JSON.stringify(platforms)) {
      onPlatformsUpdate(updated);
    }
  }, [genericConfig.strategy, genericConfig.targeting?.adFormats, genericConfig.strategyFocus, startDate, endDate]);

  const isStrategyComplete = () => {
    return !!genericConfig.strategy && !!startDate && !!endDate;
  };

  const isTargetingComplete = () => {
    return !!genericConfig.targeting?.adFormats && genericConfig.targeting.adFormats.length > 0;
  };

  const isCustomizationComplete = () => {
    return platforms.some(p => 
      p.enabled && p.markets.some(m => m.phases && m.phases.length > 0)
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
      <CardContent className="space-y-6">
        {/* Strategy & Targeting - Top Level */}
        <Card>
          <CardHeader>
            <CardTitle>Strategy & Targeting</CardTitle>
            <CardDescription>Configure campaign strategy and targeting parameters</CardDescription>
          </CardHeader>
          <CardContent>
            <TargetingConfigComponent
              targeting={genericConfig.targeting || {}}
              onUpdate={(targeting) => onGenericConfigUpdate({ ...genericConfig, targeting })}
              platformName="Generic"
            />
          </CardContent>
        </Card>

        {/* Phasing with Nested Campaign Customization */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Phasing & Configuration</CardTitle>
            <CardDescription>Configure phases and campaign details for each market</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {platforms.filter(p => p.enabled).map((platform) => (
              <div key={platform.id} className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <h3 className="text-lg font-semibold">{platform.name}</h3>
                  <Badge variant="outline">{platform.budgetPercentage}% Budget</Badge>
                </div>
                
                {platform.markets.map((market) => (
                  <div key={market.id} className="space-y-3 pl-4">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{market.name}</h4>
                      <Badge variant="secondary">{market.budgetPercentage}% of {platform.name}</Badge>
                    </div>
                    
                    <Accordion type="multiple" className="space-y-2">
                      {(market.phases || []).map((phase, phaseIdx) => (
                        <AccordionItem key={phase.id} value={phase.id} className="border rounded-lg px-4">
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center justify-between w-full pr-4">
                              <div className="flex items-center gap-3">
                                <span className="font-medium">{phase.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {phase.budgetPercentage}% Budget
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{phase.startDate}</span>
                                <span>→</span>
                                <span>{phase.endDate}</span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          
                          <AccordionContent className="space-y-6 pt-4">
                            {/* Campaign Details */}
                            <div className="space-y-4">
                              <h5 className="text-sm font-semibold">Campaign Settings</h5>
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Objective</Label>
                                  <Select
                                    value={phase.objective || ""}
                                    onValueChange={(value) => {
                                      const updatedPlatforms = platforms.map(p => {
                                        if (p.id !== platform.id) return p;
                                        return {
                                          ...p,
                                          markets: p.markets.map(m => {
                                            if (m.id !== market.id) return m;
                                            return {
                                              ...m,
                                              phases: m.phases?.map((ph, idx) => 
                                                idx === phaseIdx ? { ...ph, objective: value } : ph
                                              )
                                            };
                                          })
                                        };
                                      });
                                      onPlatformsUpdate(updatedPlatforms);
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select objective" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="OUTCOME_AWARENESS">Awareness</SelectItem>
                                      <SelectItem value="OUTCOME_ENGAGEMENT">Engagement</SelectItem>
                                      <SelectItem value="OUTCOME_TRAFFIC">Traffic</SelectItem>
                                      <SelectItem value="OUTCOME_LEADS">Leads</SelectItem>
                                      <SelectItem value="OUTCOME_APP_PROMOTION">App Promotion</SelectItem>
                                      <SelectItem value="OUTCOME_SALES">Sales</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label>Optimization Goal</Label>
                                  <Select
                                    value={phase.optimizationGoal || ""}
                                    onValueChange={(value) => {
                                      const updatedPlatforms = platforms.map(p => {
                                        if (p.id !== platform.id) return p;
                                        return {
                                          ...p,
                                          markets: p.markets.map(m => {
                                            if (m.id !== market.id) return m;
                                            return {
                                              ...m,
                                              phases: m.phases?.map((ph, idx) => 
                                                idx === phaseIdx ? { ...ph, optimizationGoal: value } : ph
                                              )
                                            };
                                          })
                                        };
                                      });
                                      onPlatformsUpdate(updatedPlatforms);
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select optimization goal" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="REACH">Reach</SelectItem>
                                      <SelectItem value="IMPRESSIONS">Impressions</SelectItem>
                                      <SelectItem value="LINK_CLICKS">Link Clicks</SelectItem>
                                      <SelectItem value="LANDING_PAGE_VIEWS">Landing Page Views</SelectItem>
                                      <SelectItem value="POST_ENGAGEMENT">Post Engagement</SelectItem>
                                      <SelectItem value="THRUPLAY">ThruPlay</SelectItem>
                                      <SelectItem value="CONVERSATIONS">Conversations</SelectItem>
                                      <SelectItem value="OFFSITE_CONVERSIONS">Offsite Conversions</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>

                            {/* Publishers & Placements */}
                            <div className="space-y-4">
                              <h5 className="text-sm font-semibold">Publishers & Placements</h5>
                              <CampaignPublisherConfig
                                platformName={platform.name}
                                publisherPlatforms={phase.publisherPlatforms || market.publisherPlatforms || []}
                                positions={phase.positions || market.positions || {}}
                                onPublisherPlatformsChange={(selectedPlatforms) => {
                                  const updatedPlatforms = platforms.map(p => {
                                    if (p.id !== platform.id) return p;
                                    return {
                                      ...p,
                                      markets: p.markets.map(m => {
                                        if (m.id !== market.id) return m;
                                        return {
                                          ...m,
                                          phases: m.phases?.map((ph, idx) => 
                                            idx === phaseIdx ? { ...ph, publisherPlatforms: selectedPlatforms } : ph
                                          )
                                        };
                                      })
                                    };
                                  });
                                  onPlatformsUpdate(updatedPlatforms);
                                }}
                                onPositionsChange={(positions) => {
                                  const updatedPlatforms = platforms.map(p => {
                                    if (p.id !== platform.id) return p;
                                    return {
                                      ...p,
                                      markets: p.markets.map(m => {
                                        if (m.id !== market.id) return m;
                                        return {
                                          ...m,
                                          phases: m.phases?.map((ph, idx) => 
                                            idx === phaseIdx ? { ...ph, positions } : ph
                                          )
                                        };
                                      })
                                    };
                                  });
                                  onPlatformsUpdate(updatedPlatforms);
                                }}
                              />
                            </div>

                            {/* Targeting Overrides */}
                            <div className="space-y-4">
                              <h5 className="text-sm font-semibold">Targeting Overrides (Optional)</h5>
                              <p className="text-xs text-muted-foreground">
                                Leave empty to inherit from market/generic targeting
                              </p>
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Gender</Label>
                                  <Select
                                    value={phase.gender || ""}
                                    onValueChange={(value) => {
                                      const updatedPlatforms = platforms.map(p => {
                                        if (p.id !== platform.id) return p;
                                        return {
                                          ...p,
                                          markets: p.markets.map(m => {
                                            if (m.id !== market.id) return m;
                                            return {
                                              ...m,
                                              phases: m.phases?.map((ph, idx) => 
                                                idx === phaseIdx ? { ...ph, gender: value } : ph
                                              )
                                            };
                                          })
                                        };
                                      });
                                      onPlatformsUpdate(updatedPlatforms);
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Inherit from market" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="">Inherit from market</SelectItem>
                                      <SelectItem value="1">Male</SelectItem>
                                      <SelectItem value="2">Female</SelectItem>
                                      <SelectItem value="0">All</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label>Age Range</Label>
                                  <div className="flex gap-2">
                                    <Input
                                      type="number"
                                      placeholder="Min"
                                      value={phase.ageMin || ""}
                                      onChange={(e) => {
                                        const updatedPlatforms = platforms.map(p => {
                                          if (p.id !== platform.id) return p;
                                          return {
                                            ...p,
                                            markets: p.markets.map(m => {
                                              if (m.id !== market.id) return m;
                                              return {
                                                ...m,
                                                phases: m.phases?.map((ph, idx) => 
                                                  idx === phaseIdx ? { ...ph, ageMin: parseInt(e.target.value) } : ph
                                                )
                                              };
                                            })
                                          };
                                        });
                                        onPlatformsUpdate(updatedPlatforms);
                                      }}
                                    />
                                    <Input
                                      type="number"
                                      placeholder="Max"
                                      value={phase.ageMax || ""}
                                      onChange={(e) => {
                                        const updatedPlatforms = platforms.map(p => {
                                          if (p.id !== platform.id) return p;
                                          return {
                                            ...p,
                                            markets: p.markets.map(m => {
                                              if (m.id !== market.id) return m;
                                              return {
                                                ...m,
                                                phases: m.phases?.map((ph, idx) => 
                                                  idx === phaseIdx ? { ...ph, ageMax: parseInt(e.target.value) } : ph
                                                )
                                              };
                                            })
                                          };
                                        });
                                        onPlatformsUpdate(updatedPlatforms);
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button 
            onClick={onNext}
            disabled={!canProceed}
          >
            Next: Campaign Forecast
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}