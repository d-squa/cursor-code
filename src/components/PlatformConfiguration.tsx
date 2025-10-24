import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface Phase {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  budgetPercentage: number;
}

export interface PlatformConfig {
  strategy?: "full-funnel" | "partial";
  strategyFocus?: "purchase" | "leads" | "app-installs" | "conversions" | "brand-awareness";
  hasPhases?: boolean;
  phases?: Phase[];
  objective?: string;
  campaignType?: string;
  optimizationGoal?: string;
  targeting?: {
    locations: string[];
    ageMin?: number;
    ageMax?: number;
    genders?: string[];
    placements?: string[];
  };
}

export interface Platform {
  id: string;
  name: string;
  enabled: boolean;
  budgetPercentage: number;
  config?: PlatformConfig;
}

interface PlatformConfigurationProps {
  platforms: Platform[];
  setPlatforms: (platforms: Platform[]) => void;
  startDate: string;
  endDate: string;
}

const platformObjectives: Record<string, string[]> = {
  meta: ["Brand Awareness", "Reach", "Traffic", "Engagement", "App Installs", "Video Views", "Lead Generation", "Conversions"],
  google: ["Search", "Display", "Video", "Shopping", "Performance Max", "App", "Discovery", "Local"],
  linkedin: ["Brand Awareness", "Website Visits", "Engagement", "Video Views", "Lead Generation", "Conversions", "Job Applicants"],
  tiktok: ["Reach", "Traffic", "Video Views", "Community Interaction", "App Installs", "Lead Generation", "Conversions"],
  snapchat: ["Awareness", "Consideration", "Conversions", "Catalog Sales"],
  pinterest: ["Brand Awareness", "Video Views", "Consideration", "Conversions", "Catalog Sales"],
};

const optimizationGoals: Record<string, string[]> = {
  meta: ["Impressions", "Link Clicks", "Landing Page Views", "Conversions", "Value", "Reach", "Thruplay"],
  google: ["Clicks", "Conversions", "Conversion Value", "Impressions", "Views"],
  linkedin: ["Impressions", "Clicks", "Landing Page Actions", "Conversions"],
  tiktok: ["Reach", "Click", "Conversion", "Value"],
  snapchat: ["Impressions", "Swipes", "App Installs", "Pixel Purchases"],
  pinterest: ["Awareness", "Consideration", "Conversions"],
};

