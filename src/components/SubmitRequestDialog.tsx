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

interface SubmitRequestDialogProps {
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

const REQUEST_TYPES = [
  { value: "budget_change", label: "Budget Change", description: "Request budget adjustments or reallocations" },
  { value: "creative_optimization", label: "Creative Optimization", description: "Request creative improvements or new variants" },
  { value: "pause_enable_campaigns", label: "Pause/Enable Campaigns", description: "Request to pause or enable campaigns/ad sets" },
  { value: "targeting_optimization", label: "Targeting Optimization", description: "Request audience or targeting improvements" },
  { value: "audience_expansion", label: "Audience Expansion", description: "Request to expand reach with new audiences" },
  { value: "bid_adjustment", label: "Bid Adjustment", description: "Request bid strategy or amount changes" },
  { value: "schedule_change", label: "Schedule Change", description: "Request flight date or dayparting changes" },
  { value: "landing_page_update", label: "Landing Page Update", description: "Request destination URL updates" },
  { value: "ad_copy_update", label: "Ad Copy Update", description: "Request text or headline changes" },
  { value: "placement_change", label: "Placement Change", description: "Request ad placement modifications" },
  { value: "conversion_tracking", label: "Conversion Tracking Setup", description: "Request pixel or event implementation" },
  { value: "pixel_implementation", label: "Pixel Implementation", description: "Request tracking pixel setup" },
  { value: "reporting_request", label: "Reporting Request", description: "Request custom reports or analyses" },
  { value: "other", label: "Other", description: "Other operational requests" },
];

export function SubmitRequestDialog({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  onSuccess,
}: SubmitRequestDialogProps) {
  const { user } = useAuth();
  const [requestType, setRequestType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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
      setRequestType("");
      setTitle("");
      setDescription("");
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
    if (!requestType) {
      toast.error("Please select a request type");
      return;
    }

    if (!title.trim()) {
      toast.error("Please provide a title");
      return;
    }

    setLoading(true);
    try {
      // Build full description with context
      let fullDescription = description.trim();
      if (selectedPlatforms.length > 0) {
        fullDescription += `\n\nPlatforms: ${selectedPlatforms.join(", ")}`;
      }
      if (selectedMarkets.length > 0) {
        fullDescription += `\nMarkets: ${selectedMarkets.join(", ")}`;
      }
      if (selectedPhases.length > 0) {
        fullDescription += `\nPhases: ${selectedPhases.join(", ")}`;
      }

      // Insert as a modification request with submit_request type
      const { error } = await supabase
        .from("modification_requests")
        .insert({
          campaign_id: campaignId,
          requester_id: user?.id,
          change_type: requestType,
          description: `${title}\n\n${fullDescription}`,
          status: "sent",
          notify_all_team: true,
        });

      if (error) throw error;

      // Also log to campaign_change_history
      await supabase.from("campaign_change_history").insert({
        campaign_id: campaignId,
        user_id: user?.id,
        action: `submit_request_${requestType}`,
        change_type: requestType,
        description: `${title}${description ? `: ${description}` : ""}`,
      });

      toast.success("Request submitted successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error submitting request:", error);
      toast.error("Failed to submit request");
    } finally {
      setLoading(false);
    }
  };

  const selectedRequestType = REQUEST_TYPES.find((t) => t.value === requestType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit Request</DialogTitle>
          <DialogDescription>
            Submit an operational request for "{campaignName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Request Type *</Label>
            <Select value={requestType} onValueChange={setRequestType}>
              <SelectTrigger>
                <SelectValue placeholder="Select request type" />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRequestType && (
              <p className="text-xs text-muted-foreground">{selectedRequestType.description}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              placeholder="Brief title for this request..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Description (Optional)</Label>
            <Textarea
              placeholder="Detailed notes about what is needed..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
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
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}