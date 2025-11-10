import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PlatformWithMarkets } from "@/types/mediaplan";
import { GenericConfig } from "./GenericStrategyConfig";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2, Edit, ChevronDown, ChevronUp } from "lucide-react";
import { determineStrategyFocus, getOptimizationGoalForFocus } from "@/utils/strategyFocusMapping";
import { generateAutoDetectPhases } from "@/utils/funnelPhases";
import { CampaignPublisherConfig } from "./CampaignPublisherConfig";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getObjectiveFromPhaseName, getStrategyLabel } from "@/utils/phaseObjectiveMapping";

interface PlatformCustomizationProps {
  platforms: PlatformWithMarkets[];
  genericConfig: GenericConfig;
  onPlatformsUpdate: (platforms: PlatformWithMarkets[]) => void;
  onNext: () => void;
  onBack: () => void;
  startDate: string;
  endDate: string;
}

// Platform-specific objective mappings
const platformObjectiveMapping: Record<string, Record<string, string[]>> = {
  "Facebook (Meta)": {
    "Awareness": ["Brand Awareness", "Reach"],
    "Consideration": ["Traffic", "Engagement", "App Installs", "Video Views", "Lead Generation"],
    "Conversion": ["Conversions", "Catalog Sales"],
  },
  "Instagram (Meta)": {
    "Awareness": ["Brand Awareness", "Reach"],
    "Consideration": ["Traffic", "Engagement", "Video Views"],
    "Conversion": ["Conversions", "Shopping"],
  },
  "Google Ads": {
    "Awareness": ["Display", "Video", "Discovery"],
    "Consideration": ["Search", "Shopping", "Video"],
    "Conversion": ["Performance Max", "Shopping", "Search"],
  },
  "YouTube (Google)": {
    "Awareness": ["Video Reach", "Brand Awareness"],
    "Consideration": ["Video Views", "Consideration"],
    "Conversion": ["Conversions", "Action"],
  },
  "LinkedIn": {
    "Awareness": ["Brand Awareness", "Reach"],
    "Consideration": ["Website Visits", "Engagement", "Video Views"],
    "Conversion": ["Lead Generation", "Conversions"],
  },
  "TikTok": {
    "Awareness": ["Reach", "Video Views"],
    "Consideration": ["Traffic", "Community Interaction"],
    "Conversion": ["Conversions", "App Installs"],
  },
};

