import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PhaseScheduler } from "./PhaseScheduler";
import { Phase, Campaign } from "./PlatformConfiguration";
import { TargetingConfig, TargetingConfigComponent } from "./TargetingConfig";
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
  const [strategyFocusOpen, setStrategyFocusOpen] = useState(false);
  
  // Set default strategy to auto-detect if not set
  useEffect(() => {
    if (!config.strategy) {
      updateConfig("strategy", "auto-detect");
    }
  }, []);
  
  // Auto-determine strategy focus based on ad formats and platform config
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
        // Reset focus to placeholder and open the dropdown to prompt selection
        updatedConfig.strategyFocus = "auto";
        setStrategyFocusOpen(true);
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
        if (focus && focus !== "auto" && startDate && endDate) {
          const templateKey = mapFocusToTemplate(focus as string);
          if (templateKey) {
            const defaultPhases = getDefaultPhases(templateKey, startDate, endDate);
            updatedConfig.phases = defaultPhases.map(phase => {
              const objectiveData = getObjectiveFromPhaseName(phase.name, focus);
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
          // No focus determined yet, start with empty phases
          updatedConfig.phases = [];
        }
        updatedConfig.campaigns = [];
        updatedConfig.hasPhases = true;
      }
    }
    
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
            <TargetingConfigComponent
              platformName={platformName || "Facebook (Meta)"}
              targeting={config.targeting || {}}
              onUpdate={(t) => setConfig({ ...config, targeting: t })}
              showAdFormats={false}
            />

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
                    open={strategyFocusOpen}
                    onOpenChange={setStrategyFocusOpen}
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
