import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { CalendarIcon, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";

interface StatusHistoryEntry {
  status: string;
  changed_at: string;
  changed_by: string;
}

interface ModificationRequest {
  id: string;
  campaign_id: string;
  requester_id: string;
  change_type: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  requester_email?: string;
  platform?: string;
  campaign_name?: string;
  assigned_to?: string[];
  assigned_emails?: string[];
  status_history?: StatusHistoryEntry[];
  notify_all_team?: boolean;
}

interface ModificationRequestsViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  initialRequestId?: string;
}

export function ModificationRequestsView({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  initialRequestId,
}: ModificationRequestsViewProps) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ModificationRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ModificationRequest | null>(null);
  
  // Filters
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (open) {
      loadRequests();
    }
  }, [open, campaignId]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const { data: requestsData, error } = await supabase
        .from("modification_requests")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Fetch all user IDs (requesters and assigned users)
      const allUserIds = new Set<string>();
      requestsData?.forEach((r) => {
        allUserIds.add(r.requester_id);
        if (r.assigned_to) {
          r.assigned_to.forEach((id: string) => allUserIds.add(id));
        }
      });

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(allUserIds));

      const profilesMap = Object.fromEntries((profiles || []).map((p) => [p.id, p.email]));

      // Enrich requests with emails and extract platform from description
      const enrichedRequests = requestsData?.map((req) => {
        const platformMatch = req.description.match(/Platform: ([^\n]+)/);
        const assignedEmails = req.assigned_to?.map((id: string) => profilesMap[id] || "Unknown") || [];
        
        return {
          ...req,
          requester_email: profilesMap[req.requester_id] || "Unknown",
          platform: platformMatch ? platformMatch[1] : undefined,
          campaign_name: campaignName,
          assigned_emails: assignedEmails,
          status_history: (req.status_history as any) || [],
        };
      });

      setRequests(enrichedRequests || []);
    } catch (error: any) {
      console.error("Error loading modification requests:", error);
      toast.error("Failed to load modification requests");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (requestId: string, newStatus: string) => {
    setUpdating(true);
    try {
      // Find the request to get its details
      const request = requests.find(r => r.id === requestId);
      if (!request) throw new Error("Request not found");

      const { error } = await supabase
        .from("modification_requests")
        .update({ status: newStatus })
        .eq("id", requestId);

      if (error) throw error;

      // Send notification to stakeholders about status change
      try {
        await supabase.functions.invoke("send-modification-notification", {
          body: {
            campaignId,
            campaignName,
            changeType: request.change_type,
            description: request.description,
            notifyAllTeam: request.notify_all_team,
            assignedTo: request.assigned_to || [],
            requestId,
            notificationType: "status_change",
            newStatus,
            requesterId: request.requester_id,
          },
        });
      } catch (notifyError) {
        console.error("Failed to send status change notification:", notifyError);
        // Don't block the status update if notification fails
      }

      toast.success("Status updated successfully");
      await loadRequests();
      
      // Update selected request if it's the one being updated
      if (selectedRequest?.id === requestId) {
        const updatedRequest = requests.find(r => r.id === requestId);
        if (updatedRequest) {
          setSelectedRequest(updatedRequest);
        }
      }
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const canUpdateStatus = (request: ModificationRequest) => {
    if (!user?.id) return false;
    // Allow update if assigned to the request, or if notifyAllTeam is true for team members
    return request.assigned_to?.includes(user.id) || 
           (request.notify_all_team && request.requester_id !== user.id);
  };

  const getChangeTypeInitials = (type: string) => {
    const map: Record<string, string> = {
      budget: "BU",
      duration: "DU",
      market: "MK",
      targeting: "TG",
      goals: "GO",
      creative: "CR",
      note: "NT",
      other: "OT",
    };
    return map[type] || "??";
  };

  const getPlatformInitials = (platform?: string) => {
    if (!platform) return "AP"; // All Platforms
    const map: Record<string, string> = {
      "Meta": "ME",
      "Google Ads": "GA",
      "TikTok": "TT",
      "LinkedIn": "LI",
      "Twitter": "TW",
      "Snapchat": "SC",
    };
    return map[platform] || platform.substring(0, 2).toUpperCase();
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      sent: "bg-blue-500",
      in_progress: "bg-yellow-500",
      completed: "bg-green-500",
      rejected: "bg-red-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      // Date filter
      if (dateRange.from || dateRange.to) {
        const reqDate = new Date(req.created_at);
        if (dateRange.from && reqDate < dateRange.from) return false;
        if (dateRange.to) {
          const endOfDay = new Date(dateRange.to);
          endOfDay.setHours(23, 59, 59, 999);
          if (reqDate > endOfDay) return false;
        }
      }

      // Platform filter
      if (platformFilter !== "all" && req.platform !== platformFilter) {
        return false;
      }

      // Type filter
      if (typeFilter !== "all" && req.change_type !== typeFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== "all" && req.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [requests, dateRange, platformFilter, typeFilter, statusFilter]);

  const uniquePlatforms = useMemo(() => {
    const platforms = requests
      .map((r) => r.platform)
      .filter((p): p is string => p !== undefined);
    return [...new Set(platforms)];
  }, [requests]);

  const uniqueTypes = useMemo(() => {
    return [...new Set(requests.map((r) => r.change_type))];
  }, [requests]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Modification Requests - {campaignName}</DialogTitle>
          <DialogDescription>
            Track all modification requests and their status
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Date Range</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[240px] justify-start text-left font-normal",
                        !dateRange.from && !dateRange.to && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd, yyyy")}
                          </>
                        ) : (
                          format(dateRange.from, "MMM dd, yyyy")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                      numberOfMonths={2}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Platform</label>
                <Select value={platformFilter} onValueChange={setPlatformFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {uniquePlatforms.map((platform) => (
                      <SelectItem key={platform} value={platform}>
                        {platform}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {uniqueTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(dateRange.from || dateRange.to || platformFilter !== "all" || typeFilter !== "all" || statusFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateRange({ from: undefined, to: undefined });
                    setPlatformFilter("all");
                    setTypeFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>

            {/* Horizontal Timeline */}
            <Card className="overflow-hidden">
              <CardContent className="p-6">
                {filteredRequests.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    No modification requests found
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
                      <span>Older</span>
                      <div className="flex-1 h-px bg-border" />
                      <span>Newer</span>
                    </div>
                    
                    <ScrollArea className="w-full">
                      <div className="relative pb-4">
                        {/* Horizontal timeline line */}
                        <div className="absolute top-8 left-0 right-0 h-0.5 bg-border" />

                        {/* Request items */}
                        <div className="flex gap-4 px-4">
                          {filteredRequests.map((request) => (
                            <TooltipProvider key={request.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className={cn(
                                      "relative cursor-pointer transition-all min-w-[120px]",
                                      selectedRequest?.id === request.id && "scale-110"
                                    )}
                                    onClick={() => setSelectedRequest(request)}
                                  >
                                    {/* Status dot */}
                                    <div
                                      className={cn(
                                        "mx-auto w-6 h-6 rounded-full border-4 border-background shadow-lg transition-all",
                                        getStatusColor(request.status),
                                        selectedRequest?.id === request.id && "ring-2 ring-primary ring-offset-2"
                                      )}
                                    />

                                    {/* Initials badge */}
                                    <div className="mt-2 flex justify-center">
                                      <Badge 
                                        variant={selectedRequest?.id === request.id ? "default" : "secondary"} 
                                        className="text-xs font-mono"
                                      >
                                        {getChangeTypeInitials(request.change_type)}/{getPlatformInitials(request.platform)}
                                      </Badge>
                                    </div>

                                    <div className="mt-1 text-center">
                                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                                        {format(new Date(request.created_at), "MMM dd")}
                                      </p>
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <div className="space-y-1">
                                    <p className="font-medium">
                                      {request.change_type.charAt(0).toUpperCase() + request.change_type.slice(1)}
                                    </p>
                                    {request.platform && <p className="text-xs">Platform: {request.platform}</p>}
                                    <p className="text-xs text-muted-foreground">
                                      {format(new Date(request.created_at), "MMM dd, yyyy HH:mm:ss")}
                                    </p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))}
                        </div>
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Details Panel */}
            {selectedRequest && (
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">
                          {selectedRequest.change_type.charAt(0).toUpperCase() + selectedRequest.change_type.slice(1)} Modification
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Requested by {selectedRequest.requester_email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={selectedRequest.status === "completed" ? "default" : "secondary"}>
                          {selectedRequest.status}
                        </Badge>
                        {canUpdateStatus(selectedRequest) && selectedRequest.status !== "completed" && (
                          <Button
                            size="sm"
                            onClick={() => handleStatusUpdate(selectedRequest.id, "completed")}
                            disabled={updating}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Mark Complete
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Platform:</span>{" "}
                        <span className="font-medium">{selectedRequest.platform || "All Platforms"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Created:</span>{" "}
                        <span className="font-medium">
                          {format(new Date(selectedRequest.created_at), "MMM dd, yyyy HH:mm")}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>{" "}
                        <span className="font-medium">{selectedRequest.change_type}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Updated:</span>{" "}
                        <span className="font-medium">
                          {format(new Date(selectedRequest.updated_at), "MMM dd, yyyy HH:mm")}
                        </span>
                      </div>
                    </div>

                    {selectedRequest.assigned_emails && selectedRequest.assigned_emails.length > 0 && (
                      <div className="pt-2 border-t">
                        <span className="text-sm font-medium text-muted-foreground">Assigned To:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedRequest.assigned_emails.map((email, idx) => (
                            <Badge key={idx} variant="outline">
                              {email}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t">
                      <span className="text-sm font-medium text-muted-foreground">Description:</span>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{selectedRequest.description}</p>
                    </div>

                    {selectedRequest.status_history && selectedRequest.status_history.length > 1 && (
                      <div className="pt-2 border-t">
                        <span className="text-sm font-medium text-muted-foreground">Status History:</span>
                        <div className="mt-2 space-y-2">
                          {selectedRequest.status_history.map((entry, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <div className={cn("w-2 h-2 rounded-full", getStatusColor(entry.status))} />
                              <span className="font-medium">{entry.status}</span>
                              <span className="text-muted-foreground">
                                {format(new Date(entry.changed_at), "MMM dd, yyyy HH:mm")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
