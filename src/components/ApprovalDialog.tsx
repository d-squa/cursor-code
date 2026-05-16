import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MultiSelect } from "@/components/ui/multi-select";
import { fetchTeamMemberOptionsForCampaign } from "@/utils/teamMembers";
import { useWorkspace } from "@/hooks/useWorkspace";

interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string;
  planDetails: any;
  pdfBase64: string;
  excelBase64?: string;
  actiplanForecasts?: any;
}

export function ApprovalDialog({
  open,
  onOpenChange,
  planName,
  planDetails,
  pdfBase64,
  excelBase64,
  actiplanForecasts,
}: ApprovalDialogProps) {
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const [sending, setSending] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<Array<{ value: string; label: string }>>([]);
  const [sendToWholeTeam, setSendToWholeTeam] = useState(false);
  const [resolvedTeamId, setResolvedTeamId] = useState<string | null>(null);
  const [workspaceTeamName, setWorkspaceTeamName] = useState<string | null>(null);
  const [campaignTeamMismatch, setCampaignTeamMismatch] = useState(false);

  const campaignId = planDetails?.campaignId as string | undefined;

  // Recipients = Manage Your Team roster for the workspace switcher team (not campaign.team_id alone).
  useEffect(() => {
    if (!open) {
      setSelectedUsers([]);
      setSendToWholeTeam(false);
      return;
    }

    if (workspaceLoading) return;

    if (!activeWorkspaceId) {
      setTeamMembers([]);
      setResolvedTeamId(null);
      setWorkspaceTeamName(null);
      setCampaignTeamMismatch(false);
      return;
    }

    void loadTeamMembers();
  }, [open, campaignId, activeWorkspaceId, workspaceLoading]);

  const loadTeamMembers = async () => {
    try {
      const { members, teamId, teamName, campaignTeamMismatch: mismatch } =
        await fetchTeamMemberOptionsForCampaign(activeWorkspaceId, campaignId);
      setTeamMembers(members);
      setResolvedTeamId(teamId);
      setWorkspaceTeamName(teamName);
      setCampaignTeamMismatch(mismatch);
    } catch (error) {
      console.error("Error loading team members:", error);
      toast.error("Failed to load team members");
      setTeamMembers([]);
      setResolvedTeamId(null);
      setWorkspaceTeamName(null);
      setCampaignTeamMismatch(false);
    }
  };

  const handleSendApproval = async () => {
    const recipients = sendToWholeTeam 
      ? teamMembers.map(m => m.value)
      : selectedUsers;

    if (recipients.length === 0) {
      toast.error('Please select at least one recipient');
      return;
    }

    setSending(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_name, email')
        .eq('id', userData.user?.id)
        .single();

      const senderName = profile?.company_name || profile?.email || 'Media Planning Team';

      // Update campaign status to awaiting_approval if planDetails has campaignId
      if (planDetails.campaignId) {
        const { error: updateError } = await supabase
          .from('campaigns')
          .update({ status: 'awaiting_approval' })
          .eq('id', planDetails.campaignId);

        if (updateError) {
          console.error('Error updating campaign status:', updateError);
        }
      }

      const { error } = await supabase.functions.invoke('send-approval-email', {
        body: {
          recipientEmails: recipients,
          planName,
          planDetails: {
            ...planDetails,
            actiplanForecasts,
          },
          pdfBase64,
          excelBase64,
          senderName,
          campaignId: planDetails.campaignId,
        },
      });

      if (error) throw error;

      toast.success(`Approval request sent to ${recipients.length} recipient(s)`);
      onOpenChange(false);
      setSelectedUsers([]);
      setSendToWholeTeam(false);
    } catch (error: any) {
      console.error('Error sending approval emails:', error);
      toast.error(error.message || 'Failed to send approval emails');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send for Approval</DialogTitle>
          <DialogDescription>
            Select members of this ActiPlan&apos;s workspace team to send for approval. They will receive an email with full forecast data and PDF/Excel attachments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {workspaceTeamName && (
            <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
              Recipients match <span className="font-medium">Settings → Manage Your Team → {workspaceTeamName}</span>
              {campaignTeamMismatch && (
                <>
                  {" "}
                  <span className="text-amber-700 dark:text-amber-400">
                    (this ActiPlan was saved under a different team; save again after selecting {workspaceTeamName} in the
                    workspace switcher to align it).
                  </span>
                </>
              )}
            </p>
          )}
          {teamMembers.length > 0 ? (
            <>
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                <input
                  type="checkbox"
                  id="sendToWholeTeam"
                  checked={sendToWholeTeam}
                  onChange={(e) => {
                    setSendToWholeTeam(e.target.checked);
                    if (e.target.checked) {
                      setSelectedUsers([]);
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="sendToWholeTeam" className="cursor-pointer">
                  Send to whole team ({teamMembers.length} members)
                </Label>
              </div>

              {!sendToWholeTeam && (
                <div className="space-y-2">
                  <Label>Or select individual recipients</Label>
                  <MultiSelect
                    options={teamMembers}
                    value={selectedUsers}
                    onChange={setSelectedUsers}
                    placeholder="Select team members..."
                  />
                  <p className="text-xs text-muted-foreground">
                    {selectedUsers.length} recipient(s) selected
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="p-4 border rounded-lg bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground">
                {workspaceLoading
                  ? "Loading workspace team…"
                  : !activeWorkspaceId
                    ? "Select a workspace team in the switcher (top of the app), then try again."
                    : `No other members on "${workspaceTeamName ?? "this team"}" besides you. Invite ActiPlanners on Settings → Manage Your Team for that team.`}
              </p>
            </div>
          )}

          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium mb-1">Plan Summary</p>
            <p className="text-muted-foreground text-xs">
              {planName} • ${planDetails.totalBudget?.toLocaleString()} • {planDetails.platforms?.length} platform(s)
            </p>
            {actiplanForecasts && (
              <p className="text-muted-foreground text-xs mt-1">
                Includes full forecast data with {actiplanForecasts.platforms?.length || 0} platform(s) deliverables
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button 
            onClick={handleSendApproval} 
            disabled={sending || (selectedUsers.length === 0 && !sendToWholeTeam) || teamMembers.length === 0}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Send Approval Request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}