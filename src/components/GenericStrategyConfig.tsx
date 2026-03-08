import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhaseScheduler } from "./PhaseScheduler";
import { Phase, Campaign } from "./PlatformConfiguration";
import { TargetingConfig, TargetingConfigComponent } from "./TargetingConfig";
import { AudienceCard } from "./AudienceCard";
import { determineStrategyFocus } from "@/utils/strategyFocusMapping";
import { getDefaultPhases, funnelTemplates, generatePhasesFromStrategyId } from "@/utils/funnelPhases";
import { getObjectiveFromPhaseName } from "@/utils/phaseObjectiveMapping";
import { getAudienceStrategyConfig } from "@/utils/audienceStrategyMapping";
import { getStrategyGroupsForPlatform, getStrategyById, getVariantLabel, getDurationWarning } from "@/utils/strategyMatrix";
import type { StrategyGroup, StrategyDefinition } from "@/utils/strategyMatrix";
import { useEffect, useState, useMemo } from "react";
import { AlertTriangle, Sparkles, Zap } from "lucide-react";

// Map strategy focus values to funnel template keys (legacy)
const mapFocusToTemplate = (focus?: string): string | undefined => {
  switch (focus) {
    case "purchase": return "Purchases";
    case "leads": return "Leads";
    case "app-installs": return "In-App Actions";
    case "conversions": return "Conversions";
    case "brand-awareness": return "Awareness";
    default: return undefined;
  }
};

// Translate internal objective/goals to UI labels expected by PhaseScheduler
const objectiveToLabel = (obj?: string): string | undefined => {
  switch (obj) {
    case "OUTCOME_AWARENESS": return "Brand Awareness";
    case "OUTCOME_ENGAGEMENT": return "Engagement";
    case "OUTCOME_TRAFFIC": return "Traffic";
    case "OUTCOME_APP_PROMOTION": return "App Installs";
    case "OUTCOME_LEADS": return "Lead Generation";
    case "OUTCOME_SALES": return "Conversions";
    default: return undefined;
  }
};

const optimizationToLabel = (goal?: string): string | undefined => {
  switch (goal) {
    case "REACH": return "Reach";
    case "POST_ENGAGEMENT": return "Post Engagement";
    case "LANDING_PAGE_VIEWS": return "Landing Page Views";
    case "LEADS": return "Leads";
    case "OFFSITE_CONVERSIONS": return "Conversions";
    case "APP_INSTALLS": return "App Installs";
    case "LINK_CLICKS": return "Link Clicks";
    case "THRUPLAY": return "ThruPlay";
    case "VALUE": return "Value";
    default: return undefined;
  }
};

/**
 * Converts raw objective/optimizationGoal from phaseObjectiveMapping to
 * values the PhaseScheduler dropdowns understand.
 * For Meta: translates API values → display labels (legacy behavior).
 * For Google/TikTok/Snapchat: uses raw values directly (they already match dropdown values).
 */
const resolveObjectiveForPlatform = (
  rawObjective: string,
  rawOptGoal: string,
  platformName?: string
): { objective: string; optimizationGoal: string } => {
  const lower = (platformName || "meta").toLowerCase();
  const isMeta = lower.includes("meta") || lower.includes("facebook") || lower.includes("instagram");
  
  if (isMeta) {
    return {
      objective: objectiveToLabel(rawObjective) || "Conversions",
      optimizationGoal: optimizationToLabel(rawOptGoal) || "Conversions",
    };
  }
  
  // For Google Ads, TikTok, Snapchat — use raw values directly (they match dropdown values)
  return {
    objective: rawObjective,
    optimizationGoal: rawOptGoal,
  };
};

export interface GenericConfig {
  strategy?: "auto-detect" | "full-funnel" | "manual";
  strategyFocus?: "purchase" | "leads" | "app-installs" | "conversions" | "brand-awareness" | "auto";
  /** New: selected strategy definition ID from the matrix */
  selectedStrategyId?: string;
  hasPhases?: boolean;
  phases?: Phase[];
  campaigns?: Campaign[];
  targeting?: TargetingConfig;
  adAccountId?: string;
}

