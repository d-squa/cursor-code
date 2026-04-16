import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChangeHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
}

interface HistoryEntry {
  id: string;
  action: string;
  change_type: string | null;
  description: string | null;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
  profiles: {
    email: string;
  } | null;
}

export function ChangeHistoryDialog({
  open,
  onOpenChange,
  campaignId,
  campaignName,
}: ChangeHistoryDialogProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadHistory();
    }
  }, [open, campaignId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("campaign_change_history")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch profiles separately
      const userIds = [...new Set((data || []).map((entry: any) => entry.user_id).filter(Boolean))];
      const profilesMap: Record<string, any> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", userIds);

        (profiles || []).forEach((p: any) => {
          profilesMap[p.id] = p;
        });
      }

      // Map profiles to history entries
      const enrichedHistory = (data || []).map((entry: any) => ({
        ...entry,
        profiles: entry.user_id && profilesMap[entry.user_id]
          ? { email: profilesMap[entry.user_id].email }
          : null,
      }));

      setHistory(enrichedHistory);
    } catch (error: any) {
      console.error("Error loading history:", error);
      toast.error("Failed to load change history");
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      approved: "Approved",
      rejected: "Rejected",
      modification_requested: "Modification Requested",
      modification_accepted: "Modification Accepted",
      modification_completed: "Modification Completed",
      pushed_to_dsp: "Pushed to DSP",
      creatives_pushed_to_dsp: "Creatives Pushed to DSP",
      qc_transition: "QC Stage Updated",
      qc_check_completed: "QC Item Checked",
      qc_check_reopened: "QC Item Unchecked",
      qc_bulk_check_completed: "Bulk QC Completed",
      qc_bulk_check_reopened: "Bulk QC Reopened",
      partially_pushed: "Partially Pushed",
      created: "Created",
      updated: "Updated",
    };
    return labels[action] || action;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change History - {campaignName}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No history entries found</p>
          ) : (
            <div className="space-y-4">
              {history.map((entry) => (
                <div key={entry.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{getActionLabel(entry.action)}</p>
                      <p className="text-sm text-muted-foreground">
                        by {entry.profiles?.email || "Unknown"}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(entry.created_at), "MMM dd, yyyy HH:mm")}
                    </p>
                  </div>

                  {entry.change_type && (
                    <p className="text-sm">
                      <span className="font-medium">Change Type:</span>{" "}
                      {entry.change_type.charAt(0).toUpperCase() + entry.change_type.slice(1)}
                    </p>
                  )}

                  {entry.description && (
                    <p className="text-sm">
                      <span className="font-medium">Description:</span> {entry.description}
                    </p>
                  )}

                  {entry.old_status && entry.new_status && (
                    <p className="text-sm">
                      <span className="font-medium">Status Change:</span>{" "}
                      {entry.old_status} → {entry.new_status}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
