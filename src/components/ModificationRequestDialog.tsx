import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  const [loading, setLoading] = useState(false);
  const [notifyType, setNotifyType] = useState<"all" | "specific">("all");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (open) {
      loadTeamMembers();
    }
  }, [open]);

  const loadTeamMembers = async () => {
    setLoadingMembers(true);
    try {
      // Get the campaign creator's team
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("user_id")
        .eq("id", campaignId)
        .single();

      if (!campaign) return;

      // Get all users in the same teams as the campaign creator
      const { data: userTeams } = await supabase
        .from("user_roles")
        .select("team_id")
        .eq("user_id", campaign.user_id);

      if (!userTeams || userTeams.length === 0) return;

      const teamIds = userTeams.map((t) => t.team_id);

      // Get all team members from these teams
      const { data: members } = await supabase
        .from("user_roles")
        .select(`
          user_id,
          role,
          profiles!inner(id, email)
        `)
        .in("team_id", teamIds)
        .neq("user_id", user?.id); // Exclude current user

      if (members) {
        const uniqueMembers = Array.from(
          new Map(
            members.map((m: any) => [
              m.profiles.id,
              {
                id: m.profiles.id,
                email: m.profiles.email,
                role: m.role,
              },
            ])
          ).values()
        );
        setTeamMembers(uniqueMembers);
      }
    } catch (error) {
      console.error("Error loading team members:", error);
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
      // Create modification request
      const { error: requestError } = await supabase
        .from("modification_requests")
        .insert({
          campaign_id: campaignId,
          requester_id: user?.id,
          change_type: changeType,
          description: description.trim(),
          status: "sent",
          assigned_to: notifyType === "specific" ? selectedMembers : [],
          notify_all_team: notifyType === "all",
        });

      if (requestError) throw requestError;

      // Update campaign status
      const { error: updateError } = await supabase
        .from("campaigns")
        .update({ status: "under_modification" })
        .eq("id", campaignId);

      if (updateError) throw updateError;

      // Log to history
      await supabase.from("campaign_change_history").insert({
        campaign_id: campaignId,
        user_id: user?.id,
        action: "modification_requested",
        change_type: changeType,
        description: description.trim(),
      });

      // Send notification
      await supabase.functions.invoke("send-modification-notification", {
        body: {
          campaignId,
          campaignName,
          changeType,
          description: description.trim(),
          notifyAllTeam: notifyType === "all",
          assignedTo: notifyType === "specific" ? selectedMembers : [],
        },
      });

      toast.success("Modification request sent successfully");
      setChangeType("");
      setDescription("");
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
                <SelectItem value="budget">Budget</SelectItem>
                <SelectItem value="duration">Duration</SelectItem>
                <SelectItem value="market">Market</SelectItem>
                <SelectItem value="targeting">Targeting</SelectItem>
                <SelectItem value="goals">Goals</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
