import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, ShieldCheck } from "lucide-react";
import { Phase } from "@/types/mediaplan";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { 
  getValidTikTokLocations, 
  objectiveRequiresLocation,
  autoCorrectTikTokLocation,
  getTikTokSearchModeConfig,
  TikTokLocationConfig
} from "@/utils/tiktokOptimizationLocationMapping";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useSampleMode } from "@/contexts/SampleModeContext";

interface AdAccountDefaults {
  tiktokOptimizationLocation?: string;
  tiktokAppId?: string;
  tiktokAppName?: string;
  tiktokLandingPageUrl?: string;
  tiktokMessagingApp?: string;
  tiktokFacebookPageId?: string;
  tiktokMessageEventSet?: string;
  tiktokWhatsappNumber?: string;
  tiktokZaloAccountId?: string;
  tiktokLineBusinessId?: string;
  tiktokBidStrategy?: string;
  tiktokBidAmount?: number;
  tiktokClickWindow?: number;
  tiktokViewWindow?: number;
  tiktokBillingEvent?: string;
  tiktokPlacementType?: string;
  tiktokPlacements?: string[];
  [key: string]: any;
}

interface TiktokPhaseConfigProps {
  phase: Phase;
  adAccountDefaults?: AdAccountDefaults;
  onUpdate: (field: keyof Phase, value: any) => void;
}

