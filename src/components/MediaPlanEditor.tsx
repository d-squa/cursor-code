import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlatformSelector } from "./PlatformSelector";
import { BudgetSummary } from "./BudgetSummary";
import { CampaignMetrics } from "./CampaignMetrics";
import { GenericStrategyConfig, GenericConfig } from "./GenericStrategyConfig";
import { PlatformMarketBudgetSelector } from "./PlatformMarketBudgetSelector";
import { HierarchicalTimelineScheduler } from "./HierarchicalTimelineScheduler";
import { GlobalFunnelPhasing } from "./GlobalFunnelPhasing";
import { TargetingConfigComponent } from "./TargetingConfig";
import { TargetingBriefInput } from "./TargetingBriefInput";
import { AudienceCard } from "./AudienceCard";
import { BasicTargeting, BasicTargetingConfig } from "./BasicTargeting";
import { PhaseAudienceSelector, SelectedAudience } from "./PhaseAudienceSelector";
import { CampaignForecast } from "./CampaignForecast";
import { PhaseScheduler } from "./PhaseScheduler";
import { getDefaultPhases, generateAutoDetectPhases } from "@/utils/funnelPhases";
import { Calendar, Download, Rocket, Loader2, ChevronDown, ChevronUp, Copy, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PlatformWithMarkets, FunnelStage } from "@/types/mediaplan";
import { Platform, PlatformConfiguration } from "./PlatformConfiguration";
import { determineStrategyFocus } from "@/utils/strategyFocusMapping";
import { Badge } from "@/components/ui/badge";
import { PlatformSelectionDialog } from "./PlatformSelectionDialog";
import { MarketSelectionDialog } from "./MarketSelectionDialog";
import { MARKET_OPTIONS } from "@/utils/markets";
import { CampaignBudgetTypeDialog } from "./CampaignBudgetTypeDialog";
import BulkBudgetTypeDialog from "./BulkBudgetTypeDialog";

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
  const [currentStep, setCurrentStep] = useState(1);
  const [campaignName, setCampaignName] = useState<string>("");
  const [boNumber, setBoNumber] = useState<string>("");
  const [totalBudget, setTotalBudget] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [genericConfig, setGenericConfig] = useState<GenericConfig>({
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
      lookalikeAudience: ""
    }
  });
  const [platformsWithMarkets, setPlatformsWithMarkets] = useState<PlatformWithMarkets[]>([]);
  const [globalFunnel, setGlobalFunnel] = useState<FunnelStage[]>([]);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({});
  const [bulkBudgetDialogOpen, setBulkBudgetDialogOpen] = useState(false);
  const [bulkPlatform, setBulkPlatform] = useState<PlatformWithMarkets | null>(null);
  
  // Basic targeting (Step 2)
  const [basicTargeting, setBasicTargeting] = useState<BasicTargetingConfig>({});
  
  // Phase audiences (Step 3.5 - after strategy config)
  const [phaseAudiences, setPhaseAudiences] = useState<Record<string, SelectedAudience[]>>({});
  const [firstAdAccountId, setFirstAdAccountId] = useState<string | null>(null);
  
  // Dialog states
  const [platformDialogOpen, setPlatformDialogOpen] = useState(false);
  const [marketDialogOpen, setMarketDialogOpen] = useState(false);
  const [pendingDuplication, setPendingDuplication] = useState<{
    type: 'platform' | 'market';
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
      return (genericConfig.strategyFocus && genericConfig.strategyFocus !== "auto")
        ? genericConfig.strategyFocus
        : "conversions";
    }
    const hasPixel = platformsWithMarkets.some(p => p.markets.some(m => m.pixel));
    const hasCatalog = platformsWithMarkets.some(p => p.markets.some(m => m.catalog));
    const marketAdFormats = platformsWithMarkets.flatMap(p => p.markets.flatMap(m => (m as any).adFormats || []));
    const adFormats = Array.from(new Set([...(genericConfig.targeting?.adFormats || []), ...marketAdFormats]));
    const detected = determineStrategyFocus({ adFormats, hasPixel, hasCatalog });
    return detected || "conversions";
  }, [genericConfig.strategy, genericConfig.strategyFocus, genericConfig.targeting?.adFormats, platformsWithMarkets]);

  const genericConfigResolved: GenericConfig = useMemo(() => ({
    ...genericConfig,
    strategyFocus: effectiveStrategyFocus,
  }), [genericConfig, effectiveStrategyFocus]);

  // Render-time auto-detect for Step 3 (Strategy Configuration)
  useEffect(() => {
    if (currentStep !== 3) return;

    // 1) Set global strategy focus when in auto-detect
    if (genericConfig.strategy === "auto-detect") {
      const hasPixel = platformsWithMarkets.some(p => p.markets.some(m => m.pixel));
      const hasCatalog = platformsWithMarkets.some(p => p.markets.some(m => m.catalog));
      const marketAdFormats = platformsWithMarkets.flatMap(p => p.markets.flatMap(m => (m as any).adFormats || []));
      const adFormats = Array.from(new Set([...(genericConfig.targeting?.adFormats || []), ...marketAdFormats]));
      const detected = determineStrategyFocus({ adFormats, hasPixel, hasCatalog }) || "conversions";
      if (genericConfig.strategyFocus !== detected) {
        setGenericConfig(prev => ({ ...prev, strategyFocus: detected }));
      }
    }

    // 2) Set per-market strategyFocus and phases in auto-detect
    let changed = false;
    const updated = platformsWithMarkets.map(platform => ({
      ...platform,
      markets: platform.markets.map(market => {
        const strategy = market.strategy || genericConfig.strategy;
        if (strategy !== "auto-detect") return market;

        const marketAdFormats = (market as any).adFormats || [];
        const adFormats = Array.from(new Set([...(genericConfig.targeting?.adFormats || []), ...marketAdFormats]));
        const hasPixel = !!market.pixel;
        const hasCatalog = !!market.catalog;
        const detected = determineStrategyFocus({ adFormats, hasPixel, hasCatalog }) || "conversions";

        const needsFocusUpdate = !market.strategyFocus || market.strategyFocus === "auto" || market.strategyFocus !== detected;
        const needsPhases = !market.phases || market.phases.length === 0;

        if (!needsFocusUpdate && !needsPhases) return market;

        changed = true;
        return {
          ...market,
          strategyFocus: detected,
          phases: needsPhases ? (generateAutoDetectPhases(adFormats, hasPixel, hasCatalog, startDate, endDate) || []) : market.phases,
        };
      })
    }));

    if (changed) setPlatformsWithMarkets(updated);
  }, [currentStep, platformsWithMarkets, genericConfig.strategy, genericConfig.strategyFocus, genericConfig.targeting?.adFormats, startDate, endDate]);

  // Hydrate editor from a saved campaign record
  const hydrateFromCampaign = (c: any) => {
    try {
      setCampaignName(c.name || "");
      setBoNumber(c.bo_number || "");
      setTotalBudget(String(c.total_budget ?? ""));
      setStartDate(c.start_date || "");
      setEndDate(c.end_date || "");
      
      // Restore full genericConfig
      if (c.generic_config && typeof c.generic_config === 'object') {
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
            lookalikeAudience: ""
          }
        });
      } else {
        setGenericConfig(prev => ({ ...prev, strategyFocus: c.objective || prev.strategyFocus }));
      }

      // Restore platforms and markets completely from DB
      const alloc = c.budget_allocation || {};
      const splits = c.market_splits || {};
      const declaredPlatforms: any[] = Array.isArray(c.platforms) ? c.platforms : [];
      
      if (declaredPlatforms.length > 0) {
        const restoredPlatforms = declaredPlatforms.map((dp: any) => ({
          id: dp.id,
          name: dp.name,
          enabled: true,
          budgetPercentage: alloc[dp.id] ?? 0,
          markets: splits[dp.id] || [],
        }));
        setPlatformsWithMarkets(restoredPlatforms);
      }
      
      setIsHydrated(true);
    } catch (e) {
      console.error('Failed to hydrate draft', e);
      setIsHydrated(true);
    }
  };

  // Restore draft by URL param or localStorage (latest draft)
  useEffect(() => {
    const restore = async () => {
      if (!user || isHydrated) return;
      
      // Check if user explicitly wants a new campaign
      const urlParams = new URLSearchParams(window.location.search);
      const isNewCampaign = urlParams.get('new') === 'true';
      
      console.log('MediaPlanEditor restore:', { isNewCampaign, isHydrated, url: window.location.href });
      
      if (isNewCampaign) {
        // Clear the URL param and start fresh
        console.log('Starting fresh campaign - clearing all state');
        window.history.replaceState({}, '', '/');
        localStorage.removeItem('draftCampaignId');
        setSavedCampaignId(null);
        setIsHydrated(true);
        return;
      }
      
      let cid = urlParams.get('campaignId') || localStorage.getItem('draftCampaignId') || '';
      console.log('Checking for existing draft:', { cid, hasUrlParam: !!urlParams.get('campaignId'), hasLocalStorage: !!localStorage.getItem('draftCampaignId') });
      
      if (!cid) {
        const { data } = await supabase
          .from('campaigns')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'draft')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          cid = (data as any).id;
          console.log('Found latest draft from database:', cid);
        }
      }
      if (cid) {
        const { data: c, error } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', cid)
          .single();
        if (!error && c) {
          console.log('Loading draft campaign:', cid);
          setSavedCampaignId((c as any).id);
          localStorage.setItem('draftCampaignId', (c as any).id);
          hydrateFromCampaign(c);
        } else {
          console.log('No draft found, starting fresh');
          setIsHydrated(true);
        }
      } else {
        console.log('No campaign ID found, starting fresh');
        setIsHydrated(true);
      }
    };
    restore();
  }, [user, isHydrated]);
  
  // Fetch first ad account ID for audience fetching
  useEffect(() => {
    const fetchAdAccountId = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('meta_ad_accounts')
        .select('account_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();
      
      if (!error && data) {
        setFirstAdAccountId(data.account_id);
        console.log('✅ Loaded Ad Account ID:', data.account_id);
      }
    };
    fetchAdAccountId();
  }, [user]);
  
  // Legacy platforms for step 5 (Platform Configuration)
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

    const hasPixel = platformsWithMarkets.some(p => p.markets.some(m => m.pixel));
    const hasCatalog = platformsWithMarkets.some(p => p.markets.some(m => m.catalog));
    const marketAdFormats = platformsWithMarkets.flatMap(p => p.markets.flatMap(m => (m as any).adFormats || []));
    const adFormats = Array.from(new Set([...(genericConfig.targeting?.adFormats || []), ...marketAdFormats]));

    const determinedFocus = determineStrategyFocus({
      adFormats,
      hasPixel,
      hasCatalog,
    });

    // Update to detected focus if available and different
    if (determinedFocus && determinedFocus !== genericConfig.strategyFocus) {
      setGenericConfig(prev => ({ ...prev, strategyFocus: determinedFocus }));
    }
  }, [platformsWithMarkets, genericConfig.targeting?.adFormats, genericConfig.strategy]);

  // Auto-save draft whenever key fields change
  useEffect(() => {
    if (!savedCampaignId || !user) return;
    
    const timer = setTimeout(async () => {
      try {
        const selectedPlatforms = platformsWithMarkets.filter(p => p.id !== "");
        const budgetAllocation = selectedPlatforms
          .reduce((acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }), {});

        await supabase.from("campaigns").update({
          name: campaignName,
          objective: genericConfig.strategyFocus || "conversions",
          total_budget: parseFloat(totalBudget) || 0,
          start_date: startDate || null,
          end_date: endDate || null,
          platforms: selectedPlatforms.map(p => ({ id: p.id, name: p.name })),
          budget_allocation: budgetAllocation,
          market_splits: platformsWithMarkets.reduce((acc, platform) => ({
            ...acc,
            [platform.id]: platform.markets.map(m => ({
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
            })),
          }), {}),
          generic_config: {
            strategy: genericConfig.strategy,
            strategyFocus: genericConfig.strategyFocus,
            hasPhases: genericConfig.hasPhases,
            phases: genericConfig.phases,
            campaigns: genericConfig.campaigns,
            targeting: genericConfig.targeting,
          } as any,
        }).eq("id", savedCampaignId);
        
        console.log("Auto-saved draft");
      } catch (error) {
        console.error("Error auto-saving:", error);
      }
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timer);
  }, [campaignName, boNumber, totalBudget, startDate, endDate, platformsWithMarkets, genericConfig, savedCampaignId, user]);

  const isActivationDetailsComplete = () => {
    const allPlatformsSelected = platformsWithMarkets.every(p => p.id !== "");
    const allHaveMarkets = platformsWithMarkets.every(p => p.markets.length > 0);
    return !!(campaignName.trim() && boNumber.trim() && totalBudget && startDate && endDate && allPlatformsSelected && allHaveMarkets);
  };

  const isStrategyComplete = () => {
    return !!(genericConfig.strategy && genericConfig.strategyFocus);
  };

  const isPhaseSchedulerComplete = () => {
    // Always allow proceeding - phasing is optional
    return true;
  };

  const isTargetingComplete = () => {
    return !!(
      genericConfig.targeting?.ageMin &&
      genericConfig.targeting?.ageMax
    );
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
            campaigns: genericConfig.campaigns?.map(c => ({ ...c })),
            phases: genericConfig.phases?.map(p => ({ ...p })),
          }
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
    const enabledPlatforms = platforms.filter(p => p.enabled);
    if (enabledPlatforms.length === 0) return false;
    return enabledPlatforms.every(p => {
      if (!p.config) return false;
      const { strategy, strategyFocus, campaigns } = p.config;
      if (!strategy || !strategyFocus) return false;
      if (!campaigns || campaigns.length === 0) return false;
      return campaigns.every(c => !!(
        c.objective &&
        c.campaignType &&
        c.optimizationGoal &&
        c.targeting?.ageMin &&
        c.targeting?.ageMax
      ));
    });
  };

  const handleExport = () => {
    const selectedPlatforms = platformsWithMarkets.filter(p => p.id !== "");
    const campaignData = {
      name: campaignName,
      objective: genericConfig.strategyFocus,
      totalBudget,
      startDate,
      endDate,
      platforms: selectedPlatforms,
      budgetAllocation: selectedPlatforms
        .reduce((acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }), {}),
    };
    
    const blob = new Blob([JSON.stringify(campaignData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-${campaignName || 'plan'}.json`;
    a.click();
    toast.success("Media plan exported successfully!");
  };

  const handleLaunch = async () => {
    if (!campaignName.trim()) {
      toast.error("Please enter a campaign name");
      return;
    }
    
    if (!boNumber.trim()) {
      toast.error("Please enter a BO number");
      return;
    }

    // Check if BO number is unique
    const { data: existingCampaign } = await supabase
      .from("campaigns")
      .select("id")
      .eq("bo_number", boNumber.trim())
      .neq("id", savedCampaignId || "")
      .single();
    
    if (existingCampaign) {
      toast.error("BO number must be unique. This number is already in use.");
      return;
    }

    setSaving(true);
    try {
      // If campaign is already saved, just redirect
      if (savedCampaignId) {
        toast.success("ActiPlan ready!");
        setTimeout(() => {
          window.location.href = "/actiplans";
        }, 1000);
        return;
      }

      // Otherwise, save it now
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("User not authenticated");

      const selectedPlatforms = platformsWithMarkets.filter(p => p.id !== "");
      const budgetAllocation = selectedPlatforms
        .reduce((acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }), {});

      const { data: campaign, error } = await supabase.from("campaigns").insert({
        user_id: user.id,
        name: campaignName,
        bo_number: boNumber.trim(),
        objective: genericConfig.strategyFocus || "conversions",
        total_budget: parseFloat(totalBudget) || 0,
        start_date: startDate || null,
        end_date: endDate || null,
        platforms: selectedPlatforms.map(p => ({ id: p.id, name: p.name })),
        budget_allocation: budgetAllocation,
        market_splits: platformsWithMarkets.reduce((acc, platform) => ({
          ...acc,
          [platform.id]: platform.markets.map(m => ({
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
          })),
        }), {}),
        generic_config: {
          strategy: genericConfig.strategy,
          strategyFocus: genericConfig.strategyFocus,
          hasPhases: genericConfig.hasPhases,
          phases: genericConfig.phases,
          campaigns: genericConfig.campaigns,
          targeting: genericConfig.targeting,
        } as any,
        status: "draft",
      } as any).select().single();

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
        window.location.href = "/actiplans";
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
        { duration: 5000 }
      );
      return false;
    }
    
    return true;
  };

  const applyBudgetTypeDefaultsIfAvailable = async (skipIfSet = false) => {
    console.log('applyBudgetTypeDefaultsIfAvailable called, skipIfSet:', skipIfSet);
    try {
      const accountIds = Array.from(new Set(
        platformsWithMarkets.flatMap(p => p.enabled ? p.markets.map(m => m.adAccountId).filter(Boolean) as string[] : [])
      ));
      console.log('Account IDs found:', accountIds);
      if (accountIds.length === 0) return;
      const { data: accounts } = await supabase
        .from('meta_ad_accounts')
        .select('account_id, default_conversion_budget_type, default_non_conversion_budget_type')
        .in('account_id', accountIds);
      
      console.log('Fetched accounts with defaults:', accounts?.map(a => ({
        id: a.account_id,
        convDefault: a.default_conversion_budget_type,
        nonConvDefault: a.default_non_conversion_budget_type
      })));
      
      const defaultsMap: Record<string, { conv?: string; nonconv?: string }> = {};
      (accounts || []).forEach((a: any) => {
        defaultsMap[a.account_id] = {
          conv: a.default_conversion_budget_type || undefined,
          nonconv: a.default_non_conversion_budget_type || undefined,
        };
      });
      
      console.log('Budget type defaults map:', defaultsMap);
      
      let hasChanges = false;
      const updated = platformsWithMarkets.map(p => !p.enabled ? p : ({
        ...p,
        markets: p.markets.map(m => {
          const def = m.adAccountId ? defaultsMap[m.adAccountId] : undefined;
          if (!def) return m;
          
          const phases = (m.phases || []).map(ph => {
            // Skip if budget type is already set (including when user explicitly chose "none")
            if (skipIfSet && ph.budgetType !== undefined) return ph;
            // Only apply if budget type is truly unset (undefined)
            if (ph.budgetType !== undefined) return ph;
            
            const phaseObj = (ph.objective || '').toLowerCase();
            const phaseOpt = (ph.optimizationGoal || '').toLowerCase();
            const phaseFunnel = (ph.funnelStage || '').toLowerCase();
            const marketFocus = (m.strategyFocus || '').toLowerCase();
            
            // Non-conversion indicators (take priority)
            const isNonConversionObjective = 
              phaseObj.includes('brand awareness') ||
              phaseObj.includes('reach') ||
              phaseObj.includes('traffic') ||
              phaseObj.includes('engagement') ||
              phaseObj.includes('video views') ||
              phaseObj.includes('app installs');
            
            const isNonConversionOptGoal = 
              phaseOpt.includes('reach') ||
              phaseOpt.includes('link clicks') ||
              phaseOpt.includes('landing page views') ||
              phaseOpt.includes('post engagement') ||
              phaseOpt.includes('video views') ||
              phaseOpt.includes('app installs');
            
            // Conversion indicators
            const isConversionObjective = 
              phaseObj.includes('outcome_sales') || 
              phaseObj.includes('outcome_leads') ||
              phaseObj.includes('conversion');
            
            const isConversionOptGoal = 
              phaseOpt.includes('offsite_conversions') ||
              phaseOpt.includes('conversions') ||
              phaseOpt.includes('lead') ||
              phaseOpt.includes('purchase') ||
              phaseOpt.includes('complete_registration');
            
            const isConversionFunnel = 
              phaseFunnel.includes('conversion') ||
              phaseFunnel.includes('purchase') ||
              phaseFunnel.includes('action');
            
            const isConversionMarket = 
              marketFocus.includes('purchase') || 
              marketFocus.includes('lead') || 
              marketFocus.includes('conversion');
            
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
            
            console.log(`Phase "${ph.name}": obj=${phaseObj}, opt=${phaseOpt}, funnel=${phaseFunnel}, market=${marketFocus}, isConv=${isPhaseConversion}, applying=${candidate}`);
            
            if (candidate === 'daily' || candidate === 'lifetime') {
              hasChanges = true;
              return { ...ph, budgetType: candidate as 'daily' | 'lifetime' };
            }
            return ph;
          });
          return { ...m, phases };
        })
      }));
      
      if (hasChanges) {
        setPlatformsWithMarkets(updated);
      }
    } catch (e) {
      console.error('Error applying budget type defaults:', e);
    }
  };

  // Auto-apply budget type defaults when ad accounts or phases change
  useEffect(() => {
    const hasAccountsWithPhases = platformsWithMarkets.some(p => 
      p.enabled && p.markets.some(m => m.adAccountId && m.phases && m.phases.length > 0 && m.phases.some(ph => ph.budgetType === undefined))
    );
    if (hasAccountsWithPhases && isHydrated) {
      applyBudgetTypeDefaultsIfAvailable(true);
    }
  }, [platformsWithMarkets.map(p => 
    p.markets.map(m => `${m.adAccountId}-${m.phases?.length || 0}-${m.phases?.filter(ph => ph.budgetType === undefined).length || 0}`).join('|')
  ).join('||'), isHydrated]);

  const saveCampaignDraft = async () => {
    if (!campaignName.trim()) {
      toast.error("Please enter a campaign name");
      return null;
    }
    
    if (!boNumber.trim()) {
      toast.error("Please enter a BO number");
      return null;
    }

    if (!validateBudgetTypes()) {
      return null;
    }

    // Check if BO number is unique
    const { data: existingCampaign } = await supabase
      .from("campaigns")
      .select("id")
      .eq("bo_number", boNumber.trim())
      .neq("id", savedCampaignId || "")
      .single();
    
    if (existingCampaign) {
      toast.error("BO number must be unique. This number is already in use.");
      return null;
    }

    if (savedCampaignId) {
      return savedCampaignId;
    }

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("User not authenticated");

      const selectedPlatforms = platformsWithMarkets.filter(p => p.id !== "");
      const budgetAllocation = selectedPlatforms
        .reduce((acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }), {});

      const { data: campaign, error } = await supabase.from("campaigns").insert({
        user_id: user.id,
        name: campaignName,
        bo_number: boNumber.trim(),
        objective: genericConfig.strategyFocus || "conversions",
        total_budget: parseFloat(totalBudget) || 0,
        start_date: startDate || null,
        end_date: endDate || null,
        platforms: selectedPlatforms.map(p => ({ id: p.id, name: p.name })),
        budget_allocation: budgetAllocation,
        market_splits: platformsWithMarkets.reduce((acc, platform) => ({
          ...acc,
          [platform.id]: platform.markets.map(m => ({
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
        }), {}),
        generic_config: {
          strategy: genericConfig.strategy,
          strategyFocus: genericConfig.strategyFocus,
          hasPhases: genericConfig.hasPhases,
          phases: genericConfig.phases,
          campaigns: genericConfig.campaigns,
          targeting: genericConfig.targeting,
        } as any,
        status: "draft",
      } as any).select().single();

      if (error) throw error;

      await (supabase as any).from("campaign_change_history").insert({
        campaign_id: campaign.id,
        user_id: user.id,
        action: "created",
        new_status: "draft",
      } as any);

      setSavedCampaignId(campaign.id);
      localStorage.setItem('draftCampaignId', campaign.id);
      toast.success("ActiPlan draft saved!");
      return campaign.id;
    } catch (error: any) {
      toast.error(error.message || "Failed to save draft");
      return null;
    }
  };

  const ensureDraft = async () => {
    if (!savedCampaignId) {
      await saveCampaignDraft();
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
    
    const usedPlatformIds = platformsWithMarkets.map(p => p.id);
    return allPlatforms.filter(p => !usedPlatformIds.includes(p.id));
  };

  const duplicatePlatform = (platformId: string) => {
    const platformToDuplicate = platformsWithMarkets.find(p => p.id === platformId);
    if (!platformToDuplicate) return;
    
    setPendingDuplication({ type: 'platform', platformId });
    setPlatformDialogOpen(true);
  };

  const handlePlatformDuplicationConfirm = (newPlatformId: string) => {
    if (!pendingDuplication || pendingDuplication.type !== 'platform') return;
    
    const platformToDuplicate = platformsWithMarkets.find(p => p.id === pendingDuplication.platformId);
    if (!platformToDuplicate) return;

    const newPlatformName = getAvailablePlatforms().find(p => p.id === newPlatformId)?.name || newPlatformId;
    
    const newPlatform = {
      ...platformToDuplicate,
      id: newPlatformId,
      name: newPlatformName,
      markets: platformToDuplicate.markets.map(market => ({
        ...market,
        id: `${market.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      })),
    };
    
    setPlatformsWithMarkets(prev => [...prev, newPlatform]);
    setPendingDuplication(null);
    ensureDraft();
    toast.success("Platform duplicated successfully");
  };

  const deletePlatform = (platformId: string) => {
    setPlatformsWithMarkets(prev => prev.filter(p => p.id !== platformId));
    ensureDraft();
    toast.success("Platform deleted successfully");
  };

  const duplicateMarket = (platformId: string, marketId: string) => {
    setPendingDuplication({ type: 'market', platformId, marketId });
    setMarketDialogOpen(true);
  };

  const handleMarketDuplicationConfirm = (marketValue: string, marketLabel: string) => {
    if (!pendingDuplication || pendingDuplication.type !== 'market') return;
    
    const { platformId, marketId } = pendingDuplication;
    if (!platformId || !marketId) return;
    
    setPlatformsWithMarkets(prev => prev.map(platform => {
      if (platform.id !== platformId) return platform;
      
      const marketToDuplicate = platform.markets.find(m => m.id === marketId);
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
    }));
    
    setPendingDuplication(null);
    ensureDraft();
    toast.success(`Market "${marketLabel}" duplicated successfully`);
  };

  const deleteMarket = (platformId: string, marketId: string) => {
    setPlatformsWithMarkets(prev => prev.map(platform => {
      if (platform.id !== platformId) return platform;
      return {
        ...platform,
        markets: platform.markets.filter(m => m.id !== marketId),
      };
    }));
    ensureDraft();
    toast.success("Market deleted successfully");
  };

  const getMarketLabel = (marketValue: string) => {
    return MARKET_OPTIONS.find(m => m.value === marketValue)?.label || marketValue;
  };

  const handleBudgetTypeConfirm = (phaseBudgetTypes: Record<string, "daily" | "lifetime">) => {
    if (!selectedMarketForBudget) return;
    
    const { platformId, marketId } = selectedMarketForBudget;
    
    setPlatformsWithMarkets(prev => prev.map(p => 
      p.id === platformId ? {
        ...p,
        markets: p.markets.map(m => 
          m.id === marketId ? {
            ...m,
            phases: (m.phases || []).map((phase: any) => ({
              ...phase,
              budgetType: phaseBudgetTypes[phase.id] || "lifetime"
            }))
          } : m
        )
      } : p
    ));
    
    setBudgetTypeDialogOpen(false);
    setSelectedMarketForBudget(null);
    toast.success("Budget types applied to all campaigns");
    ensureDraft();
  };

  return (
    <div className="space-y-6">
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
                  onChange={(e) => { setCampaignName(e.target.value); ensureDraft(); }}
                  placeholder="e.g., Q1 2024 Brand Activation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bo-number">BO Number *</Label>
                <Input
                  id="bo-number"
                  value={boNumber}
                  onChange={(e) => { setBoNumber(e.target.value); ensureDraft(); }}
                  placeholder="e.g., BO-2025-001"
                  required
                />
                <p className="text-xs text-muted-foreground">Unique financial reference for invoicing</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget">Total Activation Budget ($)</Label>
              <Input
                id="budget"
                type="number"
                value={totalBudget}
                onChange={(e) => { setTotalBudget(e.target.value); ensureDraft(); }}
                placeholder="Enter total budget"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start-date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Start Date
                </Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); ensureDraft(); }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  End Date
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); ensureDraft(); }}
                />
              </div>
            </div>

            <div className="pt-4">
              <PlatformMarketBudgetSelector
                platforms={platformsWithMarkets}
                setPlatforms={setPlatformsWithMarkets}
                totalBudget={parseFloat(totalBudget) || 0}
                setStartDate={setStartDate}
                setEndDate={setEndDate}
                setTotalBudget={setTotalBudget}
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button 
                onClick={async () => { await ensureDraft(); setCurrentStep(2); }} 
                disabled={!isActivationDetailsComplete()}
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
                  {startDate && endDate && `${format(parseISO(startDate), "MMM d")} - ${format(parseISO(endDate), "MMM d, yyyy")}`}
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
              <BasicTargeting
                targeting={basicTargeting}
                onUpdate={(targeting) => {
                  setBasicTargeting(targeting);
                  console.log('📋 Basic Targeting Mode: User-defined demographics', targeting);
                }}
              />
              <div className="mt-6 flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  Back
                </Button>
                <Button onClick={() => {
                  setCurrentStep(3);
                  ensureDraft();
                }}>
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
                    <span className="font-medium text-foreground">{basicTargeting.ageMin} - {basicTargeting.ageMax}</span>
                  </div>
                )}
                {basicTargeting.genders && basicTargeting.genders.length > 0 && (
                  <div className="flex justify-between">
                    <span>Gender:</span>
                    <span className="font-medium text-foreground">{basicTargeting.genders.join(", ")}</span>
                  </div>
                )}
                {basicTargeting.language && (
                  <div className="flex justify-between">
                    <span>Language:</span>
                    <span className="font-medium text-foreground">{basicTargeting.language}</span>
                  </div>
                )}
                {basicTargeting.devices && basicTargeting.devices.length > 0 && (
                  <div className="flex justify-between">
                    <span>Devices:</span>
                    <span className="font-medium text-foreground">{basicTargeting.devices.join(", ")}</span>
                  </div>
                )}
                {basicTargeting.os && basicTargeting.os.length > 0 && (
                  <div className="flex justify-between">
                    <span>Operating Systems:</span>
                    <span className="font-medium text-foreground">{basicTargeting.os.join(", ")}</span>
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
              {currentStep > 3 && (
                <Button variant="ghost" size="sm" onClick={() => setCurrentStep(3)}>
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          {currentStep === 3 ? (
            <CardContent className="space-y-6">

              {/* Generate audiences from brief */}
              <TargetingBriefInput
                onTargetingGenerated={(targeting) => {
                  // Normalize fields from the parser (some markets return age{min,max} instead of ageMin/ageMax)
                  const normalized = (targeting || []).map((t: any) => ({
                    ...t,
                    ageMin: t.ageMin ?? t.age?.min,
                    ageMax: t.ageMax ?? t.age?.max,
                    gender: Array.isArray(t.gender)
                      ? t.gender
                      : (t.gender ? [t.gender] : (t.genders || [])),
                  }));

                  console.info("[Step 3] Parsed audiences generated:", normalized);

                  // Derive demographics from parsed targeting
                  const ages = normalized
                    .map((t: any) => ({ min: t.ageMin, max: t.ageMax }))
                    .filter((a: any) => a.min != null || a.max != null);

                  const ageMin = ages.length ? Math.min(...ages.map((a: any) => a.min ?? 13)) : undefined;
                  const ageMax = ages.length ? Math.max(...ages.map((a: any) => a.max ?? 65)) : undefined;

                  const gendersSet = new Set<string>();
                  normalized.forEach((t: any) => (t.gender ?? []).forEach((g: string) => gendersSet.add(g)));
                  const devicesSet = new Set<string>();
                  normalized.forEach((t: any) => (t.devices ?? []).forEach((d: string) => devicesSet.add(d)));
                  const languagesSet = new Set<string>();
                  normalized.forEach((t: any) => (t.languages ?? []).forEach((l: string) => languagesSet.add(l)));

                  // Detailed console logs
                  console.groupCollapsed('[Step 3] Demographics applied');
                  console.table({
                    ageMin,
                    ageMax,
                    genders: Array.from(gendersSet).join(', '),
                    devices: Array.from(devicesSet).join(', '),
                    languages: Array.from(languagesSet).join(', '),
                  });
                  console.groupEnd();

                  const interests = normalized.flatMap((t: any) => t.interests || []);
                  const behaviors = normalized.flatMap((t: any) => t.behaviors || []);
                  const customAudiences = normalized.flatMap((t: any) => t.customAudiences || []);
                  const lookalikes = normalized.flatMap((t: any) => t.lookalikes || []);
                  const customerLists = normalized.flatMap((t: any) => t.customerLists || []);

                  console.groupCollapsed('[Step 3] Audiences breakdown');
                  console.log('Interests');
                  console.table(interests.map((i: any) => ({ name: i.name, size: i.audienceSize, id: i.id })));
                  console.log('Behaviors');
                  console.table(behaviors.map((b: any) => ({ name: b.name, size: b.audienceSize, id: b.id })));
                  console.log('Custom Audiences');
                  console.table(customAudiences.map((c: any) => ({ name: c.name, id: c.id, type: c.type })));
                  console.log('Lookalikes');
                  console.table(lookalikes.map((l: any) => ({ name: l.name, id: l.id, source: l.sourceAudienceId })));
                  console.log('Customer Lists');
                  console.table(customerLists.map((c: any) => ({ name: c.name, id: c.id })));
                  console.groupEnd();

                  // Apply to campaign generic targeting as a baseline
                  setGenericConfig((prev) => ({
                    ...prev,
                    parsedTargeting: normalized,
                    targeting: {
                      ...(prev.targeting || {}),
                      ageMin: ageMin ?? prev.targeting?.ageMin,
                      ageMax: ageMax ?? prev.targeting?.ageMax,
                      genders: Array.from(gendersSet).length ? Array.from(gendersSet) : prev.targeting?.genders,
                      devices: Array.from(devicesSet).length ? Array.from(devicesSet) : prev.targeting?.devices,
                      language: Array.from(languagesSet).length ? Array.from(languagesSet).join(', ') : prev.targeting?.language,
                    },
                  }));
                }}
              />

              {genericConfig.parsedTargeting && genericConfig.parsedTargeting.length > 0 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Applied Audiences</h3>
                  {genericConfig.parsedTargeting.map((targeting: any, marketIdx: number) => (
                    <div key={marketIdx} className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-base font-semibold">{targeting.market}</h4>
                        <div className="flex gap-2 text-sm text-muted-foreground">
                          {targeting.ageMin && targeting.ageMax && (
                            <span>Age: {targeting.ageMin}-{targeting.ageMax}</span>
                          )}
                          {targeting.gender && targeting.gender.length > 0 && (
                            <span>• {targeting.gender.join(", ")}</span>
                          )}
                        </div>
                      </div>

                      {(() => {
                        console.groupCollapsed(`[Step 3] Market ${targeting.market}`);
                        console.table({
                          interests: targeting.interests?.length || 0,
                          behaviors: targeting.behaviors?.length || 0,
                          customAudiences: targeting.customAudiences?.length || 0,
                          lookalikes: targeting.lookalikes?.length || 0,
                          customerLists: targeting.customerLists?.length || 0,
                        });
                        console.log('Audience objects', targeting);
                        console.groupEnd();
                        return null;
                      })()}

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {/* Interests */}
                        {targeting.interests?.map((interest: any, idx: number) => (
                          <AudienceCard
                            key={`interest-${idx}`}
                            type="interest"
                            name={interest.name}
                            audienceSize={interest.audienceSize}
                            metadata={{ id: interest.id }}
                            onRemove={() => {
                              const newTargeting = [...(genericConfig.parsedTargeting || [])];
                              newTargeting[marketIdx] = {
                                ...newTargeting[marketIdx],
                                interests: (newTargeting[marketIdx].interests || []).filter((_: any, i: number) => i !== idx),
                              };
                              setGenericConfig({ ...genericConfig, parsedTargeting: newTargeting });
                            }}
                          />
                        ))}

                        {/* Behaviors */}
                        {targeting.behaviors?.map((behavior: any, idx: number) => (
                          <AudienceCard
                            key={`behavior-${idx}`}
                            type="behavior"
                            name={behavior.name}
                            audienceSize={behavior.audienceSize}
                            metadata={{ id: behavior.id }}
                            onRemove={() => {
                              const newTargeting = [...(genericConfig.parsedTargeting || [])];
                              newTargeting[marketIdx] = {
                                ...newTargeting[marketIdx],
                                behaviors: (newTargeting[marketIdx].behaviors || []).filter((_: any, i: number) => i !== idx),
                              };
                              setGenericConfig({ ...genericConfig, parsedTargeting: newTargeting });
                            }}
                          />
                        ))}

                        {/* Custom Audiences */}
                        {targeting.customAudiences?.map((aud: any, idx: number) => (
                          <AudienceCard
                            key={`custom-${idx}`}
                            type="customAudience"
                            name={aud.name}
                            metadata={{ id: aud.id, type: aud.type }}
                            onRemove={() => {
                              const newTargeting = [...(genericConfig.parsedTargeting || [])];
                              newTargeting[marketIdx] = {
                                ...newTargeting[marketIdx],
                                customAudiences: (newTargeting[marketIdx].customAudiences || []).filter((_: any, i: number) => i !== idx),
                              };
                              setGenericConfig({ ...genericConfig, parsedTargeting: newTargeting });
                            }}
                          />
                        ))}

                        {/* Lookalikes */}
                        {targeting.lookalikes?.map((ll: any, idx: number) => (
                          <AudienceCard
                            key={`lookalike-${idx}`}
                            type="lookalike"
                            name={ll.name}
                            metadata={{ id: ll.id, sourceAudienceId: ll.sourceAudienceId }}
                            onRemove={() => {
                              const newTargeting = [...(genericConfig.parsedTargeting || [])];
                              newTargeting[marketIdx] = {
                                ...newTargeting[marketIdx],
                                lookalikes: (newTargeting[marketIdx].lookalikes || []).filter((_: any, i: number) => i !== idx),
                              };
                              setGenericConfig({ ...genericConfig, parsedTargeting: newTargeting });
                            }}
                          />
                        ))}

                        {/* Customer Lists */}
                        {targeting.customerLists?.map((cl: any, idx: number) => (
                          <AudienceCard
                            key={`customer-${idx}`}
                            type="customerList"
                            name={cl.name}
                            metadata={{ id: cl.id }}
                            onRemove={() => {
                              const newTargeting = [...(genericConfig.parsedTargeting || [])];
                              newTargeting[marketIdx] = {
                                ...newTargeting[marketIdx],
                                customerLists: (newTargeting[marketIdx].customerLists || []).filter((_: any, i: number) => i !== idx),
                              };
                              setGenericConfig({ ...genericConfig, parsedTargeting: newTargeting });
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Phase Scheduling */}
              {(() => {
                const totalMarkets = platformsWithMarkets.reduce((sum, p) => sum + (p.enabled ? p.markets.length : 0), 0);
                
                if (totalMarkets === 1) {
                  // Single market: show strategy configuration and PhaseScheduler
                  const singlePlatform = platformsWithMarkets.find(p => p.enabled && p.markets.length > 0);
                  const singleMarket = singlePlatform ? singlePlatform.markets[0] : null;
                  
                  return singleMarket ? (
                    <div className="mt-6 pt-6 border-t space-y-6">
                      {/* Strategy Configuration for Single Market */}
                      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                        <h4 className="font-medium">Campaign Strategy</h4>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Strategy Type</Label>
                            <Select 
                              value={singleMarket.strategy || genericConfig.strategy || "auto-detect"}
                              onValueChange={(value) => {
                                const adFormats = singleMarket.adFormats || genericConfig.targeting?.adFormats || [];
                                const hasPixel = !!singleMarket.pixel;
                                const hasCatalog = !!singleMarket.catalog;
                                let newPhases: any[] = [];
                                
                                if (value === "auto-detect") {
                                  newPhases = generateAutoDetectPhases(adFormats, hasPixel, hasCatalog, startDate, endDate) || [];
                                } else if (value === "full-funnel") {
                                  const focus = singleMarket.strategyFocus || genericConfig.strategyFocus;
                                  const templateKey = mapFocusToTemplate(focus);
                                  if (templateKey) {
                                    newPhases = getDefaultPhases(templateKey, startDate, endDate) || [];
                                  }
                                } else if (value === "manual") {
                                  newPhases = [];
                                }
                                
                                setPlatformsWithMarkets(prev => prev.map(p => 
                                  p.id === singlePlatform?.id ? {
                                    ...p,
                                    markets: p.markets.map(m => 
                                      m.id === singleMarket.id ? { 
                                        ...m, 
                                        strategy: value,
                                        phases: newPhases
                                      } : m
                                    )
                                  } : p
                                ));
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select strategy type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto-detect">Auto-Generate</SelectItem>
                                <SelectItem value="full-funnel">Full-Funnel</SelectItem>
                                <SelectItem value="manual">Custom</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {(singleMarket.strategy || genericConfig.strategy) === "full-funnel" && (
                            <div className="space-y-2">
                              <Label>Strategy Focus</Label>
                              <Select 
                                value={singleMarket.strategyFocus || genericConfig.strategyFocus || "auto"}
                                onValueChange={(value) => {
                                  const templateKey = mapFocusToTemplate(value);
                                  const newPhases = templateKey ? getDefaultPhases(templateKey, startDate, endDate) : [];
                                  setPlatformsWithMarkets(prev => prev.map(p => 
                                    p.id === singlePlatform?.id ? {
                                      ...p,
                                      markets: p.markets.map(m => 
                                        m.id === singleMarket.id ? { ...m, strategyFocus: value, phases: newPhases } : m
                                      )
                                    } : p
                                  ));
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select focus" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="auto" disabled>Select a focus…</SelectItem>
                                  <SelectItem value="purchase">Purchase</SelectItem>
                                  <SelectItem value="leads">Leads</SelectItem>
                                  <SelectItem value="app-installs">App Installs</SelectItem>
                                  <SelectItem value="conversions">Conversions</SelectItem>
                                  <SelectItem value="brand-awareness">Brand Awareness</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </div>

                      <PhaseScheduler
                        phases={singleMarket.phases || []}
                        onPhasesChange={(phases) => {
                          setPlatformsWithMarkets(prev => prev.map(p => 
                            p.id === singlePlatform?.id ? {
                              ...p,
                              markets: p.markets.map(m => m.id === singleMarket.id ? { ...m, phases } : m)
                            } : p
                          ));
                        }}
                        startDate={startDate}
                        endDate={endDate}
                        platformName={singlePlatform?.name || "Facebook (Meta)"}
                        onApplyBudgetTypeToAll={(type) => {
                          setPlatformsWithMarkets(prev => prev.map(p => p.id === singlePlatform?.id ? {
                            ...p,
                            markets: p.markets.map(m => ({
                              ...m,
                              phases: (m.phases || []).map(ph => ({ ...ph, budgetType: type }))
                            }))
                          } : p));
                        }}
                        onOpenCustomizeBudgetTypes={() => {
                          if (singlePlatform) {
                            setBulkPlatform(singlePlatform as any);
                            setBulkBudgetDialogOpen(true);
                          }
                        }}
                        marketBudget={(parseFloat(totalBudget || "0") * ((singlePlatform?.budgetPercentage || 0) / 100) * ((singleMarket.budgetPercentage || 0) / 100))}
                      />
                    </div>
                  ) : null;
                } else if (totalMarkets > 1) {
                  // Multiple markets: show strategy controls and PhaseScheduler for each market
                  return (
                    <div className="mt-6 pt-6 border-t space-y-6">
                      <h3 className="text-lg font-semibold">Market Configuration</h3>
                      {platformsWithMarkets.map(platform => (
                        platform.enabled && platform.markets.length > 0 ? (
                          <Collapsible
                            key={platform.id}
                            open={expandedPlatforms[platform.id]}
                            onOpenChange={(open) => setExpandedPlatforms(prev => ({ ...prev, [platform.id]: open }))}
                            className="border rounded-lg"
                          >
                            <CollapsibleTrigger asChild>
                              <div className="flex items-center gap-2 w-full">
                                <Button
                                  variant="ghost"
                                  className="flex-1 justify-between p-4 hover:bg-accent"
                                >
                                  <span className="font-semibold text-lg">{platform.name}</span>
                                  {expandedPlatforms[platform.id] ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
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
                                </div>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="px-4 pb-4">
                              <div className="space-y-4">
                                {platform.markets.map(market => (
                                  <Card key={market.id} className="p-4">
                                    <div className="flex items-center justify-between mb-4">
                                      <h4 className="font-medium">
                                        {getMarketLabel(market.name)}
                                      </h4>
                                      <div className="flex gap-1">
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
                                      </div>
                                    </div>
                                
                                {/* Per-Market Strategy Configuration */}
                                <div className="space-y-4 mb-6 p-4 bg-muted/50 rounded-lg">
                                   <div className="space-y-2">
                                    <Label>Strategy Type</Label>
                                    <Select 
                                      value={market.strategy || genericConfig.strategy || "auto-detect"}
                                      onValueChange={(value) => {
                                        const adFormats = market.adFormats || genericConfig.targeting?.adFormats || [];
                                        const hasPixel = !!market.pixel;
                                        const hasCatalog = !!market.catalog;
                                        let newPhases: any[] = [];

                                        if (value === "auto-detect") {
                                          newPhases = generateAutoDetectPhases(adFormats, hasPixel, hasCatalog, startDate, endDate) || [];
                                        } else if (value === "full-funnel") {
                                          const focus = market.strategyFocus || genericConfig.strategyFocus;
                                          const templateKey = mapFocusToTemplate(focus);
                                          if (templateKey) {
                                            newPhases = getDefaultPhases(templateKey, startDate, endDate) || [];
                                          }
                                        } else if (value === "manual") {
                                          newPhases = [];
                                        }

                                        setPlatformsWithMarkets(prev => prev.map(p => 
                                          p.id === platform.id ? {
                                            ...p,
                                            markets: p.markets.map(m => 
                                              m.id === market.id ? { 
                                                ...m, 
                                                strategy: value,
                                                phases: newPhases
                                              } : m
                                            )
                                          } : p
                                        ));
                                        ensureDraft();
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select strategy" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="auto-detect">Auto-Generate</SelectItem>
                                        <SelectItem value="full-funnel">Full-Funnel</SelectItem>
                                        <SelectItem value="manual">Custom</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {(market.strategy || genericConfig.strategy) === "full-funnel" && (
                                    <div className="space-y-2">
                                      <Label>Strategy Focus</Label>
                                      <Select 
                                        value={market.strategyFocus || genericConfig.strategyFocus || "auto"}
                                        onValueChange={(value) => {
                                          const templateKey = mapFocusToTemplate(value);
                                          const newPhases = templateKey ? getDefaultPhases(templateKey, startDate, endDate) : [];
                                          setPlatformsWithMarkets(prev => prev.map(p => 
                                            p.id === platform.id ? {
                                              ...p,
                                              markets: p.markets.map(m => 
                                                m.id === market.id ? { ...m, strategyFocus: value, phases: newPhases } : m
                                              )
                                            } : p
                                          ));
                                          ensureDraft();
                                        }}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select focus" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="auto" disabled>Select a focus…</SelectItem>
                                          <SelectItem value="purchase">Purchase</SelectItem>
                                          <SelectItem value="leads">Leads</SelectItem>
                                          <SelectItem value="app-installs">App Installs</SelectItem>
                                          <SelectItem value="conversions">Conversions</SelectItem>
                                          <SelectItem value="brand-awareness">Brand Awareness</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const currentStrategy = market.strategy || genericConfig.strategy;
                                      const currentFocus = market.strategyFocus || genericConfig.strategyFocus;
                                      
                                      setPlatformsWithMarkets(prev => prev.map(p => ({
                                        ...p,
                                        markets: p.markets.map(m => {
                                          const adFormats = m.adFormats || genericConfig.targeting?.adFormats || [];
                                          const hasPixel = !!m.pixel;
                                          const hasCatalog = !!m.catalog;
                                          let newPhases: any[] = [];

                                          if (currentStrategy === "auto-detect") {
                                            newPhases = generateAutoDetectPhases(adFormats, hasPixel, hasCatalog, startDate, endDate) || [];
                                          } else if (currentStrategy === "full-funnel") {
                                            const templateKey = mapFocusToTemplate(currentFocus);
                                            if (templateKey) {
                                              newPhases = getDefaultPhases(templateKey, startDate, endDate) || [];
                                            }
                                          } else if (currentStrategy === "manual") {
                                            newPhases = [];
                                          }

                                          return {
                                            ...m,
                                            strategy: currentStrategy,
                                            strategyFocus: currentFocus,
                                            phases: newPhases
                                          };
                                        })
                                      })));
                                      
                                      toast.success("Strategy applied to all markets. Phases regenerated.");
                                      ensureDraft();
                                    }}
                                  >
                                    Apply Strategy to All Markets
                                  </Button>
                                  
                                    {/* Inline budget type selection is available per phase below. */}
                                </div>

                                <PhaseScheduler
                                  phases={market.phases || []}
                                  onPhasesChange={(phases) => {
                                    setPlatformsWithMarkets(prev => prev.map(p => 
                                      p.id === platform.id ? {
                                        ...p,
                                        markets: p.markets.map(m => m.id === market.id ? { ...m, phases } : m)
                                      } : p
                                    ));
                                  }}
                                  startDate={startDate}
                                  endDate={endDate}
                                  platformName={platform.name}
                                  platformId={platform.id}
                                  strategy={market.strategy || genericConfig.strategy}
                                  strategyFocus={market.strategyFocus || genericConfig.strategyFocus}
                                  marketTargeting={{
                                    ageMin: market.ageMin || genericConfig.targeting?.ageMin,
                                    ageMax: market.ageMax || genericConfig.targeting?.ageMax,
                                    gender: market.gender || genericConfig.targeting?.genders?.[0],
                                    devices: genericConfig.targeting?.devices,
                                  }}
                                  onApplyBudgetTypeToAll={(type) => {
                                    setPlatformsWithMarkets(prev => prev.map(p => p.id === platform.id ? {
                                      ...p,
                                      markets: p.markets.map(m => ({
                                        ...m,
                                        phases: (m.phases || []).map(ph => ({ ...ph, budgetType: type }))
                                      }))
                                    } : p));
                                    toast.success(`Applied ${type === 'daily' ? 'Daily' : 'Lifetime'} Budget to all phases in ${platform.name}`);
                                  }}
                                  onOpenCustomizeBudgetTypes={() => {
                                    setBulkPlatform(platform as any);
                                    setBulkBudgetDialogOpen(true);
                                  }}
                                  marketBudget={(parseFloat(totalBudget || "0") * ((platform.budgetPercentage || 0) / 100) * ((market.budgetPercentage || 0) / 100))}
                                  />
                                </Card>
                              ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ) : null
                      ))}
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
                    const totalMarkets = platformsWithMarkets.reduce((sum, p) => sum + (p.enabled ? p.markets.length : 0), 0);
                    
                    // Skip auto-generation if there's only 1 market (phases are configured in PhaseScheduler above)
                    if (totalMarkets > 1) {
                      // Check if any market is missing phases
                      const needsPhaseGeneration = platformsWithMarkets.some(platform => 
                        platform.enabled && platform.markets.some(market => !market.phases || market.phases.length === 0)
                      );

                      if (needsPhaseGeneration) {
                        if (genericConfig.strategy === "auto-detect") {
                          const updatedPlatforms = platformsWithMarkets.map(platform => ({
                            ...platform,
                            markets: platform.markets.map(market => {
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
                                endDate
                              );
                              return {
                                ...market,
                                strategyFocus: detectedFocus || "conversions",
                                phases: phases.map(p => ({
                                  ...p,
                                  id: `phase-${market.id}-${p.id}`,
                                }))
                              };
                            })
                          }));
                          setPlatformsWithMarkets(updatedPlatforms);
                        } else if (genericConfig.strategy === "full-funnel" && genericConfig.strategyFocus && genericConfig.strategyFocus !== "auto") {
                          const phases = getDefaultPhases(genericConfig.strategyFocus, startDate, endDate);
                          const updatedPlatforms = platformsWithMarkets.map(platform => ({
                            ...platform,
                            markets: platform.markets.map(market => {
                              // Only generate if market doesn't have phases
                              if (market.phases && market.phases.length > 0) {
                                return market;
                              }
                              return {
                                ...market,
                                phases: phases.map(p => ({
                                  ...p,
                                  id: `phase-${market.id}-${p.id}`,
                                }))
                              };
                            })
                          }));
                          setPlatformsWithMarkets(updatedPlatforms);
                        } else if (genericConfig.strategy === "manual") {
                          const updatedPlatforms = platformsWithMarkets.map(platform => ({
                            ...platform,
                            markets: platform.markets.map(market => {
                              // Only generate if market doesn't have phases
                              if (market.phases && market.phases.length > 0) {
                                return market;
                              }
                              return {
                                ...market,
                                phases: [{
                                  id: `phase-${market.id}-${Date.now()}`,
                                  name: "Campaign 1",
                                  startDate: startDate,
                                  endDate: endDate,
                                  budgetPercentage: 100,
                                }]
                              };
                            })
                          }));
                          setPlatformsWithMarkets(updatedPlatforms);
                        }
                      }
                    }
                    await applyBudgetTypeDefaultsIfAvailable();
                    if (!validateBudgetTypes()) {
                      return;
                    }
                    await ensureDraft();
                    setCurrentStep(4);
                  }}
                  disabled={!genericConfig.strategy || (genericConfig.strategy !== "auto-detect" && !genericConfig.strategyFocus)}
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
                  <span className="font-medium text-foreground capitalize">{genericConfig.strategy?.replace('-', ' ')}</span>
                </div>
                {genericConfig.strategy !== "auto-detect" && (
                  <div className="flex justify-between">
                    <span>Focus:</span>
                    <span className="font-medium text-foreground capitalize">{genericConfig.strategyFocus?.replace('-', ' ')}</span>
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
          startDate={startDate}
          endDate={endDate}
          campaignId={savedCampaignId || undefined}
          onBack={() => setCurrentStep(3)}
          onFinalize={handleLaunch}
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
        campaigns={selectedMarketForBudget?.phases.map(phase => ({
          id: phase.id,
          name: phase.name,
          budgetType: phase.budgetType,
          startDate: phase.startDate,
          endDate: phase.endDate
        })) || []}
        marketBudget={selectedMarketForBudget?.marketBudget || 0}
      />

      <BulkBudgetTypeDialog
        open={bulkBudgetDialogOpen}
        onOpenChange={setBulkBudgetDialogOpen}
        platform={bulkPlatform}
        onSave={(updatedMarkets) => {
          if (!bulkPlatform) return;
          setPlatformsWithMarkets(prev => prev.map(p =>
            p.id === bulkPlatform.id ? { ...p, markets: updatedMarkets } : p
          ));
          toast.success("Budget types updated across markets.");
        }}
      />
    </div>
  );
}
