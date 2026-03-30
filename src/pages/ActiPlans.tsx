import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  Play,
  Edit,
  CheckCircle,
  XCircle,
  MessageSquare,
  History,
  Trash2,
  Download,
  TrendingUp,
  MoreVertical,
  ArrowLeft,
  Search,
  BarChart3,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  Rocket,
  Lock,
  ClipboardList,
  Activity,
  Send,
  Copy,
  PlusCircle,
  Wand2,
} from "lucide-react";
import { LockedFeatureButton } from "@/components/ui/locked-feature-button";
import { LockedDropdownMenuItem } from "@/components/ui/locked-dropdown-menu-item";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useActiplanLimits } from "@/hooks/useActiplanLimits";
import { TIER_DISPLAY_NAMES, SubscriptionTier } from "@/config/subscriptionTiers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { ModificationRequestDialog } from "@/components/ModificationRequestDialog";
import { ChangeHistoryDialog } from "@/components/ChangeHistoryDialog";
import { ModificationRequestsView } from "@/components/ModificationRequestsView";
import { ModificationRequestsAnalytics } from "@/components/ModificationRequestsAnalytics";
import { LogActionDialog } from "@/components/LogActionDialog";
import { SubmitRequestDialog } from "@/components/SubmitRequestDialog";
import { ActivityLogView } from "@/components/ActivityLogView";
import { WorkspaceSelectionDialog } from "@/components/WorkspaceSelectionDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { downloadMediaPlanExcel } from "@/utils/excelGenerator";
interface Campaign {
  id: string;
  name: string;
  bo_number?: string | null;
  status: string;
  total_budget: number;
  start_date: string;
  end_date: string;
  created_at: string;
  pushed_to_dsp: boolean | null;
  pushed_at: string | null;
  user_id: string;
  forecast_data?: any;
  pdf_url?: string | null;
  platforms?: any[];
  team_id?: string | null;
  objective?: string;
  market_splits?: any;
  qc_status?: string | null;
  creator?: {
    email: string;
    company_name?: string;
  };
  team?: {
    name: string;
  };
  last_status_change?: {
    user_email: string;
    action: string;
    created_at: string;
  };
  user_role?: string;
  can_edit?: boolean;
  is_admin_or_owner?: boolean;
}

