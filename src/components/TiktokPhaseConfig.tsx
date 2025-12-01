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
  const [eventCountOptions, setEventCountOptions] = useState<Array<{ value: string; label: string }>>([
    { value: "every_conversion", label: "Every Conversion" },
    { value: "once", label: "Once" }
  ]);

  // Determine if frequency capping should be shown (only for Reach objective)
  const showFrequencyCapping = phase.objective === "REACH";
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">TikTok Advanced Settings</CardTitle>
        <CardDescription className="text-sm">Configure TikTok-specific campaign parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Optimization Location */}
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

        {/* App Fields - Only show when optimization location is App or Website & App */}
        {(phase.tiktokOptimizationLocation === 'App' || 
          phase.tiktokOptimizationLocation === 'Website & App' || 
          phase.tiktokOptimizationLocation === 'Instant Messaging Apps') && (
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

        {/* Bid Amount - Only show when COST_CAP or TARGET_COST is selected */}
        {(phase.tiktokBidStrategy === 'COST_CAP' || phase.tiktokBidStrategy === 'TARGET_COST') && (
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

        {/* Frequency Capping - Only for Reach objective */}
        {showFrequencyCapping && (
          <>
            <div className="space-y-2">
              <Label>Frequency Cap (impressions per 7 days)</Label>
              <Input
                type="number"
                placeholder="e.g., 3"
                value={phase.tiktokFrequencySchedule || ""}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || undefined;
                  onUpdate("tiktokFrequencySchedule", value);
                  // Auto-enable frequency when a value is set
                  onUpdate("tiktokFrequencyEnabled", !!value);
                }}
                min="1"
              />
              <p className="text-xs text-muted-foreground">
                Limit how many times users see your ad (Reach campaigns only)
              </p>
            </div>
          </>
        )}

        {/* Event Count - For conversion campaigns */}
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

        {/* Smart+ Campaigns */}
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
      </CardContent>
    </Card>
  );
}