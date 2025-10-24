import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PhaseScheduler } from "./PhaseScheduler";
import { Phase, Campaign } from "./PlatformConfiguration";

export interface GenericConfig {
  strategy?: "full-funnel" | "partial";
  strategyFocus?: "purchase" | "leads" | "app-installs" | "conversions" | "brand-awareness";
  hasPhases?: boolean;
  phases?: Phase[];
  campaigns?: Campaign[];
  targeting?: {
    locations: string[];
    ageMin?: number;
    ageMax?: number;
    genders?: string[];
    placements?: string[];
  };
}

interface GenericStrategyConfigProps {
  config: GenericConfig;
  setConfig: (config: GenericConfig) => void;
  startDate: string;
  endDate: string;
  showOnlyTargeting?: boolean;
  onNext?: () => void;
  onBack?: () => void;
  isTargetingComplete?: boolean;
}

export function GenericStrategyConfig({ 
  config, 
  setConfig, 
  startDate, 
  endDate,
  showOnlyTargeting = false,
  onNext,
  onBack,
  isTargetingComplete = false
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
      {!showOnlyTargeting && (
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
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{showOnlyTargeting ? "Step 3: Targeting & Campaign Setup" : "Targeting"}</CardTitle>
              <CardDescription>Define your target audience</CardDescription>
            </div>
            {!showOnlyTargeting && onBack && (
              <Button variant="ghost" size="sm" onClick={onBack}>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Strategy Type</Label>
              <Select
                value={config.strategy || ""}
                onValueChange={(value) => updateConfig("strategy", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full-funnel">Full-Funnel</SelectItem>
                  <SelectItem value="partial">Partial Strategy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Strategy Focus</Label>
              <Select
                value={config.strategyFocus || ""}
                onValueChange={(value) => updateConfig("strategyFocus", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select focus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="app-installs">App Installs</SelectItem>
                  <SelectItem value="conversions">Conversions</SelectItem>
                  <SelectItem value="brand-awareness">Brand Awareness</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Targeting</CardTitle>
          <CardDescription>Define your target audience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Target Locations</Label>
            <Input
              value={config.targeting?.locations?.join(", ") || ""}
              onChange={(e) => updateTargeting("locations", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
              placeholder="e.g., United States, Canada, United Kingdom"
            />
          </div>

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

          <div className="space-y-2">
            <Label>Placements</Label>
            <Input
              value={config.targeting?.placements?.join(", ") || ""}
              onChange={(e) => updateTargeting("placements", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
              placeholder="e.g., Feed, Stories, Reels, Search, Display"
            />
          </div>

          {showOnlyTargeting && (
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={onBack}>
                Back
              </Button>
              <Button onClick={onNext} disabled={!isTargetingComplete}>
                Next: Platform Selection
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
