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
import { CalendarIcon, Loader2, FileEdit, ClipboardList, ArrowRight, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ActivityLogViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
}

interface UnifiedLogEntry {
  id: string;
  type: "change_request" | "action_log";
  title: string;
  description: string | null;
  category: string;
  status?: string;
  platforms: string[];
  markets: string[];
  phases: string[];
  user_email: string;
  created_at: string;
  metadata?: any;
  isSetupMistake?: boolean;
  mistakeStatus?: "open" | "resolved" | null;
}

export function ActivityLogView({
  open,
  onOpenChange,
  campaignId,
  campaignName,
}: ActivityLogViewProps) {
  const [logs, setLogs] = useState<UnifiedLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<UnifiedLogEntry | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "requests" | "actions" | "setup_mistakes">("all");
  
  // Filters
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    if (open) {
      loadLogs();
    }
  }, [open, campaignId]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      // Fetch modification requests
      const { data: requests, error: reqError } = await supabase
        .from("modification_requests")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });

      if (reqError) throw reqError;

      // Fetch activity logs
      const { data: actions, error: actError } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });

      if (actError) throw actError;

      // Fetch setup_mistakes for status enrichment of mirrored activity log entries
      const { data: mistakes } = await (supabase.from("setup_mistakes" as any) as any)
        .select("id, title, status, created_at")
        .eq("campaign_id", campaignId);
      const mistakesByKey = new Map<string, "open" | "resolved">();
      (mistakes || []).forEach((m: any) => {
        // Match by id (preferred) and by title+timestamp (fallback for older logs)
        if (m.id) mistakesByKey.set(`id:${m.id}`, m.status);
        mistakesByKey.set(`title:${m.title}`, m.status);
      });

      // Collect all user IDs
      const allUserIds = new Set<string>();
      requests?.forEach((r) => allUserIds.add(r.requester_id));
      actions?.forEach((a) => allUserIds.add(a.user_id));

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(allUserIds));

      const profilesMap = Object.fromEntries((profiles || []).map((p) => [p.id, p.email]));

      // Transform requests to unified format
      const requestLogs: UnifiedLogEntry[] = (requests || []).map((req) => {
        const platformMatch = req.description?.match(/Platform: ([^\n]+)/);
        const marketsMatch = req.description?.match(/Markets: ([^\n]+)/);
        const phasesMatch = req.description?.match(/Phases: ([^\n]+)/);
        
        return {
          id: req.id,
          type: "change_request",
          title: `${req.change_type.charAt(0).toUpperCase() + req.change_type.slice(1)} Change Request`,
          description: req.description?.replace(/Platform: [^\n]+\n?/, "").replace(/Markets: [^\n]+\n?/, "").replace(/Phases: [^\n]+\n?/, "") || null,
          category: req.change_type,
          status: req.status,
          platforms: platformMatch ? [platformMatch[1]] : [],
          markets: marketsMatch ? marketsMatch[1].split(", ") : [],
          phases: phasesMatch ? phasesMatch[1].split(", ") : [],
          user_email: profilesMap[req.requester_id] || "Unknown",
          created_at: req.created_at,
        };
      });

      // Transform actions to unified format
      const actionLogs: UnifiedLogEntry[] = (actions || []).map((act) => {
        const isSetupMistake = act.action_type === "setup_mistake";
        const linkedId = (act.metadata as any)?.setup_mistake_id;
        let mistakeStatus: "open" | "resolved" | null = null;
        if (isSetupMistake) {
          mistakeStatus =
            (linkedId && mistakesByKey.get(`id:${linkedId}`)) ||
            mistakesByKey.get(`title:${act.title}`) ||
            "open";
        }
        return {
          id: act.id,
          type: "action_log",
          title: act.title,
          description: act.description,
          category: act.action_type,
          platforms: act.affected_platforms || [],
          markets: act.affected_markets || [],
          phases: act.affected_phases || [],
          user_email: profilesMap[act.user_id] || "Unknown",
          created_at: act.created_at,
          metadata: act.metadata,
          isSetupMistake,
          mistakeStatus,
          status: isSetupMistake ? mistakeStatus ?? undefined : undefined,
        };
      });

      // Merge and sort by date
      const allLogs = [...requestLogs, ...actionLogs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setLogs(allLogs);
    } catch (error: any) {
      console.error("Error loading activity logs:", error);
      toast.error("Failed to load activity logs");
    } finally {
      setLoading(false);
    }
  };

  const getEntryIcon = (entry: UnifiedLogEntry) => {
    if (entry.isSetupMistake) return AlertOctagon;
    return entry.type === "change_request" ? FileEdit : ClipboardList;
  };

  const getEntryColor = (entry: UnifiedLogEntry) => {
    if (entry.isSetupMistake) {
      return entry.mistakeStatus === "resolved" ? "bg-emerald-600" : "bg-destructive";
    }
    return entry.type === "change_request" ? "bg-blue-500" : "bg-emerald-500";
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      sent: "secondary",
      in_progress: "default",
      completed: "default",
      rejected: "destructive",
      open: "destructive",
      resolved: "default",
    };
    return (
      <Badge variant={variants[status] || "secondary"} className="text-xs">
        {status.replace("_", " ")}
      </Badge>
    );
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      // Change Request types
      budget_increase: "Budget Increase",
      budget_decrease: "Budget Decrease",
      duration_extension: "Duration Extension",
      market_expansion: "Market Expansion",
      targeting_change: "Targeting Change",
      goals_update: "Goals/KPI Update",
      creative_change: "Creative Change",
      pause_request: "Pause Request",
      // Submit Request types
      budget_change: "Budget Change",
      creative_optimization: "Creative Optimization",
      pause_enable_campaigns: "Pause/Enable Campaigns",
      targeting_optimization: "Targeting Optimization",
      audience_expansion: "Audience Expansion",
      bid_adjustment: "Bid Adjustment",
      schedule_change: "Schedule Change",
      landing_page_update: "Landing Page Update",
      ad_copy_update: "Ad Copy Update",
      placement_change: "Placement Change",
      conversion_tracking: "Conversion Tracking Setup",
      pixel_implementation: "Pixel Implementation",
      reporting_request: "Reporting Request",
      // Logged Action types
      budget_adjustment: "Budget Adjustment",
      creative_update: "Creative Update",
      campaign_pause_resume: "Campaign Pause/Resume",
      audience_update: "Audience Update",
      bid_change: "Bid Change",
      schedule_modification: "Schedule Modification",
      landing_page_change: "Landing Page Change",
      ad_copy_change: "Ad Copy Change",
      placement_update: "Placement Update",
      conversion_setup: "Conversion Setup",
      reporting_delivery: "Reporting Delivery",
      setup_mistake: "Setup Mistake",
      note: "Note/Comment",
      other: "Other",
      // Legacy types for backwards compatibility
      budget: "Budget",
      duration: "Duration",
      market: "Market",
      targeting: "Targeting",
      goals: "Goals",
      creative: "Creative",
      pause_resume: "Pause/Resume",
    };
    return labels[category] || category;
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Tab filter
      if (activeTab === "requests" && log.type !== "change_request") return false;
      if (activeTab === "actions" && log.type !== "action_log") return false;
      if (activeTab === "setup_mistakes" && !log.isSetupMistake) return false;

      // Date filter
      if (dateRange.from || dateRange.to) {
        const logDate = new Date(log.created_at);
        if (dateRange.from && logDate < dateRange.from) return false;
        if (dateRange.to) {
          const endOfDay = new Date(dateRange.to);
          endOfDay.setHours(23, 59, 59, 999);
          if (logDate > endOfDay) return false;
        }
      }

      // Category filter
      if (categoryFilter !== "all" && log.category !== categoryFilter) {
        return false;
      }

      return true;
    });
  }, [logs, activeTab, dateRange, categoryFilter]);

  const uniqueCategories = useMemo(() => {
    return [...new Set(logs.map((l) => l.category))];
  }, [logs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Activity Log - {campaignName}</DialogTitle>
          <DialogDescription>
            View all change requests and logged actions for this campaign
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">
              All Activity ({logs.length})
            </TabsTrigger>
            <TabsTrigger value="requests">
              Change Requests ({logs.filter((l) => l.type === "change_request").length})
            </TabsTrigger>
            <TabsTrigger value="actions">
              Logged Actions ({logs.filter((l) => l.type === "action_log").length})
            </TabsTrigger>
            <TabsTrigger value="setup_mistakes">
              Setup Mistakes ({logs.filter((l) => l.isSetupMistake).length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="flex-1 flex flex-col min-h-0 mt-4">
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
                            "w-[200px] justify-start text-left font-normal",
                            !dateRange.from && !dateRange.to && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange.from ? (
                            dateRange.to ? (
                              <>
                                {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd")}
                              </>
                            ) : (
                              format(dateRange.from, "MMM dd, yyyy")
                            )
                          ) : (
                            <span>Pick dates</span>
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
                    <label className="text-xs text-muted-foreground">Category</label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {uniqueCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {getCategoryLabel(cat)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(dateRange.from || dateRange.to || categoryFilter !== "all") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDateRange({ from: undefined, to: undefined });
                        setCategoryFilter("all");
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                {/* Content */}
                <div className="flex gap-4 flex-1 min-h-0">
                  {/* Timeline List */}
                  <Card className="flex-1 overflow-hidden">
                    <ScrollArea className="h-[400px]">
                      <CardContent className="p-4">
                        {filteredLogs.length === 0 ? (
                          <div className="flex items-center justify-center py-12 text-muted-foreground">
                            No activity found
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {filteredLogs.map((log) => {
                              const Icon = getEntryIcon(log);
                              return (
                                <div
                                  key={`${log.type}-${log.id}`}
                                  className={cn(
                                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                                    selectedEntry?.id === log.id && selectedEntry?.type === log.type
                                      ? "bg-accent border-primary"
                                      : "hover:bg-muted/50"
                                  )}
                                  onClick={() => setSelectedEntry(log)}
                                >
                                  <div
                                    className={cn(
                                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                      getEntryColor(log)
                                    )}
                                  >
                                    <Icon className="w-4 h-4 text-white" />
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-medium text-sm truncate">{log.title}</p>
                                      {getStatusBadge(log.status)}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                      <span>{log.user_email}</span>
                                      <span>•</span>
                                      <span>{format(new Date(log.created_at), "MMM dd, yyyy HH:mm")}</span>
                                    </div>
                                    {log.platforms.length > 0 && (
                                      <div className="flex gap-1 mt-2 flex-wrap">
                                        {log.platforms.map((p) => (
                                          <Badge key={p} variant="outline" className="text-xs">
                                            {p}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </ScrollArea>
                  </Card>

                  {/* Detail Panel */}
                  {selectedEntry && (
                    <Card className="w-[300px] shrink-0">
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          <div>
                            <Badge variant={selectedEntry.type === "change_request" ? "default" : "secondary"}>
                              {selectedEntry.type === "change_request" ? "Change Request" : "Logged Action"}
                            </Badge>
                          </div>

                          <div>
                            <h3 className="font-semibold">{selectedEntry.title}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              by {selectedEntry.user_email}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(selectedEntry.created_at), "MMMM dd, yyyy 'at' HH:mm")}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Category</p>
                            <p className="text-sm">{getCategoryLabel(selectedEntry.category)}</p>
                          </div>

                          {selectedEntry.status && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Status</p>
                              {getStatusBadge(selectedEntry.status)}
                            </div>
                          )}

                          {selectedEntry.description && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Description</p>
                              <p className="text-sm whitespace-pre-wrap">{selectedEntry.description}</p>
                            </div>
                          )}

                          {selectedEntry.platforms.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Platforms</p>
                              <div className="flex gap-1 flex-wrap">
                                {selectedEntry.platforms.map((p) => (
                                  <Badge key={p} variant="outline" className="text-xs">
                                    {p}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {selectedEntry.markets.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Markets</p>
                              <div className="flex gap-1 flex-wrap">
                                {selectedEntry.markets.map((m) => (
                                  <Badge key={m} variant="outline" className="text-xs">
                                    {m}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {selectedEntry.phases.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Phases</p>
                              <div className="flex gap-1 flex-wrap">
                                {selectedEntry.phases.map((p) => (
                                  <Badge key={p} variant="outline" className="text-xs">
                                    {p}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
