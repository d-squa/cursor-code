import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PhaseScheduler } from "./PhaseScheduler";
import { Phase, Campaign } from "./PlatformConfiguration";
import { TargetingConfig, TargetingConfigComponent } from "./TargetingConfig";
import { TargetingBriefInput } from "./TargetingBriefInput";
import { AudienceCard } from "./AudienceCard";
import { determineStrategyFocus } from "@/utils/strategyFocusMapping";
import { getDefaultPhases, funnelTemplates } from "@/utils/funnelPhases";
import { getObjectiveFromPhaseName } from "@/utils/phaseObjectiveMapping";
import { useEffect, useState } from "react";

// Map strategy focus values to funnel template keys
const mapFocusToTemplate = (focus?: string): string | undefined => {
  switch (focus) {
    case "purchase":
      return "Purchases";
    case "leads":
      return "Leads";
    case "app-installs":
      return "In-App Actions";
    case "conversions":
      return "Conversions";
    case "brand-awareness":
      return "Awareness";
    default:
      return undefined;
  }
};

// Translate internal objective/goals to UI labels expected by PhaseScheduler
const objectiveToLabel = (obj?: string): string | undefined => {
  switch (obj) {
    case "OUTCOME_AWARENESS":
      return "Brand Awareness";
    case "OUTCOME_ENGAGEMENT":
      return "Engagement";
    case "OUTCOME_TRAFFIC":
      return "Traffic";
    case "OUTCOME_APP_PROMOTION":
      return "App Installs";
    case "OUTCOME_LEADS":
      return "Lead Generation";
    case "OUTCOME_SALES":
      return "Conversions";
    default:
      return undefined;
  }
};

const optimizationToLabel = (goal?: string): string | undefined => {
  switch (goal) {
    case "REACH":
      return "Reach";
    case "POST_ENGAGEMENT":
      return "Post Engagement";
    case "LANDING_PAGE_VIEWS":
      return "Landing Page Views";
    case "LEADS":
      return "Leads";
    case "OFFSITE_CONVERSIONS":
      return "Conversions";
    case "APP_INSTALLS":
      return "App Installs";
    case "LINK_CLICKS":
      return "Link Clicks";
    default:
      return undefined;
  }
};

export interface GenericConfig {
  strategy?: "auto-detect" | "full-funnel" | "manual";
  strategyFocus?: "purchase" | "leads" | "app-installs" | "conversions" | "brand-awareness" | "auto";
  hasPhases?: boolean;
  phases?: Phase[];
  campaigns?: Campaign[];
  targeting?: TargetingConfig;
  parsedTargeting?: any[];
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
  // Initialize strategy to auto-detect on mount if not set
  const [isInitialized, setIsInitialized] = useState(false);
  
  useEffect(() => {
    if (!isInitialized && !config.strategy) {
      updateConfig("strategy", "auto-detect");
      setIsInitialized(true);
    } else if (!isInitialized && config.strategy) {
      // Strategy already set, mark as initialized
      setIsInitialized(true);
    }
  }, [config.strategy, isInitialized]);
  
