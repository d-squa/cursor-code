import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PhaseScheduler } from "./PhaseScheduler";
import { Phase, Campaign } from "./PlatformConfiguration";
import { TargetingConfig, TargetingConfigComponent } from "./TargetingConfig";
import { determineStrategyFocus } from "@/utils/strategyFocusMapping";
import { useEffect } from "react";

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
    setConfig(updatedConfig);
    
    // Auto-generate campaigns when strategy changes
    if (field === "strategy" || field === "strategyFocus") {
      const strategy = field === "strategy" ? value : config.strategy;
      const focus = field === "strategyFocus" ? value : config.strategyFocus;
      
      if (strategy === "full-funnel") {
        updatedConfig.campaigns = [
          { id: "awareness", name: "Awareness Campaign", funnelStage: "awareness" },
          { id: "consideration", name: "Consideration Campaign", funnelStage: "consideration" },
          { id: "conversion", name: "Conversion Campaign", funnelStage: "conversion" },
          { id: "loyalty", name: "Loyalty Campaign", funnelStage: "loyalty" },
        ];
        // Auto-enable phasing for full-funnel
        updatedConfig.hasPhases = true;
        if ((!updatedConfig.phases || updatedConfig.phases.length === 0) && startDate && endDate) {
          updatedConfig.phases = [{
            id: `phase-${Date.now()}`,
            name: "Phase 1",
            startDate: startDate,
            endDate: endDate,
            budgetPercentage: 100,
          }];
        }
      } else if (strategy === "manual") {
        // Manual strategy: user creates custom phases/campaigns
        updatedConfig.campaigns = [];
        updatedConfig.hasPhases = true;
        if ((!updatedConfig.phases || updatedConfig.phases.length === 0) && startDate && endDate) {
          updatedConfig.phases = [{
            id: `phase-${Date.now()}`,
            name: "Campaign 1",
            startDate: startDate,
            endDate: endDate,
            budgetPercentage: 100,
          }];
        }
      } else if (strategy === "auto-detect") {
        // Auto-detect: set strategyFocus to "auto"
        updatedConfig.strategyFocus = "auto";
        updatedConfig.campaigns = [];
        updatedConfig.hasPhases = false;
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
                Auto-detect strategy will automatically configure campaigns based on your selections.
              </p>
            )}

            {(startDate && endDate && (config.strategy === "full-funnel" || config.strategy === "manual")) ? (
              <PhaseScheduler
                phases={config.phases || []}
                onPhasesChange={(phases) => updateConfig("phases", phases)}
                startDate={startDate}
                endDate={endDate}
                platformId="meta"
              />
            ) : config.strategy === "auto-detect" ? (
              <p className="text-sm text-muted-foreground">
                Auto-detect strategy does not require phase scheduling.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {startDate && endDate
                  ? "Phase scheduling is available for full-funnel and manual strategies."
                  : "Set activation start and end dates to schedule phases."}
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
            {(config.strategy === "full-funnel" || config.strategy === "manual") && startDate && endDate ? (
              <PhaseScheduler
                phases={config.phases || []}
                onPhasesChange={(phases) => updateConfig("phases", phases)}
                startDate={startDate}
                endDate={endDate}
              />
            ) : config.strategy === "auto-detect" ? (
              <p className="text-sm text-muted-foreground">Auto-detect strategy does not require phase scheduling.</p>
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
