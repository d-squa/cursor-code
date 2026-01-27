import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, CheckCircle2, AlertCircle, Facebook, Link2, Unlink, Video, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LockedFeatureButton } from "@/components/ui/locked-feature-button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { PLATFORM_CONFIG } from "@/config/platforms";
import PlatformAdAccountSelector from "@/components/PlatformAdAccountSelector";
import PlatformAccountsCollapsible from "@/components/PlatformAccountsCollapsible";
import ClientSelectionDialog from "@/components/ClientSelectionDialog";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { usePlatformSyncProgress } from "@/hooks/useTikTokSyncProgress";
import PlatformSyncProgressDialog from "@/components/PlatformSyncProgressDialog";

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

interface TikTokAdAccount {
  id: string;
  account_id: string;
  account_name: string;
  advertiser_id: string;
  account_status: string | null;
  client_id: string | null;
  bc_id?: string | null;
  business_center?: {
    bc_id: string;
    name: string;
    role?: string;
    status?: string;
  } | null;
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
  business_manager_id: string | null;
  metadata: any;
}

const PLATFORM_TYPES = [
  { id: "meta", name: "Meta (Facebook & Instagram)", icon: Facebook, color: "bg-blue-600" },
  { id: "tiktok", name: "TikTok Ads", icon: Video, color: "bg-black" },
];