export default function ActiPlans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { hasAccess, tier } = useFeatureAccess();
  const {
    dailyLimit,
    usedToday,
    remaining,
    canCreate,
    loading: limitsLoading,
    refetch: refetchLimits,
  } = useActiplanLimits();
  const { activeWorkspaceId, workspaces, loading: workspacesLoading } = useWorkspace();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [modificationDialogOpen, setModificationDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [modificationRequestsViewOpen, setModificationRequestsViewOpen] = useState(false);
  const [deepLinkRequestId, setDeepLinkRequestId] = useState<string | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [logActionDialogOpen, setLogActionDialogOpen] = useState(false);
  const [submitRequestDialogOpen, setSubmitRequestDialogOpen] = useState(false);
  const [activityLogViewOpen, setActivityLogViewOpen] = useState(false);
  const [isAdminOrOwner, setIsAdminOrOwner] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [search, setSearch] = useState("");

  // Workspace selection dialog for duplication
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [campaignToDuplicate, setCampaignToDuplicate] = useState<Campaign | null>(null);

  useEffect(() => {
    if (user && activeWorkspaceId) {
      loadCampaigns();
    }
  }, [user, activeWorkspaceId]);

  // Handle deep links from emails
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlCampaignId = params.get("campaignId") || params.get("edit");
    const openParam = params.get("open");
    const requestId = params.get("requestId");
    const shouldOpenModifications = params.get("showModifications") === "true" || openParam === "modifications";

    if (!urlCampaignId) return;
    const found = campaigns.find((c) => c.id === urlCampaignId);
    if (!found) return;

    setSelectedCampaign(found);

    if (shouldOpenModifications) {
      setDeepLinkRequestId(requestId);
      setModificationRequestsViewOpen(true);
    }
  }, [location.search, campaigns]);

  const loadCampaigns = async () => {
    if (!activeWorkspaceId) return;

    try {
      // Fetch campaigns for the active workspace
      const { data: campaignsData, error: campaignsError } = await supabase
        .from("campaigns")
        .select("*")
        .eq("team_id", activeWorkspaceId)
        .order("created_at", { ascending: false });

      if (campaignsError) throw campaignsError;

      // If no campaigns, just set empty and return early
      if (!campaignsData || campaignsData.length === 0) {
        setCampaigns([]);
        setIsAdminOrOwner(false);
        setLoading(false);
        return;
      }

      // Fetch creator profiles and team names
      const userIds = [...new Set(campaignsData.map((c: any) => c.user_id))];
      const teamIds = [...new Set(campaignsData.map((c: any) => c.team_id).filter(Boolean))];

      const [{ data: creators }, { data: teamsData }] = await Promise.all([
        userIds.length > 0
          ? supabase.from("profiles").select("id, email, company_name").in("id", userIds)
          : Promise.resolve({ data: [] as any[] } as any),
        teamIds.length > 0
          ? supabase.from("teams").select("id, name").in("id", teamIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);

      const profilesMap: Record<string, any> = Object.fromEntries((creators || []).map((p: any) => [p.id, p]));
      const teamsMap: Record<string, any> = Object.fromEntries((teamsData || []).map((t: any) => [t.id, t]));

      // Fetch user's roles to determine permissions using security definer RPC
      // This bypasses RLS to prevent issues with new users
      const [{ data: userRoles }, { data: isOwnerResult }] = await Promise.all([
        supabase.from("user_roles").select("team_id, role").eq("user_id", user?.id),
        supabase.rpc("is_team_owner", { _user_id: user?.id }),
      ]);

      const isAdminOrOwner =
        isOwnerResult === true || userRoles?.some((r: any) => r.role === "admin" || r.role === "owner");
      setIsAdminOrOwner(isAdminOrOwner || false);

      // Fetch latest status changes for each campaign
      const campaignIds = campaignsData?.map((c: any) => c.id) || [];
      const latestStatusChanges: Record<string, any> = {};

      if (campaignIds.length > 0) {
        const { data } = await supabase
          .from("campaign_change_history")
          .select("campaign_id, action, created_at, user_id")
          .in("campaign_id", campaignIds)
          .in("action", ["approved", "rejected", "pushed_to_dsp"])
          .order("created_at", { ascending: false });

        // Group by campaign_id and keep only the latest
        (data || []).forEach((change: any) => {
          if (!latestStatusChanges[change.campaign_id]) {
            latestStatusChanges[change.campaign_id] = change;
          }
        });

        // Fetch user emails
        const userIds = [...new Set(Object.values(latestStatusChanges).map((s: any) => s.user_id))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.from("profiles").select("id, email").in("id", userIds);

          const profilesMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.email]));

          // Add emails to status changes
          Object.keys(latestStatusChanges).forEach((campaignId) => {
            latestStatusChanges[campaignId].user_email = profilesMap[latestStatusChanges[campaignId].user_id];
          });
        }
      }

      // Fetch QC tracking summary per campaign
      const qcStatusMap: Record<string, string> = {};
      if (campaignIds.length > 0) {
        const { data: qcData } = await supabase
          .from("qc_tracking")
          .select("campaign_id, current_state")
          .in("campaign_id", campaignIds);

        if (qcData && qcData.length > 0) {
          // Group by campaign_id
          const grouped: Record<string, string[]> = {};
          qcData.forEach((row: any) => {
            if (!grouped[row.campaign_id]) grouped[row.campaign_id] = [];
            grouped[row.campaign_id].push(row.current_state);
          });

          // Derive campaign-level QC status based on lowest common state
          const stateOrder = ['waiting_for_final_qc', 'qc', 'pushed_live', 'delivering'];
          Object.entries(grouped).forEach(([campaignId, states]) => {
            // Find the minimum state across all entities
            let minIndex = stateOrder.length - 1;
            states.forEach(s => {
              const idx = stateOrder.indexOf(s);
              if (idx >= 0 && idx < minIndex) minIndex = idx;
            });
            qcStatusMap[campaignId] = stateOrder[minIndex];
          });
        }
      }

      // Map the data with permissions and last status change
      const enrichedCampaigns = campaignsData?.map((campaign: any) => {
        // Find user's role for this campaign's team
        const userRole = userRoles?.find((role: any) => role.team_id === campaign.team_id);

        // Check if user can edit
        const isCreator = campaign.user_id === user?.id;
        const hasEditRole = userRole && ["admin", "owner", "campaign_manager", "member"].includes(userRole.role);
        const canEdit = (isCreator || hasEditRole) && campaign.status !== "rejected";

        // Find latest status change
        const latestChange = latestStatusChanges[campaign.id];

        return {
          ...campaign,
          creator: profilesMap[campaign.user_id]
            ? { email: profilesMap[campaign.user_id].email, company_name: profilesMap[campaign.user_id].company_name }
            : undefined,
          team: campaign.team_id && teamsMap[campaign.team_id] ? { name: teamsMap[campaign.team_id].name } : undefined,
          user_role: userRole?.role,
          can_edit: canEdit,
          is_admin_or_owner: isAdminOrOwner,
          qc_status: qcStatusMap[campaign.id] || null,
          last_status_change: latestChange
            ? {
                user_email: latestChange.user_email,
                action: latestChange.action,
                created_at: latestChange.created_at,
              }
            : undefined,
        };
      });

      setCampaigns(enrichedCampaigns || []);
    } catch (error: any) {
      console.error("Error loading campaigns:", error);
      toast.error("Failed to load ActiPlans");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (campaign: Campaign) => {
    setActionLoading(true);
    try {
      // Update campaign status
      const { error: updateError } = await supabase
        .from("campaigns")
        .update({ status: "approved" })
        .eq("id", campaign.id);

      if (updateError) throw updateError;

      // Log to history
      await supabase.from("campaign_change_history").insert({
        campaign_id: campaign.id,
        user_id: user?.id,
        action: "approved",
        change_type: "status_change",
        description: `Status changed from ${campaign.status} to approved`,
      });

      // Send notification email
      await supabase.functions.invoke("send-approval-notification", {
        body: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          action: "approved",
        },
      });

      toast.success("ActiPlan approved successfully");
      loadCampaigns();
    } catch (error: any) {
      console.error("Error approving campaign:", error);
      toast.error("Failed to approve ActiPlan");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (campaign: Campaign) => {
    setActionLoading(true);
    try {
      const { error: updateError } = await supabase
        .from("campaigns")
        .update({ status: "rejected" })
        .eq("id", campaign.id);

      if (updateError) throw updateError;

      await supabase.from("campaign_change_history").insert({
        campaign_id: campaign.id,
        user_id: user?.id,
        action: "rejected",
        change_type: "status_change",
        description: `Status changed from ${campaign.status} to rejected`,
      });

      await supabase.functions.invoke("send-approval-notification", {
        body: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          action: "rejected",
        },
      });

      toast.success("ActiPlan rejected");
      loadCampaigns();
    } catch (error: any) {
      console.error("Error rejecting campaign:", error);
      toast.error("Failed to reject ActiPlan");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePushToDSP = async (campaign: Campaign) => {
    // Navigate to the Launch Status View for validation and push workflow
    navigate(`/actiplans/${campaign.id}/launch`);
  };

  const handleDelete = async () => {
    if (!campaignToDelete) return;

    setActionLoading(true);
    try {
      const { error } = await supabase.from("campaigns").delete().eq("id", campaignToDelete.id);

      if (error) throw error;

      toast.success("ActiPlan deleted successfully");
      loadCampaigns();
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    } catch (error: any) {
      console.error("Error deleting campaign:", error);
      toast.error("Failed to delete ActiPlan");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDuplicateClick = (campaign: Campaign) => {
    // If user has multiple workspaces, show selection dialog
    if (workspaces.length > 1) {
      setCampaignToDuplicate(campaign);
      setWorkspaceDialogOpen(true);
    } else {
      // Single workspace, duplicate directly
      handleDuplicate(campaign, activeWorkspaceId);
    }
  };

  const handleDuplicate = async (campaign: Campaign, targetWorkspaceId: string | null) => {
    setActionLoading(true);
    try {
      // Fetch full campaign data including budget_allocation and generic_config
      const { data: fullCampaign, error: fetchError } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", campaign.id)
        .single();

      if (fetchError || !fullCampaign) throw fetchError || new Error("Campaign not found");

      // Create a copy of the campaign with all relevant data
      const { data: newCampaign, error } = await supabase
        .from("campaigns")
        .insert({
          name: `${campaign.name} (Copy)`,
          user_id: user?.id,
          objective: fullCampaign.objective,
          total_budget: fullCampaign.total_budget,
          start_date: fullCampaign.start_date,
          end_date: fullCampaign.end_date,
          platforms: fullCampaign.platforms,
          market_splits: fullCampaign.market_splits,
          budget_allocation: fullCampaign.budget_allocation, // Include budget percentages
          generic_config: fullCampaign.generic_config, // Include strategy, targeting config
          bo_number: null, // Clear BO number to avoid duplicates
          status: "draft",
          team_id: targetWorkspaceId,
        })
        .select()
        .single();

      if (error) throw error;

      // Duplicate creative assignments from the original campaign
      const { data: originalAssignments, error: assignmentsError } = await supabase
        .from("creative_assignments")
        .select("*")
        .eq("campaign_id", campaign.id);

      if (assignmentsError) {
        console.error("Error fetching creative assignments:", assignmentsError);
        // Continue - campaign was duplicated, just log the error
      } else if (originalAssignments && originalAssignments.length > 0) {
        // Create new assignments for the duplicated campaign
        const newAssignments = originalAssignments.map((assignment) => {
          // Remove id and timestamps, update campaign_id
          const { id, assigned_at, dsp_creative_id, error_message, status, ...rest } = assignment;
          return {
            ...rest,
            campaign_id: newCampaign.id,
            assigned_by: user?.id || null,
            status: "pending", // Reset status for new assignments
          };
        });

        const { error: insertError } = await supabase.from("creative_assignments").insert(newAssignments);

        if (insertError) {
          console.error("Error duplicating creative assignments:", insertError);
          toast.warning("ActiPlan duplicated but some creative assignments failed to copy");
        } else {
          console.log(`Duplicated ${newAssignments.length} creative assignments`);
        }
      }

      const targetWorkspace = workspaces.find((w) => w.id === targetWorkspaceId);
      const assignmentCount = originalAssignments?.length || 0;
      toast.success(
        `ActiPlan duplicated${targetWorkspace ? ` to ${targetWorkspace.name}` : ""}${assignmentCount > 0 ? ` with ${assignmentCount} creative assignments` : ""}`,
      );
      refetchLimits();
      loadCampaigns();
    } catch (error: any) {
      console.error("Error duplicating campaign:", error);
      toast.error("Failed to duplicate ActiPlan");
    } finally {
      setActionLoading(false);
      setWorkspaceDialogOpen(false);
      setCampaignToDuplicate(null);
    }
  };

  const getNextTierName = (): string => {
    const tierOrder: SubscriptionTier[] = ["trial", "basic", "freelancer", "enterprise", "agency"];
    const currentIndex = tierOrder.indexOf(tier);
    if (currentIndex < tierOrder.length - 1) {
      return TIER_DISPLAY_NAMES[tierOrder[currentIndex + 1]];
    }
    return "Agency";
  };

  const getEffectiveStatus = (campaign: Campaign): string => {
    // If the campaign has QC tracking, the QC status takes precedence over pushed_to_dsp/partially_pushed/live
    if (campaign.qc_status && ['pushed_to_dsp', 'partially_pushed', 'live'].includes(campaign.status || '')) {
      return campaign.qc_status;
    }
    return campaign.status || 'draft';
  };

  const getStatusBadge = (status: string, qcStatus?: string | null) => {
    const effectiveStatus = qcStatus && ['pushed_to_dsp', 'partially_pushed', 'live'].includes(status)
      ? qcStatus
      : status;

    const variants: Record<string, { variant: any; label: string; className?: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      awaiting_approval: { variant: "outline", label: "Awaiting Approval" },
      approved: { variant: "default", label: "Approved" },
      live: { variant: "default", label: "Live" },
      pushed_to_dsp: { variant: "default", label: "Pushed to DSP" },
      partially_pushed: { variant: "outline", label: "Partially Pushed" },
      push_failed: { variant: "destructive", label: "Push Failed" },
      under_modification: { variant: "outline", label: "Under Modification" },
      rejected: { variant: "destructive", label: "Rejected" },
      waiting_for_final_qc: { variant: "outline", label: "Waiting for Final Check", className: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
      qc: { variant: "outline", label: "Checked", className: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
      pushed_live: { variant: "outline", label: "Pushed Live", className: "bg-purple-500/10 text-purple-700 border-purple-500/30" },
      delivering: { variant: "outline", label: "Delivering", className: "bg-green-500/10 text-green-700 border-green-500/30" },
    };

    const config = variants[effectiveStatus] || variants.draft;
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
  };

  const canEdit = (campaign: Campaign) => {
    return campaign.can_edit === true;
  };

  const canApprove = (campaign: Campaign) => {
    const isNotCreator = campaign.user_id !== user?.id;
    const isAwaitingApproval = campaign.status === "draft" || campaign.status === "awaiting_approval";
    const isTeamOwnerOrAdmin = campaign.is_admin_or_owner === true;

    return (isNotCreator || isTeamOwnerOrAdmin) && isAwaitingApproval;
  };

  const canPushToDSP = (campaign: Campaign) => {
    const isCreator = campaign.user_id === user?.id;
    const isTeamOwnerOrAdmin = campaign.is_admin_or_owner === true;
    // Allow launch for approved, live, pushed_to_dsp, or partially_pushed campaigns
    const isReady = ["approved", "live", "pushed_to_dsp", "partially_pushed"].includes(campaign.status || "");

    return (isCreator || isTeamOwnerOrAdmin) && isReady;
  };

  const canViewLaunchStatus = (campaign: Campaign) => {
    const isCreator = campaign.user_id === user?.id;
    const isTeamOwnerOrAdmin = campaign.is_admin_or_owner === true;
    // Show launch status for any campaign that's approved or beyond
    const isReady = ["approved", "live", "pushed_to_dsp", "partially_pushed"].includes(campaign.status || "");

    return (isCreator || isTeamOwnerOrAdmin) && isReady;
  };

  const canDelete = (campaign: Campaign) => {
    const isCreator = campaign.user_id === user?.id;
    const isTeamOwnerOrAdmin = campaign.is_admin_or_owner === true;
    const isNotLive = campaign.status !== "live";

    return (isCreator || isTeamOwnerOrAdmin) && isNotLive;
  };

  const filterCampaigns = (status: string) => {
    const list = status === "all"
      ? campaigns
      : campaigns.filter((c) => getEffectiveStatus(c) === status);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const inName = c.name?.toLowerCase().includes(q);
      const inCreator = c.creator?.email?.toLowerCase().includes(q);
      const inTeam = c.team?.name?.toLowerCase().includes(q);
      const inPlatform = (c.platforms || []).some((p: any) =>
        ((p.name || p.type || "") + "").toLowerCase().includes(q),
      );
      return inName || inCreator || inTeam || inPlatform;
    });
  };

  const renderCampaignCard = (campaign: Campaign) => {
    // Extract forecast metrics from campaign.forecast_data
    const forecastData = campaign.forecast_data as any;
    const actiplanForecast = forecastData?.actiplanForecast;

    // Get platforms and markets from campaign data (support both legacy and new shapes)
    const platforms =
      Array.isArray(campaign.platforms) && (campaign.platforms as any[]).length > 0
        ? (campaign.platforms as any[]).map((p: any) => p.name || p.id || "Unknown").filter(Boolean)
        : Object.keys((campaign.market_splits as any) || {}).map((id) => id.charAt(0).toUpperCase() + id.slice(1));

    const marketSplits = (campaign.market_splits as any) || {};
    const allMarkets = Object.values(marketSplits)
      .flatMap((arr: any) => (Array.isArray(arr) ? arr : []))
      .map((m: any) => m?.name || m?.id)
      .filter(Boolean);
    const uniqueMarkets = [...new Set(allMarkets)];

    // Get unique objectives from phases across all markets
    const allObjectives = Object.values(marketSplits)
      .flatMap((arr: any) => (Array.isArray(arr) ? arr : []))
      .flatMap((m: any) => (Array.isArray(m?.phases) ? m.phases : []))
      .map((phase: any) => phase?.objective)
      .filter(Boolean);
    const uniqueObjectives = [...new Set(allObjectives)];

    return (
      <Card key={campaign.id} className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="text-lg truncate">{campaign.name}</CardTitle>
                {campaign.bo_number && (
                  <Badge variant="secondary" className="text-xs font-mono">
                    {campaign.bo_number}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                {format(new Date(campaign.start_date), "MMM dd")} -{" "}
                {format(new Date(campaign.end_date), "MMM dd, yyyy")}
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              {getStatusBadge(campaign.status, campaign.qc_status)}
              {campaign.last_status_change && campaign.last_status_change.user_email && (
                <span className="text-xs text-muted-foreground">
                  by {campaign.last_status_change.user_email.split("@")[0]}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Created by:</span>
                  <span className="text-sm font-medium">
                    {campaign.creator?.email ? campaign.creator.email.split("@")[0] : "Unknown"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Team:</span>
                  <span className="text-sm font-medium">{campaign.team?.name || "Personal"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Budget:</span>
                  <span className="text-sm font-medium">${Number(campaign.total_budget).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Markets:</span>
                  <span className="text-sm font-medium">{uniqueMarkets.join(", ") || "None"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Platforms:</span>
                  <span className="text-sm font-medium">{platforms.join(", ") || "None"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Objectives:</span>
                  <span className="text-sm font-medium">{uniqueObjectives.join(", ") || "None"}</span>
                </div>
              </div>

              {actiplanForecast && (
                <div className="flex-1 border-l pl-6">
                  <h4 className="text-sm font-semibold mb-3">Actiplan Deliverables</h4>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Audience</p>
                      <p className="text-sm font-semibold">
                        {actiplanForecast.totalAudienceSize?.toLocaleString() || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Impressions</p>
                      <p className="text-sm font-semibold">
                        {actiplanForecast.totalImpressions?.toLocaleString() || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Reach</p>
                      <p className="text-sm font-semibold">{actiplanForecast.totalReach?.toLocaleString() || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg. CPM</p>
                      <p className="text-sm font-semibold">${actiplanForecast.avgCPM?.toFixed(2) || "0.00"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Frequency</p>
                      <p className="text-sm font-semibold">{actiplanForecast.frequency?.toFixed(2) || "0.00"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">SOV</p>
                      <p className="text-sm font-semibold">{actiplanForecast.sov?.toFixed(1) || "0.0"}%</p>
                    </div>
                  </div>

                  {/* Market Deliverables */}
                  {actiplanForecast.marketDeliverables &&
                    Object.keys(actiplanForecast.marketDeliverables).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold">Market Deliverables</p>
                        <div className="grid grid-cols-1 gap-2">
                          {Object.entries(actiplanForecast.marketDeliverables).map(
                            ([marketName, kpis]: [string, any]) => (
                              <div key={marketName} className="p-2 bg-muted/30 rounded">
                                <p className="text-xs font-medium mb-1">{marketName}</p>
                                <div className="flex flex-wrap gap-2">
                                  {kpis.map((kpi: any, idx: number) => (
                                    <span key={idx} className="text-xs">
                                      {kpi.kpi}: {kpi.result.toLocaleString()}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 pt-2">
              {(campaign.pdf_url || campaign.forecast_data) && (
                <LockedFeatureButton feature="pdf_export">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Download className="w-3 h-3 mr-1" />
                        Download
                        <ChevronDown className="w-3 h-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem
                        onClick={async () => {
                          try {
                            if (campaign.pdf_url) {
                              const { data } = await supabase.storage.from("campaign-pdfs").download(campaign.pdf_url);
                              if (data) {
                                const url = URL.createObjectURL(data);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `${campaign.name}-media-plan.pdf`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }
                            } else {
                              toast.error("No PDF available");
                            }
                          } catch (error) {
                            toast.error("Failed to download PDF");
                          }
                        }}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Download as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          try {
                            const planData = {
                              name: campaign.name,
                              totalBudget: campaign.total_budget,
                              startDate: campaign.start_date,
                              endDate: campaign.end_date,
                              platforms: campaign.platforms || [],
                              genericConfig: (campaign as any).generic_config || {},
                              forecasts: campaign.forecast_data,
                              actiplanForecast: campaign.forecast_data?.actiplanForecast,
                            };
                            downloadMediaPlanExcel(planData);
                            toast.success("Excel file downloaded successfully!");
                          } catch (error) {
                            console.error("Error generating Excel:", error);
                            toast.error("Failed to generate Excel file");
                          }
                        }}
                      >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Download as Excel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </LockedFeatureButton>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit(campaign) &&
                    !["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") && (
                      <DropdownMenuItem onClick={() => navigate(`/app?campaignId=${campaign.id}`)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit ActiPlan
                      </DropdownMenuItem>
                    )}
                  {/* Extend Campaign - for pushed/live campaigns to add new phases or creatives */}
                  {canEdit(campaign) &&
                    ["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") && (
                      <DropdownMenuItem onClick={() => navigate(`/app?campaignId=${campaign.id}&mode=extend`)}>
                        <PlusCircle className="w-4 h-4 mr-2" />
                        Extend Campaign
                      </DropdownMenuItem>
                    )}
                  {/* Duplicate ActiPlan */}
                  {hasAccess("duplicate_actiplans") ? (
                    <DropdownMenuItem onClick={() => handleDuplicateClick(campaign)} disabled={actionLoading}>
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate ActiPlan
                    </DropdownMenuItem>
                  ) : (
                    <LockedDropdownMenuItem feature="duplicate_actiplans">Duplicate ActiPlan</LockedDropdownMenuItem>
                  )}

                  {canDelete(campaign) && (
                    <DropdownMenuItem
                      onClick={() => {
                        setCampaignToDelete(campaign);
                        setDeleteDialogOpen(true);
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete ActiPlan
                    </DropdownMenuItem>
                  )}
                  {/* Launch/Push menu item - conditional based on status */}
                  {(() => {
                    const status = campaign.status || "";
                    // Show for draft, approved, ready_for_push, pushed_to_dsp, partially_pushed, live
                    if (
                      ["draft", "approved", "ready_for_push", "pushed_to_dsp", "partially_pushed", "live"].includes(
                        status,
                      )
                    ) {
                      const isCreator = campaign.user_id === user?.id;
                      const isTeamOwnerOrAdmin = campaign.is_admin_or_owner === true;
                      if (!isCreator && !isTeamOwnerOrAdmin) return null;

                      let menuLabel = "Launch Status";
                      if (status === "draft" || status === "approved" || status === "ready_for_push") {
                        menuLabel = "Push Campaign to DSP";
                      } else if (status === "partially_pushed") {
                        menuLabel = "Retry Pushing to DSP";
                      } else if (status === "pushed_to_dsp" || status === "live") {
                        menuLabel = "View Launch Status";
                      }

                      return (
                        <>
                          {canApprove(campaign) && <DropdownMenuSeparator />}
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigate(`/actiplans/${campaign.id}/launch`);
                            }}
                          >
                            <Rocket className="w-4 h-4 mr-2" />
                            {menuLabel}
                          </DropdownMenuItem>
                        </>
                      );
                    }
                    return null;
                  })()}
                  {/* Mesh Creatives - available for all campaigns, gated to Enterprise+ */}
                  {hasAccess("creative_matching") ? (
                    <DropdownMenuItem onClick={() => navigate(`/creatives?campaignId=${campaign.id}`)}>
                      <Wand2 className="w-4 h-4 mr-2" />
                      Mesh Creatives
                    </DropdownMenuItem>
                  ) : (
                    <LockedDropdownMenuItem feature="creative_matching">Mesh Creatives</LockedDropdownMenuItem>
                  )}

                  {/* View History - after Delete ActiPlan with separator for pushed_to_dsp */}
                  {["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") && (
                    <>
                      <DropdownMenuSeparator />
                      {hasAccess("change_history_dialog") ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setHistoryDialogOpen(true);
                          }}
                        >
                          <History className="w-4 h-4 mr-2" />
                          View History
                        </DropdownMenuItem>
                      ) : (
                        <LockedDropdownMenuItem feature="change_history_dialog">View History</LockedDropdownMenuItem>
                      )}
                    </>
                  )}

                  {/* View History for non-pushed campaigns */}
                  {!["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") && (
                    <>
                      <DropdownMenuSeparator />
                      {hasAccess("change_history_dialog") ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setHistoryDialogOpen(true);
                          }}
                        >
                          <History className="w-4 h-4 mr-2" />
                          View History
                        </DropdownMenuItem>
                      ) : (
                        <LockedDropdownMenuItem feature="change_history_dialog">View History</LockedDropdownMenuItem>
                      )}
                    </>
                  )}

                  {/* Approve/Reject - for non-pushed campaigns with approval rights */}
                  {canApprove(campaign) &&
                    hasAccess("approve_actiplans") &&
                    !["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleApprove(campaign)} disabled={actionLoading}>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve ActiPlan
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleReject(campaign)}
                          disabled={actionLoading}
                          className="text-destructive"
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Reject ActiPlan
                        </DropdownMenuItem>
                      </>
                    )}
                  {canApprove(campaign) &&
                    !hasAccess("approve_actiplans") &&
                    !["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") && (
                      <>
                        <DropdownMenuSeparator />
                        <LockedDropdownMenuItem feature="approve_actiplans">Approve ActiPlan</LockedDropdownMenuItem>
                        <LockedDropdownMenuItem feature="approve_actiplans">Reject ActiPlan</LockedDropdownMenuItem>
                      </>
                    )}

                  {/* Performance section for pushed campaigns */}
                  {["ready_for_push", "pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          navigate(`/actiplans/${campaign.id}/report`);
                        }}
                      >
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Check Performance
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          navigate(`/actiplans/${campaign.id}/insights`);
                        }}
                      >
                        <BarChart3 className="w-4 h-4 mr-2" />
                        Insights & Recommendations
                      </DropdownMenuItem>
                    </>
                  )}

                  {/* Request Modifications and Check Modification Requests */}
                  {["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") && (
                    <>
                      <DropdownMenuSeparator />
                      {hasAccess("request_modifications") ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setModificationDialogOpen(true);
                          }}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Request Modifications
                        </DropdownMenuItem>
                      ) : (
                        <LockedDropdownMenuItem feature="request_modifications">
                          Request Modifications
                        </LockedDropdownMenuItem>
                      )}
                      {hasAccess("modification_status_tracking") ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setModificationRequestsViewOpen(true);
                          }}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Check Modification Requests
                        </DropdownMenuItem>
                      ) : (
                        <LockedDropdownMenuItem feature="modification_status_tracking">
                          Check Modification Requests
                        </LockedDropdownMenuItem>
                      )}
                    </>
                  )}

                  {/* Request Modifications for non-pushed campaigns */}
                  {!["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") && (
                    <>
                      {hasAccess("request_modifications") ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setModificationDialogOpen(true);
                          }}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Request Modifications
                        </DropdownMenuItem>
                      ) : (
                        <LockedDropdownMenuItem feature="request_modifications">
                          Request Modifications
                        </LockedDropdownMenuItem>
                      )}
                      {hasAccess("modification_status_tracking") ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setModificationRequestsViewOpen(true);
                          }}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Check Modification Requests
                        </DropdownMenuItem>
                      ) : (
                        <LockedDropdownMenuItem feature="modification_status_tracking">
                          Check Modification Requests
                        </LockedDropdownMenuItem>
                      )}
                    </>
                  )}

                  {/* Log an Action and Activity Log for pushed campaigns */}
                  {["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedCampaign(campaign);
                          setLogActionDialogOpen(true);
                        }}
                      >
                        <ClipboardList className="w-4 h-4 mr-2" />
                        Log an Action
                      </DropdownMenuItem>
                      {hasAccess("change_history_dialog") ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setActivityLogViewOpen(true);
                          }}
                        >
                          <Activity className="w-4 h-4 mr-2" />
                          Activity Log
                        </DropdownMenuItem>
                      ) : (
                        <LockedDropdownMenuItem feature="change_history_dialog">Activity Log</LockedDropdownMenuItem>
                      )}
                    </>
                  )}

                  {/* Activity Log for non-pushed campaigns */}
                  {!["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") && (
                    <>
                      {hasAccess("change_history_dialog") ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setActivityLogViewOpen(true);
                          }}
                        >
                          <Activity className="w-4 h-4 mr-2" />
                          Activity Log
                        </DropdownMenuItem>
                      ) : (
                        <LockedDropdownMenuItem feature="change_history_dialog">Activity Log</LockedDropdownMenuItem>
                      )}
                    </>
                  )}

                  {/* Submit Request - for operational requests (Enterprise+ only) */}
                  {["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") &&
                    (hasAccess("request_modifications") ? (
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedCampaign(campaign);
                          setSubmitRequestDialogOpen(true);
                        }}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Submit Request
                      </DropdownMenuItem>
                    ) : (
                      <LockedDropdownMenuItem feature="request_modifications">Submit Request</LockedDropdownMenuItem>
                    ))}

                  {/* Operations Analytics - admin only */}
                  {["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") &&
                    isAdminOrOwner &&
                    hasAccess("operations_analytics") && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setAnalyticsOpen(true);
                          }}
                        >
                          <Activity className="w-4 h-4 mr-2" />
                          Operations Analytics
                        </DropdownMenuItem>
                      </>
                    )}

                  {/* Operations Analytics for non-pushed campaigns */}
                  {!["pushed_to_dsp", "partially_pushed", "live"].includes(campaign.status || "") &&
                    isAdminOrOwner &&
                    hasAccess("operations_analytics") && (
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedCampaign(campaign);
                          setAnalyticsOpen(true);
                        }}
                      >
                        <Activity className="w-4 h-4 mr-2" />
                        Operations Analytics
                      </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/overview")}
            aria-label="Back to create ActiPlan"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">ActiPlans</h1>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, creator, team, or platform"
              className="pl-9"
              aria-label="Search ActiPlans"
            />
          </div>
          {dailyLimit !== Infinity && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 border border-border">
              <Rocket className="h-4 w-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                  {usedToday}/{dailyLimit} DSP pushes
                </span>
                {remaining === 0 ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-primary"
                    onClick={() => navigate("/settings/plans")}
                  >
                    Upgrade to {getNextTierName()} →
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{remaining} remaining today</span>
                )}
              </div>
            </div>
          )}
          <Button
            onClick={() => {
              localStorage.removeItem("draftCampaignId");
              localStorage.removeItem("basicTargeting");
              navigate("/app?new=true");
            }}
          >
            New ActiPlan
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all" className="space-y-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="awaiting_approval">Awaiting Approval</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="pushed_to_dsp">Pushed to DSP</TabsTrigger>
          <TabsTrigger value="partially_pushed">Partially Pushed</TabsTrigger>
          <TabsTrigger value="waiting_for_final_qc">Waiting for Final Check</TabsTrigger>
          <TabsTrigger value="qc">Checked</TabsTrigger>
          <TabsTrigger value="pushed_live">Pushed Live</TabsTrigger>
          <TabsTrigger value="delivering">Delivering</TabsTrigger>
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="push_failed">Push Failed</TabsTrigger>
          <TabsTrigger value="under_modification">Under Modification</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        {[
          "all",
          "draft",
          "awaiting_approval",
          "approved",
          "pushed_to_dsp",
          "partially_pushed",
          "waiting_for_final_qc",
          "qc",
          "pushed_live",
          "delivering",
          "live",
          "push_failed",
          "under_modification",
          "rejected",
        ].map((status) => (
          <TabsContent key={status} value={status} className="space-y-4">
            {filterCampaigns(status).length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No ActiPlans found in this category
                </CardContent>
              </Card>
            ) : (
              filterCampaigns(status).map(renderCampaignCard)
            )}
          </TabsContent>
        ))}
      </Tabs>

      {selectedCampaign && (
        <>
          <ModificationRequestDialog
            open={modificationDialogOpen}
            onOpenChange={setModificationDialogOpen}
            campaignId={selectedCampaign.id}
            campaignName={selectedCampaign.name}
            onSuccess={() => {
              loadCampaigns();
              setModificationDialogOpen(false);
            }}
          />

          <ChangeHistoryDialog
            open={historyDialogOpen}
            onOpenChange={setHistoryDialogOpen}
            campaignId={selectedCampaign.id}
            campaignName={selectedCampaign.name}
          />

          <ModificationRequestsView
            open={modificationRequestsViewOpen}
            onOpenChange={(nextOpen) => {
              setModificationRequestsViewOpen(nextOpen);
              if (!nextOpen) setDeepLinkRequestId(null);
            }}
            campaignId={selectedCampaign?.id || ""}
            campaignName={selectedCampaign?.name || ""}
            initialRequestId={deepLinkRequestId || undefined}
          />

          <ModificationRequestsAnalytics
            open={analyticsOpen}
            onOpenChange={setAnalyticsOpen}
            campaignId={selectedCampaign.id}
            campaignName={selectedCampaign.name}
          />

          <LogActionDialog
            open={logActionDialogOpen}
            onOpenChange={setLogActionDialogOpen}
            campaignId={selectedCampaign.id}
            campaignName={selectedCampaign.name}
            onSuccess={() => {
              loadCampaigns();
              setLogActionDialogOpen(false);
            }}
          />

          <SubmitRequestDialog
            open={submitRequestDialogOpen}
            onOpenChange={setSubmitRequestDialogOpen}
            campaignId={selectedCampaign.id}
            campaignName={selectedCampaign.name}
            onSuccess={() => {
              loadCampaigns();
              setSubmitRequestDialogOpen(false);
            }}
          />

          <ActivityLogView
            open={activityLogViewOpen}
            onOpenChange={setActivityLogViewOpen}
            campaignId={selectedCampaign.id}
            campaignName={selectedCampaign.name}
          />
        </>
      )}

      {/* Workspace Selection Dialog for Duplication */}
      <WorkspaceSelectionDialog
        open={workspaceDialogOpen}
        onOpenChange={setWorkspaceDialogOpen}
        workspaces={workspaces}
        currentWorkspaceId={activeWorkspaceId}
        title="Duplicate to Workspace"
        description="Choose which workspace to place the duplicated ActiPlan in"
        onConfirm={(workspaceId) => {
          if (campaignToDuplicate) {
            handleDuplicate(campaignToDuplicate, workspaceId);
          }
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ActiPlan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{campaignToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
