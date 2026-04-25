import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarIcon, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

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
  user_id: string | null;
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
  const [changeTypeFilter, setChangeTypeFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

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
      setup_mistake_logged: "Setup Mistake Logged",
      created: "Created",
      updated: "Updated",
    };
    return labels[action] || action;
  };

  // Build filter option lists from loaded history
  const changeTypeOptions = useMemo(() => {
    const set = new Set<string>();
    history.forEach((h) => {
      if (h.change_type) set.add(h.change_type);
    });
    return Array.from(set).sort();
  }, [history]);

  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    history.forEach((h) => {
      if (h.user_id) {
        map.set(h.user_id, h.profiles?.email || "Unknown");
      }
    });
    return Array.from(map.entries()).map(([id, email]) => ({ id, email }));
  }, [history]);

  const filteredHistory = useMemo(() => {
    return history.filter((entry) => {
      if (changeTypeFilter !== "all" && entry.change_type !== changeTypeFilter) return false;
      if (userFilter !== "all" && entry.user_id !== userFilter) return false;
      if (dateRange?.from) {
        const created = new Date(entry.created_at);
        if (created < dateRange.from) return false;
        if (dateRange.to) {
          const end = new Date(dateRange.to);
          end.setHours(23, 59, 59, 999);
          if (created > end) return false;
        }
      }
      return true;
    });
  }, [history, changeTypeFilter, userFilter, dateRange]);

  const hasActiveFilters =
    changeTypeFilter !== "all" || userFilter !== "all" || !!dateRange?.from;

  const clearFilters = () => {
    setChangeTypeFilter("all");
    setUserFilter("all");
    setDateRange(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change History - {campaignName}</DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap pb-2 border-b">
          <Select value={changeTypeFilter} onValueChange={setChangeTypeFilter}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Change type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All change types</SelectItem>
              {changeTypeOptions.map((ct) => (
                <SelectItem key={ct} value={ct}>
                  {ct.charAt(0).toUpperCase() + ct.slice(1).replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue placeholder="User" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {userOptions.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 text-xs justify-start font-normal",
                  !dateRange?.from && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "MMM d")} – {format(dateRange.to, "MMM d, yyyy")}
                    </>
                  ) : (
                    format(dateRange.from, "MMM d, yyyy")
                  )
                ) : (
                  <span>Date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-xs">
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {filteredHistory.length} of {history.length}
          </span>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {history.length === 0 ? "No history entries found" : "No entries match the selected filters"}
            </p>
          ) : (
            <div className="space-y-4">
              {filteredHistory.map((entry) => (
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
