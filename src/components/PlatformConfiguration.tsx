import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhaseScheduler } from "./PhaseScheduler";
import { PlatformConfigFields } from "./PlatformConfigFields";
import { AdFormatSelector } from "./AdFormatSelector";
import { getPhasesFromAdFormats } from "@/utils/adFormats";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface Phase {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  budgetPercentage: number;
  assetTypes?: string[];
  isLoyaltyPhase?: boolean;
  objective?: string;
  optimizationGoal?: string;
  budgetType?: "daily" | "lifetime";
  publisherPlatforms?: string[];
  positions?: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
    messenger?: string[];
    threads?: string[];
  };
  overrideTargeting?: boolean;
  targeting?: {
    adFormats?: string[];
    ageMin?: number;
    ageMax?: number;
    genders?: string[];
    devices?: string[];
    targetingExpansion?: boolean;
    os?: string[];
    language?: string;
    interests?: string;
    websiteAudience?: string;
    keywordList?: string;
    customerList?: string;
    lookalikeAudience?: string;
  };
  audiences?: Array<{
    id: string;
    name: string;
    type: string;
    source: string;
    subtype?: string;
    approximate_count?: number;
  }>;
}

export interface Campaign {
  id: string;
  name: string;
  funnelStage?: "awareness" | "consideration" | "conversion" | "loyalty";
  objective?: string;
  campaignType?: string;
  optimizationGoal?: string;
  budgetType?: "daily" | "lifetime";
  startDate?: string;
  endDate?: string;
  phases?: Phase[];
  targeting?: {
    ageMin?: number;
    ageMax?: number;
    genders?: string[];
    placements?: string[];
  };
}

export interface PlatformConfig {
  strategy?: "auto-detect" | "full-funnel" | "manual";
  strategyFocus?: "purchase" | "leads" | "app-installs" | "conversions" | "brand-awareness" | "auto";
  hasPhases?: boolean;
  phases?: Phase[];
  campaigns?: Campaign[];
}

export interface Platform {
  id: string;
  name: string;
  enabled: boolean;
  budgetPercentage: number;
  config?: PlatformConfig;
  objective?: string;
}

interface PlatformConfigurationProps {
  platforms: Platform[];
  setPlatforms: (platforms: Platform[]) => void;
  startDate: string;
  endDate: string;
}

