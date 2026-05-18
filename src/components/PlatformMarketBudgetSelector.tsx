import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Copy, Loader2, ChevronDown, ChevronRight, ChevronsUpDown, Link2, Link2Off, Pin, PinOff, RefreshCw, Lock } from "lucide-react";
import { PlatformWithMarkets, Market } from "@/types/mediaplan";
import { AdFormatSelector } from "./AdFormatSelector";
import { PhaseScheduler } from "./PhaseScheduler";
import { getTestPresets, getRFTestPreset } from "@/utils/testPresets";
import { supabase } from "@/integrations/supabase/client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import React, { useState, useEffect, useRef } from "react";
import { MARKET_OPTIONS, TIKTOK_MARKET_OPTIONS } from "@/utils/markets";
import { translateObjective, translateGoogleCampaignType } from "@/utils/crossPlatformObjectiveMapping";
import { translateAdFormats } from "@/utils/adFormats";
import { useSampleMode } from "@/contexts/SampleModeContext";
import { useExtensionModeOptional } from "@/contexts/ExtensionModeContext";
import { PlatformMarketNav } from "./PlatformMarketNav";
import { extensionMarketLockKey } from "@/utils/campaignLaunchLocks";
import {
  ACTIPLAN_MIN_ENTITY_BUDGET_EUR,
  calculateMarketBudgetEur,
  calculatePlatformBudgetEur,
  ACTIPLAN_BUDGET_SLIDER_STEP,
  ceilBudgetPercentageToSliderStep,
  clampBudgetPercentage,
  clampPercentageToMinimumEur,
  enforceActiPlanBudgetFloors,
  minMarketBudgetEurForPhases,
  minPercentageForBudgetEur,
  minPlatformBudgetEurForPhases,
  minPlatformBudgetPercentage,
  minPlatformBudgetPercentageForPhases,
} from "@/utils/actiplanBudgetMinimums";

interface PlatformMarketBudgetSelectorProps {
  platforms: PlatformWithMarkets[];
  setPlatforms: React.Dispatch<React.SetStateAction<PlatformWithMarkets[]>>;
  totalBudget: number;
  startDate?: string;
  endDate?: string;
  genericConfig?: any;
  setGenericConfig?: (config: any) => void;
  setStartDate?: (date: string) => void;
  setEndDate?: (date: string) => void;
  setTotalBudget?: (budget: string) => void;
  selectedClientId?: string;
  /** Shown above platform rows when allocations violate €50 minimum rules. */
  budgetViolationsSummary?: string;
  /** DSP-live platform — budget cannot change (partial push). */
  isPlatformBudgetLocked?: (platformId: string, markets: Market[]) => boolean;
  /** DSP-live market — budget cannot change (partial push). */
  isMarketBudgetLocked?: (platformId: string, marketName: string) => boolean;
  /** Extension mode: ids frozen at hydrate (before snapshot). */
  extensionHydratedLockIds?: { platformIds: Set<string>; marketIds: Set<string> } | null;
  dspLocksActive?: boolean;
  dspPartialPush?: boolean;
}

const AVAILABLE_PLATFORMS = [
  { id: "meta", name: "Meta" },
  { id: "google", name: "Google Ads" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "tiktok", name: "TikTok" },
  { id: "snapchat", name: "Snapchat" },
  { id: "pinterest", name: "Pinterest" },
];

const NONE_OPTION = "__none__";

