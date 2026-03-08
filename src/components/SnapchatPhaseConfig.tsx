import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Phase } from "@/types/mediaplan";
import { useState, useEffect, useRef } from "react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

interface SnapchatPhaseConfigProps {
  phase: Phase;
  adAccountDefaults?: Record<string, any>;
  onUpdate: (field: keyof Phase, value: any) => void;
}

// Snapchat bid strategies
const SNAPCHAT_BID_STRATEGIES = [
  { value: "AUTO_BID", label: "Auto Bid (Lowest Cost)" },
  { value: "TARGET_COST", label: "Target Cost" },
  { value: "MIN_ROAS", label: "Minimum ROAS" },
  { value: "MAX_BID", label: "Max Bid" },
];

// Snapchat placement options
const SNAPCHAT_PLACEMENTS = [
  { value: "SNAP_ADS", label: "Snap Ads (Between Stories)" },
  { value: "CONTENT", label: "Content (Discover/Shows)" },
  { value: "USER_STORIES", label: "User Stories" },
  { value: "SPOTLIGHT", label: "Spotlight" },
  { value: "CAMERA", label: "Camera (Lenses & Filters)" },
];

// Snapchat optimization goals per objective
const SNAPCHAT_OPTIMIZATION_GOALS: Record<string, { value: string; label: string }[]> = {
  AWARENESS: [
    { value: "IMPRESSIONS", label: "Impressions" },
    { value: "REACH", label: "Reach" },
  ],
  VIDEO_VIEWS: [
    { value: "VIDEO_VIEWS", label: "Video Views (2s)" },
    { value: "VIDEO_VIEWS_15S", label: "Video Views (15s)" },
  ],
  TRAFFIC: [
    { value: "SWIPES", label: "Swipe-Ups" },
    { value: "STORY_OPENS", label: "Story Opens" },
  ],
  ENGAGEMENT: [
    { value: "SWIPES", label: "Swipe-Ups" },
    { value: "SHARES", label: "Shares" },
    { value: "STORY_OPENS", label: "Story Opens" },
  ],
  APP_INSTALLS: [
    { value: "APP_INSTALLS", label: "App Installs" },
    { value: "APP_PURCHASES", label: "App Purchases" },
    { value: "APP_SIGNUPS", label: "App Sign-Ups" },
    { value: "APP_ROAS", label: "App ROAS" },
  ],
  LEAD_GENERATION: [
    { value: "LEAD_FORM_SUBMISSIONS", label: "Lead Form Submissions" },
    { value: "SIGN_UPS", label: "Sign-Ups" },
  ],
  CONVERSIONS: [
    { value: "PIXEL_PURCHASE", label: "Pixel Purchase" },
    { value: "PIXEL_SIGNUP", label: "Pixel Sign-Up" },
    { value: "PIXEL_ADD_TO_CART", label: "Pixel Add to Cart" },
    { value: "PIXEL_PAGE_VIEW", label: "Pixel Page View" },
  ],
  CATALOG_SALES: [
    { value: "CATALOG_SALES", label: "Catalog Sales" },
    { value: "CATALOG_ROAS", label: "Catalog ROAS" },
  ],
};

export function SnapchatPhaseConfig({ phase, adAccountDefaults, onUpdate }: SnapchatPhaseConfigProps) {
  const { hasAccess } = useFeatureAccess();
  const canInheritDefaults = hasAccess("bid_strategy_defaults");
  const selectPlaceholder = canInheritDefaults ? "Inherit from defaults" : "Select...";
  const defaultsAppliedRef = useRef(false);

  const objective = phase.objective || "";

  // Get valid optimization goals for current objective
  const optimizationGoals = SNAPCHAT_OPTIMIZATION_GOALS[objective] || [];

  // Reset defaults tracking when phase changes
  useEffect(() => {
    defaultsAppliedRef.current = false;
  }, [phase.id]);

  // Auto-populate from defaults
  useEffect(() => {
    if (defaultsAppliedRef.current || !adAccountDefaults || !canInheritDefaults) {
      defaultsAppliedRef.current = true;
      return;
    }
    defaultsAppliedRef.current = true;

    if (!phase.snapchatBidStrategy && adAccountDefaults.snapchatBidStrategy) {
      onUpdate("snapchatBidStrategy" as keyof Phase, adAccountDefaults.snapchatBidStrategy);
    }
  }, [adAccountDefaults, phase.id, canInheritDefaults]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Snapchat Advanced Settings</CardTitle>
        <CardDescription className="text-sm">Configure Snapchat-specific campaign parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bid Strategy */}
        <div className="space-y-2">
          <Label>Bid Strategy</Label>
          <Select
            value={(phase as any).snapchatBidStrategy || undefined}
            onValueChange={(value) => onUpdate("snapchatBidStrategy" as keyof Phase, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={selectPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {SNAPCHAT_BID_STRATEGIES.map((strategy) => (
                <SelectItem key={strategy.value} value={strategy.value}>
                  {strategy.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Bid Amount (for Target Cost / Max Bid) */}
        {((phase as any).snapchatBidStrategy === "TARGET_COST" ||
          (phase as any).snapchatBidStrategy === "MAX_BID") && (
          <div className="space-y-2">
            <Label>Bid Amount</Label>
            <Input
              type="number"
              placeholder="e.g., 5.00"
              value={(phase as any).snapchatBidAmount || ""}
              onChange={(e) =>
                onUpdate("snapchatBidAmount" as keyof Phase, parseFloat(e.target.value) || undefined)
              }
              min="0.01"
              step="0.01"
            />
          </div>
        )}

        {/* Min ROAS */}
        {(phase as any).snapchatBidStrategy === "MIN_ROAS" && (
          <div className="space-y-2">
            <Label>Minimum ROAS</Label>
            <Input
              type="number"
              placeholder="e.g., 2.0"
              value={(phase as any).snapchatMinRoas || ""}
              onChange={(e) =>
                onUpdate("snapchatMinRoas" as keyof Phase, parseFloat(e.target.value) || undefined)
              }
              min="0.01"
              step="0.1"
            />
          </div>
        )}

        {/* Destination URL */}
        <div className="space-y-2">
          <Label>Destination URL</Label>
          <Input
            placeholder="https://example.com/landing-page"
            value={(phase as any).snapchatDestinationUrl || ""}
            onChange={(e) => onUpdate("snapchatDestinationUrl" as keyof Phase, e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Swipe-up destination for your Snapchat ads
          </p>
        </div>

        {/* Snap Pixel */}
        <div className="space-y-2">
          <Label>Snap Pixel ID (optional)</Label>
          <Input
            placeholder="e.g., abc123-def456"
            value={(phase as any).snapchatPixelId || ""}
            onChange={(e) => onUpdate("snapchatPixelId" as keyof Phase, e.target.value)}
          />
        </div>

        {/* Frequency Cap */}
        <div className="space-y-2">
          <Label>Frequency Cap (impressions per day)</Label>
          <Input
            type="number"
            placeholder="e.g., 3"
            value={(phase as any).snapchatFrequencyCap || ""}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onUpdate("snapchatFrequencyCap" as keyof Phase, isNaN(val) ? undefined : val);
            }}
            min="1"
          />
        </div>

        {/* Platform info */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Snapchat Ads hierarchy:</strong> Campaign → Ad Squad → Ad.
            Ad Squads are equivalent to Ad Sets (Meta) or Ad Groups (TikTok/Google).
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
