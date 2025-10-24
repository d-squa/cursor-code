import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export interface PlatformConfig {
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

  const isConfigComplete = (platform: Platform): boolean => {
    if (!platform.config) return false;
    const { objective, campaignType, optimizationGoal, targeting } = platform.config;
    return !!(
      objective &&
      campaignType &&
      optimizationGoal &&
      targeting?.locations?.length &&
      targeting?.ageMin &&
      targeting?.ageMax
    );
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
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