export function PlatformCustomization({
  platforms,
  genericConfig,
  onPlatformsUpdate,
  onNext,
  onBack,
  startDate,
  endDate,
}: PlatformCustomizationProps) {
  const [editingMode, setEditingMode] = useState<{ [key: string]: boolean }>({});
  const [expandedCampaigns, setExpandedCampaigns] = useState<{ [key: string]: boolean }>({});

  // Auto-generate phases on mount if using auto-detect and phases are missing
  useEffect(() => {
    if (genericConfig.strategy !== "auto-detect") return;
    if (!startDate || !endDate) return;

    let changed = false;
    const updated = platforms.map((platform) => {
      const updatedMarkets = platform.markets.map((market) => {
        // Only generate if phases are truly empty or missing
        const hasValidPhases = Array.isArray(market.phases) && market.phases.length > 0;
        if (hasValidPhases) return market;

        const adFormats = market.adFormats || genericConfig.targeting?.adFormats || [];
        const hasPixel = !!market.pixel;
        const hasCatalog = !!market.catalog;

        // Skip if no configuration to detect from
        if (!adFormats.length && !hasPixel && !hasCatalog) return market;

        const detectedFocus = determineStrategyFocus({
          adFormats,
          hasPixel,
          hasCatalog,
        });

        const phases = generateAutoDetectPhases(
          adFormats,
          hasPixel,
          hasCatalog,
          startDate,
          endDate
        );

        if (!phases || phases.length === 0) return market;
        changed = true;

        return {
          ...market,
          strategyFocus: detectedFocus || "conversions",
          phases: phases.map((p) => ({
            ...p,
            id: `phase-${market.id}-${p.id}`,
          })),
        };
      });
      return { ...platform, markets: updatedMarkets };
    });

    if (changed) {
      onPlatformsUpdate(updated);
    }
  }, []); // Only run once on mount

  const mapGenericToPlatformObjective = (
    platformName: string,
    genericFocus?: string,
    market?: any
  ): string => {
    // First, try to determine focus from market-specific ad formats and config
    if (market) {
      const determinedFocus = determineStrategyFocus({
        adFormats: market.adFormats || genericConfig.targeting?.adFormats || [],
        hasPixel: !!market.pixel,
        hasCatalog: !!market.catalog,
      });
      
      if (determinedFocus) {
        // Map the platform ID from platform name
        const platformIdMap: Record<string, string> = {
          "Facebook (Meta)": "meta",
          "Instagram (Meta)": "meta",
          "Google Ads": "google",
          "YouTube (Google)": "google",
          "LinkedIn": "linkedin",
          "TikTok": "tiktok",
        };
        const platformId = platformIdMap[platformName] || "meta";
        return getOptimizationGoalForFocus(determinedFocus, platformId, !!market.pixel);
      }
    }
    
    // Fallback to original mapping
    const mapping: Record<string, string> = {
      "Purchases": "Conversion",
      "Conversions": "Conversion",
      "Leads": "Conversion",
      "Awareness": "Awareness",
      "Market Presence": "Awareness",
      "In-App Actions": "Consideration",
      "Actions": "Consideration",
      "Revenue": "Conversion",
    };
    
    const funnelStage = mapping[genericFocus || ""] || "Consideration";
    const objectives = platformObjectiveMapping[platformName]?.[funnelStage];
    return objectives?.[0] || "Traffic";
  };

  const updateMarketField = (
    platformId: string,
    marketId: string,
    field: string,
    value: any
  ) => {
    const updatedPlatforms = platforms.map((p) => {
      if (p.id === platformId) {
        return {
          ...p,
          markets: p.markets.map((m) =>
            m.id === marketId ? { ...m, [field]: value } : m
          ),
        };
      }
      return p;
    });
    onPlatformsUpdate(updatedPlatforms);
  };

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

  const toggleCampaign = (key: string) => {
    setExpandedCampaigns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isCustomizationComplete = () => {
    return platforms.every((platform) =>
      platform.markets.every(
        (market) => market.accountName && market.adFormats && market.adFormats.length > 0
      )
    );
  };

// Auto-generate market phases for Auto-Detect when entering customization
useEffect(() => {
  if (genericConfig.strategy !== "auto-detect") return;
  if (!startDate || !endDate) return;

  let changed = false;
  const updated = platforms.map((platform) => {
    const updatedMarkets = platform.markets.map((market) => {
      const hasPhases = Array.isArray(market.phases) && market.phases.length > 0;
      const adFormats = market.adFormats || genericConfig.targeting?.adFormats || [];
      const hasPixel = !!market.pixel;
      const hasCatalog = !!market.catalog;

      if (hasPhases || (!adFormats.length && !hasPixel && !hasCatalog)) {
        return market;
      }

      const detectedFocus = determineStrategyFocus({
        adFormats,
        hasPixel,
        hasCatalog,
      });

      const phases = generateAutoDetectPhases(
        adFormats,
        hasPixel,
        hasCatalog,
        startDate,
        endDate
      );

      if (!phases || phases.length === 0) return market;
      changed = true;

      return {
        ...market,
        strategyFocus: detectedFocus || "conversions",
        phases: phases.map((p) => ({
          ...p,
          id: `phase-${market.id}-${p.id}`,
        })),
      };
    });
    return { ...platform, markets: updatedMarkets };
  });

  if (changed) {
    onPlatformsUpdate(updated);
  }
}, [platforms, genericConfig.strategy, genericConfig.targeting?.adFormats, startDate, endDate, onPlatformsUpdate]);

return (
  <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Step 4: Platform Customization</CardTitle>
            <CardDescription>
              Review and customize campaign structures for each platform
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-1">
            {isCustomizationComplete() ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                Ready
              </>
            ) : (
              "Customize campaigns"
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue={platforms[0]?.id} className="w-full">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${platforms.length}, 1fr)` }}>
            {platforms.map((platform) => (
              <TabsTrigger key={platform.id} value={platform.id}>
                {platform.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {platforms.map((platform) => (
            <TabsContent key={platform.id} value={platform.id} className="space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                <p><strong>Strategy:</strong> {genericConfig.strategy === 'manual' ? 'Manual Strategy' : genericConfig.strategyFocus ? getStrategyLabel(genericConfig.strategy, genericConfig.strategyFocus) : 'Custom Strategy'}</p>
              </div>

              <Accordion type="single" collapsible className="w-full">
                {platform.markets.map((market) => (
                  <AccordionItem key={market.id} value={market.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{market.name}</span>
                          {market.strategyFocus && (
                            <Badge variant="outline" className="text-xs">
                              {market.strategyFocus}
                            </Badge>
                          )}
                        </div>
                        <Badge variant="secondary">
                          {market.budgetPercentage}% of platform budget
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-4">
                        {/* Platform-specific fields */}
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Ad Account Name</Label>
                            <Input
                              value={market.accountName || ""}
                              onChange={(e) =>
                                updateMarketField(
                                  platform.id,
                                  market.id,
                                  "accountName",
                                  e.target.value
                                )
                              }
                              placeholder="Select or enter account name"
                            />
                          </div>

                          {platform.name.includes("Meta") && (
                            <>
                              <div className="space-y-2">
                                <Label>Pixel</Label>
                                <Input
                                  value={market.pixel || ""}
                                  onChange={(e) =>
                                    updateMarketField(
                                      platform.id,
                                      market.id,
                                      "pixel",
                                      e.target.value
                                    )
                                  }
                                  placeholder="Select Meta Pixel"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Catalog</Label>
                                <Input
                                  value={market.catalog || ""}
                                  onChange={(e) =>
                                    updateMarketField(
                                      platform.id,
                                      market.id,
                                      "catalog",
                                      e.target.value
                                    )
                                  }
                                  placeholder="Select Product Catalog"
                                />
                              </div>
                            </>
                          )}
                        </div>

                        {/* Campaign Settings for Meta */}
                        {platform.name.includes("Meta") && (
                          <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
                            <h4 className="font-medium text-sm">Campaign Settings</h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="flex items-center justify-between">
                                <Label htmlFor={`cbo-${market.id}`}>Campaign Budget Optimization (CBO)</Label>
                                <Switch
                                  id={`cbo-${market.id}`}
                                  checked={market.isCBOEnabled || false}
                                  onCheckedChange={(checked) =>
                                    updateMarketField(platform.id, market.id, "isCBOEnabled", checked)
                                  }
                                />
                              </div>
                              <div className="flex items-center justify-between">
                                <Label htmlFor={`lifetime-${market.id}`}>Lifetime Budget</Label>
                                <Switch
                                  id={`lifetime-${market.id}`}
                                  checked={market.isLifetimeBudget || false}
                                  onCheckedChange={(checked) =>
                                    updateMarketField(platform.id, market.id, "isLifetimeBudget", checked)
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Campaign Structure - Now Editable per Campaign */}
                        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                          <h4 className="font-medium text-sm">Campaigns (Strategy Phases)</h4>
                          <p className="text-xs text-muted-foreground">
                            Each phase represents a campaign that inherits targeting settings but can be customized with different publisher platforms and placements.
                          </p>
                          
                          {market.phases && market.phases.length > 0 ? (
                            <div className="space-y-3">
                              {market.phases.map((phase, idx) => {
                                const campaignKey = `${platform.id}-${market.id}-${phase.id}`;
                                const isExpanded = expandedCampaigns[campaignKey];
                                
                                return (
                                  <Collapsible
                                    key={phase.id}
                                    open={isExpanded}
                                    onOpenChange={() => toggleCampaign(campaignKey)}
                                  >
                                    <div className="border rounded-lg bg-background">
                                      <CollapsibleTrigger className="w-full p-3 hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            {isExpanded ? (
                                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                            )}
                                            <span className="font-medium text-sm">{phase.name}</span>
                                            <Badge variant="outline" className="text-xs">
                                              {phase.budgetPercentage}%
                                            </Badge>
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {phase.startDate} → {phase.endDate}
                                          </div>
                                        </div>
                                      </CollapsibleTrigger>
                                      
                                       <CollapsibleContent>
                                        <div className="p-4 space-y-4 border-t">
                                          {/* Objective & Optimization Goal Selection */}
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
                                                  {isAutoDetected && (
                                                    <p className="text-xs text-blue-600 dark:text-blue-400">
                                                      ✓ Auto-detected from phase name "{phase.name}"
                                                    </p>
                                                  )}
                                                  <div className="grid gap-3 md:grid-cols-2">
                                                    <div className="space-y-1">
                                                      <Label htmlFor={`objective-${phase.id}`} className="text-xs">
                                                        Objective {isAutoDetected && <span className="text-blue-600">(Auto-detected)</span>}
                                                      </Label>
                                                      <Select
                                                        value={currentObjective}
                                                        onValueChange={(value) => {
                                                          if (value === "AUTO_DETECT") {
                                                            // Clear both to trigger auto-detection
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
                                                        <SelectContent>
                                                          <SelectItem value="AUTO_DETECT" className="text-blue-600 font-medium">
                                                            🔄 Auto-detect from phase
                                                          </SelectItem>
                                                          {platform.name.includes("Meta") && (
                                                            <>
                                                              <SelectItem value="OUTCOME_AWARENESS">Awareness</SelectItem>
                                                              <SelectItem value="OUTCOME_TRAFFIC">Traffic</SelectItem>
                                                              <SelectItem value="OUTCOME_ENGAGEMENT">Engagement</SelectItem>
                                                              <SelectItem value="OUTCOME_LEADS">Lead Generation</SelectItem>
                                                              <SelectItem value="OUTCOME_APP_PROMOTION">App Promotion</SelectItem>
                                                              <SelectItem value="OUTCOME_SALES">Sales</SelectItem>
                                                            </>
                                                          )}
                                                          {!platform.name.includes("Meta") && (
                                                            <>
                                                              <SelectItem value="Awareness">Awareness</SelectItem>
                                                              <SelectItem value="Consideration">Consideration</SelectItem>
                                                              <SelectItem value="Conversion">Conversion</SelectItem>
                                                            </>
                                                          )}
                                                        </SelectContent>
                                                      </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                      <Label htmlFor={`opt-goal-${phase.id}`} className="text-xs">
                                                        Optimization Goal {isAutoDetected && <span className="text-blue-600">(Auto-detected)</span>}
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
                                                          <SelectValue placeholder="Select optimization goal" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                          <SelectItem value="AUTO_DETECT" className="text-blue-600 font-medium">
                                                            🔄 Auto-detect from phase
                                                          </SelectItem>
                                                          <SelectItem value="LINK_CLICKS">Link Clicks</SelectItem>
                                                          <SelectItem value="LANDING_PAGE_VIEWS">Landing Page Views</SelectItem>
                                                          <SelectItem value="LEADS">Leads</SelectItem>
                                                          <SelectItem value="OFFSITE_CONVERSIONS">Conversions</SelectItem>
                                                          <SelectItem value="APP_INSTALLS">App Installs</SelectItem>
                                                          <SelectItem value="APP_EVENTS">App Events</SelectItem>
                                                          <SelectItem value="POST_ENGAGEMENT">Post Engagement</SelectItem>
                                                          <SelectItem value="THRUPLAY">ThruPlay</SelectItem>
                                                          <SelectItem value="REACH">Reach</SelectItem>
                                                          <SelectItem value="IMPRESSIONS">Impressions</SelectItem>
                                                          <SelectItem value="CONVERSATIONS">Conversations</SelectItem>
                                                          <SelectItem value="VALUE">Conversion Value (ROAS)</SelectItem>
                                                        </SelectContent>
                                                      </Select>
                                                    </div>
                                                  </div>
                                                  <p className="text-xs text-muted-foreground">
                                                    Auto-detection analyzes the phase name to recommend the best objective and optimization goal. You can override these manually.
                                                  </p>
                                                </>
                                              );
                                            })()}
                                          </div>

                                          {/* Campaign Details */}
                                          <div className="text-xs text-muted-foreground space-y-1">
                                            <p><strong>Inherits from targeting:</strong></p>
                                            <ul className="list-disc list-inside pl-2">
                                              <li>Age: {genericConfig.targeting?.ageMin || phase.ageMin || 18} - {genericConfig.targeting?.ageMax || phase.ageMax || 65}</li>
                                              <li>Gender: {phase.gender || market.gender || 'All'}</li>
                                              <li>Countries: {(phase.countries || market.countries || []).join(', ') || 'Not set'}</li>
                                            </ul>
                                          </div>

                                          {/* Publisher Platforms & Positions Configuration */}
                                          <div className="border-t pt-4">
                                            <CampaignPublisherConfig
                                              platformName={platform.name}
                                              publisherPlatforms={
                                                phase.publisherPlatforms || 
                                                market.publisherPlatforms || 
                                                ["facebook"]
                                              }
                                              positions={
                                                phase.positions || 
                                                market.positions || 
                                                {}
                                              }
                                              onPublisherPlatformsChange={(platforms) => {
                                                updateCampaignField(
                                                  platform.id,
                                                  market.id,
                                                  phase.id,
                                                  "publisherPlatforms",
                                                  platforms
                                                );
                                              }}
                                              onPositionsChange={(positions) => {
                                                updateCampaignField(
                                                  platform.id,
                                                  market.id,
                                                  phase.id,
                                                  "positions",
                                                  positions
                                                );
                                              }}
                                            />
                                          </div>

                                          {/* Override Targeting (Optional) */}
                                          <div className="border-t pt-4">
                                            <div className="flex items-center justify-between mb-3">
                                              <Label className="text-xs font-medium">Override Targeting (Optional)</Label>
                                            </div>
                                            <div className="grid gap-3 md:grid-cols-2">
                                              <div className="space-y-1">
                                                <Label htmlFor={`age-min-${phase.id}`} className="text-xs">Min Age</Label>
                                                <Input
                                                  id={`age-min-${phase.id}`}
                                                  type="number"
                                                  min="13"
                                                  max="65"
                                                  placeholder={`${genericConfig.targeting?.ageMin || 18}`}
                                                  value={phase.ageMin || ''}
                                                  onChange={(e) =>
                                                    updateCampaignField(
                                                      platform.id,
                                                      market.id,
                                                      phase.id,
                                                      "ageMin",
                                                      e.target.value ? parseInt(e.target.value) : undefined
                                                    )
                                                  }
                                                  className="h-8 text-xs"
                                                />
                                              </div>
                                              <div className="space-y-1">
                                                <Label htmlFor={`age-max-${phase.id}`} className="text-xs">Max Age</Label>
                                                <Input
                                                  id={`age-max-${phase.id}`}
                                                  type="number"
                                                  min="13"
                                                  max="65"
                                                  placeholder={`${genericConfig.targeting?.ageMax || 65}`}
                                                  value={phase.ageMax || ''}
                                                  onChange={(e) =>
                                                    updateCampaignField(
                                                      platform.id,
                                                      market.id,
                                                      phase.id,
                                                      "ageMax",
                                                      e.target.value ? parseInt(e.target.value) : undefined
                                                    )
                                                  }
                                                  className="h-8 text-xs"
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </CollapsibleContent>
                                    </div>
                                  </Collapsible>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              <p>No campaigns generated yet. Complete the strategy configuration to generate campaigns.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </TabsContent>
          ))}
        </Tabs>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onNext} disabled={!isCustomizationComplete()}>
            Next: Forecast & Metrics
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
