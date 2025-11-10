import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MultiSelect } from "@/components/ui/multi-select";

interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string;
  planDetails: any;
  pdfBase64: string;
}

export function ApprovalDialog({
  open,
  onOpenChange,
  planName,
  planDetails,
  pdfBase64,
}: ApprovalDialogProps) {
  const [sending, setSending] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<Array<{ value: string; label: string }>>([]);

  // Load team members when dialog opens
  useState(() => {
    if (open) {
      loadTeamMembers();
    }
  });

  const loadTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, company_name')
        .neq('id', (await supabase.auth.getUser()).data.user?.id); // Exclude current user

      if (error) throw error;

      const members = (data || []).map((member) => ({
        value: member.email,
        label: member.company_name || member.email,
      }));

      setTeamMembers(members);
    } catch (error) {
      console.error('Error loading team members:', error);
      toast.error('Failed to load team members');
    }
  };

  const handleSendApproval = async () => {
    if (selectedUsers.length === 0) {
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

      const { error } = await supabase.functions.invoke('send-approval-email', {
        body: {
          recipientEmails: selectedUsers,
          planName,
          planDetails,
          pdfBase64,
          senderName,
        },
      });

      if (error) throw error;

      toast.success(`Approval request sent to ${selectedUsers.length} recipient(s)`);
      onOpenChange(false);
      setSelectedUsers([]);
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
            Select team members to send this media plan for approval. They will receive an email with the plan details and PDF attachment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Recipients</Label>
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

          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium mb-1">Plan Summary</p>
            <p className="text-muted-foreground text-xs">
              {planName} • ${planDetails.totalBudget?.toLocaleString()} • {planDetails.platforms?.length} platform(s)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSendApproval} disabled={sending || selectedUsers.length === 0}>
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
