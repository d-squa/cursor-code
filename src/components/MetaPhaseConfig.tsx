import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Phase } from "@/types/mediaplan";
import { useEffect } from "react";

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
  // Auto-populate from defaults when fields are empty
  useEffect(() => {
    if (!adAccountDefaults) return;
    
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
  }, [adAccountDefaults, phase.id]);

  const objective = phase.objective || "";
  const optimizationGoal = phase.optimizationGoal || "";

  // Show bid amount only when bid cap is required
  const showBidAmount = phase.metaBidStrategy === 'LOWEST_COST_WITH_BID_CAP' || phase.metaBidStrategy === 'COST_CAP';

  // Show attribution windows for conversion-based campaigns
  const showAttributionWindows = [
    "OUTCOME_LEADS",
    "OUTCOME_SALES", 
    "CONVERSIONS",
    "OFFSITE_CONVERSIONS",
    "LEAD_GENERATION"
  ].includes(objective.toUpperCase()) || [
    "OFFSITE_CONVERSIONS",
    "LANDING_PAGE_VIEWS",
    "LINK_CLICKS",
    "VALUE"
  ].includes(optimizationGoal.toUpperCase());

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
            <Label>Advantage+ Campaign</Label>
            <Select
              value={phase.metaAdvantagePlusCampaign ? "true" : "false"}
              onValueChange={(value) => onUpdate("metaAdvantagePlusCampaign", value === "true")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Manual Campaign</SelectItem>
                <SelectItem value="true">Advantage+ Campaign</SelectItem>
              </SelectContent>
            </Select>
            {phase.metaAdvantagePlusCampaign && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Advantage+ automatically enables:</strong>
                  <ul className="mt-1 ml-4 list-disc space-y-1">
                    <li>Automatic placements across Meta network</li>
                    <li>AI-powered audience targeting</li>
                    <li>Automatic creative optimization</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}
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
              <SelectValue placeholder="Inherit from defaults" />
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

        {/* Attribution Windows */}
        {showAttributionWindows && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Click-Through Window (days)</Label>
              <Select
                value={phase.metaClickWindow?.toString() || undefined}
                onValueChange={(value) => onUpdate("metaClickWindow", parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Inherit from defaults" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="28">28 days</SelectItem>
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
                  <SelectValue placeholder="Inherit from defaults" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                </SelectContent>
              </Select>
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
          >
            <SelectTrigger>
              <SelectValue placeholder="Inherit from defaults" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="IMPRESSIONS">Impressions (CPM)</SelectItem>
              <SelectItem value="LINK_CLICKS">Link Clicks (CPC)</SelectItem>
              <SelectItem value="POST_ENGAGEMENT">Post Engagement</SelectItem>
              <SelectItem value="THRUPLAY">ThruPlay (Video)</SelectItem>
              <SelectItem value="PAGE_LIKES">Page Likes</SelectItem>
              <SelectItem value="APP_INSTALLS">App Installs</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
