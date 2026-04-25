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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

interface ModificationRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  onSuccess: () => void;
}

interface TeamMember {
  id: string;
  email: string;
  role: string;
}

interface Platform {
  id: string;
  name: string;
  type: string;
  markets?: any[];
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

export function ModificationRequestDialog({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  onSuccess,
}: ModificationRequestDialogProps) {
  const { user } = useAuth();
  const [changeType, setChangeType] = useState("");
  const [description, setDescription] = useState("");
  const [adSetName, setAdSetName] = useState("");
  const [adName, setAdName] = useState("");
  const [loading, setLoading] = useState(false);
  const [notifyType, setNotifyType] = useState<"all" | "specific">("all");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [marketSplits, setMarketSplits] = useState<Record<string, any>>({});
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [availableMarkets, setAvailableMarkets] = useState<Market[]>([]);
  const [availablePhases, setAvailablePhases] = useState<Phase[]>([]);
  const [campaignStatus, setCampaignStatus] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadCampaignDetails();
    }
  }, [open]);

  // Load team members when dialog opens or when user switches to "specific" notify type
  useEffect(() => {
    if (open && (notifyType === "specific" || teamMembers.length === 0)) {
      loadTeamMembers();
    }
  }, [open, notifyType]);

  const loadCampaignDetails = async () => {
    try {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("platforms, market_splits, status")
        .eq("id", campaignId)
        .single();

      console.log("Campaign data for modification dialog:", campaign);

      if (campaign) {
        // Store campaign status
        setCampaignStatus(campaign.status || null);
        
        // Parse platforms
        if (Array.isArray(campaign.platforms)) {
          const platformsData = campaign.platforms.map((p: any, idx: number) => ({
            id: p.id || `platform-${idx}`,
            name: p.name || p.type || p.platform,
            type: p.type || p.platform || p.name,
          }));
          console.log("Parsed platforms:", platformsData);
          setPlatforms(platformsData);
        }

        // Store market_splits for later use
        if (campaign.market_splits && typeof campaign.market_splits === 'object') {
          console.log("Market splits:", campaign.market_splits);
          setMarketSplits(campaign.market_splits as Record<string, any>);
        }
      }
    } catch (error) {
      console.error("Error loading campaign details:", error);
    }
  };

  // Update available markets and phases when platform changes
  useEffect(() => {
    if (selectedPlatform && selectedPlatform !== "_none" && Object.keys(marketSplits).length > 0) {
      // Market splits are keyed by lowercase platform name
      const platformKey = selectedPlatform.toLowerCase();
      const platformMarketData = marketSplits[platformKey];
      
      const markets: Market[] = [];
      const phases: Phase[] = [];
      
      if (Array.isArray(platformMarketData)) {
        platformMarketData.forEach((market: any) => {
          const marketName = market.name || market.market || market.code;
          if (marketName) {
            markets.push({
              id: market.id || market.code || marketName,
              name: marketName,
              code: market.code,
            });
          }
          
          // Extract phases from market
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
      
      setAvailableMarkets(markets);
      setAvailablePhases(phases);
    } else {
      setAvailableMarkets([]);
      setAvailablePhases([]);
    }
    // Clear selections when platform changes
    setSelectedMarkets([]);
    setSelectedPhases([]);
  }, [selectedPlatform, marketSplits]);

  const loadTeamMembers = async () => {
    setLoadingMembers(true);
    try {
      // Get the campaign's team
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("team_id")
        .eq("id", campaignId)
        .single();

      if (!campaign || !campaign.team_id) {
        setTeamMembers([]);
        return;
      }

      // Get all team members from the campaign's team
      const { data: members } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("team_id", campaign.team_id)
        .neq("user_id", user?.id); // Exclude current user

      if (!members || members.length === 0) {
        setTeamMembers([]);
        return;
      }

      // Get profiles for the team members
      const userIds = members.map((m: any) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);

      if (profiles) {
        const enrichedMembers = members.map((m: any) => {
          const profile = profiles.find((p: any) => p.id === m.user_id);
          return {
            id: m.user_id,
            email: profile?.email || "Unknown",
            role: m.role,
          };
        });
        setTeamMembers(enrichedMembers);
      }
    } catch (error) {
      console.error("Error loading team members:", error);
      toast.error("Failed to load team members");
    } finally {
      setLoadingMembers(false);
    }
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleSubmit = async () => {
    if (!changeType || !description.trim()) {
      toast.error("Please select a change type and provide a description");
      return;
    }

    if (notifyType === "specific" && selectedMembers.length === 0) {
      toast.error("Please select at least one team member to notify");
      return;
    }

    setLoading(true);
    try {
      // Build detailed description
      let fullDescription = description.trim();
      if (selectedPlatform && selectedPlatform !== "_none") {
        fullDescription = `Platform: ${selectedPlatform}\n${fullDescription}`;
      }
      if (selectedMarkets.length > 0) {
        fullDescription = `Markets: ${selectedMarkets.join(", ")}\n${fullDescription}`;
      }
      if (selectedPhases.length > 0) {
        fullDescription = `Phases: ${selectedPhases.join(", ")}\n${fullDescription}`;
      }

      // Create modification request
      const { data: newRequest, error: requestError } = await supabase
        .from("modification_requests")
        .insert({
          campaign_id: campaignId,
          requester_id: user?.id,
          change_type: changeType,
          description: fullDescription,
          status: "sent",
          assigned_to: notifyType === "specific" ? selectedMembers : [],
          notify_all_team: notifyType === "all",
        })
        .select("id")
        .single();

      if (requestError) throw requestError;

      // Only update campaign status to under_modification if not already pushed to DSP
      // Campaigns that are pushed_to_dsp, partially_pushed, or live should retain their status
      const dspStatuses = ["pushed_to_dsp", "partially_pushed", "live"];
      if (!dspStatuses.includes(campaignStatus || "")) {
        const { error: updateError } = await supabase
          .from("campaigns")
          .update({ status: "under_modification" })
          .eq("id", campaignId);

        if (updateError) throw updateError;
      }

      // Log to history
      await supabase.from("campaign_change_history").insert({
        campaign_id: campaignId,
        user_id: user?.id,
        action: "modification_requested",
        change_type: changeType,
        description: fullDescription,
      });

      // Send notification
      await supabase.functions.invoke("send-modification-notification", {
        body: {
          campaignId,
          campaignName,
          changeType,
          description: fullDescription,
          notifyAllTeam: notifyType === "all",
          assignedTo: notifyType === "specific" ? selectedMembers : [],
          requestId: newRequest?.id,
        },
      });

      toast.success("Modification request sent successfully");
      setChangeType("");
      setDescription("");
      setSelectedPlatform("");
      setSelectedMarkets([]);
      setSelectedPhases([]);
      setNotifyType("all");
      setSelectedMembers([]);
      onSuccess();
    } catch (error: any) {
      console.error("Error creating modification request:", error);
      toast.error("Failed to send modification request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request ActiPlan Modification</DialogTitle>
          <DialogDescription>
            Request changes to "{campaignName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Change Type</Label>
            <Select value={changeType} onValueChange={setChangeType}>
              <SelectTrigger>
                <SelectValue placeholder="Select change type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="budget_increase">Budget Increase</SelectItem>
                <SelectItem value="budget_decrease">Budget Decrease</SelectItem>
                <SelectItem value="duration_extension">Duration Extension</SelectItem>
                <SelectItem value="market_expansion">Market Expansion</SelectItem>
                <SelectItem value="targeting_change">Targeting Change</SelectItem>
                <SelectItem value="goals_update">Goals/KPI Update</SelectItem>
                <SelectItem value="creative_change">Creative Change</SelectItem>
                <SelectItem value="pause_request">Pause Request</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {platforms.length > 0 && (
            <div className="space-y-2">
              <Label>Platform (Optional)</Label>
              <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                <SelectTrigger>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">All Platforms</SelectItem>
                  {platforms.map((platform) => (
                    <SelectItem key={platform.id || platform.name} value={platform.name || platform.type}>
                      {platform.name || platform.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Markets multi-select */}
          {selectedPlatform && selectedPlatform !== "_none" && availableMarkets.length > 0 && (
            <div className="space-y-2">
              <Label>Markets (Optional)</Label>
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
          {selectedPlatform && selectedPlatform !== "_none" && availablePhases.length > 0 && (
            <div className="space-y-2">
              <Label>Phases (Optional)</Label>
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

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Describe the changes needed..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
            />
          </div>

          <div className="space-y-3">
            <Label>Notify</Label>
            <RadioGroup value={notifyType} onValueChange={(value: "all" | "specific") => setNotifyType(value)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="notify-all" />
                <Label htmlFor="notify-all" className="font-normal cursor-pointer">
                  Whole Team
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="specific" id="notify-specific" />
                <Label htmlFor="notify-specific" className="font-normal cursor-pointer">
                  Specific Team Members
                </Label>
              </div>
            </RadioGroup>

            {notifyType === "specific" && (
              <div className="ml-6 space-y-2 mt-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {loadingMembers ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : teamMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No team members found</p>
                ) : (
                  teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={member.id}
                        checked={selectedMembers.includes(member.id)}
                        onCheckedChange={() => toggleMember(member.id)}
                      />
                      <Label
                        htmlFor={member.id}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {member.email} <span className="text-muted-foreground">({member.role})</span>
                      </Label>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Send Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
