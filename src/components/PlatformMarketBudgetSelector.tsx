import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Copy, Loader2 } from "lucide-react";
import { PlatformWithMarkets, Market } from "@/types/mediaplan";
import { AdFormatSelector } from "./AdFormatSelector";
import { PhaseScheduler } from "./PhaseScheduler";
import { getTestPresets, getRFTestPreset } from "@/utils/testPresets";
import { supabase } from "@/integrations/supabase/client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import React, { useState, useEffect } from "react";
import { MARKET_OPTIONS, TIKTOK_MARKET_OPTIONS } from "@/utils/markets";

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
}

const AVAILABLE_PLATFORMS = [
  { id: "meta", name: "Meta" },
  { id: "google", name: "Google Ads" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "tiktok", name: "TikTok" },
  { id: "snapchat", name: "Snapchat" },
  { id: "pinterest", name: "Pinterest" },
];

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
  selectedClientId
}: PlatformMarketBudgetSelectorProps) {
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
  const [loadingConversionEvents, setLoadingConversionEvents] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
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
  
  const totalAllocated = platforms.reduce((sum, p) => sum + p.budgetPercentage, 0);
  const usedPlatformIds = platforms.map(p => p.id).filter(id => id !== "");

  // Fetch all Meta and TikTok resources from database
  useEffect(() => {
    fetchMetaResources();
    fetchTiktokResources();
  }, [selectedClientId]); // Re-fetch when client changes

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
      // If a client is selected, filter by client_id
      let query = supabase
        .from("meta_ad_accounts" as any)
        .select("*")
        .order("synced_at", { ascending: false });
      
      if (selectedClientId) {
        query = query.eq("client_id", selectedClientId);
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
            mainMarkets: Array.isArray(acc.main_markets) ? acc.main_markets : [],
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
        setPages(pagesData.map((page: any) => ({
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
        setPixels(pixelsData.map((pixel: any) => ({
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
        setCatalogs(catalogsData.map((catalog: any) => ({
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
        setProductSets(productSetsData.map((ps: any) => ({
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
        setConversionEvents(eventsData.map((event: any) => ({
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
        setInstagramAccounts(igData.map((ig: any) => ({
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
          mainMarkets: acc.main_markets,
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

  // Check if market needs conversion event (has conversion-related phases)
  const needsConversionEvent = (market: any) => {
    if (!market.phases || market.phases.length === 0) return false;
    
    return market.phases.some((phase: any) => {
      const phaseName = phase.name?.toLowerCase() || "";
      const objective = phase.objective?.toLowerCase() || "";
      return (
        phaseName.includes("conversion") ||
        phaseName.includes("purchase") ||
        phaseName.includes("sales") ||
        phaseName.includes("lead") ||
        objective.includes("conversion") ||
        objective.includes("sales") ||
        objective.includes("lead")
      );
    });
  };

  const addPlatform = () => {
    const newPlatform: PlatformWithMarkets = {
      id: "",
      name: "",
      enabled: true,
      budgetPercentage: 0,
      markets: [{ 
        id: `market-1-${Date.now()}`, 
        name: "Market 1", 
        budgetPercentage: 100, 
        phases: [],
        // Default targeting for R&F compatibility
        countries: ["US"],
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
      setPlatforms(
        platforms.map((p, i) => 
          i === index 
            ? { ...p, id: selectedPlatform.id, name: selectedPlatform.name }
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
    };
    setPlatforms([...platforms, newPlatform]);
  };

  const updatePlatformBudget = (index: number, percentage: number) => {
    setPlatforms(
      platforms.map((p, i) => 
        i === index 
          ? { ...p, budgetPercentage: Math.max(0, Math.min(100, percentage)) }
          : p
      )
    );
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
                m.id === marketId ? { ...m, name } : m
              )
            }
          : p
      )
    );
  };

  const updateMarketBudget = (platformIndex: number, marketId: string, percentage: number) => {
    setPlatforms(
      platforms.map((p, i) => 
        i === platformIndex 
          ? { 
              ...p, 
              markets: p.markets.map(m => 
                m.id === marketId 
                  ? { ...m, budgetPercentage: Math.max(0, Math.min(100, percentage)) }
                  : m
              )
            }
          : p
      )
    );
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

  const getAvailablePlatforms = (currentPlatformId: string) => {
    return AVAILABLE_PLATFORMS.filter(
      ap => !usedPlatformIds.includes(ap.id) || ap.id === currentPlatformId
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Platform & Market Selection</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={syncMetaResources}
              disabled={isSyncing}
              className="gap-1"
            >
              {isSyncing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {isSyncing ? "Syncing..." : "Refresh Meta Data"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                >
                  <Copy className="h-3 w-3" />
                  Load Test Presets
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 bg-background">
                <DropdownMenuItem onClick={loadTestPresets}>
                  Multi-Platform Test
                </DropdownMenuItem>
                <DropdownMenuItem onClick={loadRFPreset}>
                  Meta R&F Italy
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPlatform}
              className="gap-1"
              disabled={platforms.length >= AVAILABLE_PLATFORMS.length}
            >
              <Plus className="h-3 w-3" />
              Add Platform
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {platforms.map((platform, platformIndex) => {
            const availablePlatforms = getAvailablePlatforms(platform.id);
            
            return (
              <div key={platformIndex} className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between gap-3">
                  <Select
                    value={platform.id}
                    onValueChange={(value) => updatePlatformSelection(platformIndex, value)}
                  >
                    <SelectTrigger className="w-[200px]">
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
                  
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {platform.budgetPercentage.toFixed(1)}% (${((totalBudget * platform.budgetPercentage) / 100).toLocaleString()})
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => duplicatePlatform(platformIndex)}
                      className="h-7 w-7 p-0"
                      disabled={platforms.length >= AVAILABLE_PLATFORMS.length}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePlatform(platformIndex)}
                      className="h-7 w-7 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {platform.id && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Platform Budget Allocation</Label>
                      <Slider
                        value={[platform.budgetPercentage]}
                        onValueChange={([value]) => updatePlatformBudget(platformIndex, value)}
                        min={0}
                        max={100}
                        step={0.5}
                        className="w-full"
                      />
                      <Input
                        type="number"
                        value={platform.budgetPercentage.toFixed(1)}
                        onChange={(e) => updatePlatformBudget(platformIndex, parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                        min="0"
                        max="100"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Markets</Label>
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

                      {platform.markets.map((market) => {
                        const marketBudget = (totalBudget * platform.budgetPercentage * market.budgetPercentage) / 10000;

                        return (
                          <div key={market.id} className="p-3 bg-muted/50 rounded-md space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <Select
                                value={market.name}
                                onValueChange={(value) => updateMarketName(platformIndex, market.id, value)}
                              >
                                <SelectTrigger className="h-7 text-sm flex-1">
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
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => duplicateMarket(platformIndex, market.id)}
                                  className="h-7 w-7 p-0"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeMarket(platformIndex, market.id)}
                                  className="h-7 w-7 p-0"
                                  disabled={platform.markets.length === 1}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

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
                                                 phases: [],
                                                 adFormats: [],
                                                 countries: [marketCode],
                                                 ageMin: 18,
                                                 ageMax: 65,
                                                 gender: "all",
                                                 languages: [],
                                                 publisherPlatforms: ["facebook"],
                                                 positions: {},
                                                 detailedTargeting: [],
                                                 isCBOEnabled: false,
                                                 isLifetimeBudget: false,
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
                                </div>

                                    <div className="space-y-1">
                                      <Label className="text-xs">
                                        Pixel
                                      </Label>
                                  <Select
                                    value={market.pixel || ""}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'pixel', value)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingPixels ? "Loading..." : "Select Pixel"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
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
                                    value={market.page || market.pageId || ""}
                                    onValueChange={(value) => {
                                      const page = pages.find(p => p.id === value);
                                      updateMarketField(platformIndex, market.id, 'pageId', value);
                                      updateMarketField(platformIndex, market.id, 'page', value);
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingPages ? "Loading..." : "Select Facebook Page"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
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
                                    value={market.instagramActorId || ""}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'instagramActorId', value)}
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
                                            @{account.username} - {account.name}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs">Catalog</Label>
                                  <Select
                                    value={market.catalog || ""}
                                    onValueChange={(value) => {
                                      updateMarketField(platformIndex, market.id, 'catalog', value);
                                      // Reset product set when catalog changes
                                      updateMarketField(platformIndex, market.id, 'productSet', "");
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingCatalogs ? "Loading..." : "Select Catalog"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
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
                                    value={market.productSet || ""}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'productSet', value)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Select Product Set" />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
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
                                      value={market.conversionEvent || ""}
                                      onValueChange={(value) => updateMarketField(platformIndex, market.id, 'conversionEvent', value)}
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue placeholder={loadingConversionEvents ? "Loading..." : "Select Event"} />
                                      </SelectTrigger>
                                      <SelectContent className="z-50 bg-background">
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
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs">TikTok Pixel</Label>
                                  <Select
                                    value={market.tiktokPixel || ""}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'tiktokPixel', value)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingTiktokPixels ? "Loading..." : "Select Pixel"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
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
                                    value={market.tiktokIdentity || ""}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'tiktokIdentity', value)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingTiktokIdentities ? "Loading..." : "Select TikTok Account"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
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
                                    value={market.tiktokCatalog || ""}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'tiktokCatalog', value)}
                                  >
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder={loadingTiktokCatalogs ? "Loading..." : "Select Catalog"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-50 bg-background">
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
                                      value={market.tiktokProductSet || ""}
                                      onValueChange={(value) => updateMarketField(platformIndex, market.id, 'tiktokProductSet', value)}
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue placeholder={loadingTiktokProductSets ? "Loading..." : "Select Product Set"} />
                                      </SelectTrigger>
                                      <SelectContent className="z-50 bg-background">
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
                                      <SelectItem value="ON_WEB_ORDER">Web Order (Purchase)</SelectItem>
                                      <SelectItem value="ON_WEB_ADD_TO_CART">Add to Cart</SelectItem>
                                      <SelectItem value="PAGE_VIEW">Page View</SelectItem>
                                      <SelectItem value="ON_WEB_CART_PAGE_BROWSE">Cart Page Browse</SelectItem>
                                      <SelectItem value="ON_WEB_DETAIL_PAGE_BROWSE">Detail Page Browse</SelectItem>
                                      <SelectItem value="COMPLETE_PAYMENT">Complete Payment</SelectItem>
                                      <SelectItem value="FORM_SUBMIT">Form Submit</SelectItem>
                                      <SelectItem value="DOWNLOAD">Download</SelectItem>
                                      <SelectItem value="REGISTRATION">Registration</SelectItem>
                                      <SelectItem value="SUBSCRIBE">Subscribe</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* Landing Page URL - Only show for optimization events that require it */}
                                {market.tiktokOptimizationEvent && [
                                  'ON_WEB_ORDER', 'ON_WEB_ADD_TO_CART', 'PAGE_VIEW', 
                                  'ON_WEB_CART_PAGE_BROWSE', 'ON_WEB_DETAIL_PAGE_BROWSE',
                                  'COMPLETE_PAYMENT', 'FORM_SUBMIT', 'DOWNLOAD', 
                                  'REGISTRATION', 'SUBSCRIBE'
                                ].includes(market.tiktokOptimizationEvent) && (
                                  <div className="space-y-1">
                                    <Label className="text-xs">Landing Page URL</Label>
                                    <Input
                                      type="url"
                                      placeholder="https://example.com"
                                      value={market.tiktokLandingPageUrl || ""}
                                      onChange={(e) => updateMarketField(platformIndex, market.id, 'tiktokLandingPageUrl', e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                   </div>
                                 )}
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
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Market Budget</span>
                                <Badge variant="outline" className="text-xs">
                                  {market.budgetPercentage.toFixed(1)}% (${marketBudget.toLocaleString()})
                                </Badge>
                              </div>
                              <Slider
                                value={[market.budgetPercentage]}
                                onValueCommit={([value]) => handleBudgetSliderChange(platformIndex, market.id, value)}
                                onValueChange={([value]) => updateMarketBudget(platformIndex, market.id, value)}
                                min={0}
                                max={100}
                                step={0.5}
                                className="w-full"
                              />
                            </div>

                            {/* Phase Scheduler - Per Market */}
                            {startDate && endDate && (
                              <div className="mt-4 pt-4 border-t">
                                <PhaseScheduler
                                  phases={market.phases || []}
                                  onPhasesChange={(phases) => updateMarketField(platformIndex, market.id, 'phases', phases)}
                                  startDate={startDate}
                                  endDate={endDate}
                                  platformName={platform.name}
                                  platformId={platform.id}
                                  adAccountId={market.adAccountId}
                                  marketBudget={marketBudget}
                                />
                              </div>
                            )}
                          </div>
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
              </div>
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
  );
}
