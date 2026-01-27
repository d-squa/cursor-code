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
import { CheckCircle2, Edit, ChevronDown, ChevronUp, Copy, Trash2 } from "lucide-react";
import { determineStrategyFocus, getOptimizationGoalForFocus } from "@/utils/strategyFocusMapping";
import { generateAutoDetectPhases } from "@/utils/funnelPhases";
import { CampaignPublisherConfig } from "./CampaignPublisherConfig";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getObjectiveFromPhaseName, getStrategyLabel } from "@/utils/phaseObjectiveMapping";
import { useToast } from "@/components/ui/use-toast";
import { 
  getObjectivesForPlatform, 
  getOptimizationGoalsForObjective, 
  getDefaultOptimizationGoal,
  detectPlatformType,
  type ObjectiveMapping 
} from "@/utils/objectiveOptimizationMapping";

interface PlatformCustomizationProps {
  platforms: PlatformWithMarkets[];
  genericConfig: GenericConfig;
  onPlatformsUpdate: (platforms: PlatformWithMarkets[]) => void;
  onNext: () => void;
  onBack: () => void;
  startDate: string;
  endDate: string;
}

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
  const [budgetWarning, setBudgetWarning] = useState<string>("");
  const { toast } = useToast();

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
          endDate,
          platform.id
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
    
    // Fallback: use the new mapping system
    const detectedPlatform = detectPlatformType(platformName);
    if (detectedPlatform) {
      const objectives = getObjectivesForPlatform(detectedPlatform);
      // Map funnel stage to objective
      const funnelStageMap: Record<string, string> = {
        "Purchases": "OUTCOME_SALES",
        "Conversions": "OUTCOME_SALES",
        "Leads": "OUTCOME_LEADS",
        "Awareness": "OUTCOME_AWARENESS",
        "Market Presence": "OUTCOME_AWARENESS",
        "In-App Actions": "OUTCOME_APP_PROMOTION",
        "Actions": "OUTCOME_TRAFFIC",
        "Revenue": "OUTCOME_SALES",
      };
      
      const targetObjective = funnelStageMap[genericFocus || ""] || "OUTCOME_TRAFFIC";
      const found = objectives.find(obj => obj.value === targetObjective);
      return found?.value || objectives[0]?.value || "Traffic";
    }
    
    return "Traffic";
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

  // Batch multiple field updates into a single platforms update.
  // This prevents dependent Selects (objective -> optimization goal) from momentarily receiving
  // mismatched `value` + `items`, which causes visible flicker.
  const updateCampaignFields = (
    platformId: string,
    marketId: string,
    phaseId: string,
    updates: Record<string, any>
  ) => {
    const updatedPlatforms = platforms.map((p) => {
      if (p.id === platformId) {
        return {
          ...p,
          markets: p.markets.map((m) =>
            m.id === marketId
              ? {
                  ...m,
                  phases: (m.phases || []).map((phase) =>
                    phase.id === phaseId ? { ...phase, ...updates } : phase,
                  ),
                }
              : m,
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

  const deleteMarket = (platformId: string, marketId: string) => {
    const platform = platforms.find(p => p.id === platformId);
    if (!platform || platform.markets.length <= 1) {
      toast({
        title: "Cannot delete market",
        description: "Cannot delete the last market in a platform.",
        variant: "destructive",
      });
      return;
    }

    const updatedPlatforms = platforms.map(p => {
      if (p.id === platformId) {
        const remainingMarkets = p.markets.filter(m => m.id !== marketId);
        // Recalculate budget percentages to maintain 100%
        const totalPercentage = remainingMarkets.reduce((sum, m) => sum + m.budgetPercentage, 0);
        const adjustedMarkets = remainingMarkets.map(m => ({
          ...m,
          budgetPercentage: totalPercentage > 0 ? Math.round((m.budgetPercentage / totalPercentage) * 100) : Math.round(100 / remainingMarkets.length)
        }));
        return { ...p, markets: adjustedMarkets };
      }
      return p;
    });
    onPlatformsUpdate(updatedPlatforms);
    toast({
      title: "Market deleted",
      description: "Market budgets have been recalculated to maintain 100%.",
    });
  };

  const duplicateMarket = (platformId: string, marketId: string) => {
    const platform = platforms.find(p => p.id === platformId);
    const market = platform?.markets.find(m => m.id === marketId);
    
    if (!market) return;

    const newMarket = {
      ...market,
      id: `market-${Date.now()}`,
      name: `${market.name} (Copy)`,
      budgetPercentage: 0, // Start with 0% budget
      phases: market.phases?.map(phase => ({
        ...phase,
        id: `phase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }))
    };

    const updatedPlatforms = platforms.map(p => {
      if (p.id === platformId) {
        return {
          ...p,
          markets: [...p.markets, newMarket]
        };
      }
      return p;
    });
    
    // Check if total budget exceeds 100%
    const totalBudget = updatedPlatforms
      .find(p => p.id === platformId)!
      .markets.reduce((sum, m) => sum + m.budgetPercentage, 0);
    
    if (totalBudget > 100) {
      setBudgetWarning(`Warning: Total market budget (${totalBudget}%) exceeds 100% for this platform. Please adjust market budgets.`);
      toast({
        title: "Budget warning",
        description: `Total market budget is ${totalBudget}%. Please adjust to equal 100%.`,
        variant: "destructive",
      });
    }
    
    onPlatformsUpdate(updatedPlatforms);
    toast({
      title: "Market duplicated",
      description: "Please allocate budget for the new market.",
    });
  };

  const updateMarketBudget = (platformId: string, marketId: string, newBudget: number) => {
    const updatedPlatforms = platforms.map(p => {
      if (p.id === platformId) {
        return {
          ...p,
          markets: p.markets.map(m => 
            m.id === marketId ? { ...m, budgetPercentage: newBudget } : m
          )
        };
      }
      return p;
    });

    // Validate total budget
    const platform = updatedPlatforms.find(p => p.id === platformId);
    const totalBudget = platform!.markets.reduce((sum, m) => sum + m.budgetPercentage, 0);
    
    if (totalBudget !== 100) {
      setBudgetWarning(`Warning: Total market budget is ${totalBudget}%. It should equal 100% of platform budget.`);
    } else {
      setBudgetWarning("");
    }
    
    onPlatformsUpdate(updatedPlatforms);
  };

  const isCustomizationComplete = () => {
    return platforms.every((platform) =>
      platform.markets.every((market) => {
        // Basic requirement: ad formats must be selected
        return market.adFormats && market.adFormats.length > 0;
      })
    );
  };

// Auto-regenerate market phases when targeting/config changes in Step 2
useEffect(() => {
  if (genericConfig.strategy !== "auto-detect") return;
  if (!startDate || !endDate) return;

  let changed = false;
  const updated = platforms.map((platform) => {
    const updatedMarkets = platform.markets.map((market) => {
      // Always use the latest ad formats from genericConfig if market doesn't override
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

      const newPhases = generateAutoDetectPhases(
        adFormats,
        hasPixel,
        hasCatalog,
        startDate,
        endDate,
        platform.id
      );

      if (!newPhases || newPhases.length === 0) return market;

      // Check if phases need regeneration by comparing structure
      const currentPhaseNames = (market.phases || []).map(p => p.name).sort().join(',');
      const newPhaseNames = newPhases.map(p => p.name).sort().join(',');
      
      // Only regenerate if phase structure changed (different phase names)
      if (currentPhaseNames !== newPhaseNames) {
        changed = true;
        return {
          ...market,
          strategyFocus: detectedFocus || "conversions",
          phases: newPhases.map((p) => ({
            ...p,
            id: `phase-${market.id}-${p.id}`,
          })),
        };
      }

      // Update strategy focus even if phases didn't change
      if (market.strategyFocus !== (detectedFocus || "conversions")) {
        changed = true;
        return {
          ...market,
          strategyFocus: detectedFocus || "conversions",
        };
      }

      return market;
    });
    return { ...platform, markets: updatedMarkets };
  });

  if (changed) {
    onPlatformsUpdate(updated);
  }
}, [platforms, genericConfig.strategy, genericConfig.targeting?.adFormats, genericConfig.strategyFocus, startDate, endDate, onPlatformsUpdate]);

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

              {budgetWarning && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-600 dark:text-yellow-400">
                  {budgetWarning}
                </div>
              )}

              <Accordion type="single" collapsible className="w-full">
                {platform.markets.map((market, marketIdx) => {
                  const totalMarketBudget = platform.markets.reduce((sum, m) => sum + m.budgetPercentage, 0);
                  const isBudgetValid = totalMarketBudget === 100;
                  
                  return (
                  <AccordionItem key={market.id} value={market.id}>
                    <AccordionTrigger className="hover:no-underline group">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{market.name}</span>
                          {market.strategyFocus && (
                            <Badge variant="outline" className="text-xs">
                              {market.strategyFocus}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={market.budgetPercentage}
                              onChange={(e) => {
                                e.stopPropagation();
                                updateMarketBudget(platform.id, market.id, Number(e.target.value));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-16 h-7 text-xs"
                              min="0"
                              max="100"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateMarket(platform.id, market.id);
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          {platform.markets.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteMarket(platform.id, market.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-4">
                        {/* Platform-specific fields removed - now in Platform & Market Selection */}

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
                                                market.strategyFocus || genericConfig.strategyFocus,
                                                platform.name
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
                                                      {(() => {
                                                        const detectedPlatform = detectPlatformType(platform.name);
                                                        const objectives = detectedPlatform ? getObjectivesForPlatform(detectedPlatform) : [];
                                                        
                                                        return (
                                                          <Select
                                                            value={currentObjective}
                                                            onValueChange={(value) => {
                                                              if (value === "AUTO_DETECT") {
                                                                 updateCampaignFields(platform.id, market.id, phase.id, {
                                                                   objective: undefined,
                                                                   optimizationGoal: undefined,
                                                                 });
                                                              } else {
                                                                 // Auto-set optimization goal in the SAME update so the Optimization Goal Select
                                                                 // never renders with a value that isn't in its item list.
                                                                 const defaultGoal = detectedPlatform
                                                                   ? getDefaultOptimizationGoal(detectedPlatform, value)
                                                                   : null;
                                                                 updateCampaignFields(platform.id, market.id, phase.id, {
                                                                   objective: value,
                                                                   optimizationGoal: defaultGoal ?? undefined,
                                                                 });
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
                                                              {objectives.map((obj) => (
                                                                <SelectItem key={obj.value} value={obj.value}>
                                                                  {obj.label}
                                                                </SelectItem>
                                                              ))}
                                                            </SelectContent>
                                                          </Select>
                                                        );
                                                      })()}
                                                    </div>
                                                    <div className="space-y-1">
                                                      <Label htmlFor={`opt-goal-${phase.id}`} className="text-xs">
                                                        Optimization Goal {isAutoDetected && <span className="text-blue-600">(Auto-detected)</span>}
                                                      </Label>
                                                      {(() => {
                                                        const detectedPlatform = detectPlatformType(platform.name);
                                                        const optimizationGoals = detectedPlatform && currentObjective && currentObjective !== "AUTO_DETECT" 
                                                          ? getOptimizationGoalsForObjective(detectedPlatform, currentObjective) 
                                                          : [];
                                                        const isDisabled = !currentObjective || currentObjective === "AUTO_DETECT";
                                                        
                                                        return (
                                                          <Select
                                                            value={currentOptGoal}
                                                            onValueChange={(value) => {
                                                              if (value === "AUTO_DETECT") {
                                                                updateCampaignField(platform.id, market.id, phase.id, "optimizationGoal", undefined);
                                                              } else {
                                                                updateCampaignField(platform.id, market.id, phase.id, "optimizationGoal", value);
                                                              }
                                                            }}
                                                            disabled={isDisabled}
                                                          >
                                                            <SelectTrigger id={`opt-goal-${phase.id}`} className={isDisabled ? 'opacity-50' : ''}>
                                                              <SelectValue placeholder={isDisabled ? "Select objective first" : "Select optimization goal"} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                              <SelectItem value="AUTO_DETECT" className="text-blue-600 font-medium">
                                                                🔄 Auto-detect from phase
                                                              </SelectItem>
                                                              {optimizationGoals.map((goal) => (
                                                                <SelectItem key={goal.value} value={goal.value}>
                                                                  {goal.label}
                                                                </SelectItem>
                                                              ))}
                                                            </SelectContent>
                                                          </Select>
                                                        );
                                                      })()}
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
                                              advantagePlusPlacements={
                                                phase.advantagePlusPlacements ?? 
                                                market.advantagePlusPlacements
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
                                              onAdvantagePlusPlacementsChange={(enabled) => {
                                                updateCampaignField(
                                                  platform.id,
                                                  market.id,
                                                  phase.id,
                                                  "advantagePlusPlacements",
                                                  enabled
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
                  );
                })}
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
