import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Facebook, Linkedin } from "lucide-react";

import { Platform } from "./PlatformConfiguration";

interface PlatformSelectorProps {
  platforms: Platform[];
  setPlatforms: (platforms: Platform[]) => void;
}

const platformIcons: Record<string, string> = {
  meta: "🔵",
  google: "🔴",
  linkedin: "💼",
  tiktok: "⚫",
  snapchat: "👻",
  pinterest: "📌",
};

const platformColors: Record<string, string> = {
  meta: "from-blue-500 to-blue-600",
  google: "from-red-500 to-orange-500",
  linkedin: "from-blue-600 to-blue-700",
  tiktok: "from-black to-gray-800",
  snapchat: "from-yellow-300 to-yellow-400",
  pinterest: "from-red-600 to-red-700",
};

const campaignObjectives: Record<string, string[]> = {
  meta: ["Brand Awareness", "Reach", "Traffic", "Engagement", "App Installs", "Video Views", "Lead Generation", "Conversions"],
  google: ["Search", "Display", "Video", "Shopping", "Performance Max", "App", "Discovery", "Local"],
  linkedin: ["Brand Awareness", "Website Visits", "Engagement", "Video Views", "Lead Generation", "Conversions", "Job Applicants"],
  tiktok: ["Reach", "Traffic", "Video Views", "Community Interaction", "App Installs", "Lead Generation", "Conversions"],
  snapchat: ["Awareness", "Consideration", "Conversions", "Catalog Sales"],
  pinterest: ["Brand Awareness", "Video Views", "Consideration", "Conversions", "Catalog Sales"],
};

export function PlatformSelector({ platforms, setPlatforms }: PlatformSelectorProps) {
  const togglePlatform = (platformId: string) => {
    setPlatforms(
      platforms.map((p) =>
        p.id === platformId ? { ...p, enabled: !p.enabled } : p
      )
    );
  };

  const updateObjective = (platformId: string, objective: string) => {
    setPlatforms(
      platforms.map((p) =>
        p.id === platformId ? { ...p, objective } : p
      )
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Platforms</CardTitle>
        <CardDescription>Choose which ad platforms to include in your campaign</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {platforms.map((platform) => (
            <div
              key={platform.id}
              className={`
                relative overflow-hidden rounded-lg border-2 transition-all duration-200
                ${
                  platform.enabled
                    ? "border-primary shadow-md bg-gradient-to-br " + platformColors[platform.id]
                    : "border-border bg-card hover:border-muted-foreground"
                }
              `}
            >
              <label
                htmlFor={platform.id}
                className={`
                  flex flex-col items-center justify-center p-4 cursor-pointer
                  ${platform.enabled ? "text-white" : "text-foreground"}
                `}
              >
                <div className="text-4xl mb-2">{platformIcons[platform.id]}</div>
                <div className="text-sm font-medium text-center">{platform.name}</div>
                <Checkbox
                  id={platform.id}
                  checked={platform.enabled}
                  onCheckedChange={() => togglePlatform(platform.id)}
                  className="absolute top-2 right-2 bg-white border-white data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
              </label>
            </div>
          ))}
        </div>

        {/* Campaign Objective Selection */}
        {platforms.some(p => p.enabled) && (
          <div className="space-y-4 pt-4 border-t">
            <div>
              <h4 className="font-semibold mb-3">Campaign Objectives</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Select the primary objective for each platform
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {platforms.filter(p => p.enabled).map((platform) => (
                <div key={`objective-${platform.id}`} className="space-y-2">
                  <Label htmlFor={`objective-${platform.id}`} className="flex items-center gap-2">
                    <span className="text-lg">{platformIcons[platform.id]}</span>
                    <span>{platform.name} Objective</span>
                  </Label>
                  <Select
                    value={platform.objective || ""}
                    onValueChange={(value) => updateObjective(platform.id, value)}
                  >
                    <SelectTrigger id={`objective-${platform.id}`}>
                      <SelectValue placeholder="Select objective" />
                    </SelectTrigger>
                    <SelectContent>
                      {(campaignObjectives[platform.id] || []).map((objective) => (
                        <SelectItem key={objective} value={objective}>
                          {objective}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
