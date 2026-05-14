import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PlatformSelector } from "./PlatformSelector";
import { BudgetSummary } from "./BudgetSummary";
import { CampaignMetrics } from "./CampaignMetrics";
import { GenericStrategyConfig, GenericConfig } from "./GenericStrategyConfig";
import { StrategySelector } from "./StrategySelector";
import { PlatformMarketBudgetSelector } from "./PlatformMarketBudgetSelector";
import { HierarchicalTimelineScheduler } from "./HierarchicalTimelineScheduler";
import { GlobalFunnelPhasing } from "./GlobalFunnelPhasing";
import { useSampleMode } from "@/contexts/SampleModeContext";
import { TargetingConfigComponent } from "./TargetingConfig";

import { AudienceCard } from "./AudienceCard";
import { UnifiedTargeting, UnifiedTargetingConfig } from "./UnifiedTargeting";
import { KeywordItem } from "./KeywordTargeting";
import { PhaseAudienceSelector, SelectedAudience } from "./PhaseAudienceSelector";
import { CampaignForecast } from "./CampaignForecast";
import { PhaseScheduler } from "./PhaseScheduler";
import { Step3StrategyNav } from "./Step3StrategyNav";
import { getDefaultPhases, generateAutoDetectPhases } from "@/utils/funnelPhases";
import {
  Calendar,
  Download,
  Rocket,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Trash2,
  Plus,
  Lock,
  Wand2,
  ShieldAlert,
  ChevronsUpDown,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useActiplanTimeTracking } from "@/hooks/useActiplanTimeTracking";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useExtensionModeOptional } from "@/contexts/ExtensionModeContext";
import { TIER_DISPLAY_NAMES } from "@/config/subscriptionTiers";
import { PlatformWithMarkets, FunnelStage } from "@/types/mediaplan";
import { Platform, PlatformConfiguration } from "./PlatformConfiguration";
import { determineStrategyFocus } from "@/utils/strategyFocusMapping";
import { Badge } from "@/components/ui/badge";
import { PlatformSelectionDialog } from "./PlatformSelectionDialog";
import { MarketSelectionDialog } from "./MarketSelectionDialog";
import { MARKET_OPTIONS } from "@/utils/markets";
import { CampaignBudgetTypeDialog } from "./CampaignBudgetTypeDialog";
import BulkBudgetTypeDialog from "./BulkBudgetTypeDialog";
import { normalizeLanguageValues } from "@/utils/targetingOptions";
import { translateObjective, translateGoogleCampaignType } from "@/utils/crossPlatformObjectiveMapping";
import { translateAdFormats } from "@/utils/adFormats";
import { CreativeMatchingDialog } from "@/components/creative/CreativeMatchingDialog";

// Helper: map internal focus to funnel template key
const mapFocusToTemplate = (focus?: string): string | undefined => {
  switch (focus) {
    case "purchase":
      return "Purchases";
    case "leads":
      return "Leads";
    case "app-installs":
      return "In-App Actions";
    case "conversions":
      return "Conversions";
    case "brand-awareness":
      return "Awareness";
    default:
      return undefined;
  }
};

