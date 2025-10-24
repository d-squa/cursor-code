import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AdFormatSelector } from "./AdFormatSelector";

export interface TargetingConfig {
  adFormats?: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: string[];
  devices?: string[];
  placements?: string[];
  targetingExpansion?: boolean;
  os?: string[];
  language?: string;
  interests?: string;
  websiteAudience?: string;
  keywordList?: string;
  customerList?: string;
  lookalikeAudience?: string;
}

interface TargetingConfigProps {
  targeting: TargetingConfig;
  onUpdate: (targeting: TargetingConfig) => void;
  platformName: string;
}

export function TargetingConfigComponent({ targeting, onUpdate, platformName }: TargetingConfigProps) {
  const updateField = (field: keyof TargetingConfig, value: any) => {
    onUpdate({ ...targeting, [field]: value });
  };

  const ageOptions = Array.from({ length: 53 }, (_, i) => 13 + i); // Ages 13-65

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Targeting Configuration</CardTitle>
        <CardDescription className="text-sm">Define audience targeting for {platformName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ad Formats */}
        <div className="space-y-2">
          <Label>Ad Formats</Label>
          <AdFormatSelector
            platformName={platformName}
            selectedFormats={targeting.adFormats || []}
            onFormatsChange={(formats) => updateField("adFormats", formats)}
          />
        </div>

        {/* Age & Gender */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="age-min">Min Age</Label>
            <Select
              value={targeting.ageMin?.toString() || ""}
              onValueChange={(value) => updateField("ageMin", value ? parseInt(value) : undefined)}
            >
              <SelectTrigger id="age-min">
                <SelectValue placeholder="Select min age" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {ageOptions.map(age => (
                  <SelectItem key={age} value={age.toString()}>{age}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="age-max">Max Age</Label>
            <Select
              value={targeting.ageMax?.toString() || ""}
              onValueChange={(value) => updateField("ageMax", value ? parseInt(value) : undefined)}
            >
              <SelectTrigger id="age-max">
                <SelectValue placeholder="Select max age" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {ageOptions.map(age => (
                  <SelectItem key={age} value={age.toString()}>{age}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <Select
              value={targeting.genders?.[0] || "all"}
              onValueChange={(value) => updateField("genders", value === "all" ? [] : [value])}
            >
              <SelectTrigger id="gender">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Devices */}
        <div className="space-y-2">
          <Label htmlFor="devices">Devices</Label>
          <Select
            value={targeting.devices?.[0] || "all"}
            onValueChange={(value) => updateField("devices", value === "all" ? [] : [value])}
          >
            <SelectTrigger id="devices">
              <SelectValue placeholder="Select device" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="desktop">Desktop</SelectItem>
              <SelectItem value="tablet">Tablet</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Placements */}
        <div className="space-y-2">
          <Label htmlFor="placements">Placements</Label>
          <Input
            id="placements"
            value={targeting.placements?.join(", ") || ""}
            onChange={(e) => updateField("placements", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
            placeholder="Automatic (based on selected ad formats) or enter custom placements"
          />
        </div>

        {/* Targeting Expansion */}
        <div className="flex items-center justify-between">
          <Label htmlFor="targeting-expansion">Targeting Expansion</Label>
          <Switch
            id="targeting-expansion"
            checked={targeting.targetingExpansion || false}
            onCheckedChange={(checked) => updateField("targetingExpansion", checked)}
          />
        </div>

        {/* OS */}
        <div className="space-y-2">
          <Label htmlFor="os">Operating System</Label>
          <Input
            id="os"
            value={targeting.os?.join(", ") || ""}
            onChange={(e) => updateField("os", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
            placeholder="iOS, Android, Windows"
          />
        </div>

        {/* Language */}
        <div className="space-y-2">
          <Label htmlFor="language">Language</Label>
          <Select
            value={targeting.language || "all"}
            onValueChange={(value) => updateField("language", value)}
          >
            <SelectTrigger id="language">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="fr">French</SelectItem>
              <SelectItem value="de">German</SelectItem>
              <SelectItem value="it">Italian</SelectItem>
              <SelectItem value="pt">Portuguese</SelectItem>
              <SelectItem value="ja">Japanese</SelectItem>
              <SelectItem value="zh">Chinese</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Interests */}
        <div className="space-y-2">
          <Label htmlFor="interests">Interests</Label>
          <Textarea
            id="interests"
            value={targeting.interests || ""}
            onChange={(e) => updateField("interests", e.target.value)}
            placeholder="Enter interests (to be fetched from API)"
            rows={2}
          />
        </div>

        {/* Website Audience */}
        <div className="space-y-2">
          <Label htmlFor="website-audience">Website Audience</Label>
          <Input
            id="website-audience"
            value={targeting.websiteAudience || ""}
            onChange={(e) => updateField("websiteAudience", e.target.value)}
            placeholder="Select website audience (to be fetched from API)"
          />
        </div>

        {/* Keyword List */}
        <div className="space-y-2">
          <Label htmlFor="keyword-list">Keyword List</Label>
          <Textarea
            id="keyword-list"
            value={targeting.keywordList || ""}
            onChange={(e) => updateField("keywordList", e.target.value)}
            placeholder="Enter keywords, one per line"
            rows={3}
          />
        </div>

        {/* Customer List */}
        <div className="space-y-2">
          <Label htmlFor="customer-list">Customer List</Label>
          <Input
            id="customer-list"
            value={targeting.customerList || ""}
            onChange={(e) => updateField("customerList", e.target.value)}
            placeholder="Select customer list (to be fetched from API)"
          />
        </div>

        {/* Lookalike Audience */}
        <div className="space-y-2">
          <Label htmlFor="lookalike-audience">Lookalike Audience</Label>
          <Input
            id="lookalike-audience"
            value={targeting.lookalikeAudience || ""}
            onChange={(e) => updateField("lookalikeAudience", e.target.value)}
            placeholder="Select lookalike audience (to be fetched from API)"
          />
        </div>
      </CardContent>
    </Card>
  );
}
