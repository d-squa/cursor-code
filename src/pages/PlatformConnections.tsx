import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, CheckCircle2, AlertCircle, Facebook, Instagram, Linkedin } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { PLATFORM_CONFIG } from "@/config/platforms";
import PlatformAdAccountSelector from "@/components/PlatformAdAccountSelector";

interface ConnectedPlatform {
  id: string;
  platform_type: string;
  platform_name: string;
  ad_account_id: string;
  ad_account_name: string;
  is_active: boolean;
  created_at: string;
}

const PLATFORM_TYPES = [
  { id: "meta", name: "Meta (Facebook & Instagram)", icon: Facebook, color: "bg-blue-600" },
  { id: "google_ads", name: "Google Ads", icon: null, color: "bg-green-600" },
  { id: "linkedin", name: "LinkedIn", icon: Linkedin, color: "bg-blue-700" },
  { id: "tiktok", name: "TikTok", icon: null, color: "bg-black" },
];

export default function PlatformConnections() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [platforms, setPlatforms] = useState<ConnectedPlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adAccountOptions, setAdAccountOptions] = useState<{ id: string; name: string }[]>([]);
  const [newPlatformId, setNewPlatformId] = useState<string | null>(null);
  const [selectingAccount, setSelectingAccount] = useState(false);
  const [accountSelectorOpen, setAccountSelectorOpen] = useState(false);
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchConnectedPlatforms();
    }
  }, [user]);

  const fetchConnectedPlatforms = async () => {
    try {
      const { data, error } = await supabase
        .from("connected_platforms")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPlatforms(data || []);
    } catch (error: any) {
      console.error("Error fetching platforms:", error);
      toast.error("Failed to load connected platforms");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectPlatform = async (platformType: string) => {
    if (platformType === "meta") {
      // Redirect to Meta OAuth
      const redirectUri = `${window.location.origin}/platforms`;
      const clientId = PLATFORM_CONFIG.meta.appId;
      
      if (!clientId) {
        toast.error("Meta App ID not configured. Please add VITE_META_APP_ID to your environment variables.");
        return;
      }

      const scope = PLATFORM_CONFIG.meta.oauthScopes;
      const oauthUrl = `https://www.facebook.com/${PLATFORM_CONFIG.meta.apiVersion}/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${platformType}`;
      
      window.location.href = oauthUrl;
    } else {
      toast.error("This platform is not yet supported");
    }
  };

  const handleDisconnectPlatform = async (platformId: string) => {
    if (!confirm("Are you sure you want to disconnect this platform?")) return;

    try {
      const { error } = await supabase
        .from("connected_platforms")
        .delete()
        .eq("id", platformId);

      if (error) throw error;
      toast.success("Platform disconnected");
      fetchConnectedPlatforms();
    } catch (error: any) {
      console.error("Error disconnecting platform:", error);
      toast.error("Failed to disconnect platform");
    }
  };

  const handleSaveAdAccount = async (account: { id: string; name: string }) => {
    if (!newPlatformId) return;
    try {
      setSelectingAccount(true);
      const { error } = await supabase
        .from("connected_platforms")
        .update({
          ad_account_id: account.id,
          ad_account_name: account.name,
          is_active: true,
        })
        .eq("id", newPlatformId);

      if (error) throw error;

      toast.success("Ad account linked.");
      setAccountSelectorOpen(false);
      setNewPlatformId(null);
      setAdAccountOptions([]);
      fetchConnectedPlatforms();
    } catch (e: any) {
      console.error("Failed to link ad account:", e);
      toast.error(e?.message || "Failed to link ad account");
    } finally {
      setSelectingAccount(false);
    }
  };

  // Handle OAuth callback
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");

      if (code && state) {
        setSaving(true);
        try {
          const redirectUri = `${window.location.origin}/platforms`;
          const { data, error } = await supabase.functions.invoke("meta-oauth-callback", {
            body: { code, platformType: state, redirectUri }
          });

          if (error) throw error;

          toast.success("Platform connected! Please select an ad account to link.");

          if (data?.platformId) {
            setNewPlatformId(data.platformId);
          }

          if (Array.isArray(data?.adAccounts) && data.adAccounts.length > 0) {
            setAdAccountOptions(data.adAccounts);
            setAccountSelectorOpen(true);
          }

          await fetchConnectedPlatforms();
        } catch (error: any) {
          console.error("OAuth callback error:", error);
          const msg = (error?.message || "Failed to complete authentication");
          toast.error(msg + ". Please restart the connection process.");
        } finally {
          // Always clear URL parameters to avoid reusing/rehitting expired codes on refresh
          window.history.replaceState({}, document.title, window.location.pathname);
          setSaving(false);
        }
      }
    };

    if (user) {
      handleOAuthCallback();
    }
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Connect Your Platforms & Accounts</h1>
            <p className="text-muted-foreground mt-2">
              Link your advertising platforms to enable campaign management and forecasting
            </p>
          </div>
          <Button onClick={() => navigate("/")}>Back to Dashboard</Button>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Connecting your platforms allows the system to access your ad accounts, pages, and Instagram accounts
            for accurate forecasting and campaign management.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Connected Platforms</CardTitle>
                <CardDescription>Manage your advertising platform connections</CardDescription>
              </div>
              <div className="flex gap-2">
                {PLATFORM_TYPES.map((platform) => {
                  const Icon = platform.icon;
                  return (
                    <Button
                      key={platform.id}
                      onClick={() => handleConnectPlatform(platform.id)}
                      disabled={saving}
                    >
                      {Icon && <Icon className="h-4 w-4 mr-2" />}
                      Connect {platform.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {platforms.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                  <Plus className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No platforms connected</h3>
                <p className="text-muted-foreground mb-4">
                  Connect your first advertising platform to get started
                </p>
                <div className="flex gap-2 justify-center">
                  {PLATFORM_TYPES.map((platform) => {
                    const Icon = platform.icon;
                    return (
                      <Button
                        key={platform.id}
                        onClick={() => handleConnectPlatform(platform.id)}
                      >
                        {Icon && <Icon className="h-4 w-4 mr-2" />}
                        {platform.name}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {platforms.map((platform) => {
                  const platformType = PLATFORM_TYPES.find(p => p.id === platform.platform_type);
                  const Icon = platformType?.icon;
                  
                  return (
                    <div
                      key={platform.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-4">
                        {Icon && (
                          <div className={`p-3 rounded-lg ${platformType.color}`}>
                            <Icon className="h-6 w-6 text-white" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{platform.platform_name}</h3>
                            {platform.is_active && (
                              <Badge variant="outline" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Active
                              </Badge>
                            )}
                          </div>
                          {platform.ad_account_name ? (
                            <p className="text-sm text-muted-foreground">
                              {platform.ad_account_name} • {platform.ad_account_id}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground">No ad account linked yet</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Connected {new Date(platform.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDisconnectPlatform(platform.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <PlatformAdAccountSelector
          open={accountSelectorOpen}
          onOpenChange={setAccountSelectorOpen}
          adAccounts={adAccountOptions}
          onSelect={handleSaveAdAccount}
          loading={selectingAccount}
        />
      </div>
    </div>
  );
}
