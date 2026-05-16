import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PlatformWithMarkets } from "@/types/mediaplan";
import { GenericConfig } from "./GenericStrategyConfig";
import { Loader2, TrendingUp, Users, Eye, Target, DollarSign, Download, Mail, FileSpreadsheet, FileText, ChevronDown, Rocket, Wand2, RefreshCw, Lightbulb, History, RotateCcw } from "lucide-react";
import { analyzeBudgetOptimization, applyBudgetOptimization, BudgetOptimizationResult } from "@/utils/budgetOptimization";
import { BudgetRecommendationDialog } from "./BudgetRecommendationDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useForecastVersions } from "@/hooks/useForecastVersions";
import { useSampleMode } from "@/contexts/SampleModeContext";
import { getOptimizationGoalMetrics, getResultLabel, calculateResultFromImpressions } from "@/utils/optimizationGoals";
import { getObjectiveFromPhaseName } from "@/utils/phaseObjectiveMapping";
import { downloadMediaPlanPDF } from "@/utils/pdfGenerator";
import { downloadMediaPlanExcel } from "@/utils/excelGenerator";
import { ApprovalDialog } from "./ApprovalDialog";
import { ActiplanDeliverablesView } from "./ActiplanDeliverablesView";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LockedFeatureButton } from "@/components/ui/locked-feature-button";
import { getAllBenchmarks, BenchmarkData, lookupBenchmark, getPlatformKeyFromId, isRevenueBasedGoal, isClickBasedGoal, calculateBenchmarkCTR, calculateBenchmarkROAS } from "@/utils/benchmarkData";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { KeywordItem } from "./KeywordTargeting";
import { ShieldCheck, Target as TargetIcon, Swords, Ban } from "lucide-react";
import { buildSearchStrategyCampaignName, getEffectiveSearchKeywords, getSearchStrategyGroups, isSearchPhaseLike } from "@/utils/searchStrategyCampaigns";
import { ForecastOptionsDialog, ForecastOptions } from "./ForecastOptionsDialog";
import { MarkupPreviewDialog, MarkupPreviewData } from "./MarkupPreviewDialog";
import { Step5ForecastNav } from "./Step5ForecastNav";
import { getEdgeFunctionErrorMessage } from "@/utils/edgeFunctionError";