export function TiktokPhaseConfig({ phase, adAccountDefaults, onUpdate }: TiktokPhaseConfigProps) {
  const { hasAccess } = useFeatureAccess();
  const { user } = useAuth();
  const { isSampleMode } = useSampleMode();
  const canInheritDefaults = hasAccess('bid_strategy_defaults');
  const selectPlaceholder = canInheritDefaults ? "Inherit from defaults" : "Select...";
  
  // Catalog & Product Set data from DB
  const [tiktokCatalogs, setTiktokCatalogs] = useState<Array<{ catalog_id: string; catalog_name?: string }>>([]);
  const [tiktokProductSets, setTiktokProductSets] = useState<Array<{ product_set_id: string; product_set_name: string; catalog_id: string }>>([]);
  
  // Load TikTok catalogs and product sets
  useEffect(() => {
    if (!user?.id) return;
    
    const loadData = async () => {
      const [catalogsRes, productSetsRes] = await Promise.all([
        supabase.from("tiktok_catalogs" as any).select("catalog_id, catalog_name").eq("user_id", user.id),
        supabase.from("tiktok_product_sets" as any).select("product_set_id, product_set_name, catalog_id").eq("user_id", user.id),
      ]);
      
      if (catalogsRes.data) setTiktokCatalogs(catalogsRes.data as any);
      if (productSetsRes.data) setTiktokProductSets(productSetsRes.data as any);
    };
    
    loadData();
  }, [user?.id]);
  
  // Filter product sets by selected catalog
  const filteredTiktokProductSets = useMemo(() => {
    if (!phase.tiktokCatalog) return tiktokProductSets;
    return tiktokProductSets.filter(ps => ps.catalog_id === phase.tiktokCatalog);
  }, [phase.tiktokCatalog, tiktokProductSets]);
  
  // Track if defaults have been applied to prevent infinite loops
  const defaultsAppliedRef = useRef(false);
  
  const [eventCountOptions] = useState<Array<{ value: string; label: string }>>([
    { value: "every_conversion", label: "Every Conversion" },
    { value: "once", label: "Once" }
  ]);

  const [frequencyCapInput, setFrequencyCapInput] = useState<string>(
    phase.tiktokFrequencySchedule?.toString() ?? ""
  );

  useEffect(() => {
    setFrequencyCapInput(phase.tiktokFrequencySchedule?.toString() ?? "");
  }, [phase.tiktokFrequencySchedule]);
  
  // Reset defaults tracking when phase ID changes (new phase)
  useEffect(() => {
    defaultsAppliedRef.current = false;
  }, [phase.id]);

  // Get objective and optimization goal
  const objective = phase.objective || "";
  const optimizationGoal = phase.optimizationGoal || "";
  
  // Calculate valid locations based on objective/optimization goal
  const validLocations = useMemo(() => {
    let locations = getValidTikTokLocations(objective, optimizationGoal);
    
    // Apply search-mode filtering when Search campaign type is active
    if (phase.tiktokCampaignType === 'Search') {
      const searchConfig = getTikTokSearchModeConfig(objective);
      if (searchConfig) {
        locations = locations.filter(loc => searchConfig.allowedLocations.includes(loc.value));
      }
    }
    
    return locations;
  }, [objective, optimizationGoal, phase.tiktokCampaignType]);
  
  // Determine if optimization location is needed
  const showOptimizationLocation = useMemo(() => {
    return objectiveRequiresLocation(objective) && validLocations.length > 0;
  }, [objective, validLocations]);

  // Keep optimization location in sync with objective/goal/search restrictions
  useEffect(() => {
    const correctedLocation = autoCorrectTikTokLocation(
      objective,
      optimizationGoal,
      phase.tiktokOptimizationLocation
    );

    if (correctedLocation !== phase.tiktokOptimizationLocation) {
      onUpdate("tiktokOptimizationLocation", correctedLocation ?? undefined);
    }
  }, [
    objective,
    optimizationGoal,
    phase.tiktokCampaignType,
    phase.tiktokOptimizationLocation,
    onUpdate,
  ]);

  // Auto-populate from defaults when fields are empty, respecting location validity - only for enterprise+ users
  // This effect runs only ONCE per phase to prevent infinite loops
  useEffect(() => {
    // Skip if defaults already applied for this phase
    if (defaultsAppliedRef.current) return;
    
    if (!adAccountDefaults) return;
    
    // Skip auto-population for non-enterprise users
    if (!canInheritDefaults) {
      defaultsAppliedRef.current = true; // Mark as done even if we skip
      return;
    }
    
    // Mark defaults as applied BEFORE making updates to prevent re-runs
    defaultsAppliedRef.current = true;
    
    // Only auto-populate optimization location if:
    // 1. Field is not already set
    // 2. Location is required for this objective
    // 3. The default location is valid for this objective/goal combination
    if (!phase.tiktokOptimizationLocation && adAccountDefaults.tiktokOptimizationLocation && showOptimizationLocation) {
      const correctedLocation = autoCorrectTikTokLocation(
        objective,
        optimizationGoal,
        adAccountDefaults.tiktokOptimizationLocation
      );
      if (correctedLocation) {
        onUpdate("tiktokOptimizationLocation", correctedLocation);
      }
    }
    
    // Clear optimization location if objective doesn't support it
    if (phase.tiktokOptimizationLocation && !showOptimizationLocation) {
      onUpdate("tiktokOptimizationLocation", undefined);
    }
    
    if (!phase.tiktokBidStrategy && adAccountDefaults.tiktokBidStrategy) {
      onUpdate("tiktokBidStrategy", adAccountDefaults.tiktokBidStrategy);
    }
    if (!phase.tiktokPlacementType && adAccountDefaults.tiktokPlacementType) {
      onUpdate("tiktokPlacementType", adAccountDefaults.tiktokPlacementType);
    }
    if (!phase.tiktokPlacements && adAccountDefaults.tiktokPlacements) {
      onUpdate("tiktokPlacements", adAccountDefaults.tiktokPlacements);
    }
    if (!phase.tiktokClickWindow && adAccountDefaults.tiktokClickWindow) {
      onUpdate("tiktokClickWindow", adAccountDefaults.tiktokClickWindow);
    }
    if (!phase.tiktokViewWindow && adAccountDefaults.tiktokViewWindow) {
      onUpdate("tiktokViewWindow", adAccountDefaults.tiktokViewWindow);
    }
    if (!phase.tiktokBillingEvent && adAccountDefaults.tiktokBillingEvent) {
      onUpdate("tiktokBillingEvent", adAccountDefaults.tiktokBillingEvent);
    }
    if (!phase.tiktokAppId && adAccountDefaults.tiktokAppId) {
      onUpdate("tiktokAppId", adAccountDefaults.tiktokAppId);
    }
    if (!phase.tiktokAppName && adAccountDefaults.tiktokAppName) {
      onUpdate("tiktokAppName", adAccountDefaults.tiktokAppName);
    }
    // Auto-populate optimization location sub-fields from defaults
    if (!phase.tiktokLandingPageUrl && adAccountDefaults.tiktokLandingPageUrl) {
      onUpdate("tiktokLandingPageUrl", adAccountDefaults.tiktokLandingPageUrl);
    }
    if (!phase.tiktokMessagingApp && adAccountDefaults.tiktokMessagingApp) {
      onUpdate("tiktokMessagingApp", adAccountDefaults.tiktokMessagingApp);
    }
    if (!phase.tiktokFacebookPageId && adAccountDefaults.tiktokFacebookPageId) {
      onUpdate("tiktokFacebookPageId", adAccountDefaults.tiktokFacebookPageId);
    }
    if (!phase.tiktokMessageEventSet && adAccountDefaults.tiktokMessageEventSet) {
      onUpdate("tiktokMessageEventSet", adAccountDefaults.tiktokMessageEventSet);
    }
    if (!phase.tiktokWhatsappNumber && adAccountDefaults.tiktokWhatsappNumber) {
      onUpdate("tiktokWhatsappNumber", adAccountDefaults.tiktokWhatsappNumber);
    }
    if (!phase.tiktokZaloAccountId && adAccountDefaults.tiktokZaloAccountId) {
      onUpdate("tiktokZaloAccountId", adAccountDefaults.tiktokZaloAccountId);
    }
    if (!phase.tiktokLineBusinessId && adAccountDefaults.tiktokLineBusinessId) {
      onUpdate("tiktokLineBusinessId", adAccountDefaults.tiktokLineBusinessId);
    }
  }, [adAccountDefaults, phase.id, objective, optimizationGoal, showOptimizationLocation, canInheritDefaults]);

  // DEBUG logging removed to prevent console spam during renders

  const showAppFields = (
    (objective === "TRAFFIC" && optimizationGoal === "CLICK" && phase.tiktokOptimizationLocation === "App") ||
    (objective === "APP_PROMOTION") ||
    (objective === "LEAD_GENERATION" && ["CLICK", "MESSAGING"].includes(optimizationGoal) && phase.tiktokOptimizationLocation === "Instant Messaging Apps") ||
    (objective === "CONVERSIONS" && optimizationGoal === "CLICK" && phase.tiktokOptimizationLocation === "App") ||
    (objective === "CONVERSIONS" && ["CONVERT", "VALUE"].includes(optimizationGoal) && phase.tiktokOptimizationLocation === "Website & App")
  );

  const showBidStrategy = true; // Always shown based on matrix

  const showBidAmount = (phase.tiktokBidStrategy === 'COST_CAP' || phase.tiktokBidStrategy === 'TARGET_COST');

  const showAttributionWindows = (
    (objective === "LEAD_GENERATION" && ["CONVERT", "MESSAGING"].includes(optimizationGoal)) ||
    (objective === "CONVERSIONS" && ["VALUE", "CONVERT"].includes(optimizationGoal) && ["Website", "TikTok Instant Page", "Website & App"].includes(phase.tiktokOptimizationLocation || ""))
  );

  const showEventCount = (
    (objective === "LEAD_GENERATION") ||
    (objective === "CONVERSIONS" && optimizationGoal === "CLICK" && phase.tiktokOptimizationLocation === "App") ||
    (objective === "CONVERSIONS" && ["CONVERT", "VALUE"].includes(optimizationGoal) && phase.tiktokOptimizationLocation === "Website & App")
  );

  const showCatalogProductSet = (
    objective === "CONVERSIONS" && ["CONVERT", "VALUE"].includes(optimizationGoal) && phase.tiktokOptimizationLocation === "Website & App"
  );

  const showSmartPlus = ![
    "REACH", "VIDEO_VIEWS", "COMMUNITY_INTERACTION"
  ].includes(objective.toUpperCase());
  
  // Check if it's REACH optimization goal for frequency capping
  const isReachOptimizationGoal = optimizationGoal.toUpperCase() === "REACH";
  
  // For REACH optimization goal, show frequency capping only (placements auto-configured)
  if (isReachOptimizationGoal) {
    console.log("✅ Rendering REACH frequency cap field only (placements auto-configured)");
    return (
      <fieldset disabled={isSampleMode} className={`space-y-4 ${isSampleMode ? "opacity-90 [&_*]:cursor-not-allowed" : ""}`}>
        <div className="space-y-2">
          <Label>Frequency Cap (impressions per 7 days)</Label>
          <Input
            type="number"
            placeholder="e.g., 3"
            value={frequencyCapInput}
            onChange={(e) => {
              const inputValue = e.target.value;
              setFrequencyCapInput(inputValue);
              
              if (inputValue === "") {
                onUpdate("tiktokFrequencySchedule", undefined);
              } else {
                const numValue = parseInt(inputValue, 10);
                if (!isNaN(numValue) && numValue > 0) {
                  onUpdate("tiktokFrequencySchedule", numValue);
                }
              }
            }}
            min="1"
          />
          <p className="text-xs text-muted-foreground">
            Limit how many times users see your ad
          </p>
        </div>

        {/* Placement info for REACH - auto-configured, not editable */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Placements:</strong> TikTok REACH campaigns are automatically configured to use TikTok placement only. Other placements (Pangle, Global App Bundle) are not available for this objective.
          </AlertDescription>
        </Alert>
      </fieldset>
    );
  }
  
  return (
    <Card>
      <fieldset disabled={isSampleMode} className={isSampleMode ? "opacity-90 [&_*]:cursor-not-allowed" : ""}>
      <CardHeader>
        <CardTitle className="text-base">TikTok Advanced Settings</CardTitle>
        <CardDescription className="text-sm">
          {isSampleMode ? "Sample tour data — fields are read-only" : "Configure TikTok-specific campaign parameters"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Optimization Location */}
        {showOptimizationLocation && validLocations.length > 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Optimization Location</Label>
              <Select
                value={phase.tiktokOptimizationLocation || undefined}
                onValueChange={(value) => onUpdate("tiktokOptimizationLocation", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {validLocations.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Available locations depend on your objective and optimization goal
              </p>
            </div>

            {/* Website sub-fields */}
            {phase.tiktokOptimizationLocation === "Website" && (
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label>Landing Page URL</Label>
                  <Input
                    placeholder="https://example.com/landing-page"
                    value={phase.tiktokLandingPageUrl || ""}
                    onChange={(e) => onUpdate("tiktokLandingPageUrl", e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* App sub-fields */}
            {phase.tiktokOptimizationLocation === "App" && (
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label>App</Label>
                  {adAccountDefaults?.tiktokAppId ? (
                    <Select
                      value={phase.tiktokAppId || adAccountDefaults.tiktokAppId || undefined}
                      onValueChange={(value) => {
                        onUpdate("tiktokAppId", value);
                        // Also set the app name if available from defaults
                        if (value === adAccountDefaults.tiktokAppId && adAccountDefaults.tiktokAppName) {
                          onUpdate("tiktokAppName", adAccountDefaults.tiktokAppName);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select app" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={adAccountDefaults.tiktokAppId}>
                          {adAccountDefaults.tiktokAppName || adAccountDefaults.tiktokAppId}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="No app configured"
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        Configure in Client Defaults
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TikTok Instant Page sub-fields */}
            {phase.tiktokOptimizationLocation === "TikTok Instant Page" && (
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label>TikTok Instant Page URL</Label>
                  <Input
                    placeholder="TikTok Instant Page URL"
                    value={phase.tiktokLandingPageUrl || ""}
                    onChange={(e) => onUpdate("tiktokLandingPageUrl", e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* TikTok Shop sub-fields */}
            {phase.tiktokOptimizationLocation === "TikTok Shop" && (
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    TikTok Shop campaigns use your linked TikTok Shop account.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* TikTok Direct Messages sub-fields */}
            {phase.tiktokOptimizationLocation === "TikTok Direct Messages" && (
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label>TikTok Identity ID</Label>
                  <Input
                    placeholder="Identity ID for messaging"
                    value={phase.tiktokIdentityId || ""}
                    onChange={(e) => onUpdate("tiktokIdentityId", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The TikTok identity to receive direct messages
                  </p>
                </div>
              </div>
            )}

            {/* Instant Messaging Apps sub-fields */}
            {phase.tiktokOptimizationLocation === "Instant Messaging Apps" && (
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label>Messaging App</Label>
                  <Select
                    value={phase.tiktokMessagingApp || undefined}
                    onValueChange={(value) => onUpdate("tiktokMessagingApp", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select messaging app" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                      <SelectItem value="MESSENGER">Facebook Messenger</SelectItem>
                      <SelectItem value="LINE">LINE</SelectItem>
                      <SelectItem value="ZALO">Zalo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* WhatsApp fields */}
                {phase.tiktokMessagingApp === "WHATSAPP" && (
                  <div className="space-y-2">
                    <Label>WhatsApp Business Number</Label>
                    <Input
                      placeholder="+1234567890"
                      value={phase.tiktokWhatsappNumber || ""}
                      onChange={(e) => onUpdate("tiktokWhatsappNumber", e.target.value)}
                    />
                  </div>
                )}

                {/* Messenger fields */}
                {phase.tiktokMessagingApp === "MESSENGER" && (
                  <div className="space-y-2">
                    <Label>Facebook Page ID</Label>
                    <Input
                      placeholder="Facebook Page ID"
                      value={phase.tiktokFacebookPageId || ""}
                      onChange={(e) => onUpdate("tiktokFacebookPageId", e.target.value)}
                    />
                  </div>
                )}

                {/* LINE fields */}
                {phase.tiktokMessagingApp === "LINE" && (
                  <div className="space-y-2">
                    <Label>LINE Business ID</Label>
                    <Input
                      placeholder="LINE Business Account ID"
                      value={phase.tiktokLineBusinessId || ""}
                      onChange={(e) => onUpdate("tiktokLineBusinessId", e.target.value)}
                    />
                  </div>
                )}

                {/* Zalo fields */}
                {phase.tiktokMessagingApp === "ZALO" && (
                  <div className="space-y-2">
                    <Label>Zalo Account ID</Label>
                    <Input
                      placeholder="Zalo Account ID"
                      value={phase.tiktokZaloAccountId || ""}
                      onChange={(e) => onUpdate("tiktokZaloAccountId", e.target.value)}
                    />
                  </div>
                )}

                {/* Message Event Set - shown for all messaging apps */}
                <div className="space-y-2">
                  <Label>Message Event Set (Optional)</Label>
                  <Input
                    placeholder="Message Event Set ID"
                    value={phase.tiktokMessageEventSet || ""}
                    onChange={(e) => onUpdate("tiktokMessageEventSet", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    For tracking messaging conversions
                  </p>
                </div>
              </div>
            )}

            {/* Phone Call sub-fields */}
            {phase.tiktokOptimizationLocation === "Phone Call" && (
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    placeholder="+1234567890"
                    value={phase.tiktokPhoneNumber || ""}
                    onChange={(e) => onUpdate("tiktokPhoneNumber", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The phone number users will call
                  </p>
                </div>
              </div>
            )}

            {/* Instant Form sub-fields */}
            {phase.tiktokOptimizationLocation === "Instant Form" && (
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Instant Forms are created and managed in TikTok Ads Manager. You'll select or create a form during ad creative setup.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Website & App sub-fields */}
            {phase.tiktokOptimizationLocation === "Website & App" && (
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label>Landing Page URL</Label>
                  <Input
                    placeholder="https://example.com/landing-page"
                    value={phase.tiktokLandingPageUrl || ""}
                    onChange={(e) => onUpdate("tiktokLandingPageUrl", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>App</Label>
                  {adAccountDefaults?.tiktokAppId ? (
                    <Select
                      value={phase.tiktokAppId || adAccountDefaults.tiktokAppId || undefined}
                      onValueChange={(value) => {
                        onUpdate("tiktokAppId", value);
                        if (value === adAccountDefaults.tiktokAppId && adAccountDefaults.tiktokAppName) {
                          onUpdate("tiktokAppName", adAccountDefaults.tiktokAppName);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select app" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={adAccountDefaults.tiktokAppId}>
                          {adAccountDefaults.tiktokAppName || adAccountDefaults.tiktokAppId}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="No app configured"
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        Configure in Client Defaults
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Show message when no location is needed */}
        {!showOptimizationLocation && objective && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Optimization Location:</strong> Not applicable for {objective} objective. Optimizations occur on the ad itself.
            </AlertDescription>
          </Alert>
        )}

        {/* App Fields - for APP_PROMOTION objective */}
        {showAppFields && (
          <div className="space-y-2">
            <Label>App</Label>
            {adAccountDefaults?.tiktokAppId ? (
              <Select
                value={phase.tiktokAppId || adAccountDefaults.tiktokAppId || undefined}
                onValueChange={(value) => {
                  onUpdate("tiktokAppId", value);
                  if (value === adAccountDefaults.tiktokAppId && adAccountDefaults.tiktokAppName) {
                    onUpdate("tiktokAppName", adAccountDefaults.tiktokAppName);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select app" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={adAccountDefaults.tiktokAppId}>
                    {adAccountDefaults.tiktokAppName || adAccountDefaults.tiktokAppId}
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="No app configured"
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                  Configure in Client Defaults
                </p>
              </div>
            )}
          </div>
        )}

        {/* Bid Strategy */}
        {showBidStrategy && (
          <div className="space-y-2">
            <Label>Bid Strategy</Label>
            <Select
              value={phase.tiktokBidStrategy || undefined}
              onValueChange={(value) => onUpdate("tiktokBidStrategy", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={selectPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOWEST_COST">Maximum Delivery (Automatic)</SelectItem>
                <SelectItem value="COST_CAP">Cost Cap (Requires bid amount)</SelectItem>
                <SelectItem value="TARGET_COST">Target Cost Per Result</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Bid Amount */}
        {showBidAmount && (
          <div className="space-y-2">
            <Label>Bid Amount (€)</Label>
            <Input
              type="number"
              placeholder="e.g., 10.00"
              value={phase.tiktokBidAmount || ""}
              onChange={(e) => onUpdate("tiktokBidAmount", parseFloat(e.target.value) || undefined)}
              min="1"
              step="0.01"
            />
            <p className="text-xs text-muted-foreground">
              Minimum €10 for CPC, €5 for CPM, €1 for OCPM
            </p>
          </div>
        )}

        {/* Attribution Windows */}
        {showAttributionWindows && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Click-Through Window (days)</Label>
              <Select
                value={phase.tiktokClickWindow?.toString() || undefined}
                onValueChange={(value) => onUpdate("tiktokClickWindow", parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="28">28 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>View-Through Window (days)</Label>
              <Select
                value={phase.tiktokViewWindow?.toString() || undefined}
                onValueChange={(value) => onUpdate("tiktokViewWindow", parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Billing Event */}
        <div className="space-y-2">
          <Label>Billing Event</Label>
          <Select
            value={phase.tiktokBillingEvent || undefined}
            onValueChange={(value) => onUpdate("tiktokBillingEvent", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={selectPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OCPM">OCPM (Optimized Cost Per Mille)</SelectItem>
              <SelectItem value="CPC">CPC (Cost Per Click)</SelectItem>
              <SelectItem value="CPV">CPV (Cost Per View)</SelectItem>
              <SelectItem value="CPM">CPM (Cost Per Mille)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            OCPM for conversions, CPC for traffic/click goals, CPV for video views
          </p>
        </div>

        {/* Event Count */}
        {showEventCount && (
          <div className="space-y-2">
            <Label>Event Count</Label>
            <Select
              value={phase.tiktokEventCount || undefined}
              onValueChange={(value) => onUpdate("tiktokEventCount", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select event count type" />
              </SelectTrigger>
              <SelectContent>
                {eventCountOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Track every conversion or once per user
            </p>
          </div>
        )}

        {/* Catalog & Product Set */}
        {showCatalogProductSet && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Catalog</Label>
              {tiktokCatalogs.length > 0 ? (
                <Select
                  value={phase.tiktokCatalog || undefined}
                  onValueChange={(value) => {
                    onUpdate("tiktokCatalog", value);
                    onUpdate("tiktokProductSet", undefined);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select catalog" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiktokCatalogs.map((c) => (
                      <SelectItem key={c.catalog_id} value={c.catalog_id}>
                        {c.catalog_name || c.catalog_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="No catalogs synced" disabled className="bg-muted" />
              )}
            </div>

            <div className="space-y-2">
              <Label>Product Set</Label>
              {filteredTiktokProductSets.length > 0 ? (
                <Select
                  value={phase.tiktokProductSet || undefined}
                  onValueChange={(value) => onUpdate("tiktokProductSet", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product set" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTiktokProductSets.map((ps) => (
                      <SelectItem key={ps.product_set_id} value={ps.product_set_id}>
                        {ps.product_set_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder={phase.tiktokCatalog ? "No product sets" : "Select catalog first"} disabled className="bg-muted" />
              )}
            </div>
          </div>
        )}

        {/* Smart+ Campaigns */}
        {showSmartPlus && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Smart+ Campaign</Label>
              <Select
                value={phase.tiktokSmartPlusEnabled ? "true" : "false"}
                onValueChange={(value) => {
                  const enabled = value === "true";
                  onUpdate("tiktokSmartPlusEnabled", enabled);
                  // When Smart+ is enabled, auto-enable related features
                  if (enabled) {
                    onUpdate("tiktokSmartCreativeEnabled", true);
                    onUpdate("tiktokAutoTargetingEnabled", true);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Manual Campaign</SelectItem>
                  <SelectItem value="true">Smart+ Campaign</SelectItem>
                </SelectContent>
              </Select>
              {phase.tiktokSmartPlusEnabled && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Smart+ Performance Campaign uses a separate API:</strong>
                    <ul className="mt-1 ml-4 list-disc space-y-1">
                      <li>Automatic placements across TikTok network</li>
                      <li>AI-powered audience targeting</li>
                      <li>Automatic creative optimization</li>
                      <li>Targeting & placements are auto-managed by TikTok</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Smart Creative Optimization - shown even when Smart+ is off */}
            <div className="space-y-2">
              <Label>Smart Creative Optimization</Label>
              <Select
                value={phase.tiktokSmartCreativeEnabled ? "true" : "false"}
                onValueChange={(value) => onUpdate("tiktokSmartCreativeEnabled", value === "true")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Standard Creative</SelectItem>
                  <SelectItem value="true">Smart Creative (AI-optimized)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                TikTok automatically optimizes creative elements per viewer
              </p>
            </div>

            {/* Auto-Targeting - shown even when Smart+ is off */}
            <div className="space-y-2">
              <Label>Auto-Targeting</Label>
              <Select
                value={phase.tiktokAutoTargetingEnabled ? "true" : "false"}
                onValueChange={(value) => onUpdate("tiktokAutoTargetingEnabled", value === "true")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Manual Targeting</SelectItem>
                  <SelectItem value="true">Auto-Targeting (AI-managed)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Let TikTok automatically find the best audience for your ads
              </p>
            </div>
          </div>
        )}

        {/* Auto-Targeting Alert */}
        {phase.tiktokAutoTargetingEnabled && (
          <Alert className="border-primary/30 bg-primary/5">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <AlertDescription className="text-xs">
              <strong>Auto-Targeting is active.</strong> Audience targeting is fully managed by TikTok AI. Manual audience selections will be ignored.
            </AlertDescription>
          </Alert>
        )}

        {/* Placement Type - hidden when Smart+ is enabled (auto-managed) */}
        {!phase.tiktokSmartPlusEnabled && (
          <>
            <div className="space-y-2">
              <Label>Placement Type</Label>
              <Select
                value={phase.tiktokPlacementType || "PLACEMENT_TYPE_AUTOMATIC"}
                onValueChange={(value) => {
                  onUpdate("tiktokPlacementType", value);
                  // Select all placements when switching to automatic
                  if (value === "PLACEMENT_TYPE_AUTOMATIC") {
                    onUpdate("tiktokPlacements", ["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"]);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLACEMENT_TYPE_AUTOMATIC">Automatic Placement</SelectItem>
                  <SelectItem value="PLACEMENT_TYPE_NORMAL">Manual Placement</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Automatic lets TikTok optimize. Manual lets you select specific positions.
              </p>
            </div>

            {/* Manual Placements - Only show when manual placement is selected */}
            {phase.tiktokPlacementType === "PLACEMENT_TYPE_NORMAL" && (
              <div className="space-y-2">
                <Label>Placements</Label>
                <div className="space-y-2">
                  {[
                    { value: "PLACEMENT_TIKTOK", label: "TikTok" },
                    { value: "PLACEMENT_GLOBAL_APP_BUNDLE", label: "Global App Bundle" },
                    { value: "PLACEMENT_PANGLE", label: "Pangle" },
                  ].map((placement) => (
                    <label key={placement.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(phase.tiktokPlacements || ["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"]).includes(placement.value)}
                        onChange={(e) => {
                          const currentPlacements = phase.tiktokPlacements || ["PLACEMENT_TIKTOK", "PLACEMENT_GLOBAL_APP_BUNDLE", "PLACEMENT_PANGLE"];
                          if (e.target.checked) {
                            onUpdate("tiktokPlacements", [...currentPlacements, placement.value]);
                          } else {
                            const filtered = currentPlacements.filter(p => p !== placement.value);
                            // Ensure at least one placement is selected
                            onUpdate("tiktokPlacements", filtered.length > 0 ? filtered : ["PLACEMENT_TIKTOK"]);
                          }
                        }}
                        className="rounded border-input"
                      />
                      <span className="text-sm">{placement.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  TikTok: Main feed. Global App Bundle: Partner apps. Pangle: Audience network.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
      </fieldset>
    </Card>
  );
}
