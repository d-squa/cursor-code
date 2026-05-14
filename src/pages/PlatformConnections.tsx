import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Facebook,
  Link2,
  Unlink,
  Video,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { SiMeta, SiTiktok, SiGoogleads, SiSnapchat } from "react-icons/si";
import { FaLinkedin, FaPinterest } from "react-icons/fa";
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
import { useAdAccountLimits, canHaveMultipleAccounts } from "@/hooks/useAdAccountLimits";
import AdAccountUpgradeModal from "@/components/AdAccountUpgradeModal";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import SwapCounterBadge from "@/components/SwapCounterBadge";
import { TourDataBanner } from "@/components/TourDataBanner";
import { useSampleMode } from "@/contexts/SampleModeContext";

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

interface GoogleAdAccount {
  id: string;
  account_id: string;
  account_name: string;
  customer_id: string;
  account_status: string | null;
  client_id: string | null;
  currency?: string | null;
  timezone?: string | null;
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
  { id: "google", name: "Google Ads", icon: Search, color: "bg-yellow-500" },
  { id: "snapchat", name: "Snapchat Ads", icon: Video, color: "bg-yellow-400" },
];

/** Canonical app path — must match Meta / TikTok / Google developer console allowlists exactly. */
const OAUTH_REDIRECT_PATH = "/app/settings/platforms";

/**
 * OAuth callback pathname (leading slash). Optional `VITE_OAUTH_REDIRECT_PATH` overrides at build time
 * (e.g. Vercel). Legacy `/settings/platforms` is always normalized to `/app/settings/platforms` so the
 * TikTok authorize URL matches the registered redirect URI (even if an old constant/env slips in).
 */
function oauthRedirectPath(): string {
  const fromEnv = (import.meta.env.VITE_OAUTH_REDIRECT_PATH as string | undefined)?.trim();
  const raw = fromEnv || OAUTH_REDIRECT_PATH;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return path === "/settings/platforms" ? "/app/settings/platforms" : path;
}

/**
 * Redirect URI sent to platform OAuth dialogs and token exchange.
 * Defaults to the current browser origin + path (works for production HTTPS).
 *
 * Meta in Live mode rejects http://localhost — options:
 * - Keep the Meta app in Development while testing locally, and allowlist e.g. http://localhost:8080/app/settings/platforms (Vite dev port)
 * - Or set VITE_OAUTH_REDIRECT_ORIGIN=https://your-https-domain.com (staging/production) and complete OAuth on that host
 * - Or use an HTTPS tunnel (ngrok, etc.) and allowlist that URL
 *
 * If TikTok still returned you to `/settings/platforms...`, SettingsLegacyRedirect in App.tsx sends the SPA to
 * `/app/settings/platforms...` — so the callback can look correct while the **authorize** URL still showed the legacy path.
 *
 * `VITE_OAUTH_REDIRECT_ORIGIN` must be **origin only** (scheme + host + port). If it accidentally
 * includes a path (e.g. copied old `/settings/platforms`), we strip to `.origin` so redirect_uri is always `origin + path`.
 */
function oauthOriginFromEnv(): string {
  const raw = (import.meta.env.VITE_OAUTH_REDIRECT_ORIGIN as string | undefined)?.trim();
  if (!raw) return window.location.origin;
  try {
    let urlString = raw;
    if (!/^https?:\/\//i.test(raw)) {
      urlString =
        raw.includes("localhost") || /^127\./.test(raw) ? `http://${raw}` : `https://${raw}`;
    }
    return new URL(urlString).origin;
  } catch {
    return window.location.origin;
  }
}

function getOAuthRedirectUri(): string {
  const origin = oauthOriginFromEnv();
  let uri = `${origin}${oauthRedirectPath()}`;
  try {
    const u = new URL(uri);
    const p = u.pathname.replace(/\/+$/, "") || "/";
    if (p === "/settings/platforms") {
      u.pathname = "/app/settings/platforms";
      uri = u.origin + u.pathname + u.search + u.hash;
    }
  } catch {
    /* keep concat */
  }
  return uri;
}

