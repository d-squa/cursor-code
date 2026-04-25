import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface LogActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  onSuccess: () => void;
}

interface Platform {
  id: string;
  name: string;
  type: string;
}

interface Market {
  id: string;
  name: string;
  code?: string;
}

interface Phase {
  id: string;
  name: string;
}

const ACTION_TYPES = [
  { value: "budget_adjustment", label: "Budget Adjustment", description: "Budget changes, reallocations, or modifications" },
  { value: "targeting_change", label: "Targeting Change", description: "Audience, demographics, or targeting updates" },
  { value: "creative_update", label: "Creative Update", description: "Ad creative modifications or rotations" },
  { value: "campaign_pause_resume", label: "Campaign Pause/Resume", description: "Campaign or ad set pause/resume actions" },
  { value: "audience_update", label: "Audience Update", description: "Audience list or segment changes" },
  { value: "bid_change", label: "Bid Change", description: "Bidding strategy or amount adjustments" },
  { value: "schedule_modification", label: "Schedule Modification", description: "Flight dates or dayparting changes" },
  { value: "landing_page_change", label: "Landing Page Change", description: "Destination URL or landing page updates" },
  { value: "ad_copy_change", label: "Ad Copy Change", description: "Text, headline, or description updates" },
  { value: "placement_update", label: "Placement Update", description: "Ad placement or position changes" },
  { value: "conversion_setup", label: "Conversion Setup", description: "Pixel, event, or conversion tracking setup" },
  { value: "reporting_delivery", label: "Reporting Delivery", description: "Report creation or delivery" },
  { value: "note", label: "Note/Comment", description: "General observations or documentation" },
];