export function PlatformMarketBudgetSelector({ 
  platforms, 
  setPlatforms,
  totalBudget,
  startDate,
  endDate,
  genericConfig,
  setGenericConfig,
  setStartDate,
  setEndDate,
  setTotalBudget,
  selectedClientId,
  budgetViolationsSummary,
  isPlatformBudgetLocked,
  isMarketBudgetLocked,
  extensionHydratedLockIds = null,
  dspLocksActive = false,
  dspPartialPush = false,
}: PlatformMarketBudgetSelectorProps) {
  const extensionMode = useExtensionModeOptional();
  const [instagramAccounts, setInstagramAccounts] = useState<Array<{ id: string; username: string; name: string }>>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [connectedPlatforms, setConnectedPlatforms] = useState<any[]>([]);
  const [adAccounts, setAdAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingAdAccounts, setLoadingAdAccounts] = useState(false);
  const [pages, setPages] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pixels, setPixels] = useState<Array<{ id: string; name: string; adAccountId: string }>>([]);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [catalogs, setCatalogs] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [productSets, setProductSets] = useState<Array<{ id: string; name: string; catalogId: string }>>([]);
  const [loadingProductSets, setLoadingProductSets] = useState(false);
  const [conversionEvents, setConversionEvents] = useState<Array<{ pixelId: string; id: string; name: string; type: string }>>([]);
  const { isSampleMode } = useSampleMode();
  const [loadingConversionEvents, setLoadingConversionEvents] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [adAccountDefaults, setAdAccountDefaults] = useState<Record<string, any>>({});
  
  // TikTok resources
  const [tiktokAdAccounts, setTiktokAdAccounts] = useState<Array<{ id: string; name: string; advertiserId: string }>>([]);
  const [loadingTiktokAdAccounts, setLoadingTiktokAdAccounts] = useState(false);
  const [tiktokPixels, setTiktokPixels] = useState<Array<{ id: string; name: string; advertiserId: string }>>([]);
  const [loadingTiktokPixels, setLoadingTiktokPixels] = useState(false);
  const [tiktokIdentities, setTiktokIdentities] = useState<Array<{ id: string; name: string; advertiserId: string }>>([]);
  const [loadingTiktokIdentities, setLoadingTiktokIdentities] = useState(false);
  const [tiktokCatalogs, setTiktokCatalogs] = useState<Array<{ id: string; name: string; advertiserId: string }>>([]);
  const [loadingTiktokCatalogs, setLoadingTiktokCatalogs] = useState(false);
  const [tiktokProductSets, setTiktokProductSets] = useState<Array<{ id: string; name: string; catalogId: string; advertiserId: string }>>([]);
  const [loadingTiktokProductSets, setLoadingTiktokProductSets] = useState(false);
  const [tiktokAdAccountDefaults, setTiktokAdAccountDefaults] = useState<Record<string, any>>({});
  
  // Google Ads resources
  const [googleAdAccounts, setGoogleAdAccounts] = useState<Array<{ id: string; name: string; customerId: string; currency: string; timezone: string; merchantCenterId: string; feedLabel: string }>>([]);
  const [loadingGoogleAdAccounts, setLoadingGoogleAdAccounts] = useState(false);
  const [googleMerchantCenters, setGoogleMerchantCenters] = useState<Record<string, Array<{ id: string; merchantCenterId: string; merchantCenterName: string }>>>({});
  const [googleFeedLabels, setGoogleFeedLabels] = useState<Record<string, Array<{ label: string; country: string }>>>({});
  const [loadingGoogleMC, setLoadingGoogleMC] = useState<Record<string, boolean>>({});
  
  // Collapsible state for platforms and markets
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<number, boolean>>({});
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({});
  
  // Budget lock state - when enabled, budgets redistribute proportionally to always sum to 100%
  const [budgetLocked, setBudgetLocked] = useState(false);
  
  // Re-apply €50 (× phase count) floors when total budget changes so stored % never lags behind slider display.
  useEffect(() => {
    if (totalBudget <= 0) return;
    setPlatforms((prev) => {
      const next = enforceActiPlanBudgetFloors(prev, totalBudget) as PlatformWithMarkets[];
      const unchanged =
        prev.length === next.length &&
        prev.every((p, i) => {
          const n = next[i];
          if ((p.budgetPercentage ?? 0) !== (n.budgetPercentage ?? 0)) return false;
          return (p.markets ?? []).every(
            (m, j) => (m.budgetPercentage ?? 0) === (n.markets?.[j]?.budgetPercentage ?? 0),
          );
        });
      return unchanged ? prev : next;
    });
  }, [totalBudget, setPlatforms]);
  
  // Fixed budget state - items that are fixed don't change when others are adjusted
  const [fixedPlatforms, setFixedPlatforms] = useState<Record<number, boolean>>({});
  const [fixedMarkets, setFixedMarkets] = useState<Record<string, boolean>>({});

  /** DSP-live and extension-mode original slices cannot change budget %. */
  const platformIsBudgetLocked = (platform: PlatformWithMarkets) => {
    if (platform.id && isPlatformBudgetLocked?.(platform.id, platform.markets)) return true;
    if (
      extensionMode.isExtensionMode &&
      platform.id &&
      (extensionMode.isOriginalPlatform(platform.id) ||
        (extensionHydratedLockIds?.platformIds.has(platform.id) ?? false))
    ) {
      return true;
    }
    return false;
  };

  const marketIsBudgetLocked = (platform: PlatformWithMarkets, market: Market) => {
    if (platform.id && isMarketBudgetLocked?.(platform.id, market.name)) return true;
    if (!extensionMode.isExtensionMode || !platform.id) return false;
    const marketKey = extensionMarketLockKey(platform.id, market);
    if (
      extensionMode.isOriginalMarket(market.id) ||
      extensionMode.isOriginalMarket(marketKey) ||
      (extensionHydratedLockIds?.marketIds.has(marketKey) ?? false) ||
      (market.id ? (extensionHydratedLockIds?.marketIds.has(market.id) ?? false) : false)
    ) {
      return true;
    }
    return false;
  };

  const platformBudgetLockTitle = (platform: PlatformWithMarkets) => {
    if (platform.id && isPlatformBudgetLocked?.(platform.id, platform.markets)) {
      return "Live in DSP — budget locked";
    }
    if (extensionMode.isExtensionMode && platform.id && extensionMode.isOriginalPlatform(platform.id)) {
      return "Original plan platform — locked in extension mode";
    }
    return "Budget locked";
  };

  const platformIsFixed = (index: number) =>
    Boolean(fixedPlatforms[index] || platformIsBudgetLocked(platforms[index]));

  const marketIsFixed = (platform: PlatformWithMarkets, market: Market) =>
    Boolean(fixedMarkets[market.id] || marketIsBudgetLocked(platform, market));

  const togglePlatformFixed = (index: number) => {
    setFixedPlatforms(prev => ({ ...prev, [index]: !prev[index] }));
  };
  
  const toggleMarketFixed = (marketId: string) => {
    setFixedMarkets(prev => ({ ...prev, [marketId]: !prev[marketId] }));
  };
  
  
  const togglePlatformExpanded = (index: number) => {
    setExpandedPlatforms(prev => ({ ...prev, [index]: !(prev[index] === true) }));
  };
  
  const toggleMarketExpanded = (marketId: string) => {
    setExpandedMarkets(prev => ({ ...prev, [marketId]: !(prev[marketId] === true) }));
  };
  
  const toggleAllPlatforms = () => {
    const allExpanded = platforms.every((_, i) => expandedPlatforms[i] === true);
    const newState: Record<number, boolean> = {};
    platforms.forEach((_, i) => {
      newState[i] = !allExpanded;
    });
    setExpandedPlatforms(newState);
  };
  
  const toggleAllMarketsForPlatform = (platformIndex: number) => {
    const platform = platforms[platformIndex];
    const allMarketsExpanded = platform.markets.every(m => expandedMarkets[m.id] === true);
    const newState = { ...expandedMarkets };
    platform.markets.forEach(m => {
      newState[m.id] = !allMarketsExpanded;
    });
    setExpandedMarkets(newState);
  };
  
  const totalAllocated = platforms.reduce((sum, p) => sum + p.budgetPercentage, 0);
  const usedPlatformIds = platforms.map(p => p.id).filter(id => id !== "");

  // Fetch all Meta, TikTok, and Google resources from database
  useEffect(() => {
    fetchMetaResources();
    fetchTiktokResources();
    fetchGoogleResources();
  }, [selectedClientId, isSampleMode]); // Re-fetch when client or sample mode changes

  const fetchGoogleResources = async () => {
    setLoadingGoogleAdAccounts(true);
    try {
      let query = supabase
        .from("google_ad_accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (selectedClientId) {
        query = query.or(`client_id.eq.${selectedClientId},client_id.is.null`);
      }

      // Hide sample/demo accounts when sample mode is off
      if (!isSampleMode) {
        query = query.eq("is_sample", false);
      }

      const { data, error } = await query;
      if (!error && data) {
        setGoogleAdAccounts(data.map((acc: any) => ({
          id: acc.account_id,
          name: acc.account_name || `Account ${acc.customer_id}`,
          customerId: acc.customer_id,
          currency: acc.currency || "USD",
          timezone: acc.timezone || "UTC",
          merchantCenterId: acc.default_merchant_center_id || "",
          feedLabel: acc.default_feed_label || "",
        })));
      }
    } catch (error) {
      console.error("Error loading Google Ads resources:", error);
    } finally {
      setLoadingGoogleAdAccounts(false);
    }
  };

  const fetchMetaResources = async () => {
    setIsLoadingAccounts(true);
    setLoadingAdAccounts(true);
    setLoadingPages(true);
    setLoadingPixels(true);
    setLoadingCatalogs(true);
    setLoadingProductSets(true);
    setLoadingConversionEvents(true);
    
    try {
      // Fetch ad accounts from database with their defaults
      // Show all accounts - client filtering is optional (accounts without client_id should always be visible)
      let query = supabase
        .from("meta_ad_accounts" as any)
        .select("*")
        .order("synced_at", { ascending: false });
      
      // If a client is selected, show accounts assigned to that client OR accounts with no client assigned
      if (selectedClientId) {
        query = query.or(`client_id.eq.${selectedClientId},client_id.is.null`);
      }

      // Hide sample/demo accounts when sample mode is off
      if (!isSampleMode) {
        query = (query as any).eq("is_sample", false);
      }

      const { data: adAccountsData, error: adAccountsError } = await query;

      if (!adAccountsError && adAccountsData) {
        console.log('📦 Loaded ad accounts:', adAccountsData);
        setAdAccounts(adAccountsData.map((acc: any) => ({
          id: acc.account_id,
          name: acc.account_name,
        })));
        
        // Store defaults for quick access - will be populated after all resources are fetched
        const defaults: Record<string, any> = {};
        adAccountsData.forEach((acc: any) => {
          defaults[acc.account_id] = {
            pixelId: acc.default_pixel_id,
            pageId: acc.default_page_id,
            instagramActorId: acc.default_instagram_account_id,
            catalog: acc.default_catalog_id,
            productSet: acc.default_product_set_id,
            conversionEvent: acc.default_conversion_event,
            bidStrategy: acc.default_bid_strategy,
            bidAmount: acc.default_bid_amount,
            mainMarkets: Array.isArray(acc.main_markets) ? acc.main_markets : [],
            publisherPlatforms: Array.isArray(acc.default_publisher_platforms) ? acc.default_publisher_platforms : ['facebook', 'instagram', 'audience_network'],
            positions: acc.default_positions || {},
            advantagePlusPlacements: acc.default_advantage_plus_placements ?? true,
            // Destination/Optimization location fields
            optimizationLocation: acc.default_optimization_location,
            appStore: acc.default_app_store,
            appId: acc.default_app_id,
            landingPageUrl: acc.default_landing_page_url,
            // Messaging fields
            messagingMode: acc.default_messaging_mode,
            messengerEnabled: acc.default_messenger_enabled,
            instagramDmEnabled: acc.default_instagram_dm_enabled,
            whatsappEnabled: acc.default_whatsapp_enabled,
            whatsappNumber: acc.default_whatsapp_number,
            // Attribution windows
            clickWindow: acc.default_click_window,
            viewWindow: acc.default_view_window,
            billingEvent: acc.default_billing_event,
            // Advantage+ Campaign-level defaults
            advantagePlusCampaign: acc.default_advantage_plus_campaign ?? false,
            advantagePlusAudience: acc.default_advantage_plus_audience ?? false,
            advantagePlusCreative: acc.default_advantage_plus_creative ?? false,
            conversionCount: acc.default_conversion_count || 'all_conversions',
          };
          console.log(`📋 Defaults for ${acc.account_name}:`, defaults[acc.account_id]);
        });
        setAdAccountDefaults(defaults);
      }

      // Fetch pages from database
      const { data: pagesData, error: pagesError } = await supabase
        .from("meta_pages_safe" as any)
        .select("*")
        .order("synced_at", { ascending: false });

      if (pagesError) {
        console.error("Error fetching pages:", pagesError);
      }
      
      if (!pagesError && pagesData) {
        console.log("Loaded pages:", pagesData);
        // Deduplicate by page_id
        const uniquePages = Array.from(
          new Map(pagesData.map((page: any) => [page.page_id, page])).values()
        );
        setPages(uniquePages.map((page: any) => ({
          id: page.page_id,
          name: page.page_name,
        })));
      } else if (!pagesError && !pagesData) {
        console.warn("No pages data returned");
      }

      // Fetch pixels from database
      const { data: pixelsData, error: pixelsError } = await supabase
        .from("meta_pixels" as any)
        .select("*")
        .order("synced_at", { ascending: false });

      if (!pixelsError && pixelsData) {
        // Deduplicate by pixel_id
        const uniquePixels = Array.from(
          new Map(pixelsData.map((pixel: any) => [pixel.pixel_id, pixel])).values()
        );
        setPixels(uniquePixels.map((pixel: any) => ({
          id: pixel.pixel_id,
          name: pixel.pixel_name,
          adAccountId: pixel.ad_account_id,
        })));
      }

      // Fetch catalogs from database
      const { data: catalogsData, error: catalogsError } = await supabase
        .from("meta_catalogs" as any)
        .select("*")
        .order("synced_at", { ascending: false });

      if (!catalogsError && catalogsData) {
        // Deduplicate by catalog_id
        const uniqueCatalogs = Array.from(
          new Map(catalogsData.map((catalog: any) => [catalog.catalog_id, catalog])).values()
        );
        setCatalogs(uniqueCatalogs.map((catalog: any) => ({
          id: catalog.catalog_id,
          name: catalog.catalog_name,
        })));
      }

      // Fetch product sets from database
      const { data: productSetsData, error: productSetsError } = await supabase
        .from("meta_product_sets" as any)
        .select("*")
        .order("synced_at", { ascending: false });

      if (productSetsError) {
        console.error("Error fetching product sets:", productSetsError);
      }

      if (!productSetsError && productSetsData) {
        console.log("Loaded product sets:", productSetsData);
        // Deduplicate by product_set_id
        const uniqueProductSets = Array.from(
          new Map(productSetsData.map((ps: any) => [ps.product_set_id, ps])).values()
        );
        setProductSets(uniqueProductSets.map((ps: any) => ({
          id: ps.product_set_id,
          name: ps.product_set_name,
          catalogId: ps.catalog_id,
        })));
      } else if (!productSetsError && !productSetsData) {
        console.warn("No product sets data returned");
      }

      // Fetch conversion events from database
      const { data: eventsData, error: eventsError } = await supabase
        .from("meta_conversion_events" as any)
        .select("*")
        .order("synced_at", { ascending: false });

      if (!eventsError && eventsData) {
        // Deduplicate by event_name + pixel_id
        const uniqueEvents = Array.from(
          new Map(eventsData.map((event: any) => [`${event.pixel_id}-${event.event_name}`, event])).values()
        );
        setConversionEvents(uniqueEvents.map((event: any) => ({
          pixelId: event.pixel_id,
          id: event.event_name,
          name: event.event_name,
          type: event.event_type || "standard",
        })));
      }

      // Fetch Instagram accounts from database
      const { data: igData, error: igError } = await supabase
        .from("meta_instagram_accounts" as any)
        .select("*")
        .order("synced_at", { ascending: false });

      if (!igError && igData) {
        // Deduplicate by instagram_account_id
        const uniqueIgAccounts = Array.from(
          new Map(igData.map((ig: any) => [ig.instagram_account_id, ig])).values()
        );
        setInstagramAccounts(uniqueIgAccounts.map((ig: any) => ({
          id: ig.instagram_account_id,
          username: ig.username,
          name: ig.username,
        })));
      }
    } catch (error: any) {
      console.error("Failed to fetch Meta resources:", error);
      toast.error("Failed to load Meta resources");
    } finally {
      setIsLoadingAccounts(false);
      setLoadingAdAccounts(false);
      setLoadingPages(false);
      setLoadingPixels(false);
      setLoadingCatalogs(false);
      setLoadingProductSets(false);
      setLoadingConversionEvents(false);
      
      // After all resources are loaded, auto-populate defaults if not already set
      autoPopulateDefaults();
    }
  };

  // Auto-populate defaults for ad accounts that don't have them set
  const autoPopulateDefaults = async () => {
    try {
      const { data: adAccountsData } = await supabase
        .from("meta_ad_accounts" as any)
        .select("*");

      if (!adAccountsData) return;

      const updates: any[] = [];

      adAccountsData.forEach((acc: any) => {
        const needsUpdate = !acc.default_pixel_id || !acc.default_page_id;
        
        if (needsUpdate) {
          const update: any = {
            account_id: acc.account_id,
          };

          // Auto-select first pixel for this ad account if not set
          if (!acc.default_pixel_id) {
            const firstPixel = pixels.find(p => p.adAccountId === acc.account_id);
            if (firstPixel) update.default_pixel_id = firstPixel.id;
          }

          // Auto-select first page if not set
          if (!acc.default_page_id && pages.length > 0) {
            update.default_page_id = pages[0].id;
          }

          // Auto-select first Instagram account if not set
          if (!acc.default_instagram_account_id && instagramAccounts.length > 0) {
            update.default_instagram_account_id = instagramAccounts[0].id;
          }

          // Auto-select first catalog if not set
          if (!acc.default_catalog_id && catalogs.length > 0) {
            update.default_catalog_id = catalogs[0].id;
          }

          // Auto-select first product set if not set
          if (!acc.default_product_set_id && productSets.length > 0) {
            update.default_product_set_id = productSets[0].id;
          }

          // Auto-select first conversion event if not set
          if (!acc.default_conversion_event && conversionEvents.length > 0) {
            update.default_conversion_event = conversionEvents[0].id;
          }

          if (Object.keys(update).length > 1) { // More than just account_id
            updates.push(update);
          }
        }
      });

      // Batch update all ad accounts with auto-populated defaults
      if (updates.length > 0) {
        for (const update of updates) {
          const accountId = update.account_id;
          delete update.account_id;
          
          await supabase
            .from("meta_ad_accounts" as any)
            .update(update)
            .eq("account_id", accountId);
        }

        // Refresh the defaults after updating
        await fetchMetaResources();
        toast.success(`Auto-populated defaults for ${updates.length} ad account(s)`);
      }
    } catch (error) {
      console.error("Failed to auto-populate defaults:", error);
    }
  };

  // Sync Meta resources from API
  const syncMetaResources = async () => {
    setIsSyncing(true);
    try {
      const session = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("sync-meta-resources", {
        headers: {
          Authorization: `Bearer ${session.data.session?.access_token}`,
        },
      });

      if (error) throw error;

      toast.success("Meta resources synced successfully");
      // Refresh data from database
      await fetchMetaResources();
      await fetchTiktokResources();
    } catch (error: any) {
      console.error("Failed to sync Meta resources:", error);
      toast.error("Failed to sync Meta resources");
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync assets for a specific Meta ad account, then refresh dropdowns
  const handleSyncMetaAccountAssets = async (accountId: string) => {
    setSyncingAccountId(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("sync-account-assets", {
        body: { accountId, platform: "meta" },
      });
      if (error) throw error;
      if (data && typeof data === "object" && (data as { success?: boolean }).success === false) {
        throw new Error((data as { error?: string }).error || "Sync failed");
      }
      toast.success("Assets synced successfully. Refreshing...");
      await fetchMetaResources();
    } catch (err: any) {
      console.error("Failed to sync Meta account assets:", err);
      toast.error("Failed to sync assets for this ad account");
    } finally {
      setSyncingAccountId(null);
    }
  };

  // Sync assets for a specific TikTok advertiser account, then refresh dropdowns
  const handleSyncTiktokAccountAssets = async (advertiserId: string) => {
    setSyncingAccountId(advertiserId);
    try {
      const { error: resourcesError } = await supabase.functions.invoke("sync-tiktok-resources", {
        body: { advertiserId },
      });
      if (resourcesError) {
        console.error("Error syncing TikTok resources:", resourcesError);
      }
      toast.success("TikTok assets synced successfully. Refreshing...");
      await fetchTiktokResources();
    } catch (err: any) {
      console.error("Failed to sync TikTok account assets:", err);
      toast.error("Failed to sync assets for this advertiser");
    } finally {
      setSyncingAccountId(null);
    }
  };
  
  const fetchTiktokResources = async () => {
    setLoadingTiktokAdAccounts(true);
    setLoadingTiktokPixels(true);
    setLoadingTiktokIdentities(true);
    setLoadingTiktokCatalogs(true);
    setLoadingTiktokProductSets(true);
    
    try {
      let query = supabase
        .from("tiktok_ad_accounts" as any)
        .select("*")
        .order("synced_at", { ascending: false});
      
      if (selectedClientId) {
        query = query.eq("client_id", selectedClientId);
      }

      // Hide sample/demo accounts when sample mode is off
      if (!isSampleMode) {
        query = (query as any).eq("is_sample", false);
      }
      
      const { data: adAccountsData, error: adAccountsError } = await query;
      
      if (adAccountsError) throw adAccountsError;
      
      const formattedAccounts = (adAccountsData || []).map((acc: any) => ({
        id: acc.advertiser_id,
        name: acc.account_name,
        advertiserId: acc.advertiser_id
      }));
      setTiktokAdAccounts(formattedAccounts);
      
      // Store defaults for each TikTok ad account
      const defaults: Record<string, any> = {};
      (adAccountsData || []).forEach((acc: any) => {
        console.log('📦 Loading TikTok defaults for advertiser:', acc.advertiser_id, {
          pixelId: acc.default_pixel_id,
          identityId: acc.default_identity_id,
          catalogId: acc.default_catalog_id,
          productSetId: acc.default_product_set_id,
          optimizationEvent: acc.default_optimization_event,
          optimizationLocation: acc.default_optimization_location,
          mainMarkets: acc.main_markets,
          placementType: acc.default_placement_type,
          placements: acc.default_placements,
          appName: acc.default_app_name,
          appId: acc.default_app_id,
          bidStrategy: acc.default_bid_strategy,
        });
        defaults[acc.advertiser_id] = {
          pixelId: acc.default_pixel_id,
          identityId: acc.default_identity_id,
          catalogId: acc.default_catalog_id,
          productSetId: acc.default_product_set_id,
          optimizationEvent: acc.default_optimization_event,
          landingPageUrl: acc.default_landing_page_url,
          bidStrategy: acc.default_bid_strategy,
          bidAmount: acc.default_bid_amount,
          mainMarkets: Array.isArray(acc.main_markets) ? acc.main_markets : [],
          placementType: acc.default_placement_type || 'PLACEMENT_TYPE_AUTOMATIC',
          placements: Array.isArray(acc.default_placements) ? acc.default_placements : ['PLACEMENT_TIKTOK'],
          // TikTok destination fields
          optimizationLocation: acc.default_optimization_location,
          appName: acc.default_app_name,
          appId: acc.default_app_id,
          // TikTok messaging fields
          messagingApp: acc.default_messaging_app,
          facebookPageId: acc.default_facebook_page_id,
          messageEventSet: acc.default_message_event_set,
          whatsappNumber: acc.default_whatsapp_number,
          zaloAccountId: acc.default_zalo_account_id,
          lineBusinessId: acc.default_line_business_id,
          // Attribution windows
          clickWindow: acc.default_click_window,
          viewWindow: acc.default_view_window,
          billingEvent: acc.default_billing_event,
          conversionCount: acc.default_conversion_count || 'all_conversions',
        };
      });
      console.log('✅ TikTok Ad Account Defaults loaded:', defaults);
      setTiktokAdAccountDefaults(defaults);

      // Fetch TikTok pixels
      const { data: pixelsData, error: pixelsError } = await supabase
        .from("tiktok_pixels" as any)
        .select("*");
      
      if (pixelsError) throw pixelsError;
      
      setTiktokPixels((pixelsData || []).map((p: any) => ({
        id: p.pixel_id,
        name: p.pixel_name,
        advertiserId: p.advertiser_id
      })));
      
      // Fetch TikTok identities
      const { data: identitiesData, error: identitiesError } = await supabase
        .from("tiktok_identities" as any)
        .select("*");
      
      if (identitiesError) throw identitiesError;
      
      setTiktokIdentities((identitiesData || []).map((i: any) => ({
        id: i.identity_id,
        name: i.identity_name,
        advertiserId: i.advertiser_id
      })));
      
      // Fetch TikTok catalogs
      const { data: catalogsData, error: catalogsError } = await supabase
        .from("tiktok_catalogs" as any)
        .select("*");
      
      if (catalogsError) throw catalogsError;
      
      setTiktokCatalogs((catalogsData || []).map((c: any) => ({
        id: c.catalog_id,
        name: c.catalog_name,
        advertiserId: c.advertiser_id
      })));
      
      // Fetch TikTok product sets
      const { data: productSetsData, error: productSetsError } = await supabase
        .from("tiktok_product_sets" as any)
        .select("*");
      
      if (productSetsError) throw productSetsError;
      
      setTiktokProductSets((productSetsData || []).map((ps: any) => ({
        id: ps.product_set_id,
        name: ps.product_set_name,
        catalogId: ps.catalog_id,
        advertiserId: ps.advertiser_id
      })));
      
      console.log("TikTok resources loaded:", {
        adAccounts: formattedAccounts.length,
        pixels: pixelsData?.length || 0,
        identities: identitiesData?.length || 0,
        catalogs: catalogsData?.length || 0,
        productSets: productSetsData?.length || 0
      });
    } catch (error) {
      console.error("Error fetching TikTok resources:", error);
    } finally {
      setLoadingTiktokAdAccounts(false);
      setLoadingTiktokPixels(false);
      setLoadingTiktokIdentities(false);
      setLoadingTiktokCatalogs(false);
      setLoadingTiktokProductSets(false);
    }
  };

  // Re-apply TikTok defaults to markets that were restored from draft but missing key fields
  useEffect(() => {
    if (Object.keys(tiktokAdAccountDefaults).length === 0) return;
    
    let hasUpdates = false;
    const updatedPlatforms = platforms.map(platform => {
      if (!platform.id?.toLowerCase().includes('tiktok')) return platform;
      
      const updatedMarkets = platform.markets.map(market => {
        if (!market.adAccountId) return market;
        
        const defaults = tiktokAdAccountDefaults[market.adAccountId];
        if (!defaults) return market;
        
        // Check if market is missing key defaults that we should apply
        const needsPixel = !market.tiktokPixel && defaults.pixelId;
        const needsIdentity = !market.tiktokIdentity && defaults.identityId;
        const needsCatalog = !market.tiktokCatalog && defaults.catalogId;
        const needsProductSet = !market.tiktokProductSet && defaults.productSetId;
        const needsOptEvent = !market.tiktokOptimizationEvent && defaults.optimizationEvent;
        const needsOptLocation = !market.tiktokOptimizationLocation && defaults.optimizationLocation;
        const needsBidStrategy = !market.tiktokBidStrategy && defaults.bidStrategy;
        const needsLandingPage = !market.tiktokLandingPageUrl && defaults.landingPageUrl;
        const needsPlacementType = !market.tiktokPlacementType && defaults.placementType;
        
        if (!needsPixel && !needsIdentity && !needsCatalog && !needsProductSet && !needsOptEvent && 
            !needsOptLocation && !needsBidStrategy && !needsLandingPage && !needsPlacementType) {
          return market;
        }
        
        hasUpdates = true;
        console.log('🔄 Re-applying TikTok defaults to market:', market.id, {
          needsPixel,
          needsIdentity,
          needsCatalog,
          needsOptLocation,
          needsBidStrategy,
          defaults
        });
        
        return {
          ...market,
          tiktokPixel: needsPixel ? defaults.pixelId : market.tiktokPixel,
          tiktokIdentity: needsIdentity ? defaults.identityId : market.tiktokIdentity,
          tiktokCatalog: needsCatalog ? defaults.catalogId : market.tiktokCatalog,
          tiktokProductSet: needsProductSet ? defaults.productSetId : market.tiktokProductSet,
          tiktokOptimizationEvent: needsOptEvent ? defaults.optimizationEvent : market.tiktokOptimizationEvent,
          tiktokOptimizationLocation: needsOptLocation ? defaults.optimizationLocation : market.tiktokOptimizationLocation,
          tiktokBidStrategy: needsBidStrategy ? defaults.bidStrategy : market.tiktokBidStrategy,
          tiktokLandingPageUrl: needsLandingPage ? defaults.landingPageUrl : market.tiktokLandingPageUrl,
          tiktokPlacementType: needsPlacementType ? defaults.placementType : market.tiktokPlacementType,
          tiktokPlacements: !market.tiktokPlacements && defaults.placements ? defaults.placements : market.tiktokPlacements,
          tiktokAppId: !market.tiktokAppId && defaults.appId ? defaults.appId : market.tiktokAppId,
          tiktokAppName: !market.tiktokAppName && defaults.appName ? defaults.appName : market.tiktokAppName,
          tiktokClickWindow: market.tiktokClickWindow === undefined && defaults.clickWindow !== undefined ? defaults.clickWindow : market.tiktokClickWindow,
          tiktokViewWindow: market.tiktokViewWindow === undefined && defaults.viewWindow !== undefined ? defaults.viewWindow : market.tiktokViewWindow,
        };
      });
      
      return { ...platform, markets: updatedMarkets };
    });
    
    if (hasUpdates) {
      setPlatforms(updatedPlatforms);
    }
  }, [tiktokAdAccountDefaults, platforms]);

  // Fetch connected platforms and Meta resources on mount
  useEffect(() => {
    const fetchConnectedData = async () => {
      try {
        // Fetch connected platforms
        const { data: platformsData, error: platformsError } = await supabase
          .from("connected_platforms_safe")
          .select("*")
          .eq("is_active", true);

        if (platformsError) throw platformsError;
        
        setConnectedPlatforms(platformsData || []);

        // Fetch Meta resources from database
        await fetchMetaResources();
      } catch (error: any) {
        console.error("Failed to fetch connected platforms:", error);
        toast.error("Failed to load connected platforms");
      }
    };

    fetchConnectedData();
  }, []);

  // Get conversion events for a specific pixel
  const getConversionEventsForPixel = (pixelId: string) => {
    return conversionEvents.filter(event => event.pixelId === pixelId);
  };

  // Check if market needs conversion event (has conversion-related phases or campaign objective)
  const needsConversionEvent = (market: any) => {
    // Check campaign-level strategy focus first
    const campaignFocus = genericConfig?.strategyFocus?.toLowerCase() || "";
    const conversionFocuses = ["purchase", "conversions", "leads", "sales", "app-installs"];
    if (conversionFocuses.some(focus => campaignFocus.includes(focus))) {
      return true;
    }
    
    // Check campaign-level objective
    const campaignObjective = (genericConfig?.objective || "").toUpperCase();
    const conversionObjectives = [
      "OUTCOME_SALES", "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION",
      "CONVERSIONS", "LEAD_GENERATION", "CATALOG_SALES"
    ];
    if (conversionObjectives.includes(campaignObjective)) {
      return true;
    }
    
    // Then check phase-level objectives and optimization goals
    if (!market.phases || market.phases.length === 0) return false;
    
    return market.phases.some((phase: any) => {
      const phaseName = phase.name?.toLowerCase() || "";
      const objective = (phase.objective || "").toUpperCase();
      const optimizationGoal = (phase.optimizationGoal || "").toUpperCase();
      
      // Direct objective match
      if (conversionObjectives.includes(objective)) return true;
      
      // Optimization goals that need conversion events
      const conversionGoals = [
        "OFFSITE_CONVERSIONS", "VALUE", "APP_INSTALLS", "APP_EVENTS",
        "LEAD_GENERATION", "QUALITY_LEAD"
      ];
      if (conversionGoals.includes(optimizationGoal)) return true;
      
      // Phase name heuristic
      return (
        phaseName.includes("conversion") ||
        phaseName.includes("purchase") ||
        phaseName.includes("sales") ||
        phaseName.includes("lead")
      );
    });
  };

  const addPlatform = () => {
    // Get the first available market code for the default market
    const defaultMarketCode = MARKET_OPTIONS[0]?.value || "US";
    const newPlatform: PlatformWithMarkets = {
      id: "",
      name: "",
      enabled: true,
      budgetPercentage: 0,
      markets: [{ 
        id: `market-1-${Date.now()}`, 
        name: defaultMarketCode, 
        budgetPercentage: 100, 
        phases: [],
        // Default targeting for R&F compatibility - use the default market code
        countries: [defaultMarketCode],
        ageMin: 18,
        ageMax: 65,
        gender: "all",
        languages: [],
        publisherPlatforms: ["facebook"],
        positions: {},
        detailedTargeting: [],
        isCBOEnabled: false,
        isLifetimeBudget: false,
      }]
    };
    setPlatforms([...platforms, newPlatform]);
  };

  const loadTestPresets = () => {
    setPlatforms(getTestPresets());
  };

  const loadRFPreset = () => {
    const preset = getRFTestPreset();
    setPlatforms(preset.platforms);
    
    // Update dates and budget if setters are provided
    if (setStartDate) setStartDate(preset.startDate);
    if (setEndDate) setEndDate(preset.endDate);
    if (setTotalBudget) setTotalBudget(preset.totalBudget.toString());
  };

  const removePlatform = (index: number) => {
    setPlatforms(platforms.filter((_, i) => i !== index));
  };

  const updatePlatformSelection = (index: number, platformId: string) => {
    const selectedPlatform = AVAILABLE_PLATFORMS.find(p => p.id === platformId);
    if (selectedPlatform) {
      const translateMarketToPlatform = (market: Market, sourcePlatformId: string, targetPlatformId: string): Market => {
        const translatedMarketAdFormats = market.adFormats?.length
          ? translateAdFormats(market.adFormats, sourcePlatformId, targetPlatformId)
          : [];

        const translatedPhases = (market.phases || []).map((phase: any) => {
          const sourcePhaseAdFormats = phase.targeting?.adFormats ?? market.adFormats ?? [];
          const translatedPhaseAdFormats = sourcePhaseAdFormats.length
            ? translateAdFormats(sourcePhaseAdFormats, sourcePlatformId, targetPlatformId)
            : sourcePhaseAdFormats;

          let nextPhase: any = {
            ...phase,
            targeting: phase.targeting
              ? { ...phase.targeting, adFormats: translatedPhaseAdFormats }
              : phase.targeting,
          };

          if (phase.objective && phase.optimizationGoal) {
            const translated = translateObjective(
              phase.objective,
              phase.optimizationGoal,
              sourcePlatformId,
              targetPlatformId,
              {
                tiktokPlacementType: phase.tiktokPlacementType,
                tiktokPlacements: phase.tiktokPlacements,
                tiktokCampaignType: phase.tiktokCampaignType,
                adFormats: translatedPhaseAdFormats,
              }
            );

            nextPhase.objective = translated.objective;
            nextPhase.optimizationGoal = translated.optimizationGoal;

            if (targetPlatformId.toLowerCase().includes("google") && translated.translated) {
              nextPhase.googleCampaignType = translateGoogleCampaignType(translated.objective) || phase.googleCampaignType;
            }
          }

          if (!targetPlatformId.toLowerCase().includes("tiktok")) {
            delete nextPhase.tiktokOptimizationLocation;
            delete nextPhase.tiktokBidStrategy;
            delete nextPhase.tiktokBidAmount;
            delete nextPhase.tiktokPlacementType;
            delete nextPhase.tiktokPlacements;
            delete nextPhase.tiktokBillingEvent;
            delete nextPhase.tiktokCampaignType;
            delete nextPhase.tiktokSmartPlusEnabled;
          }

          if (!targetPlatformId.toLowerCase().includes("meta")) {
            delete nextPhase.metaBidStrategy;
            delete nextPhase.metaBidAmount;
            delete nextPhase.metaBillingEvent;
            delete nextPhase.metaAdvantagePlusCampaign;
            delete nextPhase.metaOptimizationLocation;
          }

          if (!targetPlatformId.toLowerCase().includes("google")) {
            delete nextPhase.googleCampaignType;
            delete nextPhase.googleCampaignSubtype;
            delete nextPhase.googleBidStrategy;
            delete nextPhase.googleTargetCpa;
            delete nextPhase.googleTargetRoas;
          }

          if (!targetPlatformId.toLowerCase().includes("snap")) {
            delete nextPhase.snapchatBidStrategy;
            delete nextPhase.snapchatBidAmount;
            delete nextPhase.snapchatPlacementType;
            delete nextPhase.snapchatPlacements;
          }

          return nextPhase;
        });

        const translatedMarket: any = {
          ...market,
          adAccountId: "",
          accountName: "",
          adFormats: translatedMarketAdFormats,
          phases: translatedPhases,
        };

        if (targetPlatformId.toLowerCase().includes("meta")) {
          translatedMarket.publisherPlatforms = ["facebook"];
        } else if (targetPlatformId.toLowerCase().includes("tiktok")) {
          translatedMarket.publisherPlatforms = ["tiktok"];
        } else if (targetPlatformId.toLowerCase().includes("google")) {
          translatedMarket.publisherPlatforms = ["google"];
        }

        if (!targetPlatformId.toLowerCase().includes("meta")) {
          translatedMarket.pixel = "";
          translatedMarket.page = "";
          translatedMarket.pageId = "";
          translatedMarket.instagramActorId = "";
          translatedMarket.catalog = "";
          translatedMarket.productSet = "";
          translatedMarket.conversionEvent = "";
          translatedMarket.metaBidStrategy = undefined;
          translatedMarket.metaBidAmount = undefined;
          translatedMarket.metaBillingEvent = undefined;
          translatedMarket.metaClickWindow = undefined;
          translatedMarket.metaViewWindow = undefined;
        }

        if (!targetPlatformId.toLowerCase().includes("tiktok")) {
          translatedMarket.tiktokPixel = "";
          translatedMarket.tiktokIdentity = "";
          translatedMarket.tiktokCatalog = "";
          translatedMarket.tiktokProductSet = "";
          translatedMarket.tiktokOptimizationEvent = undefined;
          translatedMarket.tiktokOptimizationLocation = "";
          translatedMarket.tiktokBidStrategy = undefined;
          translatedMarket.tiktokBidAmount = undefined;
          translatedMarket.tiktokPlacements = undefined;
          translatedMarket.tiktokPlacementType = undefined;
          translatedMarket.tiktokBillingEvent = undefined;
        }

        if (!targetPlatformId.toLowerCase().includes("google")) {
          translatedMarket.googleMerchantCenterId = "";
          translatedMarket.googleFeedLabel = "";
          translatedMarket.googleCampaignType = undefined;
          translatedMarket.googleCampaignSubtype = undefined;
          translatedMarket.googleBidStrategy = undefined;
          translatedMarket.googleTargetCpa = undefined;
          translatedMarket.googleTargetRoas = undefined;
        }

        return translatedMarket;
      };

      setPlatforms(
        platforms.map((p, i) => 
          i === index 
            ? {
                ...p,
                id: selectedPlatform.id,
                name: selectedPlatform.name,
                markets: p.markets.map((market) =>
                  translateMarketToPlatform(
                    market,
                    p.id || (p as any).duplicateSourcePlatformId || selectedPlatform.id,
                    selectedPlatform.id,
                  ),
                ),
              }
            : p
        )
      );
    }
  };

  const duplicatePlatform = (index: number) => {
    const platformToDup = platforms[index];
    const newPlatform: PlatformWithMarkets = {
      id: "",
      name: "",
      enabled: true,
      budgetPercentage: platformToDup.budgetPercentage,
      markets: platformToDup.markets.map(m => ({
        ...m,
        id: `${m.id}-dup-${Date.now()}`
      }))
    } as PlatformWithMarkets;
    (newPlatform as any).duplicateSourcePlatformId = platformToDup.id;
    setPlatforms([...platforms, newPlatform]);
  };

  const validateBudgetAllocations = (nextPlatforms: PlatformWithMarkets[]): boolean => {
    for (const platform of nextPlatforms) {
      if (!platform.id || platform.budgetPercentage <= 0) continue;
      if (platformIsBudgetLocked(platform)) continue;

      const platformBudgetEur = calculatePlatformBudgetEur(totalBudget, platform.budgetPercentage);
      const minPlatformEur = minPlatformBudgetEurForPhases(platform);
      if (platformBudgetEur < minPlatformEur) {
        toast.error(`Minimum platform budget is €${minPlatformEur.toFixed(0)}`, {
          description: `${platform.name}: €${platformBudgetEur.toFixed(2)} at ${platform.budgetPercentage.toFixed(1)}% of total (€${ACTIPLAN_MIN_ENTITY_BUDGET_EUR} per phase across markets).`,
        });
        return false;
      }

      for (const market of platform.markets) {
        if (marketIsBudgetLocked(platform, market)) continue;

        const marketBudgetEur = calculateMarketBudgetEur(
          totalBudget,
          platform.budgetPercentage,
          market.budgetPercentage ?? 100,
        );
        const marketPct = market.budgetPercentage ?? 0;
        if (marketPct <= 0) continue;

        const minMarketEur = minMarketBudgetEurForPhases(market.phases);
        if (marketBudgetEur < minMarketEur) {
          toast.error(`Minimum market budget is €${minMarketEur.toFixed(0)}`, {
            description: `${platform.name} · ${market.name}: €${marketBudgetEur.toFixed(2)} (${market.phases?.length || 1} phase(s) × €${ACTIPLAN_MIN_ENTITY_BUDGET_EUR}).`,
          });
          return false;
        }
      }
    }
    return true;
  };

  const commitPlatforms = (nextPlatforms: PlatformWithMarkets[]): boolean => {
    const next =
      totalBudget > 0
        ? (enforceActiPlanBudgetFloors(nextPlatforms, totalBudget) as PlatformWithMarkets[])
        : nextPlatforms;
    const valid = validateBudgetAllocations(next);
    setPlatforms(next);
    return valid;
  };

  const budgetLockNormalizeSkipRef = useRef<string | null>(null);

  // When budget lock is enabled, normalize to 100% then re-apply €50 floors (cannot bypass validation).
  useEffect(() => {
    if (!budgetLocked) {
      budgetLockNormalizeSkipRef.current = null;
      return;
    }

    let next = platforms;
    const totalPlatformBudget = next.reduce((sum, p) => sum + p.budgetPercentage, 0);

    if (totalPlatformBudget > 100) {
      next = next.map((p) => ({
        ...p,
        budgetPercentage:
          totalPlatformBudget > 0
            ? (p.budgetPercentage / totalPlatformBudget) * 100
            : 100 / next.length,
      }));
    }

    next = next.map((p) => {
      const totalMarketBudget = p.markets.reduce((sum, m) => sum + m.budgetPercentage, 0);
      if (totalMarketBudget <= 100) return p;
      return {
        ...p,
        markets: p.markets.map((m) => ({
          ...m,
          budgetPercentage:
            totalMarketBudget > 0
              ? (m.budgetPercentage / totalMarketBudget) * 100
              : 100 / p.markets.length,
        })),
      };
    });

    const unchanged =
      next.length === platforms.length &&
      next.every((p, i) => {
        const prev = platforms[i];
        if ((p.budgetPercentage ?? 0) !== (prev.budgetPercentage ?? 0)) return false;
        return (p.markets ?? []).every(
          (m, j) => (m.budgetPercentage ?? 0) === (prev.markets?.[j]?.budgetPercentage ?? 0),
        );
      });
    if (!unchanged) {
      const fingerprint = JSON.stringify(
        next.map((p) => [
          p.budgetPercentage,
          ...(p.markets ?? []).map((m) => m.budgetPercentage),
        ]),
      );
      if (budgetLockNormalizeSkipRef.current === fingerprint) {
        return;
      }
      if (!commitPlatforms(next)) {
        budgetLockNormalizeSkipRef.current = fingerprint;
      } else {
        budgetLockNormalizeSkipRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetLocked, platforms, totalBudget]);

  const minPlatformSliderPct = (platform: PlatformWithMarkets) =>
    platform.id && totalBudget > 0
      ? ceilBudgetPercentageToSliderStep(
          minPlatformBudgetPercentageForPhases(totalBudget, platform),
          ACTIPLAN_BUDGET_SLIDER_STEP,
        )
      : 0;

  const minMarketSliderPct = (platform: PlatformWithMarkets, market: Market) => {
    if (!platform.id || totalBudget <= 0) return 0;
    const platformBudgetEur = calculatePlatformBudgetEur(totalBudget, platform.budgetPercentage);
    return ceilBudgetPercentageToSliderStep(
      minPercentageForBudgetEur(platformBudgetEur, minMarketBudgetEurForPhases(market.phases)),
      ACTIPLAN_BUDGET_SLIDER_STEP,
    );
  };

  const updatePlatformBudget = (index: number, percentage: number) => {
    const currentPlatform = platforms[index];
    if (platformIsBudgetLocked(currentPlatform)) {
      toast.info(platformBudgetLockTitle(currentPlatform), { id: "dsp-budget-locked" });
      return;
    }
    const minPlatformEur = currentPlatform.id ? minPlatformBudgetEurForPhases(currentPlatform) : 0;
    let newPercentage =
      currentPlatform.id && totalBudget > 0 && percentage > 0
        ? clampPercentageToMinimumEur(percentage, totalBudget, minPlatformEur, ACTIPLAN_BUDGET_SLIDER_STEP)
        : clampBudgetPercentage(percentage, 0, 100);

    let nextPlatforms: PlatformWithMarkets[];

    if (budgetLocked && platforms.length > 1) {
      const diff = newPercentage - currentPlatform.budgetPercentage;
      const otherNonFixedPlatforms = platforms.filter((_, i) => i !== index && !platformIsFixed(i));
      const otherNonFixedTotalBudget = otherNonFixedPlatforms.reduce((sum, p) => sum + p.budgetPercentage, 0);

      nextPlatforms = platforms.map((p, i) => {
        if (i === index) {
          return { ...p, budgetPercentage: newPercentage };
        }
        if (platformIsFixed(i)) {
          return p;
        }
        const floorPct = p.id && totalBudget > 0
          ? ceilBudgetPercentageToSliderStep(
              minPlatformBudgetPercentage(totalBudget, minPlatformBudgetEurForPhases(p)),
              ACTIPLAN_BUDGET_SLIDER_STEP,
            )
          : 0;
        if (otherNonFixedTotalBudget > 0) {
          const proportion = p.budgetPercentage / otherNonFixedTotalBudget;
          const adjustment = diff * proportion;
          return { ...p, budgetPercentage: Math.max(floorPct, p.budgetPercentage - adjustment) };
        }
        if (otherNonFixedPlatforms.length > 0) {
          const equalShare = diff / otherNonFixedPlatforms.length;
          return { ...p, budgetPercentage: Math.max(floorPct, p.budgetPercentage - equalShare) };
        }
        return p;
      });
    } else {
      nextPlatforms = platforms.map((p, i) =>
        i === index ? { ...p, budgetPercentage: newPercentage } : p,
      );
    }

    commitPlatforms(nextPlatforms);
  };

  const addMarket = (index: number) => {
    setPlatforms(
      platforms.map((p, i) => {
        if (i === index) {
          // Find the first unused market from MARKET_OPTIONS
          const usedMarketValues = p.markets.map(m => m.name);
          const availableMarket = MARKET_OPTIONS.find(opt => !usedMarketValues.includes(opt.value));
          
          // If no available market, use the first one (user can change it)
          const marketValue = availableMarket?.value || MARKET_OPTIONS[0].value;
          
          // Determine publisher platforms based on platform name
          let publisherPlatforms = ["facebook"]; // Default to facebook for Meta
          if (p.name.toLowerCase().includes("tiktok")) {
            publisherPlatforms = ["tiktok"];
          } else if (p.name.toLowerCase().includes("google")) {
            publisherPlatforms = ["google"];
          }
          
          // Apply default targeting values for R&F compatibility
          const newMarket: Market = {
            id: `market-${Date.now()}`,
            name: marketValue,
            budgetPercentage: 0,
            phases: [],
            // Inherit strategy from genericConfig if available
            strategy: genericConfig?.strategy,
            strategyFocus: genericConfig?.strategyFocus,
            // Default targeting
            countries: [marketValue],
            ageMin: 18,
            ageMax: 65,
            gender: "all",
            languages: [],
            publisherPlatforms: publisherPlatforms,
            positions: {},
            detailedTargeting: [],
            // Campaign defaults
            isCBOEnabled: false,
            isLifetimeBudget: false,
          };
          return { ...p, markets: [...p.markets, newMarket] };
        }
        return p;
      })
    );
  };

  const duplicateMarket = (platformIndex: number, marketId: string) => {
    setPlatforms(
      platforms.map((p, i) => {
        if (i === platformIndex) {
          const marketToDup = p.markets.find(m => m.id === marketId);
          if (marketToDup) {
            const usedMarketNames = p.markets.map(m => m.name.toLowerCase());
            let newName = `${marketToDup.name} (Copy)`;
            let counter = 1;
            
            while (usedMarketNames.includes(newName.toLowerCase())) {
              counter++;
              newName = `${marketToDup.name} (Copy ${counter})`;
            }
            
            const newMarket: Market = {
              ...marketToDup,
              id: `market-dup-${Date.now()}`,
              name: newName,
            };
            return { ...p, markets: [...p.markets, newMarket] };
          }
        }
        return p;
      })
    );
  };

  const removeMarket = (platformIndex: number, marketId: string) => {
    setPlatforms(
      platforms.map((p, i) => 
        i === platformIndex 
          ? { ...p, markets: p.markets.filter(m => m.id !== marketId) }
          : p
      )
    );
  };

  const updateMarketName = (platformIndex: number, marketId: string, name: string) => {
    setPlatforms(
      platforms.map((p, i) => 
        i === platformIndex 
          ? { 
              ...p, 
              markets: p.markets.map(m => 
                m.id === marketId 
                  ? { 
                      ...m, 
                      name,
                      // CRITICAL: Update countries to match the selected market code
                      // This ensures TikTok (and other platforms) receive the correct location targeting
                      countries: [name]
                    } 
                  : m
              )
            }
          : p
      )
    );
  };

  const updateMarketBudget = (platformIndex: number, marketId: string, percentage: number) => {
    const platform = platforms[platformIndex];
    const currentMarket = platform?.markets.find((m) => m.id === marketId);
    if (currentMarket && marketIsBudgetLocked(platform, currentMarket)) {
      toast.info(
        platform.id && isMarketBudgetLocked?.(platform.id, currentMarket.name)
          ? "This market is live in the DSP — budget is locked."
          : "Original plan market — locked in extension mode",
        { id: "dsp-budget-locked" },
      );
      return;
    }
    const platformBudgetEur = calculatePlatformBudgetEur(totalBudget, platform?.budgetPercentage ?? 0);
    const minMarketEur = currentMarket ? minMarketBudgetEurForPhases(currentMarket.phases) : 0;
    let newPercentage =
      platform?.id && currentMarket && platformBudgetEur > 0 && percentage > 0
        ? clampPercentageToMinimumEur(percentage, platformBudgetEur, minMarketEur, ACTIPLAN_BUDGET_SLIDER_STEP)
        : clampBudgetPercentage(percentage, 0, 100);

    let nextPlatforms: PlatformWithMarkets[];

    if (budgetLocked && platform.markets.length > 1) {
      const diff = newPercentage - (currentMarket?.budgetPercentage ?? 0);
      const otherNonFixedMarkets = platform.markets.filter((m) => m.id !== marketId && !marketIsFixed(platform, m));
      const otherNonFixedTotalBudget = otherNonFixedMarkets.reduce((sum, m) => sum + m.budgetPercentage, 0);

      nextPlatforms = platforms.map((p, i) => {
        if (i !== platformIndex) return p;
        return {
          ...p,
          markets: p.markets.map((m) => {
            if (m.id === marketId) {
              return { ...m, budgetPercentage: newPercentage };
            }
            if (marketIsFixed(platform, m)) {
              return m;
            }
            const floorPct =
              platformBudgetEur > 0
                ? ceilBudgetPercentageToSliderStep(
                    minPercentageForBudgetEur(platformBudgetEur, minMarketBudgetEurForPhases(m.phases)),
                    ACTIPLAN_BUDGET_SLIDER_STEP,
                  )
                : 0;
            if (otherNonFixedTotalBudget > 0) {
              const proportion = m.budgetPercentage / otherNonFixedTotalBudget;
              const adjustment = diff * proportion;
              return { ...m, budgetPercentage: Math.max(floorPct, m.budgetPercentage - adjustment) };
            }
            if (otherNonFixedMarkets.length > 0) {
              const equalShare = diff / otherNonFixedMarkets.length;
              return { ...m, budgetPercentage: Math.max(floorPct, m.budgetPercentage - equalShare) };
            }
            return m;
          }),
        };
      });
    } else {
      nextPlatforms = platforms.map((p, i) =>
        i === platformIndex
          ? {
              ...p,
              markets: p.markets.map((m) =>
                m.id === marketId ? { ...m, budgetPercentage: newPercentage } : m,
              ),
            }
          : p,
      );
    }

    commitPlatforms(nextPlatforms);
  };

  const handleBudgetSliderChange = (platformIndex: number, marketId: string, percentage: number) => {
    // Calculate the actual market budget in dollars
    const platform = platforms[platformIndex];
    const platformBudget = (totalBudget * platform.budgetPercentage) / 100;
    const marketBudget = (platformBudget * percentage) / 100;
    
    // Update the budget percentage immediately
    updateMarketBudget(platformIndex, marketId, percentage);
  };

  const updateMarketField = (platformIndex: number, marketId: string, field: keyof Market, value: any) => {
    setPlatforms(prev =>
      prev.map((p, i) =>
        i === platformIndex
          ? {
              ...p,
              markets: p.markets.map(m => {
                if (m.id === marketId) {
                  const updated = { ...m, [field]: value };
                  // Initialize phases array if updating adAccountId and phases don't exist
                  if (field === 'adAccountId' && (!updated.phases || updated.phases.length === 0)) {
                    updated.phases = [];
                  }
                  return updated;
                }
                return m;
              }),
            }
          : p
      )
    );
  };

  // Get list of platform types that have connected accounts
  const getConnectedPlatformTypes = () => {
    const connectedTypes = new Set<string>();
    connectedPlatforms.forEach(cp => {
      if (cp.platform_type) {
        connectedTypes.add(cp.platform_type.toLowerCase());
      }
    });
    return connectedTypes;
  };

  const getAvailablePlatforms = (currentPlatformId: string) => {
    const connectedTypes = getConnectedPlatformTypes();
    
    // Only show platforms that have connected accounts
    return AVAILABLE_PLATFORMS.filter(
      ap => {
        const isConnected = connectedTypes.has(ap.id);
        const isNotUsedOrCurrent = !usedPlatformIds.includes(ap.id) || ap.id === currentPlatformId;
        return isConnected && isNotUsedOrCurrent;
      }
    );
  };

  return (
    <>
      <PlatformMarketNav
        platforms={platforms}
        onNavigatePlatform={(idx) =>
          setExpandedPlatforms((prev) => ({ ...prev, [idx]: true }))
        }
        onNavigateMarket={(marketId) =>
          setExpandedMarkets((prev) => ({ ...prev, [marketId]: true }))
        }
      />
    <Card id="pm-section-platform-market">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Platform & Market Selection</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={budgetLocked ? "default" : "outline"}
              size="sm"
              onClick={() => setBudgetLocked(!budgetLocked)}
              className="gap-1"
              title={budgetLocked ? "Budget lock enabled - budgets redistribute to stay at 100%" : "Enable budget lock to auto-redistribute budgets"}
            >
              {budgetLocked ? (
                <Link2 className="h-3 w-3" />
              ) : (
                <Link2Off className="h-3 w-3" />
              )}
              {budgetLocked ? "Linked" : "Link Budgets"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAllPlatforms}
              className="gap-1"
            >
              <ChevronsUpDown className="h-3 w-3" />
              {platforms.every((_, i) => expandedPlatforms[i] === true) ? "Collapse All" : "Expand All"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPlatform}
              className="gap-1"
              disabled={platforms.length >= getConnectedPlatformTypes().size || getConnectedPlatformTypes().size === 0}
              title={getConnectedPlatformTypes().size === 0 ? "No platforms connected. Connect platforms in Settings → Connectors." : undefined}
            >
              <Plus className="h-3 w-3" />
              Add Platform
            </Button>
          </div>
        </div>
        <Alert className="border-muted-foreground/25 bg-muted/30">
            <AlertDescription className="text-xs leading-relaxed">
              Minimum €{ACTIPLAN_MIN_ENTITY_BUDGET_EUR} per platform, market, and phase after splits. Amounts below that
              show a red warning and block Next.
            </AlertDescription>
          </Alert>
          {extensionMode.isExtensionMode ? (
            <Alert className="mt-3 border-amber-500/40 bg-amber-500/10">
              <AlertDescription className="text-xs leading-relaxed text-amber-900 dark:text-amber-100">
                Extension mode: budgets for original platforms and markets are locked (padlock icon). Add new
                platforms or markets to allocate unpublished budget only.
              </AlertDescription>
            </Alert>
          ) : null}
          {dspLocksActive ? (
            <Alert className="mt-3 border-amber-500/40 bg-amber-500/10">
              <AlertDescription className="text-xs leading-relaxed text-amber-900 dark:text-amber-100">
                {dspPartialPush
                  ? "Some markets are live in the DSP — their budgets are locked. Reallocate only among unpublished markets."
                  : "This ActiPlan is live in the DSP — pushed budgets are locked."}
              </AlertDescription>
            </Alert>
          ) : null}
          {budgetViolationsSummary ? (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription className="text-xs whitespace-pre-line">
                {budgetViolationsSummary}
              </AlertDescription>
            </Alert>
          ) : null}
          {getConnectedPlatformTypes().size === 0 && (
            <div className="flex items-center gap-2 mt-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm">
              <span>⚠️</span>
              <span>
                No ad accounts connected yet. Go to{" "}
                <a href="/app/settings/platforms" className="underline font-medium hover:text-amber-900 dark:hover:text-amber-100">
                  Platform Connections
                </a>{" "}
                to link your ad accounts before adding platforms.
              </span>
            </div>
          )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {platforms.map((platform, platformIndex) => {
            const availablePlatforms = getAvailablePlatforms(platform.id);
            const platformLaunchLocked = platformIsBudgetLocked(platform);

            return (
              <Collapsible
                key={platformIndex}
                open={expandedPlatforms[platformIndex] === true}
                onOpenChange={() => togglePlatformExpanded(platformIndex)}
                className="border rounded-lg"
                id={`pm-platform-${platform.id || `idx-${platformIndex}`}`}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          {expandedPlatforms[platformIndex] === true ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <Select
                        value={platform.id}
                        onValueChange={(value) => updatePlatformSelection(platformIndex, value)}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Select platform" />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePlatforms.map((ap) => (
                            <SelectItem key={ap.id} value={ap.id}>
                              {ap.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-1">
                      {/* Always visible budget inputs */}
                      {platform.id && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={platform.budgetPercentage.toFixed(1)}
                              onChange={(e) => {
                                e.stopPropagation();
                                updatePlatformBudget(platformIndex, parseFloat(e.target.value) || 0);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-7 w-16 text-xs text-center"
                              min={minPlatformSliderPct(platform)}
                              max="100"
                              step="0.1"
                              disabled={platformLaunchLocked}
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">€</span>
                            <Input
                              type="number"
                              value={Math.round(
                                calculatePlatformBudgetEur(
                                  totalBudget,
                                  Math.max(platform.budgetPercentage, minPlatformSliderPct(platform)),
                                ),
                              )}
                              onChange={(e) => {
                                e.stopPropagation();
                                const minEur = Math.round(minPlatformBudgetEurForPhases(platform));
                                const amount = Math.max(minEur, parseFloat(e.target.value) || 0);
                                if (totalBudget > 0) {
                                  const percentage = (amount / totalBudget) * 100;
                                  updatePlatformBudget(platformIndex, percentage);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-7 w-24 text-xs"
                              min={Math.round(minPlatformBudgetEurForPhases(platform))}
                              disabled={platformLaunchLocked}
                            />
                          </div>
                          {/* Always visible slider */}
                          <div className="w-48" onClick={(e) => e.stopPropagation()}>
                            <Slider
                              value={[Math.max(platform.budgetPercentage, minPlatformSliderPct(platform))]}
                              onValueChange={([value]) => updatePlatformBudget(platformIndex, value)}
                              onValueCommit={([value]) => updatePlatformBudget(platformIndex, value)}
                              min={minPlatformSliderPct(platform)}
                              max={100}
                              step={ACTIPLAN_BUDGET_SLIDER_STEP}
                              className="w-full"
                              disabled={platformLaunchLocked}
                            />
                          </div>
                          {platformLaunchLocked ? (
                            <span
                              title={platformBudgetLockTitle(platform)}
                              className="inline-flex h-7 w-7 items-center justify-center"
                            >
                              <Lock className="h-3 w-3 text-amber-700 dark:text-amber-400" />
                            </span>
                          ) : (
                          <Button
                            type="button"
                            variant={fixedPlatforms[platformIndex] ? "secondary" : "ghost"}
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePlatformFixed(platformIndex);
                            }}
                            className="h-7 w-7 p-0"
                            title={fixedPlatforms[platformIndex] ? "Budget is fixed (won't change when others adjust)" : "Fix budget (prevent changes when others adjust)"}
                          >
                            {fixedPlatforms[platformIndex] ? (
                              <Pin className="h-3 w-3" />
                            ) : (
                              <PinOff className="h-3 w-3" />
                            )}
                          </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicatePlatform(platformIndex);
                        }}
                        className="h-7 w-7 p-0"
                        disabled={platforms.length >= AVAILABLE_PLATFORMS.length}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePlatform(platformIndex);
                        }}
                        className="h-7 w-7 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <CollapsibleContent>
                  {platform.id && (
                    <div className="px-4 pb-4 space-y-4">
                      {(() => {
                        const minPlatformEur = minPlatformBudgetEurForPhases(platform);
                        const currentPlatformEur = calculatePlatformBudgetEur(totalBudget, platform.budgetPercentage);
                        if (currentPlatformEur >= minPlatformEur) return null;
                        return (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            This platform needs at least €{minPlatformEur.toFixed(0)} (€{ACTIPLAN_MIN_ENTITY_BUDGET_EUR} per phase). Increase platform or total budget.
                          </p>
                        );
                      })()}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Markets</Label>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleAllMarketsForPlatform(platformIndex)}
                              className="h-7 gap-1"
                            >
                              <ChevronsUpDown className="h-3 w-3" />
                              {platform.markets.every(m => expandedMarkets[m.id] === true) ? "Collapse All" : "Expand All"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addMarket(platformIndex)}
                              className="h-7 gap-1"
                            >
                              <Plus className="h-3 w-3" />
                              Add Market
                            </Button>
                          </div>
                        </div>

                      {platform.markets.map((market) => {
                        const marketMinPct = minMarketSliderPct(platform, market);
                        const marketMinEur = minMarketBudgetEurForPhases(market.phases);
                        const effectiveMarketPct = Math.max(market.budgetPercentage, marketMinPct);
                        const marketBudget = calculateMarketBudgetEur(
                          totalBudget,
                          platform.budgetPercentage,
                          effectiveMarketPct,
                        );
                        const marketLaunchLocked = marketIsBudgetLocked(platform, market);

                        return (
                          <Collapsible
                            key={market.id}
                            open={expandedMarkets[market.id] === true}
                            onOpenChange={() => toggleMarketExpanded(market.id)}
                            className="bg-muted/50 rounded-md"
                            id={`pm-market-${market.id}`}
                          >
                            <div className="p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1">
                                  <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                      {expandedMarkets[market.id] === true ? (
                                        <ChevronDown className="h-3 w-3" />
                                      ) : (
                                        <ChevronRight className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </CollapsibleTrigger>
                                  <Select
                                    value={market.name}
                                    onValueChange={(value) => updateMarketName(platformIndex, market.id, value)}
                                  >
                                    <SelectTrigger className="h-7 text-sm w-[120px]">
                                      <SelectValue placeholder="Select market" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px]">
                                      {MARKET_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  
                                  {/* Always visible budget inputs */}
                                  <div className="flex items-center gap-2 ml-2">
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        value={market.budgetPercentage.toFixed(1)}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          updateMarketBudget(platformIndex, market.id, parseFloat(e.target.value) || 0);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-6 w-14 text-xs text-center"
                                        min={marketMinPct}
                                        max="100"
                                        step="0.1"
                                        disabled={marketLaunchLocked}
                                      />
                                      <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">€</span>
                                      <Input
                                        type="number"
                                        value={Math.round(marketBudget)}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          const minEur = Math.round(marketMinEur);
                                          const amount = Math.max(minEur, parseFloat(e.target.value) || 0);
                                          const platformBudget = calculatePlatformBudgetEur(
                                            totalBudget,
                                            platform.budgetPercentage,
                                          );
                                          if (platformBudget > 0) {
                                            const percentage = (amount / platformBudget) * 100;
                                            updateMarketBudget(platformIndex, market.id, percentage);
                                          }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-6 w-20 text-xs"
                                        min={Math.round(marketMinEur)}
                                        disabled={marketLaunchLocked}
                                      />
                                    </div>
                                    {/* Always visible slider */}
                                    <div className="w-40" onClick={(e) => e.stopPropagation()}>
                                      <Slider
                                        value={[Math.max(market.budgetPercentage, marketMinPct)]}
                                        onValueChange={([value]) => updateMarketBudget(platformIndex, market.id, value)}
                                        onValueCommit={([value]) => updateMarketBudget(platformIndex, market.id, value)}
                                        min={marketMinPct}
                                        max={100}
                                        step={ACTIPLAN_BUDGET_SLIDER_STEP}
                                        className="w-full"
                                        disabled={marketLaunchLocked}
                                      />
                                    </div>
                                    {marketLaunchLocked ? (
                                      <span
                                        title={
                                          platform.id && isMarketBudgetLocked?.(platform.id, market.name)
                                            ? "Live in DSP — budget locked"
                                            : "Original plan market — locked in extension mode"
                                        }
                                        className="inline-flex h-6 w-6 items-center justify-center"
                                      >
                                        <Lock className="h-3 w-3 text-amber-700 dark:text-amber-400" />
                                      </span>
                                    ) : (
                                    <Button
                                      type="button"
                                      variant={fixedMarkets[market.id] ? "secondary" : "ghost"}
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleMarketFixed(market.id);
                                      }}
                                      className="h-6 w-6 p-0"
                                      title={fixedMarkets[market.id] ? "Budget is fixed (won't change when others adjust)" : "Fix budget (prevent changes when others adjust)"}
                                    >
                                      {fixedMarkets[market.id] ? (
                                        <Pin className="h-3 w-3" />
                                      ) : (
                                        <PinOff className="h-3 w-3" />
                                      )}
                                    </Button>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      duplicateMarket(platformIndex, market.id);
                                    }}
                                    className="h-7 w-7 p-0"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeMarket(platformIndex, market.id);
                                    }}
                                    className="h-7 w-7 p-0"
                                    disabled={platform.markets.length === 1}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>

                            <CollapsibleContent>
                              <div className="px-3 pb-3 space-y-3">

                            {/* Platform Configuration Fields - Only for Meta */}
                            {platform.name.toLowerCase().includes("meta") && (
                              <div className="grid grid-cols-2 gap-2">
                                 <div className="space-y-1">
                                   <Label className="text-xs">
                                     Ad Account {needsConversionEvent(market) && <span className="text-destructive">*</span>}
                                   </Label>
                                   {/* Debug: Show defaults */}
                                   {market.adAccountId && adAccountDefaults[market.adAccountId] && (
                                     <div className="text-xs text-muted-foreground mb-1">
                                       Defaults: {adAccountDefaults[market.adAccountId].mainMarkets?.join(', ') || 'None'}
                                     </div>
                                   )}
                                   <Select
                                    value={market.adAccountId || ""}
                                   onValueChange={(value) => {
                                       console.log('🔄 Ad account selected:', value);
                                       const account = adAccounts.find(a => a.id === value);
                                       const defaults = adAccountDefaults[value];
                                       console.log('📋 Ad account defaults found:', defaults);
                                       console.log('📋 Client selected:', selectedClientId);
                                       
                                       // Only apply defaults if a client is selected
                                       if (!selectedClientId) {
                                         console.log('⚠️ No client selected - skipping defaults');
                                         // Just update the ad account without applying defaults
                                         setPlatforms(prev =>
                                           prev.map((p, i) => {
                                             if (i !== platformIndex) return p;
                                             return {
                                               ...p,
                                               markets: p.markets.map(m => {
                                                 if (m.id === market.id) {
                                                   return {
                                                     ...m,
                                                     adAccountId: value,
                                                     accountName: account?.name || "",
                                                   };
                                                 }
                                                 return m;
                                               }),
                                             };
                                           })
                                         );
                                         return;
                                       }
                                       
                                       // Batch all updates including defaults and auto-create markets
                                       setPlatforms(prev =>
                                         prev.map((p, i) => {
                                           if (i !== platformIndex) return p;
                                           
                                           // If the ad account has assigned markets, create markets for each
                                           const assignedMarkets = defaults?.mainMarkets || [];
                                           console.log('📍 Assigned markets from defaults:', assignedMarkets, 'Length:', assignedMarkets.length);
                                           
                                           if (assignedMarkets.length > 0) {
                                             // Create a market for each assigned market
                                             const marketBudgetSplit = 100 / assignedMarkets.length;
                                             const newMarkets = assignedMarkets.map((marketCode: string, idx: number) => {
                                               const marketOption = MARKET_OPTIONS.find(m => m.value === marketCode);
                                               
                                               console.log(`✨ Creating market ${idx + 1}/${assignedMarkets.length}: ${marketCode}`, {
                                                 pixelId: defaults?.pixelId,
                                                 pageId: defaults?.pageId,
                                                 catalog: defaults?.catalog,
                                                 productSet: defaults?.productSet
                                               });
                                               
                                                  return {
                                                    id: `${marketCode}-${Date.now()}-${idx}`,
                                                    name: marketCode,
                                                    budgetPercentage: marketBudgetSplit,
                                                    adAccountId: value,
                                                    accountName: account?.name || "",
                                                    pixel: defaults?.pixelId || "",
                                                    pageId: defaults?.pageId || "",
                                                    page: defaults?.pageId || "",
                                                    instagramActorId: defaults?.instagramActorId || "",
                                                    catalog: defaults?.catalog || "",
                                                    productSet: defaults?.productSet || "",
                                                    conversionEvent: defaults?.conversionEvent || "",
                                                    metaBidStrategy: defaults?.bidStrategy || 'LOWEST_COST_WITHOUT_CAP',
                                                    metaBidAmount: defaults?.bidAmount || undefined,
                                                    phases: [],
                                                    adFormats: [],
                                                    countries: [marketCode],
                                                    ageMin: 18,
                                                    ageMax: 65,
                                                    gender: "all",
                                                    languages: [],
                                                    metaPublisherPlatforms: defaults?.publisherPlatforms || ['facebook', 'instagram', 'audience_network'],
                                                    metaPositions: defaults?.positions || {},
                                                    publisherPlatforms: defaults?.publisherPlatforms || ['facebook', 'instagram', 'audience_network'],
                                                    positions: defaults?.positions || {},
                                                    detailedTargeting: [],
                                                    isCBOEnabled: false,
                                                    isLifetimeBudget: false,
                                                    // Destination/Optimization location fields
                                                    metaOptimizationLocation: defaults?.optimizationLocation || "",
                                                    metaAppStore: defaults?.appStore || "",
                                                    metaAppId: defaults?.appId || "",
                                                    metaLandingPageUrl: defaults?.landingPageUrl || "",
                                                    metaMessagingMode: defaults?.messagingMode || "AUTOMATIC",
                                                    metaMessengerEnabled: defaults?.messengerEnabled || false,
                                                    metaInstagramDmEnabled: defaults?.instagramDmEnabled || false,
                                                    metaWhatsappEnabled: defaults?.whatsappEnabled || false,
                                                    metaWhatsappNumber: defaults?.whatsappNumber || "",
                                                    metaBillingEvent: defaults?.billingEvent || "IMPRESSIONS",
                                                    metaClickWindow: defaults?.clickWindow || 7,
                                                    metaViewWindow: defaults?.viewWindow || 1,
                                                    metaAdvantagePlusPlacements: defaults?.advantagePlusPlacements ?? true,
                                                    metaAdvantagePlusCampaign: defaults?.advantagePlusCampaign ?? false,
                                                    metaAdvantagePlusAudience: defaults?.advantagePlusAudience ?? false,
                                                    metaAdvantagePlusCreative: defaults?.advantagePlusCreative ?? false,
                                                    metaConversionCount: defaults?.conversionCount || 'all_conversions',
                                                  };
                                              });
                                             
                                             console.log('✅ Created markets:', newMarkets.map(m => ({ name: m.name, pixel: m.pixel, page: m.page, catalog: m.catalog })));
                                             
                                             // Remove the temporary market and add the new ones
                                             const filteredMarkets = p.markets.filter(m => m.id !== market.id);
                                             
                                             toast.success(`Created ${newMarkets.length} market(s) with defaults: ${assignedMarkets.join(', ')}`);
                                             
                                             return {
                                               ...p,
                                               markets: [...filteredMarkets, ...newMarkets],
                                             };
                                           } else {
                                             console.log('⚠️ No assigned markets found for this ad account');
                                             toast.warning(`No markets assigned to this ad account. Configure in Account Defaults.`);
                                             
                                             // No assigned markets, just update the current market with defaults
                                             return {
                                               ...p,
                                               markets: p.markets.map(m => {
                                                 if (m.id === market.id) {
                                                   const updated: Market = {
                                                     ...m,
                                                     adAccountId: value,
                                                     accountName: account?.name || "",
                                                   };
                                                   
                                                     // Apply defaults if available
                                                     if (defaults) {
                                                       console.log("Applying defaults to current market:", value, defaults);
                                                       
                                                       if (defaults.pixelId) updated.pixel = defaults.pixelId;
                                                       if (defaults.pageId) {
                                                         updated.pageId = defaults.pageId;
                                                         updated.page = defaults.pageId;
                                                       }
                                                       if (defaults.instagramActorId) updated.instagramActorId = defaults.instagramActorId;
                                                       if (defaults.catalog) updated.catalog = defaults.catalog;
                                                       if (defaults.productSet) updated.productSet = defaults.productSet;
                                                       if (defaults.conversionEvent) updated.conversionEvent = defaults.conversionEvent;
                                                       if (defaults.bidStrategy) updated.metaBidStrategy = defaults.bidStrategy;
                                                       if (defaults.bidAmount !== undefined) updated.metaBidAmount = defaults.bidAmount;
                                                       if (defaults.publisherPlatforms) {
                                                         updated.metaPublisherPlatforms = defaults.publisherPlatforms;
                                                         updated.publisherPlatforms = defaults.publisherPlatforms;
                                                       }
                                                       if (defaults.positions) {
                                                         updated.metaPositions = defaults.positions;
                                                         updated.positions = defaults.positions;
                                                       }
                                                       // Destination/Optimization location defaults
                                                       if (defaults.optimizationLocation) updated.metaOptimizationLocation = defaults.optimizationLocation;
                                                       if (defaults.appStore) updated.metaAppStore = defaults.appStore;
                                                       if (defaults.appId) updated.metaAppId = defaults.appId;
                                                       if (defaults.landingPageUrl) updated.metaLandingPageUrl = defaults.landingPageUrl;
                                                       if (defaults.messagingMode) updated.metaMessagingMode = defaults.messagingMode;
                                                       if (defaults.messengerEnabled !== undefined) updated.metaMessengerEnabled = defaults.messengerEnabled;
                                                       if (defaults.instagramDmEnabled !== undefined) updated.metaInstagramDmEnabled = defaults.instagramDmEnabled;
                                                       if (defaults.whatsappEnabled !== undefined) updated.metaWhatsappEnabled = defaults.whatsappEnabled;
                                                       if (defaults.whatsappNumber) updated.metaWhatsappNumber = defaults.whatsappNumber;
                                                       if (defaults.billingEvent) updated.metaBillingEvent = defaults.billingEvent;
                                                       if (defaults.clickWindow) updated.metaClickWindow = defaults.clickWindow;
                                                       if (defaults.viewWindow) updated.metaViewWindow = defaults.viewWindow;
                                                       if (defaults.advantagePlusPlacements !== undefined) updated.metaAdvantagePlusPlacements = defaults.advantagePlusPlacements;
                                                       if (defaults.advantagePlusCampaign !== undefined) (updated as any).metaAdvantagePlusCampaign = defaults.advantagePlusCampaign;
                                                       if (defaults.advantagePlusAudience !== undefined) (updated as any).metaAdvantagePlusAudience = defaults.advantagePlusAudience;
                                                       if (defaults.advantagePlusCreative !== undefined) (updated as any).metaAdvantagePlusCreative = defaults.advantagePlusCreative;
                                                       if (defaults.conversionCount) (updated as any).metaConversionCount = defaults.conversionCount;
                                                       
                                                       toast.success("Applied default settings for this ad account");
                                                     }
                                                   
                                                   if (!updated.phases || updated.phases.length === 0) {
                                                     updated.phases = [];
                                                   }
                                                   
                                                   return updated;
                                                 }
                                                 return m;
                                               }),
                                             };
                                           }
                                         })
                                       );
                                     }}
                                   >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingAdAccounts ? "Loading..." : "Select Ad Account"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      {loadingAdAccounts ? (
                                        <div className="flex items-center justify-center p-4">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                      ) : adAccounts.length === 0 ? (
                                        <div className="p-4 text-xs text-muted-foreground text-center">
                                          No ad accounts found. Click Refresh Meta Data.
                                        </div>
                                      ) : (
                                        adAccounts.map((account) => (
                                          <SelectItem key={account.id} value={account.id}>
                                            {account.name}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                  {market.adAccountId && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs mt-1"
                                      disabled={syncingAccountId === market.adAccountId}
                                      onClick={() => handleSyncMetaAccountAssets(market.adAccountId!)}
                                    >
                                      {syncingAccountId === market.adAccountId ? (
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                      ) : (
                                        <RefreshCw className="h-3 w-3 mr-1" />
                                      )}
                                      {syncingAccountId === market.adAccountId ? "Syncing..." : "Sync Assets"}
                                    </Button>
                                  )}
                                </div>

                                    <div className="space-y-1">
                                      <Label className="text-xs">
                                        Pixel
                                      </Label>
                                  <Select
                                    value={market.pixel || NONE_OPTION}
                                    onValueChange={(value) => {
                                      const nextValue = value === NONE_OPTION ? "" : value;
                                      updateMarketField(platformIndex, market.id, 'pixel', nextValue);
                                      if (!nextValue) {
                                        updateMarketField(platformIndex, market.id, 'conversionEvent', "");
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingPixels ? "Loading..." : "Select Pixel"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      <SelectItem value={NONE_OPTION}>None</SelectItem>
                                      {loadingPixels ? (
                                        <div className="flex items-center justify-center p-4">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                      ) : pixels.filter(p => !market.adAccountId || p.adAccountId === market.adAccountId).length === 0 ? (
                                        <div className="p-4 text-xs text-muted-foreground text-center">
                                          {market.adAccountId ? "No pixels found for this ad account" : "Select an ad account first"}
                                        </div>
                                      ) : (
                                        pixels
                                          .filter(p => !market.adAccountId || p.adAccountId === market.adAccountId)
                                          .map((pixel) => (
                                            <SelectItem key={pixel.id} value={pixel.id}>
                                              {pixel.name}
                                            </SelectItem>
                                          ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs">Facebook Page</Label>
                                  <Select
                                    value={market.page || market.pageId || NONE_OPTION}
                                    onValueChange={(value) => {
                                      const nextValue = value === NONE_OPTION ? "" : value;
                                      updateMarketField(platformIndex, market.id, 'pageId', nextValue);
                                      updateMarketField(platformIndex, market.id, 'page', nextValue);
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingPages ? "Loading..." : "Select Facebook Page"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      <SelectItem value={NONE_OPTION}>None</SelectItem>
                                      {loadingPages ? (
                                        <div className="flex items-center justify-center p-4">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                      ) : pages.length === 0 ? (
                                        <div className="p-4 text-xs text-muted-foreground text-center">
                                          No pages found. Click Refresh Meta Data.
                                        </div>
                                      ) : (
                                        pages.map((page) => (
                                          <SelectItem key={page.id} value={page.id}>
                                            {page.name}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs">Instagram Account</Label>
                                  <Select
                                    value={market.instagramActorId || NONE_OPTION}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'instagramActorId', value === NONE_OPTION ? "" : value)}
                                    disabled={isLoadingAccounts || instagramAccounts.length === 0}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={
                                        isLoadingAccounts 
                                          ? "Loading..." 
                                          : instagramAccounts.length === 0
                                          ? "No accounts connected"
                                          : "Select Instagram account"
                                      } />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      <SelectItem value={NONE_OPTION}>None</SelectItem>
                                      {instagramAccounts.length === 0 ? (
                                        <div className="p-2 text-xs text-muted-foreground text-center">
                                          <p>No Instagram accounts found.</p>
                                          <button 
                                            className="text-primary hover:underline mt-1"
                                            onClick={() => window.open('/platforms', '_blank')}
                                          >
                                            Connect platform first
                                          </button>
                                        </div>
                                      ) : (
                                        instagramAccounts.map((account) => (
                                          <SelectItem key={account.id} value={account.id}>
                                            {account.username} - {account.name}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs">Catalog</Label>
                                  <Select
                                    value={market.catalog || NONE_OPTION}
                                    onValueChange={(value) => {
                                      const nextValue = value === NONE_OPTION ? "" : value;
                                      updateMarketField(platformIndex, market.id, 'catalog', nextValue);
                                      // Reset product set when catalog changes
                                      updateMarketField(platformIndex, market.id, 'productSet', "");
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingCatalogs ? "Loading..." : "Select Catalog"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      <SelectItem value={NONE_OPTION}>None</SelectItem>
                                      {loadingCatalogs ? (
                                        <div className="flex items-center justify-center p-4">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                      ) : catalogs.length === 0 ? (
                                        <div className="p-4 text-xs text-muted-foreground text-center">
                                          No catalogs found. Click Refresh Meta Data.
                                        </div>
                                      ) : (
                                        catalogs.map((catalog) => (
                                          <SelectItem key={catalog.id} value={catalog.id}>
                                            {catalog.name}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs">Product Set</Label>
                                  <Select
                                    value={market.productSet || NONE_OPTION}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'productSet', value === NONE_OPTION ? "" : value)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Select Product Set" />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      <SelectItem value={NONE_OPTION}>None</SelectItem>
                                      {loadingProductSets ? (
                                        <div className="flex items-center justify-center p-4">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                      ) : !market.catalog ? (
                                        <div className="p-4 text-xs text-muted-foreground text-center">
                                          Select a catalog first
                                        </div>
                                      ) : productSets.filter(ps => ps.catalogId === market.catalog).length === 0 ? (
                                        <div className="p-4 text-xs text-muted-foreground text-center">
                                          No product sets found for this catalog. Click Refresh Meta Data.
                                        </div>
                                      ) : (
                                        productSets
                                          .filter(ps => ps.catalogId === market.catalog)
                                          .map((productSet) => (
                                            <SelectItem key={productSet.id} value={productSet.id}>
                                              {productSet.name}
                                            </SelectItem>
                                          ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {platform.id === "meta" && market.pixel && needsConversionEvent(market) && (
                                  <div className="space-y-1 col-span-2">
                                    <Label className="text-xs">
                                      Conversion Event <span className="text-destructive">*</span>
                                    </Label>
                                    <Select
                                      value={market.conversionEvent || NONE_OPTION}
                                      onValueChange={(value) => updateMarketField(platformIndex, market.id, 'conversionEvent', value === NONE_OPTION ? "" : value)}
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue placeholder={loadingConversionEvents ? "Loading..." : "Select Event"} />
                                      </SelectTrigger>
                                      <SelectContent className="z-50 bg-background">
                                        <SelectItem value={NONE_OPTION}>None</SelectItem>
                                        {loadingConversionEvents ? (
                                          <div className="flex items-center justify-center p-4">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          </div>
                                        ) : getConversionEventsForPixel(market.pixel).length > 0 ? (
                                          getConversionEventsForPixel(market.pixel).map((event) => (
                                            <SelectItem key={event.id} value={event.id}>
                                              {event.name}
                                            </SelectItem>
                                          ))
                                        ) : (
                                          <div className="p-4 text-xs text-muted-foreground text-center">
                                            No events found. Click Refresh Meta Data.
                                          </div>
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}

                                <div className="space-y-1">
                                  <Label className="text-xs">Bid Strategy</Label>
                                  <Select
                                    value={market.metaBidStrategy || "LOWEST_COST_WITHOUT_CAP"}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'metaBidStrategy', value)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Select bid strategy" />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      <SelectItem value="LOWEST_COST_WITHOUT_CAP">Lowest Cost (Automatic)</SelectItem>
                                      <SelectItem value="LOWEST_COST_WITH_BID_CAP">Lowest Cost with Bid Cap</SelectItem>
                                      <SelectItem value="COST_CAP">Cost Cap</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                {(market.metaBidStrategy === "LOWEST_COST_WITH_BID_CAP" || market.metaBidStrategy === "COST_CAP") && (
                                  <div className="space-y-1">
                                    <Label className="text-xs">Bid Amount (€)</Label>
                                    <Input
                                      className="h-7 text-xs"
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      placeholder="Enter bid amount"
                                      value={market.metaBidAmount || ""}
                                      onChange={(e) => updateMarketField(platformIndex, market.id, 'metaBidAmount', parseFloat(e.target.value) || undefined)}
                                    />
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Platform Configuration Fields - Only for TikTok */}
                            {(() => {
                              const isTikTok = platform.name.toLowerCase().includes("tiktok");
                              console.log(`🔍 TikTok check for market ${market.id}:`, {
                                platformName: platform.name,
                                isTikTok,
                                hasAdAccounts: tiktokAdAccounts.length,
                                hasPixels: tiktokPixels.length,
                                hasIdentities: tiktokIdentities.length,
                                hasCatalogs: tiktokCatalogs.length
                              });
                              return isTikTok;
                            })() && (
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">
                                    Advertiser Account <span className="text-destructive">*</span>
                                  </Label>
                                  <Select
                                    value={market.adAccountId || ""}
                                    onValueChange={(value) => {
                                      console.log('🔄 TikTok advertiser account selected:', value);
                                      const account = tiktokAdAccounts.find(a => a.id === value);
                                      const defaults = tiktokAdAccountDefaults[value];
                                      console.log('📋 TikTok account defaults lookup for:', value);
                                      console.log('📋 All TikTok defaults:', tiktokAdAccountDefaults);
                                      console.log('📋 Found defaults:', defaults);
                                      console.log('📋 Client selected:', selectedClientId);
                                      
                                      // Only apply defaults if a client is selected
                                      if (!selectedClientId) {
                                        console.log('⚠️ No client selected - skipping defaults');
                                        // Just update the ad account without applying defaults
                                        setPlatforms(prev =>
                                          prev.map((p, i) => {
                                            if (i !== platformIndex) return p;
                                            return {
                                              ...p,
                                              markets: p.markets.map(m => {
                                                if (m.id === market.id) {
                                                  return {
                                                    ...m,
                                                    adAccountId: value,
                                                    accountName: account?.name || "",
                                                  };
                                                }
                                                return m;
                                              }),
                                            };
                                          })
                                        );
                                        return;
                                      }
                                      
                                      if (!defaults || (!defaults.pixelId && !defaults.identityId && !defaults.catalogId)) {
                                        console.warn('⚠️ No defaults configured for this TikTok account');
                                        toast.warning(`No defaults configured for ${account?.name || 'this account'}. Configure in Client Defaults first.`);
                                      }
                                      
                                      // Batch all updates including defaults
                                      setPlatforms(prev =>
                                        prev.map((p, i) => {
                                          if (i !== platformIndex) return p;
                                          
                                          // If the ad account has assigned markets, create markets for each
                                          const assignedMarkets = defaults?.mainMarkets || [];
                                          console.log('📍 Assigned markets from TikTok defaults:', assignedMarkets);
                                          
                                          if (assignedMarkets.length > 0) {
                                            // Create a market for each assigned market
                                            const marketBudgetSplit = 100 / assignedMarkets.length;
                                            const newMarkets = assignedMarkets.map((marketCode: string, idx: number) => {
                                              const marketOption = MARKET_OPTIONS.find(m => m.value === marketCode);
                                              
                                              return {
                                                id: `${marketCode}-${Date.now()}-${idx}`,
                                                name: marketCode,
                                                budgetPercentage: marketBudgetSplit,
                                                adAccountId: value,
                                                accountName: account?.name || "",
                                                tiktokPixel: defaults?.pixelId || "",
                                                tiktokIdentity: defaults?.identityId || "",
                                                tiktokCatalog: defaults?.catalogId || "",
                                                tiktokProductSet: defaults?.productSetId || "",
                                                tiktokOptimizationEvent: defaults?.optimizationEvent || "ON_WEB_ORDER",
                                                tiktokLandingPageUrl: defaults?.landingPageUrl || "",
                                                tiktokBidStrategy: defaults?.bidStrategy || "LOWEST_COST",
                                                tiktokPlacementType: defaults?.placementType || "PLACEMENT_TYPE_AUTOMATIC",
                                                tiktokPlacements: defaults?.placements || ["PLACEMENT_TIKTOK"],
                                                // TikTok destination fields
                                                tiktokOptimizationLocation: defaults?.optimizationLocation || "",
                                                tiktokAppName: defaults?.appName || "",
                                                tiktokAppId: defaults?.appId || "",
                                                // TikTok messaging fields
                                                tiktokMessagingApp: defaults?.messagingApp || "",
                                                tiktokFacebookPageId: defaults?.facebookPageId || "",
                                                tiktokMessageEventSet: defaults?.messageEventSet || "",
                                                tiktokWhatsappNumber: defaults?.whatsappNumber || "",
                                                tiktokZaloAccountId: defaults?.zaloAccountId || "",
                                                tiktokLineBusinessId: defaults?.lineBusinessId || "",
                                                // Attribution windows and billing
                                                tiktokClickWindow: defaults?.clickWindow || undefined,
                                                tiktokViewWindow: defaults?.viewWindow || undefined,
                                                tiktokBillingEvent: defaults?.billingEvent || undefined,
                                                phases: [],
                                                adFormats: [],
                                                // Filter out US from TikTok countries
                                                countries: marketCode !== 'US' ? [marketCode] : [],
                                                ageMin: 18,
                                                ageMax: 65,
                                                gender: "all",
                                                languages: [],
                                                publisherPlatforms: ["tiktok"],
                                                positions: {},
                                                detailedTargeting: [],
                                                isCBOEnabled: false,
                                                isLifetimeBudget: false,
                                              };
                                            });
                                            
                                            // Remove the temporary market and add the new ones
                                            const filteredMarkets = p.markets.filter(m => m.id !== market.id);
                                            
                                            toast.success(`Created ${newMarkets.length} TikTok market(s): ${assignedMarkets.join(', ')}`);
                                            
                                            return {
                                              ...p,
                                              markets: [...filteredMarkets, ...newMarkets],
                                            };
                                          } else {
                                            console.log('⚠️ No assigned markets found for this TikTok account');
                                            toast.warning(`No markets assigned to this TikTok account. Configure in Account Defaults.`);
                                            
                                            // No assigned markets, just update the current market with defaults
                                            return {
                                              ...p,
                                              markets: p.markets.map(m => {
                                                if (m.id === market.id) {
                                                  const updated: Market = {
                                                    ...m,
                                                    adAccountId: value,
                                                    accountName: account?.name || "",
                                                  };
                                                  
                                                  // Apply defaults if available
                                                  if (defaults) {
                                                    console.log("✅ Applying TikTok defaults to current market:", defaults);
                                                    
                                                    if (defaults.pixelId) {
                                                      updated.tiktokPixel = defaults.pixelId;
                                                      console.log("  ✓ Set tiktokPixel:", defaults.pixelId);
                                                    }
                                                    if (defaults.identityId) {
                                                      updated.tiktokIdentity = defaults.identityId;
                                                      console.log("  ✓ Set tiktokIdentity:", defaults.identityId);
                                                    }
                                                    if (defaults.catalogId) {
                                                      updated.tiktokCatalog = defaults.catalogId;
                                                      console.log("  ✓ Set tiktokCatalog:", defaults.catalogId);
                                                    }
                                                    if (defaults.productSetId) {
                                                      updated.tiktokProductSet = defaults.productSetId;
                                                      console.log("  ✓ Set tiktokProductSet:", defaults.productSetId);
                                                    }
                    if (defaults.optimizationEvent) {
                      updated.tiktokOptimizationEvent = defaults.optimizationEvent;
                      console.log("  ✓ Set tiktokOptimizationEvent:", defaults.optimizationEvent);
                    }
                    if (defaults.landingPageUrl) {
                      updated.tiktokLandingPageUrl = defaults.landingPageUrl;
                      console.log("  ✓ Set tiktokLandingPageUrl:", defaults.landingPageUrl);
                    }
                                                     if (defaults.bidStrategy) {
                                                       updated.tiktokBidStrategy = defaults.bidStrategy;
                                                       console.log("  ✓ Set tiktokBidStrategy:", defaults.bidStrategy);
                                                     }
                                                     if (defaults.bidAmount) {
                                                       updated.tiktokBidAmount = defaults.bidAmount;
                                                       console.log("  ✓ Set tiktokBidAmount:", defaults.bidAmount);
                                                     }
                                                     // New TikTok matrix fields
                                                     if (defaults.optimizationLocation) {
                                                       updated.tiktokOptimizationLocation = defaults.optimizationLocation;
                                                       console.log("  ✓ Set tiktokOptimizationLocation:", defaults.optimizationLocation);
                                                     }
                                                     if (defaults.appName) {
                                                       updated.tiktokAppName = defaults.appName;
                                                       console.log("  ✓ Set tiktokAppName:", defaults.appName);
                                                     }
                                                     if (defaults.appId) {
                                                       updated.tiktokAppId = defaults.appId;
                                                       console.log("  ✓ Set tiktokAppId:", defaults.appId);
                                                     }
                                                     if (defaults.clickWindow !== undefined) {
                                                       updated.tiktokClickWindow = defaults.clickWindow;
                                                       console.log("  ✓ Set tiktokClickWindow:", defaults.clickWindow);
                                                     }
                                                     if (defaults.viewWindow !== undefined) {
                                                       updated.tiktokViewWindow = defaults.viewWindow;
                                                       console.log("  ✓ Set tiktokViewWindow:", defaults.viewWindow);
                                                     }
                                                     if (defaults.frequencyEnabled !== undefined) {
                                                       updated.tiktokFrequencyEnabled = defaults.frequencyEnabled;
                                                       console.log("  ✓ Set tiktokFrequencyEnabled:", defaults.frequencyEnabled);
                                                     }
                                                     if (defaults.frequencySchedule) {
                                                       updated.tiktokFrequencySchedule = defaults.frequencySchedule;
                                                       console.log("  ✓ Set tiktokFrequencySchedule:", defaults.frequencySchedule);
                                                     }
                                                     if (defaults.smartPlusEnabled !== undefined) {
                                                       updated.tiktokSmartPlusEnabled = defaults.smartPlusEnabled;
                                                       console.log("  ✓ Set tiktokSmartPlusEnabled:", defaults.smartPlusEnabled);
                                                     }
                                                     if (defaults.placementType) {
                                                       updated.tiktokPlacementType = defaults.placementType;
                                                       console.log("  ✓ Set tiktokPlacementType:", defaults.placementType);
                                                     }
                                                      if (defaults.placements) {
                                                        updated.tiktokPlacements = defaults.placements;
                                                        console.log("  ✓ Set tiktokPlacements:", defaults.placements);
                                                      }
                                                      // TikTok messaging fields
                                                      if (defaults.messagingApp) updated.tiktokMessagingApp = defaults.messagingApp;
                                                      if (defaults.facebookPageId) updated.tiktokFacebookPageId = defaults.facebookPageId;
                                                      if (defaults.messageEventSet) updated.tiktokMessageEventSet = defaults.messageEventSet;
                                                      if (defaults.whatsappNumber) updated.tiktokWhatsappNumber = defaults.whatsappNumber;
                                                      if (defaults.zaloAccountId) updated.tiktokZaloAccountId = defaults.zaloAccountId;
                                                      if (defaults.lineBusinessId) updated.tiktokLineBusinessId = defaults.lineBusinessId;
                                                      // TikTok billing event
                                                      if (defaults.billingEvent) {
                                                        updated.tiktokBillingEvent = defaults.billingEvent;
                                                        console.log("  ✓ Set tiktokBillingEvent:", defaults.billingEvent);
                                                      }
                                                      
                                                      toast.success("Applied default TikTok settings");
                                                   } else {
                                                     console.log("❌ No defaults to apply - configure in Client Defaults");
                                                   }
                                                  
                                                  if (!updated.phases || updated.phases.length === 0) {
                                                    updated.phases = [];
                                                  }
                                                  
                                                  return updated;
                                                }
                                                return m;
                                              }),
                                            };
                                          }
                                        })
                                      );
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingTiktokAdAccounts ? "Loading..." : "Select Advertiser Account"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      {loadingTiktokAdAccounts ? (
                                        <div className="flex items-center justify-center p-4">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                      ) : tiktokAdAccounts.length === 0 ? (
                                        <div className="p-4 text-xs text-muted-foreground text-center">
                                          No TikTok advertiser accounts found. Connect TikTok first.
                                        </div>
                                      ) : (
                                        tiktokAdAccounts.map((account) => (
                                          <SelectItem key={account.id} value={account.id}>
                                            {account.name}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                  {market.adAccountId && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs mt-1"
                                      disabled={syncingAccountId === market.adAccountId}
                                      onClick={() => handleSyncTiktokAccountAssets(market.adAccountId!)}
                                    >
                                      {syncingAccountId === market.adAccountId ? (
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                      ) : (
                                        <RefreshCw className="h-3 w-3 mr-1" />
                                      )}
                                      {syncingAccountId === market.adAccountId ? "Syncing..." : "Sync Assets"}
                                    </Button>
                                  )}
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs">TikTok Pixel</Label>
                                  <Select
                                    value={market.tiktokPixel || NONE_OPTION}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'tiktokPixel', value === NONE_OPTION ? "" : value)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingTiktokPixels ? "Loading..." : "Select Pixel"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      <SelectItem value={NONE_OPTION}>None</SelectItem>
                                      {loadingTiktokPixels ? (
                                        <div className="flex items-center justify-center p-4">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                      ) : tiktokPixels.filter(p => !market.adAccountId || p.advertiserId === market.adAccountId).length === 0 ? (
                                        <div className="p-4 text-xs text-muted-foreground text-center">
                                          {market.adAccountId ? "No pixels found for this advertiser" : "Select an advertiser account first"}
                                        </div>
                                      ) : (
                                        tiktokPixels
                                          .filter(p => !market.adAccountId || p.advertiserId === market.adAccountId)
                                          .map((pixel) => (
                                            <SelectItem key={pixel.id} value={pixel.id}>
                                              {pixel.name}
                                            </SelectItem>
                                          ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs">TikTok Account (Identity)</Label>
                                  <Select
                                    value={market.tiktokIdentity || NONE_OPTION}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'tiktokIdentity', value === NONE_OPTION ? "" : value)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingTiktokIdentities ? "Loading..." : "Select TikTok Account"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      <SelectItem value={NONE_OPTION}>None</SelectItem>
                                      {loadingTiktokIdentities ? (
                                        <div className="flex items-center justify-center p-4">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                      ) : tiktokIdentities.filter(i => !market.adAccountId || i.advertiserId === market.adAccountId).length === 0 ? (
                                        <div className="p-4 text-xs text-muted-foreground text-center">
                                          {market.adAccountId ? "No TikTok accounts found for this advertiser" : "Select an advertiser account first"}
                                        </div>
                                      ) : (
                                        tiktokIdentities
                                          .filter(i => !market.adAccountId || i.advertiserId === market.adAccountId)
                                          .map((identity) => (
                                            <SelectItem key={identity.id} value={identity.id}>
                                              {identity.name}
                                            </SelectItem>
                                          ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs">Catalog</Label>
                                  <Select
                                    value={market.tiktokCatalog || NONE_OPTION}
                                    onValueChange={(value) => {
                                      const nextValue = value === NONE_OPTION ? "" : value;
                                      updateMarketField(platformIndex, market.id, 'tiktokCatalog', nextValue);
                                      if (!nextValue) {
                                        updateMarketField(platformIndex, market.id, 'tiktokProductSet', "");
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingTiktokCatalogs ? "Loading..." : "Select Catalog"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      <SelectItem value={NONE_OPTION}>None</SelectItem>
                                      {loadingTiktokCatalogs ? (
                                        <div className="flex items-center justify-center p-4">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                      ) : tiktokCatalogs.filter(c => !market.adAccountId || c.advertiserId === market.adAccountId).length === 0 ? (
                                        <div className="p-4 text-xs text-muted-foreground text-center">
                                          {market.adAccountId ? "No catalogs found for this advertiser" : "Select an advertiser account first"}
                                        </div>
                                      ) : (
                                        tiktokCatalogs
                                          .filter(c => !market.adAccountId || c.advertiserId === market.adAccountId)
                                          .map((catalog) => (
                                            <SelectItem key={catalog.id} value={catalog.id}>
                                              {catalog.name}
                                            </SelectItem>
                                          ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* TikTok Product Set - Only show when catalog is selected */}
                                {market.tiktokCatalog && (
                                  <div className="space-y-1">
                                    <Label className="text-xs">Product Set</Label>
                                    <Select
                                      value={market.tiktokProductSet || NONE_OPTION}
                                      onValueChange={(value) => updateMarketField(platformIndex, market.id, 'tiktokProductSet', value === NONE_OPTION ? "" : value)}
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue placeholder={loadingTiktokProductSets ? "Loading..." : "Select Product Set"} />
                                      </SelectTrigger>
                                      <SelectContent className="z-50 bg-background">
                                        <SelectItem value={NONE_OPTION}>None</SelectItem>
                                        {loadingTiktokProductSets ? (
                                          <div className="flex items-center justify-center p-4">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          </div>
                                        ) : tiktokProductSets.filter(ps => ps.catalogId === market.tiktokCatalog && (!market.adAccountId || ps.advertiserId === market.adAccountId)).length === 0 ? (
                                          <div className="p-4 text-xs text-muted-foreground text-center">
                                            No product sets found for this catalog
                                          </div>
                                        ) : (
                                          tiktokProductSets
                                            .filter(ps => ps.catalogId === market.tiktokCatalog && (!market.adAccountId || ps.advertiserId === market.adAccountId))
                                            .map((productSet) => (
                                              <SelectItem key={productSet.id} value={productSet.id}>
                                                {productSet.name}
                                              </SelectItem>
                                            ))
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}

                                 <div className="space-y-1">
                                  <Label className="text-xs">Optimization Event</Label>
                                  <Select
                                    value={market.tiktokOptimizationEvent || "ON_WEB_ORDER"}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'tiktokOptimizationEvent', value)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Select Event" />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      <SelectItem value="ON_WEB_ORDER">Purchase</SelectItem>
                                      <SelectItem value="ON_WEB_ADD_TO_CART">Add to Cart</SelectItem>
                                      <SelectItem value="ON_WEB_DETAIL">View Content</SelectItem>
                                      <SelectItem value="ON_WEB_SEARCH">Search</SelectItem>
                                      <SelectItem value="ON_WEB_ADD_TO_WISHLIST">Add to Wishlist</SelectItem>
                                      <SelectItem value="INITIATE_CHECKOUT">Initiate Checkout</SelectItem>
                                      <SelectItem value="ADD_PAYMENT_INFO">Add Payment Info</SelectItem>
                                      <SelectItem value="COMPLETE_PAYMENT">Complete Payment</SelectItem>
                                      <SelectItem value="ON_WEB_REGISTER">Complete Registration</SelectItem>
                                      <SelectItem value="ON_WEB_SUBSCRIBE">Subscribe</SelectItem>
                                      <SelectItem value="FORM">Form Submit</SelectItem>
                                      <SelectItem value="DOWNLOAD_FINISH">Download</SelectItem>
                                      <SelectItem value="PAGE_VIEW">Page View</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                               </div>
                             )}

                              {/* TikTok Bid Strategy */}
                              {platform.name.toLowerCase().includes('tiktok') && (
                                <div className="space-y-1">
                                  <Label className="text-xs">Bid Strategy</Label>
                                  <Select
                                    value={market.tiktokBidStrategy || "LOWEST_COST"}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'tiktokBidStrategy', value)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="LOWEST_COST">Maximum Delivery</SelectItem>
                                      <SelectItem value="COST_CAP">Cost Cap</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-muted-foreground">
                                    Maximum Delivery = no bid needed. Cost Cap = requires bid amount.
                                  </p>
                                </div>
                              )}

                              {/* TikTok Bid Amount - Only show when Cost Cap is selected */}
                              {platform.name.toLowerCase().includes('tiktok') && market.tiktokBidStrategy === "COST_CAP" && (
                                <div className="space-y-1">
                                  <Label className="text-xs">Bid Amount (€) *</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="e.g., 0.50"
                                    value={market.tiktokBidAmount || ""}
                                    onChange={(e) => updateMarketField(platformIndex, market.id, 'tiktokBidAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
                                    className="h-7 text-xs"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Required for Cost Cap. Set your target cost per result.
                                  </p>
                                </div>
                              )}

                            {/* Platform Configuration Fields - Only for Google Ads */}
                            {platform.name.toLowerCase().includes("google") && (
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">
                                    Customer Account <span className="text-destructive">*</span>
                                  </Label>
                                  <Select
                                    value={market.adAccountId || ""}
                                    onValueChange={(value) => {
                                      const account = googleAdAccounts.find(a => a.id === value);
                                      setPlatforms(prev =>
                                        prev.map((p, i) => {
                                          if (i !== platformIndex) return p;
                                          return {
                                            ...p,
                                            markets: p.markets.map(m => {
                                              if (m.id === market.id) {
                                                return {
                                                  ...m,
                                                  adAccountId: value,
                                                  accountName: account?.name || "",
                                                  googleMerchantCenterId: account?.merchantCenterId || "",
                                                  googleFeedLabel: account?.feedLabel || "",
                                                };
                                              }
                                              return m;
                                            }),
                                          };
                                        })
                                      );
                                      // Fetch merchant centers for this account
                                      if (account?.customerId) {
                                        setLoadingGoogleMC(prev => ({ ...prev, [market.id]: true }));
                                        supabase.functions.invoke("fetch-google-merchant-centers", {
                                          body: { customerId: account.customerId },
                                        }).then(({ data, error }) => {
                                          if (!error && data) {
                                            setGoogleMerchantCenters(prev => ({ ...prev, [market.id]: data.merchantCenters || [] }));
                                            setGoogleFeedLabels(prev => ({ ...prev, [market.id]: data.feedLabels || [] }));
                                          }
                                        }).finally(() => {
                                          setLoadingGoogleMC(prev => ({ ...prev, [market.id]: false }));
                                        });
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingGoogleAdAccounts ? "Loading..." : "Select Customer Account"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      {loadingGoogleAdAccounts ? (
                                        <div className="flex items-center justify-center p-4">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                      ) : googleAdAccounts.length === 0 ? (
                                        <div className="p-4 text-xs text-muted-foreground text-center">
                                          No Google Ads accounts found. Connect Google Ads first.
                                        </div>
                                      ) : (
                                        googleAdAccounts.map((account) => (
                                          <SelectItem key={account.id} value={account.id}>
                                            {account.name} ({account.customerId})
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs">Campaign Objective</Label>
                                  <Select
                                    value={market.googleObjective || ""}
                                    onValueChange={(value) => {
                                      // Set the objective
                                      updateMarketField(platformIndex, market.id, 'googleObjective', value);
                                      // Map objective to strategyFocus
                                      const objectiveToFocus: Record<string, string> = {
                                        SALES: "purchase",
                                        LEADS: "leads",
                                        WEBSITE_TRAFFIC: "conversions",
                                        APP_PROMOTION: "app-installs",
                                        AWARENESS_CONSIDERATION: "brand-awareness",
                                        LOCAL_STORE: "conversions",
                                      };
                                      const focus = objectiveToFocus[value] || "conversions";
                                      updateMarketField(platformIndex, market.id, 'strategyFocus', focus);
                                      // Auto-set default bid strategy based on objective
                                      const objectiveToBid: Record<string, string> = {
                                        SALES: "MAXIMIZE_CONVERSIONS",
                                        LEADS: "MAXIMIZE_CONVERSIONS",
                                        WEBSITE_TRAFFIC: "MAXIMIZE_CLICKS",
                                        APP_PROMOTION: "MAXIMIZE_CONVERSIONS",
                                        AWARENESS_CONSIDERATION: "MAXIMIZE_CLICKS",
                                        LOCAL_STORE: "MAXIMIZE_CONVERSIONS",
                                      };
                                      updateMarketField(platformIndex, market.id, 'googleBidStrategy', objectiveToBid[value] || "MAXIMIZE_CONVERSIONS");
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Choose your objective" />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
                                      <SelectItem value="SALES">Sales</SelectItem>
                                      <SelectItem value="LEADS">Leads</SelectItem>
                                      <SelectItem value="WEBSITE_TRAFFIC">Website traffic</SelectItem>
                                      <SelectItem value="APP_PROMOTION">App promotion</SelectItem>
                                      <SelectItem value="AWARENESS_CONSIDERATION">Awareness and consideration</SelectItem>
                                      <SelectItem value="LOCAL_STORE">Local store visits and promotions</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <p className="text-[10px] text-muted-foreground">Select an objective to tailor your experience to the goals and settings that will work best for your campaign</p>
                                </div>

                                {market.googleBidStrategy === "TARGET_CPA" && (
                                  <div className="space-y-1">
                                    <Label className="text-xs">Target CPA ($)</Label>
                                    <Input
                                      className="h-7 text-xs"
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      placeholder="e.g., 10.00"
                                      value={market.googleTargetCpa || ""}
                                      onChange={(e) => updateMarketField(platformIndex, market.id, 'googleTargetCpa', parseFloat(e.target.value) || undefined)}
                                    />
                                  </div>
                                )}

                                {market.googleBidStrategy === "TARGET_ROAS" && (
                                  <div className="space-y-1">
                                    <Label className="text-xs">Target ROAS (%)</Label>
                                    <Input
                                      className="h-7 text-xs"
                                      type="number"
                                      step="1"
                                      min="0"
                                      placeholder="e.g., 200"
                                      value={market.googleTargetRoas || ""}
                                      onChange={(e) => updateMarketField(platformIndex, market.id, 'googleTargetRoas', parseFloat(e.target.value) || undefined)}
                                    />
                                  </div>
                                )}

                                {market.googleBidStrategy === "MANUAL_CPC" && (
                                  <div className="space-y-1">
                                    <Label className="text-xs">Max CPC Bid ($)</Label>
                                    <Input
                                      className="h-7 text-xs"
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      placeholder="e.g., 1.50"
                                      value={market.googleMaxCpcBid || ""}
                                      onChange={(e) => updateMarketField(platformIndex, market.id, 'googleMaxCpcBid', parseFloat(e.target.value) || undefined)}
                                    />
                                  </div>
                                )}

                                <div className="space-y-1 col-span-2">
                                  <Label className="text-xs">Landing Page URL</Label>
                                  <Input
                                    className="h-7 text-xs"
                                    type="url"
                                    placeholder="https://example.com/landing"
                                    value={market.googleLandingPageUrl || ""}
                                    onChange={(e) => updateMarketField(platformIndex, market.id, 'googleLandingPageUrl', e.target.value)}
                                  />
                                </div>

                                {/* Product Feed (Merchant Center) */}
                                <div className="space-y-1">
                                  <Label className="text-xs">Merchant Center ID (Product Feed)</Label>
                                  {loadingGoogleMC[market.id] ? (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground h-7"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</div>
                                  ) : (
                                    <Select
                                      value={market.googleMerchantCenterId || undefined}
                                      onValueChange={(v) => updateMarketField(platformIndex, market.id, 'googleMerchantCenterId', v)}
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue placeholder="Select Merchant Center" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(googleMerchantCenters[market.id] || []).length === 0 ? (
                                          <SelectItem value="none" disabled>No Merchant Centers linked</SelectItem>
                                        ) : (
                                          (googleMerchantCenters[market.id] || []).map((mc) => (
                                            <SelectItem key={mc.id} value={mc.merchantCenterId}>
                                              {mc.merchantCenterName} ({mc.merchantCenterId})
                                            </SelectItem>
                                          ))
                                        )}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs">Feed Label</Label>
                                  <Select
                                    value={market.googleFeedLabel || undefined}
                                    onValueChange={(v) => updateMarketField(platformIndex, market.id, 'googleFeedLabel', v)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Select feed label" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(googleFeedLabels[market.id] || []).length === 0 ? (
                                        <SelectItem value="none" disabled>No feed labels found</SelectItem>
                                      ) : (
                                        (googleFeedLabels[market.id] || []).map((fl) => (
                                          <SelectItem key={fl.label} value={fl.label}>
                                            {fl.label}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )}

                             {/* Ad Formats */}
                             <div className="space-y-1">
                               <Label className="text-xs">Ad Formats</Label>
                               <AdFormatSelector
                                 platformName={platform.name}
                                 selectedFormats={market.adFormats || []}
                                 onFormatsChange={(formats) => updateMarketField(platformIndex, market.id, 'adFormats', formats)}
                               />
                             </div>

                            {/* Market Budget */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Market Budget</span>
                                <Badge variant="outline" className="text-xs">
                                  {market.budgetPercentage.toFixed(1)}% (${marketBudget.toLocaleString()})
                                </Badge>
                              </div>
                              <Slider
                                value={[Math.max(market.budgetPercentage, marketMinPct)]}
                                onValueChange={([value]) => updateMarketBudget(platformIndex, market.id, value)}
                                onValueCommit={([value]) => updateMarketBudget(platformIndex, market.id, value)}
                                min={marketMinPct}
                                max={100}
                                step={ACTIPLAN_BUDGET_SLIDER_STEP}
                                className="w-full"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-muted-foreground">Percentage (%)</Label>
                                  <Input
                                    type="number"
                                    value={market.budgetPercentage.toFixed(1)}
                                    onChange={(e) => updateMarketBudget(platformIndex, market.id, parseFloat(e.target.value) || 0)}
                                    className="h-7 text-xs"
                                    min={marketMinPct}
                                    max="100"
                                    step="0.1"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-muted-foreground">Amount ($)</Label>
                                  <Input
                                    type="number"
                                    value={Math.round(marketBudget)}
                                    onChange={(e) => {
                                      const minEur = Math.round(marketMinEur);
                                      const amount = Math.max(minEur, parseFloat(e.target.value) || 0);
                                      const platformBudget = (totalBudget * platform.budgetPercentage) / 100;
                                      if (platformBudget > 0) {
                                        const percentage = (amount / platformBudget) * 100;
                                        updateMarketBudget(platformIndex, market.id, percentage);
                                      }
                                    }}
                                    className="h-7 text-xs"
                                    min={Math.round(marketMinEur)}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Phase Scheduler - Per Market */}
                            {startDate && endDate && (
                              <div className={`mt-4 pt-4 border-t ${isSampleMode ? "[&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_[role=combobox]]:pointer-events-none [&_[role=slider]]:pointer-events-none [&_[role=checkbox]]:pointer-events-none [&_[role=switch]]:pointer-events-none [&_[role=radio]]:pointer-events-none opacity-95 select-none" : ""}`} aria-disabled={isSampleMode || undefined} title={isSampleMode ? "Read-only in tour mode (expand to view details)" : undefined}>
                              <PhaseScheduler
                                  phases={market.phases || []}
                                  onPhasesChange={(phases) => updateMarketField(platformIndex, market.id, 'phases', phases)}
                                  startDate={startDate}
                                  endDate={endDate}
                                  platformName={platform.name}
                                  platformId={platform.id}
                                  adAccountId={market.adAccountId}
                                  adAccountDefaults={{
                                    hasDefaults: true,
                                    publisherPlatforms: market.metaPublisherPlatforms || market.publisherPlatforms,
                                    positions: market.metaPositions || market.positions,
                                    metaAdvantagePlusPlacements: market.metaAdvantagePlusPlacements,
                                    tiktokPlacementType: market.tiktokPlacementType,
                                    tiktokPlacements: market.tiktokPlacements,
                                    // Meta destination defaults
                                    metaOptimizationLocation: (market as any).metaOptimizationLocation,
                                    metaAppStore: (market as any).metaAppStore,
                                    metaAppId: (market as any).metaAppId,
                                    metaMessagingMode: (market as any).metaMessagingMode,
                                    metaMessengerEnabled: (market as any).metaMessengerEnabled,
                                    metaInstagramDmEnabled: (market as any).metaInstagramDmEnabled,
                                    metaWhatsappEnabled: (market as any).metaWhatsappEnabled,
                                    metaWhatsappNumber: (market as any).metaWhatsappNumber,
                                    metaPageId: market.pageId,
                                    metaInstagramAccountId: (market as any).metaInstagramAccountId || market.instagramActorId,
                                    metaLandingPageUrl: (market as any).metaLandingPageUrl,
                                    // Meta advanced settings defaults
                                    metaBidStrategy: market.metaBidStrategy,
                                    metaBidAmount: market.metaBidAmount,
                                    metaClickWindow: (market as any).metaClickWindow,
                                    metaViewWindow: (market as any).metaViewWindow,
                                    metaBillingEvent: (market as any).metaBillingEvent,
                                    // Meta Advantage+ Campaign-level defaults
                                    metaAdvantagePlusCampaign: (market as any).metaAdvantagePlusCampaign,
                                    metaAdvantagePlusAudience: (market as any).metaAdvantagePlusAudience,
                                    metaAdvantagePlusCreative: (market as any).metaAdvantagePlusCreative,
                                    metaConversionCount: (market as any).metaConversionCount,
                                    // TikTok destination defaults
                                    tiktokOptimizationLocation: (market as any).tiktokOptimizationLocation,
                                    tiktokAppId: (market as any).tiktokAppId,
                                    tiktokAppName: (market as any).tiktokAppName,
                                    tiktokMessagingApp: (market as any).tiktokMessagingApp,
                                    tiktokFacebookPageId: (market as any).tiktokFacebookPageId,
                                    tiktokMessageEventSet: (market as any).tiktokMessageEventSet,
                                    tiktokWhatsappNumber: (market as any).tiktokWhatsappNumber,
                                    tiktokZaloAccountId: (market as any).tiktokZaloAccountId,
                                    tiktokLineBusinessId: (market as any).tiktokLineBusinessId,
                                    tiktokLandingPageUrl: (market as any).tiktokLandingPageUrl,
                                    // TikTok advanced settings defaults
                                    tiktokBidStrategy: (market as any).tiktokBidStrategy,
                                    tiktokBidAmount: (market as any).tiktokBidAmount,
                                    tiktokClickWindow: (market as any).tiktokClickWindow,
                                    tiktokViewWindow: (market as any).tiktokViewWindow,
                                    tiktokBillingEvent: (market as any).tiktokBillingEvent,
                                    // Google Ads defaults
                                    googleCustomerId: (() => {
                                      const account = googleAdAccounts.find(a => a.id === market.adAccountId);
                                      return account?.customerId;
                                    })(),
                                  }}
                                  marketBudget={marketBudget}
                                />
                              </div>
                            )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}

                      {platform.markets.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Total market allocation: {platform.markets.reduce((sum, m) => sum + m.budgetPercentage, 0).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
        </div>

        {platforms.length > 0 && (
          <div className="pt-4 border-t space-y-2">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Total Platform Budget</span>
              <span className={totalAllocated > 100 ? "text-destructive" : totalAllocated < 100 ? "text-amber-500" : "text-primary"}>
                {totalAllocated.toFixed(1)}%
              </span>
            </div>
            {totalAllocated !== 100 && (
              <p className="text-xs text-muted-foreground">
                {totalAllocated < 100 
                  ? `${(100 - totalAllocated).toFixed(1)}% unallocated`
                  : `${(totalAllocated - 100).toFixed(1)}% over budget`
                }
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}
