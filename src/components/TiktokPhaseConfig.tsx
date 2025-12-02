import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Phase } from "@/types/mediaplan";
import { useState, useEffect } from "react";

interface TiktokPhaseConfigProps {
  phase: Phase;
  onUpdate: (field: keyof Phase, value: any) => void;
}

export function TiktokPhaseConfig({ phase, onUpdate }: TiktokPhaseConfigProps) {
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

  // Get objective and optimization goal
  const objective = phase.objective || "";
  const optimizationGoal = phase.optimizationGoal || "";
  
  console.log("🎯 TikTok Phase Config - Objective:", objective, "Upper:", objective.toUpperCase());
  console.log("🎯 Current frequency schedule value:", phase.tiktokFrequencySchedule);
  console.log("🎯 Is REACH?", objective.toUpperCase() === "REACH");

  // Determine field visibility based on matrix
  const showOptimizationLocation = ![
    "REACH", "VIDEO_VIEWS", "COMMUNITY_INTERACTION"
  ].includes(objective.toUpperCase());

  const showAppFields = (
    (objective === "TRAFFIC" && optimizationGoal === "CLICK" && phase.tiktokOptimizationLocation === "App") ||
    (objective === "APP_PROMOTION") ||
    (objective === "LEAD_GENERATION" && ["CLICK", "CONVERSATION"].includes(optimizationGoal) && phase.tiktokOptimizationLocation === "Instant Messaging Apps") ||
    (objective === "SALES" && optimizationGoal === "CLICK" && phase.tiktokOptimizationLocation === "App") ||
    (objective === "SALES" && ["CONVERSION", "VALUE"].includes(optimizationGoal) && phase.tiktokOptimizationLocation === "Website & App")
  );

  const showBidStrategy = true; // Always shown based on matrix

  const showBidAmount = (phase.tiktokBidStrategy === 'COST_CAP' || phase.tiktokBidStrategy === 'TARGET_COST');

  const showAttributionWindows = (
    (objective === "LEAD_GENERATION" && ["CONVERSION", "CONVERSATION"].includes(optimizationGoal)) ||
    (objective === "SALES" && ["VALUE", "CONVERSION"].includes(optimizationGoal) && ["Website", "TikTok Instant Page", "Website & App"].includes(phase.tiktokOptimizationLocation || ""))
  );

  const showEventCount = (
    (objective === "LEAD_GENERATION") ||
    (objective === "SALES" && optimizationGoal === "CLICK" && phase.tiktokOptimizationLocation === "App") ||
    (objective === "SALES" && ["CONVERSION", "VALUE"].includes(optimizationGoal) && phase.tiktokOptimizationLocation === "Website & App")
  );

  const showCatalogProductSet = (
    objective === "SALES" && ["CONVERSION", "VALUE"].includes(optimizationGoal) && phase.tiktokOptimizationLocation === "Website & App"
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
      <div className="space-y-4">
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
      </div>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">TikTok Advanced Settings</CardTitle>
        <CardDescription className="text-sm">Configure TikTok-specific campaign parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Optimization Location */}
        {showOptimizationLocation && (
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
                <SelectItem value="Website">Website</SelectItem>
                <SelectItem value="App">App</SelectItem>
                <SelectItem value="TikTok Shop">TikTok Shop</SelectItem>
                <SelectItem value="Instant Form">Instant Form</SelectItem>
                <SelectItem value="TikTok Direct Messages">TikTok Direct Messages</SelectItem>
                <SelectItem value="Instant Messaging Apps">Instant Messaging Apps</SelectItem>
                <SelectItem value="Phone Call">Phone Call</SelectItem>
                <SelectItem value="TikTok Instant Page">TikTok Instant Page</SelectItem>
                <SelectItem value="Website & App">Website & App</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Where optimizations occur (Website, App, TikTok Shop, etc.)
            </p>
          </div>
        )}

        {/* App Fields */}
        {showAppFields && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>App Name</Label>
              <Input
                placeholder="e.g., Android, iOS, WhatsApp"
                value={phase.tiktokAppName || ""}
                onChange={(e) => onUpdate("tiktokAppName", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>App ID</Label>
              <Input
                placeholder="App identifier"
                value={phase.tiktokAppId || ""}
                onChange={(e) => onUpdate("tiktokAppId", e.target.value)}
              />
            </div>
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
                <SelectValue placeholder="Inherit from defaults" />
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
                  <SelectValue placeholder="Inherit from defaults" />
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
              <Input
                placeholder="Catalog ID"
                value={phase.tiktokCatalog || ""}
                onChange={(e) => onUpdate("tiktokCatalog", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Product Set</Label>
              <Input
                placeholder="Product Set ID"
                value={phase.tiktokProductSet || ""}
                onChange={(e) => onUpdate("tiktokProductSet", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Smart+ Campaigns */}
        {showSmartPlus && (
          <div className="space-y-2">
            <Label>Smart+ Campaign</Label>
            <Select
              value={phase.tiktokSmartPlusEnabled ? "true" : "false"}
              onValueChange={(value) => onUpdate("tiktokSmartPlusEnabled", value === "true")}
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
                  <strong>Smart+ automatically enables:</strong>
                  <ul className="mt-1 ml-4 list-disc space-y-1">
                    <li>Automatic placements across TikTok network</li>
                    <li>AI-powered audience targeting</li>
                    <li>Automatic ad creative optimization</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Placement Type */}
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
      </CardContent>
    </Card>
  );
}