const platformObjectives: Record<string, string[]> = {
  meta: [
    "Brand Awareness",
    "Reach",
    "Traffic",
    "Engagement",
    "App Installs",
    "Video Views",
    "Lead Generation",
    "Conversions",
  ],
  google: ["Search", "Display", "Video", "Shopping", "Performance Max", "App", "Discovery", "Local"],
  linkedin: [
    "Brand Awareness",
    "Website Visits",
    "Engagement",
    "Video Views",
    "Lead Generation",
    "Conversions",
    "Job Applicants",
  ],
  tiktok: [
    "Reach",
    "Traffic",
    "Video Views",
    "Community Interaction",
    "App Installs",
    "Lead Generation",
    "Conversions",
  ],
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

const getFunnelObjectives = (platformId: string, stage: string, focus: string): string => {
  const objectives: Record<string, Record<string, Record<string, string>>> = {
    meta: {
      awareness: {
        purchase: "Brand Awareness",
        leads: "Brand Awareness",
        "app-installs": "Brand Awareness",
        conversions: "Brand Awareness",
      },
      consideration: {
        purchase: "Traffic",
        leads: "Lead Generation",
        "app-installs": "App Installs",
        conversions: "Traffic",
      },
      conversion: {
        purchase: "Conversions",
        leads: "Lead Generation",
        "app-installs": "App Installs",
        conversions: "Conversions",
      },
      loyalty: {
        purchase: "Conversions",
        leads: "Engagement",
        "app-installs": "Engagement",
        conversions: "Conversions",
      },
    },
    google: {
      awareness: { purchase: "Display", leads: "Display", "app-installs": "App", conversions: "Display" },
      consideration: { purchase: "Search", leads: "Search", "app-installs": "App", conversions: "Search" },
      conversion: { purchase: "Shopping", leads: "Search", "app-installs": "App", conversions: "Performance Max" },
      loyalty: { purchase: "Performance Max", leads: "Search", "app-installs": "App", conversions: "Performance Max" },
    },
  };

  return objectives[platformId]?.[stage]?.[focus] || platformObjectives[platformId]?.[0] || "";
};

export function PlatformConfiguration({ platforms, setPlatforms, startDate, endDate }: PlatformConfigurationProps) {
  const enabledPlatforms = platforms.filter((p) => p.enabled);

  // Helper to determine if objective is conversion-focused
  const isConversionObjective = (objective?: string): boolean => {
    if (!objective) return false;
    const conversionKeywords = ['conversion', 'purchase', 'lead', 'app install', 'catalog'];
    return conversionKeywords.some(keyword => objective.toLowerCase().includes(keyword));
  };

  const updatePlatformConfig = (platformId: string, field: keyof PlatformConfig, value: any) => {
    setPlatforms(
      platforms.map((p) => {
        if (p.id === platformId) {
          const updatedConfig = { ...p.config, [field]: value };

          // Auto-generate campaigns when strategy changes
          if (field === "strategy" || field === "strategyFocus") {
            const strategy = field === "strategy" ? value : p.config?.strategy;
            const focus = field === "strategyFocus" ? value : p.config?.strategyFocus;

            if (strategy === "full-funnel" && focus) {
              updatedConfig.campaigns = [
                {
                  id: "awareness",
                  name: "Awareness Campaign",
                  funnelStage: "awareness",
                  objective: getFunnelObjectives(platformId, "awareness", focus),
                },
                {
                  id: "consideration",
                  name: "Consideration Campaign",
                  funnelStage: "consideration",
                  objective: getFunnelObjectives(platformId, "consideration", focus),
                },
                {
                  id: "conversion",
                  name: "Conversion Campaign",
                  funnelStage: "conversion",
                  objective: getFunnelObjectives(platformId, "conversion", focus),
                },
                {
                  id: "loyalty",
                  name: "Loyalty Campaign",
                  funnelStage: "loyalty",
                  objective: getFunnelObjectives(platformId, "loyalty", focus),
                },
              ];
            } else if (strategy === "partial" && !updatedConfig.campaigns?.length) {
              updatedConfig.campaigns = [{ id: `campaign-${Date.now()}`, name: "Campaign 1" }];
            }
          }

          // Update campaign objectives when phases change (to reflect asset types)
          if (field === "phases") {
            const phases = value as Phase[];
            updatedConfig.campaigns = updatedConfig.campaigns?.map((campaign) => {
              const phase = phases.find((ph) => ph.name.toLowerCase() === campaign.funnelStage?.toLowerCase());

              // Keep existing objective or use default
              return campaign;
            });
          }

          return { ...p, config: updatedConfig };
        }
        return p;
      }),
    );
  };

  const addCampaign = (platformId: string) => {
    setPlatforms(
      platforms.map((p) => {
        if (p.id === platformId) {
          const campaigns = p.config?.campaigns || [];
          const newCampaign: Campaign = {
            id: `campaign-${Date.now()}`,
            name: `Campaign ${campaigns.length + 1}`,
          };
          return {
            ...p,
            config: {
              ...p.config,
              campaigns: [...campaigns, newCampaign],
            },
          };
        }
        return p;
      }),
    );
  };

  const removeCampaign = (platformId: string, campaignId: string) => {
    setPlatforms(
      platforms.map((p) => {
        if (p.id === platformId && p.config?.campaigns) {
          return {
            ...p,
            config: {
              ...p.config,
              campaigns: p.config.campaigns.filter((c) => c.id !== campaignId),
            },
          };
        }
        return p;
      }),
    );
  };

  const updateCampaign = (platformId: string, campaignId: string, field: keyof Campaign, value: any) => {
    setPlatforms(
      platforms.map((p) => {
        if (p.id === platformId && p.config?.campaigns) {
          return {
            ...p,
            config: {
              ...p.config,
              campaigns: p.config.campaigns.map((c) => (c.id === campaignId ? { ...c, [field]: value } : c)),
            },
          };
        }
        return p;
      }),
    );
  };

  const updateCampaignTargeting = (platformId: string, campaignId: string, field: string, value: any) => {
    setPlatforms(
      platforms.map((p) => {
        if (p.id === platformId && p.config?.campaigns) {
          return {
            ...p,
            config: {
              ...p.config,
              campaigns: p.config.campaigns.map((c) =>
                c.id === campaignId ? { ...c, targeting: { ...c.targeting, [field]: value } } : c,
              ),
            },
          };
        }
        return p;
      }),
    );
  };

  const addPhase = (platformId: string) => {
    setPlatforms(
      platforms.map((p) => {
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
            },
          };
        }
        return p;
      }),
    );
  };

  const updatePhase = (platformId: string, phaseId: string, field: keyof Phase, value: any) => {
    setPlatforms(
      platforms.map((p) => {
        if (p.id === platformId && p.config?.phases) {
          return {
            ...p,
            config: {
              ...p.config,
              phases: p.config.phases.map((phase) => (phase.id === phaseId ? { ...phase, [field]: value } : phase)),
            },
          };
        }
        return p;
      }),
    );
  };

  const removePhase = (platformId: string, phaseId: string) => {
    setPlatforms(
      platforms.map((p) => {
        if (p.id === platformId && p.config?.phases) {
          return {
            ...p,
            config: {
              ...p.config,
              phases: p.config.phases.filter((phase) => phase.id !== phaseId),
            },
          };
        }
        return p;
      }),
    );
  };

  const isConfigComplete = (platform: Platform): boolean => {
    if (!platform.config) return false;
    const { strategy, strategyFocus, hasPhases, phases, campaigns } = platform.config;

    const basicComplete = !!(strategy && strategyFocus);

    if (hasPhases) {
      const phasesComplete =
        phases &&
        phases.length > 0 &&
        phases.every((p) => p.name && p.startDate && p.endDate && p.budgetPercentage > 0);
      if (!phasesComplete) return false;
    }

    if (!campaigns || campaigns.length === 0) return false;

    const campaignsComplete = campaigns.every((c) => {
      return !!(
        c.name &&
        c.objective &&
        c.campaignType &&
        c.optimizationGoal &&
        c.targeting?.ageMin &&
        c.targeting?.ageMax
      );
    });

    return basicComplete && campaignsComplete;
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
            {enabledPlatforms.map((platform) => (
              <TabsTrigger key={platform.id} value={platform.id} className="gap-2">
                {platform.name}
                {isConfigComplete(platform) && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 text-xs">
                    ✓
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {enabledPlatforms.map((platform) => (
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

                {/* Validation alert for missing budget types */}
                {platform.config?.campaigns && platform.config.campaigns.some(c => !c.budgetType) && (
                  <Alert variant="destructive" className="mt-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                      Some campaigns are missing budget type configuration. Please set a budget type for each campaign before publishing.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Phase Configuration */}
              <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`phases-${platform.id}`}
                    checked={platform.config?.hasPhases || false}
                    onChange={(e) => {
                      const hasPhases = e.target.checked;
                      updatePlatformConfig(platform.id, "hasPhases", hasPhases);
                      if (hasPhases && (!platform.config?.phases || platform.config.phases.length === 0)) {
                        // Initialize with one phase if enabling for the first time
                        updatePlatformConfig(platform.id, "phases", [
                          {
                            id: `phase-${Date.now()}`,
                            name: "Phase 1",
                            startDate: startDate,
                            endDate: endDate,
                            budgetPercentage: 100,
                          },
                        ]);
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <Label htmlFor={`phases-${platform.id}`}>Enable phasing schedule</Label>
                </div>

                {platform.config?.hasPhases && (
                  <PhaseScheduler
                    phases={platform.config.phases || []}
                    onPhasesChange={(phases) => updatePlatformConfig(platform.id, "phases", phases)}
                    startDate={startDate}
                    endDate={endDate}
                    platformId={platform.id}
                    platformName={platform.name}
                    adAccountDefaults={{ hasDefaults: false }}
                    onApplyBudgetTypeToAll={(budgetType) => {
                      // Apply budget type to all phases across all campaigns in this platform
                      const updatedPlatforms = platforms.map((p) =>
                        p.id === platform.id
                          ? {
                              ...p,
                              config: {
                                ...p.config,
                                phases: p.config?.phases?.map((phase) => ({
                                  ...phase,
                                  budgetType: phase.budgetType || budgetType,
                                })),
                                campaigns: p.config?.campaigns?.map((campaign) => ({
                                  ...campaign,
                                  phases: campaign.phases?.map((phase) => ({
                                    ...phase,
                                    budgetType: phase.budgetType || budgetType,
                                  })),
                                })),
                              },
                            }
                          : p
                      );
                      setPlatforms(updatedPlatforms);
                    }}
                  />
                )}
              </div>

              {/* Campaign Configuration */}
              {platform.config?.campaigns && platform.config.campaigns.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-lg">Campaign Configuration</h4>
                    {platform.config.strategy === "manual" && (
                      <Button type="button" variant="outline" size="sm" onClick={() => addCampaign(platform.id)}>
                        Add Campaign
                      </Button>
                    )}
                  </div>

                  <Tabs defaultValue={platform.config.campaigns[0]?.id} className="w-full">
                    <TabsList
                      className="grid w-full"
                      style={{ gridTemplateColumns: `repeat(${platform.config.campaigns.length}, 1fr)` }}
                    >
                      {platform.config.campaigns.map((campaign) => (
                        <TabsTrigger key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {platform.config.campaigns.map((campaign) => (
                      <TabsContent key={campaign.id} value={campaign.id} className="space-y-4 mt-4">
                        {platform.config?.strategy === "manual" && (
                          <div className="flex items-center justify-between pb-2 border-b">
                            <Input
                              value={campaign.name}
                              onChange={(e) => updateCampaign(platform.id, campaign.id, "name", e.target.value)}
                              placeholder="Campaign name"
                              className="max-w-xs"
                            />
                            {platform.config.campaigns && platform.config.campaigns.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeCampaign(platform.id, campaign.id)}
                              >
                                Remove Campaign
                              </Button>
                            )}
                          </div>
                        )}

                        {campaign.funnelStage && (
                          <Badge variant="outline" className="mb-2">
                            {campaign.funnelStage.charAt(0).toUpperCase() + campaign.funnelStage.slice(1)} Stage
                          </Badge>
                        )}

                        <div className="grid gap-6 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Campaign Objective</Label>
                            <Select
                              value={campaign.objective}
                              onValueChange={(value) => updateCampaign(platform.id, campaign.id, "objective", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select objective" />
                              </SelectTrigger>
                              <SelectContent>
                                {platformObjectives[platform.id]?.map((obj) => (
                                  <SelectItem key={obj} value={obj}>
                                    {obj}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Campaign Type</Label>
                            <Input
                              value={campaign.campaignType || ""}
                              onChange={(e) => updateCampaign(platform.id, campaign.id, "campaignType", e.target.value)}
                              placeholder="e.g., Awareness, Consideration"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Optimization Goal</Label>
                            <Select
                              value={campaign.optimizationGoal}
                              onValueChange={(value) =>
                                updateCampaign(platform.id, campaign.id, "optimizationGoal", value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select goal" />
                              </SelectTrigger>
                              <SelectContent>
                                {optimizationGoals[platform.id]?.map((goal) => (
                                  <SelectItem key={goal} value={goal}>
                                    {goal}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Budget Type Selector - Inline with validation */}
                        <div className={`p-4 rounded-lg border-2 ${!campaign.budgetType ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20' : 'border-border bg-muted/50'}`}>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="font-medium">Budget Type *</Label>
                              {!campaign.budgetType && (
                                <Badge variant="outline" className="border-yellow-500 text-yellow-700 dark:text-yellow-300">
                                  Required
                                </Badge>
                              )}
                            </div>
                            <Select
                              value={campaign.budgetType || ""}
                              onValueChange={(value: "daily" | "lifetime") => 
                                updateCampaign(platform.id, campaign.id, "budgetType", value)
                              }
                            >
                              <SelectTrigger className={!campaign.budgetType ? 'border-yellow-500' : ''}>
                                <SelectValue placeholder="Select budget type" />
                              </SelectTrigger>
                              <SelectContent className="bg-popover z-50">
                                <SelectItem value="daily">
                                  <div className="flex flex-col">
                                    <span className="font-medium">Daily Budget</span>
                                    <span className="text-xs text-muted-foreground">Fixed daily spend limit</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="lifetime">
                                  <div className="flex flex-col">
                                    <span className="font-medium">Lifetime Budget</span>
                                    <span className="text-xs text-muted-foreground">Total budget optimized over campaign duration</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {!campaign.budgetType && (
                              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                                Please select a budget type to continue
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h4 className="font-medium">Demographics</h4>
                          <div className="grid gap-6 md:grid-cols-3">
                            <div className="space-y-2">
                              <Label>Age Min</Label>
                              <Input
                                type="number"
                                value={campaign.targeting?.ageMin || ""}
                                onChange={(e) =>
                                  updateCampaignTargeting(platform.id, campaign.id, "ageMin", parseInt(e.target.value))
                                }
                                placeholder="18"
                                min="13"
                                max="65"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Age Max</Label>
                              <Input
                                type="number"
                                value={campaign.targeting?.ageMax || ""}
                                onChange={(e) =>
                                  updateCampaignTargeting(platform.id, campaign.id, "ageMax", parseInt(e.target.value))
                                }
                                placeholder="65"
                                min="13"
                                max="65"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Genders</Label>
                              <Input
                                value={campaign.targeting?.genders?.join(", ") || ""}
                                onChange={(e) =>
                                  updateCampaignTargeting(
                                    platform.id,
                                    campaign.id,
                                    "genders",
                                    e.target.value
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  )
                                }
                                placeholder="All, Male, Female"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Placements</Label>
                            <Input
                              value={campaign.targeting?.placements?.join(", ") || ""}
                              onChange={(e) =>
                                updateCampaignTargeting(
                                  platform.id,
                                  campaign.id,
                                  "placements",
                                  e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                )
                              }
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
                      </TabsContent>
                    ))}
                  </Tabs>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
