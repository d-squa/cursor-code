import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, AlertOctagon } from "lucide-react";
import { logCampaignActivity, logCampaignHistoryEntry } from "@/utils/campaignHistory";

export interface SetupMistakeContext {
  campaignId: string;
  campaignName?: string;
  qcTrackingId?: string | null;
  platform?: string | null;
  market?: string | null;
  phaseName?: string | null;
  adSetName?: string | null;
  adName?: string | null;
  entityType?: string | null;
  teamId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: SetupMistakeContext | null;
  onSuccess?: () => void;
}

export function SetupMistakeDialog({ open, onOpenChange, context, onSuccess }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [resolvedTeamId, setResolvedTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setResolvedTeamId(context?.teamId ?? null);

    // Resolve team_id from campaign if not provided
    if (!context?.teamId && context?.campaignId) {
      supabase
        .from("campaigns")
        .select("team_id")
        .eq("id", context.campaignId)
        .single()
        .then(({ data }) => setResolvedTeamId((data?.team_id as string) ?? null));
    }
  }, [open, context]);

  const handleSubmit = async () => {
    if (!context || !user) return;
    if (!title.trim()) {
      toast.error("Please provide a title");
      return;
    }
    setLoading(true);
    try {
      const payload: any = {
        campaign_id: context.campaignId,
        qc_tracking_id: context.qcTrackingId ?? null,
        team_id: resolvedTeamId,
        platform: context.platform ?? null,
        market: context.market ?? null,
        phase_name: context.phaseName ?? null,
        ad_set_name: context.adSetName ?? null,
        ad_name: context.adName ?? null,
        entity_type: context.entityType ?? null,
        title: title.trim(),
        description: description.trim() || null,
        status: "open",
        created_by: user.id,
      };

      const { error } = await (supabase.from("setup_mistakes" as any) as any).insert(payload);
      if (error) throw error;

      // Mirror into activity_logs and change history for unified analytics
      const summary = `Setup mistake on ${context.adName || context.adSetName || context.entityType || "item"}: ${title}`;
      await Promise.all([
        logCampaignActivity({
          campaignId: context.campaignId,
          userId: user.id,
          actionType: "setup_mistake",
          title: title.trim(),
          description: description.trim() || summary,
          affectedPlatforms: context.platform ? [context.platform] : undefined,
          affectedMarkets: context.market ? [context.market] : undefined,
          affectedPhases: context.phaseName ? [context.phaseName] : undefined,
          metadata: {
            qcTrackingId: context.qcTrackingId,
            adSetName: context.adSetName,
            adName: context.adName,
            entityType: context.entityType,
            status: "open",
          },
        }),
        logCampaignHistoryEntry({
          campaignId: context.campaignId,
          userId: user.id,
          action: "setup_mistake_logged",
          changeType: "quality_check",
          description: summary,
        }),
      ]);

      toast.success("Setup mistake logged");
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error logging setup mistake:", err);
      toast.error(err?.message || "Failed to log setup mistake");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-destructive" />
            Log Setup Mistake
          </DialogTitle>
          <DialogDescription>
            This item will be blocked from advancing to "Pushed Live" until the mistake is resolved.
          </DialogDescription>
        </DialogHeader>

        {context && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            {context.campaignName && (
              <div><span className="font-medium">ActiPlan:</span> {context.campaignName}</div>
            )}
            {context.platform && (
              <div><span className="font-medium">Platform:</span> {context.platform}</div>
            )}
            {context.market && (
              <div><span className="font-medium">Market:</span> {context.market}</div>
            )}
            {context.phaseName && (
              <div><span className="font-medium">Phase:</span> {context.phaseName}</div>
            )}
            {context.adSetName && (
              <div><span className="font-medium">Ad Set:</span> {context.adSetName}</div>
            )}
            {context.adName && (
              <div><span className="font-medium">Ad:</span> {context.adName}</div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              placeholder="Short summary of the mistake"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="What is wrong and what needs to be fixed?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Log Setup Mistake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
