import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface ModificationRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  onSuccess: () => void;
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

  const handleSubmit = async () => {
    if (!changeType || !description.trim()) {
      toast.error("Please select a change type and provide a description");
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
        } as any);

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
      } as any);

      // Send notification
      await supabase.functions.invoke("send-modification-notification", {
        body: {
          campaignId,
          campaignName,
          changeType,
          description: description.trim(),
        },
      });

      toast.success("Modification request sent successfully");
      setChangeType("");
      setDescription("");
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
