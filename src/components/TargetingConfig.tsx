import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AdFormatSelector } from "./AdFormatSelector";
import { useAudienceRecommendations } from "@/hooks/useAudienceRecommendations";
import { Loader2, Sparkles, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface TargetingConfig {
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
}

interface TargetingConfigProps {
  targeting: TargetingConfig;
  onUpdate: (targeting: TargetingConfig) => void;
  platformName: string;
  showAdFormats?: boolean;
  strategyFocus?: string;
}

export function TargetingConfigComponent({ 
  targeting, 
  onUpdate, 
  platformName, 
  showAdFormats = true,
  strategyFocus = "conversions"
}: TargetingConfigProps) {
  const [audienceDescription, setAudienceDescription] = useState("");
  const [showRecommendations, setShowRecommendations] = useState(false);
  const { recommendations, loading, generateRecommendations, clearRecommendations } = useAudienceRecommendations();

  const updateField = (field: keyof TargetingConfig, value: any) => {
    onUpdate({ ...targeting, [field]: value });
  };

  const ageOptions = Array.from({ length: 53 }, (_, i) => 13 + i); // Ages 13-65

  const handleGenerateRecommendations = async () => {
    await generateRecommendations(audienceDescription, strategyFocus, platformName);
    setShowRecommendations(true);
  };

  const handleApplySuggestions = () => {
    // Apply recommendations to targeting config
    // Focus on demographics that affect predictions: Age, Gender, Device, Language
    const retargetingAudiences: string[] = [];
    const lookalikeAudiences: string[] = [];
    const interests: string[] = [];

    recommendations.forEach(rec => {
      if (rec.category === "Retargeting") {
        rec.items.filter(item => item.available).forEach(item => {
          if (item.audienceName) {
            retargetingAudiences.push(item.audienceName);
          }
        });
      } else if (rec.category === "Lookalikes") {
        rec.items.filter(item => item.available).forEach(item => {
          if (item.audienceName) {
            lookalikeAudiences.push(item.audienceName);
          }
        });
      } else if (rec.category === "New Acquisition") {
        rec.items.forEach(item => {
          if (item.source === "Interests" || item.source === "Behaviors") {
            interests.push(item.description);
          }
        });
      }
    });

    // Update targeting with recommendations
    const updates: Partial<TargetingConfig> = {};
    
    if (retargetingAudiences.length > 0) {
      updates.websiteAudience = retargetingAudiences.join(", ");
    }
    
    if (lookalikeAudiences.length > 0) {
      updates.lookalikeAudience = lookalikeAudiences.join(", ");
    }
    
    if (interests.length > 0) {
      updates.interests = interests.join(", ");
    }

    onUpdate({ ...targeting, ...updates });
    setShowRecommendations(false);
    clearRecommendations();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Targeting Configuration</CardTitle>
        <CardDescription className="text-sm">Define audience targeting for {platformName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* AI-Powered Audience Recommendation */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">AI Audience Recommendations</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Describe your target audience or leave blank for auto-suggestions based on your campaign strategy
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="e.g., 'Retarget website visitors who viewed products' or 'Find new customers similar to my best buyers' or leave blank for auto-suggest..."
              value={audienceDescription}
              onChange={(e) => setAudienceDescription(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleGenerateRecommendations}
                disabled={loading}
                size="sm"
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {audienceDescription ? "Get Recommendations" : "Auto-Generate"}
                  </>
                )}
              </Button>
              {recommendations.length > 0 && (
                <Button
                  onClick={clearRecommendations}
                  variant="outline"
                  size="sm"
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Display Recommendations */}
            {recommendations.length > 0 && showRecommendations && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Recommended Audiences</h4>
                  <Button onClick={handleApplySuggestions} size="sm" variant="default">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Apply Suggestions
                  </Button>
                </div>

                {recommendations.map((rec, idx) => (
                  <Collapsible key={idx} defaultOpen={idx === 0}>
                    <Card className="border-border/50">
                      <CollapsibleTrigger asChild>
                        <CardHeader className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {rec.category}
                              </Badge>
                              <span className="text-sm font-medium">
                                {rec.items.length} option{rec.items.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                          <CardDescription className="text-xs mt-1">
                            {rec.justification}
                          </CardDescription>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 space-y-2">
                          {rec.items.map((item, itemIdx) => (
                            <Alert
                              key={itemIdx}
                              className={item.available ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950" : "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950"}
                            >
                              <div className="flex items-start gap-2">
                                {item.available ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5" />
                                )}
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{item.source}</span>
                                    {item.audienceName && (
                                      <Badge variant="secondary" className="text-xs">
                                        {item.audienceName}
                                      </Badge>
                                    )}
                                  </div>
                                  <AlertDescription className="text-xs">
                                    {item.description}
                                  </AlertDescription>
                                  {!item.available && item.setupInstructions && (
                                    <details className="text-xs text-muted-foreground mt-2">
                                      <summary className="cursor-pointer hover:text-foreground flex items-center gap-1">
                                        <ExternalLink className="h-3 w-3" />
                                        How to set this up
                                      </summary>
                                      <p className="mt-2 pl-4 border-l-2 border-border">
                                        {item.setupInstructions}
                                      </p>
                                    </details>
                                  )}
                                </div>
                              </div>
                            </Alert>
                          ))}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                ))}

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Note:</strong> Only Age, Gender, Device, and Language selections will affect reach and frequency predictions. 
                    All other audience options are for targeting refinement only.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>
        </Card>
        {/* Ad Formats */}
        {showAdFormats && (
          <div className="space-y-2">
            <Label>Ad Formats</Label>
            <AdFormatSelector
              platformName={platformName}
              selectedFormats={targeting.adFormats || []}
              onFormatsChange={(formats) => updateField("adFormats", formats)}
            />
          </div>
        )}

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
