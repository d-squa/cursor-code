import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AdFormatSelector } from "./AdFormatSelector";
import { TargetingBriefInput } from "./TargetingBriefInput";
import { AudienceCard } from "./AudienceCard";
import { AudienceRecommendationPreview } from "./AudienceRecommendationPreview";
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
  const [parsedTargetingLocal, setParsedTargetingLocal] = useState<any[]>([]);

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
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Recommended Audiences</h4>
                  <Button onClick={handleApplySuggestions} size="sm" variant="default">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Apply Suggestions
                  </Button>
                </div>

                {/* Show detailed preview of all audiences before applying */}
                <AudienceRecommendationPreview recommendations={recommendations} />

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




        {/* Applied Audiences (from Brief) */}
        {parsedTargetingLocal && parsedTargetingLocal.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Applied Audiences</h4>
            {parsedTargetingLocal.map((t: any, idx: number) => (
              <div key={idx} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t.market || t.location}</span>
                  <div className="text-xs text-muted-foreground">
                    {t.age?.min && t.age?.max ? `Age: ${t.age.min}-${t.age.max}` : null}
                  </div>
                </div>

                {(() => {
                  console.groupCollapsed(`[Step 3] Market ${t.market || t.location}`);
                  console.table({
                    interests: t.interests?.length || 0,
                    behaviors: t.behaviors?.length || 0,
                    customAudiences: t.customAudiences?.length || 0,
                    lookalikes: t.lookalikes?.length || 0,
                    customerLists: t.customerLists?.length || 0,
                  });
                  console.log('Audience objects', t);
                  console.groupEnd();
                  return null;
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {t.interests?.map((i: any, j: number) => (
                    <AudienceCard key={`i-${j}`} type="interest" name={i.name || i} audienceSize={i.audienceSize} onRemove={() => {}} />
                  ))}
                  {t.behaviors?.map((b: any, j: number) => (
                    <AudienceCard key={`b-${j}`} type="behavior" name={b.name || b} audienceSize={b.audienceSize} onRemove={() => {}} />
                  ))}
                  {t.customAudiences?.map((c: any, j: number) => (
                    <AudienceCard key={`c-${j}`} type="customAudience" name={c.name || c} onRemove={() => {}} />
                  ))}
                  {t.lookalikes?.map((l: any, j: number) => (
                    <AudienceCard key={`l-${j}`} type="lookalike" name={l.name || l} onRemove={() => {}} />
                  ))}
                  {t.customerLists?.map((cl: any, j: number) => (
                    <AudienceCard key={`cl-${j}`} type="customerList" name={cl.name || cl} onRemove={() => {}} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Applied Audiences (from Recommendations) */}
        {(() => {
          const split = (s?: string) => (s ? s.split(',').map(x => x.trim()).filter(Boolean) : []);
          const interestsArr = split(targeting.interests);
          const lookalikesArr = split(targeting.lookalikeAudience);
          const retargetingArr = split(targeting.websiteAudience);
          console.groupCollapsed('[Step 3] Applied from recommendations');
          console.table({ interests: interestsArr.length, lookalikes: lookalikesArr.length, retargeting: retargetingArr.length });
          console.log({ interestsArr, lookalikesArr, retargetingArr, targeting });
          console.groupEnd();
          return null;
        })()}

        {(targeting.interests || targeting.lookalikeAudience || targeting.websiteAudience || targeting.customerList) && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Applied Audiences (from Recommendations)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(targeting.interests || '').split(',').map(s => s.trim()).filter(Boolean).map((name, idx) => (
                <AudienceCard key={`ri-${idx}`} type="interest" name={name} onRemove={() => {
                  const kept = (targeting.interests || '').split(',').map(s => s.trim()).filter(Boolean).filter(n => n !== name);
                  updateField('interests', kept.join(', '));
                }} />
              ))}
              {(targeting.lookalikeAudience || '').split(',').map(s => s.trim()).filter(Boolean).map((name, idx) => (
                <AudienceCard key={`rl-${idx}`} type="lookalike" name={name} onRemove={() => {
                  const kept = (targeting.lookalikeAudience || '').split(',').map(s => s.trim()).filter(Boolean).filter(n => n !== name);
                  updateField('lookalikeAudience', kept.join(', '));
                }} />
              ))}
              {(targeting.websiteAudience || '').split(',').map(s => s.trim()).filter(Boolean).map((name, idx) => (
                <AudienceCard key={`rr-${idx}`} type="customAudience" name={name} onRemove={() => {
                  const kept = (targeting.websiteAudience || '').split(',').map(s => s.trim()).filter(Boolean).filter(n => n !== name);
                  updateField('websiteAudience', kept.join(', '));
                }} />
              ))}
              {(targeting.customerList || '').split(',').map(s => s.trim()).filter(Boolean).map((name, idx) => (
                <AudienceCard key={`rc-${idx}`} type="customerList" name={name} onRemove={() => {
                  const kept = (targeting.customerList || '').split(',').map(s => s.trim()).filter(Boolean).filter(n => n !== name);
                  updateField('customerList', kept.join(', '));
                }} />
              ))}
            </div>
          </div>
        )}

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
