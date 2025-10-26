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
import { CheckCircle2, Edit } from "lucide-react";
import { determineStrategyFocus, getOptimizationGoalForFocus } from "@/utils/strategyFocusMapping";
import { generateAutoDetectPhases } from "@/utils/funnelPhases";

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
                <p><strong>Strategy:</strong> {genericConfig.strategy?.replace("-", " ").toUpperCase()}</p>
                <p><strong>Focus:</strong> {genericConfig.strategyFocus}</p>
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
                              {market.strategyFocus.replace("-", " ").toUpperCase()}
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
                                <Label>Page</Label>
                                <Input
                                  value={market.page || ""}
                                  onChange={(e) =>
                                    updateMarketField(
                                      platform.id,
                                      market.id,
                                      "page",
                                      e.target.value
                                    )
                                  }
                                  placeholder="Select Facebook/Instagram Page"
                                />
                              </div>
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

                        {/* Campaign Structure Preview */}
                        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                          <h4 className="font-medium text-sm">Campaign Structure</h4>
                          
                          {market.phases && market.phases.length > 0 ? (
                            <div className="space-y-2">
                              {market.phases.map((phase) => (
                                <div key={phase.id} className="text-xs space-y-1 bg-background p-2 rounded">
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium">{phase.name}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {phase.budgetPercentage}%
                                    </Badge>
                                  </div>
                                  <div className="text-muted-foreground">
                                    {phase.startDate} → {phase.endDate}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              <p>Campaign will be created based on:</p>
                              <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>Objective: {mapGenericToPlatformObjective(platform.name, genericConfig.strategyFocus, market)}</li>
                                <li>Ad Formats: {market.adFormats?.join(", ") || "Not selected"}</li>
                                <li>Targeting: Age {genericConfig.targeting?.ageMin}-{genericConfig.targeting?.ageMax}</li>
                                <li>Placements: {genericConfig.targeting?.placements?.join(", ") || "Automatic"}</li>
                              </ul>
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
