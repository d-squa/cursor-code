import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, CheckCircle2, AlertCircle, Facebook, Link2, Unlink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { PLATFORM_CONFIG } from "@/config/platforms";
import PlatformAdAccountSelector from "@/components/PlatformAdAccountSelector";
import ClientSelectionDialog from "@/components/ClientSelectionDialog";

interface MetaAdAccount {
  id: string;
  account_id: string;
  account_name: string;
  account_status: string | null;
  client_id: string | null;
  clients?: {
    id: string;
    name: string;
  } | null;
}

interface ConnectedPlatform {
  id: string;
  platform_type: string;
  platform_name: string;
  is_active: boolean;
  created_at: string;
}

const PLATFORM_TYPES = [
  { id: "meta", name: "Meta (Facebook & Instagram)", icon: Facebook, color: "bg-blue-600" },
];

export default function PlatformConnections() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [platforms, setPlatforms] = useState<ConnectedPlatform[]>([]);
  const [metaAdAccounts, setMetaAdAccounts] = useState<MetaAdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adAccountOptions, setAdAccountOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectingAccount, setSelectingAccount] = useState(false);
  const [accountSelectorOpen, setAccountSelectorOpen] = useState(false);
  const [clientSelectorOpen, setClientSelectorOpen] = useState(false);
  const [selectedAdAccountForLinking, setSelectedAdAccountForLinking] = useState<string | null>(null);
  const processingOAuthRef = useRef(false);
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
      const [platformsRes, accountsRes] = await Promise.all([
        supabase
          .from("connected_platforms_safe")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("meta_ad_accounts")
          .select("id, account_id, account_name, account_status, client_id, clients(id, name)")
          .order("account_name")
      ]);

      if (platformsRes.error) throw platformsRes.error;
      if (accountsRes.error) throw accountsRes.error;

      setPlatforms(platformsRes.data || []);
      setMetaAdAccounts(accountsRes.data || []);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectPlatform = async (platformType: string, useManagedLogin = false) => {
    if (platformType === "meta") {
      try {
        // Redirect to Meta OAuth
        const redirectUri = "https://actiplan.app/settings/platforms";
        const clientId = PLATFORM_CONFIG.meta.appId;
        
        console.log("Meta OAuth - Client ID:", clientId ? "Configured" : "Missing");
        console.log("Meta OAuth - Redirect URI:", redirectUri);
        console.log("Meta OAuth - Managed Login:", useManagedLogin);
        
        if (!clientId) {
          toast.error("Meta App ID not configured. Please contact support.");
          return;
        }

        const scope = useManagedLogin ? PLATFORM_CONFIG.meta.managedLoginScopes : PLATFORM_CONFIG.meta.oauthScopes;
        
        // Build OAuth URL matching working Supermetrics flow
        const oauthParams = new URLSearchParams({
          response_type: 'code',
          scope,
          client_id: clientId,
          redirect_uri: redirectUri,
          state: platformType,
          ret: 'login'
        });
        
        // Include Facebook Login for Business configuration when using Managed Login (OpenID)
        if (useManagedLogin && PLATFORM_CONFIG.meta.configId) {
          oauthParams.set('config_id', PLATFORM_CONFIG.meta.configId);
        }
        
        // Use business.facebook.com for managed accounts, www.facebook.com for regular
        const baseUrl = useManagedLogin ? 'https://business.facebook.com' : 'https://www.facebook.com';
        const oauthUrl = `${baseUrl}/dialog/oauth?${oauthParams.toString()}`;
        
        console.log("Meta OAuth - Redirecting to:", oauthUrl.replace(clientId, 'HIDDEN'));
        
        // Add a small delay to ensure UI updates before redirect
        toast.loading("Redirecting to Facebook...");
        
        setTimeout(() => {
          window.location.href = oauthUrl;
        }, 100);
        
      } catch (error: any) {
        console.error("Error connecting to Meta:", error);
        toast.error(error.message || "Failed to connect to Facebook");
      }
    } else {
      toast.error("This platform is not yet supported");
    }
  };

  const handleDisconnectPlatform = async (platformId: string) => {
    if (!confirm("Are you sure you want to disconnect this platform? All related data will be permanently deleted.")) return;

    try {
      toast.loading("Disconnecting and purging platform data...");

      const { data, error } = await supabase.functions.invoke("purge-platform-data", {
        body: { connectedPlatformId: platformId },
      });

      if (error) throw error;

      toast.success("Platform and all related data have been removed");
      fetchConnectedPlatforms();
    } catch (error: any) {
      console.error("Error disconnecting platform:", error);
      toast.error(error.message || "Failed to disconnect platform");
    }
  };

  const handleSaveAdAccounts = async (accounts: { id: string; name: string }[]) => {
    if (accounts.length === 0) return;
    
    setSelectingAccount(true);
    try {
      const selectedIds = accounts.map(a => a.id);
      const { error } = await supabase.functions.invoke("sync-selected-accounts", {
        body: { selectedAccountIds: selectedIds }
      });

      if (error) throw error;

      toast.success("Selected ad accounts synced successfully!");
      setAccountSelectorOpen(false);
      setAdAccountOptions([]);
      await fetchConnectedPlatforms();
    } catch (error: any) {
      console.error("Sync error:", error);
      toast.error(error.message || "Failed to sync selected accounts");
    } finally {
      setSelectingAccount(false);
    }
  };

  const handleLinkAccountToClient = async (clientId: string) => {
    if (!selectedAdAccountForLinking) return;

    try {
      const { error } = await supabase
        .from("meta_ad_accounts")
        .update({ client_id: clientId })
        .eq("id", selectedAdAccountForLinking);

      if (error) throw error;

      toast.success("Ad account linked to client successfully");
      await fetchConnectedPlatforms();
    } catch (error: any) {
      console.error("Error linking account:", error);
      toast.error("Failed to link account to client");
      throw error;
    }
  };

  const handleUnlinkAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from("meta_ad_accounts")
        .update({ client_id: null })
        .eq("id", accountId);

      if (error) throw error;

      toast.success("Ad account unlinked from client");
      await fetchConnectedPlatforms();
    } catch (error: any) {
      console.error("Error unlinking account:", error);
      toast.error("Failed to unlink account");
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm("Are you sure you want to delete this ad account? This action cannot be undone.")) return;

    try {
      const { error } = await supabase
        .from("meta_ad_accounts")
        .delete()
        .eq("id", accountId);

      if (error) throw error;

      toast.success("Ad account deleted successfully");
      await fetchConnectedPlatforms();
    } catch (error: any) {
      console.error("Error deleting account:", error);
      toast.error("Failed to delete account");
    }
  };
  // Handle OAuth callback
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");

      if (code && state && !processingOAuthRef.current) {
        processingOAuthRef.current = true;
        // Clear URL immediately to prevent reuse
        window.history.replaceState({}, document.title, window.location.pathname);
        
        setSaving(true);
        try {
          const redirectUri = "https://actiplan.app/settings/platforms";
          const { data, error } = await supabase.functions.invoke("meta-oauth-callback", {
            body: { code, platformType: state, redirectUri }
          });

          if (error) throw error;

          toast.success("Platform connected! Select which ad accounts to sync.");

          if (Array.isArray(data?.adAccounts) && data.adAccounts.length > 0) {
            setAdAccountOptions(data.adAccounts);
            setAccountSelectorOpen(true);
          } else {
            toast.error("No ad accounts found");
          }

          await fetchConnectedPlatforms();
        } catch (error: any) {
          console.error("OAuth callback error:", error);
          const msg = (error?.message || "Failed to complete authentication");
          toast.error(msg + ". Please restart the connection process.");
        } finally {
          setSaving(false);
          processingOAuthRef.current = false;
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

        {/* Platform Authentication */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Authentication</CardTitle>
            <CardDescription>Connect to advertising platforms to sync ad accounts</CardDescription>
          </CardHeader>
          <CardContent>
            {platforms.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No platforms connected yet</p>
                <Button onClick={() => handleConnectPlatform("meta", false)}>
                  <Facebook className="h-4 w-4 mr-2" />
                  Connect Meta (Facebook & Instagram)
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {platforms.map((platform) => (
                  <div key={platform.id} className="flex items-center justify-between p-4 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Facebook className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="font-medium">{platform.platform_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Connected {new Date(platform.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => handleDisconnectPlatform(platform.id)}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Synced Ad Accounts */}
        <Card>
          <CardHeader>
            <CardTitle>Synced Ad Accounts</CardTitle>
            <CardDescription>Manage ad accounts, link to clients, and configure settings</CardDescription>
          </CardHeader>
          <CardContent>
            {metaAdAccounts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  No ad accounts synced yet. Connect a platform to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {metaAdAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between p-4 rounded-lg border">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{account.account_name}</p>
                        <Badge variant="outline">{account.account_id}</Badge>
                        {account.client_id && account.clients && (
                          <Badge variant="secondary">
                            <Link2 className="h-3 w-3 mr-1" />
                            {account.clients.name}
                          </Badge>
                        )}
                      </div>
                      {account.account_status && (
                        <p className="text-sm text-muted-foreground">Status: {account.account_status}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {account.client_id ? (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleUnlinkAccount(account.id)}
                        >
                          <Unlink className="h-4 w-4 mr-2" />
                          Unlink
                        </Button>
                      ) : (
                        <Button 
                          variant="default" 
                          size="sm"
                          onClick={() => {
                            setSelectedAdAccountForLinking(account.id);
                            setClientSelectorOpen(true);
                          }}
                        >
                          <Link2 className="h-4 w-4 mr-2" />
                          Link to Client
                        </Button>
                      )}
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDeleteAccount(account.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <PlatformAdAccountSelector
          open={accountSelectorOpen}
          onOpenChange={setAccountSelectorOpen}
          adAccounts={adAccountOptions}
          onSelect={handleSaveAdAccounts}
          loading={selectingAccount}
        />

        {user && (
          <ClientSelectionDialog
            open={clientSelectorOpen}
            onOpenChange={setClientSelectorOpen}
            userId={user.id}
            onClientSelected={handleLinkAccountToClient}
          />
        )}
      </div>
    </div>
  );
}