interface GenericStrategyConfigProps {
  config: GenericConfig;
  setConfig: (config: GenericConfig) => void;
  startDate: string;
  endDate: string;
  showOnlyTargeting?: boolean;
  showOnlyPhaseScheduler?: boolean;
  onNext?: () => void;
  onBack?: () => void;
  isTargetingComplete?: boolean;
  isPhaseSchedulerComplete?: boolean;
  platformName?: string;
  hasPixel?: boolean;
  hasCatalog?: boolean;
}

export function GenericStrategyConfig({ 
  config, 
  setConfig, 
  startDate, 
  endDate,
  showOnlyTargeting = false,
  showOnlyPhaseScheduler = false,
  onNext,
  onBack,
  isTargetingComplete = false,
  isPhaseSchedulerComplete = false,
  platformName,
  hasPixel = false,
  hasCatalog = false,
}: GenericStrategyConfigProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Determine platform for strategy groups
  const platformId = useMemo(() => {
    const p = (platformName || "meta").toLowerCase();
    if (p.includes("tiktok")) return "tiktok";
    if (p.includes("google")) return "google";
    return "meta";
  }, [platformName]);

  const strategyGroups = useMemo(() => getStrategyGroupsForPlatform(platformId), [platformId]);

  // Derive selected group and variant from selectedStrategyId
  const selectedStrategy = useMemo(() => {
    if (!config.selectedStrategyId) return undefined;
    return getStrategyById(config.selectedStrategyId);
  }, [config.selectedStrategyId]);

  const selectedGroup = useMemo(() => {
    if (!selectedStrategy) return undefined;
    return strategyGroups.find(g => g.variants.some(v => v.id === selectedStrategy.id));
  }, [selectedStrategy, strategyGroups]);
  
  useEffect(() => {
    if (!isInitialized && !config.strategy) {
      updateConfig("strategy", "manual");
      setIsInitialized(true);
    } else if (!isInitialized && config.strategy) {
      setIsInitialized(true);
    }
  }, [config.strategy, isInitialized]);
  
  // Auto-determine strategy focus for auto-detect mode
  useEffect(() => {
    if (config.strategy === "auto-detect") {
      const adFormats = config.targeting?.adFormats || [];
      if (adFormats.length > 0 || hasPixel || hasCatalog) {
        const determinedFocus = determineStrategyFocus({ adFormats, hasPixel, hasCatalog });
        const focusValue = determinedFocus || "auto";
        if (focusValue !== config.strategyFocus) {
          updateConfig("strategyFocus", focusValue);
        }
      } else {
        if (config.strategyFocus !== "auto") {
          updateConfig("strategyFocus", "auto");
        }
      }
    }
  }, [config.strategy, config.targeting?.adFormats, hasPixel, hasCatalog]);

  const updateConfig = (field: keyof GenericConfig, value: any) => {
    const updatedConfig = { ...config, [field]: value };
    
    if (field === "strategy" || field === "strategyFocus") {
      const strategy = field === "strategy" ? value : config.strategy;
      const focus = field === "strategyFocus" ? value : config.strategyFocus;
      
      if (field === "strategy" && value === "full-funnel") {
        updatedConfig.strategyFocus = "auto";
        updatedConfig.selectedStrategyId = undefined;
      }
      
      // Full-funnel with legacy focus (kept for backward compat)
      if (strategy === "full-funnel" && focus && focus !== "auto" && !updatedConfig.selectedStrategyId) {
        const templateKey = mapFocusToTemplate(focus as string);
        if (templateKey && startDate && endDate) {
          const platformForMapping = (platformName || "meta").toLowerCase().includes("google") ? "google" 
            : (platformName || "meta").toLowerCase().includes("tiktok") ? "tiktok"
            : (platformName || "meta").toLowerCase().includes("snapchat") ? "snapchat" : "meta";
          const defaultPhases = getDefaultPhases(templateKey, startDate, endDate, platformForMapping);
          updatedConfig.phases = defaultPhases.map(phase => {
            const objectiveData = getObjectiveFromPhaseName(phase.name, focus, platformForMapping);
            const { objective, optimizationGoal } = resolveObjectiveForPlatform(
              objectiveData.objective, objectiveData.optimizationGoal, platformName
            );
            const audienceStrategy = getAudienceStrategyConfig(platformName || "meta", objective, optimizationGoal);
            return {
              ...phase,
              objective,
              optimizationGoal,
              useBroadTargeting: audienceStrategy.useBroadTargeting,
              overrideTargeting: audienceStrategy.useBroadTargeting ? false : undefined,
            };
          });
          updatedConfig.campaigns = [];
          updatedConfig.hasPhases = true;
        }
      } else if (strategy === "manual") {
        updatedConfig.campaigns = [];
        updatedConfig.hasPhases = true;
        updatedConfig.phases = [];
        updatedConfig.selectedStrategyId = undefined;
      } else if (strategy === "auto-detect") {
        if (focus && startDate && endDate) {
          const templateKey = mapFocusToTemplate(focus === "auto" ? "conversions" : focus as string);
          if (templateKey) {
            const platformForMapping2 = (platformName || "meta").toLowerCase().includes("google") ? "google" 
              : (platformName || "meta").toLowerCase().includes("tiktok") ? "tiktok"
              : (platformName || "meta").toLowerCase().includes("snapchat") ? "snapchat" : "meta";
            const defaultPhases = getDefaultPhases(templateKey, startDate, endDate, platformForMapping2);
            updatedConfig.phases = defaultPhases.map(phase => {
              const objectiveData = getObjectiveFromPhaseName(phase.name, focus === "auto" ? "conversions" : focus, platformForMapping2);
              const { objective, optimizationGoal } = resolveObjectiveForPlatform(
                objectiveData.objective, objectiveData.optimizationGoal, platformName
              );
              const audienceStrategy = getAudienceStrategyConfig(platformName || "meta", objective, optimizationGoal);
              return {
                ...phase,
                objective,
                optimizationGoal,
                useBroadTargeting: audienceStrategy.useBroadTargeting,
                overrideTargeting: audienceStrategy.useBroadTargeting ? false : undefined,
              };
            });
          } else {
            updatedConfig.phases = [];
          }
        } else {
          updatedConfig.phases = [];
        }
        updatedConfig.campaigns = [];
        updatedConfig.hasPhases = true;
        updatedConfig.selectedStrategyId = undefined;
      }
    }
    
    setConfig(updatedConfig);
  };

  /**
   * Handle selecting a strategy group (sets first variant by default)
   */
  const handleSelectStrategyGroup = (groupId: string) => {
    const group = strategyGroups.find(g => g.id === groupId);
    if (!group || !startDate || !endDate) return;
    
    // Default to base variant
    const defaultVariant = group.variants[0];
    applyStrategy(defaultVariant);
  };

  /**
   * Handle toggling between Base/Advantage+/Smart variants
   */
  const handleSelectVariant = (strategyId: string) => {
    const strategy = getStrategyById(strategyId);
    if (!strategy || !startDate || !endDate) return;
    applyStrategy(strategy);
  };

  /**
   * Apply a strategy definition: generate phases and update config
   */
  const applyStrategy = (strategy: StrategyDefinition) => {
    if (!startDate || !endDate) return;
    
    const generatedPhases = generatePhasesFromStrategyId(strategy.id, startDate, endDate);
    
    const lower = (platformName || "meta").toLowerCase();
    const isMeta = lower.includes("meta") || lower.includes("facebook") || lower.includes("instagram");
    const platformForMapping = lower.includes("google") ? "google" 
      : lower.includes("tiktok") ? "tiktok"
      : lower.includes("snapchat") ? "snapchat" : "meta";
    
    // Map to Phase format expected by the system
    const phases = generatedPhases.map(p => {
      if (isMeta) {
        // For Meta, translate API values to display labels (legacy behavior)
        return {
          ...p,
          objective: objectiveToLabel(p.objective) || p.objective,
          optimizationGoal: optimizationToLabel(p.optimizationGoal) || p.optimizationGoal,
        };
      }
      // For non-Meta platforms, re-derive from phase name since strategy matrix stores Meta-style values
      const objectiveData = getObjectiveFromPhaseName(p.name, config.strategyFocus || "conversions", platformForMapping);
      return {
        ...p,
        objective: objectiveData.objective,
        optimizationGoal: objectiveData.optimizationGoal,
      };
    });

    setConfig({
      ...config,
      strategy: "full-funnel",
      selectedStrategyId: strategy.id,
      hasPhases: true,
      phases,
      campaigns: [],
    });
  };

  const updateTargeting = (field: string, value: any) => {
    setConfig({
      ...config,
      targeting: { ...config.targeting, [field]: value }
    });
  };

  // Calculate duration warnings for current phases
  const durationWarnings = useMemo(() => {
    if (!selectedStrategy || !config.phases) return [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    return selectedStrategy.phases.map((matrixPhase, idx) => {
      const actualDays = Math.round((matrixPhase.durationPercent / 100) * totalDays);
      return getDurationWarning(matrixPhase, actualDays);
    }).filter(Boolean) as string[];
  }, [selectedStrategy, startDate, endDate, config.phases]);

  return (
    <>
      {showOnlyTargeting ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Step 3: Targeting</CardTitle>
                <CardDescription>Define your target audience</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={onBack}>Back</Button>
              <Button onClick={onNext} disabled={!isTargetingComplete}>Next: Platform Selection</Button>
            </div>
          </CardContent>
        </Card>
      ) : showOnlyPhaseScheduler ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Phase Scheduling</CardTitle>
                <CardDescription>Configure phase timing for your strategy</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {config.strategy === "full-funnel" && selectedStrategy && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {selectedStrategy.name}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {getVariantLabel(selectedStrategy.variant)}
                  </Badge>
                </div>
                {durationWarnings.length > 0 && (
                  <div className="space-y-1">
                    {durationWarnings.map((warning, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-amber-600">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {config.strategy === "manual" && (
              <p className="text-sm text-muted-foreground">
                Manual strategy allows you to create custom campaigns on the timeline.
              </p>
            )}
            
            {config.strategy === "auto-detect" && (
              <p className="text-sm text-muted-foreground">
                Phases are auto-generated based on your targeting configuration.
              </p>
            )}

            {startDate && endDate ? (
              <PhaseScheduler
                phases={config.phases || []}
                onPhasesChange={(phases) => updateConfig("phases", phases)}
                startDate={startDate}
                endDate={endDate}
                platformId="meta"
                platformName={platformName || "Facebook (Meta)"}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Set activation start and end dates to configure phases.
              </p>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={onBack}>Back</Button>
              <Button onClick={onNext} disabled={!isPhaseSchedulerComplete}>Next</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Campaign Strategy</CardTitle>
              <CardDescription>Select your campaign approach</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label>Strategy Type</Label>
                <Select
                  value={config.strategy || "auto-detect"}
                  onValueChange={(value) => updateConfig("strategy", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto-detect">Auto-Generate</SelectItem>
                    <SelectItem value="full-funnel">Full-Funnel Strategy</SelectItem>
                    <SelectItem value="manual">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {config.strategy === "full-funnel" && (
                <div className="space-y-4">
                  {/* Strategy Group Selection */}
                  <Label>Strategy</Label>
                  <Select
                    value={selectedGroup?.id || ""}
                    onValueChange={handleSelectStrategyGroup}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a strategy…" />
                    </SelectTrigger>
                    <SelectContent>
                      {strategyGroups.map(group => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Variant Toggle */}
                  {selectedGroup && selectedGroup.variants.length > 1 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Variant</Label>
                      <div className="flex gap-2">
                        {selectedGroup.variants.map(variant => {
                          const isSelected = config.selectedStrategyId === variant.id;
                          return (
                            <Button
                              key={variant.id}
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              onClick={() => handleSelectVariant(variant.id)}
                              className="flex items-center gap-1.5"
                            >
                              {variant.variant === "base" && <Zap className="h-3 w-3" />}
                              {(variant.variant === "advantage+" || variant.variant === "smart") && <Sparkles className="h-3 w-3" />}
                              {getVariantLabel(variant.variant)}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Phase Summary Cards */}
                  {selectedStrategy && (
                    <div className="space-y-3 mt-4">
                      <Label className="text-xs text-muted-foreground">Funnel Phases</Label>
                      <div className="grid gap-2">
                        {selectedStrategy.phases.map((phase, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border bg-muted/30 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{phase.name}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">
                                  {phase.budgetPercent}% budget
                                </Badge>
                                <Badge variant="secondary" className="text-[10px]">
                                  {phase.durationPercent}% duration
                                </Badge>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                              <span className="bg-background px-1.5 py-0.5 rounded border">
                                {phase.objective === "OUTCOME_SALES" ? "Sales" : 
                                 phase.objective === "OUTCOME_LEADS" ? "Leads" :
                                 phase.objective === "OUTCOME_APP_PROMOTION" ? "App Promotion" :
                                 phase.objective === "OUTCOME_ENGAGEMENT" ? "Engagement" :
                                 phase.objective === "OUTCOME_TRAFFIC" ? "Traffic" :
                                 phase.objective === "OUTCOME_AWARENESS" ? "Awareness" :
                                 phase.objective}
                              </span>
                              <span className="bg-background px-1.5 py-0.5 rounded border">
                                {phase.audienceTypes}
                              </span>
                              <span className="bg-background px-1.5 py-0.5 rounded border">
                                {phase.adFormats}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground/70">
                              {phase.automationFeatures} · {phase.billingType} · {phase.optimizationLocation}
                            </div>
                            {typeof phase.recommendedDurationDays !== "string" && (
                              <div className="text-[10px] text-muted-foreground/50">
                                Recommended: {phase.recommendedDurationDays[0]}-{phase.recommendedDurationDays[1]} days
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Targeting</CardTitle>
              <CardDescription>Define your target audience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h4 className="font-medium">Demographics</h4>
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Age Min</Label>
                    <Input
                      type="number"
                      value={config.targeting?.ageMin || ""}
                      onChange={(e) => updateTargeting("ageMin", parseInt(e.target.value))}
                      placeholder="18"
                      min="13"
                      max="65"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Age Max</Label>
                    <Input
                      type="number"
                      value={config.targeting?.ageMax || ""}
                      onChange={(e) => updateTargeting("ageMax", parseInt(e.target.value))}
                      placeholder="65"
                      min="13"
                      max="65"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Genders</Label>
                    <Input
                      value={config.targeting?.genders?.join(", ") || ""}
                      onChange={(e) => updateTargeting("genders", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                      placeholder="All, Male, Female"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Phase Scheduling</CardTitle>
              <CardDescription>Configure phase timing for your strategy</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {startDate && endDate ? (
                <PhaseScheduler
                  phases={config.phases || []}
                  onPhasesChange={(phases) => updateConfig("phases", phases)}
                  startDate={startDate}
                  endDate={endDate}
                  platformName={platformName || "Facebook (Meta)"}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Set activation start and end dates to schedule phases.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