  // Auto-determine strategy focus based on ad formats and platform config
  // ONLY runs in auto-detect mode
  useEffect(() => {
    // Only auto-set if strategy is "auto-detect"
    if (config.strategy === "auto-detect") {
      const adFormats = config.targeting?.adFormats || [];
      
      if (adFormats.length > 0 || hasPixel || hasCatalog) {
        const determinedFocus = determineStrategyFocus({
          adFormats,
          hasPixel,
          hasCatalog,
        });
        
        // For auto-detect, set to "auto" or the determined focus
        const focusValue = determinedFocus || "auto";
        if (focusValue !== config.strategyFocus) {
          updateConfig("strategyFocus", focusValue);
        }
      } else {
        // No selection yet, set to "auto"
        if (config.strategyFocus !== "auto") {
          updateConfig("strategyFocus", "auto");
        }
      }
    }
  }, [config.strategy, config.targeting?.adFormats, hasPixel, hasCatalog]);
  const updateConfig = (field: keyof GenericConfig, value: any) => {
    const updatedConfig = { ...config, [field]: value };
    
    // Auto-generate campaigns when strategy changes
    if (field === "strategy" || field === "strategyFocus") {
      const strategy = field === "strategy" ? value : config.strategy;
      const focus = field === "strategyFocus" ? value : config.strategyFocus;
      
      if (field === "strategy" && value === "full-funnel") {
        // Reset focus to placeholder when switching to full-funnel
        updatedConfig.strategyFocus = "auto";
      }
      
      if (strategy === "full-funnel" && focus) {
        const templateKey = mapFocusToTemplate(focus as string);
        if (templateKey && startDate && endDate) {
          const defaultPhases = getDefaultPhases(templateKey, startDate, endDate);
          updatedConfig.phases = defaultPhases.map(phase => {
            const objectiveData = getObjectiveFromPhaseName(phase.name, focus);
            return {
              ...phase,
              objective: objectiveToLabel(objectiveData.objective) || "Conversions",
              optimizationGoal: optimizationToLabel(objectiveData.optimizationGoal) || "Conversions",
            };
          });
          updatedConfig.campaigns = [
            { id: "awareness", name: "Awareness Campaign", funnelStage: "awareness" },
            { id: "consideration", name: "Consideration Campaign", funnelStage: "consideration" },
            { id: "conversion", name: "Conversion Campaign", funnelStage: "conversion" },
            { id: "loyalty", name: "Loyalty Campaign", funnelStage: "loyalty" },
          ];
          updatedConfig.hasPhases = true;
        }
      } else if (strategy === "manual") {
        // Manual/Custom strategy: user creates phases from scratch - start with empty timeline
        updatedConfig.campaigns = [];
        updatedConfig.hasPhases = true;
        updatedConfig.phases = [];
      } else if (strategy === "auto-detect") {
        // Auto-detect: use the auto-determined focus to generate phases
        if (focus && startDate && endDate) {
          const templateKey = mapFocusToTemplate(focus === "auto" ? "conversions" : focus as string);
          if (templateKey) {
            const defaultPhases = getDefaultPhases(templateKey, startDate, endDate);
            updatedConfig.phases = defaultPhases.map(phase => {
              const objectiveData = getObjectiveFromPhaseName(phase.name, focus === "auto" ? "conversions" : focus);
              return {
                ...phase,
                objective: objectiveToLabel(objectiveData.objective) || "Conversions",
                optimizationGoal: optimizationToLabel(objectiveData.optimizationGoal) || "Conversions",
              };
            });
          } else {
            // Fallback if no template found
            updatedConfig.phases = [];
          }
        } else {
          // No dates set yet, start with empty phases
          updatedConfig.phases = [];
        }
        updatedConfig.campaigns = [];
        updatedConfig.hasPhases = true;
      }
    }
    
    setConfig(updatedConfig);
  };

  const [parsedTargeting, setParsedTargeting] = useState<any[]>(config.parsedTargeting || []);

  const handleTargetingGenerated = (targeting: any[]) => {
    setParsedTargeting(targeting);
    const updated = { ...config, parsedTargeting: targeting };
    setConfig(updated);
  };

  const handleRemoveTargeting = (index: number) => {
    const updated = parsedTargeting.filter((_, i) => i !== index);
    setParsedTargeting(updated);
    const updatedConfig = { ...config, parsedTargeting: updated };
    setConfig(updatedConfig);
  };

  const updateTargeting = (field: string, value: any) => {
    const updated = {
      ...config,
      targeting: { ...config.targeting, [field]: value }
    };
    setConfig(updated);
  };

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
      <TargetingBriefInput
        onTargetingGenerated={handleTargetingGenerated}
      />

