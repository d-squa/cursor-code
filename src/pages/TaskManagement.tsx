import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, ArrowLeft, Search, MessageSquare, Clock, CheckCircle2, Send, User, Calendar, ExternalLink, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Comment {
  id: string;
  content: string;
  user_id: string;
  user_email?: string;
  created_at: string;
}

interface Task {
  id: string;
  campaign_id: string;
  campaign_name?: string;
  requester_id: string;
  requester_email?: string;
  change_type: string;
  description: string;
  status: string;
  assigned_to: string[] | null;
  assigned_emails?: string[];
  notify_all_team: boolean | null;
  created_at: string;
  updated_at: string;
  estimated_hours: number | null;
  actual_hours: number | null;
  completed_by: string | null;
  completed_at: string | null;
  comments?: Comment[];
  task_type: "modification" | "approval";
}

const STATUS_OPTIONS = [
  { value: "sent", label: "Sent", color: "bg-blue-500" },
  { value: "in_progress", label: "In Progress", color: "bg-yellow-500" },
  { value: "completed", label: "Completed", color: "bg-green-500" },
  { value: "rejected", label: "Rejected", color: "bg-red-500" },
  { value: "pending_approval", label: "Pending Approval", color: "bg-orange-500" },
];

export default function TaskManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { hasAccess } = useFeatureAccess();
  const hasTaskAccess = hasAccess('task_management');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (user && activeWorkspaceId) {
      loadTasks();
      checkAdminStatus();
    }
  }, [user, activeWorkspaceId]);

  const checkAdminStatus = async () => {
    if (!user || !activeWorkspaceId) return;
    
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("team_id", activeWorkspaceId)
      .single();
    
    setIsAdmin(data?.role === "admin" || data?.role === "owner");
  };

  const loadTasks = async () => {
    if (!user || !activeWorkspaceId) return;
    setLoading(true);
    
    try {
      // Fetch tasks where user is assigned OR (admin viewing all team tasks)
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role, team_id")
        .eq("user_id", user.id);
      
      const isAdminOrOwner = userRoles?.some(r => 
        r.team_id === activeWorkspaceId && (r.role === "admin" || r.role === "owner")
      );
      
      // Get campaigns in the workspace
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, name, status, user_id, created_at, updated_at")
        .eq("team_id", activeWorkspaceId);
      
      const campaignIds = campaigns?.map(c => c.id) || [];
      const campaignsMap = Object.fromEntries((campaigns || []).map(c => [c.id, c.name]));
      
      // Find campaigns that need approval
      const approvalCampaigns = (campaigns || []).filter(c => c.status === "pending_approval");
      
      if (campaignIds.length === 0) {
        setTasks([]);
        setLoading(false);
        return;
      }
      
      // Fetch modification requests for these campaigns
      const { data: requestsData, error } = await supabase
        .from("modification_requests")
        .select("*")
        .in("campaign_id", campaignIds)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      // Filter to show only assigned tasks (or all for admin)
      const filteredRequests = (requestsData || []).filter(req => {
        // If admin/owner, show all team tasks
        if (isAdminOrOwner) return true;
        // Otherwise, show only tasks assigned to the user or where notify_all_team is true
        return req.assigned_to?.includes(user.id) || req.notify_all_team === true;
      });
      
      // Collect all user IDs for profile lookup
      const allUserIds = new Set<string>();
      filteredRequests.forEach(req => {
        allUserIds.add(req.requester_id);
        if (req.assigned_to) {
          req.assigned_to.forEach((id: string) => allUserIds.add(id));
        }
      });
      
      // Add approval campaign owners to user IDs lookup
      approvalCampaigns.forEach(c => allUserIds.add(c.user_id));
      
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(allUserIds));
      
      const profilesMap = Object.fromEntries((profiles || []).map(p => [p.id, p.email]));
      
      // Fetch comments for all requests
      const requestIds = filteredRequests.map(r => r.id);
      let commentsMap: Record<string, Comment[]> = {};
      
      if (requestIds.length > 0) {
        const { data: comments } = await supabase
          .from("request_comments")
          .select("*")
          .in("request_id", requestIds)
          .order("created_at", { ascending: true });
        
        // Get comment user emails
        const commentUserIds = new Set((comments || []).map(c => c.user_id));
        const { data: commentProfiles } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", Array.from(commentUserIds));
        
        const commentProfilesMap = Object.fromEntries((commentProfiles || []).map(p => [p.id, p.email]));
        
        (comments || []).forEach(comment => {
          if (!commentsMap[comment.request_id]) {
            commentsMap[comment.request_id] = [];
          }
          commentsMap[comment.request_id].push({
            ...comment,
            user_email: commentProfilesMap[comment.user_id] || "Unknown"
          });
        });
      }
      
      // Enrich modification request tasks
      const modificationTasks: Task[] = filteredRequests.map(req => ({
        ...req,
        campaign_name: campaignsMap[req.campaign_id] || "Unknown Campaign",
        requester_email: profilesMap[req.requester_id] || "Unknown",
        assigned_emails: (req.assigned_to || []).map((id: string) => profilesMap[id] || "Unknown"),
        comments: commentsMap[req.id] || [],
        task_type: "modification" as const,
      }));
      
      // Create approval tasks from campaigns with pending_approval status
      // Only show these to admin users
      const approvalTasks: Task[] = isAdminOrOwner ? approvalCampaigns.map(campaign => ({
        id: `approval-${campaign.id}`,
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        requester_id: campaign.user_id,
        requester_email: profilesMap[campaign.user_id] || "Unknown",
        change_type: "approval_request",
        description: `ActiPlan "${campaign.name}" is awaiting approval before launch.`,
        status: "pending_approval",
        assigned_to: null,
        assigned_emails: [],
        notify_all_team: false,
        created_at: campaign.created_at,
        updated_at: campaign.updated_at,
        estimated_hours: null,
        actual_hours: null,
        completed_by: null,
        completed_at: null,
        comments: [],
        task_type: "approval" as const,
      })) : [];

      // Fetch Setup Mistakes for these campaigns and surface them as tasks for
      // the creator (always) and team admins (when viewing all tasks).
      const { data: mistakeRows } = await (supabase.from("setup_mistakes" as any) as any)
        .select("*")
        .in("campaign_id", campaignIds)
        .order("created_at", { ascending: false });
      const filteredMistakes = (mistakeRows || []).filter((m: any) =>
        isAdminOrOwner || m.created_by === user.id
      );
      // Make sure mistake creator emails are loaded
      const mistakeUserIds = new Set<string>();
      filteredMistakes.forEach((m: any) => {
        mistakeUserIds.add(m.created_by);
        if (m.resolved_by) mistakeUserIds.add(m.resolved_by);
      });
      const missingMistakeUserIds = Array.from(mistakeUserIds).filter(id => !profilesMap[id]);
      if (missingMistakeUserIds.length > 0) {
        const { data: extraProfiles } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", missingMistakeUserIds);
        (extraProfiles || []).forEach(p => { profilesMap[p.id] = p.email; });
      }
      const mistakeTasks: Task[] = filteredMistakes.map((m: any) => {
        const scopeBits = [m.platform, m.market, m.phase_name, m.ad_set_name, m.ad_name].filter(Boolean);
        const scope = scopeBits.length ? ` (${scopeBits.join(" › ")})` : "";
        return {
          id: `setup-mistake-${m.id}`,
          campaign_id: m.campaign_id,
          campaign_name: campaignsMap[m.campaign_id] || "Unknown Campaign",
          requester_id: m.created_by,
          requester_email: profilesMap[m.created_by] || "Unknown",
          change_type: "setup_mistake",
          description: `${m.title}${scope}${m.description ? `\n\n${m.description}` : ""}`,
          status: m.status === "resolved" ? "completed" : "in_progress",
          assigned_to: [m.created_by],
          assigned_emails: [profilesMap[m.created_by] || "Unknown"],
          notify_all_team: false,
          created_at: m.created_at,
          updated_at: m.updated_at,
          estimated_hours: null,
          actual_hours: null,
          completed_by: m.resolved_by,
          completed_at: m.resolved_at,
          comments: [],
          task_type: "modification" as const,
        };
      });

      // Combine all tasks and sort by created_at
      const allTasks = [...modificationTasks, ...approvalTasks, ...mistakeTasks].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      setTasks(allTasks);
      setIsAdmin(isAdminOrOwner || false);
    } catch (error: any) {
      console.error("Error loading tasks:", error);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (taskId: string, newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) throw new Error("Task not found");
      
      const updatePayload: any = { 
        status: newStatus,
        updated_at: new Date().toISOString()
      };
      
      // If completing, record who completed it
      if (newStatus === "completed") {
        updatePayload.completed_by = user?.id;
        updatePayload.completed_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from("modification_requests")
        .update(updatePayload)
        .eq("id", taskId);
      
      if (error) throw error;
      
      // Send notification
      try {
        await supabase.functions.invoke("send-modification-notification", {
          body: {
            campaignId: task.campaign_id,
            campaignName: task.campaign_name,
            changeType: task.change_type,
            description: task.description,
            notifyAllTeam: task.notify_all_team,
            assignedTo: task.assigned_to || [],
            requestId: taskId,
            notificationType: "status_change",
            newStatus,
            requesterId: task.requester_id,
          },
        });
      } catch (notifyError) {
        console.error("Failed to send notification:", notifyError);
      }
      
      toast.success("Status updated successfully");
      await loadTasks();
      
      // Update selected task if open
      if (selectedTask?.id === taskId) {
        const updated = tasks.find(t => t.id === taskId);
        if (updated) {
          setSelectedTask({ ...updated, status: newStatus });
        }
      }
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedTask || !newComment.trim() || !user) return;
    
    setSubmittingComment(true);
    try {
      const { error } = await supabase
        .from("request_comments")
        .insert({
          request_id: selectedTask.id,
          user_id: user.id,
          content: newComment.trim(),
        });
      
      if (error) throw error;
      
      toast.success("Comment added");
      setNewComment("");
      await loadTasks();
      
      // Update selected task with new comment
      const updated = tasks.find(t => t.id === selectedTask.id);
      if (updated) {
        setSelectedTask(updated);
      }
    } catch (error: any) {
      console.error("Error adding comment:", error);
      toast.error("Failed to add comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_OPTIONS.find(s => s.value === status);
    return (
      <Badge className={cn("text-white", config?.color || "bg-gray-500")}>
        {config?.label || status}
      </Badge>
    );
  };

  const getChangeTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      budget_change: "Budget Change",
      creative_optimization: "Creative Optimization",
      pause_enable_campaigns: "Pause/Enable",
      targeting_optimization: "Targeting",
      audience_expansion: "Audience Expansion",
      bid_adjustment: "Bid Adjustment",
      schedule_change: "Schedule Change",
      landing_page_update: "Landing Page",
      ad_copy_update: "Ad Copy Update",
      placement_change: "Placement Change",
      conversion_tracking: "Conversion Tracking",
      pixel_implementation: "Pixel Implementation",
      reporting_request: "Reporting Request",
      budget: "Budget",
      duration: "Duration",
      market: "Market",
      targeting: "Targeting",
      goals: "Goals",
      creative: "Creative",
      note: "Note",
      other: "Other",
      approval_request: "Approval Required",
    };
    return labels[type] || type;
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Status filter
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch = 
          task.description?.toLowerCase().includes(searchLower) ||
          task.campaign_name?.toLowerCase().includes(searchLower) ||
          task.change_type?.toLowerCase().includes(searchLower) ||
          task.requester_email?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      return true;
    });
  }, [tasks, statusFilter, search]);

  const tasksByStatus = useMemo(() => ({
    all: filteredTasks,
    pending_approval: filteredTasks.filter(t => t.status === "pending_approval"),
    sent: filteredTasks.filter(t => t.status === "sent"),
    in_progress: filteredTasks.filter(t => t.status === "in_progress"),
    completed: filteredTasks.filter(t => t.status === "completed"),
    rejected: filteredTasks.filter(t => t.status === "rejected"),
  }), [filteredTasks]);

  const openTaskDetails = (task: Task) => {
    // Refresh task data to get latest comments
    const freshTask = tasks.find(t => t.id === task.id);
    setSelectedTask(freshTask || task);
    setDetailsOpen(true);
  };

  // Feature gate - show upgrade prompt if no access
  if (!hasTaskAccess) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/app/overview")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">My Tasks</h1>
              <p className="text-muted-foreground text-sm">
                Manage requests and approvals
              </p>
            </div>
          </div>
        </div>
        
        <Card className="max-w-lg mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Task Management is an Enterprise Feature</CardTitle>
            <CardDescription>
              Upgrade to Enterprise or Agency plan to access task management, modification requests tracking, and approval workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate("/app/settings/plans")}>
              Upgrade Plan
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/app/overview")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">My Tasks</h1>
            <p className="text-muted-foreground text-sm">
              {isAdmin ? "All team requests and tasks" : "Requests assigned to you"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="all" className="space-y-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">
            All ({tasksByStatus.all.length})
          </TabsTrigger>
          <TabsTrigger value="pending_approval">
            Pending Approval ({tasksByStatus.pending_approval.length})
          </TabsTrigger>
          <TabsTrigger value="sent">
            Sent ({tasksByStatus.sent.length})
          </TabsTrigger>
          <TabsTrigger value="in_progress">
            In Progress ({tasksByStatus.in_progress.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({tasksByStatus.completed.length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected ({tasksByStatus.rejected.length})
          </TabsTrigger>
        </TabsList>

        {["all", "pending_approval", "sent", "in_progress", "completed", "rejected"].map((status) => (
          <TabsContent key={status} value={status} className="space-y-4">
            {tasksByStatus[status as keyof typeof tasksByStatus].length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No tasks found
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {tasksByStatus[status as keyof typeof tasksByStatus].map((task) => (
                  <Card 
                    key={task.id} 
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => openTaskDetails(task)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs">
                              {getChangeTypeLabel(task.change_type)}
                            </Badge>
                            {getStatusBadge(task.status)}
                          </div>
                          <CardTitle className="text-base line-clamp-2">
                            {task.description.split('\n')[0]}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {task.campaign_name}
                          </CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(task.created_at), "MMM dd, yyyy")}
                          </div>
                          {task.comments && task.comments.length > 0 && (
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {task.comments.length}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>From: {task.requester_email?.split('@')[0]}</span>
                        </div>
                        {task.assigned_emails && task.assigned_emails.length > 0 && (
                          <div className="text-muted-foreground">
                            Assigned to: {task.assigned_emails.map(e => e.split('@')[0]).join(", ")}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Task Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="secondary">{getChangeTypeLabel(selectedTask?.change_type || "")}</Badge>
              {selectedTask && getStatusBadge(selectedTask.status)}
            </DialogTitle>
            <DialogDescription>
              {selectedTask?.campaign_name}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Task Details */}
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium mb-1">Description</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedTask?.description}
                </p>
              </div>
              
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Requested by:</span>{" "}
                  <span className="font-medium">{selectedTask?.requester_email}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>{" "}
                  <span className="font-medium">
                    {selectedTask && format(new Date(selectedTask.created_at), "MMM dd, yyyy 'at' HH:mm")}
                  </span>
                </div>
                {selectedTask?.assigned_emails && selectedTask.assigned_emails.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Assigned to:</span>{" "}
                    <span className="font-medium">{selectedTask.assigned_emails.join(", ")}</span>
                  </div>
                )}
              </div>

              {/* Status Update - only for modification tasks */}
              {selectedTask?.task_type === "modification" && (
                <div className="flex items-center gap-3 pt-2">
                  <span className="text-sm text-muted-foreground">Update Status:</span>
                  <Select
                    value={selectedTask?.status || ""}
                    onValueChange={(value) => selectedTask && handleStatusUpdate(selectedTask.id, value)}
                    disabled={updatingStatus}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.filter(opt => opt.value !== "pending_approval").map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {updatingStatus && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => selectedTask && navigate(`/app/actiplans?campaignId=${selectedTask.campaign_id}`)}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                {selectedTask?.task_type === "approval" ? "Review & Approve ActiPlan" : "View ActiPlan"}
              </Button>
            </div>

            {/* Comments Section */}
            <div className="flex-1 flex flex-col min-h-0 border-t pt-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comments ({selectedTask?.comments?.length || 0})
              </h4>
              
              <ScrollArea className="flex-1 pr-4 max-h-48">
                {selectedTask?.comments && selectedTask.comments.length > 0 ? (
                  <div className="space-y-3">
                    {selectedTask.comments.map((comment) => (
                      <div key={comment.id} className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">
                            {comment.user_email?.split('@')[0]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(comment.created_at), "MMM dd 'at' HH:mm")}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No comments yet
                  </p>
                )}
              </ScrollArea>

              {/* Add Comment */}
              <div className="flex gap-2 mt-3">
                <Textarea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="min-h-[60px]"
                />
                <Button 
                  onClick={handleAddComment} 
                  disabled={!newComment.trim() || submittingComment}
                  size="icon"
                  className="shrink-0"
                >
                  {submittingComment ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