export function PlatformConfiguration({ platforms, setPlatforms, startDate, endDate }: PlatformConfigurationProps) {
  const enabledPlatforms = platforms.filter(p => p.enabled);

  const updatePlatformConfig = (platformId: string, field: keyof PlatformConfig, value: any) => {
    setPlatforms(
      platforms.map(p =>
        p.id === platformId
          ? { ...p, config: { ...p.config, [field]: value } }
          : p
      )
    );
  };

  const updateTargeting = (platformId: string, field: string, value: any) => {
    setPlatforms(
      platforms.map(p =>
        p.id === platformId
          ? {
              ...p,
              config: {
                ...p.config,
                targeting: { ...p.config?.targeting, [field]: value }
              }
            }
          : p
      )
    );
  };

  const addPhase = (platformId: string) => {
    setPlatforms(
      platforms.map(p => {
        if (p.id === platformId) {
          const phases = p.config?.phases || [];
          const newPhase: Phase = {
            id: `phase-${Date.now()}`,
            name: `Phase ${phases.length + 1}`,
            startDate: "",
            endDate: "",
            budgetPercentage: 0,
          };
          return {
            ...p,
            config: {
              ...p.config,
              phases: [...phases, newPhase],
            }
          };
        }
        return p;
      })
    );
  };

  const updatePhase = (platformId: string, phaseId: string, field: keyof Phase, value: any) => {
    setPlatforms(
      platforms.map(p => {
        if (p.id === platformId && p.config?.phases) {
          return {
            ...p,
            config: {
              ...p.config,
              phases: p.config.phases.map(phase =>
                phase.id === phaseId ? { ...phase, [field]: value } : phase
              ),
            }
          };
        }
        return p;
      })
    );
  };

  const removePhase = (platformId: string, phaseId: string) => {
    setPlatforms(
      platforms.map(p => {
        if (p.id === platformId && p.config?.phases) {
          return {
            ...p,
            config: {
              ...p.config,
              phases: p.config.phases.filter(phase => phase.id !== phaseId),
            }
          };
        }
        return p;
      })
    );
  };

  const isConfigComplete = (platform: Platform): boolean => {
    if (!platform.config) return false;
    const { strategy, strategyFocus, hasPhases, phases, objective, campaignType, optimizationGoal, targeting } = platform.config;
    
    const basicComplete = !!(strategy && strategyFocus);
    
    if (hasPhases) {
      const phasesComplete = phases && phases.length > 0 && phases.every(p => 
        p.name && p.startDate && p.endDate && p.budgetPercentage > 0
      );
      if (!phasesComplete) return false;
    }
    
    const detailsComplete = !!(
      objective &&
      campaignType &&
      optimizationGoal &&
      targeting?.locations?.length &&
      targeting?.ageMin &&
      targeting?.ageMax
    );
    
    return basicComplete && detailsComplete;
  };

  if (enabledPlatforms.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Configuration</CardTitle>
        <CardDescription>Configure detailed settings for each platform</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={enabledPlatforms[0]?.id} className="w-full">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${enabledPlatforms.length}, 1fr)` }}>
            {enabledPlatforms.map(platform => (
              <TabsTrigger key={platform.id} value={platform.id} className="gap-2">
                {platform.name}
                {isConfigComplete(platform) && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 text-xs">✓</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {enabledPlatforms.map(platform => (
            <TabsContent key={platform.id} value={platform.id} className="space-y-6 mt-6">
              {/* Strategy Selection */}
              <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                <h4 className="font-semibold text-lg">Strategy Selection</h4>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Strategy Type</Label>
                    <Select
                      value={platform.config?.strategy}
                      onValueChange={(value) => updatePlatformConfig(platform.id, "strategy", value)}
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
                      value={platform.config?.strategyFocus}
                      onValueChange={(value) => updatePlatformConfig(platform.id, "strategyFocus", value)}
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

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`phases-${platform.id}`}
                    checked={platform.config?.hasPhases || false}
                    onChange={(e) => updatePlatformConfig(platform.id, "hasPhases", e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor={`phases-${platform.id}`}>Split strategy into phases</Label>
                </div>

                {platform.config?.hasPhases && (
                  <div className="space-y-4 mt-4">
                    <div className="flex items-center justify-between">
                      <h5 className="font-medium">Phases</h5>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addPhase(platform.id)}
                      >
                        Add Phase
                      </Button>
                    </div>

                    {platform.config.phases?.map((phase, index) => (
                      <div key={phase.id} className="p-4 border rounded-lg space-y-4 bg-background">
                        <div className="flex items-center justify-between">
                          <Input
                            value={phase.name}
                            onChange={(e) => updatePhase(platform.id, phase.id, "name", e.target.value)}
                            placeholder="Phase name"
                            className="max-w-xs"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removePhase(platform.id, phase.id)}
                          >
                            Remove
                          </Button>
                        </div>
                        
                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label>Start Date</Label>
                            <Input
                              type="date"
                              value={phase.startDate}
                              onChange={(e) => updatePhase(platform.id, phase.id, "startDate", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>End Date</Label>
                            <Input
                              type="date"
                              value={phase.endDate}
                              onChange={(e) => updatePhase(platform.id, phase.id, "endDate", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Budget %</Label>
                            <Input
                              type="number"
                              value={phase.budgetPercentage}
                              onChange={(e) => updatePhase(platform.id, phase.id, "budgetPercentage", parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              min="0"
                              max="100"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Detailed Configuration */}
              <div className="space-y-4">
                <h4 className="font-semibold text-lg">Campaign Configuration</h4>
                <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Campaign Objective</Label>
                  <Select
                    value={platform.config?.objective}
                    onValueChange={(value) => updatePlatformConfig(platform.id, "objective", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select objective" />
                    </SelectTrigger>
                    <SelectContent>
                      {platformObjectives[platform.id]?.map(obj => (
                        <SelectItem key={obj} value={obj}>{obj}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Campaign Type</Label>
                  <Input
                    value={platform.config?.campaignType || ""}
                    onChange={(e) => updatePlatformConfig(platform.id, "campaignType", e.target.value)}
                    placeholder="e.g., Awareness, Consideration"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Optimization Goal</Label>
                  <Select
                    value={platform.config?.optimizationGoal}
                    onValueChange={(value) => updatePlatformConfig(platform.id, "optimizationGoal", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select goal" />
                    </SelectTrigger>
                    <SelectContent>
                      {optimizationGoals[platform.id]?.map(goal => (
                        <SelectItem key={goal} value={goal}>{goal}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Target Locations</Label>
                  <Input
                    value={platform.config?.targeting?.locations?.join(", ") || ""}
                    onChange={(e) => updateTargeting(platform.id, "locations", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                    placeholder="e.g., United States, Canada"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Demographics</h4>
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Age Min</Label>
                    <Input
                      type="number"
                      value={platform.config?.targeting?.ageMin || ""}
                      onChange={(e) => updateTargeting(platform.id, "ageMin", parseInt(e.target.value))}
                      placeholder="18"
                      min="13"
                      max="65"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Age Max</Label>
                    <Input
                      type="number"
                      value={platform.config?.targeting?.ageMax || ""}
                      onChange={(e) => updateTargeting(platform.id, "ageMax", parseInt(e.target.value))}
                      placeholder="65"
                      min="13"
                      max="65"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Genders</Label>
                    <Input
                      value={platform.config?.targeting?.genders?.join(", ") || ""}
                      onChange={(e) => updateTargeting(platform.id, "genders", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                      placeholder="All, Male, Female"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Placements</Label>
                  <Input
                    value={platform.config?.targeting?.placements?.join(", ") || ""}
                    onChange={(e) => updateTargeting(platform.id, "placements", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                    placeholder="e.g., Feed, Stories, Reels"
                  />
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={startDate} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input type="date" value={endDate} disabled className="bg-muted" />
                  </div>
                </div>
              </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