            {parsedTargeting.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold">Applied Targeting</h3>
                {parsedTargeting.map((targeting: any, marketIdx: number) => (
                  <div key={marketIdx} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-semibold">{targeting.market}</h4>
                      <div className="flex gap-2 text-sm text-muted-foreground">
                        {targeting.ageMin && targeting.ageMax && (
                          <span>Age: {targeting.ageMin}-{targeting.ageMax}</span>
                        )}
                        {targeting.gender && targeting.gender.length > 0 && (
                          <span>• {targeting.gender.join(", ")}</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {/* Interests */}
                      {targeting.interests?.map((interest: any, idx: number) => (
                        <AudienceCard
                          key={`interest-${idx}`}
                          type="interest"
                          name={interest.name}
                          audienceSize={interest.audienceSize}
                          metadata={{ id: interest.id }}
                          onRemove={() => {
                            const newTargeting = [...parsedTargeting];
                            newTargeting[marketIdx] = {
                              ...newTargeting[marketIdx],
                              interests: newTargeting[marketIdx].interests?.filter((_: any, i: number) => i !== idx),
                            };
                            setParsedTargeting(newTargeting);
                          }}
                        />
                      ))}

                      {/* Behaviors */}
                      {targeting.behaviors?.map((behavior: any, idx: number) => (
                        <AudienceCard
                          key={`behavior-${idx}`}
                          type="behavior"
                          name={behavior.name}
                          audienceSize={behavior.audienceSize}
                          metadata={{ id: behavior.id }}
                          onRemove={() => {
                            const newTargeting = [...parsedTargeting];
                            newTargeting[marketIdx] = {
                              ...newTargeting[marketIdx],
                              behaviors: newTargeting[marketIdx].behaviors?.filter((_: any, i: number) => i !== idx),
                            };
                            setParsedTargeting(newTargeting);
                          }}
                        />
                      ))}

                      {/* Custom Audiences */}
                      {targeting.customAudiences?.map((audience: any, idx: number) => (
                        <AudienceCard
                          key={`custom-${idx}`}
                          type="customAudience"
                          name={audience.name}
                          metadata={{ id: audience.id, type: audience.type }}
                          onRemove={() => {
                            const newTargeting = [...parsedTargeting];
                            newTargeting[marketIdx] = {
                              ...newTargeting[marketIdx],
                              customAudiences: newTargeting[marketIdx].customAudiences?.filter((_: any, i: number) => i !== idx),
                            };
                            setParsedTargeting(newTargeting);
                          }}
                        />
                      ))}

                      {/* Lookalikes */}
                      {targeting.lookalikes?.map((audience: any, idx: number) => (
                        <AudienceCard
                          key={`lookalike-${idx}`}
                          type="lookalike"
                          name={audience.name}
                          metadata={{ id: audience.id, sourceAudienceId: audience.sourceAudienceId }}
                          onRemove={() => {
                            const newTargeting = [...parsedTargeting];
                            newTargeting[marketIdx] = {
                              ...newTargeting[marketIdx],
                              lookalikes: newTargeting[marketIdx].lookalikes?.filter((_: any, i: number) => i !== idx),
                            };
                            setParsedTargeting(newTargeting);
                          }}
                        />
                      ))}

                      {/* Customer Lists */}
                      {targeting.customerLists?.map((list: any, idx: number) => (
                        <AudienceCard
                          key={`customerlist-${idx}`}
                          type="customerList"
                          name={list.name}
                          metadata={{ id: list.id }}
                          onRemove={() => {
                            const newTargeting = [...parsedTargeting];
                            newTargeting[marketIdx] = {
                              ...newTargeting[marketIdx],
                              customerLists: newTargeting[marketIdx].customerLists?.filter((_: any, i: number) => i !== idx),
                            };
                            setParsedTargeting(newTargeting);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={onBack}>
                Back
              </Button>
              <Button onClick={onNext} disabled={!isTargetingComplete}>
                Next: Platform Selection
              </Button>
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
            {config.strategy === "full-funnel" && (
              <p className="text-sm text-muted-foreground">
                Full-funnel strategies require phase scheduling to be enabled.
              </p>
            )}
            
            {config.strategy === "manual" && (
              <p className="text-sm text-muted-foreground">
                Manual strategy allows you to create custom campaigns on the timeline.
              </p>
            )}
            
            {config.strategy === "auto-detect" && (
              <p className="text-sm text-muted-foreground">
                Phases are auto-generated based on your targeting configuration. You can customize each phase below.
              </p>
            )}

            {config.parsedTargeting && config.parsedTargeting.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold">Applied Audiences</h3>
                {config.parsedTargeting.map((targeting: any, marketIdx: number) => (
                  <div key={marketIdx} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-semibold">{targeting.market}</h4>
                      <div className="flex gap-2 text-sm text-muted-foreground">
                        {targeting.ageMin && targeting.ageMax && (
                          <span>Age: {targeting.ageMin}-{targeting.ageMax}</span>
                        )}
                        {targeting.gender && targeting.gender.length > 0 && (
                          <span>• {targeting.gender.join(", ")}</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {targeting.interests?.map((interest: any, idx: number) => (
                        <AudienceCard
                          key={`interest-${idx}`}
                          type="interest"
                          name={interest.name}
                          audienceSize={interest.audienceSize}
                          onRemove={() => {
                            const newTargeting = [...(config.parsedTargeting || [])];
                            newTargeting[marketIdx] = {
                              ...newTargeting[marketIdx],
                              interests: (newTargeting[marketIdx].interests || []).filter((_: any, i: number) => i !== idx),
                            };
                            setConfig({ ...config, parsedTargeting: newTargeting });
                          }}
                        />
                      ))}

                      {targeting.behaviors?.map((behavior: any, idx: number) => (
                        <AudienceCard
                          key={`behavior-${idx}`}
                          type="behavior"
                          name={behavior.name}
                          audienceSize={behavior.audienceSize}
                          onRemove={() => {
                            const newTargeting = [...(config.parsedTargeting || [])];
                            newTargeting[marketIdx] = {
                              ...newTargeting[marketIdx],
                              behaviors: (newTargeting[marketIdx].behaviors || []).filter((_: any, i: number) => i !== idx),
                            };
                            setConfig({ ...config, parsedTargeting: newTargeting });
                          }}
                        />
                      ))}

                      {targeting.customAudiences?.map((aud: any, idx: number) => (
                        <AudienceCard
                          key={`custom-${idx}`}
                          type="customAudience"
                          name={aud.name}
                          metadata={{ id: aud.id, type: aud.type }}
                          onRemove={() => {
                            const newTargeting = [...(config.parsedTargeting || [])];
                            newTargeting[marketIdx] = {
                              ...newTargeting[marketIdx],
                              customAudiences: (newTargeting[marketIdx].customAudiences || []).filter((_: any, i: number) => i !== idx),
                            };
                            setConfig({ ...config, parsedTargeting: newTargeting });
                          }}
                        />
                      ))}

                      {targeting.lookalikes?.map((ll: any, idx: number) => (
                        <AudienceCard
                          key={`lookalike-${idx}`}
                          type="lookalike"
                          name={ll.name}
                          metadata={{ id: ll.id, sourceAudienceId: ll.sourceAudienceId }}
                          onRemove={() => {
                            const newTargeting = [...(config.parsedTargeting || [])];
                            newTargeting[marketIdx] = {
                              ...newTargeting[marketIdx],
                              lookalikes: (newTargeting[marketIdx].lookalikes || []).filter((_: any, i: number) => i !== idx),
                            };
                            setConfig({ ...config, parsedTargeting: newTargeting });
                          }}
                        />
                      ))}

                      {targeting.customerLists?.map((cl: any, idx: number) => (
                        <AudienceCard
                          key={`customer-${idx}`}
                          type="customerList"
                          name={cl.name}
                          metadata={{ id: cl.id }}
                          onRemove={() => {
                            const newTargeting = [...(config.parsedTargeting || [])];
                            newTargeting[marketIdx] = {
                              ...newTargeting[marketIdx],
                              customerLists: (newTargeting[marketIdx].customerLists || []).filter((_: any, i: number) => i !== idx),
                            };
                            setConfig({ ...config, parsedTargeting: newTargeting });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
              <Button variant="outline" onClick={onBack}>
                Back
              </Button>
              <Button onClick={onNext} disabled={!isPhaseSchedulerComplete}>
                Next
              </Button>
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
                    <SelectItem value="full-funnel">Full-Funnel</SelectItem>
                    <SelectItem value="manual">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {config.strategy === "full-funnel" && (
                <div className="space-y-4">
                  <Label>Strategy Focus</Label>
                  <Select
                    value={config.strategyFocus || "auto"}
                    onValueChange={(value) => updateConfig("strategyFocus", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select focus" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto" disabled>
                        Select a focus…
                      </SelectItem>
                      <SelectItem value="purchase">Purchase</SelectItem>
                      <SelectItem value="leads">Leads</SelectItem>
                      <SelectItem value="app-installs">App Installs</SelectItem>
                      <SelectItem value="conversions">Conversions</SelectItem>
                      <SelectItem value="brand-awareness">Brand Awareness</SelectItem>
                    </SelectContent>
                  </Select>
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