export default function PlatformConnections() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { hasAccess } = useFeatureAccess();
  const canManageClients = hasAccess('client_management');
  const [platforms, setPlatforms] = useState<ConnectedPlatform[]>([]);
  const [metaAdAccounts, setMetaAdAccounts] = useState<MetaAdAccount[]>([]);
  const [tiktokAdAccounts, setTikTokAdAccounts] = useState<TikTokAdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adAccountOptions, setAdAccountOptions] = useState<{ id: string; name: string; business_center?: any }[]>([]);
  const [selectingAccount, setSelectingAccount] = useState(false);
  const [accountSelectorOpen, setAccountSelectorOpen] = useState(false);
  const [clientSelectorOpen, setClientSelectorOpen] = useState(false);
  const [selectedAdAccountForLinking, setSelectedAdAccountForLinking] = useState<string | null>(null);
  const [pendingSyncAfterLink, setPendingSyncAfterLink] = useState<MetaAdAccount | TikTokAdAccount | null>(null);
  const [pendingSyncPlatform, setPendingSyncPlatform] = useState<'meta' | 'tiktok' | null>(null);
  const [reconnectingPlatformId, setReconnectingPlatformId] = useState<string | null>(null);
  const [currentPlatformId, setCurrentPlatformId] = useState<string | null>(null);
  const [syncProgressPlatformId, setSyncProgressPlatformId] = useState<string | null>(null);
  const [syncProgressDialogOpen, setSyncProgressDialogOpen] = useState(false);
  const [syncingAssets, setSyncingAssets] = useState<string | null>(null);
  const processingOAuthRef = useRef(false);
  
  // Platform sync progress tracking (works for both TikTok and Meta)
  const { progress: platformSyncProgress } = usePlatformSyncProgress(syncProgressPlatformId);
  
  // Check for in-progress syncs on page load
  useEffect(() => {
    const checkExistingSyncs = async () => {
      if (!user) return;
      
      // Check sessionStorage for pending sync (supports both platforms)
      const pendingSyncPlatformId = sessionStorage.getItem('platform_sync_id');
      if (pendingSyncPlatformId) {
        // Verify sync status
        const { data } = await supabase
          .from('connected_platforms_safe')
          .select('metadata')
          .eq('id', pendingSyncPlatformId)
          .single();
        
        const metadata = data?.metadata as any;
        const syncProgress = metadata?.sync_progress;
        
        if (syncProgress?.status === 'pending' || syncProgress?.status === 'syncing') {
          // Still in progress - show the dialog
          setSyncProgressPlatformId(pendingSyncPlatformId);
          setSyncProgressDialogOpen(true);
        } else if (syncProgress?.status === 'completed' && metadata?.accounts?.length > 0) {
          // Completed while away - show account selector directly
          console.log('[PlatformConnections] Sync completed while away, showing account selector');
          sessionStorage.removeItem('platform_sync_id');
          
          const accountOptions = metadata.accounts.map((acc: any) => ({
            id: acc.advertiser_id || acc.id,
            name: acc.name,
            business_center: acc.business_center
          }));
          
          setAdAccountOptions(accountOptions);
          setCurrentPlatformId(pendingSyncPlatformId);
          setAccountSelectorOpen(true);
          toast.success(`Sync complete! Found ${accountOptions.length} account(s) - please select which to link`);
        } else {
          // Error or no accounts - just clean up
          sessionStorage.removeItem('platform_sync_id');
        }
      }
    };
    
    checkExistingSyncs();
  }, [user]);
  
  // Handle sync completion - open account selector
  const handleSyncComplete = useCallback(async () => {
    if (!syncProgressPlatformId) return;
    
    sessionStorage.removeItem('platform_sync_id');
    
    // Fetch the completed accounts from metadata
    const { data } = await supabase
      .from('connected_platforms_safe')
      .select('metadata')
      .eq('id', syncProgressPlatformId)
      .single();
    
    const metadata = data?.metadata as any;
    if (metadata?.accounts && metadata.accounts.length > 0) {
      const accountOptions = metadata.accounts.map((acc: any) => ({
        id: acc.advertiser_id || acc.id,
        name: acc.name,
        business_center: acc.business_center
      }));
      
      setAdAccountOptions(accountOptions);
      setCurrentPlatformId(syncProgressPlatformId);
      setAccountSelectorOpen(true);
      toast.success(`Found ${accountOptions.length} advertiser account(s) - please select which to sync`);
    }
    
    setSyncProgressPlatformId(null);
    setSyncProgressDialogOpen(false);
    await fetchConnectedPlatforms();
  }, [syncProgressPlatformId]);
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
      const [platformsRes, metaAccountsRes, tiktokAccountsRes] = await Promise.all([
        supabase
          .from("connected_platforms_safe")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("meta_ad_accounts")
          .select("id, account_id, account_name, account_status, client_id, clients(id, name)")
          .order("account_name"),
        supabase
          .from("tiktok_ad_accounts")
          .select("id, account_id, account_name, advertiser_id, account_status, client_id, clients(id, name)")
          .order("account_name")
      ]);

      if (platformsRes.error) throw platformsRes.error;
      if (metaAccountsRes.error) throw metaAccountsRes.error;
      if (tiktokAccountsRes.error) throw tiktokAccountsRes.error;

      setPlatforms(platformsRes.data || []);
      setMetaAdAccounts(metaAccountsRes.data || []);
      
      // Enrich TikTok accounts with business center info from platform metadata
      const tiktokPlatforms = platformsRes.data?.filter(p => p.platform_type === 'tiktok') || [];
      const enrichedTiktokAccounts = (tiktokAccountsRes.data || []).map(account => {
        // Find the platform that contains this advertiser
        const platform = tiktokPlatforms.find(p => {
          const metadata = p.metadata as any;
          return metadata?.advertiser_ids?.includes(account.advertiser_id);
        });
        
        if (platform?.metadata) {
          const metadata = platform.metadata as any;
          const accountInfo = metadata.accounts?.find(
            (acc: any) => acc.advertiser_id === account.advertiser_id
          );
          
          if (accountInfo) {
            return {
              ...account,
              bc_id: accountInfo.bc_id,
              business_center: accountInfo.business_center
            };
          }
        }
        
        return account;
      });
      
      setTikTokAdAccounts(enrichedTiktokAccounts);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectPlatform = async (platformType: string, useManagedLogin = false, platformId?: string) => {
    // Always clear reconnection state for fresh connections
    sessionStorage.removeItem('reconnecting_platform_id');
    sessionStorage.removeItem('reconnecting_platform_type');
    
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
        
        // Store platformId in sessionStorage ONLY for explicit reconnection
        if (platformId) {
          sessionStorage.setItem('reconnecting_platform_id', platformId);
        }
        
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
    } else if (platformType === "tiktok") {
      try {
        const redirectUri = "https://actiplan.app/settings/platforms";
        const appId = PLATFORM_CONFIG.tiktok.appId;
        
        console.log("TikTok OAuth - App ID:", appId ? "Configured" : "Missing");
        console.log("TikTok OAuth - Redirect URI:", redirectUri);
        
        if (!appId) {
          toast.error("TikTok App ID not configured. Please contact support.");
          return;
        }

        // Store platformId in sessionStorage ONLY for explicit reconnection
        if (platformId) {
          sessionStorage.setItem('reconnecting_platform_id', platformId);
          sessionStorage.setItem('reconnecting_platform_type', 'tiktok');
        }
        
        // Build TikTok OAuth URL
        const oauthParams = new URLSearchParams({
          app_id: appId,
          redirect_uri: redirectUri,
          state: platformType,
        });
        
        const oauthUrl = `${PLATFORM_CONFIG.tiktok.authEndpoint}?${oauthParams.toString()}`;
        
        console.log("TikTok OAuth - Redirecting to:", oauthUrl.replace(appId, 'HIDDEN'));
        
        toast.loading("Redirecting to TikTok...");
        
        setTimeout(() => {
          window.location.href = oauthUrl;
        }, 100);
        
      } catch (error: any) {
        console.error("Error connecting to TikTok:", error);
        toast.error(error.message || "Failed to connect to TikTok");
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

  const handleSaveAdAccounts = async (accounts: { id: string; name: string; business_center?: any }[]) => {
    if (accounts.length === 0 || !currentPlatformId) return;
    
    setSelectingAccount(true);
    try {
      const selectedIds = accounts.map(a => a.id);
      const { data, error } = await supabase.functions.invoke("sync-selected-accounts", {
        body: { 
          selectedAccountIds: selectedIds,
          platformId: currentPlatformId 
        }
      });

      if (error) throw error;

      // Check if this is a background sync (Meta with many accounts)
      if (data?.background) {
        // Store platform ID for progress tracking
        sessionStorage.setItem('platform_sync_id', currentPlatformId);
        setSyncProgressPlatformId(currentPlatformId);
        setSyncProgressDialogOpen(true);
        setAccountSelectorOpen(false);
        setAdAccountOptions([]);
        toast.info(`Syncing ${selectedIds.length} accounts in background...`);
      } else {
        // Synchronous sync completed (TikTok or small account sets)
        toast.success("Selected ad accounts synced successfully!");
        setAccountSelectorOpen(false);
        setAdAccountOptions([]);
        setCurrentPlatformId(null);
        await fetchConnectedPlatforms();
      }
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
      const isTikTok = selectedAdAccountForLinking.startsWith('tiktok_');
      const table = isTikTok ? 'tiktok_ad_accounts' : 'meta_ad_accounts';
      const cleanId = isTikTok ? selectedAdAccountForLinking.replace('tiktok_', '') : selectedAdAccountForLinking;
      
      const { error } = await supabase
        .from(table)
        .update({ client_id: clientId })
        .eq("id", cleanId);

      if (error) throw error;

      toast.success("Ad account linked to client successfully");
      await fetchConnectedPlatforms();
      
      // If there's a pending sync after link, trigger it now
      if (pendingSyncAfterLink) {
        const updatedAccount = { ...pendingSyncAfterLink, client_id: clientId };
        setPendingSyncAfterLink(null);
        setPendingSyncPlatform(null);
        // Trigger sync with updated account (skip client check since we just linked)
        if (isTikTok) {
          await handleSyncTikTokAccountAssets(updatedAccount as TikTokAdAccount, true);
        } else {
          await handleSyncAccountAssets(updatedAccount as MetaAdAccount, true);
        }
      }
    } catch (error: any) {
      console.error("Error linking account:", error);
      toast.error("Failed to link account to client");
      throw error;
    } finally {
      setSelectedAdAccountForLinking(null);
      setPendingSyncAfterLink(null);
      setPendingSyncPlatform(null);
    }
  };

  const handleUnlinkAccount = async (accountId: string, platform: 'meta' | 'tiktok' = 'meta') => {
    try {
      const table = platform === 'tiktok' ? 'tiktok_ad_accounts' : 'meta_ad_accounts';
      const { error } = await supabase
        .from(table)
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

  const handleDeleteAccount = async (accountId: string, platform: 'meta' | 'tiktok' = 'meta') => {
    if (!confirm("Are you sure you want to delete this ad account? This action cannot be undone.")) return;

    try {
      const table = platform === 'tiktok' ? 'tiktok_ad_accounts' : 'meta_ad_accounts';
      const { error } = await supabase
        .from(table)
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
          const platformId = sessionStorage.getItem('reconnecting_platform_id');
          const platformType = sessionStorage.getItem('reconnecting_platform_type') || state;
          sessionStorage.removeItem('reconnecting_platform_id');
          sessionStorage.removeItem('reconnecting_platform_type');
          
          console.log('OAuth callback - platformType:', platformType);
          console.log('OAuth callback - platformId:', platformId);
          
          const callbackFunction = platformType === "tiktok" ? "tiktok-oauth-callback" : "meta-oauth-callback";
          
          console.log('OAuth callback - calling function:', callbackFunction);
          
          // Only include platformId if it's a valid string (not null/undefined)
          const { data, error } = await supabase.functions.invoke(callbackFunction, {
            body: { 
              code, 
              platformType: state, 
              redirectUri, 
              ...(platformId ? { platformId } : {}) 
            }
          });

          console.log('OAuth callback - response data:', data);
          console.log('OAuth callback - response error:', error);

          if (error) throw error;

          // Handle TikTok background sync
          if (platformType === 'tiktok' && data?.syncInProgress) {
            toast.success("TikTok connected! Syncing advertiser accounts...");
            sessionStorage.setItem('platform_sync_id', data.platformId);
            setSyncProgressPlatformId(data.platformId);
            setSyncProgressDialogOpen(true);
            await fetchConnectedPlatforms();
            return;
          }

          if (platformId) {
            toast.success("Platform reconnected successfully!");
          } else {
            toast.success(`${platformType === 'tiktok' ? 'TikTok' : 'Platform'} connected successfully!`);
          }

          // Open account selector if accounts are returned (Meta flow)
          if (Array.isArray(data?.accounts) && data.accounts.length > 0) {
            const accountOptions = data.accounts.map((acc: any) => ({
              id: acc.advertiser_id || acc.id,
              name: acc.name,
              business_center: acc.business_center
            }));
            
            setAdAccountOptions(accountOptions);
            setCurrentPlatformId(data.platformId);
            setAccountSelectorOpen(true);
            toast.success(`Found ${data.accounts.length} account(s) - please select which to sync`);
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

  const handleSyncAccountAssets = async (account: MetaAdAccount, skipClientCheck = false) => {
    // If account has no client linked, prompt user to link first (for benchmark features)
    if (!account.client_id && !skipClientCheck && canManageClients) {
      setPendingSyncAfterLink(account);
      setPendingSyncPlatform('meta');
      setSelectedAdAccountForLinking(account.id);
      setClientSelectorOpen(true);
      return;
    }

    setSyncingAssets(account.id);
    try {
      const { data, error } = await supabase.functions.invoke("sync-account-assets", {
        body: {
          accountId: account.account_id,
          platform: "meta",
        },
      });

      if (error) throw error;

      toast.success(`Assets synced for ${account.account_name}`, {
        description: data?.message || "Pixels, pages, catalogs, and benchmarks synced successfully",
      });
    } catch (error: any) {
      console.error("Error syncing assets:", error);
      toast.error("Failed to sync assets", {
        description: error.message || "Please try again",
      });
    } finally {
      setSyncingAssets(null);
    }
  };

  const handleSyncTikTokAccountAssets = async (account: TikTokAdAccount, skipClientCheck = false) => {
    // If account has no client linked, prompt user to link first (for benchmark features)
    if (!account.client_id && !skipClientCheck && canManageClients) {
      setPendingSyncAfterLink(account);
      setPendingSyncPlatform('tiktok');
      setSelectedAdAccountForLinking('tiktok_' + account.id);
      setClientSelectorOpen(true);
      return;
    }

    setSyncingAssets(account.id);
    try {
      // First sync TikTok resources (pixels, identities, catalogs)
      const { error: resourcesError } = await supabase.functions.invoke("sync-tiktok-resources", {
        body: {
          advertiserId: account.advertiser_id,
        },
      });

      if (resourcesError) {
        console.error("Error syncing TikTok resources:", resourcesError);
      }

      // Then sync benchmarks
      const { data, error } = await supabase.functions.invoke("sync-tiktok-benchmarks", {
        body: {
          advertiserId: account.advertiser_id,
        },
      });

      if (error) throw error;

      toast.success(`Assets synced for ${account.account_name}`, {
        description: "Pixels, identities, and benchmarks synced successfully",
      });
    } catch (error: any) {
      console.error("Error syncing TikTok assets:", error);
      toast.error("Failed to sync assets", {
        description: error.message || "Please try again",
      });
    } finally {
      setSyncingAssets(null);
    }
  };

  const handleClientSelectorClose = (open: boolean) => {
    if (!open && pendingSyncAfterLink) {
      // User closed without selecting - ask if they want to sync anyway
      const syncAnyway = window.confirm(
        "Syncing without a client linked means benchmark data won't be available for improved forecasting.\n\nDo you want to sync anyway?"
      );
      if (syncAnyway) {
        if (pendingSyncPlatform === 'tiktok') {
          handleSyncTikTokAccountAssets(pendingSyncAfterLink as TikTokAdAccount, true);
        } else {
          handleSyncAccountAssets(pendingSyncAfterLink as MetaAdAccount, true);
        }
      }
      setPendingSyncAfterLink(null);
      setPendingSyncPlatform(null);
      setSelectedAdAccountForLinking(null);
    }
    setClientSelectorOpen(open);
  };

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
          <Button onClick={() => navigate("/overview")}>Back to Dashboard</Button>
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
                <div className="flex gap-3 justify-center">
                  <Button onClick={() => handleConnectPlatform("meta", false)}>
                    <Facebook className="h-4 w-4 mr-2" />
                    Connect Meta
                  </Button>
                  <Button onClick={() => handleConnectPlatform("tiktok", false)} variant="outline" className="border-black/20 dark:border-white/20">
                    <Video className="h-4 w-4 mr-2" />
                    Connect TikTok
                  </Button>
                </div>
              </div>
            ) : (
            <div className="space-y-3">
              {platforms.map((platform) => {
                const businessName = platform.metadata?.businesses?.[0]?.name;
                const advertiserIds = platform.metadata?.advertiser_ids;
                const isTikTok = platform.platform_type === 'tiktok';
                const Icon = isTikTok ? Video : Facebook;
                const iconColor = isTikTok ? 'text-black dark:text-white' : 'text-blue-600';
                const bgColor = isTikTok ? 'bg-black/5 dark:bg-white/5' : '';
                
                return (
                  <div key={platform.id} className={`flex items-center justify-between p-4 rounded-lg border ${bgColor}`}>
                    <div className="flex items-center gap-3">
                      <Icon className={`h-5 w-5 ${iconColor}`} />
                      <div>
                        <p className="font-medium">{platform.platform_name}</p>
                        {businessName && (
                          <p className="text-sm text-muted-foreground">Business: {businessName}</p>
                        )}
                        {isTikTok && advertiserIds && advertiserIds.length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            {advertiserIds.length} advertiser account{advertiserIds.length !== 1 ? 's' : ''}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Connected {new Date(platform.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleConnectPlatform(platform.platform_type, false, platform.id)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Reconnect
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => handleDisconnectPlatform(platform.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Disconnect
                      </Button>
                    </div>
                  </div>
                );
              })}
              <div className="pt-4 border-t flex gap-3">
                <Button onClick={() => handleConnectPlatform("meta", false)}>
                  <Facebook className="h-4 w-4 mr-2" />
                  Connect Another Meta Account
                </Button>
                <Button onClick={() => handleConnectPlatform("tiktok", false)} variant="outline" className="border-black/20 dark:border-white/20">
                  <Video className="h-4 w-4 mr-2" />
                  Connect TikTok Account
                </Button>
              </div>
            </div>
            )}
          </CardContent>
        </Card>

        {/* Platform Ad Accounts - Collapsible */}
        <Card>
          <CardHeader>
            <CardTitle>Ad Accounts</CardTitle>
            <CardDescription>Manage ad accounts by platform. Click to expand each platform.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Meta Ad Accounts - Collapsible */}
            <PlatformAccountsCollapsible
              platform="meta"
              icon={<Facebook className="h-5 w-5 text-blue-600" />}
              title="Meta Ad Accounts"
              accounts={metaAdAccounts}
              emptyMessage="No Meta ad accounts synced yet. Connect a Meta platform to get started."
              syncingAssets={syncingAssets}
              canManageClients={canManageClients}
              onSyncAccount={handleSyncAccountAssets}
              onLinkAccount={(accountId) => {
                setSelectedAdAccountForLinking(accountId);
                setClientSelectorOpen(true);
              }}
              onUnlinkAccount={(accountId) => handleUnlinkAccount(accountId, 'meta')}
              onDeleteAccount={(accountId) => handleDeleteAccount(accountId, 'meta')}
            />

            {/* TikTok Ad Accounts - Collapsible */}
            <PlatformAccountsCollapsible
              platform="tiktok"
              icon={<Video className="h-5 w-5 text-black dark:text-white" />}
              title="TikTok Ad Accounts"
              accounts={tiktokAdAccounts}
              emptyMessage="No TikTok ad accounts synced yet. Connect a TikTok platform to get started."
              syncingAssets={syncingAssets}
              canManageClients={canManageClients}
              onSyncAccount={handleSyncTikTokAccountAssets}
              onLinkAccount={(accountId) => {
                setSelectedAdAccountForLinking('tiktok_' + accountId);
                setClientSelectorOpen(true);
              }}
              onUnlinkAccount={(accountId) => handleUnlinkAccount(accountId, 'tiktok')}
              onDeleteAccount={(accountId) => handleDeleteAccount(accountId, 'tiktok')}
            />
          </CardContent>
        </Card>
        <PlatformAdAccountSelector
          open={accountSelectorOpen}
          onOpenChange={setAccountSelectorOpen}
          adAccounts={adAccountOptions}
          onSelect={handleSaveAdAccounts}
          loading={selectingAccount}
          platformType={platforms.find(p => p.id === currentPlatformId)?.platform_type || 'meta'}
        />

        {user && (
          <ClientSelectionDialog
            open={clientSelectorOpen}
            onOpenChange={handleClientSelectorClose}
            userId={user.id}
            onClientSelected={handleLinkAccountToClient}
            title={pendingSyncAfterLink ? "Link Account for Better Forecasting" : undefined}
            description={pendingSyncAfterLink ? "Link this ad account to a client to enable benchmark-based forecasting. This uses your historical performance data for more accurate predictions." : undefined}
          />
        )}

        <PlatformSyncProgressDialog
          open={syncProgressDialogOpen}
          onOpenChange={setSyncProgressDialogOpen}
          progress={platformSyncProgress}
          platformId={syncProgressPlatformId}
          onComplete={handleSyncComplete}
        />
      </div>
    </div>
  );
}