export function LogActionDialog({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  onSuccess,
}: LogActionDialogProps) {
  const { user } = useAuth();
  const [actionType, setActionType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [adSetName, setAdSetName] = useState("");
  const [adName, setAdName] = useState("");
  const [loading, setLoading] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [marketSplits, setMarketSplits] = useState<Record<string, any>>({});
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [availableMarkets, setAvailableMarkets] = useState<Market[]>([]);
  const [availablePhases, setAvailablePhases] = useState<Phase[]>([]);

  useEffect(() => {
    if (open) {
      loadCampaignDetails();
      // Reset form
      setActionType("");
      setTitle("");
      setDescription("");
      setAdSetName("");
      setAdName("");
      setSelectedPlatforms([]);
      setSelectedMarkets([]);
      setSelectedPhases([]);
    }
  }, [open]);

  const loadCampaignDetails = async () => {
    try {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("platforms, market_splits")
        .eq("id", campaignId)
        .single();

      if (campaign) {
        if (Array.isArray(campaign.platforms)) {
          const platformsData = campaign.platforms.map((p: any, idx: number) => ({
            id: p.id || `platform-${idx}`,
            name: p.name || p.type || p.platform,
            type: p.type || p.platform || p.name,
          }));
          setPlatforms(platformsData);
        }

        if (campaign.market_splits && typeof campaign.market_splits === 'object') {
          setMarketSplits(campaign.market_splits as Record<string, any>);
        }
      }
    } catch (error) {
      console.error("Error loading campaign details:", error);
    }
  };

  // Update available markets and phases when platforms change
  useEffect(() => {
    if (selectedPlatforms.length > 0 && Object.keys(marketSplits).length > 0) {
      const markets: Market[] = [];
      const phases: Phase[] = [];
      
      selectedPlatforms.forEach((platformName) => {
        const platformKey = platformName.toLowerCase();
        const platformMarketData = marketSplits[platformKey];
        
        if (Array.isArray(platformMarketData)) {
          platformMarketData.forEach((market: any) => {
            const marketName = market.name || market.market || market.code;
            if (marketName && !markets.find((m) => m.name === marketName)) {
              markets.push({
                id: market.id || market.code || marketName,
                name: marketName,
                code: market.code,
              });
            }
            
            const marketPhases = market.phases || [];
            marketPhases.forEach((phase: any) => {
              const phaseName = phase.name || phase.phaseName;
              if (phaseName && !phases.find((p) => p.name === phaseName)) {
                phases.push({
                  id: phase.id || phaseName,
                  name: phaseName,
                });
              }
            });
          });
        }
      });
      
      setAvailableMarkets(markets);
      setAvailablePhases(phases);
    } else {
      setAvailableMarkets([]);
      setAvailablePhases([]);
    }
    // Clear selections when platforms change
    setSelectedMarkets([]);
    setSelectedPhases([]);
  }, [selectedPlatforms, marketSplits]);

  const togglePlatform = (platformName: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platformName)
        ? prev.filter((p) => p !== platformName)
        : [...prev, platformName]
    );
  };

  const handleSubmit = async () => {
    if (!actionType) {
      toast.error("Please select an action type");
      return;
    }

    if (!title.trim()) {
      toast.error("Please provide a title");
      return;
    }

    setLoading(true);
    try {
      // Build description with ad set / ad context
      let fullDescription = description.trim();
      const ctxLines: string[] = [];
      if (adSetName.trim()) ctxLines.push(`Ad Set: ${adSetName.trim()}`);
      if (adName.trim()) ctxLines.push(`Ad: ${adName.trim()}`);
      if (ctxLines.length > 0) {
        fullDescription = (fullDescription ? `${fullDescription}\n\n` : "") + ctxLines.join("\n");
      }

      // Insert into activity_logs table
      const { error: logError } = await supabase
        .from("activity_logs")
        .insert({
          campaign_id: campaignId,
          user_id: user?.id,
          action_type: actionType,
          title: title.trim(),
          description: fullDescription || null,
          affected_platforms: selectedPlatforms,
          affected_markets: selectedMarkets,
          affected_phases: selectedPhases,
          metadata: {
            ad_set_name: adSetName.trim() || null,
            ad_name: adName.trim() || null,
          },
        });

      if (logError) throw logError;

      // Also log to campaign_change_history for unified history view
      await supabase.from("campaign_change_history").insert({
        campaign_id: campaignId,
        user_id: user?.id,
        action: `action_logged_${actionType}`,
        change_type: actionType,
        description: `${title}${fullDescription ? `: ${fullDescription}` : ""}`,
      });

      toast.success("Action logged successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error logging action:", error);
      toast.error("Failed to log action");
    } finally {
      setLoading(false);
    }
  };

  const selectedActionType = ACTION_TYPES.find((t) => t.value === actionType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log an Action</DialogTitle>
          <DialogDescription>
            Document changes or actions taken on "{campaignName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Action Type *</Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger>
                <SelectValue placeholder="Select action type" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedActionType && (
              <p className="text-xs text-muted-foreground">{selectedActionType.description}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              placeholder="Brief title for this action..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Description (Optional)</Label>
            <Textarea
              placeholder="Detailed notes about what was changed..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Ad Set (Optional)</Label>
              <Input
                placeholder="Ad set name"
                value={adSetName}
                onChange={(e) => setAdSetName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ad (Optional)</Label>
              <Input
                placeholder="Ad name"
                value={adName}
                onChange={(e) => setAdName(e.target.value)}
              />
            </div>
          </div>

          {platforms.length > 0 && (
            <div className="space-y-2">
              <Label>Affected Platforms (Optional)</Label>
              <div className="border rounded-md p-3 max-h-32 overflow-y-auto bg-background">
                {platforms.map((platform) => (
                  <div key={platform.id} className="flex items-center space-x-2 py-1">
                    <Checkbox
                      id={`platform-${platform.id}`}
                      checked={selectedPlatforms.includes(platform.name || platform.type)}
                      onCheckedChange={() => togglePlatform(platform.name || platform.type)}
                    />
                    <Label htmlFor={`platform-${platform.id}`} className="text-sm font-normal cursor-pointer">
                      {platform.name || platform.type}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Markets multi-select */}
          {selectedPlatforms.length > 0 && availableMarkets.length > 0 && (
            <div className="space-y-2">
              <Label>Affected Markets (Optional)</Label>
              <div className="border rounded-md p-3 max-h-32 overflow-y-auto bg-background">
                {availableMarkets.map((market) => (
                  <div key={market.id} className="flex items-center space-x-2 py-1">
                    <Checkbox
                      id={`market-${market.id}`}
                      checked={selectedMarkets.includes(market.name)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedMarkets((prev) => [...prev, market.name]);
                        } else {
                          setSelectedMarkets((prev) => prev.filter((m) => m !== market.name));
                        }
                      }}
                    />
                    <Label htmlFor={`market-${market.id}`} className="text-sm font-normal cursor-pointer">
                      {market.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phases multi-select */}
          {selectedPlatforms.length > 0 && availablePhases.length > 0 && (
            <div className="space-y-2">
              <Label>Affected Phases (Optional)</Label>
              <div className="border rounded-md p-3 max-h-32 overflow-y-auto bg-background">
                {availablePhases.map((phase) => (
                  <div key={phase.id} className="flex items-center space-x-2 py-1">
                    <Checkbox
                      id={`phase-${phase.id}`}
                      checked={selectedPhases.includes(phase.name)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedPhases((prev) => [...prev, phase.name]);
                        } else {
                          setSelectedPhases((prev) => prev.filter((p) => p !== phase.name));
                        }
                      }}
                    />
                    <Label htmlFor={`phase-${phase.id}`} className="text-sm font-normal cursor-pointer">
                      {phase.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Log Action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
