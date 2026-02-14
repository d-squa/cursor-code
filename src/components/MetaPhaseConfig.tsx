import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Phase } from "@/types/mediaplan";
import { useEffect, useMemo, useRef } from "react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { getOptimizationGoalsForObjective, getBillingEventForGoal } from "@/utils/objectiveOptimizationMapping";

interface AdAccountDefaults {
  metaBidStrategy?: string;
  metaBidAmount?: number;
  metaClickWindow?: number;
  metaViewWindow?: number;
  metaBillingEvent?: string;
  metaAdvantagePlusCampaign?: boolean;
  [key: string]: any;
}

interface MetaPhaseConfigProps {
  phase: Phase;
  adAccountDefaults?: AdAccountDefaults;
  onUpdate: (field: keyof Phase, value: any) => void;
}

export function MetaPhaseConfig({ phase, adAccountDefaults, onUpdate }: MetaPhaseConfigProps) {
  const { hasAccess } = useFeatureAccess();
  const canInheritDefaults = hasAccess('bid_strategy_defaults');
  
  // Track if defaults have been applied to prevent infinite loops
  const defaultsAppliedRef = useRef(false);
  
  // Reset defaults tracking when phase ID changes (new phase)
  useEffect(() => {
    defaultsAppliedRef.current = false;
  }, [phase.id]);
  
  // Auto-populate from defaults when fields are empty - only for enterprise+ users
  useEffect(() => {
    // Skip if defaults already applied for this phase
    if (defaultsAppliedRef.current) return;
    
    if (!adAccountDefaults || !canInheritDefaults) {
      defaultsAppliedRef.current = true;
      return;
    }
    
    // Mark defaults as applied BEFORE making updates to prevent re-runs
    defaultsAppliedRef.current = true;
    
    // Only auto-populate if field is not already set
    if (!phase.metaBidStrategy && adAccountDefaults.metaBidStrategy) {
      onUpdate("metaBidStrategy", adAccountDefaults.metaBidStrategy);
    }
    if (!phase.metaClickWindow && adAccountDefaults.metaClickWindow) {
      onUpdate("metaClickWindow", adAccountDefaults.metaClickWindow);
    }
    if (!phase.metaViewWindow && adAccountDefaults.metaViewWindow) {
      onUpdate("metaViewWindow", adAccountDefaults.metaViewWindow);
    }
    if (!phase.metaBillingEvent && adAccountDefaults.metaBillingEvent) {
      onUpdate("metaBillingEvent", adAccountDefaults.metaBillingEvent);
    }
  }, [adAccountDefaults, phase.id, canInheritDefaults]);
  
  const selectPlaceholder = canInheritDefaults ? "Inherit from defaults" : "Select...";

  const objective = phase.objective || "";
  const optimizationGoal = phase.optimizationGoal || "";

  // Get valid billing events for the selected optimization goal
  const validBillingEvents = useMemo(() => {
    if (!objective || !optimizationGoal) return [];
    
    const billingEvent = getBillingEventForGoal("meta", objective, optimizationGoal);
    
    // Map billing event to available options
    // Most optimization goals use IMPRESSIONS, but some have specific billing events
    const billingEventOptions: { value: string; label: string }[] = [];
    
    if (billingEvent) {
      // Add the specific billing event for this goal
      const labelMap: Record<string, string> = {
        IMPRESSIONS: "Impressions (CPM)",
        LINK_CLICKS: "Link Clicks (CPC)",
        POST_ENGAGEMENT: "Post Engagement",
        THRUPLAY: "ThruPlay (Video)",
        PAGE_LIKES: "Page Likes",
        EVENT_RESPONSES: "Event Responses",
        APP_INSTALLS: "App Installs",
      };
      
      billingEventOptions.push({
        value: billingEvent,
        label: labelMap[billingEvent] || billingEvent
      });
      
      // IMPRESSIONS is always a fallback option for most goals
      if (billingEvent !== "IMPRESSIONS") {
        billingEventOptions.push({
          value: "IMPRESSIONS",
          label: "Impressions (CPM)"
        });
      }
    }
    
    return billingEventOptions;
  }, [objective, optimizationGoal]);

  // Auto-set billing event when optimization goal changes
  useEffect(() => {
    if (!objective || !optimizationGoal) return;
    
    const recommendedBillingEvent = getBillingEventForGoal("meta", objective, optimizationGoal);
    
    // Only auto-set if current billing event is invalid or not set
    if (recommendedBillingEvent) {
      const isCurrentValid = validBillingEvents.some(be => be.value === phase.metaBillingEvent);
      if (!phase.metaBillingEvent || !isCurrentValid) {
        onUpdate("metaBillingEvent", recommendedBillingEvent);
      }
    }
  }, [objective, optimizationGoal, validBillingEvents]);

  // Show bid amount only when bid cap is required
  const showBidAmount = phase.metaBidStrategy === 'LOWEST_COST_WITH_BID_CAP' || phase.metaBidStrategy === 'COST_CAP';

  // Show attribution windows ONLY for true conversion campaigns
  // Meta only supports extended attribution for OUTCOME_SALES with OFFSITE_CONVERSIONS or VALUE optimization
  // All other objectives only support (1, 0) which is auto-applied - no need to show UI
  const isConversionObjective = [
    "OUTCOME_SALES", 
    "CONVERSIONS",
  ].includes(objective.toUpperCase());
  
  const isConversionGoal = [
    "OFFSITE_CONVERSIONS",
    "VALUE"
  ].includes(optimizationGoal.toUpperCase());
  
  const showAttributionWindows = isConversionObjective && isConversionGoal;

  // Show conversion count for conversion-based campaigns
  const showConversionCount = [
    "OUTCOME_LEADS",
    "OUTCOME_SALES",
    "CONVERSIONS"
  ].includes(objective.toUpperCase());

  // Show Advantage+ campaign option (not for Reach/Brand Awareness)
  const showAdvantagePlus = ![
    "OUTCOME_AWARENESS",
    "REACH",
    "BRAND_AWARENESS"
  ].includes(objective.toUpperCase());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Meta Advanced Settings</CardTitle>
        <CardDescription className="text-sm">Configure Meta-specific campaign parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Advantage+ Campaign */}
        {showAdvantagePlus && (
          <div className="space-y-2">
            <Label>Advantage+ Shopping Campaign</Label>
            <Select
              value={phase.metaAdvantagePlusCampaign ? "true" : "false"}
              onValueChange={(value) => {
                const enabled = value === "true";
                onUpdate("metaAdvantagePlusCampaign", enabled);
                // When Advantage+ Shopping is enabled, auto-enable related features
                if (enabled) {
                  onUpdate("metaAdvantagePlusAudience", true);
                  onUpdate("metaAdvantagePlusCreative", true);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Manual Campaign</SelectItem>
                <SelectItem value="true">Advantage+ Shopping Campaign</SelectItem>
              </SelectContent>
            </Select>
            {phase.metaAdvantagePlusCampaign && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Advantage+ Shopping Campaign enables:</strong>
                  <ul className="mt-1 ml-4 list-disc space-y-1">
                    <li>Automated audience targeting across the funnel</li>
                    <li>AI-powered creative optimization</li>
                    <li>Automatic placements across Meta network</li>
                    <li>Requires <strong>OUTCOME_SALES</strong> objective</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Advantage+ Audience */}
        <div className="space-y-2">
          <Label>Advantage+ Audience</Label>
          <Select
            value={phase.metaAdvantagePlusAudience ? "true" : "false"}
            onValueChange={(value) => onUpdate("metaAdvantagePlusAudience", value === "true")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="false">Manual Audience Targeting</SelectItem>
              <SelectItem value="true">Advantage+ Audience (Recommended)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Advantage+ Audience uses AI to find people most likely to convert, expanding beyond your targeting selections as suggestions
          </p>
        </div>

        {/* Advantage+ Creative */}
        <div className="space-y-2">
          <Label>Advantage+ Creative</Label>
          <Select
            value={phase.metaAdvantagePlusCreative ? "true" : "false"}
            onValueChange={(value) => onUpdate("metaAdvantagePlusCreative", value === "true")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="false">Standard Creative</SelectItem>
              <SelectItem value="true">Advantage+ Creative Optimization</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Automatically optimizes creative elements (brightness, contrast, aspect ratio) per viewer
          </p>
        </div>

        {/* Catalog & Product Set - for Advantage+ Shopping */}
        {phase.metaAdvantagePlusCampaign && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Catalog ID</Label>
              <Input
                placeholder="Meta Catalog ID"
                value={phase.metaCatalogId || ""}
                onChange={(e) => onUpdate("metaCatalogId", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Product Set ID</Label>
              <Input
                placeholder="Product Set ID (optional)"
                value={phase.metaProductSetId || ""}
                onChange={(e) => onUpdate("metaProductSetId", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Bid Strategy */}
        <div className="space-y-2">
          <Label>Bid Strategy</Label>
          <Select
            value={phase.metaBidStrategy || undefined}
            onValueChange={(value) => onUpdate("metaBidStrategy", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={selectPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LOWEST_COST_WITHOUT_CAP">Lowest Cost (Automatic)</SelectItem>
              <SelectItem value="LOWEST_COST_WITH_BID_CAP">Lowest Cost with Bid Cap</SelectItem>
              <SelectItem value="COST_CAP">Cost Cap</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bid Amount */}
        {showBidAmount && (
          <div className="space-y-2">
            <Label>Bid Amount (€)</Label>
            <Input
              type="number"
              placeholder="e.g., 10.00"
              value={phase.metaBidAmount || ""}
              onChange={(e) => onUpdate("metaBidAmount", parseFloat(e.target.value) || undefined)}
              min="0.01"
              step="0.01"
            />
            <p className="text-xs text-muted-foreground">
              Maximum bid amount for your selected strategy
            </p>
          </div>
        )}

        {/* Attribution Windows - Only for conversion campaigns */}
        {showAttributionWindows && (
          <div className="space-y-3">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Meta only supports these attribution combinations: (1,0), (1,1), (7,0), (7,1) for click-through and view-through days respectively.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Click-Through Window (days)</Label>
                <Select
                  value={phase.metaClickWindow?.toString() || undefined}
                  onValueChange={(value) => onUpdate("metaClickWindow", parseInt(value))}
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

              <div className="space-y-2">
                <Label>View-Through Window (days)</Label>
                <Select
                  value={phase.metaViewWindow?.toString() || undefined}
                  onValueChange={(value) => onUpdate("metaViewWindow", parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">None (0 days)</SelectItem>
                    <SelectItem value="1">1 day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Conversion Count */}
        {showConversionCount && (
          <div className="space-y-2">
            <Label>Conversion Count</Label>
            <Select
              value={phase.metaConversionCount || undefined}
              onValueChange={(value) => onUpdate("metaConversionCount", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select conversion count type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_conversions">All Conversions</SelectItem>
                <SelectItem value="one_per_click">One per Click</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Count all conversions or one conversion per click
            </p>
          </div>
        )}

        {/* Billing Event */}
        <div className="space-y-2">
          <Label>Billing Event</Label>
          <Select
            value={phase.metaBillingEvent || undefined}
            onValueChange={(value) => onUpdate("metaBillingEvent", value)}
            disabled={validBillingEvents.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={validBillingEvents.length === 0 ? "Select optimization goal first" : selectPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {validBillingEvents.length > 0 ? (
                validBillingEvents.map((be) => (
                  <SelectItem key={be.value} value={be.value}>
                    {be.label}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="IMPRESSIONS">Impressions (CPM)</SelectItem>
              )}
            </SelectContent>
          </Select>
          {validBillingEvents.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Billing events are filtered based on the selected optimization goal
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
