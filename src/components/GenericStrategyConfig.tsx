import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PhaseScheduler } from "./PhaseScheduler";
import { Phase, Campaign } from "./PlatformConfiguration";
import { TargetingConfig } from "./TargetingConfig";

export interface GenericConfig {
  strategy?: "full-funnel" | "partial";
  strategyFocus?: "purchase" | "leads" | "app-installs" | "conversions" | "brand-awareness";
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
  isPhaseSchedulerComplete = false
}: GenericStrategyConfigProps) {
  const updateConfig = (field: keyof GenericConfig, value: any) => {
    const updatedConfig = { ...config, [field]: value };
    
    // Auto-generate campaigns when strategy changes
    if (field === "strategy" || field === "strategyFocus") {
      const strategy = field === "strategy" ? value : config.strategy;
      const focus = field === "strategyFocus" ? value : config.strategyFocus;
      
      if (strategy === "full-funnel" && focus) {
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
      } else if (strategy === "partial" && !updatedConfig.campaigns?.length) {
        updatedConfig.campaigns = [
          { id: `campaign-${Date.now()}`, name: "Campaign 1" },
        ];
        // Keep phasing optional for partial strategy
        if (!config.hasPhases) {
          updatedConfig.hasPhases = false;
        }
      }
    }
    
    setConfig(updatedConfig);
  };

  const updateTargeting = (field: string, value: any) => {
    setConfig({
      ...config,
      targeting: { ...config.targeting, [field]: value }
    });
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
            
            {config.strategy === "partial" && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="phases-step4"
                  checked={config.hasPhases || false}
                  onChange={(e) => {
                    const hasPhases = e.target.checked;
                    updateConfig("hasPhases", hasPhases);
                    if (hasPhases && (!config.phases || config.phases.length === 0)) {
                      updateConfig("phases", [{
                        id: `phase-${Date.now()}`,
                        name: "Phase 1",
                        startDate: startDate,
                        endDate: endDate,
                        budgetPercentage: 100,
                      }]);
                    }
                  }}
                  className="w-4 h-4"
                />
                <Label htmlFor="phases-step4">Enable phasing schedule</Label>
              </div>
            )}

            {(startDate && endDate && (config.hasPhases || config.strategy === "full-funnel")) ? (
              <PhaseScheduler
                phases={config.phases || []}
                onPhasesChange={(phases) => updateConfig("phases", phases)}
                startDate={startDate}
                endDate={endDate}
                platformId="meta"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {startDate && endDate
                  ? (config.strategy === "partial"
                      ? "Enable phasing to schedule multiple phases for your campaign."
                      : "Phase scheduling is required for full-funnel strategies.")
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
              {config.strategy === "partial" && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="phases"
                    checked={config.hasPhases || false}
                    onChange={(e) => {
                      const hasPhases = e.target.checked;
                      updateConfig("hasPhases", hasPhases);
                      if (hasPhases && (!config.phases || config.phases.length === 0)) {
                        updateConfig("phases", [{
                          id: `phase-${Date.now()}`,
                          name: "Phase 1",
                          startDate: startDate,
                          endDate: endDate,
                          budgetPercentage: 100,
                        }]);
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="phases">Enable phasing schedule</Label>
                </div>
              )}

              {config.hasPhases && startDate && endDate ? (
                <PhaseScheduler
                  phases={config.phases || []}
                  onPhasesChange={(phases) => updateConfig("phases", phases)}
                  startDate={startDate}
                  endDate={endDate}
                />
              ) : (
                config.hasPhases ? (
                  <p className="text-sm text-muted-foreground">Set activation start and end dates to schedule phases.</p>
                ) : null
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