// Helper: call AI forecast with retry + exponential backoff for 429 rate limits
const invokeAIForecastWithRetry = async (
  body: Record<string, unknown>,
  maxRetries = 3,
  baseDelayMs = 2000
): Promise<{ data: any; error: any }> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { data, error } = await supabase.functions.invoke('ai-forecast', { body });
    
    // Check for rate limit (429) — supabase.functions.invoke wraps HTTP errors
    const is429 = error?.message?.includes('429') || 
                   error?.status === 429 ||
                   (data && typeof data === 'object' && data.error?.includes?.('Rate limit'));
    
    if (is429 && attempt < maxRetries) {
      const delay = baseDelayMs * Math.pow(2, attempt); // 2s, 4s, 8s
      console.warn(`⏳ AI forecast rate-limited (429). Retry ${attempt + 1}/${maxRetries} in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    
    return { data, error };
  }
  return { data: null, error: new Error('AI forecast failed after max retries (429 rate limit)') };
};

// Helper: small delay between sequential forecast calls to avoid bursting
const throttleDelay = (ms = 300) => new Promise(r => setTimeout(r, ms));

// Helper to normalize strategyFocus, filtering out "auto" placeholder
const getEffectiveStrategyFocus = (marketFocus?: string, genericFocus?: string): string => {
  if (marketFocus && marketFocus !== "auto") return marketFocus;
  if (genericFocus && genericFocus !== "auto") return genericFocus;
  return "conversions";
};

interface BasicTargetingConfig {
  defaultAdSetSplitDimension?: string;
  defaultAdSetSplitDimensionPerPlatform?: Record<string, string>;
  defaultAdSets?: Array<{ id: string; name: string; budgetPercentage: number; dimensionValue?: any }>;
  defaultAdSetsPerPlatform?: Record<string, Array<{ id: string; name: string; budgetPercentage: number; dimensionValue?: any }>>;
  defaultAdSetSplitUseCBO?: boolean;
}

interface CampaignForecastProps {
  platforms: PlatformWithMarkets[];
  totalBudget: number;
  genericConfig: GenericConfig;
  clientBranding?: {
    name?: string;
    client_logo_url?: string | null;
    agency_logo_url?: string | null;
    brand_font_color?: string | null;
    brand_background_color?: string | null;
    brand_foreground_color?: string | null;
  };
  startDate: string;
  endDate: string;
  campaignId?: string;
  basicTargeting?: BasicTargetingConfig;
  clientIndustry?: string;
  selectedKeywords?: KeywordItem[];
  onKeywordsUpdate?: (keywords: KeywordItem[]) => void;
  googleCustomerId?: string;
  tiktokAdvertiserId?: string;
  onBack: () => void;
  onFinalize: () => void;
  onBudgetOptimize?: (newPlatforms: PlatformWithMarkets[]) => void;
}

interface ForecastMetrics {
  audienceSize: number;
  reach: number;
  impressions: number;
  cpm: number;
  frequency?: number;
  result: number;
  resultLabel: string;
  resultKPI: string;
  costPerResult: number;
  resultRate: number;
  resultRateName: string;
  objective?: string;
  optimizationGoal?: string;
  destination?: string;
  dataSource?: 'live_api' | 'estimated' | 'ai_predicted'; // Track whether data is from live API, AI predicted, or estimated
}

interface AdSetForecast {
  adSetName: string;
  budget: number;
  budgetPercentage: number;
  impressions: number;
  reach: number;
  result: number;
  costPerResult: number;
}

interface PhaseForecast {
  phaseName: string;
  budget: number;
  startDate: string;
  endDate: string;
  kpi: string;
  optimizationGoal: string;
  result: number;
  costPerResult: number;
  resultRate: number;
  isBenchmarkBased?: boolean; // Indicates if result is based on actual benchmark data
  adSets?: AdSetForecast[];
  strategyCampaigns?: Array<{
    strategy: "brand" | "generic" | "competition";
    campaignName: string;
    budget: number;
    budgetPercentage: number;
    searchVolume: number;
    keywordsCount: number;
    negativeKeywordsCount: number;
    impressions: number;
    reach: number;
    result: number;
    costPerResult: number;
    resultRate: number;
    kpi: string;
    startDate: string;
    endDate: string;
    ctr?: number | null;
    roas?: number | null;
  }>;
  ctr?: number | null; // Calculated CTR for click/visit-based goals
  roas?: number | null; // Calculated ROAS for revenue-based goals
}

interface MarketForecast {
  marketName: string;
  marketCode?: string;
  budget: number;
  audienceSize: number;
  impressions: number;
  reach: number;
  cpm: number;
  frequency: number;
  sov: number;
  resultsByGoal: Array<{
    goal: string;
    kpi: string;
    result: number;
    costPerResult: number;
    resultRate: number;
  }>;
  phases: PhaseForecast[];
}

interface PlatformForecast {
  platformId: string;
  platformName: string;
  totalBudget: number;
  totalAudienceSize: number;
  totalImpressions: number;
  totalReach: number;
  avgCPM: number;
  frequency: number;
  sov: number;
  dataSource?: 'live_api' | 'estimated' | 'ai_predicted'; // Track data source at platform level
  markets: MarketForecast[];
}

interface ActiplanForecast {
  totalBudget: number;
  totalAudienceSize: number;
  totalImpressions: number;
  totalReach: number;
  avgCPM: number;
  frequency: number;
  sov: number;
  totalResults: number;
  avgCostPerResult: number;
  platformDeliverables: Record<string, Array<{ kpi: string; result: number }>>;
  platforms: PlatformForecast[];
}

interface CampaignForecast {
  market: string;
  budget: number;
  metrics: ForecastMetrics;
  campaign?: string;
  dates?: string;
}

export function CampaignForecast({
  platforms,
  totalBudget,
  genericConfig,
  clientBranding,
  startDate,
  endDate,
  campaignId,
  basicTargeting,
  clientIndustry,
  selectedKeywords,
  onKeywordsUpdate,
  googleCustomerId,
  tiktokAdvertiserId,
  onBack,
  onFinalize,
  onBudgetOptimize,
}: CampaignForecastProps) {
  const navigate = useNavigate();
  const { isSampleMode } = useSampleMode();
  const [loading, setLoading] = useState(false);
  const [forecasts, setForecasts] = useState<Record<string, CampaignForecast[]>>({});
  const [actiplanForecast, setActiplanForecast] = useState<ActiplanForecast | null>(null);
  const [debugInfo, setDebugInfo] = useState<{startTimeUnix: number; endTimeUnix: number; startDateFormatted: string; endDateFormatted: string} | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [pdfBase64Data, setPdfBase64Data] = useState<string>("");
  const [excelBase64Data, setExcelBase64Data] = useState<string>("");
  const [hasExistingForecast, setHasExistingForecast] = useState(false);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({});
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({});
  const [existingLoadComplete, setExistingLoadComplete] = useState(false);
  const [benchmarks, setBenchmarks] = useState<Map<string, BenchmarkData>>(new Map());
  const [isSyncingBenchmarks, setIsSyncingBenchmarks] = useState(false);
  const [budgetOptimization, setBudgetOptimization] = useState<BudgetOptimizationResult | null>(null);
  const [budgetRecommendationOpen, setBudgetRecommendationOpen] = useState(false);
  const lastPoppedForecastId = useRef<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [forecastOptionsOpen, setForecastOptionsOpen] = useState(false);
  const [pendingForecastOptions, setPendingForecastOptions] = useState<ForecastOptions | null>(null);
  const [markupPreviewData, setMarkupPreviewData] = useState<MarkupPreviewData | null>(null);
  const [markupPreviewOpen, setMarkupPreviewOpen] = useState(false);
  const [pendingMarkupState, setPendingMarkupState] = useState<{
    forecasts: Record<string, CampaignForecast[]>;
    actiplan: ActiplanForecast;
    options: ForecastOptions;
  } | null>(null);
  const { versions, loading: versionsLoading, saveVersion, loadVersions } = useForecastVersions(campaignId);
  const persistedClientIndustry = (genericConfig as any)?.clientIndustry as string | undefined;
  const persistedClientId = (genericConfig as any)?.selectedClientId as string | undefined;
  const [resolvedIndustry, setResolvedIndustry] = useState<string | undefined>(
    clientIndustry || persistedClientIndustry,
  );

  // Resolve industry from explicit client selection, saved campaign config, or linked ad accounts
  useEffect(() => {
    const resolveIndustryFromAdAccounts = async () => {
      const directIndustry = clientIndustry || persistedClientIndustry;
      if (directIndustry) {
        setResolvedIndustry(directIndustry);
        return;
      }

      try {
        if (persistedClientId) {
          const { data: selectedClient, error: selectedClientError } = await supabase
            .from("clients")
            .select("industry")
            .eq("id", persistedClientId)
            .maybeSingle();

          if (selectedClientError) throw selectedClientError;

          if (selectedClient?.industry) {
            console.log(`✅ Resolved industry from selected client ${persistedClientId}: ${selectedClient.industry}`);
            setResolvedIndustry(selectedClient.industry);
            return;
          }
        }

        if (campaignId) {
          const { data: campaign, error: campaignError } = await supabase
            .from("campaigns")
            .select("generic_config")
            .eq("id", campaignId)
            .maybeSingle();

          if (campaignError) throw campaignError;

          const savedConfig = (campaign?.generic_config as Record<string, any> | null) || null;
          const savedIndustry = savedConfig?.clientIndustry as string | undefined;
          const savedClientId = savedConfig?.selectedClientId as string | undefined;

          if (savedIndustry) {
            console.log(`✅ Resolved industry from saved campaign config: ${savedIndustry}`);
            setResolvedIndustry(savedIndustry);
            return;
          }

          if (savedClientId) {
            const { data: savedClient, error: savedClientError } = await supabase
              .from("clients")
              .select("industry")
              .eq("id", savedClientId)
              .maybeSingle();

            if (savedClientError) throw savedClientError;

            if (savedClient?.industry) {
              console.log(`✅ Resolved industry from saved client ${savedClientId}: ${savedClient.industry}`);
              setResolvedIndustry(savedClient.industry);
              return;
            }
          }
        }

        const isUuid = (value: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

        const metaInternalIds = new Set<string>();
        const metaExternalIds = new Set<string>();
        const googleInternalIds = new Set<string>();
        const googleExternalIds = new Set<string>();
        const tiktokInternalIds = new Set<string>();
        const tiktokExternalIds = new Set<string>();
        const snapchatInternalIds = new Set<string>();
        const snapchatExternalIds = new Set<string>();

        for (const platform of platforms) {
          const platformKey = getPlatformKeyFromId(platform.id);

          for (const market of platform.markets) {
            const rawAccountId = market.adAccountId?.trim();
            if (!rawAccountId) continue;

            if (platformKey === "meta") {
              if (isUuid(rawAccountId)) {
                metaInternalIds.add(rawAccountId);
              } else {
                const accountId = rawAccountId.replace(/^act_/, "");
                metaExternalIds.add(accountId);
                metaExternalIds.add(`act_${accountId}`);
              }
            }

            if (platformKey === "google") {
              if (isUuid(rawAccountId)) {
                googleInternalIds.add(rawAccountId);
              } else {
                googleExternalIds.add(rawAccountId);
                googleExternalIds.add(rawAccountId.replace(/-/g, ""));
              }
            }

            if (platformKey === "tiktok") {
              if (isUuid(rawAccountId)) {
                tiktokInternalIds.add(rawAccountId);
              } else {
                tiktokExternalIds.add(rawAccountId);
              }
            }

            if (platformKey === "snapchat") {
              if (isUuid(rawAccountId)) {
                snapchatInternalIds.add(rawAccountId);
              } else {
                snapchatExternalIds.add(rawAccountId);
              }
            }
          }
        }

        if (
          metaInternalIds.size === 0 &&
          metaExternalIds.size === 0 &&
          googleInternalIds.size === 0 &&
          googleExternalIds.size === 0 &&
          tiktokInternalIds.size === 0 &&
          tiktokExternalIds.size === 0 &&
          snapchatInternalIds.size === 0 &&
          snapchatExternalIds.size === 0
        ) {
          console.log("📊 No linked ad accounts found in campaign, cannot resolve industry");
          setResolvedIndustry(undefined);
          return;
        }

        console.log("📊 Resolving industry from ad accounts:", {
          metaInternal: Array.from(metaInternalIds),
          metaExternal: Array.from(metaExternalIds),
          googleInternal: Array.from(googleInternalIds),
          googleExternal: Array.from(googleExternalIds),
          tiktokInternal: Array.from(tiktokInternalIds),
          tiktokExternal: Array.from(tiktokExternalIds),
          snapchatInternal: Array.from(snapchatInternalIds),
          snapchatExternal: Array.from(snapchatExternalIds),
        });

        const accountResults = await Promise.all([
          metaInternalIds.size > 0
            ? supabase
                .from("meta_ad_accounts")
                .select("id, account_id, client_id, clients(industry)")
                .in("id", Array.from(metaInternalIds))
            : Promise.resolve({ data: [], error: null }),
          metaExternalIds.size > 0
            ? supabase
                .from("meta_ad_accounts")
                .select("id, account_id, client_id, clients(industry)")
                .in("account_id", Array.from(metaExternalIds))
            : Promise.resolve({ data: [], error: null }),
          googleInternalIds.size > 0
            ? supabase
                .from("google_ad_accounts")
                .select("id, customer_id, client_id, clients(industry)")
                .in("id", Array.from(googleInternalIds))
            : Promise.resolve({ data: [], error: null }),
          googleExternalIds.size > 0
            ? supabase
                .from("google_ad_accounts")
                .select("id, customer_id, client_id, clients(industry)")
                .in("customer_id", Array.from(googleExternalIds))
            : Promise.resolve({ data: [], error: null }),
          tiktokInternalIds.size > 0
            ? supabase
                .from("tiktok_ad_accounts")
                .select("id, advertiser_id, account_id, client_id, clients(industry)")
                .in("id", Array.from(tiktokInternalIds))
            : Promise.resolve({ data: [], error: null }),
          tiktokExternalIds.size > 0
            ? supabase
                .from("tiktok_ad_accounts")
                .select("id, advertiser_id, account_id, client_id, clients(industry)")
                .in("advertiser_id", Array.from(tiktokExternalIds))
            : Promise.resolve({ data: [], error: null }),
          snapchatInternalIds.size > 0
            ? supabase
                .from("snapchat_ad_accounts")
                .select("id, advertiser_id, account_id, client_id, clients(industry)")
                .in("id", Array.from(snapchatInternalIds))
            : Promise.resolve({ data: [], error: null }),
          snapchatExternalIds.size > 0
            ? supabase
                .from("snapchat_ad_accounts")
                .select("id, advertiser_id, account_id, client_id, clients(industry)")
                .in("account_id", Array.from(snapchatExternalIds))
            : Promise.resolve({ data: [], error: null }),
        ]);

        const accountError = accountResults.find((result) => result.error)?.error;
        if (accountError) throw accountError;

        const accounts = accountResults.flatMap((result) => result.data || []);

        for (const acc of accounts) {
          const clientRelation = (acc as any).clients;
          const industry = Array.isArray(clientRelation)
            ? clientRelation[0]?.industry
            : clientRelation?.industry;

          if (industry) {
            const accountLabel =
              (acc as any).account_id ||
              (acc as any).customer_id ||
              (acc as any).advertiser_id ||
              (acc as any).id;
            console.log(`✅ Resolved industry from linked ad account ${accountLabel}: ${industry}`);
            setResolvedIndustry(industry);
            return;
          }
        }

        console.log("⚠️ Could not resolve industry from client or linked ad accounts");
        setResolvedIndustry(undefined);
      } catch (error) {
        console.error("Error resolving industry from ad accounts:", error);
      }
    };

    resolveIndustryFromAdAccounts();
  }, [campaignId, clientIndustry, persistedClientId, persistedClientIndustry, platforms]);

  // Load existing forecast on mount
  useEffect(() => {
    const loadExistingForecast = async () => {
      if (!campaignId) return;

      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('forecast_data, updated_at')
          .eq('id', campaignId)
          .single();

        const forecastData = campaign?.forecast_data as any;

        if (forecastData?.forecasts && Object.keys(forecastData.forecasts).length > 0) {
          setForecasts(forecastData.forecasts);
          if (forecastData.actiplanForecast) {
            setActiplanForecast(forecastData.actiplanForecast);
          }
          setHasExistingForecast(true);
          console.log("Loaded existing forecast data");
        }
      } catch (error) {
        console.error("Error loading existing forecast:", error);
      } finally {
        setExistingLoadComplete(true);
      }
    };

    const loadBenchmarks = async () => {
      console.log("📊 Loading benchmarks for industry:", resolvedIndustry || "(none)");
      // Load all benchmarks (no platform filter - we filter at lookup time)
      const benchmarkData = await getAllBenchmarks(resolvedIndustry);
      setBenchmarks(benchmarkData);
      console.log(`✅ Loaded ${benchmarkData.size} benchmarks:`);
      
      // Log details of each benchmark
      benchmarkData.forEach((benchmark, key) => {
        console.log(`  • ${key}: CPR=$${benchmark.avg_cost_per_result?.toFixed(2) || 'N/A'}, Platform=${(benchmark as any).platform || 'unknown'}, Industry=${benchmark.industry}, Campaigns=${benchmark.campaign_count}`);
      });
    };

    loadExistingForecast();
    loadBenchmarks();
  }, [campaignId, resolvedIndustry]);

  useEffect(() => {
    if (!existingLoadComplete || versionsLoading || hasExistingForecast || Object.keys(forecasts).length > 0) return;

    const latestVersion = versions[0];
    const latestForecast = latestVersion?.forecast_data as any;
    if (!latestForecast?.forecasts || Object.keys(latestForecast.forecasts).length === 0) return;

    setForecasts(latestForecast.forecasts);
    if (latestForecast.actiplanForecast) {
      setActiplanForecast(latestForecast.actiplanForecast);
    }
    setHasExistingForecast(true);
    console.log("Loaded latest saved forecast version");
  }, [existingLoadComplete, versionsLoading, versions, hasExistingForecast, forecasts]);

  // Auto-fetch forecasts once existing-load check completes and none exist yet
  // Note: we also auto-fetch in sample/tour mode so the seeded ActiPlan shows
  // populated estimates instead of an empty "Click Fetch Forecasts" placeholder.
  useEffect(() => {
    if (!existingLoadComplete) return;
    if (versionsLoading) return;
    if (loading) return;
    if (hasExistingForecast) return;
    if (Object.keys(forecasts).length > 0) return;
    if (!totalBudget || totalBudget <= 0) return;
    if (!platforms || platforms.length === 0) return;

    // Trigger a single automatic fetch on first load of the Forecast step
    handleFetchForecasts(undefined);
  }, [existingLoadComplete, versionsLoading, loading, hasExistingForecast, forecasts, totalBudget, platforms]);

  // Auto-save forecast data when it changes
  useEffect(() => {
    const saveForecastData = async () => {
      if (!campaignId || Object.keys(forecasts).length === 0) return;

      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const totalMetrics = getTotalMetrics();
        
        await (supabase as any).from('campaigns')
          .update({ 
            forecast_data: {
              generatedAt: new Date().toISOString(),
              forecasts,
              actiplanForecast,
              totalMetrics: totalMetrics ? {
                reach: totalMetrics.reach,
                impressions: totalMetrics.impressions,
                cpm: totalMetrics.cpm,
                sov: totalMetrics.sov,
                audienceSize: totalMetrics.audienceSize,
              } : null,
            }
          })
          .eq('id', campaignId);
        
        console.log("Forecast data auto-saved");
      } catch (error) {
        console.error("Error auto-saving forecast data:", error);
      }
    };

    saveForecastData();
  }, [forecasts, actiplanForecast, campaignId]);

  // Sync benchmarks for all selected ad accounts across platforms
  const syncBenchmarksForSelectedAccounts = async (): Promise<void> => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id ?? null;

    // Extract unique account IDs from platforms
    const metaAccountIds = new Set<string>();
    const tiktokAdvertiserIds = new Set<string>();
    const googleAccountIds = new Set<string>();

    for (const platform of platforms) {
      const platformName = platform.id.toLowerCase();
      const isMeta = platformName.includes("facebook") || platformName.includes("instagram") || platformName.includes("meta");
      const isTikTok = platformName.includes("tiktok");
      const isGoogle = platformName.includes("google");

      for (const market of platform.markets) {
        if (market.adAccountId) {
          if (isMeta) {
            const cleanId = market.adAccountId.startsWith("act_") 
              ? market.adAccountId 
              : `act_${market.adAccountId}`;
            metaAccountIds.add(cleanId);
          } else if (isTikTok) {
            tiktokAdvertiserIds.add(market.adAccountId);
          } else if (isGoogle) {
            googleAccountIds.add(market.adAccountId);
          }
        }
      }
    }

    let googleIdsToSync = new Set(googleAccountIds);
    if (googleIdsToSync.size > 0 && userId) {
      const { data: googlePlatform } = await supabase
        .from("connected_platforms")
        .select("id")
        .eq("user_id", userId)
        .eq("platform_type", "google")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (!googlePlatform) {
        console.warn(
          "📊 Skipping Google benchmark sync: no active Google Ads connection (connect in Platform connections, then sync again).",
        );
        googleIdsToSync = new Set();
      }
    }

    const totalSyncs = metaAccountIds.size + tiktokAdvertiserIds.size + googleIdsToSync.size;
    if (totalSyncs === 0) {
      console.log("📊 No ad accounts found in ActiPlan - skipping benchmark sync");
      return;
    }

    console.log(`🔄 Syncing benchmarks for ${metaAccountIds.size} Meta, ${tiktokAdvertiserIds.size} TikTok, ${googleIdsToSync.size} Google accounts...`);

    const syncPromises: Promise<unknown>[] = [];

    // Sync Meta accounts (per-account) — invoke returns { error } on HTTP errors; it does not throw.
    for (const accountId of metaAccountIds) {
      console.log(`  → Syncing Meta account: ${accountId}`);
      syncPromises.push(
        (async () => {
          const { data, error } = await supabase.functions.invoke("sync-account-assets", {
            body: { accountId, platform: "meta" },
          });
          if (error) {
            console.warn(`Failed to sync Meta account ${accountId}:`, error.message ?? error, data);
          } else if (data && typeof data === "object" && (data as { success?: boolean }).success === false) {
            console.warn(
              `Failed to sync Meta account ${accountId}:`,
              (data as { error?: string }).error ?? data,
            );
          }
          return { data, error };
        })(),
      );
    }

    for (const accountId of googleIdsToSync) {
      console.log(`  → Syncing Google Ads account: ${accountId}`);
      syncPromises.push(
        (async () => {
          const { data, error } = await supabase.functions.invoke("sync-account-assets", {
            body: { accountId, platform: "google" },
          });
          if (error) {
            console.warn(`Failed to sync Google account ${accountId}:`, error.message ?? error, data);
          } else if (data && typeof data === "object" && (data as { success?: boolean }).success === false) {
            console.warn(
              `Failed to sync Google account ${accountId}:`,
              (data as { error?: string }).error ?? data,
            );
          }
          return { data, error };
        })(),
      );
    }

    // Sync TikTok accounts (per-account)
    for (const advertiserId of tiktokAdvertiserIds) {
      console.log(`  → Syncing TikTok account: ${advertiserId}`);
      syncPromises.push(
        (async () => {
          const { error: resourcesError } = await supabase.functions.invoke('sync-tiktok-resources', {
            body: { advertiserId },
          });

          if (resourcesError) {
            console.warn(`TikTok resources sync error for ${advertiserId}:`, resourcesError);
          }

          const { error: benchmarksError } = await supabase.functions.invoke('sync-tiktok-benchmarks', {
            body: { advertiserId },
          });

          if (benchmarksError) {
            console.warn(`TikTok benchmarks sync error for ${advertiserId}:`, benchmarksError);
          }

          return { resourcesError, benchmarksError };
        })().catch((err) => {
          console.warn(`Failed to sync TikTok account ${advertiserId}:`, err);
          return null;
        })
      );
    }

    // Wait for all syncs to complete
    await Promise.all(syncPromises);
    console.log("✅ Benchmark sync completed");
  };

  // Reload benchmarks after sync
  const reloadBenchmarks = async (dateRange?: { startDate?: string; endDate?: string }) => {
    console.log("📊 Reloading benchmarks for industry:", resolvedIndustry || "(none)", "dateRange:", dateRange);
    const benchmarkData = await getAllBenchmarks(resolvedIndustry, undefined, dateRange);
    setBenchmarks(benchmarkData);
    console.log(`✅ Loaded ${benchmarkData.size} benchmarks`);
    return benchmarkData;
  };

  const handleGoToLaunchStatus = () => {
    if (!campaignId) {
      toast.error("Please save the campaign first");
      return;
    }
    navigate(`/app/actiplans/${campaignId}/launch`);
  };

  const getPlanData = () => {
    const totalMetrics = getTotalMetrics();
    const campaignsData = Object.entries(forecasts).flatMap(([platformId, platformForecasts]) => 
      platformForecasts.map(f => ({
        name: f.market,
        objective: f.metrics.objective,
        budget: f.budget,
        impressions: f.metrics.impressions,
        reach: f.metrics.reach,
        cpm: f.metrics.cpm,
        result: f.metrics.result,
        costPerResult: f.metrics.costPerResult,
      }))
    );

    return {
      name: `${genericConfig.strategyFocus || 'Media'} Plan`,
      totalBudget,
      startDate,
      endDate,
      platforms,
      genericConfig,
        clientBranding,
      forecasts: totalMetrics ? {
        totalReach: totalMetrics.reach,
        audienceSize: totalMetrics.audienceSize,
        sov: totalMetrics.sov,
        cpm: totalMetrics.cpm,
        totalImpressions: totalMetrics.impressions,
        campaigns: campaignsData,
      } : undefined,
      // Map actiplanForecast to actiplanForecasts for PDF/Excel generators
      actiplanForecasts: actiplanForecast,
      selectedKeywords: selectedKeywords || [],
    };
  };

  // Generate PDF base64 for email attachment
  const generatePdfBase64 = async () => {
    const planData = getPlanData();
    try {
      const { generateMediaPlanPDF } = await import("@/utils/pdfGenerator");
      const blob = await generateMediaPlanPDF(planData);
      
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Error generating PDF for email:", error);
      return "";
    }
  };

  // Generate Excel base64 for email attachment
  const generateExcelBase64 = async () => {
    const planData = getPlanData();
    try {
      const { generateMediaPlanExcel } = await import("@/utils/excelGenerator");
      const blob = generateMediaPlanExcel(planData);
      
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Error generating Excel for email:", error);
      return "";
    }
  };

  const handleDownloadPDF = async () => {
    const planData = getPlanData();

    try {
      const { generateMediaPlanPDF } = await import("@/utils/pdfGenerator");
      const blob = await generateMediaPlanPDF(planData);
      
      // If we have a campaign ID, upload PDF to storage
      if (campaignId) {
        const { supabase } = await import("@/integrations/supabase/client");
        const fileName = `${campaignId}/media-plan-${Date.now()}.pdf`;
        
        const { error: uploadError } = await supabase.storage
          .from('campaign-pdfs')
          .upload(fileName, blob, {
            contentType: 'application/pdf',
            upsert: true,
          });
        
        if (uploadError) {
          console.error("Error uploading PDF:", uploadError);
          const msg = uploadError.message?.toLowerCase() ?? "";
          if (msg.includes("row-level security") || msg.includes("unauthorized")) {
            toast.error(
              "Could not save PDF to cloud storage. You may need access to this campaign's workspace, or storage policies may need updating.",
              { duration: 6000 },
            );
          } else {
            toast.error(`Could not save PDF: ${uploadError.message}`, { duration: 5000 });
          }
        } else {
          // Update campaign with PDF URL
          await (supabase as any).from('campaigns')
            .update({ pdf_url: fileName })
            .eq('id', campaignId);
          
          toast.success("PDF saved and attached to ActiPlan!");
        }
      }
      
      // Download PDF
      await downloadMediaPlanPDF(planData);
      
      toast.success("PDF downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  const handleDownloadExcel = async () => {
    const planData = getPlanData();

    try {
      downloadMediaPlanExcel(planData);
      toast.success("Excel file downloaded successfully!");
    } catch (error) {
      console.error("Error generating Excel:", error);
      toast.error("Failed to generate Excel file");
    }
  };

  const fetchForecast = async (
    platformId: string,
    marketId: string,
    budget: number,
    market: any,
    campaignStartDate?: string,
    campaignEndDate?: string
  ) => {
    // Call actual platform APIs for Meta and TikTok
    const platformName = platformId.toLowerCase();
    const isMeta = platformName.includes("facebook") || platformName.includes("instagram") || platformName.includes("meta");
    const isTikTok = platformName.includes("tiktok");
    
    if (isMeta || isTikTok) {
        const strategyFocus = market.strategyFocus || genericConfig.strategyFocus || 'conversions';
        
        // Validate and normalize market code
        const marketCode = market.name.substring(0, 2).trim().toUpperCase();
        console.log(`**Selected market ${marketCode} for platform: ${isMeta ? 'Meta' : 'TikTok'}`);
        
        // Add data source indicator to logs
        console.log(`📊 Data Source: ${isMeta ? 'Meta - Live API' : 'TikTok - Estimated from benchmarks'}`);
        
        if (!/^[A-Z]{2}$/.test(marketCode)) {
          toast.error(`Invalid country code: "${marketCode}". Use 2-letter ISO codes (e.g., US, CA, GB).`, {
            duration: 5000,
          });
          throw new Error(`Invalid country code: ${marketCode}`);
        }
        
        try {
          const { supabase } = await import("@/integrations/supabase/client");
        
        if (isMeta) {
        // Resolve the correct Meta connection to use its credentials
        // 1) Prefer the connection that owns the selected Instagram account
        // 2) Fallback to the most recent Meta connection
        const instagramActorId = market.instagramActorId as string | undefined;
        let connectedPlatformId: string | null = null;

        if (instagramActorId) {
          const { data: igAccounts } = await supabase
            .from('platform_accounts')
            .select('connected_platform_id')
            .eq('account_type', 'instagram_account')
            .eq('account_id', instagramActorId)
            .limit(1);

          if (igAccounts && igAccounts.length > 0) {
            connectedPlatformId = igAccounts[0].connected_platform_id as unknown as string;
          }
        }

        if (!connectedPlatformId) {
          const normalizedAdAccountId = String(market.adAccountId || '').replace(/^act_/i, '');

          if (normalizedAdAccountId) {
            const { data: mappedMetaAccounts } = await supabase
              .from('meta_ad_accounts')
              .select('platform_id, created_at')
              .in('account_id', [`act_${normalizedAdAccountId}`, normalizedAdAccountId])
              .not('platform_id', 'is', null)
              .order('created_at', { ascending: false })
              .limit(1);

            connectedPlatformId = mappedMetaAccounts?.[0]?.platform_id ?? null;
          }
        }

        if (!connectedPlatformId) {
          const { data: connectedPlatforms } = await supabase
            .from('connected_platforms_safe')
            .select('id')
            .eq('platform_type', 'meta')
            .order('created_at', { ascending: false })
            .limit(1);

          connectedPlatformId = connectedPlatforms?.[0]?.id ?? null;
        }

        if (!connectedPlatformId) {
          throw new Error('No Meta platform connected. Please connect Meta in Platform Connections.');
        }

        const { data, error } = await supabase.functions.invoke('meta-rf-prediction', {
          body: {
            connectedPlatformId: connectedPlatformId,
            countries: [marketCode],
            budget,
            strategyFocus,
            // Ad Account ID from market configuration (REQUIRED)
            adAccountId: market.adAccountId,
            // Add campaign configuration from market
            isCBOEnabled: market.isCBOEnabled || false,
            isLifetimeBudget: market.isLifetimeBudget || false,
            startDate: campaignStartDate || startDate, // Use campaign-specific dates if available
            endDate: campaignEndDate || endDate,
            // Add targeting parameters (prefer genericConfig; market overrides only if explicitly set)
            ageMin: genericConfig.targeting?.ageMin ?? market.ageMin ?? 18,
            ageMax: genericConfig.targeting?.ageMax ?? market.ageMax ?? 65,
            gender: (genericConfig.targeting?.genders?.[0]) ?? market.gender ?? 'all',
            genders: Array.isArray(market.genders) ? market.genders : (genericConfig.targeting?.genders || []),
            languages: market.languages || [],
            publisherPlatforms: market.publisherPlatforms || [],
            positions: market.positions || {},
            detailedTargeting: market.detailedTargeting || [],
            frequencyCap: market.frequencyCap || 2,
            // Page ID (REQUIRED for R&F destination_ids)
            page: market.page,
            // Instagram account (REQUIRED for R&F with Instagram placements)
            instagramActorId: market.instagramActorId,
          }
        });

        if (error) {
          const detail = await getEdgeFunctionErrorMessage(error);
          throw new Error(detail);
        }

        if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
          throw new Error((data as { error: string }).error);
        }

        // Capture debug info for timestamp display
        const startDateObj = new Date(campaignStartDate || startDate);
        const endDateObj = new Date(campaignEndDate || endDate);
        startDateObj.setUTCHours(7, 0, 0, 0);
        endDateObj.setUTCHours(7, 0, 0, 0);
        
        setDebugInfo({
          startTimeUnix: Math.floor(startDateObj.getTime() / 1000),
          endTimeUnix: Math.floor(endDateObj.getTime() / 1000),
          startDateFormatted: startDateObj.toISOString(),
          endDateFormatted: endDateObj.toISOString(),
        });

        // Map strategy focus to optimization goal
        // Priority: phase-level settings > auto-detect from phase name > strategy focus
        const strategyFocusValue = getEffectiveStrategyFocus(market.strategyFocus, genericConfig.strategyFocus);
        let optimizationGoal: string;
        let objective: string;
        let destination: string;
        
        // Check if phase has explicit objective/optimization goal set
        // Use phase-level settings if they exist and are not empty
        if (market.phaseObjective && market.phaseOptimizationGoal && 
            market.phaseObjective.trim() !== '' && market.phaseOptimizationGoal.trim() !== '') {
          objective = market.phaseObjective;
          optimizationGoal = market.phaseOptimizationGoal;
          console.log(`✅ Using explicit phase objective: ${objective} / ${optimizationGoal}`);
          // Determine destination from optimization goal
          const goalMetricsLookup = getOptimizationGoalMetrics(objective, optimizationGoal);
          destination = goalMetricsLookup?.destination || "Website";
        } else if (market.phaseName) {
          // Auto-detect from phase name
          console.log(`🔍 Auto-detecting objective from phase name: ${market.phaseName}`);
          const autoDetected = getObjectiveFromPhaseName(market.phaseName, strategyFocusValue);
          objective = autoDetected.objective;
          optimizationGoal = autoDetected.optimizationGoal;
          destination = autoDetected.destination;
          console.log(`✅ Auto-detected: ${objective} / ${optimizationGoal}`);
        } else {
          // Fallback to strategy focus
          if (strategyFocusValue === 'brand-awareness') {
            objective = "OUTCOME_AWARENESS";
            optimizationGoal = "IMPRESSIONS";
            destination = "On Your Ad";
          } else if (strategyFocusValue === 'leads') {
            objective = "OUTCOME_LEADS";
            optimizationGoal = "LEADS";
            destination = "Instant Forms";
          } else if (strategyFocusValue === 'app-installs') {
            objective = "OUTCOME_APP_PROMOTION";
            optimizationGoal = "APP_INSTALLS";
            destination = "App";
          } else if (strategyFocusValue === 'purchase') {
            objective = "OUTCOME_SALES";
            optimizationGoal = "OFFSITE_CONVERSIONS";
            destination = "Website";
          } else {
            // conversions or traffic
            objective = "OUTCOME_TRAFFIC";
            optimizationGoal = "LINK_CLICKS";
            destination = "Website";
          }
        }
        
        const goalMetrics = getOptimizationGoalMetrics(objective, optimizationGoal, destination);
        
        // Calculate result based on optimization goal (initially)
        let result = calculateResultFromImpressions(
          data.forecast.impressions,
          budget,
          optimizationGoal
        );
        
        // Calculate cost per result using benchmark if available (platform-aware)
        const benchmark = lookupBenchmark(benchmarks, 'meta', market.name, optimizationGoal);
        
        let costPerResult: number;
        
        // For revenue-based goals, use ROAS from benchmark if available
        const benchmarkROAS = benchmark ? calculateBenchmarkROAS(benchmark) : null;
        if (isRevenueBasedGoal(optimizationGoal) && benchmarkROAS && benchmarkROAS > 0) {
          // ROAS = revenue / spend, so estimated revenue = budget * ROAS
          const estimatedRevenue = budget * benchmarkROAS;
          // For ROAS-based, result = estimated conversions from CPR
          if (benchmark?.avg_cost_per_result && benchmark.avg_cost_per_result > 0) {
            costPerResult = benchmark.avg_cost_per_result;
            result = budget / costPerResult;
          } else {
            costPerResult = result > 0 ? budget / result : 0;
          }
          console.log(`✓ Using META benchmark ROAS for ${market.name}/${optimizationGoal}: ${benchmarkROAS.toFixed(2)}x, Revenue: $${estimatedRevenue.toFixed(2)}`);
        } else if (benchmark?.avg_cost_per_result && benchmark.avg_cost_per_result > 0) {
          // Use benchmark data
          costPerResult = benchmark.avg_cost_per_result;
          result = budget / costPerResult; // Recalculate result based on benchmark
          console.log(`✓ Using META benchmark CPR for ${market.name}/${optimizationGoal}: $${costPerResult.toFixed(2)}`);
        } else {
          // Use calculated data
          costPerResult = result > 0 ? budget / result : 0;
          console.log(`✓ No META benchmark for ${market.name}/${optimizationGoal}, using calculated: $${costPerResult.toFixed(2)}`);
        }
        
        // Calculate result rate
        let resultRate = 0;
        if (goalMetrics) {
          // Most result rates are: result/impressions
          resultRate = data.forecast.impressions > 0 
            ? (result / data.forecast.impressions) * 100 
            : 0;
        }

        // Transform Meta API response to our format
        return {
          audienceSize: data.forecast?.audienceSize || data.forecast.reach * 15,
          reach: data.forecast.reach,
          impressions: data.forecast.impressions,
          cpm: data.forecast.cpm,
          result,
          resultLabel: getResultLabel(optimizationGoal),
          resultKPI: goalMetrics?.kpi || optimizationGoal,
          costPerResult: parseFloat(costPerResult.toFixed(3)),
          resultRate: parseFloat(resultRate.toFixed(2)),
          resultRateName: goalMetrics?.rateName || "Rate",
          objective,
          optimizationGoal,
          destination,
        };
      } else if (isTikTok) {
        console.log("=== 🎵 TIKTOK FORECAST START (AI-powered) ===");
        
        // Determine objective and optimization goal
        let objective: string;
        let optimizationGoal: string;
        let destination: string;
        const strategyFocusValue = getEffectiveStrategyFocus(market.strategyFocus, genericConfig.strategyFocus);
        
        if (market.phaseObjective && market.phaseOptimizationGoal && 
            market.phaseObjective.trim() !== '' && market.phaseOptimizationGoal.trim() !== '') {
          objective = market.phaseObjective;
          optimizationGoal = market.phaseOptimizationGoal;
          destination = "Website";
        } else if (market.phaseName) {
          const autoDetected = getObjectiveFromPhaseName(market.phaseName, strategyFocusValue, 'tiktok');
          objective = autoDetected.objective;
          optimizationGoal = autoDetected.optimizationGoal;
          destination = autoDetected.destination;
        } else {
          const autoDetected = getObjectiveFromPhaseName('default', strategyFocusValue, 'tiktok');
          objective = autoDetected.objective;
          optimizationGoal = autoDetected.optimizationGoal;
          destination = autoDetected.destination;
        }

        const goalMetrics = getOptimizationGoalMetrics(objective, optimizationGoal, destination);
        
        // Use AI forecast as primary source for TikTok (with retry for 429)
        console.log("🤖 Calling AI forecast for TikTok...");
        const { data: aiData, error: aiError } = await invokeAIForecastWithRetry({
          platform: 'TikTok',
          market: marketCode,
          budget,
          strategyFocus: strategyFocusValue,
          objective,
          optimizationGoal,
          destination,
          ageMin: genericConfig.targeting?.ageMin ?? market.ageMin ?? 18,
          ageMax: genericConfig.targeting?.ageMax ?? market.ageMax ?? 65,
          gender: (genericConfig.targeting?.genders?.[0]) ?? market.gender ?? 'all',
          startDate: campaignStartDate || startDate,
          endDate: campaignEndDate || endDate,
          industry: resolvedIndustry,
          phaseName: market.phaseName,
        });

        if (aiError) {
          console.error("❌ AI forecast failed for TikTok (after retries):", aiError);
          throw aiError;
        }

        const aiReach = aiData.reach || Math.round((aiData.impressions || 0) * 0.6);
        const aiImpressions = aiData.impressions || Math.round((budget / (aiData.cpm || 10)) * 1000);
        const aiAudienceSize = aiData.audienceSize || aiReach * 10;
        const aiResults = aiData.results || Math.max(1, Math.round(aiImpressions * 0.001));
        const aiCostPerResult = aiData.costPerResult || (aiResults > 0 ? parseFloat((budget / aiResults).toFixed(2)) : 0);
        const aiResultRate = aiData.resultRate || (aiImpressions > 0 ? parseFloat(((aiResults / aiImpressions) * 100).toFixed(2)) : 0);
        const aiFrequency = aiData.frequency || (aiReach > 0 ? parseFloat((aiImpressions / aiReach).toFixed(1)) : 2);

        const tiktokForecastResult = {
          audienceSize: aiAudienceSize,
          reach: aiReach,
          impressions: aiImpressions,
          cpm: aiData.cpm || 10,
          frequency: aiFrequency,
          result: aiResults,
          resultLabel: getResultLabel(optimizationGoal),
          resultKPI: goalMetrics?.kpi || optimizationGoal,
          costPerResult: aiCostPerResult,
          resultRate: aiResultRate,
          resultRateName: goalMetrics?.rateName || "Rate",
          objective,
          optimizationGoal,
          destination,
          dataSource: 'ai_predicted' as const,
        };
        
        console.log("✅ TikTok AI Forecast Result:", tiktokForecastResult);
        console.log("=== 🎵 TIKTOK FORECAST END ===\n");
        
        return tiktokForecastResult;
      }
      } catch (error: any) {
        const errorMessage = error?.message ?? "Unknown error";
        console.error(`${isMeta ? 'Meta' : 'TikTok'} forecast error:`, errorMessage, error);
        
        // Check for specific error types
        if (isMeta) {
          if (errorMessage.includes('INVALID_TOKEN')) {
            toast.error('Meta access token is invalid or expired. Please reconnect Meta in Platform Connections.', {
              duration: 6000,
            });
          } else if (errorMessage.includes('PERMISSION_ERROR')) {
            toast.error('Meta API permission error. Reconnect Meta with ads_management and business_management access.', {
              duration: 6000,
            });
          } else if (
            errorMessage.includes('Invalid Meta ad account') ||
            errorMessage.includes('Meta platform connection not found') ||
            errorMessage.includes('Meta access token not found')
          ) {
            toast.error(errorMessage, { duration: 7000 });
          } else {
            toast.error(`Meta R&F unavailable: ${errorMessage}. Trying standard reach estimates...`, {
              duration: 7000,
            });
          }
        } else if (isTikTok) {
          toast.error(`TikTok forecast error: ${error?.message || 'Unknown error'}. Using fallback estimates...`, {
            duration: 5000,
          });
        }
        
        // Attempt fallback to standard reach estimates (meta-forecast)
        try {
          const { supabase } = await import("@/integrations/supabase/client");
          const { data: fallbackData, error: fbError } = await supabase.functions.invoke('meta-forecast', {
            body: {
              markets: [marketCode],
              budget,
              strategyFocus,
              adAccountId: market.adAccountId,
              // connectedPlatformId will be auto-resolved by the edge function
              ageMin: genericConfig.targeting?.ageMin ?? market.ageMin ?? 18,
              ageMax: genericConfig.targeting?.ageMax ?? market.ageMax ?? 65,
              gender: (genericConfig.targeting?.genders?.[0]) ?? market.gender ?? 'all',
            }
          });

          if (fbError) throw fbError;
          
          // Check if fallback data is meaningful (non-zero reach or impressions)
          const fbReach = Number((fallbackData as any)?.reach) || 0;
          const fbImpressions = Number((fallbackData as any)?.impressions) || 0;
          
          if (fbReach <= 0 && fbImpressions <= 0) {
            console.warn('Meta reach estimate returned zero data, falling through to AI forecast...');
            throw new Error('Meta reach estimate returned zero data');
          }

          toast.success('Using Meta reach estimates for this forecast');
          
          // Determine objective/goal - prefer phase settings, fallback to auto-detect or strategy focus
          let optimizationGoal: string;
          let objective: string;
          let destination: string;
          
          if (market.phaseObjective && market.phaseOptimizationGoal && 
              market.phaseObjective.trim() !== '' && market.phaseOptimizationGoal.trim() !== '') {
            objective = market.phaseObjective;
            optimizationGoal = market.phaseOptimizationGoal;
            destination = "Website";
          } else if (market.phaseName) {
            const strategyFocusValue = getEffectiveStrategyFocus(market.strategyFocus, genericConfig.strategyFocus);
            const autoDetected = getObjectiveFromPhaseName(market.phaseName, strategyFocusValue);
            objective = autoDetected.objective;
            optimizationGoal = autoDetected.optimizationGoal;
            destination = autoDetected.destination;
          } else {
            // Fallback to strategy focus for market-level forecasts
            const strategyFocusValue = getEffectiveStrategyFocus(market.strategyFocus, genericConfig.strategyFocus);
            const autoDetected = getObjectiveFromPhaseName('default', strategyFocusValue);
            objective = autoDetected.objective;
            optimizationGoal = autoDetected.optimizationGoal;
            destination = autoDetected.destination;
          }
          const goalMetrics = getOptimizationGoalMetrics(objective, optimizationGoal, destination);
          
          const impressions = Number((fallbackData as any).impressions) || 0;
          let result = calculateResultFromImpressions(impressions, budget, optimizationGoal);
          
          // Apply benchmark if available (platform-aware)
          const benchmark = lookupBenchmark(benchmarks, 'meta', market.name, optimizationGoal);
          
          let costPerResult: number;
          if (benchmark?.avg_cost_per_result && benchmark.avg_cost_per_result > 0) {
            costPerResult = benchmark.avg_cost_per_result;
            result = budget / costPerResult;
            console.log(`✓ Using benchmark CPR (fallback) for ${market.name}/${optimizationGoal}: $${costPerResult.toFixed(2)}`);
          } else {
            costPerResult = result > 0 ? budget / result : 0;
          }
          
          const resultRate = impressions > 0 ? (result / impressions) * 100 : 0;

          console.log(`📋 Forecast source for ${marketCode}: Meta reach estimates (meta-forecast API). Labeled as 'estimated' because R&F API failed and this uses simplified reach model.`);
          return {
            audienceSize: (fallbackData as any).reach * 10,
            reach: fbReach,
            impressions,
            cpm: Number((fallbackData as any).cpm) || 0,
            result,
            resultLabel: getResultLabel(optimizationGoal),
            resultKPI: goalMetrics?.kpi || optimizationGoal,
            costPerResult: parseFloat(costPerResult.toFixed(3)),
            resultRate: parseFloat(resultRate.toFixed(2)),
            resultRateName: goalMetrics?.rateName || "Rate",
            objective,
            optimizationGoal,
            destination,
            dataSource: 'estimated' as const,
          } as ForecastMetrics;
        } catch (fbErr) {
          console.error('Meta reachestimate fallback failed:', fbErr);
          toast.error('Meta API fallback failed, trying AI prediction...');
        }
        
        // AI-powered fallback before mock data
        try {
          console.log("🤖 Attempting AI-powered forecast fallback...");
          const { supabase } = await import("@/integrations/supabase/client");
          
          const strategyFocusValue = getEffectiveStrategyFocus(market.strategyFocus, genericConfig.strategyFocus);
          let optimizationGoal: string;
          let objective: string;
          let destination: string;
          
          if (market.phaseObjective && market.phaseOptimizationGoal && 
              market.phaseObjective.trim() !== '' && market.phaseOptimizationGoal.trim() !== '') {
            objective = market.phaseObjective;
            optimizationGoal = market.phaseOptimizationGoal;
            destination = "Website";
          } else if (market.phaseName) {
            const autoDetected = getObjectiveFromPhaseName(market.phaseName, strategyFocusValue, isTikTok ? 'tiktok' : undefined);
            objective = autoDetected.objective;
            optimizationGoal = autoDetected.optimizationGoal;
            destination = autoDetected.destination;
          } else {
            const autoDetected = getObjectiveFromPhaseName('default', strategyFocusValue, isTikTok ? 'tiktok' : undefined);
            objective = autoDetected.objective;
            optimizationGoal = autoDetected.optimizationGoal;
            destination = autoDetected.destination;
          }
          
          const { data: aiData, error: aiError } = await invokeAIForecastWithRetry({
              platform: isMeta ? 'Meta' : 'TikTok',
              market: marketCode,
              budget,
              strategyFocus: strategyFocusValue,
              objective,
              optimizationGoal,
              destination,
              ageMin: genericConfig.targeting?.ageMin ?? market.ageMin ?? 18,
              ageMax: genericConfig.targeting?.ageMax ?? market.ageMax ?? 65,
              gender: (genericConfig.targeting?.genders?.[0]) ?? market.gender ?? 'all',
              startDate,
              endDate,
              industry: resolvedIndustry,
              phaseName: market.phaseName,
          });

          if (aiError) throw aiError;
          
          const goalMetrics = getOptimizationGoalMetrics(objective, optimizationGoal, destination);
          
          toast.success(`Using AI-predicted forecast for ${marketCode}`, { duration: 3000 });
          
          // AI forecast should never show zero metrics - enforce minimums
          const aiReach = aiData.reach || Math.round((aiData.impressions || 0) * 0.6);
          const aiImpressions = aiData.impressions || Math.round((budget / (aiData.cpm || 10)) * 1000);
          const aiAudienceSize = aiData.audienceSize || aiReach * 10;
          const aiResults = aiData.results || Math.max(1, Math.round(aiImpressions * 0.001));
          const aiCostPerResult = aiData.costPerResult || (aiResults > 0 ? parseFloat((budget / aiResults).toFixed(2)) : 0);
          const aiResultRate = aiData.resultRate || (aiImpressions > 0 ? parseFloat(((aiResults / aiImpressions) * 100).toFixed(2)) : 0);
          const aiFrequency = aiData.frequency || (aiReach > 0 ? parseFloat((aiImpressions / aiReach).toFixed(1)) : 2);
          
          return {
            audienceSize: aiAudienceSize,
            reach: aiReach,
            impressions: aiImpressions,
            cpm: aiData.cpm || 10,
            frequency: aiFrequency,
            result: aiResults,
            resultLabel: getResultLabel(optimizationGoal),
            resultKPI: goalMetrics?.kpi || optimizationGoal,
            costPerResult: aiCostPerResult,
            resultRate: aiResultRate,
            resultRateName: goalMetrics?.rateName || "Rate",
            objective,
            optimizationGoal,
            destination,
            dataSource: 'ai_predicted' as const,
          } as ForecastMetrics;
        } catch (aiErr: any) {
          console.error(`❌ AI forecast fallback failed for ${marketCode}:`, aiErr?.message || aiErr);
          console.log(`📋 Forecast source for ${marketCode}: STATIC ESTIMATION (all API sources failed — R&F ❌, meta-forecast ❌, AI ❌)`);
          toast.error('All forecast sources failed, using static estimates');
        }
        
        // Fall through to mock data
      }
    }

    // AI-powered forecast for all non-Meta platforms (Google, Snapchat, LinkedIn, etc.)
    const platformLabel = platformId.includes("google") ? "Google Ads" :
                          platformId.includes("linkedin") ? "LinkedIn" :
                          platformId.includes("snapchat") ? "Snapchat" :
                          platformId.includes("pinterest") ? "Pinterest" : platformId;

    const strategyFocusValue = getEffectiveStrategyFocus(market.strategyFocus, genericConfig.strategyFocus);
    let optimizationGoal = "OFFSITE_CONVERSIONS";
    let objective = "OUTCOME_SALES";
    let destination = "Website";
    
    if (market.phaseObjective && market.phaseOptimizationGoal && 
        market.phaseObjective.trim() !== '' && market.phaseOptimizationGoal.trim() !== '') {
      objective = market.phaseObjective;
      optimizationGoal = market.phaseOptimizationGoal;
      destination = "Website";
    } else if (market.phaseName) {
      const autoDetected = getObjectiveFromPhaseName(market.phaseName, strategyFocusValue);
      objective = autoDetected.objective;
      optimizationGoal = autoDetected.optimizationGoal;
      destination = autoDetected.destination;
    } else if (strategyFocusValue === 'brand-awareness') {
      objective = "OUTCOME_AWARENESS";
      optimizationGoal = "IMPRESSIONS";
      destination = "On Your Ad";
    } else if (strategyFocusValue === 'leads') {
      objective = "OUTCOME_LEADS";
      optimizationGoal = "LEADS";
      destination = "Instant Forms";
    } else if (strategyFocusValue === 'app-installs') {
      objective = "OUTCOME_APP_PROMOTION";
      optimizationGoal = "APP_INSTALLS";
      destination = "App";
    } else if (strategyFocusValue === 'purchase') {
      objective = "OUTCOME_SALES";
      optimizationGoal = "OFFSITE_CONVERSIONS";
      destination = "Website";
    } else {
      objective = "OUTCOME_TRAFFIC";
      optimizationGoal = "LINK_CLICKS";
      destination = "Website";
    }
    const goalMetrics = getOptimizationGoalMetrics(objective, optimizationGoal, destination);

    // Validate market code for AI forecast
    const marketCodeForAI = market.name.substring(0, 2).trim().toUpperCase();

    try {
      console.log(`🤖 Calling AI forecast for ${platformLabel} - ${marketCodeForAI} (with retry)...`);
      
      const { data: aiData, error: aiError } = await invokeAIForecastWithRetry({
          platform: platformLabel,
          market: marketCodeForAI,
          budget,
          strategyFocus: strategyFocusValue,
          objective,
          optimizationGoal,
          destination,
          ageMin: genericConfig.targeting?.ageMin ?? market.ageMin ?? 18,
          ageMax: genericConfig.targeting?.ageMax ?? market.ageMax ?? 65,
          gender: (genericConfig.targeting?.genders?.[0]) ?? market.gender ?? 'all',
          startDate: campaignStartDate || startDate,
          endDate: campaignEndDate || endDate,
          industry: resolvedIndustry,
          phaseName: market.phaseName,
      });

      if (aiError) throw aiError;
      
      const aiReach = aiData.reach || Math.round((aiData.impressions || 0) * 0.6);
      const aiImpressions = aiData.impressions || Math.round((budget / (aiData.cpm || 10)) * 1000);
      const aiAudienceSize = aiData.audienceSize || aiReach * 10;
      const aiResults = aiData.results || Math.max(1, Math.round(aiImpressions * 0.001));
      const aiCostPerResult = aiData.costPerResult || (aiResults > 0 ? parseFloat((budget / aiResults).toFixed(2)) : 0);
      const aiResultRate = aiData.resultRate || (aiImpressions > 0 ? parseFloat(((aiResults / aiImpressions) * 100).toFixed(2)) : 0);
      const aiFrequency = aiData.frequency || (aiReach > 0 ? parseFloat((aiImpressions / aiReach).toFixed(1)) : 2);

      console.log(`✅ AI forecast for ${platformLabel}:`, { reach: aiReach, impressions: aiImpressions, cpm: aiData.cpm, costPerResult: aiCostPerResult });

      return {
        audienceSize: aiAudienceSize,
        reach: aiReach,
        impressions: aiImpressions,
        cpm: aiData.cpm || 10,
        frequency: aiFrequency,
        result: aiResults,
        resultLabel: getResultLabel(optimizationGoal),
        resultKPI: goalMetrics?.kpi || optimizationGoal,
        costPerResult: aiCostPerResult,
        resultRate: aiResultRate,
        resultRateName: goalMetrics?.rateName || "Rate",
        objective,
        optimizationGoal,
        destination,
        dataSource: 'ai_predicted' as const,
      };
    } catch (aiErr) {
      console.error(`❌ AI forecast failed for ${platformLabel} (after retries):`, aiErr?.message || aiErr);
      console.log(`📋 Forecast source for ${platformLabel}/${market.name}: STATIC ESTIMATION (AI failed — ${aiErr?.message || 'unknown error'})`);
      toast.error(`AI forecast failed for ${platformLabel}. Using basic estimates.`);
      
      // Minimal static fallback only if AI fails
      const baseCPM = platformId.includes("google") ? 8 :
                      platformId.includes("linkedin") ? 25 : 12;
      const impressions = Math.floor((budget / baseCPM) * 1000);
      const reach = Math.floor(impressions / 3.5);
      let result = calculateResultFromImpressions(impressions, budget, optimizationGoal);
      const costPerResult = result > 0 ? budget / result : 0;
      const resultRate = impressions > 0 ? (result / impressions) * 100 : 0;

      return {
        audienceSize: reach * 10,
        reach,
        impressions,
        cpm: baseCPM,
        result,
        resultLabel: getResultLabel(optimizationGoal),
        resultKPI: goalMetrics?.kpi || optimizationGoal,
        costPerResult: parseFloat(costPerResult.toFixed(3)),
        resultRate: parseFloat(resultRate.toFixed(2)),
        resultRateName: goalMetrics?.rateName || "Rate",
        objective,
        optimizationGoal,
        destination,
        dataSource: 'estimated' as const,
      };
    }
  };

  const handleFetchForecasts = async (options?: ForecastOptions) => {
    setLoading(true);
    setHasExistingForecast(false);
    
    // Extract date range from options for benchmark filtering
    const benchmarkDateRange = options?.benchmarkDateRange?.preset !== "all" 
      ? { startDate: options?.benchmarkDateRange?.startDate, endDate: options?.benchmarkDateRange?.endDate }
      : undefined;
    
    try {
      // Step 1: Sync benchmarks for all selected ad accounts
      setIsSyncingBenchmarks(true);
      toast.info("Syncing latest benchmark data...", { duration: 3000 });
      
      try {
        await syncBenchmarksForSelectedAccounts();
        // Reload benchmarks after sync completes (with optional date range filter)
        await reloadBenchmarks(benchmarkDateRange);
      } catch (syncError) {
        console.warn("Benchmark sync failed, continuing with existing data:", syncError);
        toast.warning("Could not sync latest benchmarks. Using cached data.", { duration: 3000 });
      } finally {
        setIsSyncingBenchmarks(false);
      }
      
      // Step 2: Process forecasts with updated benchmarks
      const newForecasts: Record<string, CampaignForecast[]> = {};
      const platformForecasts: PlatformForecast[] = [];

      for (const platform of platforms) {
        const platformBudget = totalBudget * (platform.budgetPercentage / 100);
        const campaignForecasts: CampaignForecast[] = [];
        const marketForecastsArray: MarketForecast[] = [];

        for (const market of platform.markets) {
          const marketBudget = platformBudget * (market.budgetPercentage / 100);
          
          // Throttle between markets to avoid AI rate limits (429)
          if (platform.markets.indexOf(market) > 0) {
            await throttleDelay(500);
          }
          
          console.log(`📊 Processing market: ${market.name}, Phases:`, market.phases?.length || 0);
          console.log('Market data:', { id: market.id, name: market.name, phases: market.phases });
          
            // HYBRID APPROACH: Get market-level R&F prediction, then split proportionally
            if (market.phases && market.phases.length > 0) {
              console.log(`✅ Market ${market.name} has ${market.phases.length} phases, using hybrid forecast...`);
              
              // Step 1: Get accurate market-level R&F prediction
              let marketMetrics: ForecastMetrics;
              try {
                marketMetrics = await fetchForecast(
                  platform.id,
                  market.id,
                  marketBudget,
                  market,
                  startDate,
                  endDate
                );
                console.log(`✅ Got market-level forecast for ${market.name}:`, {
                  reach: marketMetrics.reach,
                  impressions: marketMetrics.impressions,
                  cpm: marketMetrics.cpm
                });
              } catch (error: any) {
                console.error(`Failed to get market-level forecast for ${market.name}:`, error);
                toast.error(`Could not fetch market forecast for ${market.name}. Using fallback estimates.`);
                
                // Fallback to estimates
                const estimatedImpressions = marketBudget * 1000;
                const estimatedReach = estimatedImpressions * 0.7;
                marketMetrics = {
                  audienceSize: estimatedReach * 10,
                  reach: estimatedReach,
                  impressions: estimatedImpressions,
                  cpm: (marketBudget / estimatedImpressions) * 1000,
                  result: 0,
                  resultLabel: "Conversions",
                  resultKPI: "conversions",
                  costPerResult: 0,
                  resultRate: 0,
                  resultRateName: "CVR",
                };
              }

              const phaseForecasts: PhaseForecast[] = [];
              const resultsByGoal: Record<string, { kpi: string; result: number; cost: number; impressions: number }> = {};

              // Step 2: Split impressions/reach proportionally by phase budget %
              for (const phase of market.phases) {
                console.log(`  → Processing phase: ${phase.name}`);
                const campaignBudget = marketBudget * (phase.budgetPercentage / 100);
                const budgetRatio = phase.budgetPercentage / 100;
                
                // Proportionally allocate market-level metrics
                const phaseImpressions = Math.round(marketMetrics.impressions * budgetRatio);
                const phaseReach = Math.round(marketMetrics.reach * budgetRatio);
                const phaseCPM = marketMetrics.cpm; // CPM stays constant
                
                // Step 3: Apply optimization goal modifiers for phase-specific metrics
                let optimizationGoal: string;
                let objective: string;
                let destination: string;
                
                if (phase.objective && phase.optimizationGoal) {
                  objective = phase.objective;
                  optimizationGoal = phase.optimizationGoal;
                  destination = "Website";
                } else {
                  // Auto-detect from phase name
                  const strategyFocusValue = getEffectiveStrategyFocus(market.strategyFocus, genericConfig.strategyFocus);
                  const autoDetected = getObjectiveFromPhaseName(phase.name, strategyFocusValue);
                  objective = autoDetected.objective;
                  optimizationGoal = autoDetected.optimizationGoal;
                destination = autoDetected.destination;
              }
              
              const goalMetrics = getOptimizationGoalMetrics(objective, optimizationGoal, destination);
              
              // Calculate results: prefer benchmarks, then goal-specific estimation
              let result: number;
              let costPerResult: number;
              let isBenchmarkBased = false;
              
              // Apply benchmark if available (platform-aware: industry + platform + market + optimization_goal must all match)
              const platformKey = getPlatformKeyFromId(platform.id);
              const benchmark = lookupBenchmark(benchmarks, platformKey, market.name || '', optimizationGoal || '');
              
              const benchmarkROAS = benchmark ? calculateBenchmarkROAS(benchmark) : null;
              const benchmarkHasCampaigns = benchmark && benchmark.campaign_count > 0;
              if (isRevenueBasedGoal(optimizationGoal) && benchmarkROAS && benchmarkROAS > 0 && benchmark?.avg_cost_per_result && benchmark.avg_cost_per_result > 0) {
                costPerResult = benchmark.avg_cost_per_result;
                result = campaignBudget / costPerResult;
                isBenchmarkBased = !!benchmarkHasCampaigns;
                console.log(`✓ Using benchmark ROAS (phase) for ${resolvedIndustry}/${market.name}/${optimizationGoal}: ROAS=${benchmarkROAS.toFixed(2)}x, CPR=$${costPerResult.toFixed(2)}, campaigns=${benchmark.campaign_count}`);
              } else if (benchmark?.avg_cost_per_result && benchmark.avg_cost_per_result > 0) {
                costPerResult = benchmark.avg_cost_per_result;
                result = campaignBudget / costPerResult;
                isBenchmarkBased = !!benchmarkHasCampaigns;
                console.log(`✓ Using benchmark CPR (phase) for ${resolvedIndustry}/${market.name}/${optimizationGoal}: $${costPerResult.toFixed(2)}`);
              } else if (marketMetrics.dataSource === 'ai_predicted' && marketMetrics.costPerResult && marketMetrics.costPerResult > 0) {
                // AI-predicted: scale the market-level CPR by the relative cost ratio
                // between the phase's optimization goal and the market-level goal.
                // This ensures different goals get different CPRs while staying anchored to AI predictions.
                const marketGoal = marketMetrics.optimizationGoal || optimizationGoal;
                
                if (marketGoal === optimizationGoal) {
                  // Same goal as market-level — use AI CPR directly
                  costPerResult = marketMetrics.costPerResult;
                  result = campaignBudget / costPerResult;
                } else {
                  // Different goal — use static benchmark rates to derive relative cost ratio
                  const marketLevelResult = calculateResultFromImpressions(1_000_000, 1000, marketGoal);
                  const phaseLevelResult = calculateResultFromImpressions(1_000_000, 1000, optimizationGoal);
                  
                  if (phaseLevelResult > 0 && marketLevelResult > 0) {
                    // Ratio: if phase goal produces fewer results per impression, CPR should be higher
                    const costRatio = marketLevelResult / phaseLevelResult;
                    costPerResult = marketMetrics.costPerResult * costRatio;
                    result = campaignBudget / costPerResult;
                    console.log(`✓ Scaled AI CPR for ${optimizationGoal}: $${costPerResult.toFixed(2)} (ratio=${costRatio.toFixed(2)} from ${marketGoal})`);
                  } else {
                    result = calculateResultFromImpressions(phaseImpressions, campaignBudget, optimizationGoal);
                    costPerResult = result > 0 ? campaignBudget / result : 0;
                  }
                }
                
                isBenchmarkBased = false;
                console.log(`✓ AI-based CPR (phase) for ${market.name}/${optimizationGoal}: $${costPerResult.toFixed(2)}`);
              } else if (marketMetrics.result && marketMetrics.result > 0) {
                // Proportionally allocate market-level results only if same goal
                const marketGoal = marketMetrics.optimizationGoal || optimizationGoal;
                if (marketGoal === optimizationGoal) {
                  result = Math.round(marketMetrics.result * budgetRatio);
                  costPerResult = result > 0 ? campaignBudget / result : 0;
                } else {
                  result = calculateResultFromImpressions(phaseImpressions, campaignBudget, optimizationGoal);
                  costPerResult = result > 0 ? campaignBudget / result : 0;
                }
                console.log(`✓ Using results for ${market.name}/${optimizationGoal}: CPR=$${costPerResult.toFixed(2)}`);
              } else {
                result = calculateResultFromImpressions(phaseImpressions, campaignBudget, optimizationGoal);
                costPerResult = result > 0 ? campaignBudget / result : 0;
                console.log(`ℹ No AI/benchmark data, using static estimation for ${market.name}/${optimizationGoal}`);
              }
              
              const resultRate = phaseImpressions > 0 ? (result / phaseImpressions) * 100 : 0;
              const resultDisplayName = getResultLabel(optimizationGoal);
              
              console.log(`  ✓ Phase ${phase.name} allocated:`, {
                budgetRatio: `${(budgetRatio * 100).toFixed(1)}%`,
                impressions: phaseImpressions,
                reach: phaseReach,
                result,
                resultLabel: getResultLabel(optimizationGoal)
              });

              // Build ad set forecasts if phase has ad set splits
              // Check phase's own adSets first, then inherit from basicTargeting if applicable
              let adSetForecasts: AdSetForecast[] | undefined;
              
              // Resolve effective ad sets - check phase's own, then inherit from default
              let effectiveAdSets = phase.adSets;
              
              if (!effectiveAdSets || effectiveAdSets.length === 0) {
                // Check if phase should inherit from basicTargeting
                const perPlatformConfig = basicTargeting?.defaultAdSetSplitDimensionPerPlatform;
                const hasPerPlatformConfig = perPlatformConfig && Object.keys(perPlatformConfig).length > 0;
                
                // Get the platform's default dimension
                const platformDefaultDimension = hasPerPlatformConfig 
                  ? perPlatformConfig[platform.id] 
                  : basicTargeting?.defaultAdSetSplitDimension;
                
                // Only inherit if there's a valid dimension and the phase isn't overriding
                const hasInheritedSplit = !phase.overrideTargeting && 
                  platformDefaultDimension && 
                  platformDefaultDimension !== 'none';
                
                if (hasInheritedSplit) {
                  // Get the platform's default ad sets
                  const perPlatformAdSets = basicTargeting?.defaultAdSetsPerPlatform;
                  const hasPerPlatformAdSets = perPlatformAdSets && Object.keys(perPlatformAdSets).length > 0;
                  const platformDefaultAdSets = hasPerPlatformAdSets
                    ? perPlatformAdSets[platform.id]
                    : basicTargeting?.defaultAdSets;
                  
                  if (platformDefaultAdSets && platformDefaultAdSets.length > 0) {
                    effectiveAdSets = platformDefaultAdSets as typeof effectiveAdSets;
                    console.log(`    → Phase ${phase.name} inheriting ${platformDefaultAdSets.length} ad sets from default config for platform ${platform.id}`);
                  }
                }
              }
              
              const effectiveSearchKeywords = getEffectiveSearchKeywords({
                keywords: selectedKeywords,
                platformId: platform.id,
                market: market as unknown as Record<string, unknown>,
                phase: phase as unknown as Record<string, unknown>,
              });

              // Search phases with keyword strategies have campaign-level splits, not ad set splits
              const isSearchPhase = isSearchPhaseLike({ platformId: platform.id, phase: phase as unknown as Record<string, unknown> });
              const hasSearchKeywords = isSearchPhase && effectiveSearchKeywords.length > 0;

              if (effectiveAdSets && effectiveAdSets.length > 0 && !hasSearchKeywords) {
                console.log(`    → Phase ${phase.name} has ${effectiveAdSets.length} ad set splits`);
                adSetForecasts = effectiveAdSets.map((adSet: any) => {
                  const adSetBudgetPct = adSet.budgetPercentage || (100 / effectiveAdSets!.length);
                  const adSetBudget = (campaignBudget * adSetBudgetPct) / 100;
                  const adSetImpressions = Math.round(phaseImpressions * (adSetBudgetPct / 100));
                  const adSetReach = Math.round(phaseReach * (adSetBudgetPct / 100));
                  const adSetResult = Math.round(result * (adSetBudgetPct / 100));
                  const adSetCostPerResult = adSetResult > 0 ? adSetBudget / adSetResult : 0;
                  
                  return {
                    adSetName: adSet.name || `Ad Set ${adSet.id?.substring(0, 6) || 'Unknown'}`,
                    budget: adSetBudget,
                    budgetPercentage: adSetBudgetPct,
                    impressions: adSetImpressions,
                    reach: adSetReach,
                    result: adSetResult,
                    costPerResult: parseFloat(adSetCostPerResult.toFixed(2)),
                  };
                });
              }

              // Calculate CTR and ROAS from benchmark raw data
              let phaseCTR: number | null = null;
              let phaseROAS: number | null = null;
              
              if (benchmark) {
                if (isClickBasedGoal(optimizationGoal)) {
                  phaseCTR = calculateBenchmarkCTR(benchmark);
                }
                if (isRevenueBasedGoal(optimizationGoal)) {
                  phaseROAS = calculateBenchmarkROAS(benchmark);
                }
              }

              const strategyGroups = isSearchPhaseLike({ platformId: platform.id, phase: phase as unknown as Record<string, unknown> })
                ? getSearchStrategyGroups({
                    keywords: effectiveSearchKeywords,
                    platformId: platform.id,
                    market: { id: market.id, name: market.name },
                  })
                : [];

              const strategyCampaigns = strategyGroups.length > 0
                ? strategyGroups.map((group) => {
                    const strategyBudget = campaignBudget * group.budgetShare;
                    const strategyImpressions = Math.round(phaseImpressions * group.budgetShare);
                    const strategyReach = Math.round(phaseReach * group.budgetShare);
                    const strategyResult = Math.round(result * group.budgetShare);
                    const strategyCostPerResult = strategyResult > 0 ? strategyBudget / strategyResult : 0;
                    const strategyResultRate = strategyImpressions > 0 ? (strategyResult / strategyImpressions) * 100 : 0;

                    return {
                      strategy: group.strategy,
                      campaignName: buildSearchStrategyCampaignName(phase.name, group.label),
                      budget: strategyBudget,
                      budgetPercentage: group.budgetPercentage,
                      searchVolume: group.totalVolume,
                      keywordsCount: group.positives.length,
                      negativeKeywordsCount: group.negatives.length,
                      impressions: strategyImpressions,
                      reach: strategyReach,
                      result: strategyResult,
                      costPerResult: parseFloat(strategyCostPerResult.toFixed(2)),
                      resultRate: parseFloat(strategyResultRate.toFixed(2)),
                        kpi: resultDisplayName,
                      startDate: phase.startDate,
                      endDate: phase.endDate,
                      ctr: phaseCTR,
                      roas: phaseROAS,
                    };
                  })
                : undefined;

              // Store phase forecast
              phaseForecasts.push({
                phaseName: phase.name,
                budget: campaignBudget,
                startDate: phase.startDate,
                endDate: phase.endDate,
                kpi: resultDisplayName,
                optimizationGoal,
                result,
                costPerResult: parseFloat(costPerResult.toFixed(3)),
                resultRate: parseFloat(resultRate.toFixed(2)),
                isBenchmarkBased,
                adSets: adSetForecasts,
                strategyCampaigns,
                ctr: phaseCTR,
                roas: phaseROAS,
              });

              // Aggregate results by goal
              if (!resultsByGoal[optimizationGoal]) {
                resultsByGoal[optimizationGoal] = {
                  kpi: resultDisplayName,
                  result: 0,
                  cost: 0,
                  impressions: 0
                };
              }
              resultsByGoal[optimizationGoal].result += result;
              resultsByGoal[optimizationGoal].cost += campaignBudget;
              resultsByGoal[optimizationGoal].impressions += phaseImpressions;
              
              // Store for old format (backward compatibility)
              campaignForecasts.push({
                market: `${market.name} - ${phase.name}`,
                budget: campaignBudget,
                campaign: phase.name,
                dates: `${phase.startDate} → ${phase.endDate}`,
                metrics: {
                  audienceSize: Math.round(marketMetrics.audienceSize * budgetRatio),
                  reach: phaseReach,
                  impressions: phaseImpressions,
                  cpm: phaseCPM,
                  result,
                  resultLabel: getResultLabel(optimizationGoal),
                  resultKPI: resultDisplayName,
                  costPerResult: parseFloat(costPerResult.toFixed(3)),
                  resultRate: parseFloat(resultRate.toFixed(2)),
                  resultRateName: goalMetrics?.rateName || "Rate",
                  objective,
                  optimizationGoal,
                  destination,
                  dataSource: marketMetrics.dataSource || (isBenchmarkBased ? 'estimated' : undefined),
                },
              });
            }

            // Create market forecast with aggregated results by goal
            const marketResultsByGoal = Object.entries(resultsByGoal).map(([goal, data]) => ({
              goal,
              kpi: data.kpi,
              result: data.result,
              costPerResult: data.result > 0 ? data.cost / data.result : 0,
              resultRate: data.impressions > 0 ? (data.result / data.impressions) * 100 : 0,
            }));

            marketForecastsArray.push({
              marketName: market.name,
              marketCode: market.id || market.name,
              budget: marketBudget,
              audienceSize: marketMetrics.audienceSize,
              impressions: marketMetrics.impressions,
              reach: marketMetrics.reach,
              cpm: marketMetrics.cpm,
              frequency: marketMetrics.reach > 0 ? marketMetrics.impressions / marketMetrics.reach : 0,
              sov: 0, // Will calculate after all markets are processed
              resultsByGoal: marketResultsByGoal,
              phases: phaseForecasts,
            });
          } else {
            // No phases - fetch forecast for entire market
            console.log(`❌ Market ${market.name} has no phases, fetching single forecast...`);
            try {
              const forecast = await fetchForecast(
                platform.id,
                market.id,
                marketBudget,
                market,
                startDate,
                endDate
              );
              
              const goalMetrics = getOptimizationGoalMetrics(
                forecast.objective || "OUTCOME_TRAFFIC",
                forecast.optimizationGoal || "LINK_CLICKS",
                forecast.destination || "Website"
              );

              marketForecastsArray.push({
                marketName: market.name,
                budget: marketBudget,
                audienceSize: forecast.audienceSize,
                impressions: forecast.impressions,
                reach: forecast.reach,
                cpm: forecast.cpm,
                frequency: forecast.reach > 0 ? forecast.impressions / forecast.reach : 0,
                sov: 0,
                resultsByGoal: [{
                  goal: forecast.optimizationGoal || "LINK_CLICKS",
                  kpi: forecast.resultLabel || getResultLabel(forecast.optimizationGoal || "LINK_CLICKS"),
                  result: forecast.result,
                  costPerResult: forecast.costPerResult,
                  resultRate: forecast.resultRate,
                }],
                phases: [],
              });
              
              campaignForecasts.push({
                market: market.name,
                budget: marketBudget,
                metrics: forecast,
              });
            } catch (error: any) {
              console.error(`Forecast error for ${platform.id} - ${market.name}:`, error);
              toast.error(`Could not fetch forecast for ${market.name}. Using estimates.`);
              
              // Fallback estimates
              const strategyFocusValue = getEffectiveStrategyFocus(market.strategyFocus, genericConfig.strategyFocus);
              const autoDetected = getObjectiveFromPhaseName('default', strategyFocusValue);
              
              const estimatedImpressions = marketBudget * 1000;
              const estimatedReach = estimatedImpressions * 0.7;
              const result = calculateResultFromImpressions(estimatedImpressions, marketBudget, autoDetected.optimizationGoal);
              const goalMetrics = getOptimizationGoalMetrics(autoDetected.objective, autoDetected.optimizationGoal, autoDetected.destination);
              
              marketForecastsArray.push({
                marketName: market.name,
                budget: marketBudget,
                audienceSize: estimatedReach * 10,
                impressions: estimatedImpressions,
                reach: estimatedReach,
                cpm: (marketBudget / estimatedImpressions) * 1000,
                frequency: estimatedReach > 0 ? estimatedImpressions / estimatedReach : 0,
                sov: 0,
                resultsByGoal: [{
                  goal: autoDetected.optimizationGoal,
                    kpi: getResultLabel(autoDetected.optimizationGoal),
                  result,
                  costPerResult: result > 0 ? marketBudget / result : 0,
                  resultRate: estimatedImpressions > 0 ? (result / estimatedImpressions) * 100 : 0,
                }],
                phases: [],
              });

              campaignForecasts.push({
                market: market.name,
                budget: marketBudget,
                metrics: {
                  audienceSize: estimatedReach * 10,
                  reach: estimatedReach,
                  impressions: estimatedImpressions,
                  cpm: (marketBudget / estimatedImpressions) * 1000,
                  result,
                  resultLabel: getResultLabel(autoDetected.optimizationGoal),
                  resultKPI: getResultLabel(autoDetected.optimizationGoal),
                  costPerResult: result > 0 ? marketBudget / result : 0,
                  resultRate: estimatedImpressions > 0 ? (result / estimatedImpressions) * 100 : 0,
                  resultRateName: goalMetrics?.rateName || "Rate",
                  objective: autoDetected.objective,
                  optimizationGoal: autoDetected.optimizationGoal,
                  destination: autoDetected.destination,
                },
              });
            }
          }
        }

        // Calculate SOV for each market (SOV = Reach / Audience Size)
        marketForecastsArray.forEach(market => {
          market.sov = market.audienceSize > 0 ? (market.reach / market.audienceSize) * 100 : 0;
        });

        // Build Platform aggregation
        const platformTotalAudienceSize = marketForecastsArray.reduce((sum, m) => sum + m.audienceSize, 0);
        const platformTotalReach = marketForecastsArray.reduce((sum, m) => sum + m.reach, 0);
        const platformTotalImp = marketForecastsArray.reduce((sum, m) => sum + m.impressions, 0);
        // Use standard formula: CPM = (Budget / Impressions) * 1000
        const platformAvgCPM = platformTotalImp > 0
          ? (platformBudget / platformTotalImp) * 1000
          : 0;
        const platformFrequency = platformTotalReach > 0 ? platformTotalImp / platformTotalReach : 0;
        const platformSOV = platformTotalAudienceSize > 0 ? (platformTotalReach / platformTotalAudienceSize) * 100 : 0;
        
        // Determine data source based on actual forecast results
        const platformName = platform.name.toLowerCase();
        const isMeta = platformName.includes("facebook") || platformName.includes("instagram") || platformName.includes("meta");
        // Check if any market forecast used AI prediction
        const hasAiPredicted = campaignForecasts.some(f => f.metrics.dataSource === 'ai_predicted');
        const hasLiveApi = campaignForecasts.some(f => f.metrics.dataSource === 'live_api') || isMeta;
        const dataSource: 'live_api' | 'estimated' | 'ai_predicted' = hasAiPredicted ? 'ai_predicted' : (hasLiveApi ? 'live_api' : 'estimated');

        platformForecasts.push({
          platformId: platform.id,
          platformName: platform.name,
          totalBudget: platformBudget,
          totalAudienceSize: platformTotalAudienceSize,
          totalImpressions: platformTotalImp,
          totalReach: platformTotalReach,
          avgCPM: platformAvgCPM,
          frequency: platformFrequency,
          sov: platformSOV,
          dataSource, // Include data source indicator
          markets: marketForecastsArray,
        });

        newForecasts[platform.id] = campaignForecasts;
      }

      // Build Actiplan-level aggregation from platforms
      const actiplanTotalBudget = platformForecasts.reduce((sum, p) => sum + p.totalBudget, 0);
      const actiplanTotalAudienceSize = platformForecasts.reduce((sum, p) => sum + p.totalAudienceSize, 0);
      const actiplanTotalImpressions = platformForecasts.reduce((sum, p) => sum + p.totalImpressions, 0);
      const actiplanTotalReach = platformForecasts.reduce((sum, p) => sum + p.totalReach, 0);
      // Use standard formula: CPM = (Budget / Impressions) * 1000
      const actiplanAvgCPM = actiplanTotalImpressions > 0
        ? (actiplanTotalBudget / actiplanTotalImpressions) * 1000
        : 0;
      const actiplanFrequency = actiplanTotalReach > 0 ? actiplanTotalImpressions / actiplanTotalReach : 0;
      const actiplanSOV = actiplanTotalAudienceSize > 0 ? (actiplanTotalReach / actiplanTotalAudienceSize) * 100 : 0;
      // platformDeliverables will be computed after markup is applied

      // Helper: aggregate platform deliverables from platform forecasts
      const aggregateDeliverables = (pfs: PlatformForecast[]) => {
        const deliverables: Record<string, Array<{ kpi: string; result: number }>> = {};
        pfs.forEach(platform => {
          if (!deliverables[platform.platformName]) deliverables[platform.platformName] = [];
          platform.markets.forEach(market => {
            market.resultsByGoal.forEach(r => {
              const existing = deliverables[platform.platformName].find(d => d.kpi === r.kpi);
              if (existing) existing.result += r.result;
              else deliverables[platform.platformName].push({ kpi: r.kpi, result: r.result });
            });
          });
        });
        return deliverables;
      };

      // Helper: build actiplan from platform forecasts
      const buildActiplan = (pfs: PlatformForecast[]): ActiplanForecast => {
        const b = pfs.reduce((s, p) => s + p.totalBudget, 0);
        const a = pfs.reduce((s, p) => s + p.totalAudienceSize, 0);
        const imp = pfs.reduce((s, p) => s + p.totalImpressions, 0);
        const r = pfs.reduce((s, p) => s + p.totalReach, 0);
        const totalResults = pfs.reduce((s, p) => s + p.markets.reduce((ms, m) => ms + m.resultsByGoal.reduce((rs, rg) => rs + rg.result, 0), 0), 0);
        return {
          totalBudget: b,
          totalAudienceSize: a,
          totalImpressions: imp,
          totalReach: r,
          avgCPM: imp > 0 ? (b / imp) * 1000 : 0,
          frequency: r > 0 ? imp / r : 0,
          sov: a > 0 ? (r / a) * 100 : 0,
          totalResults,
          avgCostPerResult: totalResults > 0 ? b / totalResults : 0,
          platformDeliverables: aggregateDeliverables(pfs),
          platforms: pfs,
        };
      };

      // Helper: build granular comparison rows from before/after platform forecasts
      const buildGranularRows = (
        beforePfs: PlatformForecast[],
        afterPfs: PlatformForecast[],
        bmks: Map<string, BenchmarkData>
      ) => {
        const rows: Array<{
          platform: string; market: string; phase: string; optimizationGoal: string; kpi: string;
          beforeCPR: number; afterCPR: number; beforeResult: number; afterResult: number;
          beforeImpressions: number; afterImpressions: number; beforeCPM: number; afterCPM: number;
          budget: number; campaignCount: number; isBenchmarkBased: boolean;
        }> = [];

        for (const afterPf of afterPfs) {
          const beforePf = beforePfs.find(p => p.platformId === afterPf.platformId || p.platformName === afterPf.platformName);
          for (const afterMkt of afterPf.markets) {
            const beforeMkt = beforePf?.markets.find(m => m.marketName === afterMkt.marketName);
            for (const afterPhase of afterMkt.phases) {
              const beforePhase = beforeMkt?.phases?.find(p => p.phaseName === afterPhase.phaseName && p.optimizationGoal === afterPhase.optimizationGoal);
              const platformKey = getPlatformKeyFromId(afterPf.platformId || afterPf.platformName);
              const bm = lookupBenchmark(bmks, platformKey, afterMkt.marketName, afterPhase.optimizationGoal);
              const hasBenchmarkData = afterPhase.isBenchmarkBased || false;
              const campCount = bm?.campaign_count || 0;
              
              // If no benchmark data exists, keep before === after (no estimated changes)
              rows.push({
                platform: afterPf.platformName,
                market: afterMkt.marketName,
                phase: afterPhase.phaseName,
                optimizationGoal: afterPhase.optimizationGoal,
                kpi: afterPhase.kpi,
                beforeCPR: beforePhase?.costPerResult || 0,
                afterCPR: hasBenchmarkData ? afterPhase.costPerResult : (beforePhase?.costPerResult || 0),
                beforeResult: beforePhase?.result || 0,
                afterResult: hasBenchmarkData ? afterPhase.result : (beforePhase?.result || 0),
                beforeImpressions: 0,
                afterImpressions: 0,
                beforeCPM: beforeMkt?.cpm || 0,
                afterCPM: hasBenchmarkData ? afterMkt.cpm : (beforeMkt?.cpm || 0),
                budget: afterPhase.budget,
                campaignCount: campCount,
                isBenchmarkBased: hasBenchmarkData,
              });
            }
          }
        }
        return rows;
      };

      // Helper: apply markup to platform forecasts + newForecasts (mutates in place)
      const applyMarkupToData = (pfs: PlatformForecast[], fcs: Record<string, CampaignForecast[]>, opts: ForecastOptions) => {
        const cpmMultiplier = opts.markupDirection === "up"
          ? 1 + (opts.markupPercentage / 100)
          : 1 - (opts.markupPercentage / 100);
        const impressionScale = 1 / cpmMultiplier;

        for (const pf of pfs) {
          const platformPhaseForecasts = fcs[pf.platformId] ?? [];
          for (const mf of pf.markets) {
            mf.cpm = mf.cpm * cpmMultiplier;
            mf.impressions = Math.round(mf.impressions * impressionScale);
            mf.frequency = mf.reach > 0 ? mf.impressions / mf.reach : 0;
            mf.sov = mf.audienceSize > 0 ? (mf.reach / mf.audienceSize) * 100 : 0;
            for (const rg of mf.resultsByGoal) {
              rg.result = Math.max(1, Math.round(rg.result * impressionScale));
              rg.costPerResult = rg.result > 0 ? mf.budget / rg.result : 0;
              rg.resultRate = mf.impressions > 0 ? (rg.result / mf.impressions) * 100 : 0;
            }
            for (const phase of mf.phases) {
              phase.result = Math.max(1, Math.round(phase.result * impressionScale));
              phase.costPerResult = phase.result > 0 ? phase.budget / phase.result : 0;
              phase.resultRate = phase.result > 0 && mf.impressions > 0 ? (phase.result / (mf.impressions * (phase.budget / mf.budget))) * 100 : 0;
              phase.adSets?.forEach(as => {
                as.impressions = Math.round(as.impressions * impressionScale);
                as.result = Math.max(1, Math.round(as.result * impressionScale));
                as.costPerResult = as.result > 0 ? as.budget / as.result : 0;
              });
              phase.strategyCampaigns?.forEach(sc => {
                sc.impressions = Math.round(sc.impressions * impressionScale);
                sc.result = Math.max(1, Math.round(sc.result * impressionScale));
                sc.costPerResult = sc.result > 0 ? sc.budget / sc.result : 0;
                sc.resultRate = sc.impressions > 0 ? (sc.result / sc.impressions) * 100 : 0;
              });
            }
            platformPhaseForecasts
              .filter(f => f.market === mf.marketName || f.market.startsWith(`${mf.marketName} - `))
              .forEach(f => {
                f.metrics.cpm = f.metrics.cpm * cpmMultiplier;
                f.metrics.impressions = Math.round(f.metrics.impressions * impressionScale);
                f.metrics.result = Math.max(1, Math.round(f.metrics.result * impressionScale));
                f.metrics.costPerResult = f.metrics.result > 0 ? parseFloat((f.budget / f.metrics.result).toFixed(2)) : 0;
                f.metrics.resultRate = f.metrics.impressions > 0 ? (f.metrics.result / f.metrics.impressions) * 100 : 0;
              });
          }
          pf.totalImpressions = pf.markets.reduce((s, m) => s + m.impressions, 0);
          pf.avgCPM = pf.totalImpressions > 0 ? (pf.totalBudget / pf.totalImpressions) * 1000 : 0;
          pf.frequency = pf.totalReach > 0 ? pf.totalImpressions / pf.totalReach : 0;
          pf.sov = pf.totalAudienceSize > 0 ? (pf.totalReach / pf.totalAudienceSize) * 100 : 0;
        }
      };

      // If markup requested → show preview dialog instead of applying immediately
      if (options?.applyMarkup && options.markupPercentage > 0) {
        const beforeActiplan = buildActiplan(platformForecasts);
        const beforePlatformTotals = platformForecasts.map(pf => {
          const results = pf.markets.reduce((s, m) => s + m.resultsByGoal.reduce((rs, rg) => rs + rg.result, 0), 0);
          return {
            name: pf.platformName,
            budget: pf.totalBudget,
            impressions: pf.totalImpressions,
            reach: pf.totalReach,
            cpm: pf.avgCPM,
            frequency: pf.frequency,
            results,
            costPerResult: results > 0 ? pf.totalBudget / results : 0,
          };
        });

        // Deep clone and apply markup for "after" preview
        const clonedPlatforms: PlatformForecast[] = JSON.parse(JSON.stringify(platformForecasts));
        const clonedForecasts: Record<string, CampaignForecast[]> = JSON.parse(JSON.stringify(newForecasts));
        applyMarkupToData(clonedPlatforms, clonedForecasts, options);
        const afterActiplan = buildActiplan(clonedPlatforms);

        const totalComparison = [
          { label: "Budget", before: beforeActiplan.totalBudget, after: afterActiplan.totalBudget, format: "currency" as const },
          { label: "Avg. CPM", before: beforeActiplan.avgCPM, after: afterActiplan.avgCPM, format: "currency" as const, inverted: true },
          { label: "Impressions", before: beforeActiplan.totalImpressions, after: afterActiplan.totalImpressions, format: "number" as const },
          { label: "Results", before: beforeActiplan.totalResults, after: afterActiplan.totalResults, format: "number" as const },
          { label: "Avg. Cost/Result", before: beforeActiplan.avgCostPerResult, after: afterActiplan.avgCostPerResult, format: "currency" as const, inverted: true },
          { label: "Reach", before: beforeActiplan.totalReach, after: afterActiplan.totalReach, format: "number" as const },
          { label: "Frequency", before: beforeActiplan.frequency, after: afterActiplan.frequency, format: "number" as const },
          { label: "SOV", before: beforeActiplan.sov, after: afterActiplan.sov, format: "percent" as const },
        ];

        // Build granular rows from before/after phase data
        const granularRows = buildGranularRows(platformForecasts, clonedPlatforms, benchmarks);

        setMarkupPreviewData({
          markupDirection: options.markupDirection,
          markupPercentage: options.markupPercentage,
          totalComparison,
          granularRows,
        });

        // Show base forecast (without markup)
        setForecasts(newForecasts);
        setActiplanForecast(beforeActiplan);

        // Save base version
        const basePayload = { generatedAt: new Date().toISOString(), forecasts: newForecasts, actiplanForecast: beforeActiplan };
        saveVersion(basePayload, platforms, totalBudget, undefined, "Base forecast (before markup)");

        // Store the markup-applied state for when user accepts
        setPendingMarkupState({ forecasts: clonedForecasts, actiplan: afterActiplan, options });
        setMarkupPreviewOpen(true);

        toast.success("Forecasts fetched — review markup impact before applying.");
      } else if (actiplanForecast && options?.benchmarkDateRange?.preset && options.benchmarkDateRange.preset !== "all") {
        // Non-default date range with existing forecast → show preview
        const beforeActiplan = actiplanForecast;
        const beforePlatformTotals = beforeActiplan.platforms.map(pf => {
          const results = pf.markets.reduce((s, m) => s + m.resultsByGoal.reduce((rs, rg) => rs + rg.result, 0), 0);
          return {
            name: pf.platformName,
            budget: pf.totalBudget,
            impressions: pf.totalImpressions,
            reach: pf.totalReach,
            cpm: pf.avgCPM,
            frequency: pf.frequency,
            results,
            costPerResult: results > 0 ? pf.totalBudget / results : 0,
          };
        });

        const afterActiplan = buildActiplan(platformForecasts);

        const presetLabels: Record<string, string> = {
          last_month: "Last month",
          last_3_months: "Last 3 months",
          last_quarter: "Last quarter",
          same_month_last_year: "Same month last year",
          same_quarter_last_year: "Same quarter last year",
          same_period_last_year: "Same period last year",
          custom: "Custom range",
        };
        const dateRangeLabel = presetLabels[options.benchmarkDateRange.preset] || options.benchmarkDateRange.preset;

        // For dateRange mode, only show benchmark-affected metrics (Results & Cost/Result)
        const totalComparison = [
          { label: "Results", before: beforeActiplan.totalResults, after: afterActiplan.totalResults, format: "number" as const },
          { label: "Avg. Cost/Result", before: beforeActiplan.avgCostPerResult, after: afterActiplan.avgCostPerResult, format: "currency" as const, inverted: true },
        ];

        // Build granular rows: for dateRange mode, before = existing actiplan platforms, after = new platformForecasts
        const granularRows = buildGranularRows(beforeActiplan.platforms, platformForecasts, benchmarks);

        setMarkupPreviewData({
          markupDirection: "up",
          markupPercentage: 0,
          totalComparison,
          granularRows,
          mode: "dateRange",
          dateRangeLabel,
        });

        setPendingMarkupState({ forecasts: newForecasts, actiplan: afterActiplan, options: options! });
        setMarkupPreviewOpen(true);

        toast.success("Forecasts fetched — review benchmark change impact before applying.");
      } else {
        // No markup, default date range — apply directly
        const actiplan = buildActiplan(platformForecasts);
        setForecasts(newForecasts);
        setActiplanForecast(actiplan);
        toast.success("Forecasts fetched successfully!");

        const forecastPayload = { generatedAt: new Date().toISOString(), forecasts: newForecasts, actiplanForecast: actiplan };
        saveVersion(forecastPayload, platforms, totalBudget);
      }

      // Generate a unique ID for this forecast run
      const forecastRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      console.log("💡 Budget optimization check:", {
        platformCount: platformForecasts.length,
        platformNames: platformForecasts.map(p => p.platformName),
      });
      if (platformForecasts.length > 1) {
        try {
          const optimizationResult = analyzeBudgetOptimization({ platforms: platformForecasts });
          console.log("💡 Budget optimization result:", {
            hasRecommendations: optimizationResult.hasRecommendations,
            recommendationCount: optimizationResult.recommendations.length,
            totalResultChange: optimizationResult.totalResultChangePercent,
          });
          if (optimizationResult.hasRecommendations) {
            setBudgetOptimization(optimizationResult);
            // Only auto-pop once per unique forecast run
            if (lastPoppedForecastId.current !== forecastRunId) {
              setBudgetRecommendationOpen(true);
              lastPoppedForecastId.current = forecastRunId;
            }
            console.log("💡 Budget optimization recommendations found:", optimizationResult.recommendations.length);
          } else {
            setBudgetOptimization(null);
            console.log("✅ No budget optimization improvements found");
          }
        } catch (optError) {
          console.error("Budget optimization analysis failed:", optError);
        }
      } else {
        console.log("💡 Budget optimization skipped: need 2+ platforms, got", platformForecasts.length);
      }
    } catch (error) {
      toast.error("Failed to fetch forecasts");
      console.error(error);
    } finally {
      setLoading(false);
      setHasExistingForecast(true);
    }
  };

  const getTotalMetricsFromForecasts = (forecastData: Record<string, CampaignForecast[]>) => {
    let total = {
      audienceSize: 0,
      reach: 0,
      impressions: 0,
      totalBudget: 0,
    };

    Object.values(forecastData).forEach((platformForecasts) => {
      platformForecasts.forEach((forecast) => {
        total.audienceSize = Math.max(total.audienceSize, forecast.metrics.audienceSize);
        total.reach += forecast.metrics.reach;
        total.impressions += forecast.metrics.impressions;
        total.totalBudget += forecast.budget;
      });
    });

    const cpm = total.impressions > 0 ? (total.totalBudget / total.impressions) * 1000 : 0;
    const sov = total.audienceSize > 0 ? (total.reach / total.audienceSize) * 100 : 0;

    return {
      audienceSize: total.audienceSize,
      reach: total.reach,
      impressions: total.impressions,
      cpm,
      sov,
      totalBudget: total.totalBudget,
    };
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const getTotalMetrics = () => {
    if (Object.keys(forecasts).length === 0) return null;

    let total = {
      audienceSize: 0,
      reach: 0,
      impressions: 0,
      cpm: 0,
      totalBudget: 0,
    };

    let count = 0;
    const allForecasts: any[] = [];
    
    Object.values(forecasts).forEach((platformForecasts) => {
      platformForecasts.forEach((forecast) => {
        total.audienceSize = Math.max(total.audienceSize, forecast.metrics.audienceSize); // Max audience size
        total.reach += forecast.metrics.reach; // Sum reach (includes duplication)
        total.impressions += forecast.metrics.impressions;
        total.totalBudget += forecast.budget;
        total.cpm += forecast.metrics.cpm;
        count++;
        allForecasts.push(forecast);
      });
    });

    // Calculate CPM from total budget and impressions
    total.cpm = total.impressions > 0 ? (total.totalBudget / total.impressions) * 1000 : 0;
    
    // Calculate SOV
    const sov = total.audienceSize > 0 ? (total.reach / total.audienceSize) * 100 : 0;

    // Group results by optimization goal
    const resultsByGoal: Record<string, {
      result: number;
      cost: number;
      impressions: number;
      label: string;
      kpi: string;
      rateName: string;
    }> = {};

    allForecasts.forEach((forecast) => {
      const goal = forecast.metrics.optimizationGoal || 'UNKNOWN';
      if (!resultsByGoal[goal]) {
        resultsByGoal[goal] = {
          result: 0,
          cost: 0,
          impressions: 0,
          label: forecast.metrics.resultLabel || 'Result',
          kpi: forecast.metrics.resultKPI || goal,
          rateName: forecast.metrics.resultRateName || 'Rate',
        };
      }
      resultsByGoal[goal].result += forecast.metrics.result;
      resultsByGoal[goal].cost += forecast.budget;
      resultsByGoal[goal].impressions += forecast.metrics.impressions;
    });

    // Calculate aggregated metrics per goal
    const aggregatedResults = Object.entries(resultsByGoal).map(([goal, data]) => ({
      goal,
      result: data.result,
      costPerResult: data.result > 0 ? data.cost / data.result : 0,
      resultRate: data.impressions > 0 ? (data.result / data.impressions) * 100 : 0,
      label: data.label,
      kpi: data.kpi,
      rateName: data.rateName,
    }));

    return {
      ...total,
      sov: parseFloat(sov.toFixed(2)),
      resultsByGoal: aggregatedResults,
      hasMultipleCampaigns: count > 1,
    };
  };

  // Keyword Strategy Forecast sub-component - now with market-level tabs
  const KeywordStrategyForecast = ({ keywords, platform }: { keywords: KeywordItem[]; platform?: string }) => {
    const kwPlatform = platform?.toLowerCase().includes('google') ? 'google' : platform?.toLowerCase().includes('tiktok') ? 'tiktok' : null;
    const filteredKeywords = kwPlatform ? keywords.filter(k => k.platform === kwPlatform) : keywords;

    // Derive unique markets from keywords
    const marketCodes = Array.from(new Set(filteredKeywords.map(k => k.market).filter(Boolean))) as string[];
    const hasMultipleMarkets = marketCodes.length > 1;
    const [activeMarket, setActiveMarket] = useState<string>(marketCodes[0] || "all");

    const strategiesList = ["brand", "generic", "competition"] as const;
    const STRAT_META: Record<string, { label: string; icon: React.ReactNode; colorClass: string }> = {
      brand: { label: "Brand", icon: <ShieldCheck className="h-4 w-4" />, colorClass: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800" },
      generic: { label: "Generic", icon: <TargetIcon className="h-4 w-4" />, colorClass: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800" },
      competition: { label: "Competition", icon: <Swords className="h-4 w-4" />, colorClass: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800" },
    };

    const fmtNum = (n: number) => {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
      return String(Math.round(n));
    };

    const renderMarketTable = (marketKeywords: KeywordItem[], marketLabel: string) => {
      const strategyData = strategiesList.map(strategy => {
        const kws = marketKeywords.filter(k => k.strategy === strategy && !k.isNegative);
        const negatives = marketKeywords.filter(k => k.strategy === strategy && k.isNegative);
        const totalVol = kws.reduce((s, k) => s + (k.avgMonthlySearches || 0), 0);
        const avgCpcLow = kws.length > 0 ? kws.reduce((s, k) => s + (k.cpcLow || 0), 0) / kws.length : 0;
        const avgCpcHigh = kws.length > 0 ? kws.reduce((s, k) => s + (k.cpcHigh || 0), 0) / kws.length : 0;
        const avgCpc = (avgCpcLow + avgCpcHigh) / 2;
        const estimatedClicks = avgCpc > 0 ? Math.round(totalVol * 0.03) : 0;
        const ctr = totalVol > 0 && estimatedClicks > 0 ? (estimatedClicks / totalVol) * 100 : 0;
        const estimatedCost = estimatedClicks * avgCpc;
        const estimatedConversions = Math.round(estimatedClicks * 0.03);
        const costPerConversion = estimatedConversions > 0 ? estimatedCost / estimatedConversions : 0;
        return { strategy, kws, negatives, totalVol, avgCpc, estimatedClicks, ctr, costPerConversion };
      }).filter(s => s.kws.length > 0);

      const totalStrategyVol = strategyData.reduce((s, d) => s + d.totalVol, 0);
      const withBudget = strategyData.map(d => ({
        ...d,
        budgetPct: totalStrategyVol > 0 ? Math.round((d.totalVol / totalStrategyVol) * 100) : Math.round(100 / Math.max(strategyData.length, 1)),
      }));

      if (withBudget.length === 0) {
        return <p className="text-sm text-muted-foreground py-4 text-center">No keywords for {marketLabel}</p>;
      }

      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Strategy</TableHead>
              <TableHead className="text-xs text-right">Keywords</TableHead>
              <TableHead className="text-xs text-right">Budget %</TableHead>
              <TableHead className="text-xs text-right">Search Volume</TableHead>
              <TableHead className="text-xs text-right">CPC</TableHead>
              <TableHead className="text-xs text-right">Cost/Conv.</TableHead>
              <TableHead className="text-xs text-right">Clicks</TableHead>
              <TableHead className="text-xs text-right">CTR</TableHead>
              <TableHead className="text-xs text-right">Negatives</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withBudget.map(({ strategy, kws, negatives, totalVol, avgCpc, estimatedClicks, ctr, costPerConversion, budgetPct }) => {
              const meta = STRAT_META[strategy];
              return (
                <TableRow key={strategy}>
                  <TableCell>
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${meta.colorClass}`}>
                      {meta.icon}
                      {meta.label}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-right font-medium">{kws.length}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{budgetPct}%</TableCell>
                  <TableCell className="text-xs text-right">{fmtNum(totalVol)}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{avgCpc > 0 ? `$${avgCpc.toFixed(2)}` : "—"}</TableCell>
                  <TableCell className="text-xs text-right">{costPerConversion > 0 ? `$${costPerConversion.toFixed(2)}` : "—"}</TableCell>
                  <TableCell className="text-xs text-right">{estimatedClicks > 0 ? fmtNum(estimatedClicks) : "—"}</TableCell>
                  <TableCell className="text-xs text-right">{ctr > 0 ? `${ctr.toFixed(2)}%` : "—"}</TableCell>
                  <TableCell className="text-xs text-right">
                    {negatives.length > 0 ? (
                      <span className="flex items-center justify-end gap-1 text-destructive">
                        <Ban className="h-3 w-3" />{negatives.length}
                      </span>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="font-semibold border-t-2">
              <TableCell className="text-xs">Total</TableCell>
              <TableCell className="text-xs text-right">{strategyData.reduce((s, d) => s + d.kws.length, 0)}</TableCell>
              <TableCell className="text-xs text-right">100%</TableCell>
              <TableCell className="text-xs text-right">{fmtNum(strategyData.reduce((s, d) => s + d.totalVol, 0))}</TableCell>
              <TableCell className="text-xs text-right">
                {(() => {
                  const allKws = strategyData.flatMap(d => d.kws);
                  const avg = allKws.length > 0 ? allKws.reduce((s, k) => s + ((k.cpcLow || 0) + (k.cpcHigh || 0)) / 2, 0) / allKws.length : 0;
                  return avg > 0 ? `$${avg.toFixed(2)}` : "—";
                })()}
              </TableCell>
              <TableCell className="text-xs text-right">—</TableCell>
              <TableCell className="text-xs text-right">{fmtNum(strategyData.reduce((s, d) => s + d.estimatedClicks, 0))}</TableCell>
              <TableCell className="text-xs text-right">
                {(() => {
                  const tc = strategyData.reduce((s, d) => s + d.estimatedClicks, 0);
                  const tv = strategyData.reduce((s, d) => s + d.totalVol, 0);
                  return tv > 0 && tc > 0 ? `${((tc / tv) * 100).toFixed(2)}%` : "—";
                })()}
              </TableCell>
              <TableCell className="text-xs text-right">{strategyData.reduce((s, d) => s + d.negatives.length, 0) || "—"}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );
    };

    if (filteredKeywords.length === 0) return null;

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-200 text-xs">
              {kwPlatform === 'tiktok' ? 'TikTok' : 'Google Ads'}
            </Badge>
            Search Campaign Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasMultipleMarkets ? (
            <Tabs value={activeMarket} onValueChange={setActiveMarket}>
              <TabsList className="mb-4">
                {marketCodes.map(mc => (
                  <TabsTrigger key={mc} value={mc} className="text-xs">
                    {mc}
                    <Badge variant="secondary" className="ml-1.5 text-[10px]">
                      {filteredKeywords.filter(k => k.market === mc && !k.isNegative).length}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
              {marketCodes.map(mc => (
                <TabsContent key={mc} value={mc}>
                  {renderMarketTable(filteredKeywords.filter(k => k.market === mc), mc)}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            renderMarketTable(filteredKeywords, marketCodes[0] || "All")
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Step 5: Campaign Forecast</CardTitle>
            <CardDescription>
              {hasExistingForecast 
                ? "View and refresh your campaign forecast" 
                : "View projected performance metrics for your campaigns"}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {!isSampleMode && !loading && Object.keys(forecasts).length === 0 && (
              <Button onClick={() => setForecastOptionsOpen(true)} disabled={isSyncingBenchmarks}>
                {isSyncingBenchmarks ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Syncing Benchmarks...
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Fetch Forecasts
                  </>
                )}
              </Button>
            )}
            {!isSampleMode && !loading && Object.keys(forecasts).length > 0 && (
              <Button onClick={() => setForecastOptionsOpen(true)} variant="outline" disabled={isSyncingBenchmarks}>
                {isSyncingBenchmarks ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Refresh Forecast
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Step5ForecastNav actiplanForecast={actiplanForecast} />
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Fetching forecasts from platform APIs...</span>
          </div>
        ) : Object.keys(forecasts).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Click "Fetch Forecasts" to retrieve projected metrics from platform APIs</p>
          </div>
        ) : (
          <>
            {/* Actiplan Deliverables View */}
            {actiplanForecast && (
              <ActiplanDeliverablesView 
                actiplanForecast={actiplanForecast} 
                selectedKeywords={selectedKeywords}
                benchmarks={benchmarks}
              />
            )}
            {/* Budget Optimization Recommendation Banner */}
            {budgetOptimization?.hasRecommendations && (
              <div 
                className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 flex items-center justify-between cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                onClick={() => setBudgetRecommendationOpen(true)}
              >
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">
                    Budget optimization available — {budgetOptimization.recommendations.length} goal{budgetOptimization.recommendations.length > 1 ? 's' : ''} can be improved
                  </span>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs">
                  View Recommendation
                </Button>
              </div>
            )}

            {/* Forecast Version History */}
            {versions.length > 1 && (
              <div className="space-y-2">
                <button
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowVersionHistory(!showVersionHistory)}
                >
                  <History className="h-3.5 w-3.5" />
                  {versions.length} forecast version{versions.length > 1 ? 's' : ''} saved
                  <ChevronDown className={`h-3 w-3 transition-transform ${showVersionHistory ? 'rotate-180' : ''}`} />
                </button>
                {showVersionHistory && (
                  <div className="rounded-lg border p-3 space-y-2 max-h-48 overflow-y-auto">
                    {versions.map((v) => (
                      <div key={v.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] h-5">v{v.version_number}</Badge>
                            <span className="text-muted-foreground">
                              {v.label || `Forecast v${v.version_number}`}
                            </span>
                            <span className="text-muted-foreground">
                              · {new Date(v.created_at).toLocaleString()}
                            </span>
                          </div>
                          {v.description && (
                            <span className="text-[10px] text-muted-foreground pl-7 italic">
                              {v.description}
                            </span>
                          )}
                        </div>
                        {v.version_number !== versions[0]?.version_number && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-2"
                            onClick={() => {
                              const data = v.forecast_data as any;
                              if (data?.forecasts) setForecasts(data.forecasts);
                              if (data?.actiplanForecast) setActiplanForecast(data.actiplanForecast);
                              setHasExistingForecast(true);
                              toast.success(`Reverted to ${v.label || `Forecast v${v.version_number}`}`);
                            }}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Revert
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <LockedFeatureButton feature="pdf_export">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    disabled={Object.keys(forecasts).length === 0}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleDownloadPDF}>
                    <FileText className="h-4 w-4 mr-2" />
                    Download as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDownloadExcel}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Download as Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </LockedFeatureButton>
            <LockedFeatureButton feature="request_modifications">
              <Button 
                variant="outline" 
                onClick={() => setApprovalDialogOpen(true)} 
                disabled={Object.keys(forecasts).length === 0}
              >
                <Mail className="h-4 w-4 mr-2" />
                Send for Approval
              </Button>
            </LockedFeatureButton>
            <Button 
              variant="outline"
              onClick={() => navigate(`/app/creatives?campaignId=${campaignId}`)} 
              disabled={!campaignId}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Mesh Ads
            </Button>
            <Button 
              variant="gradient" 
              onClick={handleGoToLaunchStatus} 
              disabled={Object.keys(forecasts).length === 0 || !campaignId}
            >
              <Rocket className="h-4 w-4 mr-2" />
              Launch Campaign
            </Button>
            <Button onClick={onFinalize} disabled={Object.keys(forecasts).length === 0}>
              Save Draft
            </Button>
          </div>
        </div>

        <ApprovalDialog
          open={approvalDialogOpen}
          onOpenChange={async (open) => {
            if (open && !pdfBase64Data) {
              // Generate attachments when opening dialog
              const [pdf, excel] = await Promise.all([
                generatePdfBase64(),
                generateExcelBase64(),
              ]);
              setPdfBase64Data(pdf);
              setExcelBase64Data(excel);
            }
            setApprovalDialogOpen(open);
          }}
          planName={`${genericConfig.strategyFocus || 'Media'} Plan`}
          planDetails={{
            campaignId,
            totalBudget,
            startDate,
            endDate,
            strategyFocus: genericConfig.strategyFocus,
            platforms: platforms.map(p => ({ name: p.name })),
          }}
          pdfBase64={pdfBase64Data}
          excelBase64={excelBase64Data}
          actiplanForecasts={actiplanForecast}
        />

        {/* Budget Recommendation Dialog */}
        {budgetOptimization && (
          <BudgetRecommendationDialog
            open={budgetRecommendationOpen}
            onOpenChange={setBudgetRecommendationOpen}
            optimization={budgetOptimization}
            onAccept={() => {
              if (onBudgetOptimize && budgetOptimization) {
                const optimizedPlatforms = applyBudgetOptimization(
                  platforms as any,
                  budgetOptimization,
                  totalBudget
                );
                onBudgetOptimize(optimizedPlatforms as PlatformWithMarkets[]);
                toast.success("Budget optimization applied! Re-fetch forecasts to see updated metrics.");
                setBudgetOptimization(null);
              }
            }}
          />
        )}
      </CardContent>

      <ForecastOptionsDialog
        open={forecastOptionsOpen}
        onOpenChange={setForecastOptionsOpen}
        onConfirm={(options) => {
          setForecastOptionsOpen(false);
          handleFetchForecasts(options);
        }}
      />

      <MarkupPreviewDialog
        open={markupPreviewOpen}
        onOpenChange={setMarkupPreviewOpen}
        data={markupPreviewData}
        onAccept={() => {
          if (pendingMarkupState) {
            setForecasts(pendingMarkupState.forecasts);
            setActiplanForecast(pendingMarkupState.actiplan);

            const isDateRange = markupPreviewData?.mode === "dateRange";
            let description: string;
            let versionLabel: string;

            if (isDateRange) {
              const rangeLabel = markupPreviewData?.dateRangeLabel || "custom range";
              description = `Benchmark date range changed to "${rangeLabel}"`;
              versionLabel = `Forecast (${rangeLabel})`;
              toast.success(`Benchmarks updated to "${rangeLabel}"`);
            } else {
              const dir = pendingMarkupState.options.markupDirection === "up" ? "+" : "−";
              const pct = pendingMarkupState.options.markupPercentage;
              description = `CPM ${dir}${pct}% ${pendingMarkupState.options.markupDirection === "up" ? "markup" : "markdown"} applied`;
              versionLabel = `Forecast (${dir}${pct}% CPM)`;
              toast.success(`${dir}${pct}% CPM markup applied successfully`);
            }

            const payload = {
              generatedAt: new Date().toISOString(),
              forecasts: pendingMarkupState.forecasts,
              actiplanForecast: pendingMarkupState.actiplan,
            };
            saveVersion(payload, platforms, totalBudget, versionLabel, description);
          }
          setPendingMarkupState(null);
          setMarkupPreviewOpen(false);
        }}
        onReject={() => {
          const isDateRange = markupPreviewData?.mode === "dateRange";
          toast.info(isDateRange ? "Benchmark change rejected — keeping current forecast" : "Markup rejected — keeping base forecast");
          setPendingMarkupState(null);
          setMarkupPreviewOpen(false);
        }}
      />
    </Card>
  );
}
