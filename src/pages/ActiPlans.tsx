import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Play, Edit, CheckCircle, XCircle, MessageSquare, History, Trash2, Download, TrendingUp, MoreVertical, ArrowLeft, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { ModificationRequestDialog } from "@/components/ModificationRequestDialog";
import { ChangeHistoryDialog } from "@/components/ChangeHistoryDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
interface Campaign {
  id: string;
  name: string;
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
}

export default function ActiPlans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [modificationDialogOpen, setModificationDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (user) {
      loadCampaigns();
    }
  }, [user]);

  const loadCampaigns = async () => {
    try {
      // Fetch campaigns
      const { data: campaignsData, error: campaignsError } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      if (campaignsError) throw campaignsError;

      // Fetch creator profiles and team names
      const userIds = [...new Set((campaignsData || []).map((c: any) => c.user_id))];
      const teamIds = [...new Set((campaignsData || []).map((c: any) => c.team_id).filter(Boolean))];

      const [{ data: creators }, { data: teamsData }] = await Promise.all([
        userIds.length > 0
          ? supabase.from("profiles").select("id, email, company_name").in("id", userIds)
          : Promise.resolve({ data: [] as any[] } as any),
        teamIds.length > 0
          ? supabase.from("teams").select("id, name").in("id", teamIds)
          : Promise.resolve({ data: [] as any[] } as any)
      ]);

      const profilesMap: Record<string, any> = Object.fromEntries((creators || []).map((p: any) => [p.id, p]));
      const teamsMap: Record<string, any> = Object.fromEntries((teamsData || []).map((t: any) => [t.id, t]));

      // Fetch user's roles to determine permissions
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("team_id, role")
        .eq("user_id", user?.id);

      // Fetch latest status changes for each campaign
      const campaignIds = campaignsData?.map((c: any) => c.id) || [];
      let statusChanges: any[] = [];
      
      if (campaignIds.length > 0) {
        const { data } = await supabase
          .from("campaign_change_history")
          .select(`
            campaign_id,
            action,
            created_at,
            user_id
          `)
          .in("campaign_id", campaignIds)
          .in("action", ["approved", "rejected", "pushed_to_dsp"])
          .order("created_at", { ascending: false });
        
        statusChanges = data || [];
        
        // Fetch user emails for status changes
        const userIds = [...new Set(statusChanges.map((s: any) => s.user_id))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, email")
            .in("id", userIds);
          
          // Map profiles to status changes
          statusChanges = statusChanges.map((change: any) => ({
            ...change,
            user_email: profiles?.find((p: any) => p.id === change.user_id)?.email
          }));
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
        const latestChange = statusChanges?.find((change: any) => change.campaign_id === campaign.id);

        return {
          ...campaign,
          creator: profilesMap[campaign.user_id]
            ? { email: profilesMap[campaign.user_id].email, company_name: profilesMap[campaign.user_id].company_name }
            : undefined,
          team: campaign.team_id && teamsMap[campaign.team_id]
            ? { name: teamsMap[campaign.team_id].name }
            : undefined,
          user_role: userRole?.role,
          can_edit: canEdit,
          last_status_change: latestChange ? {
            user_email: latestChange.user_email,
            action: latestChange.action,
            created_at: latestChange.created_at
          } : undefined
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
      await (supabase as any).from("campaign_change_history").insert({
        campaign_id: campaign.id,
        user_id: user?.id,
        action: "approved",
        old_status: campaign.status,
        new_status: "approved",
      } as any);

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

      await (supabase as any).from("campaign_change_history").insert({
        campaign_id: campaign.id,
        user_id: user?.id,
        action: "rejected",
        old_status: campaign.status,
        new_status: "rejected",
      } as any);

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
    setActionLoading(true);
    try {
      // Call edge function to push to DSP
      const { data, error } = await supabase.functions.invoke("push-campaign-to-dsp", {
        body: { campaignId: campaign.id },
      });

      if (error) throw error;

      // Update campaign status
      await supabase
        .from("campaigns")
        .update({ 
          pushed_to_dsp: true, 
          pushed_at: new Date().toISOString(),
          status: "live"
        })
        .eq("id", campaign.id);

      await (supabase as any).from("campaign_change_history").insert({
        campaign_id: campaign.id,
        user_id: user?.id,
        action: "pushed_to_dsp",
        new_status: "live",
      } as any);

      toast.success("Campaign pushed to DSP successfully! Please perform a manual quality check in the Ads Manager.", {
        duration: 6000,
      });
      loadCampaigns();
    } catch (error: any) {
      console.error("Error pushing to DSP:", error);
      toast.error("Failed to push campaign to DSP");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!campaignToDelete) return;
    
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("campaigns")
        .delete()
        .eq("id", campaignToDelete.id);

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

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      awaiting_approval: { variant: "outline", label: "Awaiting Approval" },
      approved: { variant: "default", label: "Approved" },
      live: { variant: "default", label: "Live" },
      under_modification: { variant: "outline", label: "Under Modification" },
      rejected: { variant: "destructive", label: "Rejected" },
    };
    const config = variants[status] || variants.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const canEdit = (campaign: Campaign) => {
    return campaign.can_edit === true;
  };

  const canApprove = (campaign: Campaign) => {
    return campaign.user_id !== user?.id && (campaign.status === "draft" || campaign.status === "awaiting_approval");
  };

  const canPushToDSP = (campaign: Campaign) => {
    return campaign.user_id === user?.id && campaign.status === "approved" && !campaign.pushed_to_dsp;
  };

  const canDelete = (campaign: Campaign) => {
    return campaign.status === "rejected";
  };

  const filterCampaigns = (status: string) => {
    const list = status === "all" ? campaigns : campaigns.filter((c) => c.status === status);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const inName = c.name?.toLowerCase().includes(q);
      const inCreator = c.creator?.email?.toLowerCase().includes(q);
      const inTeam = c.team?.name?.toLowerCase().includes(q);
      const inPlatform = (c.platforms || []).some((p: any) => ((p.name || p.type || "") + "").toLowerCase().includes(q));
      return inName || inCreator || inTeam || inPlatform;
    });
  };

  const renderCampaignCard = (campaign: Campaign) => (
    <Card key={campaign.id} className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{campaign.name}</CardTitle>
            <CardDescription className="text-xs">
              {format(new Date(campaign.start_date), "MMM dd")} - {format(new Date(campaign.end_date), "MMM dd, yyyy")}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            {getStatusBadge(campaign.status)}
            {campaign.last_status_change && (
              <span className="text-xs text-muted-foreground">
                by {campaign.last_status_change.user_email.split('@')[0]}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Creator and Team Info */}
          <div className="grid grid-cols-2 gap-2 text-xs pb-2 border-b">
            <div>
              <p className="text-muted-foreground">Creator</p>
              <p className="font-medium truncate">{campaign.creator?.email?.split('@')[0] || 'Unknown'}</p>
            </div>
            {campaign.team && (
              <div>
                <p className="text-muted-foreground">Team</p>
                <p className="font-medium truncate">{campaign.team.name}</p>
              </div>
            )}
          </div>

          {/* User Permission */}
          {campaign.user_role && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="text-xs">
                {campaign.user_role === 'campaign_manager' ? 'Campaign Manager' : 
                 campaign.user_role.charAt(0).toUpperCase() + campaign.user_role.slice(1)}
              </Badge>
              {campaign.can_edit && (
                <span className="text-muted-foreground">• Can edit</span>
              )}
            </div>
          )}

          {/* Markets, Platforms & Objectives */}
          {(campaign.market_splits || campaign.platforms) && (
            <div className="space-y-2 text-xs pt-2 border-t">
              {campaign.market_splits && (
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Markets</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(campaign.market_splits).map((market) => (
                      <Badge key={market} variant="secondary" className="text-xs">
                        {market}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {campaign.platforms && campaign.platforms.length > 0 && (
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Platforms & Objectives</p>
                  <div className="space-y-1">
                    {campaign.platforms.map((platform: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {platform.name || platform.type}
                        </Badge>
                        {platform.objective && (
                          <span className="text-muted-foreground">→ {platform.objective}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-sm pt-2 border-t">
            <span className="text-muted-foreground">Budget</span>
            <span className="font-semibold">${campaign.total_budget.toLocaleString()}</span>
          </div>
          
          {campaign.forecast_data?.totalMetrics && (
            <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t">
              <div>
                <p className="text-muted-foreground">Reach</p>
                <p className="font-medium">{(campaign.forecast_data.totalMetrics.reach / 1000).toFixed(0)}K</p>
              </div>
              <div>
                <p className="text-muted-foreground">Impressions</p>
                <p className="font-medium">{(campaign.forecast_data.totalMetrics.impressions / 1000).toFixed(0)}K</p>
              </div>
              <div>
                <p className="text-muted-foreground">CPM</p>
                <p className="font-medium">${campaign.forecast_data.totalMetrics.cpm?.toFixed(2)}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            {campaign.pdf_url && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={async () => {
                  try {
                    const { data } = await supabase.storage
                      .from('campaign-pdfs')
                      .download(campaign.pdf_url!);
                    if (data) {
                      const url = URL.createObjectURL(data);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${campaign.name}-media-plan.pdf`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  } catch (error) {
                    toast.error("Failed to download PDF");
                  }
                }}
              >
                <Download className="w-3 h-3 mr-1" />
                PDF
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit(campaign) && (
                  <DropdownMenuItem onClick={() => window.location.href = `/?campaignId=${campaign.id}`}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit ActiPlan
                  </DropdownMenuItem>
                )}
                
                {canApprove(campaign) && (
                  <>
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
                      Reject Campaign
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedCampaign(campaign);
                        setModificationDialogOpen(true);
                      }}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Request Changes
                    </DropdownMenuItem>
                  </>
                )}

                {canPushToDSP(campaign) && (
                  <>
                    {canApprove(campaign) && <DropdownMenuSeparator />}
                    <DropdownMenuItem onClick={() => handlePushToDSP(campaign)} disabled={actionLoading}>
                      {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                      Launch Campaign
                    </DropdownMenuItem>
                  </>
                )}

                {campaign.status === "live" && (
                  <>
                    {(canEdit(campaign) || canApprove(campaign) || canPushToDSP(campaign)) && <DropdownMenuSeparator />}
                    <DropdownMenuItem onClick={() => {
                      const platform = campaign.platforms?.[0]?.type || campaign.platforms?.[0]?.name || "";
                      window.location.href = `/performance?campaignId=${campaign.id}&platform=${platform}`;
                    }}>
                      <TrendingUp className="w-4 h-4 mr-2" />
                      View Dashboard
                    </DropdownMenuItem>
                  </>
                )}

                {(canEdit(campaign) || canApprove(campaign) || canPushToDSP(campaign) || campaign.status === "live") && <DropdownMenuSeparator />}
                
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedCampaign(campaign);
                    setHistoryDialogOpen(true);
                  }}
                >
                  <History className="w-4 h-4 mr-2" />
                  View History
                </DropdownMenuItem>

                {canDelete(campaign) && (
                  <>
                    <DropdownMenuSeparator />
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
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );

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
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Back to create ActiPlan">
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
          <Button onClick={() => window.location.href = "/"}>
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
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="under_modification">Under Modification</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        {["all", "draft", "awaiting_approval", "approved", "live", "under_modification", "rejected"].map((status) => (
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
        </>
      )}

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