export function MediaPlanEditor() {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { hasAccess, getRequiredTierForFeature } = useFeatureAccess();
  const { isSampleMode } = useSampleMode();
  const extensionMode = useExtensionModeOptional();
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clients, setClients] = useState<Array<{
    id: string;
    name: string;
    industry?: string;
    client_logo_url?: string | null;
    agency_logo_url?: string | null;
    brand_font_color?: string | null;
    brand_background_color?: string | null;
    brand_foreground_color?: string | null;
  }>>([]);
  const [campaignName, setCampaignName] = useState<string>("");
  const [boNumber, setBoNumber] = useState<string>("");
  const [totalBudget, setTotalBudget] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const lastCampaignIdRef = useRef<string | null>(null);
  // Track whether client selection was an explicit user action (not hydration)
  const clientSelectionIsUserAction = useRef<boolean>(false);
  // Mutex to prevent concurrent draft creation (race condition fix)
  const draftCreationInProgressRef = useRef<boolean>(false);
  const [genericConfig, setGenericConfig] = useState<GenericConfig>({
    strategy: "manual",
    strategyFocus: "auto",
    targeting: {
      adFormats: [],
      ageMin: undefined,
      ageMax: undefined,
      genders: [],
      devices: [],
      targetingExpansion: false,
      os: [],
      language: "",
      interests: "",
      websiteAudience: "",
      keywordList: "",
      customerList: "",
      lookalikeAudience: "",
    },
  });
  const [platformsWithMarkets, setPlatformsWithMarkets] = useState<PlatformWithMarkets[]>([]);
  const [globalFunnel, setGlobalFunnel] = useState<FunnelStage[]>([]);

  // Guard: skip the next generic→market phase sync (prevents circular clobber of budgetType, etc.)
  const skipPhaseSyncRef = useRef(false);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({});
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({});
  const [phaseExpandSignal, setPhaseExpandSignal] = useState<{ action: 'expand' | 'collapse'; target?: string; counter: number }>({ action: 'expand', counter: 0 });
  const [bulkBudgetDialogOpen, setBulkBudgetDialogOpen] = useState(false);
  const [bulkPlatform, setBulkPlatform] = useState<PlatformWithMarkets | null>(null);
  const [creativeMatcherOpen, setCreativeMatcherOpen] = useState(false);
  const [teamName, setTeamName] = useState<string>("");

  // Time tracking for operations reports (hidden from user)
  useActiplanTimeTracking({
    campaignId: savedCampaignId,
    enabled: !!savedCampaignId && !!user?.id,
  });

  // Taxonomy validation state - track per market
  const [taxonomyValidation, setTaxonomyValidation] = useState<
    Record<string, { isComplete: boolean; missingCount: number }>
  >({});

  // Helper to update taxonomy validation for a specific market
  const handleMarketTaxonomyValidation = (marketId: string, isComplete: boolean, missingCount: number) => {
    setTaxonomyValidation((prev) => ({
      ...prev,
      [marketId]: { isComplete, missingCount },
    }));
  };

  // Check if all taxonomy fields are complete across all markets
  const isTaxonomyComplete = () => {
    // If no validation data, assume complete (no templates configured)
    if (Object.keys(taxonomyValidation).length === 0) return true;
    return Object.values(taxonomyValidation).every((v) => v.isComplete);
  };

  const getTotalMissingTaxonomyFields = () => {
    return Object.values(taxonomyValidation).reduce((sum, v) => sum + v.missingCount, 0);
  };

  // Load team name: prefer active workspace team (unique id); else oldest team this user owns.
  // Use .limit(1) + array rows (never .single/.maybeSingle) so PostgREST never requests a single
  // object for owner_id filters — multiple teams per owner would otherwise return 406 / PGRST116.
  useEffect(() => {
    if (!user?.id) return;

    const loadTeamName = async () => {
      try {
        if (activeWorkspaceId) {
          const { data: rows, error } = await supabase
            .from("teams")
            .select("name")
            .eq("id", activeWorkspaceId)
            .limit(1);
          if (error) {
            console.warn("loadTeamName (active workspace):", error.message);
          } else if (rows?.[0]?.name) {
            setTeamName(rows[0].name);
            return;
          }
        }

        const { data: ownedRows, error } = await supabase
          .from("teams")
          .select("name")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1);

        if (error) {
          console.warn("loadTeamName (owned team):", error.message);
          return;
        }
        if (ownedRows?.[0]?.name) setTeamName(ownedRows[0].name);
      } catch (e) {
        console.warn("loadTeamName:", e);
      }
    };

    void loadTeamName();
  }, [user?.id, activeWorkspaceId]);

  // Load clients for selection
  useEffect(() => {
    if (user) {
      const loadClients = async () => {
        const { data } = await supabase
          .from("clients")
          .select(
            "id, name, industry, platforms, markets, default_age_min, default_age_max, default_gender, default_devices, default_languages, client_logo_url, agency_logo_url, brand_font_color, brand_background_color, brand_foreground_color",
          )
          .order("name");
        setClients(data || []);
      };
      loadClients();
    }
  }, [user]);

  // Auto-populate when client is selected (and required fields are filled)
  useEffect(() => {
    console.log("🔍 Client selection effect triggered", {
      selectedClientId,
      hasBudget: !!totalBudget,
      hasStartDate: !!startDate,
      hasEndDate: !!endDate,
      isHydrated,
    });

    if (selectedClientId && totalBudget && startDate && endDate && isHydrated && clientSelectionIsUserAction.current) {
      console.log("✅ All conditions met, auto-populating from client...");
      autoPopulateFromClient();
      clientSelectionIsUserAction.current = false;
    } else if (selectedClientId && clientSelectionIsUserAction.current && (!totalBudget || !startDate || !endDate)) {
      console.log("⚠️ Client selected but missing required fields");
      toast.error("Please fill in budget, start date, and end date first");
    }
  }, [selectedClientId, totalBudget, startDate, endDate, isHydrated]);

  const autoPopulateFromClient = async () => {
    const selectedClient = clients.find((c) => c.id === selectedClientId) as any;
    if (!selectedClient) return;

    console.log("🔄 Auto-populating from client:", selectedClient);

    const clientPlatforms = Array.isArray(selectedClient.platforms) ? selectedClient.platforms : [];
    const clientMarkets = Array.isArray(selectedClient.markets) ? selectedClient.markets : [];

    console.log("Client platforms:", clientPlatforms);
    console.log("Client markets:", clientMarkets);

    // Auto-populate basicTargeting from client's cross-platform defaults
    // Normalize language values to handle legacy numeric IDs
    const normalizedLanguages = Array.isArray(selectedClient.default_languages)
      ? normalizeLanguageValues(selectedClient.default_languages)
      : [];

    const clientTargetingDefaults: UnifiedTargetingConfig = {
      ageMin: selectedClient.default_age_min ?? 18,
      ageMax: selectedClient.default_age_max ?? 65,
      genders: selectedClient.default_gender ? [selectedClient.default_gender] : ["all"],
      devices: Array.isArray(selectedClient.default_devices) ? selectedClient.default_devices : [],
      languages: normalizedLanguages,
      os: [],
      selectedItems: basicTargeting.selectedItems || [], // Preserve any existing selected items
    };

    console.log("🎯 Setting basicTargeting from client defaults:", clientTargetingDefaults);
    setBasicTargeting(clientTargetingDefaults);
    localStorage.setItem("basicTargeting", JSON.stringify(clientTargetingDefaults));

    // Platform name normalization mapping
    const platformMapping: Record<string, string> = {
      meta: "meta",
      facebook: "meta",
      "google ads": "google",
      google: "google",
      linkedin: "linkedin",
      tiktok: "tiktok",
      x: "x",
      twitter: "x",
      snapchat: "snapchat",
      pinterest: "pinterest",
    };

    // Predefined budget allocation percentages
    const budgetAllocations: Record<string, number> = {
      meta: 30,
      tiktok: 10,
      google: 25,
      linkedin: 10,
      x: 10,
      snapchat: 10,
      pinterest: 5,
    };

    // Normalize and map platform names
    const selectedPlatformIds = clientPlatforms
      .map((p: string) => platformMapping[p.toLowerCase()] || p.toLowerCase())
      .filter((id: string) => budgetAllocations[id] !== undefined);

    console.log("Selected platform IDs:", selectedPlatformIds);

    if (selectedPlatformIds.length === 0) {
      toast.error("No valid platforms found for this client");
      return;
    }

    // Fetch all ad accounts linked to this client for Meta, TikTok, and Google Ads
    const [metaAccountsResult, tiktokAccountsResult, googleAccountsResult] = await Promise.all([
      supabase.from("meta_ad_accounts").select("*").eq("client_id", selectedClientId),
      supabase.from("tiktok_ad_accounts").select("*").eq("client_id", selectedClientId),
      supabase.from("google_ad_accounts").select("*").eq("client_id", selectedClientId),
    ]);

    const metaAdAccounts = metaAccountsResult.data || [];
    const tiktokAdAccounts = tiktokAccountsResult.data || [];
    const googleAdAccounts = googleAccountsResult.data || [];

    console.log("📦 Meta ad accounts for client:", metaAdAccounts);
    console.log("📦 TikTok ad accounts for client:", tiktokAdAccounts);

    // Calculate total percentage for selected platforms
    const totalSelectedPercentage = selectedPlatformIds.reduce((sum: number, platformId: string) => {
      return sum + (budgetAllocations[platformId] || 0);
    }, 0);

    // Create platforms with proportional budgets and auto-populated markets from ad accounts
    const newPlatforms: PlatformWithMarkets[] = selectedPlatformIds.map((platformId: string) => {
      const platformName =
        platformId === "meta"
          ? "Meta"
          : platformId === "google"
            ? "Google Ads"
            : platformId.charAt(0).toUpperCase() + platformId.slice(1);
      const rawPercentage = budgetAllocations[platformId] || 0;
      const normalizedPercentage = totalSelectedPercentage > 0 ? (rawPercentage / totalSelectedPercentage) * 100 : 0;

      // Build markets from linked ad accounts
      let markets: any[] = [];

      if (platformId === "meta" && metaAdAccounts.length > 0) {
        // Create markets from all Meta ad accounts with main_markets
        metaAdAccounts.forEach((acc: any) => {
          const accountMarkets = Array.isArray(acc.main_markets) ? acc.main_markets : [];
          if (accountMarkets.length > 0) {
            accountMarkets.forEach((marketCode: string, idx: number) => {
              markets.push({
                id: `${marketCode}-${acc.account_id}-${Date.now()}-${idx}`,
                name: marketCode,
                budgetPercentage: 0, // Will be normalized later
                adAccountId: acc.account_id,
                accountName: acc.account_name,
                pixel: acc.default_pixel_id || "",
                pageId: acc.default_page_id || "",
                page: acc.default_page_id || "",
                instagramActorId: acc.default_instagram_account_id || "",
                catalog: acc.default_catalog_id || "",
                productSet: acc.default_product_set_id || "",
                conversionEvent: acc.default_conversion_event || "",
                metaBidStrategy: acc.default_bid_strategy || "LOWEST_COST_WITHOUT_CAP",
                metaBidAmount: acc.default_bid_amount || undefined,
                phases: [],
                adFormats: [],
                countries: [marketCode],
                ageMin: selectedClient.default_age_min ?? 18,
                ageMax: selectedClient.default_age_max ?? 65,
                gender: selectedClient.default_gender || "all",
                languages: Array.isArray(selectedClient.default_languages) ? selectedClient.default_languages : [],
                metaPublisherPlatforms: Array.isArray(acc.default_publisher_platforms)
                  ? acc.default_publisher_platforms
                  : ["facebook", "instagram", "audience_network"],
                metaPositions: acc.default_positions || {},
                publisherPlatforms: Array.isArray(acc.default_publisher_platforms)
                  ? acc.default_publisher_platforms
                  : ["facebook", "instagram", "audience_network"],
                positions: acc.default_positions || {},
                detailedTargeting: [],
                isCBOEnabled: false,
                isLifetimeBudget: false,
                metaOptimizationLocation: acc.default_optimization_location || "",
                metaAppStore: acc.default_app_store || "",
                metaAppId: acc.default_app_id || "",
                metaLandingPageUrl: acc.default_landing_page_url || "",
                metaMessagingMode: acc.default_messaging_mode || "AUTOMATIC",
                metaMessengerEnabled: acc.default_messenger_enabled || false,
                metaInstagramDmEnabled: acc.default_instagram_dm_enabled || false,
                metaWhatsappEnabled: acc.default_whatsapp_enabled || false,
                metaWhatsappNumber: acc.default_whatsapp_number || "",
                metaBillingEvent: acc.default_billing_event || "IMPRESSIONS",
                metaClickWindow: acc.default_click_window || 7,
                metaViewWindow: acc.default_view_window || 1,
                metaAdvantagePlusPlacements: acc.default_advantage_plus_placements ?? true,
              });
            });
          }
        });
      } else if (platformId === "tiktok" && tiktokAdAccounts.length > 0) {
        // Create markets from all TikTok ad accounts with main_markets
        tiktokAdAccounts.forEach((acc: any) => {
          const accountMarkets = Array.isArray(acc.main_markets) ? acc.main_markets : [];
          if (accountMarkets.length > 0) {
            accountMarkets.forEach((marketCode: string, idx: number) => {
              markets.push({
                id: `${marketCode}-${acc.advertiser_id}-${Date.now()}-${idx}`,
                name: marketCode,
                budgetPercentage: 0, // Will be normalized later
                adAccountId: acc.advertiser_id,
                accountName: acc.account_name,
                tiktokPixelId: acc.default_pixel_id || "",
                tiktokIdentityId: acc.default_identity_id || "",
                tiktokCatalogId: acc.default_catalog_id || "",
                tiktokProductSetId: acc.default_product_set_id || "",
                tiktokOptimizationEvent: acc.default_optimization_event || "",
                tiktokOptimizationLocation: acc.default_optimization_location || "",
                tiktokBidStrategy: acc.default_bid_strategy || "BID_TYPE_NO_BID",
                tiktokBidAmount: acc.default_bid_amount || undefined,
                tiktokLandingPageUrl: acc.default_landing_page_url || "",
                tiktokPlacementType: acc.default_placement_type || "PLACEMENT_TYPE_AUTOMATIC",
                tiktokPlacements: Array.isArray(acc.default_placements) ? acc.default_placements : ["PLACEMENT_TIKTOK"],
                tiktokAppId: acc.default_app_id || "",
                tiktokAppName: acc.default_app_name || "",
                tiktokClickWindow: acc.default_click_window || 7,
                tiktokViewWindow: acc.default_view_window || 1,
                tiktokEventCountEnabled: acc.default_event_count_enabled || false,
                phases: [],
                adFormats: [],
                countries: [marketCode],
                ageMin: selectedClient.default_age_min ?? 18,
                ageMax: selectedClient.default_age_max ?? 65,
                gender: selectedClient.default_gender || "all",
                languages: Array.isArray(selectedClient.default_languages) ? selectedClient.default_languages : [],
                publisherPlatforms: ["tiktok"],
                positions: {},
                detailedTargeting: [],
                isCBOEnabled: false,
                isLifetimeBudget: false,
              });
            });
          }
        });
      } else if (platformId === "google" && googleAdAccounts.length > 0) {
        // Create markets from all Google Ads accounts with main_markets
        googleAdAccounts.forEach((acc: any) => {
          const accountMarkets = Array.isArray(acc.main_markets) ? acc.main_markets : [];
          if (accountMarkets.length > 0) {
            accountMarkets.forEach((marketCode: string, idx: number) => {
              markets.push({
                id: `${marketCode}-${acc.customer_id}-${Date.now()}-${idx}`,
                name: marketCode,
                budgetPercentage: 0,
                adAccountId: acc.customer_id,
                accountName: acc.account_name,
                googleLandingPageUrl: acc.default_landing_page_url || "",
                googleBidStrategy: acc.default_bid_strategy || "",
                googleTargetCpa: acc.default_target_cpa || undefined,
                googleTargetRoas: acc.default_target_roas || undefined,
                googleMaxCpcBid: acc.default_max_cpc_bid || undefined,
                phases: [],
                adFormats: [],
                countries: [marketCode],
                ageMin: selectedClient.default_age_min ?? 18,
                ageMax: selectedClient.default_age_max ?? 65,
                gender: selectedClient.default_gender || "all",
                languages: Array.isArray(selectedClient.default_languages) ? selectedClient.default_languages : [],
                publisherPlatforms: ["google"],
                positions: {},
                detailedTargeting: [],
                isCBOEnabled: false,
                isLifetimeBudget: false,
              });
            });
          }
        });
      }

      // If no markets were created from ad accounts, create a fallback temporary market
      if (markets.length === 0) {
        markets = [
          {
            id: `temp-market-${platformId}-${Date.now()}`,
            name: clientMarkets[0] || "US",
            budgetPercentage: 100,
            adAccountId: "",
            accountName: "",
            pixel: "",
            pageId: "",
            page: "",
            instagramActorId: "",
            catalog: "",
            productSet: "",
            conversionEvent: "",
            phases: [],
            adFormats: [],
            countries: platformId === "tiktok" ? clientMarkets.filter((m: string) => m !== "US") : clientMarkets,
            ageMin: selectedClient.default_age_min ?? 18,
            ageMax: selectedClient.default_age_max ?? 65,
            gender: selectedClient.default_gender || "all",
            languages: Array.isArray(selectedClient.default_languages) ? selectedClient.default_languages : [],
            publisherPlatforms: platformId === "tiktok" ? ["tiktok"] : ["facebook"],
            positions: {},
            detailedTargeting: [],
            isCBOEnabled: false,
            isLifetimeBudget: false,
          },
        ];
      } else {
        // Normalize budget percentages across all markets for this platform
        const budgetPerMarket = 100 / markets.length;
        markets = markets.map((m) => ({ ...m, budgetPercentage: Math.round(budgetPerMarket * 10) / 10 }));
      }

      return {
        id: platformId,
        name: platformName,
        budgetPercentage: Math.round(normalizedPercentage * 10) / 10,
        enabled: true,
        markets,
      };
    });

    console.log("Created platforms with auto-populated markets:", newPlatforms);

    // Count total markets created from ad accounts
    const totalAutoMarkets = newPlatforms.reduce((sum, p) => {
      const autoMarkets = p.markets.filter((m) => m.adAccountId && m.adAccountId !== "");
      return sum + autoMarkets.length;
    }, 0);

    setPlatformsWithMarkets(newPlatforms);

    if (totalAutoMarkets > 0) {
      toast.success(
        `Auto-populated ${newPlatforms.length} platform(s) with ${totalAutoMarkets} market(s) from linked ad accounts.`,
        { duration: 5000 },
      );
    } else {
      toast.success(
        `Auto-populated ${newPlatforms.length} platform(s) from ${selectedClient.name}. Select an ad account for each platform to auto-create markets.`,
        { duration: 5000 },
      );
    }
  };

  // Unified targeting (Step 2)
  const [basicTargeting, setBasicTargeting] = useState<UnifiedTargetingConfig>({ selectedItems: [] });
  const [targetingPreset, setTargetingPreset] = useState<UnifiedTargetingConfig | null>(null);

  // Phase audiences (Step 3.5 - after strategy config)
  const [phaseAudiences, setPhaseAudiences] = useState<Record<string, SelectedAudience[]>>({});
  const [firstAdAccountId, setFirstAdAccountId] = useState<string | null>(null);
  const [firstTiktokAdvertiserId, setFirstTiktokAdvertiserId] = useState<string | null>(null);
  const [firstGoogleCustomerId, setFirstGoogleCustomerId] = useState<string | null>(null);

  // Update ad account IDs based on selected platforms
  // Derive the account IDs via useMemo instead of useEffect to avoid re-render loops
  const derivedMetaAccountId = useMemo(() => {
    return (
      platformsWithMarkets.find((p) => p.id === "meta" || p.name.toLowerCase() === "meta")?.markets[0]?.adAccountId ??
      null
    );
  }, [platformsWithMarkets]);

  const derivedTiktokAccountId = useMemo(() => {
    return (
      platformsWithMarkets.find((p) => p.id === "tiktok" || p.name.toLowerCase() === "tiktok")?.markets[0]
        ?.adAccountId ?? null
    );
  }, [platformsWithMarkets]);

  const derivedGoogleAccountId = useMemo(() => {
    return (
      platformsWithMarkets.find((p) => p.id === "google_ads" || p.name.toLowerCase().includes("google"))?.markets[0]
        ?.adAccountId ?? null
    );
  }, [platformsWithMarkets]);

  const keywordSearchScope = useMemo(() => {
    const googleSearchMarketMap = new Map<string, string>();
    const tiktokSearchMarketMap = new Map<string, string>();
    const googleFallbackMarketMap = new Map<string, string>();
    const tiktokFallbackMarketMap = new Map<string, string>();
    let scopedGoogleCustomerId: string | undefined;
    let scopedTiktokAdvertiserId: string | undefined;
    let fallbackGoogleCustomerId: string | undefined;
    let fallbackTiktokAdvertiserId: string | undefined;

    const toMarketInfo = (marketMap: Map<string, string>) =>
      Array.from(marketMap.entries()).map(([code, name]) => ({ name: code, label: name }));

    platformsWithMarkets
      .filter((platform) => platform.enabled)
      .forEach((platform) => {
        const platformName = platform.name.toLowerCase();
        const isGoogle = platform.id === "google_ads" || platform.id === "google" || platformName.includes("google");
        const isTikTok = platform.id === "tiktok" || platformName.includes("tiktok");

        if (!isGoogle && !isTikTok) return;

        platform.markets.forEach((market) => {
          const marketCode = (market.name || "").substring(0, 2).toUpperCase();
          if (!marketCode) return;

          if (isGoogle) {
            googleFallbackMarketMap.set(marketCode, market.name);
            fallbackGoogleCustomerId ||= market.adAccountId || firstGoogleCustomerId || undefined;
          }

          if (isTikTok) {
            tiktokFallbackMarketMap.set(marketCode, market.name);
            fallbackTiktokAdvertiserId ||= market.adAccountId || firstTiktokAdvertiserId || undefined;
          }

          const phases = Array.isArray(market.phases) ? market.phases : [];
          const hasSearchCampaign = phases.some((phase: any) =>
            isGoogle ? phase?.googleCampaignType === "Search" : phase?.tiktokCampaignType === "Search"
          );

          if (!hasSearchCampaign) return;

          if (isGoogle) {
            googleSearchMarketMap.set(marketCode, market.name);
            scopedGoogleCustomerId ||= market.adAccountId || fallbackGoogleCustomerId || firstGoogleCustomerId || undefined;
          }

          if (isTikTok) {
            tiktokSearchMarketMap.set(marketCode, market.name);
            scopedTiktokAdvertiserId ||= market.adAccountId || fallbackTiktokAdvertiserId || firstTiktokAdvertiserId || undefined;
          }
        });
      });

    const effectiveGoogleMarketMap = googleSearchMarketMap.size > 0 ? googleSearchMarketMap : googleFallbackMarketMap;
    const effectiveTikTokMarketMap = tiktokSearchMarketMap.size > 0 ? tiktokSearchMarketMap : tiktokFallbackMarketMap;

    return {
      googleCustomerId: effectiveGoogleMarketMap.size > 0 ? (scopedGoogleCustomerId || fallbackGoogleCustomerId || firstGoogleCustomerId || undefined) : undefined,
      tiktokAdvertiserId: effectiveTikTokMarketMap.size > 0 ? (scopedTiktokAdvertiserId || fallbackTiktokAdvertiserId || firstTiktokAdvertiserId || undefined) : undefined,
      googleMarkets: toMarketInfo(effectiveGoogleMarketMap),
      tiktokMarkets: toMarketInfo(effectiveTikTokMarketMap),
      markets: toMarketInfo(new Map([...effectiveGoogleMarketMap.entries(), ...effectiveTikTokMarketMap.entries()])),
    };
  }, [platformsWithMarkets, firstGoogleCustomerId, firstTiktokAdvertiserId]);

  // Sync derived values to state only when they provide a non-null value
  // (don't override DB-fetched values with null derived values)
  useEffect(() => {
    if (derivedMetaAccountId && derivedMetaAccountId !== firstAdAccountId) {
      setFirstAdAccountId(derivedMetaAccountId);
    }
  }, [derivedMetaAccountId]);

  useEffect(() => {
    if (derivedTiktokAccountId && derivedTiktokAccountId !== firstTiktokAdvertiserId) {
      setFirstTiktokAdvertiserId(derivedTiktokAccountId);
    }
  }, [derivedTiktokAccountId]);

  useEffect(() => {
    if (derivedGoogleAccountId && derivedGoogleAccountId !== firstGoogleCustomerId) {
      setFirstGoogleCustomerId(derivedGoogleAccountId);
    }
  }, [derivedGoogleAccountId]);

  // Dialog states
  const [platformDialogOpen, setPlatformDialogOpen] = useState(false);
  const [marketDialogOpen, setMarketDialogOpen] = useState(false);
  const [pendingDuplication, setPendingDuplication] = useState<{
    type: "platform" | "market";
    platformId?: string;
    marketId?: string;
  } | null>(null);
  const [budgetTypeDialogOpen, setBudgetTypeDialogOpen] = useState(false);
  const [selectedMarketForBudget, setSelectedMarketForBudget] = useState<{
    platformId: string;
    marketId: string;
    phases: any[];
    marketBudget: number;
  } | null>(null);

  // Resolve effective strategy focus at render-time (never "auto")
  const effectiveStrategyFocus = useMemo(() => {
    if (genericConfig.strategy !== "auto-detect") {
      return genericConfig.strategyFocus && genericConfig.strategyFocus !== "auto"
        ? genericConfig.strategyFocus
        : "conversions";
    }
    const hasPixel = platformsWithMarkets.some((p) => p.markets.some((m) => m.pixel));
    const hasCatalog = platformsWithMarkets.some((p) => p.markets.some((m) => m.catalog));
    const marketAdFormats = platformsWithMarkets.flatMap((p) => p.markets.flatMap((m) => (m as any).adFormats || []));
    const adFormats = Array.from(new Set([...(genericConfig.targeting?.adFormats || []), ...marketAdFormats]));
    const detected = determineStrategyFocus({ adFormats, hasPixel, hasCatalog });
    return detected || "conversions";
  }, [genericConfig.strategy, genericConfig.strategyFocus, genericConfig.targeting?.adFormats, platformsWithMarkets]);

  const genericConfigResolved: GenericConfig = useMemo(
    () => ({
      ...genericConfig,
      strategyFocus: effectiveStrategyFocus,
    }),
    [genericConfig, effectiveStrategyFocus],
  );

  // Sync genericConfig.phases to market phases when phases change in Step 3
  // This ensures changes made in Strategy Configuration (Step 3) propagate to Platform & Market Selection (Step 1)
  useEffect(() => {
    if (!genericConfig.phases || genericConfig.phases.length === 0) return;

    // Check if any market needs its phases synced from genericConfig
    let needsSync = false;
    platformsWithMarkets.forEach((platform) => {
      platform.markets.forEach((market) => {
        // Only sync if market doesn't have custom strategy or has no phases
        const usesGlobalStrategy = !market.strategy || market.strategy === genericConfig.strategy;
        if (usesGlobalStrategy) {
          // Check if phases are different (by comparing length and names)
          const marketPhaseNames = (market.phases || []).map((p) => p.name).join(",");
          const genericPhaseNames = genericConfig.phases?.map((p) => p.name).join(",") || "";
          if (marketPhaseNames !== genericPhaseNames) {
            needsSync = true;
          }
        }
      });
    });

    if (needsSync) {
      // If a child signaled to skip (e.g. budgetType toggle), abort and reset flag.
      if (skipPhaseSyncRef.current) {
        skipPhaseSyncRef.current = false;
        return;
      }
      console.log("🔄 Syncing genericConfig.phases to market phases");
      setPlatformsWithMarkets((prev) =>
        prev.map((platform) => ({
          ...platform,
          markets: platform.markets.map((market) => {
            const usesGlobalStrategy = !market.strategy || market.strategy === genericConfig.strategy;
            if (usesGlobalStrategy && genericConfig.phases && genericConfig.phases.length > 0) {
              return {
                ...market,
                phases: genericConfig.phases.map((genericPhase) => {
                  const existing = market.phases?.find((mp) => mp.name === genericPhase.name);
                  const hasObjectiveOverride =
                    !!existing && Object.prototype.hasOwnProperty.call(existing, "objective");
                  const hasOptimizationGoalOverride =
                    !!existing && Object.prototype.hasOwnProperty.call(existing, "optimizationGoal");
                  const hasBudgetTypeOverride =
                    !!existing && Object.prototype.hasOwnProperty.call(existing, "budgetType");

                  return {
                    ...genericPhase,
                    // Preserve any market-specific overrides that might exist
                    ...(existing || {}),
                    // Ensure core phase structure comes from genericConfig
                    name: genericPhase.name,
                    startDate: genericPhase.startDate,
                    endDate: genericPhase.endDate,
                    budgetPercentage: genericPhase.budgetPercentage,
                    // Preserve budgetType overrides so the user's selection doesn't revert
                    budgetType: hasBudgetTypeOverride ? (existing as any).budgetType : (genericPhase as any).budgetType,
                    // IMPORTANT: do NOT clobber manual overrides (even if explicitly set to `undefined` for Auto-detect)
                    objective: hasObjectiveOverride ? (existing as any).objective : (genericPhase as any).objective,
                    optimizationGoal: hasOptimizationGoalOverride
                      ? (existing as any).optimizationGoal
                      : (genericPhase as any).optimizationGoal,
                  };
                }),
              };
            }
            return market;
          }),
        })),
      );
    }
  }, [genericConfig.phases, genericConfig.strategy]);

  // Auto-generate phases for markets using auto-detect strategy
  // Uses a fingerprint to avoid re-running on every platformsWithMarkets change (e.g. budget type edits)
  const autoDetectFingerprint = useMemo(() => {
    // Only recompute when strategy-relevant properties change, NOT on every phase/budget change
    return platformsWithMarkets.map((p) =>
      p.markets.map((m) => {
        const strategy = m.strategy || genericConfig.strategy || "auto-detect";
        if (strategy !== "auto-detect") return `${m.id}:skip`;
        const hasPhases = m.phases && m.phases.length > 0;
        return `${m.id}:${strategy}:${m.strategyFocus || ''}:${hasPhases}:${!!m.pixel}:${!!m.catalog}:${((m as any).adFormats || []).join('+')}`;
      }).join('|')
    ).join('||');
  }, [platformsWithMarkets, genericConfig.strategy]);

  useEffect(() => {
    // Don't run if no dates set
    if (!startDate || !endDate) return;

    // Use ref for latest platformsWithMarkets to avoid stale closure
    const currentPlatforms = platformsWithMarkets;

    // Check if any auto-detect market needs phases
    const needsUpdate = currentPlatforms.some((platform) =>
      platform.markets.some((market) => {
        const strategy = market.strategy || genericConfig.strategy || "auto-detect";
        return strategy === "auto-detect" && (!market.phases || market.phases.length === 0);
      }),
    );

    if (!needsUpdate) return;

    // 1) Set global strategy focus when in auto-detect
    if (genericConfig.strategy === "auto-detect") {
      const hasPixel = currentPlatforms.some((p) => p.markets.some((m) => m.pixel));
      const hasCatalog = currentPlatforms.some((p) => p.markets.some((m) => m.catalog));
      const marketAdFormats = currentPlatforms.flatMap((p) => p.markets.flatMap((m) => (m as any).adFormats || []));
      const adFormats = Array.from(new Set([...(genericConfig.targeting?.adFormats || []), ...marketAdFormats]));
      const detected = determineStrategyFocus({ adFormats, hasPixel, hasCatalog }) || "conversions";
      if (genericConfig.strategyFocus !== detected) {
        setGenericConfig((prev) => ({ ...prev, strategyFocus: detected }));
      }
    }

    // 2) Set per-market strategyFocus and phases in auto-detect
    let changed = false;
    const updated = currentPlatforms.map((platform) => ({
      ...platform,
      markets: platform.markets.map((market) => {
        const strategy = market.strategy || genericConfig.strategy || "auto-detect";
        if (strategy !== "auto-detect") return market;

        const marketAdFormats = (market as any).adFormats || [];
        const adFormats = Array.from(new Set([...(genericConfig.targeting?.adFormats || []), ...marketAdFormats]));
        const hasPixel = !!market.pixel;
        const hasCatalog = !!market.catalog;
        const detected = determineStrategyFocus({ adFormats, hasPixel, hasCatalog }) || "conversions";

        const needsFocusUpdate =
          !market.strategyFocus || market.strategyFocus === "auto" || market.strategyFocus !== detected;
        const needsPhases = !market.phases || market.phases.length === 0;

        if (!needsFocusUpdate && !needsPhases) return market;

        changed = true;
        return {
          ...market,
          strategy: "auto-detect", // Explicitly set the strategy
          strategyFocus: detected,
          phases: needsPhases
            ? generateAutoDetectPhases(adFormats, hasPixel, hasCatalog, startDate, endDate, platform.id) || []
            : market.phases,
        };
      }),
    }));

    if (changed) setPlatformsWithMarkets(updated);
  }, [
    autoDetectFingerprint,
    genericConfig.strategyFocus,
    genericConfig.targeting?.adFormats,
    startDate,
    endDate,
  ]);

  // Compute a stable fingerprint of market phase names to avoid re-running reverse sync unnecessarily
  const marketPhasesFingerprint = useMemo(() => {
    for (const platform of platformsWithMarkets) {
      for (const market of platform.markets) {
        const usesGlobalStrategy = !market.strategy || market.strategy === genericConfig.strategy;
        if (usesGlobalStrategy && market.phases && market.phases.length > 0) {
          return market.phases.map((p) => p.name).join(",");
        }
      }
    }
    return "";
  }, [platformsWithMarkets, genericConfig.strategy]);

  // Reverse sync: when market phases change in Step 1, update genericConfig.phases for Step 3
  useEffect(() => {
    if (!marketPhasesFingerprint) return;
    
    const genericPhaseNames = genericConfig.phases?.map((p) => p.name).join(",") || "";
    if (marketPhasesFingerprint === genericPhaseNames) return;

    // Find the actual phases to sync
    for (const platform of platformsWithMarkets) {
      for (const market of platform.markets) {
        const usesGlobalStrategy = !market.strategy || market.strategy === genericConfig.strategy;
        if (usesGlobalStrategy && market.phases && market.phases.length > 0) {
          console.log("🔄 Syncing market phases back to genericConfig.phases");
          setGenericConfig((prev) => ({
            ...prev,
            phases: market.phases,
          }));
          return;
        }
      }
    }
  }, [marketPhasesFingerprint]);

  const hydrateFromCampaign = (c: any) => {
    try {
      setCampaignName(c.name || "");
      setBoNumber(c.bo_number || "");
      setTotalBudget(String(c.total_budget ?? ""));
      setStartDate(c.start_date || "");
      setEndDate(c.end_date || "");

      // Restore selected client ID from generic_config
      if (c.generic_config?.selectedClientId) {
        setSelectedClientId(c.generic_config.selectedClientId);
      }

      // Restore full genericConfig
      if (c.generic_config && typeof c.generic_config === "object") {
        setGenericConfig({
          strategy: c.generic_config.strategy || "auto-detect",
          strategyFocus: c.generic_config.strategyFocus || c.objective || "auto",
          hasPhases: c.generic_config.hasPhases,
          phases: c.generic_config.phases || [],
          campaigns: c.generic_config.campaigns || [],
          targeting: c.generic_config.targeting || {
            adFormats: [],
            ageMin: undefined,
            ageMax: undefined,
            genders: [],
            devices: [],
            targetingExpansion: false,
            os: [],
            language: "",
            interests: "",
            websiteAudience: "",
            keywordList: "",
            customerList: "",
            lookalikeAudience: "",
          },
        });

        // Restore basic targeting if it exists
        if (c.generic_config.basicTargeting) {
          console.log("🔄 Loading basicTargeting from draft:", c.generic_config.basicTargeting);
          setBasicTargeting(c.generic_config.basicTargeting);
        }
      } else {
        setGenericConfig((prev) => ({ ...prev, strategyFocus: c.objective || prev.strategyFocus }));
      }

      // Restore platforms and markets completely from DB
      const alloc = c.budget_allocation || {};
      const splits = c.market_splits || {};
      const declaredPlatforms: any[] = Array.isArray(c.platforms) ? c.platforms : [];

      console.log("🔄 Restoring campaign from DB:", {
        platforms: declaredPlatforms,
        market_splits: splits,
      });

      if (declaredPlatforms.length > 0) {
        const restoredPlatforms = declaredPlatforms.map((dp: any) => {
          // Prefer market_splits if keyed by platform id; otherwise fall back to embedded markets on the platform object (legacy/sample data)
          const splitMarkets = splits[dp.id];
          const markets = Array.isArray(splitMarkets) && splitMarkets.length > 0
            ? splitMarkets
            : (Array.isArray(dp.markets) ? dp.markets : []);
          console.log(
            `  Platform ${dp.id} markets:`,
            markets.map((m: any) => ({
              id: m.id,
              name: m.name,
              adAccountId: m.adAccountId,
              tiktokPixel: m.tiktokPixel,
              tiktokIdentity: m.tiktokIdentity,
              tiktokCatalog: m.tiktokCatalog,
              tiktokProductSet: m.tiktokProductSet,
              tiktokOptimizationEvent: m.tiktokOptimizationEvent,
              tiktokLandingPageUrl: m.tiktokLandingPageUrl,
            })),
          );

          // Filter out US from TikTok market countries
          const filteredMarkets = markets.map((m: any) => {
            if (dp.id === "tiktok" && Array.isArray(m.countries)) {
              return {
                ...m,
                countries: m.countries.filter((c: string) => c !== "US"),
              };
            }
            return m;
          });

          return {
            id: dp.id,
            name: dp.name,
            enabled: true,
            budgetPercentage: alloc[dp.id] ?? 0,
            markets: filteredMarkets,
          };
        });
        setPlatformsWithMarkets(restoredPlatforms);
      }

      setIsHydrated(true);
    } catch (e) {
      console.error("Failed to hydrate draft", e);
      setIsHydrated(true);
    }
  };

  // Detect URL campaign ID changes and reset hydration to reload different campaign
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const urlCampaignId = urlParams.get("campaignId");

    // If URL campaign ID changed, reset state to force re-hydration
    if (urlCampaignId && urlCampaignId !== lastCampaignIdRef.current && isHydrated) {
      console.log("🔄 URL campaign ID changed, resetting for new campaign:", urlCampaignId);
      lastCampaignIdRef.current = urlCampaignId;
      setIsHydrated(false);
      autoFilledPlatforms.current = new Set();
      // Clear form state to prevent stale data
      setCampaignName("");
      setBoNumber("");
      setTotalBudget("");
      setStartDate("");
      setEndDate("");
      setPlatformsWithMarkets([]);
      setSavedCampaignId(null);
      setGenericConfig({
        strategy: "auto-detect",
        strategyFocus: "auto",
        targeting: {
          adFormats: [],
          ageMin: undefined,
          ageMax: undefined,
          genders: [],
          devices: [],
          targetingExpansion: false,
          os: [],
          language: "",
          interests: "",
          websiteAudience: "",
          keywordList: "",
          customerList: "",
          lookalikeAudience: "",
        },
      });
    }
  }, [location.search, isHydrated]);

  // Restore draft by URL param or localStorage (latest draft)
  useEffect(() => {
    const restore = async () => {
      if (!user || isHydrated) return;

      // Check if user explicitly wants a new campaign
      const urlParams = new URLSearchParams(window.location.search);
      const isNewCampaign = urlParams.get("new") === "true";
      const urlCampaignId = urlParams.get("campaignId");

      console.log("MediaPlanEditor restore:", { isNewCampaign, isHydrated, urlCampaignId, url: window.location.href });

      // Track the campaign ID we're loading
      if (urlCampaignId) {
        lastCampaignIdRef.current = urlCampaignId;
      }

      if (isNewCampaign) {
        // Clear the URL param and start fresh
        console.log("Starting fresh campaign - clearing all state");
        window.history.replaceState({}, "", "/");
        localStorage.removeItem("draftCampaignId");
        localStorage.removeItem("basicTargeting");
        setSavedCampaignId(null);
        setIsHydrated(true);
        return;
      }

      // Rehydrate basicTargeting from localStorage first
      const storedTargeting = localStorage.getItem("basicTargeting");
      if (storedTargeting) {
        try {
          const parsed = JSON.parse(storedTargeting);
          // Normalize language values to handle legacy numeric IDs
          if (parsed.languages && Array.isArray(parsed.languages)) {
            parsed.languages = normalizeLanguageValues(parsed.languages);
          }
          console.log("🔄 Rehydrated basicTargeting from localStorage:", parsed);
          setBasicTargeting(parsed);
        } catch (e) {
          console.error("Failed to parse stored targeting:", e);
        }
      }

      let cid = urlParams.get("campaignId") || localStorage.getItem("draftCampaignId") || "";
      console.log("Checking for existing draft:", {
        cid,
        hasUrlParam: !!urlParams.get("campaignId"),
        hasLocalStorage: !!localStorage.getItem("draftCampaignId"),
      });

      if (!cid) {
        const { data } = await supabase
          .from("campaigns")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          cid = (data as any).id;
          console.log("Found latest draft from database:", cid);
        }
      }
      if (cid) {
        const { data: c, error } = await supabase.from("campaigns").select("*").eq("id", cid).single();
        if (!error && c) {
          console.log("Loading draft campaign:", cid);
          setSavedCampaignId((c as any).id);
          localStorage.setItem("draftCampaignId", (c as any).id);
          hydrateFromCampaign(c);

          // Load targeting preset if exists
          const config = (c as any).generic_config;
          if (config?.targetingPreset) {
            console.log("🎯 Loaded targeting preset from database:", config.targetingPreset);
            setTargetingPreset(config.targetingPreset);
          }

          // Load basicTargeting from database if not already loaded from localStorage
          if (config?.basicTargeting && !storedTargeting) {
            const dbTargeting = { ...config.basicTargeting };
            // Normalize language values to handle legacy numeric IDs
            if (dbTargeting.languages && Array.isArray(dbTargeting.languages)) {
              dbTargeting.languages = normalizeLanguageValues(dbTargeting.languages);
            }
            console.log("🔄 Loaded basicTargeting from database:", dbTargeting);
            setBasicTargeting(dbTargeting);
            localStorage.setItem("basicTargeting", JSON.stringify(dbTargeting));
          }
        } else {
          console.log("No draft found, starting fresh");
          setIsHydrated(true);
        }
      } else {
        console.log("No campaign ID found, starting fresh");
        setIsHydrated(true);
      }
    };
    restore();
  }, [user, isHydrated]);

  // Capture extension mode snapshot once campaign is hydrated
  useEffect(() => {
    console.log("🔒 Extension mode check:", {
      isExtensionMode: extensionMode.isExtensionMode,
      isHydrated,
      platformCount: platformsWithMarkets.length,
      hasSnapshot: !!extensionMode.originalSnapshot,
      urlSearch: location.search,
    });

    if (
      extensionMode.isExtensionMode &&
      isHydrated &&
      platformsWithMarkets.length > 0 &&
      !extensionMode.originalSnapshot
    ) {
      console.log("🔒 Triggering snapshot capture...");
      extensionMode.captureSnapshot(platformsWithMarkets);
    }
  }, [
    extensionMode.isExtensionMode,
    isHydrated,
    platformsWithMarkets,
    extensionMode.originalSnapshot,
    extensionMode.captureSnapshot,
    location.search,
  ]);

  // Fetch first ad account ID for audience fetching
  useEffect(() => {
    const fetchAdAccountIds = async () => {
      if (!user) return;

      // Fetch all platform ad accounts in parallel
      const [metaResult, tiktokResult, googleResult] = await Promise.all([
        supabase
          .from("meta_ad_accounts")
          .select("account_id")
          .eq("user_id", user.id)
          .limit(1)
          .single(),
        supabase
          .from("tiktok_ad_accounts")
          .select("advertiser_id")
          .eq("user_id", user.id)
          .limit(1)
          .single(),
        supabase
          .from("google_ad_accounts")
          .select("customer_id")
          .eq("user_id", user.id)
          .limit(1)
          .single(),
      ]);

      if (!metaResult.error && metaResult.data) {
        setFirstAdAccountId(metaResult.data.account_id);
        console.log("✅ Loaded Meta Ad Account ID:", metaResult.data.account_id);
      }

      if (!tiktokResult.error && tiktokResult.data) {
        setFirstTiktokAdvertiserId(tiktokResult.data.advertiser_id);
        console.log("✅ Loaded TikTok Advertiser ID:", tiktokResult.data.advertiser_id);
      }

      if (!googleResult.error && googleResult.data) {
        setFirstGoogleCustomerId(googleResult.data.customer_id);
        console.log("✅ Loaded Google Customer ID:", googleResult.data.customer_id);
      }
    };
    fetchAdAccountIds();
  }, [user]);

  // Auto-fill missing adAccountId on markets after hydration + ad account IDs are loaded
  // Track which platforms have been auto-filled so we re-run when new platform IDs arrive
  const autoFilledPlatforms = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isHydrated) return;
    if (!firstAdAccountId && !firstTiktokAdvertiserId && !firstGoogleCustomerId) return;
    if (platformsWithMarkets.length === 0) return;

    let hasChanges = false;
    const updated = platformsWithMarkets.map((p) => {
      if (!p.enabled) return p;

      const isMeta = p.id === 'meta' || p.name.toLowerCase().includes('meta');
      const isTikTok = p.id === 'tiktok' || p.name.toLowerCase().includes('tiktok');
      const isGoogle = p.id === 'google_ads' || p.id === 'google' || p.name.toLowerCase().includes('google');

      const platformKey = isMeta ? 'meta' : isTikTok ? 'tiktok' : isGoogle ? 'google' : null;
      if (!platformKey || autoFilledPlatforms.current.has(platformKey)) return p;

      const fallbackId = isMeta ? firstAdAccountId : isTikTok ? firstTiktokAdvertiserId : isGoogle ? firstGoogleCustomerId : null;
      if (!fallbackId) return p;

      const needsFill = p.markets.some((m) => !m.adAccountId);
      if (!needsFill) {
        autoFilledPlatforms.current.add(platformKey);
        return p;
      }

      hasChanges = true;
      autoFilledPlatforms.current.add(platformKey);
      return {
        ...p,
        markets: p.markets.map((m) =>
          m.adAccountId ? m : { ...m, adAccountId: fallbackId },
        ),
      };
    });

    if (hasChanges) {
      console.log('🔧 Auto-filled missing adAccountId on markets from linked ad accounts');
      setPlatformsWithMarkets(updated);
    }
  }, [isHydrated, firstAdAccountId, firstTiktokAdvertiserId, firstGoogleCustomerId, platformsWithMarkets]);


  const [platforms, setPlatforms] = useState<Platform[]>([
    { id: "meta", name: "Meta", enabled: false, budgetPercentage: 0 },
    { id: "google", name: "Google Ads", enabled: false, budgetPercentage: 0 },
    { id: "linkedin", name: "LinkedIn", enabled: false, budgetPercentage: 0 },
    { id: "tiktok", name: "TikTok", enabled: false, budgetPercentage: 0 },
    { id: "snapchat", name: "Snapchat", enabled: false, budgetPercentage: 0 },
    { id: "pinterest", name: "Pinterest", enabled: false, budgetPercentage: 0 },
  ]);

  // Auto-update strategy focus based on pixel/catalog/ad formats when using auto-detect strategy
  useEffect(() => {
    // Only auto-detect when strategy is set to "auto-detect"
    if (genericConfig.strategy !== "auto-detect") return;

    const hasPixel = platformsWithMarkets.some((p) => p.markets.some((m) => m.pixel));
    const hasCatalog = platformsWithMarkets.some((p) => p.markets.some((m) => m.catalog));
    const marketAdFormats = platformsWithMarkets.flatMap((p) => p.markets.flatMap((m) => (m as any).adFormats || []));
    const adFormats = Array.from(new Set([...(genericConfig.targeting?.adFormats || []), ...marketAdFormats]));

    const determinedFocus = determineStrategyFocus({
      adFormats,
      hasPixel,
      hasCatalog,
    });

    // Update to detected focus if available and different
    if (determinedFocus && determinedFocus !== genericConfig.strategyFocus) {
      setGenericConfig((prev) => ({ ...prev, strategyFocus: determinedFocus }));
    }
  }, [platformsWithMarkets, genericConfig.targeting?.adFormats, genericConfig.strategy]);

  // Auto-save draft whenever key fields change (including basicTargeting)
  // IMPORTANT: Guard against saving before hydration completes.
  // Otherwise, we can overwrite persisted campaign fields with empty defaults during route changes / reloads.
  useEffect(() => {
    if (!savedCampaignId || !user) return;
    if (!isHydrated) {
      console.log("⏸️ Auto-save skipped (not hydrated yet)");
      return;
    }

    console.log("⏰ Auto-save triggered");

    const timer = setTimeout(async () => {
      try {
        const selectedPlatforms = platformsWithMarkets.filter((p) => p.id !== "");

        // Safety: if the editor state is temporarily empty (e.g. during re-hydration / route changes),
        // do NOT overwrite an existing campaign with empty platforms/market_splits.
        if (selectedPlatforms.length === 0) {
          console.log("⏸️ Auto-save skipped (no selected platforms; avoiding market_splits clobber)");
          return;
        }

        const hasAnyMarkets = selectedPlatforms.some((p) => (p.markets?.length || 0) > 0);
        if (!hasAnyMarkets) {
          console.log("⏸️ Auto-save skipped (no markets; avoiding market_splits clobber)");
          return;
        }

        const budgetAllocation = selectedPlatforms.reduce((acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }), {});

        await supabase
          .from("campaigns")
          .update({
            name: campaignName,
            bo_number: boNumber.trim() || null,
            objective: genericConfig.strategyFocus || "conversions",
            total_budget: parseFloat(totalBudget) || 0,
            start_date: startDate || null,
            end_date: endDate || null,
            platforms: selectedPlatforms.map((p) => ({ id: p.id, name: p.name })),
            budget_allocation: budgetAllocation,
            updated_at: new Date().toISOString(),
            market_splits: platformsWithMarkets.reduce((acc, platform) => {
              console.log(
                `💾 Auto-saving platform ${platform.id}, markets:`,
                platform.markets.map((m) => ({
                  name: m.name,
                  phases: m.phases?.map((p) => ({
                    name: p.name,
                    tiktokFrequencySchedule: p.tiktokFrequencySchedule,
                    tiktokBidStrategy: p.tiktokBidStrategy,
                    tiktokOptimizationLocation: p.tiktokOptimizationLocation,
                  })),
                })),
              );
              return {
                ...acc,
                [platform.id]: platform.markets.map((m) => ({
                  id: m.id,
                  name: m.name,
                  budgetPercentage: m.budgetPercentage,
                  accountName: m.accountName,
                  adAccountId: m.adAccountId,
                  page: m.page,
                  pageId: m.pageId,
                  pixel: m.pixel,
                  catalog: m.catalog,
                  productSet: m.productSet,
                  conversionEvent: m.conversionEvent,
                  adFormats: m.adFormats,
                  phases: m.phases,
                  isCBOEnabled: m.isCBOEnabled,
                  isLifetimeBudget: m.isLifetimeBudget,
                  instagramActorId: m.instagramActorId,
                  strategy: m.strategy,
                  strategyFocus: m.strategyFocus,
                  // TikTok-specific fields
                  tiktokPixel: m.tiktokPixel,
                  tiktokIdentity: m.tiktokIdentity,
                  tiktokCatalog: m.tiktokCatalog,
                  tiktokProductSet: m.tiktokProductSet,
                  tiktokOptimizationEvent: m.tiktokOptimizationEvent,
                  tiktokLandingPageUrl: m.tiktokLandingPageUrl,
                  tiktokBidStrategy: m.tiktokBidStrategy,
                  tiktokBidAmount: m.tiktokBidAmount,
                  // TikTok destination fields
                  tiktokOptimizationLocation: m.tiktokOptimizationLocation,
                  tiktokAppId: m.tiktokAppId,
                  tiktokAppName: m.tiktokAppName,
                  tiktokMessagingApp: (m as any).tiktokMessagingApp,
                  tiktokFacebookPageId: (m as any).tiktokFacebookPageId,
                  tiktokMessageEventSet: (m as any).tiktokMessageEventSet,
                  tiktokWhatsappNumber: (m as any).tiktokWhatsappNumber,
                  tiktokZaloAccountId: (m as any).tiktokZaloAccountId,
                  tiktokLineBusinessId: (m as any).tiktokLineBusinessId,
                  tiktokPlacementType: m.tiktokPlacementType,
                  tiktokPlacements: m.tiktokPlacements,
                  tiktokClickWindow: (m as any).tiktokClickWindow,
                  tiktokViewWindow: (m as any).tiktokViewWindow,
                  // Meta fields
                  metaBidStrategy: m.metaBidStrategy,
                  metaBidAmount: m.metaBidAmount,
                  metaOptimizationLocation: (m as any).metaOptimizationLocation,
                  metaAppStore: (m as any).metaAppStore,
                  metaAppId: (m as any).metaAppId,
                  metaMessagingMode: (m as any).metaMessagingMode,
                  metaMessengerEnabled: (m as any).metaMessengerEnabled,
                  metaInstagramDmEnabled: (m as any).metaInstagramDmEnabled,
                  metaWhatsappEnabled: (m as any).metaWhatsappEnabled,
                  metaWhatsappNumber: (m as any).metaWhatsappNumber,
                  metaLandingPageUrl: (m as any).metaLandingPageUrl,
                  metaPublisherPlatforms: m.metaPublisherPlatforms || m.publisherPlatforms,
                  metaPositions: m.metaPositions || m.positions,
                   // Google Ads fields
                   googleObjective: m.googleObjective,
                   googleLandingPageUrl: m.googleLandingPageUrl,
                   googleBidStrategy: m.googleBidStrategy,
                   googleTargetCpa: m.googleTargetCpa,
                   googleTargetRoas: m.googleTargetRoas,
                   googleMaxCpcBid: m.googleMaxCpcBid,
                })),
              };
            }, {}),
            generic_config: {
              strategy: genericConfig.strategy,
              strategyFocus: genericConfig.strategyFocus,
              hasPhases: genericConfig.hasPhases,
              phases: genericConfig.phases,
              campaigns: genericConfig.campaigns,
              targeting: genericConfig.targeting,
              basicTargeting: basicTargeting, // Include basicTargeting to prevent it from being overwritten
              selectedClientId: selectedClientId,
              clientIndustry: clients.find((c) => c.id === selectedClientId)?.industry,
            } as any,
          })
          .eq("id", savedCampaignId);

        console.log("Auto-saved draft");
      } catch (error) {
        console.error("Error auto-saving:", error);
      }
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timer);
  }, [
    campaignName,
    boNumber,
    totalBudget,
    startDate,
    endDate,
    platformsWithMarkets,
    genericConfig,
    basicTargeting,
    savedCampaignId,
    user,
    isHydrated,
    selectedClientId,
    clients,
  ]);

  const isActivationDetailsComplete = () => {
    const allPlatformsSelected = platformsWithMarkets.every((p) => p.id !== "");
    const allHaveMarkets = platformsWithMarkets.every((p) => p.markets.length > 0);
    return !!(campaignName.trim() && totalBudget && startDate && endDate && allPlatformsSelected && allHaveMarkets);
  };

  const isStrategyComplete = () => {
    return !!(genericConfig.strategy && genericConfig.strategyFocus);
  };

  const isPhaseSchedulerComplete = () => {
    // Always allow proceeding - phasing is optional
    return true;
  };

  const isTargetingComplete = () => {
    return !!(genericConfig.targeting?.ageMin && genericConfig.targeting?.ageMax);
  };

  const handlePlatformToggle = (updatedPlatforms: Platform[]) => {
    // When a platform is enabled, copy generic config to it
    const newPlatforms = updatedPlatforms.map((platform, idx) => {
      const oldPlatform = platforms[idx];
      if (platform.enabled && !oldPlatform.enabled && genericConfig.strategy) {
        // Platform just got enabled, copy generic config
        return {
          ...platform,
          config: {
            ...genericConfig,
            campaigns: genericConfig.campaigns?.map((c) => ({ ...c })),
            phases: genericConfig.phases?.map((p) => ({ ...p })),
          },
        };
      }
      return platform;
    });
    setPlatforms(newPlatforms);
  };

  const isGenericConfigComplete = () => {
    return isStrategyComplete() && isTargetingComplete();
  };

  const isAllPlatformsConfigured = () => {
    const enabledPlatforms = platforms.filter((p) => p.enabled);
    if (enabledPlatforms.length === 0) return false;
    return enabledPlatforms.every((p) => {
      if (!p.config) return false;
      const { strategy, strategyFocus, campaigns } = p.config;
      if (!strategy || !strategyFocus) return false;
      if (!campaigns || campaigns.length === 0) return false;
      return campaigns.every(
        (c) => !!(c.objective && c.campaignType && c.optimizationGoal && c.targeting?.ageMin && c.targeting?.ageMax),
      );
    });
  };

  const handleExport = () => {
    const selectedPlatforms = platformsWithMarkets.filter((p) => p.id !== "");
    const campaignData = {
      name: campaignName,
      objective: genericConfig.strategyFocus,
      totalBudget,
      startDate,
      endDate,
      platforms: selectedPlatforms,
      budgetAllocation: selectedPlatforms.reduce((acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }), {}),
    };

    const blob = new Blob([JSON.stringify(campaignData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-${campaignName || "plan"}.json`;
    a.click();
    toast.success("Media plan exported successfully!");
  };

  const handleLaunch = async () => {
    if (!campaignName.trim()) {
      toast.error("Please enter a campaign name");
      return;
    }

    // Check if BO number is unique within the same workspace
    if (boNumber.trim() && activeWorkspaceId) {
      const { data: existingCampaign } = await supabase
        .from("campaigns")
        .select("id")
        .eq("bo_number", boNumber.trim())
        .eq("team_id", activeWorkspaceId)
        .neq("id", savedCampaignId || "")
        .single();

      if (existingCampaign) {
        toast.error("BO number must be unique within your workspace. This number is already in use.");
        return;
      }
    }

    setSaving(true);
    try {
      // If campaign is already saved, just redirect
      if (savedCampaignId) {
        toast.success("ActiPlan ready!");
        setTimeout(() => {
          window.location.href = "/app/actiplans";
        }, 1000);
        return;
      }

      // Otherwise, save it now
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("User not authenticated");

      const selectedPlatforms = platformsWithMarkets.filter((p) => p.id !== "");
      const budgetAllocation = selectedPlatforms.reduce((acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }), {});

      const { data: campaign, error } = await supabase
        .from("campaigns")
        .insert({
          user_id: user.id,
          team_id: activeWorkspaceId || null,
          name: campaignName,
          bo_number: boNumber.trim(),
          objective: genericConfig.strategyFocus || "conversions",
          total_budget: parseFloat(totalBudget) || 0,
          start_date: startDate || null,
          end_date: endDate || null,
          platforms: selectedPlatforms.map((p) => ({ id: p.id, name: p.name })),
          budget_allocation: budgetAllocation,
          market_splits: platformsWithMarkets.reduce(
            (acc, platform) => ({
              ...acc,
              [platform.id]: platform.markets.map((m) => ({
                id: m.id,
                name: m.name,
                budgetPercentage: m.budgetPercentage,
                accountName: m.accountName,
                adAccountId: m.adAccountId,
                page: m.page,
                pageId: m.pageId,
                pixel: m.pixel,
                catalog: m.catalog,
                productSet: m.productSet,
                conversionEvent: m.conversionEvent,
                adFormats: m.adFormats,
                phases: m.phases,
                isCBOEnabled: m.isCBOEnabled,
                isLifetimeBudget: m.isLifetimeBudget,
                instagramActorId: m.instagramActorId,
                strategy: m.strategy,
                strategyFocus: m.strategyFocus,
                // TikTok-specific fields
                tiktokPixel: m.tiktokPixel,
                tiktokIdentity: m.tiktokIdentity,
                tiktokCatalog: m.tiktokCatalog,
                tiktokProductSet: m.tiktokProductSet,
                tiktokOptimizationEvent: m.tiktokOptimizationEvent,
                tiktokLandingPageUrl: m.tiktokLandingPageUrl,
                 // Google Ads fields
                 googleObjective: m.googleObjective,
                 googleLandingPageUrl: m.googleLandingPageUrl,
                 googleBidStrategy: m.googleBidStrategy,
                 googleTargetCpa: m.googleTargetCpa,
                 googleTargetRoas: m.googleTargetRoas,
                 googleMaxCpcBid: m.googleMaxCpcBid,
              })),
            }),
            {},
          ),
          generic_config: {
            strategy: genericConfig.strategy,
            strategyFocus: genericConfig.strategyFocus,
            hasPhases: genericConfig.hasPhases,
            phases: genericConfig.phases,
            campaigns: genericConfig.campaigns,
            targeting: genericConfig.targeting,
            basicTargeting: basicTargeting,
            selectedClientId: selectedClientId,
            clientIndustry: clients.find((c) => c.id === selectedClientId)?.industry,
          } as any,
          status: "draft",
        } as any)
        .select()
        .single();

      if (error) throw error;

      // Log creation to history
      await (supabase as any).from("campaign_change_history").insert({
        campaign_id: campaign.id,
        user_id: user.id,
        action: "created",
        new_status: "draft",
      } as any);

      toast.success("ActiPlan saved as draft successfully!");

      // Redirect to ActiPlans page
      setTimeout(() => {
        window.location.href = "/app/actiplans";
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || "Failed to save ActiPlan");
    } finally {
      setSaving(false);
    }
  };

  const validateBudgetTypes = (): boolean => {
    const missingBudgetTypes: string[] = [];

    platformsWithMarkets.forEach((platform) => {
      platform.markets.forEach((market) => {
        if (market.phases) {
          market.phases.forEach((phase) => {
            if (!phase.budgetType) {
              missingBudgetTypes.push(`${platform.name} - ${market.name} - ${phase.name}`);
            }
          });
        }
      });
    });

    if (missingBudgetTypes.length > 0) {
      toast.error(
        `Budget type is required for all phases. Missing in: ${missingBudgetTypes.slice(0, 3).join(", ")}${missingBudgetTypes.length > 3 ? ` and ${missingBudgetTypes.length - 3} more` : ""}`,
        { duration: 5000 },
      );
      return false;
    }

    return true;
  };

  const applyBudgetTypeDefaultsIfAvailable = async (skipIfSet = false) => {
    console.log("applyBudgetTypeDefaultsIfAvailable called, skipIfSet:", skipIfSet);
    try {
      // Collect account IDs separately for Meta and TikTok platforms
      const metaAccountIds = Array.from(
        new Set(
          platformsWithMarkets
            .filter((p) => p.enabled && (p.id === "meta" || p.name.toLowerCase() === "meta"))
            .flatMap((p) => p.markets.map((m) => m.adAccountId).filter(Boolean) as string[]),
        ),
      );

      const tiktokAccountIds = Array.from(
        new Set(
          platformsWithMarkets
            .filter((p) => p.enabled && (p.id === "tiktok" || p.name.toLowerCase() === "tiktok"))
            .flatMap((p) => p.markets.map((m) => m.adAccountId).filter(Boolean) as string[]),
        ),
      );

      console.log("Meta Account IDs found:", metaAccountIds);
      console.log("TikTok Account IDs found:", tiktokAccountIds);

      if (metaAccountIds.length === 0 && tiktokAccountIds.length === 0) return;

      // Query both Meta and TikTok ad accounts
      const [metaResult, tiktokResult] = await Promise.all([
        metaAccountIds.length > 0
          ? supabase
              .from("meta_ad_accounts")
              .select("account_id, default_conversion_budget_type, default_non_conversion_budget_type")
              .in("account_id", metaAccountIds)
          : Promise.resolve({ data: [] }),
        tiktokAccountIds.length > 0
          ? supabase
              .from("tiktok_ad_accounts")
              .select("account_id, default_conversion_budget_type, default_non_conversion_budget_type")
              .in("account_id", tiktokAccountIds)
          : Promise.resolve({ data: [] }),
      ]);

      const metaAccounts = metaResult.data || [];
      const tiktokAccounts = tiktokResult.data || [];

      console.log(
        "Fetched Meta accounts with defaults:",
        metaAccounts.map((a) => ({
          id: a.account_id,
          convDefault: a.default_conversion_budget_type,
          nonConvDefault: a.default_non_conversion_budget_type,
        })),
      );

      console.log(
        "Fetched TikTok accounts with defaults:",
        tiktokAccounts.map((a) => ({
          id: a.account_id,
          convDefault: a.default_conversion_budget_type,
          nonConvDefault: a.default_non_conversion_budget_type,
        })),
      );

      // Merge both into defaultsMap
      const defaultsMap: Record<string, { conv?: string; nonconv?: string }> = {};

      [...metaAccounts, ...tiktokAccounts].forEach((a: any) => {
        defaultsMap[a.account_id] = {
          conv: a.default_conversion_budget_type || undefined,
          nonconv: a.default_non_conversion_budget_type || undefined,
        };
      });

      console.log("Budget type defaults map:", defaultsMap);

      let hasChanges = false;
      const updated = platformsWithMarkets.map((p) =>
        !p.enabled
          ? p
          : {
              ...p,
              markets: p.markets.map((m) => {
                const def = m.adAccountId ? defaultsMap[m.adAccountId] : undefined;
                if (!def) return m;

                const phases = (m.phases || []).map((ph) => {
                  // Skip if budget type is already set (including when user explicitly chose "none")
                  if (skipIfSet && ph.budgetType !== undefined) return ph;
                  // Only apply if budget type is truly unset (undefined)
                  if (ph.budgetType !== undefined) return ph;

                  const phaseObj = (ph.objective || "").toLowerCase();
                  const phaseOpt = (ph.optimizationGoal || "").toLowerCase();
                  const phaseFunnel = (ph.funnelStage || "").toLowerCase();
                  const marketFocus = (m.strategyFocus || "").toLowerCase();

                  // Non-conversion indicators (take priority)
                  const isNonConversionObjective =
                    phaseObj.includes("brand awareness") ||
                    phaseObj.includes("reach") ||
                    phaseObj.includes("traffic") ||
                    phaseObj.includes("engagement") ||
                    phaseObj.includes("video views") ||
                    phaseObj.includes("app installs");

                  const isNonConversionOptGoal =
                    phaseOpt.includes("reach") ||
                    phaseOpt.includes("link clicks") ||
                    phaseOpt.includes("landing page views") ||
                    phaseOpt.includes("post engagement") ||
                    phaseOpt.includes("video views") ||
                    phaseOpt.includes("app installs");

                  // Conversion indicators
                  const isConversionObjective =
                    phaseObj.includes("outcome_sales") ||
                    phaseObj.includes("outcome_leads") ||
                    phaseObj.includes("conversion");

                  const isConversionOptGoal =
                    phaseOpt.includes("offsite_conversions") ||
                    phaseOpt.includes("conversions") ||
                    phaseOpt.includes("lead") ||
                    phaseOpt.includes("purchase") ||
                    phaseOpt.includes("complete_registration");

                  const isConversionFunnel =
                    phaseFunnel.includes("conversion") ||
                    phaseFunnel.includes("purchase") ||
                    phaseFunnel.includes("action");

                  const isConversionMarket =
                    marketFocus.includes("purchase") ||
                    marketFocus.includes("lead") ||
                    marketFocus.includes("conversion");

                  // Phase-level indicators take priority over market-level
                  let isPhaseConversion: boolean;
                  if (isNonConversionObjective || isNonConversionOptGoal) {
                    isPhaseConversion = false;
                  } else if (isConversionObjective || isConversionOptGoal || isConversionFunnel) {
                    isPhaseConversion = true;
                  } else {
                    isPhaseConversion = isConversionMarket;
                  }

                  const candidate = isPhaseConversion ? def.conv : def.nonconv;

                  console.log(
                    `Phase "${ph.name}": obj=${phaseObj}, opt=${phaseOpt}, funnel=${phaseFunnel}, market=${marketFocus}, isConv=${isPhaseConversion}, applying=${candidate}`,
                  );

                  if (candidate === "daily" || candidate === "lifetime") {
                    hasChanges = true;
                    return { ...ph, budgetType: candidate as "daily" | "lifetime" };
                  }
                  return ph;
                });
                return { ...m, phases };
              }),
            },
      );

      if (hasChanges) {
        setPlatformsWithMarkets(updated);
      }
    } catch (e) {
      console.error("Error applying budget type defaults:", e);
    }
  };

  // Auto-apply budget type defaults when ad accounts or phases change
  useEffect(() => {
    const hasAccountsWithPhases = platformsWithMarkets.some(
      (p) =>
        p.enabled &&
        p.markets.some(
          (m) => m.adAccountId && m.phases && m.phases.length > 0 && m.phases.some((ph) => ph.budgetType === undefined),
        ),
    );
    if (hasAccountsWithPhases && isHydrated) {
      applyBudgetTypeDefaultsIfAvailable(true);
    }
  }, [
    platformsWithMarkets
      .map((p) =>
        p.markets
          .map(
            (m) =>
              `${m.adAccountId}-${m.phases?.length || 0}-${m.phases?.filter((ph) => ph.budgetType === undefined).length || 0}`,
          )
          .join("|"),
      )
      .join("||"),
    isHydrated,
  ]);

  // Fallback: default any still-undefined budgetType to "lifetime"
  useEffect(() => {
    if (!isHydrated) return;
    let hasChanges = false;
    const updated = platformsWithMarkets.map((p) => ({
      ...p,
      markets: p.markets.map((m) => {
        if (!m.phases || m.phases.length === 0) return m;
        let marketChanged = false;
        const phases = m.phases.map((ph) => {
          if (ph.budgetType === undefined) {
            hasChanges = true;
            marketChanged = true;
            return { ...ph, budgetType: "lifetime" as const };
          }
          return ph;
        });
        return marketChanged ? { ...m, phases } : m;
      }),
    }));
    if (hasChanges) setPlatformsWithMarkets(updated);
  }, [
    platformsWithMarkets
      .map((p) =>
        p.markets
          .map((m) => `${m.id}:${(m.phases || []).filter((ph) => ph.budgetType === undefined).length}`)
          .join("|"),
      )
      .join("||"),
    isHydrated,
  ]);

  const saveCampaignDraft = async () => {
    if (!campaignName.trim()) {
      toast.error("Please enter a campaign name");
      return null;
    }

    if (!validateBudgetTypes()) {
      return null;
    }

    // Check if BO number is unique within the same workspace
    if (activeWorkspaceId) {
      const { data: existingCampaign } = await supabase
        .from("campaigns")
        .select("id")
        .eq("bo_number", boNumber.trim())
        .eq("team_id", activeWorkspaceId)
        .neq("id", savedCampaignId || "")
        .single();

      if (existingCampaign) {
        toast.error("BO number must be unique within your workspace. This number is already in use.");
        return null;
      }
    }

    if (savedCampaignId) {
      return savedCampaignId;
    }

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("User not authenticated");

      const selectedPlatforms = platformsWithMarkets.filter((p) => p.id !== "");
      const budgetAllocation = selectedPlatforms.reduce((acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }), {});

      const { data: campaign, error } = await supabase
        .from("campaigns")
        .insert({
          user_id: user.id,
          team_id: activeWorkspaceId || null,
          name: campaignName,
          bo_number: boNumber.trim(),
          objective: genericConfig.strategyFocus || "conversions",
          total_budget: parseFloat(totalBudget) || 0,
          start_date: startDate || null,
          end_date: endDate || null,
          platforms: selectedPlatforms.map((p) => ({ id: p.id, name: p.name })),
          budget_allocation: budgetAllocation,
          market_splits: platformsWithMarkets.reduce((acc, platform) => {
            console.log(
              `💾 Saving platform ${platform.id}:`,
              platform.markets.map((m) => ({
                id: m.id,
                name: m.name,
                adAccountId: m.adAccountId,
                tiktokPixel: m.tiktokPixel,
                tiktokIdentity: m.tiktokIdentity,
                tiktokCatalog: m.tiktokCatalog,
                tiktokProductSet: m.tiktokProductSet,
                tiktokOptimizationEvent: m.tiktokOptimizationEvent,
              })),
            );
            return {
              ...acc,
              [platform.id]: platform.markets.map((m) => ({
                id: m.id,
                name: m.name,
                budgetPercentage: m.budgetPercentage,
                accountName: m.accountName,
                adAccountId: m.adAccountId,
                page: m.page,
                pageId: m.pageId,
                pixel: m.pixel,
                catalog: m.catalog,
                productSet: m.productSet,
                conversionEvent: m.conversionEvent,
                tiktokPixel: m.tiktokPixel,
                tiktokIdentity: m.tiktokIdentity,
                tiktokCatalog: m.tiktokCatalog,
                tiktokProductSet: m.tiktokProductSet,
                tiktokOptimizationEvent: m.tiktokOptimizationEvent,
                tiktokLandingPageUrl: m.tiktokLandingPageUrl,
                 // Google Ads fields
                 googleObjective: m.googleObjective,
                 googleLandingPageUrl: m.googleLandingPageUrl,
                 googleBidStrategy: m.googleBidStrategy,
                 googleTargetCpa: m.googleTargetCpa,
                 googleTargetRoas: m.googleTargetRoas,
                 googleMaxCpcBid: m.googleMaxCpcBid,
                adFormats: m.adFormats,
                phases: m.phases,
                instagramActorId: m.instagramActorId,
                strategy: m.strategy,
                strategyFocus: m.strategyFocus,
                isCBOEnabled: m.isCBOEnabled,
                isLifetimeBudget: m.isLifetimeBudget,
                countries: m.countries,
                gender: m.gender,
                languages: m.languages,
                ageMin: m.ageMin,
                ageMax: m.ageMax,
                publisherPlatforms: m.publisherPlatforms,
                positions: m.positions,
                detailedTargeting: m.detailedTargeting,
              })),
            };
          }, {}),
          generic_config: {
            strategy: genericConfig.strategy,
            strategyFocus: genericConfig.strategyFocus,
            hasPhases: genericConfig.hasPhases,
            phases: genericConfig.phases,
            campaigns: genericConfig.campaigns,
            targeting: genericConfig.targeting,
            basicTargeting: basicTargeting,
            selectedClientId: selectedClientId,
            clientIndustry: clients.find((c) => c.id === selectedClientId)?.industry,
          } as any,
          status: "draft",
        } as any)
        .select()
        .single();

      if (error) throw error;

      await (supabase as any).from("campaign_change_history").insert({
        campaign_id: campaign.id,
        user_id: user.id,
        action: "created",
        new_status: "draft",
      } as any);

      setSavedCampaignId(campaign.id);
      localStorage.setItem("draftCampaignId", campaign.id);
      toast.success("ActiPlan draft saved!");
      return campaign.id;
    } catch (error: any) {
      toast.error(error.message || "Failed to save draft");
      return null;
    }
  };

  const ensureDraft = async () => {
    // Prevent concurrent draft creation - this fixes the race condition
    // where multiple field changes trigger multiple INSERTs before the first completes
    if (savedCampaignId || draftCreationInProgressRef.current) {
      return;
    }

    draftCreationInProgressRef.current = true;
    try {
      await saveCampaignDraft();
    } finally {
      draftCreationInProgressRef.current = false;
    }
  };

  const getAvailablePlatforms = () => {
    const allPlatforms = [
      { id: "meta", name: "Meta" },
      { id: "google", name: "Google Ads" },
      { id: "linkedin", name: "LinkedIn" },
      { id: "tiktok", name: "TikTok" },
      { id: "snapchat", name: "Snapchat" },
      { id: "pinterest", name: "Pinterest" },
    ];

    const usedPlatformIds = platformsWithMarkets.map((p) => p.id);
    return allPlatforms.filter((p) => !usedPlatformIds.includes(p.id));
  };

  const duplicatePlatform = (platformId: string) => {
    const platformToDuplicate = platformsWithMarkets.find((p) => p.id === platformId);
    if (!platformToDuplicate) return;

    setPendingDuplication({ type: "platform", platformId });
    setPlatformDialogOpen(true);
  };

  const handlePlatformDuplicationConfirm = (newPlatformId: string) => {
    if (!pendingDuplication || pendingDuplication.type !== "platform") return;

    const platformToDuplicate = platformsWithMarkets.find((p) => p.id === pendingDuplication.platformId);
    if (!platformToDuplicate) return;

    const newPlatformName = getAvailablePlatforms().find((p) => p.id === newPlatformId)?.name || newPlatformId;
    const sourcePlatformId = platformToDuplicate.id;

    const newPlatform = {
      ...platformToDuplicate,
      id: newPlatformId,
      name: newPlatformName,
      markets: platformToDuplicate.markets.map((market) => {
        const translatedPhases = (market.phases || []).map((phase) => {
          // Translate objective & optimization goal to target platform
          if (phase.objective && phase.optimizationGoal) {
            const translated = translateObjective(
              phase.objective,
              phase.optimizationGoal,
              sourcePlatformId,
              newPlatformId,
              {
                tiktokPlacementType: phase.tiktokPlacementType,
                tiktokPlacements: phase.tiktokPlacements,
                tiktokCampaignType: phase.tiktokCampaignType,
                adFormats: phase.targeting?.adFormats ?? market.adFormats,
              }
            );
            const newPhase = {
              ...phase,
              objective: translated.objective,
              optimizationGoal: translated.optimizationGoal,
            };

            // Set Google campaign type when target is Google
            if (newPlatformId.toLowerCase().includes("google") && translated.translated) {
              newPhase.googleCampaignType = translateGoogleCampaignType(translated.objective) || phase.googleCampaignType;
            }

            // Clear platform-specific fields that don't apply to the target
            if (!newPlatformId.toLowerCase().includes("tiktok")) {
              delete newPhase.tiktokOptimizationLocation;
              delete newPhase.tiktokBidStrategy;
              delete newPhase.tiktokBidAmount;
              delete newPhase.tiktokPlacementType;
              delete newPhase.tiktokPlacements;
              delete newPhase.tiktokBillingEvent;
              delete newPhase.tiktokCampaignType;
              delete newPhase.tiktokSmartPlusEnabled;
            }
            if (!newPlatformId.toLowerCase().includes("meta")) {
              delete newPhase.metaBidStrategy;
              delete newPhase.metaBidAmount;
              delete newPhase.metaBillingEvent;
              delete newPhase.metaAdvantagePlusCampaign;
              delete newPhase.metaOptimizationLocation;
            }
            if (!newPlatformId.toLowerCase().includes("google")) {
              delete newPhase.googleCampaignType;
              delete newPhase.googleCampaignSubtype;
              delete newPhase.googleBidStrategy;
              delete newPhase.googleTargetCpa;
              delete newPhase.googleTargetRoas;
            }
            if (!newPlatformId.toLowerCase().includes("snap")) {
              delete newPhase.snapchatBidStrategy;
              delete newPhase.snapchatBidAmount;
              delete newPhase.snapchatPlacementType;
              delete newPhase.snapchatPlacements;
            }

            return newPhase;
          }
          return { ...phase };
        });

        return {
          ...market,
          id: `${market.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          phases: translatedPhases,
          // Translate ad formats to the new platform
          adFormats: market.adFormats && market.adFormats.length > 0
            ? translateAdFormats(market.adFormats, sourcePlatformId, newPlatformId)
            : market.adFormats,
          // Clear source-platform-specific market-level fields
          ...(newPlatformId.toLowerCase().includes("tiktok") ? {} : {
            tiktokPixel: undefined, tiktokIdentity: undefined, tiktokCatalog: undefined,
            tiktokProductSet: undefined, tiktokOptimizationEvent: undefined,
          }),
          ...(newPlatformId.toLowerCase().includes("meta") ? {} : {
            pixel: undefined, catalog: undefined, productSet: undefined,
            pageId: undefined, instagramActorId: undefined,
          }),
          ...(newPlatformId.toLowerCase().includes("google") ? {} : {
            googleObjective: undefined, googleBidStrategy: undefined,
            googleMerchantCenterId: undefined, googleFeedLabel: undefined,
          }),
        };
      }),
    };

    setPlatformsWithMarkets((prev) => [...prev, newPlatform]);
    setPendingDuplication(null);
    ensureDraft();
    
    const translationCount = newPlatform.markets.reduce((acc, m) => 
      acc + (m.phases || []).filter(p => p.objective).length, 0
    );
    toast.success(
      translationCount > 0
        ? `Platform duplicated — ${translationCount} phase objective(s) translated to ${newPlatformName}`
        : "Platform duplicated successfully"
    );
  };

  const deletePlatform = (platformId: string) => {
    setPlatformsWithMarkets((prev) => prev.filter((p) => p.id !== platformId));
    ensureDraft();
    toast.success("Platform deleted successfully");
  };

  const duplicateMarket = (platformId: string, marketId: string) => {
    setPendingDuplication({ type: "market", platformId, marketId });
    setMarketDialogOpen(true);
  };

  const handleMarketDuplicationConfirm = (marketValue: string, marketLabel: string) => {
    if (!pendingDuplication || pendingDuplication.type !== "market") return;

    const { platformId, marketId } = pendingDuplication;
    if (!platformId || !marketId) return;

    setPlatformsWithMarkets((prev) =>
      prev.map((platform) => {
        if (platform.id !== platformId) return platform;

        const marketToDuplicate = platform.markets.find((m) => m.id === marketId);
        if (!marketToDuplicate) return platform;

        const newMarket = {
          ...marketToDuplicate,
          id: `${marketValue}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          name: marketValue,
        };

        return {
          ...platform,
          markets: [...platform.markets, newMarket],
        };
      }),
    );

    setPendingDuplication(null);
    ensureDraft();
    toast.success(`Market "${marketLabel}" duplicated successfully`);
  };

  const deleteMarket = (platformId: string, marketId: string) => {
    setPlatformsWithMarkets((prev) =>
      prev.map((platform) => {
        if (platform.id !== platformId) return platform;
        return {
          ...platform,
          markets: platform.markets.filter((m) => m.id !== marketId),
        };
      }),
    );
    ensureDraft();
    toast.success("Market deleted successfully");
  };

  const getMarketLabel = (marketValue: string) => {
    return MARKET_OPTIONS.find((m) => m.value === marketValue)?.label || marketValue;
  };

  const handleBudgetTypeConfirm = (phaseBudgetTypes: Record<string, "daily" | "lifetime">) => {
    if (!selectedMarketForBudget) return;

    const { platformId, marketId } = selectedMarketForBudget;

    skipPhaseSyncRef.current = true;

    setPlatformsWithMarkets((prev) =>
      prev.map((p) =>
        p.id === platformId
          ? {
              ...p,
              markets: p.markets.map((m) =>
                m.id === marketId
                  ? {
                      ...m,
                      phases: (m.phases || []).map((phase: any) => ({
                        ...phase,
                        budgetType: phaseBudgetTypes[phase.id] || "lifetime",
                      })),
                    }
                  : m,
              ),
            }
          : p,
      ),
    );

    setBudgetTypeDialogOpen(false);
    setSelectedMarketForBudget(null);
    toast.success("Budget types applied to all campaigns");
    ensureDraft();
  };

  return (
    <div className="space-y-6">
      {/* Extension Mode Banner */}
      {extensionMode.isExtensionMode && (
        <Alert className="border-primary/50 bg-primary/5">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <AlertDescription className="flex items-center gap-2">
            <span className="font-medium">Extension Mode:</span>
            <span className="text-muted-foreground">
              Existing campaign structure is locked. You can duplicate items or add new platforms, markets, and phases.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Step 1: Activation Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Step 1: Activation Details</CardTitle>
              <CardDescription>Define your activation's core parameters</CardDescription>
            </div>
            {currentStep > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setCurrentStep(1)}>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        {currentStep === 1 ? (
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Activation Name</Label>
                <Input
                  id="name"
                  value={campaignName}
                  onChange={(e) => {
                    setCampaignName(e.target.value);
                    ensureDraft();
                  }}
                  placeholder="e.g., Q1 2024 Brand Activation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bo-number">
                  BO Number
                </Label>
                <Input
                  id="bo-number"
                  value={boNumber}
                  onChange={(e) => {
                    setBoNumber(e.target.value);
                    ensureDraft();
                  }}
                  placeholder="e.g., BO-2025-001"
                />
                <p className="text-xs text-muted-foreground">Unique financial reference for invoicing</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget">Total Activation Budget ($) *</Label>
              <Input
                id="budget"
                type="number"
                value={totalBudget}
                onChange={(e) => {
                  setTotalBudget(e.target.value);
                  ensureDraft();
                }}
                placeholder="Enter total budget"
                required
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start-date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Start Date *
                </Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    ensureDraft();
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  End Date *
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    ensureDraft();
                  }}
                  required
                />
              </div>
            </div>

            {/* Client Selection - Now after required fields */}
            <div className="space-y-2">
              <Label htmlFor="client">Client (Optional)</Label>
              <div className="flex gap-2">
              <Select
                value={selectedClientId || undefined}
                onValueChange={(value) => {
                  if (value === "__new_client__") {
                    navigate("/app/settings/accounts");
                    return;
                  }
                  clientSelectionIsUserAction.current = true;
                  setSelectedClientId(value || "");
                  ensureDraft();
                }}
                disabled={!totalBudget || !startDate || !endDate}
              >
                <SelectTrigger id="client">
                  <SelectValue
                    placeholder={
                      !totalBudget || !startDate || !endDate
                        ? "Fill budget and dates first..."
                        : "Select a client to auto-populate platforms..."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                  {/* + New Client option - locked for non-Enterprise users */}
                  {hasAccess("client_management") ? (
                    <SelectItem value="__new_client__" className="text-primary font-medium">
                      <span className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        New Client
                      </span>
                    </SelectItem>
                  ) : (
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <div
                            className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none opacity-50"
                            onClick={() => navigate("/app/settings/plans")}
                          >
                            <Lock className="h-4 w-4 mr-2" />
                            <Plus className="h-4 w-4 mr-1" />
                            New Client
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="bg-background border border-border shadow-lg z-[100]">
                          <a
                            href="/app/settings/plans"
                            onClick={(e) => {
                              e.preventDefault();
                              navigate("/app/settings/plans");
                            }}
                            className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                          >
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>
                              Upgrade to{" "}
                              <span className="font-semibold text-primary">
                                {TIER_DISPLAY_NAMES[getRequiredTierForFeature("client_management")]}
                              </span>{" "}
                              to unlock
                            </span>
                          </a>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </SelectContent>
               </Select>
               <Button
                 type="button"
                 variant="outline"
                 size="sm"
                 disabled={!selectedClientId || !totalBudget || !startDate || !endDate}
                 onClick={() => {
                   clientSelectionIsUserAction.current = true;
                   // Re-trigger by setting same client id
                   const currentClient = selectedClientId;
                   setSelectedClientId("");
                   setTimeout(() => {
                     clientSelectionIsUserAction.current = true;
                     setSelectedClientId(currentClient || "");
                   }, 0);
                 }}
                 className="shrink-0"
               >
                 Apply Defaults
               </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Selecting a client will auto-populate platforms, markets, and ad account defaults
              </p>
            </div>

            <div className="pt-4">
              <PlatformMarketBudgetSelector
                platforms={platformsWithMarkets}
                setPlatforms={setPlatformsWithMarkets}
                totalBudget={parseFloat(totalBudget) || 0}
                setStartDate={setStartDate}
                setEndDate={setEndDate}
                setTotalBudget={setTotalBudget}
                selectedClientId={selectedClientId}
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={async () => {
                  await ensureDraft();
                  setCurrentStep(2);
                }}
                disabled={!isSampleMode && !isActivationDetailsComplete()}
              >
                Next: Targeting
              </Button>
            </div>
          </CardContent>
        ) : (
          <CardContent className="py-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Name:</span>
                <span className="font-medium text-foreground">{campaignName}</span>
              </div>
              <div className="flex justify-between">
                <span>BO Number:</span>
                <span className="font-medium text-foreground">{boNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Budget:</span>
                <span className="font-medium text-foreground">${parseFloat(totalBudget).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span className="font-medium text-foreground">
                  {startDate &&
                    endDate &&
                    `${format(parseISO(startDate), "MMM d")} - ${format(parseISO(endDate), "MMM d, yyyy")}`}
                </span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Step 2: Basic Targeting */}
      {currentStep >= 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Step 2: Basic Targeting</CardTitle>
                <CardDescription>Define core demographics that will apply to all campaigns</CardDescription>
              </div>
              {currentStep > 2 && (
                <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)}>
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          {currentStep === 2 ? (
            <CardContent>
              <UnifiedTargeting
                targeting={basicTargeting}
                onUpdate={(targeting) => {
                  console.log("📋 Received targeting update from BasicTargeting:", targeting);
                  setBasicTargeting(targeting);
                  // localStorage is already handled in UnifiedTargeting component

                  // Immediate database save - fetch current config to avoid overwriting other fields
                  if (savedCampaignId && user) {
                    (async () => {
                      try {
                        // Fetch current config from DB to get latest state
                        const { data: currentCampaign } = await supabase
                          .from("campaigns")
                          .select("generic_config")
                          .eq("id", savedCampaignId)
                          .single();

                        const currentConfig =
                          currentCampaign?.generic_config && typeof currentCampaign.generic_config === "object"
                            ? (currentCampaign.generic_config as Record<string, unknown>)
                            : {};

                        // Merge with the NEW targeting (not from state which might be stale)
                        await supabase
                          .from("campaigns")
                          .update({
                            updated_at: new Date().toISOString(),
                            generic_config: {
                              ...currentConfig,
                              basicTargeting: targeting, // Use the passed targeting directly
                            } as any,
                          })
                          .eq("id", savedCampaignId);
                        console.log("✅ Saved basicTargeting to database:", targeting.selectedItems?.length, "items");
                      } catch (error) {
                        console.error("❌ Error saving basicTargeting:", error);
                      }
                    })();
                  }
                }}
                metaAdAccountId={firstAdAccountId || undefined}
                tiktokAdvertiserId={keywordSearchScope.tiktokAdvertiserId}
                googleCustomerId={keywordSearchScope.googleCustomerId}
                platformId={
                  platformsWithMarkets.find((p) => p.id === "meta")?.id || platformsWithMarkets[0]?.id || "meta"
                }
                platformName={
                  platformsWithMarkets.find((p) => p.id === "meta")?.name || platformsWithMarkets[0]?.name || "Meta"
                }
                selectedPlatforms={platformsWithMarkets
                  .filter((p) => p.enabled)
                  .map((p) => ({
                    id: p.id,
                    name: p.name,
                    adAccountId:
                      p.id === "meta" ? firstAdAccountId : p.id === "tiktok" ? firstTiktokAdvertiserId : (p.id === "google" || p.id === "google_ads") ? firstGoogleCustomerId : undefined,
                  }))}
                askSplitLevel={platformsWithMarkets.some((p) => p.enabled && (p.id === "google" || p.id === "google_ads" || p.name.toLowerCase().includes("google")))}
                markets={keywordSearchScope.markets}
                googleMarkets={keywordSearchScope.googleMarkets}
                tiktokMarkets={keywordSearchScope.tiktokMarkets}
              />
              <div className="mt-6 flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  Back
                </Button>
                <Button
                  onClick={async () => {
                    // Create targeting preset snapshot
                    const preset = { ...basicTargeting };
                    setTargetingPreset(preset);
                    console.log("🎯 Created targeting preset:", preset);

                    // Save preset to database
                    if (savedCampaignId && user) {
                      try {
                        const { data: currentCampaign } = await supabase
                          .from("campaigns")
                          .select("generic_config")
                          .eq("id", savedCampaignId)
                          .single();

                        const currentConfig =
                          currentCampaign?.generic_config && typeof currentCampaign.generic_config === "object"
                            ? currentCampaign.generic_config
                            : genericConfig;

                        await supabase
                          .from("campaigns")
                          .update({
                            updated_at: new Date().toISOString(),
                            generic_config: {
                              ...currentConfig,
                              targetingPreset: preset,
                            } as any,
                          })
                          .eq("id", savedCampaignId);
                        console.log("✅ Saved targeting preset to database");
                        toast.success("Targeting preset created");
                      } catch (error) {
                        console.error("❌ Error saving preset:", error);
                        toast.error("Failed to save targeting preset");
                      }
                    }

                    setCurrentStep(3);
                    await ensureDraft();
                  }}
                >
                  Continue to Strategy
                </Button>
              </div>
            </CardContent>
          ) : (
            <CardContent>
              <div className="grid gap-3 text-sm text-muted-foreground">
                {basicTargeting.ageMin && basicTargeting.ageMax && (
                  <div className="flex justify-between">
                    <span>Age Range:</span>
                    <span className="font-medium text-foreground">
                      {basicTargeting.ageMin} - {basicTargeting.ageMax}
                    </span>
                  </div>
                )}
                {basicTargeting.genders && basicTargeting.genders.length > 0 && (
                  <div className="flex justify-between">
                    <span>Gender:</span>
                    <span className="font-medium text-foreground">{basicTargeting.genders.join(", ")}</span>
                  </div>
                )}
                {basicTargeting.languages && basicTargeting.languages.length > 0 && (
                  <div className="flex justify-between">
                    <span>Language:</span>
                    <span className="font-medium text-foreground">{basicTargeting.languages.join(", ")}</span>
                  </div>
                )}
                {basicTargeting.devices && basicTargeting.devices.length > 0 && (
                  <div className="flex justify-between">
                    <span>Device:</span>
                    <span className="font-medium text-foreground">{basicTargeting.devices.join(", ")}</span>
                  </div>
                )}
                {basicTargeting.os && basicTargeting.os.length > 0 && (
                  <div className="flex justify-between">
                    <span>Operating System:</span>
                    <span className="font-medium text-foreground">{basicTargeting.os.join(", ")}</span>
                  </div>
                )}
                {basicTargeting.selectedItems?.length > 0 && (
                  <div className="flex justify-between pt-2 border-t">
                    <span>Detailed Targeting:</span>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2 items-center flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {basicTargeting.selectedItems.length} Selected
                        </Badge>
                        {basicTargeting.selectedItems.filter((item) => item.platforms.length === 2).length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {basicTargeting.selectedItems.filter((item) => item.platforms.length === 2).length} Both
                            Platforms
                          </Badge>
                        )}
                        {basicTargeting.selectedItems.filter(
                          (item) => item.platforms.includes("meta") && item.platforms.length === 1,
                        ).length > 0 && (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            {
                              basicTargeting.selectedItems.filter(
                                (item) => item.platforms.includes("meta") && item.platforms.length === 1,
                              ).length
                            }{" "}
                            Meta Only
                          </Badge>
                        )}
                        {basicTargeting.selectedItems.filter(
                          (item) => item.platforms.includes("tiktok") && item.platforms.length === 1,
                        ).length > 0 && (
                          <Badge variant="outline" className="text-xs bg-pink-50 text-pink-700 border-pink-200">
                            {
                              basicTargeting.selectedItems.filter(
                                (item) => item.platforms.includes("tiktok") && item.platforms.length === 1,
                              ).length
                            }{" "}
                            TikTok Only
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Step 3: Strategy Configuration */}
      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Step 3: Strategy Configuration</CardTitle>
                <CardDescription>Choose your campaign strategy approach</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {currentStep > 3 && (
                  <Button variant="ghost" size="sm" onClick={() => setCurrentStep(3)}>
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          {currentStep === 3 ? (
            <CardContent className="space-y-6">
              <Step3StrategyNav
                platforms={platformsWithMarkets}
                onNavigatePlatform={(pid) =>
                  setExpandedPlatforms((prev) => ({ ...prev, [pid]: true }))
                }
                onNavigateMarket={(mid) =>
                  setExpandedMarkets((prev) => ({ ...prev, [mid]: true }))
                }
              />
              {/* Phase Scheduling */}
              {(() => {
                const totalMarkets = platformsWithMarkets.reduce(
                  (sum, p) => sum + (p.enabled ? p.markets.length : 0),
                  0,
                );

                if (totalMarkets === 1) {
                  // Single market: show strategy configuration and PhaseScheduler
                  const singlePlatform = platformsWithMarkets.find((p) => p.enabled && p.markets.length > 0);
                  const singleMarket = singlePlatform ? singlePlatform.markets[0] : null;

                  return singleMarket ? (
                    <div className="mt-6 pt-6 border-t space-y-6">
                      {/* Strategy Configuration for Single Market */}
                      <StrategySelector
                        strategy={singleMarket.strategy || genericConfig.strategy || "auto-detect"}
                        selectedStrategyId={(singleMarket as any).selectedStrategyId}
                        platformId={singlePlatform?.id || "meta"}
                        startDate={startDate}
                        endDate={endDate}
                        adFormats={singleMarket.adFormats || genericConfig.targeting?.adFormats || []}
                        hasPixel={!!singleMarket.pixel}
                        hasCatalog={!!singleMarket.catalog}
                        hasKeywords={(basicTargeting as any)?.selectedKeywords?.filter((k: any) => !k.isNegative)?.length > 0}
                        onStrategyChange={(strategy, phases, selectedStrategyId) => {
                          setPlatformsWithMarkets((prev) =>
                            prev.map((p) =>
                              p.id === singlePlatform?.id
                                ? {
                                    ...p,
                                    markets: p.markets.map((m) =>
                                      m.id === singleMarket.id
                                        ? {
                                            ...m,
                                            strategy,
                                            phases,
                                            selectedStrategyId,
                                          }
                                        : m,
                                    ),
                                  }
                                : p,
                            ),
                          );
                          ensureDraft();
                        }}
                      />

                      <div className={isSampleMode ? "[&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_[role=combobox]]:pointer-events-none [&_[role=slider]]:pointer-events-none [&_[role=checkbox]]:pointer-events-none [&_[role=switch]]:pointer-events-none [&_[role=radio]]:pointer-events-none opacity-95 select-none" : ""} aria-disabled={isSampleMode || undefined} title={isSampleMode ? "Read-only in tour mode (expand to view details)" : undefined}>
                      <PhaseScheduler
                        phases={singleMarket.phases || []}
                        onPhasesChange={(phases) => {
                          setPlatformsWithMarkets((prev) =>
                            prev.map((p) =>
                              p.id === singlePlatform?.id
                                ? {
                                    ...p,
                                    markets: p.markets.map((m) => (m.id === singleMarket.id ? { ...m, phases } : m)),
                                  }
                                : p,
                            ),
                          );
                        }}
                        onManualPhasesChange={(phases) => {
                          skipPhaseSyncRef.current = true;
                          setPlatformsWithMarkets((prev) =>
                            prev.map((p) =>
                              p.id === singlePlatform?.id
                                ? {
                                    ...p,
                                    markets: p.markets.map((m) =>
                                      m.id === singleMarket.id ? { ...m, phases, strategy: "manual" as const } : m,
                                    ),
                                  }
                                : p,
                            ),
                          );
                          if (genericConfig.strategy === "auto-detect") {
                            setGenericConfig((prev) => ({ ...prev, strategy: "manual" }));
                          }
                        }}
                        onSkipNextSync={() => {
                          skipPhaseSyncRef.current = true;
                        }}
                        onManualPhaseEdit={() => {
                          // Switch market strategy from auto-detect to manual to prevent auto-regeneration from overriding user customizations
                          setPlatformsWithMarkets((prev) =>
                            prev.map((p) =>
                              p.id === singlePlatform?.id
                                ? {
                                    ...p,
                                    markets: p.markets.map((m) =>
                                      m.id === singleMarket.id ? { ...m, strategy: "manual" as const } : m,
                                    ),
                                  }
                                : p,
                            ),
                          );
                          if (genericConfig.strategy === "auto-detect") {
                            setGenericConfig((prev) => ({ ...prev, strategy: "manual" }));
                          }
                        }}
                        startDate={startDate}
                        endDate={endDate}
                        platformName={singlePlatform?.name || "Facebook (Meta)"}
                        platformId={singlePlatform?.id || "meta"}
                        adAccountId={singleMarket.adAccountId || (singlePlatform?.id === 'meta' ? firstAdAccountId : singlePlatform?.id === 'tiktok' ? firstTiktokAdvertiserId : singlePlatform?.id === 'google' || singlePlatform?.id === 'google_ads' ? firstGoogleCustomerId : undefined) || undefined}
                        basicTargeting={basicTargeting}
                        strategy={singleMarket.strategy || genericConfig.strategy}
                        strategyFocus={singleMarket.strategyFocus || genericConfig.strategyFocus}
                        adAccountDefaults={{
                          hasDefaults: true,
                          publisherPlatforms: singleMarket.metaPublisherPlatforms || singleMarket.publisherPlatforms,
                          positions: singleMarket.metaPositions || singleMarket.positions,
                          metaAdvantagePlusPlacements: singleMarket.metaAdvantagePlusPlacements,
                          tiktokPlacementType: singleMarket.tiktokPlacementType,
                          tiktokPlacements: singleMarket.tiktokPlacements,
                          // Meta destination defaults
                          metaOptimizationLocation: (singleMarket as any).metaOptimizationLocation,
                          metaAppStore: (singleMarket as any).metaAppStore,
                          metaAppId: (singleMarket as any).metaAppId,
                          metaMessagingMode: (singleMarket as any).metaMessagingMode,
                          metaMessengerEnabled: (singleMarket as any).metaMessengerEnabled,
                          metaInstagramDmEnabled: (singleMarket as any).metaInstagramDmEnabled,
                          metaWhatsappEnabled: (singleMarket as any).metaWhatsappEnabled,
                          metaWhatsappNumber: (singleMarket as any).metaWhatsappNumber,
                          metaPageId: singleMarket.pageId,
                          metaInstagramAccountId:
                            (singleMarket as any).metaInstagramAccountId || singleMarket.instagramActorId,
                          metaLandingPageUrl: (singleMarket as any).metaLandingPageUrl,
                          // Meta advanced settings defaults
                          metaBidStrategy: singleMarket.metaBidStrategy,
                          metaBidAmount: singleMarket.metaBidAmount,
                          metaClickWindow: (singleMarket as any).metaClickWindow,
                          metaViewWindow: (singleMarket as any).metaViewWindow,
                          metaBillingEvent: (singleMarket as any).metaBillingEvent,
                          // TikTok destination defaults
                          tiktokOptimizationLocation: singleMarket.tiktokOptimizationLocation,
                          tiktokAppId: singleMarket.tiktokAppId,
                          tiktokAppName: singleMarket.tiktokAppName,
                          tiktokMessagingApp: (singleMarket as any).tiktokMessagingApp,
                          tiktokFacebookPageId: (singleMarket as any).tiktokFacebookPageId,
                          tiktokMessageEventSet: (singleMarket as any).tiktokMessageEventSet,
                          tiktokWhatsappNumber: (singleMarket as any).tiktokWhatsappNumber,
                          tiktokZaloAccountId: (singleMarket as any).tiktokZaloAccountId,
                          tiktokLineBusinessId: (singleMarket as any).tiktokLineBusinessId,
                          tiktokLandingPageUrl: singleMarket.tiktokLandingPageUrl,
                          // TikTok advanced settings defaults
                          tiktokBidStrategy: singleMarket.tiktokBidStrategy,
                          tiktokBidAmount: singleMarket.tiktokBidAmount,
                          tiktokClickWindow: (singleMarket as any).tiktokClickWindow,
                          tiktokViewWindow: (singleMarket as any).tiktokViewWindow,
                          tiktokBillingEvent: (singleMarket as any).tiktokBillingEvent,
                          // Catalog & Product Set defaults
                          metaCatalogId: singleMarket.catalog,
                          metaProductSetId: singleMarket.productSet,
                          tiktokCatalogId: (singleMarket as any).tiktokCatalogId,
                          tiktokProductSetId: (singleMarket as any).tiktokProductSetId,
                          // Google Ads defaults
                          googleLandingPageUrl: (singleMarket as any).googleLandingPageUrl,
                          googleBidStrategy: (singleMarket as any).googleBidStrategy,
                          googleTargetCpa: (singleMarket as any).googleTargetCpa,
                          googleTargetRoas: (singleMarket as any).googleTargetRoas,
                          googleMaxCpcBid: (singleMarket as any).googleMaxCpcBid,
                        }}
                        onApplyBudgetTypeToAll={(type) => {
                          skipPhaseSyncRef.current = true;
                          setPlatformsWithMarkets((prev) =>
                            prev.map((p) =>
                              p.id === singlePlatform?.id
                                ? {
                                    ...p,
                                    markets: p.markets.map((m) => ({
                                      ...m,
                                      phases: (m.phases || []).map((ph) => ({ ...ph, budgetType: type })),
                                    })),
                                  }
                                : p,
                            ),
                          );
                        }}
                        onOpenCustomizeBudgetTypes={() => {
                          if (singlePlatform) {
                            setBulkPlatform(singlePlatform as any);
                            setBulkBudgetDialogOpen(true);
                          }
                        }}
                        marketBudget={
                          parseFloat(totalBudget || "0") *
                          ((singlePlatform?.budgetPercentage || 0) / 100) *
                          ((singleMarket.budgetPercentage || 0) / 100)
                        }
                        activationContext={{
                          activationName: campaignName,
                          boNumber: boNumber,
                          clientName: clients.find((c) => c.id === selectedClientId)?.name,
                          teamName: teamName,
                          totalBudget: parseFloat(totalBudget || "0"),
                          market: singleMarket.name,
                          markets: [singleMarket.name],
                          platformBudget:
                            parseFloat(totalBudget || "0") * ((singlePlatform?.budgetPercentage || 0) / 100),
                        }}
                      />
                      </div>
                    </div>
                  ) : null;
                } else if (totalMarkets > 1) {
                  // Multiple markets: show strategy controls and PhaseScheduler for each market
                  return (
                    <div className="mt-6 pt-6 border-t space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Market Configuration</h3>
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1">
                                <ChevronsUpDown className="h-3 w-3" />
                                Expand / Collapse
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel className="text-xs">Expand</DropdownMenuLabel>
                              <DropdownMenuItem className="text-xs" onClick={() => {
                                const newState: Record<string, boolean> = {};
                                platformsWithMarkets.filter(p => p.enabled && p.markets.length > 0).forEach(p => { newState[p.id] = true; });
                                setExpandedPlatforms(newState);
                              }}>
                                All Platforms
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-xs" onClick={() => {
                                const newState: Record<string, boolean> = {};
                                platformsWithMarkets.filter(p => p.enabled).forEach(p => p.markets.forEach(m => { newState[m.id] = true; }));
                                setExpandedMarkets(prev => ({ ...prev, ...newState }));
                              }}>
                                All Markets
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-xs" onClick={() => {
                                setPhaseExpandSignal({ action: 'expand', counter: Date.now() });
                              }}>
                                All Phases
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-xs">Collapse</DropdownMenuLabel>
                              <DropdownMenuItem className="text-xs" onClick={() => {
                                setExpandedPlatforms({});
                              }}>
                                All Platforms
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-xs" onClick={() => {
                                setExpandedMarkets({});
                              }}>
                                All Markets
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-xs" onClick={() => {
                                setPhaseExpandSignal({ action: 'collapse', counter: Date.now() });
                              }}>
                                All Phases
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-xs">By Name</DropdownMenuLabel>
                              {(() => {
                                const uniqueMarketNames = [...new Set(platformsWithMarkets.filter(p => p.enabled).flatMap(p => p.markets.map(m => m.name)))];
                                const uniquePhaseNames = [...new Set(platformsWithMarkets.filter(p => p.enabled).flatMap(p => p.markets.flatMap(m => (m.phases || []).map(ph => ph.name))))];
                                return (
                                  <>
                                    {uniqueMarketNames.length > 1 && uniqueMarketNames.map(name => (
                                      <DropdownMenuItem key={`market-${name}`} className="text-xs" onClick={() => {
                                        setExpandedMarkets(prev => {
                                          const newState = { ...prev };
                                          const marketIds = platformsWithMarkets.filter(p => p.enabled).flatMap(p => p.markets.filter(m => m.name === name).map(m => m.id));
                                          const allExpanded = marketIds.every(id => prev[id]);
                                          marketIds.forEach(id => { newState[id] = !allExpanded; });
                                          return newState;
                                        });
                                      }}>
                                        Toggle: {getMarketLabel(name)}
                                      </DropdownMenuItem>
                                    ))}
                                    {uniquePhaseNames.length > 0 && uniquePhaseNames.map(name => (
                                      <DropdownMenuItem key={`phase-${name}`} className="text-xs" onClick={() => {
                                        setPhaseExpandSignal({ action: 'expand', target: name, counter: Date.now() });
                                      }}>
                                        Toggle: {name}
                                      </DropdownMenuItem>
                                    ))}
                                  </>
                                );
                              })()}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      {platformsWithMarkets.map((platform) =>
                        platform.enabled && platform.markets.length > 0 ? (
                          <Collapsible
                            key={platform.id}
                            open={expandedPlatforms[platform.id]}
                            onOpenChange={(open) => setExpandedPlatforms((prev) => ({ ...prev, [platform.id]: open }))}
                            className="border rounded-lg"
                            id={`step3-platform-${platform.id}`}
                          >
                            <CollapsibleTrigger asChild>
                              <div className="flex items-center gap-2 w-full">
                                <Button variant="ghost" className="flex-1 justify-between p-4 hover:bg-accent">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-lg">{platform.name}</span>
                                    {extensionMode.isExtensionMode && extensionMode.isOriginalPlatform(platform.id) && (
                                      <Badge variant="outline" className="text-xs gap-1">
                                        <Lock className="h-3 w-3" />
                                        Locked
                                      </Badge>
                                    )}
                                  </div>
                                  {expandedPlatforms[platform.id] ? (
                                    <ChevronUp className="h-5 w-5" />
                                  ) : (
                                    <ChevronDown className="h-5 w-5" />
                                  )}
                                </Button>
                                <div className="flex gap-1 pr-4">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-accent"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      duplicatePlatform(platform.id);
                                    }}
                                    title="Duplicate platform"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  {extensionMode.canDeleteItem(platform.id, "platform") ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 hover:bg-destructive/20"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deletePlatform(platform.id);
                                      }}
                                      title="Delete platform"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 opacity-30 cursor-not-allowed"
                                            disabled
                                          >
                                            <Lock className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          Original items cannot be deleted in extension mode
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="px-4 pb-4">
                              <div className="space-y-4">
                                {platform.markets.map((market) => (
                                  <Collapsible key={market.id} open={!!expandedMarkets[market.id]} onOpenChange={(open) => setExpandedMarkets(prev => ({ ...prev, [market.id]: open }))}>
                                    <Card className="overflow-hidden" id={`step3-market-${market.id}`}>
                                      <CollapsibleTrigger asChild>
                                        <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50 transition-colors">
                                          <div className="flex items-center gap-2">
                                            <h4 className="font-medium">{getMarketLabel(market.name)}</h4>
                                            {extensionMode.isExtensionMode &&
                                              extensionMode.isOriginalMarket(market.id) && (
                                                <Badge variant="outline" className="text-xs gap-1">
                                                  <Lock className="h-3 w-3" />
                                                  Locked
                                                </Badge>
                                              )}
                                            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                          </div>
                                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 w-8 p-0 hover:bg-accent"
                                              onClick={() => duplicateMarket(platform.id, market.id)}
                                              title="Duplicate market"
                                            >
                                              <Copy className="h-4 w-4" />
                                            </Button>
                                            {extensionMode.canDeleteItem(market.id, "market") ? (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 hover:bg-destructive/20"
                                                onClick={() => deleteMarket(platform.id, market.id)}
                                                title="Delete market"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            ) : (
                                              <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-8 w-8 p-0 opacity-30 cursor-not-allowed"
                                                      disabled
                                                    >
                                                      <Lock className="h-4 w-4" />
                                                    </Button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    Original items cannot be deleted in extension mode
                                                  </TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                            )}
                                          </div>
                                        </div>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <div className="px-4 pb-4">
                          {/* Per-Market Strategy Configuration */}
                          <div className="mb-6">
                            <StrategySelector
                              strategy={market.strategy || genericConfig.strategy || "auto-detect"}
                              selectedStrategyId={(market as any).selectedStrategyId}
                              platformId={platform.id}
                              startDate={startDate}
                              endDate={endDate}
                              adFormats={market.adFormats || genericConfig.targeting?.adFormats || []}
                              hasPixel={!!market.pixel}
                              hasCatalog={!!market.catalog}
                              hasKeywords={(basicTargeting as any)?.selectedKeywords?.filter((k: any) => !k.isNegative)?.length > 0}
                              onStrategyChange={(strategy, phases, selectedStrategyId) => {
                                setPlatformsWithMarkets((prev) =>
                                  prev.map((p) =>
                                    p.id === platform.id
                                      ? {
                                          ...p,
                                          markets: p.markets.map((m) =>
                                            m.id === market.id
                                              ? { ...m, strategy, phases, selectedStrategyId }
                                              : m,
                                          ),
                                        }
                                      : p,
                                  ),
                                );
                                ensureDraft();
                              }}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => {
                                const currentStrategy = market.strategy || genericConfig.strategy;
                                const currentStrategyId = (market as any).selectedStrategyId;

                                setPlatformsWithMarkets((prev) =>
                                  prev.map((p) => ({
                                    ...p,
                                    markets: p.markets.map((m) => ({
                                      ...m,
                                      strategy: currentStrategy,
                                      selectedStrategyId: currentStrategyId,
                                      phases: (market as any).phases || [],
                                    })),
                                  })),
                                );

                                toast.success("Strategy applied to all markets.");
                                ensureDraft();
                              }}
                            >
                              Apply Strategy to All Markets
                            </Button>
                          </div>

                                          <div className={isSampleMode ? "[&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_[role=combobox]]:pointer-events-none [&_[role=slider]]:pointer-events-none [&_[role=checkbox]]:pointer-events-none [&_[role=switch]]:pointer-events-none [&_[role=radio]]:pointer-events-none opacity-95 select-none" : ""} aria-disabled={isSampleMode || undefined} title={isSampleMode ? "Read-only in tour mode (expand to view details)" : undefined}>
                                          <PhaseScheduler
                                            phases={market.phases || []}
                                            onPhasesChange={(phases) => {
                                              setPlatformsWithMarkets((prev) =>
                                                prev.map((p) =>
                                                  p.id === platform.id
                                                    ? {
                                                        ...p,
                                                        markets: p.markets.map((m) =>
                                                          m.id === market.id ? { ...m, phases } : m,
                                                        ),
                                                      }
                                                    : p,
                                                ),
                                              );
                                            }}
                                            onManualPhasesChange={(phases) => {
                                              skipPhaseSyncRef.current = true;
                                              setPlatformsWithMarkets((prev) =>
                                                prev.map((p) =>
                                                  p.id === platform.id
                                                    ? {
                                                        ...p,
                                                        markets: p.markets.map((m) =>
                                                          m.id === market.id
                                                            ? { ...m, phases, strategy: "manual" as const }
                                                            : m,
                                                        ),
                                                      }
                                                    : p,
                                                ),
                                              );
                                              if (genericConfig.strategy === "auto-detect") {
                                                setGenericConfig((prev) => ({ ...prev, strategy: "manual" }));
                                              }
                                            }}
                                            onSkipNextSync={() => {
                                              skipPhaseSyncRef.current = true;
                                            }}
                                            onManualPhaseEdit={() => {
                                              setPlatformsWithMarkets((prev) =>
                                                prev.map((p) =>
                                                  p.id === platform.id
                                                    ? {
                                                        ...p,
                                                        markets: p.markets.map((m) =>
                                                          m.id === market.id ? { ...m, strategy: "manual" as const } : m,
                                                        ),
                                                      }
                                                    : p,
                                                ),
                                              );
                                              if (genericConfig.strategy === "auto-detect") {
                                                setGenericConfig((prev) => ({ ...prev, strategy: "manual" }));
                                              }
                                            }}
                                            startDate={startDate}
                                            endDate={endDate}
                                            platformName={platform.name}
                                            platformId={platform.id}
                                            adAccountId={market.adAccountId || (platform.id === 'meta' ? firstAdAccountId : platform.id === 'tiktok' ? firstTiktokAdvertiserId : platform.id === 'google' || platform.id === 'google_ads' ? firstGoogleCustomerId : undefined) || undefined}
                                            basicTargeting={basicTargeting}
                                            strategy={market.strategy || genericConfig.strategy}
                                            strategyFocus={market.strategyFocus || genericConfig.strategyFocus}
                                            adAccountDefaults={{
                                              hasDefaults: true,
                                              publisherPlatforms:
                                                market.metaPublisherPlatforms || market.publisherPlatforms,
                                              positions: market.metaPositions || market.positions,
                                              metaAdvantagePlusPlacements: market.metaAdvantagePlusPlacements,
                                              tiktokPlacementType: market.tiktokPlacementType,
                                              tiktokPlacements: market.tiktokPlacements,
                                              // Meta destination defaults from market (loaded from account defaults)
                                              metaOptimizationLocation: (market as any).metaOptimizationLocation,
                                              metaAppStore: (market as any).metaAppStore,
                                              metaAppId: (market as any).metaAppId,
                                              metaMessagingMode: (market as any).metaMessagingMode,
                                              metaMessengerEnabled: (market as any).metaMessengerEnabled,
                                              metaInstagramDmEnabled: (market as any).metaInstagramDmEnabled,
                                              metaWhatsappEnabled: (market as any).metaWhatsappEnabled,
                                              metaWhatsappNumber: (market as any).metaWhatsappNumber,
                                              metaPageId: market.pageId,
                                              metaInstagramAccountId: market.instagramActorId,
                                              metaLandingPageUrl: (market as any).metaLandingPageUrl,
                                              // Meta advanced settings defaults
                                              metaBidStrategy: market.metaBidStrategy,
                                              metaBidAmount: market.metaBidAmount,
                                              metaClickWindow: (market as any).metaClickWindow,
                                              metaViewWindow: (market as any).metaViewWindow,
                                              metaBillingEvent: (market as any).metaBillingEvent,
                                              // TikTok destination defaults from market (loaded from account defaults)
                                              tiktokOptimizationLocation: market.tiktokOptimizationLocation,
                                              tiktokAppId: market.tiktokAppId,
                                              tiktokAppName: market.tiktokAppName,
                                              tiktokMessagingApp: (market as any).tiktokMessagingApp,
                                              tiktokFacebookPageId: (market as any).tiktokFacebookPageId,
                                              tiktokMessageEventSet: (market as any).tiktokMessageEventSet,
                                              tiktokWhatsappNumber: (market as any).tiktokWhatsappNumber,
                                              tiktokZaloAccountId: (market as any).tiktokZaloAccountId,
                                              tiktokLineBusinessId: (market as any).tiktokLineBusinessId,
                                              tiktokLandingPageUrl: market.tiktokLandingPageUrl,
                                              // TikTok advanced settings defaults
                                              tiktokBidStrategy: market.tiktokBidStrategy,
                                              tiktokBidAmount: market.tiktokBidAmount,
                                              tiktokClickWindow: (market as any).tiktokClickWindow,
                                              tiktokViewWindow: (market as any).tiktokViewWindow,
                                              tiktokBillingEvent: (market as any).tiktokBillingEvent,
                                              // Catalog & Product Set defaults
                                              metaCatalogId: market.catalog,
                                              metaProductSetId: market.productSet,
                                              tiktokCatalogId: (market as any).tiktokCatalogId,
                                              tiktokProductSetId: (market as any).tiktokProductSetId,
                                              // Google Ads defaults
                                              googleLandingPageUrl: (market as any).googleLandingPageUrl,
                                              googleBidStrategy: (market as any).googleBidStrategy,
                                              googleTargetCpa: (market as any).googleTargetCpa,
                                              googleTargetRoas: (market as any).googleTargetRoas,
                                              googleMaxCpcBid: (market as any).googleMaxCpcBid,
                                            }}
                                            marketTargeting={{
                                              ageMin: market.ageMin || genericConfig.targeting?.ageMin,
                                              ageMax: market.ageMax || genericConfig.targeting?.ageMax,
                                              gender: market.gender || genericConfig.targeting?.genders?.[0],
                                              languages:
                                                (market as any).languages ||
                                                (genericConfig.targeting as any)?.languages,
                                              devices:
                                                (market as any).devices || (genericConfig.targeting as any)?.devices,
                                              os: (market as any).os || (genericConfig.targeting as any)?.os,
                                            }}
                                            onApplyBudgetTypeToAll={(type) => {
                                              skipPhaseSyncRef.current = true;
                                              setPlatformsWithMarkets((prev) =>
                                                prev.map((p) =>
                                                  p.id === platform.id
                                                    ? {
                                                        ...p,
                                                        markets: p.markets.map((m) => ({
                                                          ...m,
                                                          phases: (m.phases || []).map((ph) => ({
                                                            ...ph,
                                                            budgetType: type,
                                                          })),
                                                        })),
                                                      }
                                                    : p,
                                                ),
                                              );
                                              toast.success(
                                                `Applied ${type === "daily" ? "Daily" : "Lifetime"} Budget to all phases in ${platform.name}`,
                                              );
                                            }}
                                            onOpenCustomizeBudgetTypes={() => {
                                              setBulkPlatform(platform as any);
                                              setBulkBudgetDialogOpen(true);
                                            }}
                                            marketBudget={
                                              parseFloat(totalBudget || "0") *
                                              ((platform.budgetPercentage || 0) / 100) *
                                              ((market.budgetPercentage || 0) / 100)
                                            }
                                            activationContext={{
                                              activationName: campaignName,
                                              boNumber: boNumber,
                                              clientName: clients.find((c) => c.id === selectedClientId)?.name,
                                              teamName: teamName,
                                              totalBudget: parseFloat(totalBudget || "0"),
                                              market: market.name,
                                              markets: platform.markets.map((m) => m.name),
                                              platformBudget:
                                                parseFloat(totalBudget || "0") *
                                                ((platform.budgetPercentage || 0) / 100),
                                            }}
                                            onTaxonomyValidationChange={(isComplete, missingCount) =>
                                              handleMarketTaxonomyValidation(market.id, isComplete, missingCount)
                                            }
                                            phaseExpandSignal={phaseExpandSignal}
                                          />
                                          </div>
                                        </div>
                                      </CollapsibleContent>
                                    </Card>
                                  </Collapsible>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ) : null,
                      )}
                    </div>
                  );
                }

                return null;
              })()}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>
                  Back
                </Button>
                <Button
                  onClick={async () => {
                    // Only generate phases if markets don't have phases yet
                    const totalMarkets = platformsWithMarkets.reduce(
                      (sum, p) => sum + (p.enabled ? p.markets.length : 0),
                      0,
                    );

                    // Skip auto-generation if there's only 1 market (phases are configured in PhaseScheduler above)
                    if (totalMarkets > 1) {
                      // Check if any market is missing phases
                      const needsPhaseGeneration = platformsWithMarkets.some(
                        (platform) =>
                          platform.enabled &&
                          platform.markets.some((market) => !market.phases || market.phases.length === 0),
                      );

                      if (needsPhaseGeneration) {
                        if (genericConfig.strategy === "auto-detect") {
                          const updatedPlatforms = platformsWithMarkets.map((platform) => ({
                            ...platform,
                            markets: platform.markets.map((market) => {
                              // Only generate if market doesn't have phases
                              if (market.phases && market.phases.length > 0) {
                                return market;
                              }

                              const adFormats = market.adFormats || genericConfig.targeting?.adFormats || [];
                              const hasPixel = !!market.pixel;
                              const hasCatalog = !!market.catalog;

                              const detectedFocus = determineStrategyFocus({
                                adFormats,
                                hasPixel,
                                hasCatalog,
                              });

                              const phases = generateAutoDetectPhases(
                                adFormats,
                                hasPixel,
                                hasCatalog,
                                startDate,
                                endDate,
                                platform.id,
                              );
                              return {
                                ...market,
                                strategyFocus: detectedFocus || "conversions",
                                phases: phases.map((p) => ({
                                  ...p,
                                  id: `phase-${market.id}-${p.id}`,
                                })),
                              };
                            }),
                          }));
                          setPlatformsWithMarkets(updatedPlatforms);
                        } else if (
                          genericConfig.strategy === "full-funnel" &&
                          genericConfig.strategyFocus &&
                          genericConfig.strategyFocus !== "auto"
                        ) {
                          const updatedPlatforms = platformsWithMarkets.map((platform) => {
                            const phases = getDefaultPhases(
                              genericConfig.strategyFocus,
                              startDate,
                              endDate,
                              platform.id,
                            );
                            return {
                              ...platform,
                              markets: platform.markets.map((market) => {
                                // Only generate if market doesn't have phases
                                if (market.phases && market.phases.length > 0) {
                                  return market;
                                }
                                return {
                                  ...market,
                                  phases: phases.map((p) => ({
                                    ...p,
                                    id: `phase-${market.id}-${p.id}`,
                                  })),
                                };
                              }),
                            };
                          });
                          setPlatformsWithMarkets(updatedPlatforms);
                        } else if (genericConfig.strategy === "manual") {
                          const updatedPlatforms = platformsWithMarkets.map((platform) => ({
                            ...platform,
                            markets: platform.markets.map((market) => {
                              // Only generate if market doesn't have phases
                              if (market.phases && market.phases.length > 0) {
                                return market;
                              }
                              return {
                                ...market,
                                phases: [
                                  {
                                    id: `phase-${market.id}-${Date.now()}`,
                                    name: "Campaign 1",
                                    startDate: startDate,
                                    endDate: endDate,
                                    budgetPercentage: 100,
                                  },
                                ],
                              };
                            }),
                          }));
                          setPlatformsWithMarkets(updatedPlatforms);
                        }
                      }
                    }
                    await applyBudgetTypeDefaultsIfAvailable();
                    if (!validateBudgetTypes()) {
                      return;
                    }
                    // Check taxonomy validation before proceeding
                    if (!isTaxonomyComplete()) {
                      const missingCount = getTotalMissingTaxonomyFields();
                      toast.error(
                        `Please fill all required custom taxonomy fields before proceeding (${missingCount} field${missingCount === 1 ? "" : "s"} missing)`,
                      );
                      return;
                    }
                    await ensureDraft();
                    setCurrentStep(4);
                  }}
                  disabled={
                    !isSampleMode && (
                      !genericConfig.strategy ||
                      (genericConfig.strategy !== "auto-detect" && !genericConfig.strategyFocus)
                    )
                  }
                >
                  Next: Forecast & Save
                </Button>
              </div>
            </CardContent>
          ) : (
            <CardContent className="py-4">
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Strategy:</span>
                  <span className="font-medium text-foreground capitalize">
                    {genericConfig.strategy?.replace("-", " ")}
                  </span>
                </div>
                {genericConfig.strategy !== "auto-detect" && (
                  <div className="flex justify-between">
                    <span>Focus:</span>
                    <span className="font-medium text-foreground capitalize">
                      {genericConfig.strategyFocus?.replace("-", " ")}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Step 4: Campaign Forecast */}
      {currentStep === 4 && (
        <CampaignForecast
          platforms={platformsWithMarkets}
          totalBudget={parseFloat(totalBudget) || 0}
          genericConfig={genericConfigResolved}
          clientBranding={(() => {
            const client = clients.find((c) => c.id === selectedClientId) as any;
            return client ? {
              name: client.name,
              client_logo_url: client.client_logo_url,
              agency_logo_url: client.agency_logo_url,
              brand_font_color: client.brand_font_color,
              brand_background_color: client.brand_background_color,
              brand_foreground_color: client.brand_foreground_color,
            } : undefined;
          })()}
          startDate={startDate}
          endDate={endDate}
          campaignId={savedCampaignId || undefined}
          basicTargeting={basicTargeting}
          clientIndustry={
            clients.find((c) => c.id === selectedClientId)?.industry || (genericConfig as any)?.clientIndustry
          }
          selectedKeywords={basicTargeting.selectedKeywords || []}
          onKeywordsUpdate={(keywords) => {
            const updated = { ...basicTargeting, selectedKeywords: keywords };
            setBasicTargeting(updated);
            localStorage.setItem("basicTargeting", JSON.stringify(updated));
            
            // Save to database
            if (savedCampaignId && user) {
              (async () => {
                try {
                  const { data: currentCampaign } = await supabase
                    .from("campaigns")
                    .select("generic_config")
                    .eq("id", savedCampaignId)
                    .single();
                  const currentConfig =
                    currentCampaign?.generic_config && typeof currentCampaign.generic_config === "object"
                      ? (currentCampaign.generic_config as Record<string, unknown>)
                      : {};
                  await supabase
                    .from("campaigns")
                    .update({
                      updated_at: new Date().toISOString(),
                      generic_config: { ...currentConfig, basicTargeting: updated } as any,
                    })
                    .eq("id", savedCampaignId);
                } catch (error) {
                  console.error("Error saving keywords:", error);
                }
              })();
            }
          }}
          googleCustomerId={firstGoogleCustomerId || undefined}
          tiktokAdvertiserId={firstTiktokAdvertiserId || undefined}
          onBack={() => setCurrentStep(3)}
          onFinalize={handleLaunch}
          onBudgetOptimize={(newPlatforms) => {
            setPlatformsWithMarkets(newPlatforms);
          }}
        />
      )}

      {/* Dialogs */}
      <PlatformSelectionDialog
        open={platformDialogOpen}
        onOpenChange={setPlatformDialogOpen}
        availablePlatforms={getAvailablePlatforms()}
        onConfirm={handlePlatformDuplicationConfirm}
      />

      <MarketSelectionDialog
        open={marketDialogOpen}
        onOpenChange={setMarketDialogOpen}
        onConfirm={handleMarketDuplicationConfirm}
      />

      <CampaignBudgetTypeDialog
        open={budgetTypeDialogOpen}
        onOpenChange={setBudgetTypeDialogOpen}
        onConfirm={handleBudgetTypeConfirm}
        campaigns={
          selectedMarketForBudget?.phases.map((phase) => ({
            id: phase.id,
            name: phase.name,
            budgetType: phase.budgetType,
            startDate: phase.startDate,
            endDate: phase.endDate,
          })) || []
        }
        marketBudget={selectedMarketForBudget?.marketBudget || 0}
      />

      <BulkBudgetTypeDialog
        open={bulkBudgetDialogOpen}
        onOpenChange={setBulkBudgetDialogOpen}
        platform={bulkPlatform}
        onSave={(updatedMarkets) => {
          if (!bulkPlatform) return;
          skipPhaseSyncRef.current = true;
          setPlatformsWithMarkets((prev) =>
            prev.map((p) => (p.id === bulkPlatform.id ? { ...p, markets: updatedMarkets } : p)),
          );
          toast.success("Budget types updated across markets.");
        }}
      />

      {/* Auto-Mesh Dialog */}
      <CreativeMatchingDialog
        open={creativeMatcherOpen}
        onOpenChange={setCreativeMatcherOpen}
        campaignId={savedCampaignId || undefined}
        campaignName={campaignName}
      />
    </div>
  );
}
