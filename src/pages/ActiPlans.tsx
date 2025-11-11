import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Play, Edit, CheckCircle, XCircle, MessageSquare, History, Trash2, Download, TrendingUp, MoreVertical, ArrowLeft } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { ModificationRequestDialog } from "@/components/ModificationRequestDialog";
import { ChangeHistoryDialog } from "@/components/ChangeHistoryDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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

  useEffect(() => {
    if (user) {
      loadCampaigns();
    }
  }, [user]);

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCampaigns((data as any) || []);
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
    return campaign.user_id === user?.id && campaign.status !== "rejected";
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
    if (status === "all") return campaigns;
    return campaigns.filter((c) => c.status === status);
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
          {getStatusBadge(campaign.status)}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
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
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">ActiPlans</h1>
        </div>
        <Button onClick={() => window.location.href = "/"}>
          New ActiPlan
        </Button>
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