export default function PlatformConnections() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { hasAccess } = useFeatureAccess();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const { isSampleMode } = useSampleMode();
  const isSampleModeRef = useRef(isSampleMode);
  useEffect(() => { isSampleModeRef.current = isSampleMode; }, [isSampleMode]);
  const canManageClients = hasAccess("client_management");
  const [platforms, setPlatforms] = useState<ConnectedPlatform[]>([]);
  const [metaAdAccounts, setMetaAdAccounts] = useState<MetaAdAccount[]>([]);
  const [tiktokAdAccounts, setTikTokAdAccounts] = useState<TikTokAdAccount[]>([]);
  const [googleAdAccounts, setGoogleAdAccounts] = useState<GoogleAdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adAccountOptions, setAdAccountOptions] = useState<{ id: string; name: string; business_center?: any }[]>([]);
  const [selectingAccount, setSelectingAccount] = useState(false);
  const [accountSelectorOpen, setAccountSelectorOpen] = useState(false);
  const [clientSelectorOpen, setClientSelectorOpen] = useState(false);
  const [selectedAdAccountForLinking, setSelectedAdAccountForLinking] = useState<string | null>(null);
  const [pendingSyncAfterLink, setPendingSyncAfterLink] = useState<MetaAdAccount | TikTokAdAccount | null>(null);
  const [pendingSyncPlatform, setPendingSyncPlatform] = useState<"meta" | "tiktok" | null>(null);
  const [reconnectingPlatformId, setReconnectingPlatformId] = useState<string | null>(null);
  const [currentPlatformId, setCurrentPlatformId] = useState<string | null>(null);
  const [syncProgressPlatformId, setSyncProgressPlatformId] = useState<string | null>(null);
  const [syncProgressDialogOpen, setSyncProgressDialogOpen] = useState(false);
  const [syncingAssets, setSyncingAssets] = useState<string | null>(null);
  const processingOAuthRef = useRef(false);
  const fetchConnectedPlatformsRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Ad account limits and swap tracking - pass activeWorkspaceId
  const adAccountLimits = useAdAccountLimits(activeWorkspaceId);
  const adAccountLimitsRefetchRef = useRef(adAccountLimits.refetch);
  adAccountLimitsRefetchRef.current = adAccountLimits.refetch;

  // Get subscription info for billing cycle reset date
  const { subscriptionEnd, loading: subscriptionLoading } = useSubscription();

  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeModalProps, setUpgradeModalProps] = useState<{
    limitType: "account_limit" | "swap_limit" | "no_multiple_accounts";
    platform: "meta" | "tiktok";
    currentCount?: number;
    swapsUsed?: number;
  }>({ limitType: "account_limit", platform: "meta" });

  // Platform sync progress tracking (works for both TikTok and Meta)
  const { progress: platformSyncProgress } = usePlatformSyncProgress(syncProgressPlatformId);

  // Function to trigger Ad Library OAuth (pure Facebook Login) - defined early for use in callbacks
  const triggerAdLibraryOAuth = useCallback(() => {
    // IMPORTANT: Use the exact production URL - must match what's configured in Meta App
    // Do NOT use window.location.origin as it varies between environments
    const redirectUri = getOAuthRedirectUri();
    const clientId = PLATFORM_CONFIG.metaAdLibrary.appId;

    if (!clientId) {
      console.error("Meta App ID not configured for Ad Library OAuth");
      return;
    }

    // Store a flag to indicate we're doing Ad Library OAuth
    sessionStorage.setItem("pending_adlibrary_oauth", "true");

    // Build OAuth URL for regular Facebook Login (NOT Facebook Login for Business)
    // IMPORTANT: We intentionally OMIT config_id here because:
    // 1. config_id routes through Facebook Login for Business
    // 2. Ad Library API requires a pure user token from regular Facebook Login
    // 3. Regular Facebook Login grants public_profile by default
    // This requires the "Facebook Login" product (not Business) to be enabled in Meta Developer Console
    const oauthParams = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "meta_adlibrary",
    });

    // Only add scope if explicitly configured; public_profile is granted by default
    const scopes = PLATFORM_CONFIG.metaAdLibrary.oauthScopes?.trim();
    if (scopes) oauthParams.set("scope", scopes);

    const apiVersion = PLATFORM_CONFIG.metaAdLibrary.apiVersion;
    const oauthUrl = `${PLATFORM_CONFIG.metaAdLibrary.authBaseUrl}/${apiVersion}/dialog/oauth?${oauthParams.toString()}`;

    console.log("Ad Library OAuth - Redirecting to:", oauthUrl.replace(clientId, "HIDDEN"));
    toast.loading("Enabling Competitor Research...");

    setTimeout(() => {
      window.location.href = oauthUrl;
    }, 100);
  }, []);

  // Check for in-progress syncs on page load
  useEffect(() => {
    const checkExistingSyncs = async () => {
      if (!user) return;

      // Check sessionStorage for pending sync (supports both platforms)
      const pendingSyncPlatformId = sessionStorage.getItem("platform_sync_id");
      if (pendingSyncPlatformId) {
        // Verify sync status
        const { data } = await supabase
          .from("connected_platforms_safe")
          .select("metadata")
          .eq("id", pendingSyncPlatformId)
          .single();

        const metadata = data?.metadata as any;
        const syncProgress = metadata?.sync_progress;

        if (syncProgress?.status === "pending" || syncProgress?.status === "syncing") {
          // Still in progress - show the dialog
          setSyncProgressPlatformId(pendingSyncPlatformId);
          setSyncProgressDialogOpen(true);
        } else if (syncProgress?.status === "completed" && metadata?.accounts?.length > 0) {
          // Completed while away - show account selector directly
          console.log("[PlatformConnections] Sync completed while away, showing account selector");
          sessionStorage.removeItem("platform_sync_id");

          const accountOptions = metadata.accounts.map((acc: any) => ({
            id: acc.advertiser_id || acc.id,
            name: acc.name,
            business_center: acc.business_center,
          }));

          setAdAccountOptions(accountOptions);
          setCurrentPlatformId(pendingSyncPlatformId);
          setAccountSelectorOpen(true);
          toast.success(`Sync complete! Found ${accountOptions.length} account(s) - please select which to link`);
        } else {
          // Error or no accounts - just clean up
          sessionStorage.removeItem("platform_sync_id");
        }
      }
    };

    checkExistingSyncs();
  }, [user]);

  // Handle sync completion - open account selector or trigger Ad Library OAuth
  const handleSyncComplete = useCallback(async () => {
    if (!syncProgressPlatformId) return;

    sessionStorage.removeItem("platform_sync_id");

    // Fetch the completed accounts from metadata
    const { data } = await supabase
      .from("connected_platforms_safe")
      .select("metadata, platform_type")
      .eq("id", syncProgressPlatformId)
      .single();

    const metadata = data?.metadata as any;
    const platformType = data?.platform_type;

    if (metadata?.accounts && metadata.accounts.length > 0) {
      const accountOptions = metadata.accounts.map((acc: any) => ({
        id: acc.advertiser_id || acc.id,
        name: acc.name,
        business_center: acc.business_center,
      }));

      setAdAccountOptions(accountOptions);
      setCurrentPlatformId(syncProgressPlatformId);
      setAccountSelectorOpen(true);
      toast.success(`Found ${accountOptions.length} advertiser account(s) - please select which to sync`);
    } else {
      // No more accounts to select - check if we need to trigger Ad Library OAuth
      const pendingAdLibraryOAuth = sessionStorage.getItem("pending_adlibrary_oauth_after_sync");
      if (pendingAdLibraryOAuth && platformType === "meta") {
        sessionStorage.removeItem("pending_adlibrary_oauth_after_sync");
        setTimeout(() => {
          toast.info("One more step: Authorizing Competitor Research...", {
            description: "This enables you to search the Meta Ad Library for competitor ads.",
          });
          setTimeout(() => {
            triggerAdLibraryOAuth();
          }, 1500);
        }, 1000);
      }
    }

    setSyncProgressPlatformId(null);
    setSyncProgressDialogOpen(false);
    await fetchConnectedPlatformsRef.current();
  }, [syncProgressPlatformId, triggerAdLibraryOAuth]);

  // Define fetchConnectedPlatforms before the effects that use it
  const fetchConnectedPlatforms = useCallback(async () => {
    if (!activeWorkspaceId) return;

    try {
      const sampleFlag = isSampleModeRef.current;
      // Build queries with workspace + sample-mode filtering
      // Note: query the base table (not connected_platforms_safe view) so we can
      // filter by is_sample, which the safe view does not expose. Tokens are not
      // selected here, keeping this safe for client-side use.
      const platformsQuery: any = (supabase as any)
        .from("connected_platforms")
        .select(
          "id, user_id, platform_type, platform_name, ad_account_id, ad_account_name, business_manager_id, metadata, is_active, token_expires_at, created_at, updated_at, is_sample",
        )
        .eq("is_active", true)
        .eq("is_sample", sampleFlag)
        .order("created_at", { ascending: false });

      const metaQuery: any = supabase
        .from("meta_ad_accounts")
        .select("id, account_id, account_name, account_status, client_id, team_id, is_sample, clients(id, name)")
        .eq("team_id", activeWorkspaceId)
        .eq("is_sample", sampleFlag)
        .order("account_name");

      const tiktokQuery: any = supabase
        .from("tiktok_ad_accounts")
        .select("id, account_id, account_name, advertiser_id, account_status, client_id, team_id, is_sample, clients(id, name)")
        .eq("team_id", activeWorkspaceId)
        .eq("is_sample", sampleFlag)
        .order("account_name");

      const googleQuery: any = supabase
        .from("google_ad_accounts")
        .select(
          "id, account_id, account_name, customer_id, account_status, client_id, currency, timezone, team_id, is_sample, clients(id, name)",
        )
        .eq("team_id", activeWorkspaceId)
        .eq("is_sample", sampleFlag)
        .order("account_name");

      const [platformsRes, metaAccountsRes, tiktokAccountsRes, googleAccountsRes] = await Promise.all([
        platformsQuery,
        metaQuery,
        tiktokQuery,
        googleQuery,
      ]);

      if (platformsRes.error) throw platformsRes.error;
      if (metaAccountsRes.error) throw metaAccountsRes.error;
      if (tiktokAccountsRes.error) throw tiktokAccountsRes.error;
      if (googleAccountsRes.error) throw googleAccountsRes.error;

      setPlatforms(platformsRes.data || []);
      setMetaAdAccounts(metaAccountsRes.data || []);

      // Enrich TikTok accounts with business center info from platform metadata
      const tiktokPlatforms = platformsRes.data?.filter((p) => p.platform_type === "tiktok") || [];
      const enrichedTiktokAccounts = (tiktokAccountsRes.data || []).map((account) => {
        // Find the platform that contains this advertiser
        const platform = tiktokPlatforms.find((p) => {
          const metadata = p.metadata as any;
          return metadata?.advertiser_ids?.includes(account.advertiser_id);
        });

        if (platform?.metadata) {
          const metadata = platform.metadata as any;
          const accountInfo = metadata.accounts?.find((acc: any) => acc.advertiser_id === account.advertiser_id);

          if (accountInfo) {
            return {
              ...account,
              bc_id: accountInfo.bc_id,
              business_center: accountInfo.business_center,
            };
          }
        }

        return account;
      });

      setTikTokAdAccounts(enrichedTiktokAccounts);
      setGoogleAdAccounts((googleAccountsRes.data || []) as GoogleAdAccount[]);

      // Refresh ad account limits after data is fetched - use ref to avoid dep loop
      adAccountLimitsRefetchRef.current();
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  // Keep the ref in sync
  fetchConnectedPlatformsRef.current = fetchConnectedPlatforms;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && activeWorkspaceId) {
      fetchConnectedPlatforms();
    }
  }, [user, activeWorkspaceId, fetchConnectedPlatforms]);

  const handleConnectPlatform = async (
    platformType: string,
    useManagedLogin = false,
    platformId?: string,
    skipLimitCheck = false,
  ) => {
    // Check limits before allowing new platform connections (not reconnects)
    if (!platformId && !skipLimitCheck && (platformType === "meta" || platformType === "tiktok")) {
      const platform = platformType as "meta" | "tiktok";
      const limits = adAccountLimits[platform];

      // Check if user can have multiple accounts
      if (!adAccountLimits.canHaveMultipleAccounts && limits.currentCount > 0) {
        setUpgradeModalProps({
          limitType: "no_multiple_accounts",
          platform,
          currentCount: limits.currentCount,
        });
        setUpgradeModalOpen(true);
        return;
      }

      // Check if at account limit
      if (limits.currentCount >= limits.maxAllowed) {
        setUpgradeModalProps({
          limitType: "account_limit",
          platform,
          currentCount: limits.currentCount,
        });
        setUpgradeModalOpen(true);
        return;
      }
    }

    // Always clear reconnection state for fresh connections
    sessionStorage.removeItem("reconnecting_platform_id");
    sessionStorage.removeItem("reconnecting_platform_type");

    if (platformType === "meta") {
      try {
        // Redirect to Meta OAuth
        const redirectUri = getOAuthRedirectUri();
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
          sessionStorage.setItem("reconnecting_platform_id", platformId);
        }

        // Build OAuth URL matching working Supermetrics flow
        const oauthParams = new URLSearchParams({
          response_type: "code",
          scope,
          client_id: clientId,
          redirect_uri: redirectUri,
          state: platformType,
          ret: "login",
        });

        // Include Facebook Login for Business configuration when using Managed Login (OpenID)
        if (useManagedLogin && PLATFORM_CONFIG.meta.configId) {
          oauthParams.set("config_id", PLATFORM_CONFIG.meta.configId);
        }

        // Use business.facebook.com for managed accounts, www.facebook.com for regular
        const baseUrl = useManagedLogin ? "https://business.facebook.com" : "https://www.facebook.com";
        const oauthUrl = `${baseUrl}/dialog/oauth?${oauthParams.toString()}`;

        console.log("Meta OAuth - Redirecting to:", oauthUrl.replace(clientId, "HIDDEN"));

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
        const redirectUri = getOAuthRedirectUri();
        const appId = PLATFORM_CONFIG.tiktok.appId;

        console.log("TikTok OAuth - App ID:", appId ? "Configured" : "Missing");
        console.log("TikTok OAuth - Redirect URI:", redirectUri);

        if (!appId) {
          toast.error("TikTok App ID not configured. Please contact support.");
          return;
        }

        // Store platformId in sessionStorage ONLY for explicit reconnection
        if (platformId) {
          sessionStorage.setItem("reconnecting_platform_id", platformId);
          sessionStorage.setItem("reconnecting_platform_type", "tiktok");
        }

        // Build TikTok OAuth URL
        const oauthParams = new URLSearchParams({
          app_id: appId,
          redirect_uri: redirectUri,
          state: platformType,
        });

        const oauthUrl = `${PLATFORM_CONFIG.tiktok.authEndpoint}?${oauthParams.toString()}`;

        console.log("TikTok OAuth - Redirecting to:", oauthUrl.replace(appId, "HIDDEN"));

        toast.loading("Redirecting to TikTok...");

        setTimeout(() => {
          window.location.href = oauthUrl;
        }, 100);
      } catch (error: any) {
        console.error("Error connecting to TikTok:", error);
        toast.error(error.message || "Failed to connect to TikTok");
      }
    } else if (platformType === "google") {
      try {
        const redirectUri = getOAuthRedirectUri();
        const clientId = PLATFORM_CONFIG.google.clientId;

        console.log("Google Ads OAuth - Client ID:", clientId ? "Configured" : "Missing");

        if (!clientId) {
          toast.error("Google Ads Client ID not configured. Please contact support.");
          return;
        }

        // Store platformId in sessionStorage ONLY for explicit reconnection
        if (platformId) {
          sessionStorage.setItem("reconnecting_platform_id", platformId);
          sessionStorage.setItem("reconnecting_platform_type", "google");
        }

        // Build Google OAuth URL
        const oauthParams = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: PLATFORM_CONFIG.google.oauthScopes,
          access_type: "offline",
          prompt: "consent",
          state: "google",
        });

        const oauthUrl = `${PLATFORM_CONFIG.google.authEndpoint}?${oauthParams.toString()}`;

        console.log("Google Ads OAuth - Redirecting...");
        toast.loading("Redirecting to Google...");

        setTimeout(() => {
          window.location.href = oauthUrl;
        }, 100);
      } catch (error: any) {
        console.error("Error connecting to Google Ads:", error);
        toast.error(error.message || "Failed to connect to Google Ads");
      }
    } else if (platformType === "snapchat") {
      try {
        const redirectUri = getOAuthRedirectUri();
        const clientId = PLATFORM_CONFIG.snapchat.clientId;

        console.log("Snapchat OAuth - Client ID:", clientId ? "Configured" : "Missing");

        if (!clientId) {
          toast.error("Snapchat Client ID not configured. Please contact support.");
          return;
        }

        if (platformId) {
          sessionStorage.setItem("reconnecting_platform_id", platformId);
          sessionStorage.setItem("reconnecting_platform_type", "snapchat");
        }

        const oauthParams = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: PLATFORM_CONFIG.snapchat.oauthScopes,
          state: "snapchat",
        });

        const oauthUrl = `${PLATFORM_CONFIG.snapchat.authEndpoint}?${oauthParams.toString()}`;

        console.log("Snapchat OAuth - Redirecting...");
        toast.loading("Redirecting to Snapchat...");

        setTimeout(() => {
          window.location.href = oauthUrl;
        }, 100);
      } catch (error: any) {
        console.error("Error connecting to Snapchat:", error);
        toast.error(error.message || "Failed to connect to Snapchat");
      }
    } else {
      toast.error("This platform is not yet supported");
    }
  };

  const handleDisconnectPlatform = async (platformId: string) => {
    if (!confirm("Are you sure you want to disconnect this platform? All related data will be permanently deleted."))
      return;

    try {
      toast.loading("Disconnecting and purging platform data...");

      const { data, error } = await supabase.functions.invoke("purge-platform-data", {
        body: { connectedPlatformId: platformId },
      });

      if (error) throw error;

      toast.success("Platform and all related data have been removed");
      fetchConnectedPlatforms();
      // Refresh ad account limits after disconnect
      adAccountLimits.refetch();
    } catch (error: any) {
      console.error("Error disconnecting platform:", error);
      toast.error(error.message || "Failed to disconnect platform");
    }
  };

  const handleSaveAdAccounts = async (accounts: { id: string; name: string; business_center?: any }[]) => {
    if (accounts.length === 0 || !currentPlatformId || !activeWorkspaceId) return;

    setSelectingAccount(true);
    try {
      const selectedIds = accounts.map((a) => a.id);
      const { data, error } = await supabase.functions.invoke("sync-selected-accounts", {
        body: {
          selectedAccountIds: selectedIds,
          platformId: currentPlatformId,
          teamId: activeWorkspaceId, // Pass the active workspace
        },
      });

      if (error) throw error;

      // Check if this is a background sync (Meta with many accounts)
      if (data?.background) {
        // Store platform ID for progress tracking
        sessionStorage.setItem("platform_sync_id", currentPlatformId);
        setSyncProgressPlatformId(currentPlatformId);
        setSyncProgressDialogOpen(true);
        setAccountSelectorOpen(false);
        setAdAccountOptions([]);
        toast.info(`Syncing ${selectedIds.length} accounts in background...`);
      } else {
        // Synchronous sync completed (TikTok or small account sets)
        toast.success("Selected ad accounts synced successfully!");

        // fetchConnectedPlatforms now handles limit refresh
        setAccountSelectorOpen(false);
        setAdAccountOptions([]);

        // Check if we need to trigger Ad Library OAuth after account selection (seamless onboarding)
        const pendingAdLibraryOAuth = sessionStorage.getItem("pending_adlibrary_oauth_after_sync");
        if (pendingAdLibraryOAuth) {
          sessionStorage.removeItem("pending_adlibrary_oauth_after_sync");
          // Small delay to let user see success message before next step
          setTimeout(() => {
            toast.info("One more step: Authorizing Competitor Research...", {
              description: "This enables you to search the Meta Ad Library for competitor ads.",
            });
            setTimeout(() => {
              triggerAdLibraryOAuth();
            }, 1500);
          }, 1000);
        }

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
      const isTikTok = selectedAdAccountForLinking.startsWith("tiktok_");
      const isGoogle = selectedAdAccountForLinking.startsWith("google_");
      const table = isTikTok ? "tiktok_ad_accounts" : isGoogle ? "google_ad_accounts" : "meta_ad_accounts";
      const cleanId = isTikTok
        ? selectedAdAccountForLinking.replace("tiktok_", "")
        : isGoogle
          ? selectedAdAccountForLinking.replace("google_", "")
          : selectedAdAccountForLinking;

      const { error } = await supabase
        .from(table as any)
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

  const handleUnlinkAccount = async (accountId: string, platform: "meta" | "tiktok" | "google" = "meta") => {
    try {
      const table =
        platform === "tiktok"
          ? "tiktok_ad_accounts"
          : platform === "google"
            ? "google_ad_accounts"
            : "meta_ad_accounts";
      const { error } = await supabase
        .from(table)
        .update({ client_id: null } as any)
        .eq("id", accountId);

      if (error) throw error;

      toast.success("Ad account unlinked from client");
      await fetchConnectedPlatforms();
    } catch (error: any) {
      console.error("Error unlinking account:", error);
      toast.error("Failed to unlink account");
    }
  };

  const handleDeleteAccount = async (accountId: string, platform: "meta" | "tiktok" | "google" = "meta") => {
    if (!confirm("Are you sure you want to delete this ad account? This action cannot be undone.")) return;

    try {
      const table =
        platform === "tiktok"
          ? "tiktok_ad_accounts"
          : platform === "google"
            ? "google_ad_accounts"
            : "meta_ad_accounts";
      const { error } = await supabase
        .from(table as any)
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
          // IMPORTANT: The redirect_uri used here MUST be identical to the one used in the OAuth dialog request.
          // Never derive from window.location.origin (preview / staging domains will cause code exchange failures).
          const redirectUri = getOAuthRedirectUri();

          // Check if this is the Ad Library OAuth callback
          if (state === "meta_adlibrary") {
            console.log("Ad Library OAuth callback - processing...");
            sessionStorage.removeItem("pending_adlibrary_oauth");

            const { data, error } = await supabase.functions.invoke("meta-adlibrary-oauth-callback", {
              body: { code, redirectUri },
            });

            if (error) throw error;

            toast.success("Competitor Research enabled!", {
              description: `Authorized as ${data.userName}`,
            });

            await fetchConnectedPlatforms();
            return;
          }

          // Regular platform OAuth flow
          const platformId = sessionStorage.getItem("reconnecting_platform_id");
          const platformType = sessionStorage.getItem("reconnecting_platform_type") || state;
          sessionStorage.removeItem("reconnecting_platform_id");
          sessionStorage.removeItem("reconnecting_platform_type");

          console.log("OAuth callback - platformType:", platformType);
          console.log("OAuth callback - platformId:", platformId);

          const callbackFunction =
            platformType === "tiktok"
              ? "tiktok-oauth-callback"
              : platformType === "google"
                ? "google-ads-oauth-callback"
                : platformType === "snapchat"
                  ? "snapchat-oauth-callback"
                  : "meta-oauth-callback";

          console.log("OAuth callback - calling function:", callbackFunction);

          // Only include platformId if it's a valid string (not null/undefined)
          const { data, error } = await supabase.functions.invoke(callbackFunction, {
            body: {
              code,
              platformType: state,
              redirectUri,
              ...(platformId ? { platformId } : {}),
            },
          });

          console.log("OAuth callback - response data:", data);
          console.log("OAuth callback - response error:", error);

          if (error) throw error;

          // Handle TikTok/Snapchat background sync
          if ((platformType === "tiktok" || platformType === "snapchat") && data?.syncInProgress) {
            const platformLabel = platformType === "tiktok" ? "TikTok" : "Snapchat";
            toast.success(`${platformLabel} connected! Syncing accounts...`);
            sessionStorage.setItem("platform_sync_id", data.platformId);
            setSyncProgressPlatformId(data.platformId);
            setSyncProgressDialogOpen(true);
            await fetchConnectedPlatforms();
            return;
          }

          if (platformId) {
            toast.success("Platform reconnected successfully!");
          } else {
            toast.success(
              `${platformType === "tiktok" ? "TikTok" : platformType === "google" ? "Google Ads" : platformType === "snapchat" ? "Snapchat" : "Platform"} connected successfully!`,
            );
          }

          // Open account selector if accounts are returned (Meta flow)
          if (Array.isArray(data?.accounts) && data.accounts.length > 0) {
            const accountOptions = data.accounts.map((acc: any) => ({
              id: acc.advertiser_id || acc.id,
              name: acc.name,
              business_center: acc.business_center,
            }));

            setAdAccountOptions(accountOptions);
            setCurrentPlatformId(data.platformId);
            setAccountSelectorOpen(true);
            toast.success(`Found ${data.accounts.length} account(s) - please select which to sync`);
          }

          // Ad Library OAuth trigger disabled - Competitor Research on hold
          // if (platformType === "meta" && !platformId) {
          //   sessionStorage.setItem("pending_adlibrary_oauth_after_sync", "true");
          // }

          await fetchConnectedPlatforms();
        } catch (error: any) {
          console.error("OAuth callback error:", error);
          const msg = error?.message || "Failed to complete authentication";
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
  }, [user, triggerAdLibraryOAuth]);

  const handleSyncAccountAssets = async (account: MetaAdAccount, skipClientCheck = false) => {
    // If account has no client linked, prompt user to link first (for benchmark features)
    if (!account.client_id && !skipClientCheck && canManageClients) {
      setPendingSyncAfterLink(account);
      setPendingSyncPlatform("meta");
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
      if (data && typeof data === "object" && (data as { success?: boolean }).success === false) {
        throw new Error((data as { error?: string }).error || "Sync failed");
      }

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
      setPendingSyncPlatform("tiktok");
      setSelectedAdAccountForLinking("tiktok_" + account.id);
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

  const handleSyncGoogleAccountAssets = async (account: any, skipClientCheck = false) => {
    const googleAccount = googleAdAccounts.find((a) => a.id === account.id);
    if (!googleAccount) return;

    if (!googleAccount.client_id && !skipClientCheck && canManageClients) {
      setPendingSyncAfterLink(account);
      setPendingSyncPlatform("google" as any);
      setSelectedAdAccountForLinking("google_" + googleAccount.id);
      setClientSelectorOpen(true);
      return;
    }

    setSyncingAssets(googleAccount.id);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-ads-assets", {
        body: {
          customerId: googleAccount.customer_id,
        },
      });

      if (error) throw error;

      toast.success(`Assets synced for ${googleAccount.account_name}`, {
        description: data?.message || "Google Ads assets synced successfully",
      });
    } catch (error: any) {
      console.error("Error syncing Google Ads assets:", error);
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
        "Syncing without a client linked means benchmark data won't be available for improved forecasting.\n\nDo you want to sync anyway?",
      );
      if (syncAnyway) {
        if (pendingSyncPlatform === "tiktok") {
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

  if (authLoading || loading || workspaceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <TourDataBanner />
      <div className="max-w-6xl mx-auto space-y-6">
        {isSampleMode && (
          <Alert className="border-primary/30 bg-primary/5">
            <AlertCircle className="h-4 w-4 text-primary" />
            <AlertDescription>
              Sample Tour mode only lists demo ad accounts on this page. Live connections you added (for example
              after OAuth on production) are still saved but hidden until you turn off{" "}
              <strong>Show Sample Tour Data</strong> in Settings → Account.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Connect Your Platforms & Accounts</h1>
            <p className="text-muted-foreground mt-2">
              Link your advertising platforms to enable campaign management and forecasting
            </p>
          </div>
          <Button onClick={() => navigate("/app/overview")}>Back to Dashboard</Button>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Securely connect your ad accounts to simulate your campaigns. Nothing will be published without your
            approval and disconnecting your ad accounts will fully purge its data from ActiPlan instantly.
            <br />
            🔒 Secure OAuth via [Meta/Google/etc.]
            <br />
            🔐 We never store login credentials
            <br />
            🛑 No posting permissions without explicit action
            <br />
            🔁 Disconnect &amp; Purge anytime
          </AlertDescription>
        </Alert>

        {/* Platform Authentication */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Platform Authentication</CardTitle>
                <CardDescription>Connect to advertising platforms to sync ad accounts</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Badge variant="outline" className="gap-1">
                  Meta: {platforms.filter((p) => p.platform_type === "meta").length} connection
                  {platforms.filter((p) => p.platform_type === "meta").length !== 1 ? "s" : ""}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  TikTok: {platforms.filter((p) => p.platform_type === "tiktok").length} connection
                  {platforms.filter((p) => p.platform_type === "tiktok").length !== 1 ? "s" : ""}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  Google: {platforms.filter((p) => p.platform_type === "google").length} connection
                  {platforms.filter((p) => p.platform_type === "google").length !== 1 ? "s" : ""}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  Snapchat: {platforms.filter((p) => p.platform_type === "snapchat").length} connection
                  {platforms.filter((p) => p.platform_type === "snapchat").length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </div>
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
                  <Button
                    onClick={() => handleConnectPlatform("tiktok", false)}
                    variant="outline"
                    className="border-black/20 dark:border-white/20"
                  >
                    <Video className="h-4 w-4 mr-2" />
                    Connect TikTok
                  </Button>
                  <Button
                    onClick={() => handleConnectPlatform("google", false)}
                    variant="outline"
                    className="border-border"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Connect Google Ads
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {platforms.map((platform) => {
                  const businessName = platform.metadata?.businesses?.[0]?.name;
                  const advertiserIds = platform.metadata?.advertiser_ids;
                  const isTikTok = platform.platform_type === "tiktok";
                  const isGoogle = platform.platform_type === "google";
                  const isSnapchat = platform.platform_type === "snapchat";
                  const Icon = isSnapchat ? Video : isGoogle ? Search : isTikTok ? Video : Facebook;
                  const iconColor = isSnapchat
                    ? "text-yellow-500"
                    : isGoogle
                      ? "text-yellow-600"
                      : isTikTok
                        ? "text-black dark:text-white"
                        : "text-blue-600";
                  const bgColor = isSnapchat
                    ? "bg-yellow-50 dark:bg-yellow-900/10"
                    : isTikTok
                      ? "bg-black/5 dark:bg-white/5"
                      : isGoogle
                        ? "bg-yellow-50 dark:bg-yellow-900/10"
                        : "";

                  return (
                    <div
                      key={platform.id}
                      className={`flex items-center justify-between p-4 rounded-lg border ${bgColor}`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`h-5 w-5 ${iconColor}`} />
                        <div>
                          <p className="font-medium">{platform.platform_name}</p>
                          {businessName && <p className="text-sm text-muted-foreground">Business: {businessName}</p>}
                          {isTikTok && advertiserIds && advertiserIds.length > 0 && (
                            <p className="text-sm text-muted-foreground">
                              {advertiserIds.length} advertiser account{advertiserIds.length !== 1 ? "s" : ""}
                            </p>
                          )}
                          {isGoogle && platform.metadata?.accounts && (
                            <p className="text-sm text-muted-foreground">
                              {platform.metadata.accounts.length} customer account
                              {platform.metadata.accounts.length !== 1 ? "s" : ""}
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
                        <Button variant="destructive" size="sm" onClick={() => handleDisconnectPlatform(platform.id)}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {/* Connect more buttons - check limits */}
                <div className="pt-4 border-t flex gap-3 flex-wrap">
                  {/* Meta Connect Button — brand: Facebook blue */}
                  {adAccountLimits.canHaveMultipleAccounts ? (
                    <Button
                      onClick={() => handleConnectPlatform("meta", false)}
                      className="bg-[#1877F2] text-white hover:bg-[#1877F2]/90"
                    >
                      <SiMeta className="h-4 w-4 mr-2" />
                      Connect Another Meta Account
                    </Button>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            disabled={adAccountLimits.meta.currentCount > 0}
                            onClick={() => {
                              if (adAccountLimits.meta.currentCount > 0) {
                                setUpgradeModalProps({ limitType: "no_multiple_accounts", platform: "meta" });
                                setUpgradeModalOpen(true);
                              } else {
                                handleConnectPlatform("meta", false);
                              }
                            }}
                            className="bg-[#1877F2] text-white hover:bg-[#1877F2]/90 disabled:opacity-60"
                          >
                            <SiMeta className="h-4 w-4 mr-2" />
                            Connect Meta Account
                          </Button>
                        </TooltipTrigger>
                        {adAccountLimits.meta.currentCount > 0 && (
                          <TooltipContent>
                            <p>Upgrade to Freelancer+ to connect multiple Meta accounts</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* TikTok Connect Button — brand: black */}
                  {adAccountLimits.canHaveMultipleAccounts ? (
                    <Button
                      onClick={() => handleConnectPlatform("tiktok", false)}
                      className="bg-black text-white hover:bg-black/85"
                    >
                      <SiTiktok className="h-4 w-4 mr-2" />
                      Connect TikTok Account
                    </Button>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            disabled={adAccountLimits.tiktok.currentCount > 0}
                            onClick={() => {
                              if (adAccountLimits.tiktok.currentCount > 0) {
                                setUpgradeModalProps({ limitType: "no_multiple_accounts", platform: "tiktok" });
                                setUpgradeModalOpen(true);
                              } else {
                                handleConnectPlatform("tiktok", false);
                              }
                            }}
                            className="bg-black text-white hover:bg-black/85 disabled:opacity-60"
                          >
                            <SiTiktok className="h-4 w-4 mr-2" />
                            Connect TikTok Account
                          </Button>
                        </TooltipTrigger>
                        {adAccountLimits.tiktok.currentCount > 0 && (
                          <TooltipContent>
                            <p>Upgrade to Freelancer+ to connect multiple TikTok accounts</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Google Ads Connect Button — brand: Google blue */}
                  <Button
                    onClick={() => handleConnectPlatform("google", false)}
                    className="bg-[#4285F4] text-white hover:bg-[#4285F4]/90"
                  >
                    <SiGoogleads className="h-4 w-4 mr-2" />
                    Connect Google Ads Account
                  </Button>

                  {/* Snapchat — Coming Soon (brand: Snap yellow) */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          disabled
                          className="bg-[#FFFC00] text-black hover:bg-[#FFFC00]/85 disabled:opacity-70 disabled:cursor-not-allowed relative"
                        >
                          <SiSnapchat className="h-4 w-4 mr-2" />
                          Connect Snapchat Account
                          <Badge
                            variant="secondary"
                            className="ml-2 h-4 px-1.5 text-[10px] bg-black/15 text-black border-0 hover:bg-black/15"
                          >
                            Coming soon
                          </Badge>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Snapchat integration is coming soon</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* LinkedIn — Coming Soon (brand: LinkedIn blue) */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          disabled
                          className="bg-[#0A66C2] text-white hover:bg-[#0A66C2]/90 disabled:opacity-70 disabled:cursor-not-allowed relative"
                        >
                          <FaLinkedin className="h-4 w-4 mr-2" />
                          Connect LinkedIn Account
                          <Badge
                            variant="secondary"
                            className="ml-2 h-4 px-1.5 text-[10px] bg-white/20 text-white border-0 hover:bg-white/20"
                          >
                            Coming soon
                          </Badge>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>LinkedIn integration is coming soon</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Pinterest — Coming Soon (brand: Pinterest red) */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          disabled
                          className="bg-[#E60023] text-white hover:bg-[#E60023]/90 disabled:opacity-70 disabled:cursor-not-allowed relative"
                        >
                          <FaPinterest className="h-4 w-4 mr-2" />
                          Connect Pinterest Account
                          <Badge
                            variant="secondary"
                            className="ml-2 h-4 px-1.5 text-[10px] bg-white/20 text-white border-0 hover:bg-white/20"
                          >
                            Coming soon
                          </Badge>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Pinterest integration is coming soon</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Platform Ad Accounts - Collapsible */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Ad Accounts</CardTitle>
                <CardDescription>Manage ad accounts by platform. Click to expand each platform.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Badge variant="outline" className="gap-1">
                  Meta Accounts: {adAccountLimits.meta.currentCount}/
                  {adAccountLimits.meta.maxAllowed === Infinity ? "∞" : adAccountLimits.meta.maxAllowed}
                </Badge>
                <SwapCounterBadge
                  label="Meta Swaps"
                  used={adAccountLimits.meta.swapsUsed}
                  allowed={adAccountLimits.meta.swapsAllowed}
                  subscriptionEnd={subscriptionEnd}
                />
                <Badge variant="outline" className="gap-1">
                  TikTok Accounts: {adAccountLimits.tiktok.currentCount}/
                  {adAccountLimits.tiktok.maxAllowed === Infinity ? "∞" : adAccountLimits.tiktok.maxAllowed}
                </Badge>
                <SwapCounterBadge
                  label="TikTok Swaps"
                  used={adAccountLimits.tiktok.swapsUsed}
                  allowed={adAccountLimits.tiktok.swapsAllowed}
                  subscriptionEnd={subscriptionEnd}
                />
                <Badge variant="outline" className="gap-1">
                  Google Accounts: {googleAdAccounts.length}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Meta Ad Accounts - Collapsible */}
            <PlatformAccountsCollapsible
              platform="meta"
              icon={<SiMeta className="h-5 w-5 text-[#1877F2]" />}
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
              onUnlinkAccount={(accountId) => handleUnlinkAccount(accountId, "meta")}
              onDeleteAccount={(accountId) => handleDeleteAccount(accountId, "meta")}
            />

            {/* TikTok Ad Accounts - Collapsible */}
            <PlatformAccountsCollapsible
              platform="tiktok"
              icon={<SiTiktok className="h-5 w-5 text-foreground" />}
              title="TikTok Ad Accounts"
              accounts={tiktokAdAccounts}
              emptyMessage="No TikTok ad accounts synced yet. Connect a TikTok platform to get started."
              syncingAssets={syncingAssets}
              canManageClients={canManageClients}
              onSyncAccount={handleSyncTikTokAccountAssets}
              onLinkAccount={(accountId) => {
                setSelectedAdAccountForLinking("tiktok_" + accountId);
                setClientSelectorOpen(true);
              }}
              onUnlinkAccount={(accountId) => handleUnlinkAccount(accountId, "tiktok")}
              onDeleteAccount={(accountId) => handleDeleteAccount(accountId, "tiktok")}
            />

            {/* Google Ad Accounts - Collapsible */}
            <PlatformAccountsCollapsible
              platform="google"
              icon={<SiGoogleads className="h-5 w-5 text-[#4285F4]" />}
              title="Google Ad Accounts"
              accounts={googleAdAccounts.map((acc) => ({
                ...acc,
                advertiser_id: acc.customer_id,
              }))}
              emptyMessage="No Google Ads accounts synced yet. Connect a Google Ads platform to get started."
              syncingAssets={syncingAssets}
              canManageClients={canManageClients}
              onSyncAccount={(account) => handleSyncGoogleAccountAssets(account)}
              onLinkAccount={(accountId) => {
                setSelectedAdAccountForLinking("google_" + accountId);
                setClientSelectorOpen(true);
              }}
              onUnlinkAccount={(accountId) => handleUnlinkAccount(accountId, "google" as any)}
              onDeleteAccount={(accountId) => handleDeleteAccount(accountId, "google" as any)}
            />
          </CardContent>
        </Card>
        <PlatformAdAccountSelector
          open={accountSelectorOpen}
          onOpenChange={setAccountSelectorOpen}
          adAccounts={adAccountOptions}
          onSelect={handleSaveAdAccounts}
          loading={selectingAccount}
          platformType={platforms.find((p) => p.id === currentPlatformId)?.platform_type || "meta"}
          existingAccountIds={(() => {
            const pt = platforms.find((p) => p.id === currentPlatformId)?.platform_type;
            if (pt === "tiktok") return tiktokAdAccounts.map((acc) => acc.advertiser_id);
            if (pt === "google") return googleAdAccounts.map((acc) => acc.customer_id);
            return metaAdAccounts.map((acc) => acc.account_id);
          })()}
          teamId={activeWorkspaceId}
        />

        <AdAccountUpgradeModal
          open={upgradeModalOpen}
          onOpenChange={setUpgradeModalOpen}
          limitType={upgradeModalProps.limitType}
          currentTier={adAccountLimits.tier}
          platform={upgradeModalProps.platform}
          currentCount={upgradeModalProps.currentCount}
          swapsUsed={upgradeModalProps.swapsUsed}
        />

        {user && (
          <ClientSelectionDialog
            open={clientSelectorOpen}
            onOpenChange={handleClientSelectorClose}
            userId={user.id}
            onClientSelected={handleLinkAccountToClient}
            title={pendingSyncAfterLink ? "Link Account for Better Forecasting" : undefined}
            description={
              pendingSyncAfterLink
                ? "Link this ad account to a client to enable benchmark-based forecasting. This uses your historical performance data for more accurate predictions."
                : undefined
            }
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
