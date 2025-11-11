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
import { getTestPresets, getRFTestPreset } from "@/utils/testPresets";
import { supabase } from "@/integrations/supabase/client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";

interface PlatformMarketBudgetSelectorProps {
  platforms: PlatformWithMarkets[];
  setPlatforms: (platforms: PlatformWithMarkets[]) => void;
  totalBudget: number;
  setStartDate?: (date: string) => void;
  setEndDate?: (date: string) => void;
  setTotalBudget?: (budget: string) => void;
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
  setStartDate,
  setEndDate,
  setTotalBudget
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
  const [conversionEvents, setConversionEvents] = useState<Array<{ pixelId: string; id: string; name: string; type: string }>>([]);
  const [loadingConversionEvents, setLoadingConversionEvents] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const totalAllocated = platforms.reduce((sum, p) => sum + p.budgetPercentage, 0);
  const usedPlatformIds = platforms.map(p => p.id).filter(id => id !== "");

  // Fetch all Meta resources from database
  const fetchMetaResources = async () => {
    setIsLoadingAccounts(true);
    setLoadingAdAccounts(true);
    setLoadingPages(true);
    setLoadingPixels(true);
    setLoadingCatalogs(true);
    setLoadingConversionEvents(true);
    
    try {
      // Fetch ad accounts from database
      const { data: adAccountsData, error: adAccountsError } = await supabase
        .from("meta_ad_accounts")
        .select("*")
        .order("synced_at", { ascending: false });

      if (!adAccountsError && adAccountsData) {
        setAdAccounts(adAccountsData.map(acc => ({
          id: acc.account_id,
          name: acc.account_name,
        })));
      }

      // Fetch pages from database
      const { data: pagesData, error: pagesError } = await supabase
        .from("meta_pages")
        .select("*")
        .order("synced_at", { ascending: false });

      if (!pagesError && pagesData) {
        setPages(pagesData.map(page => ({
          id: page.page_id,
          name: page.page_name,
        })));
      }

      // Fetch pixels from database
      const { data: pixelsData, error: pixelsError } = await supabase
        .from("meta_pixels")
        .select("*")
        .order("synced_at", { ascending: false });

      if (!pixelsError && pixelsData) {
        setPixels(pixelsData.map(pixel => ({
          id: pixel.pixel_id,
          name: pixel.pixel_name,
          adAccountId: pixel.ad_account_id,
        })));
      }

      // Fetch catalogs from database
      const { data: catalogsData, error: catalogsError } = await supabase
        .from("meta_catalogs")
        .select("*")
        .order("synced_at", { ascending: false });

      if (!catalogsError && catalogsData) {
        setCatalogs(catalogsData.map(catalog => ({
          id: catalog.catalog_id,
          name: catalog.catalog_name,
        })));
      }

      // Fetch conversion events from database
      const { data: eventsData, error: eventsError } = await supabase
        .from("meta_conversion_events")
        .select("*")
        .order("synced_at", { ascending: false });

      if (!eventsError && eventsData) {
        setConversionEvents(eventsData.map(event => ({
          pixelId: event.pixel_id,
          id: event.event_name,
          name: event.event_name,
          type: event.event_type || "standard",
        })));
      }

      // Fetch Instagram accounts from database
      const { data: igData, error: igError } = await supabase
        .from("meta_instagram_accounts")
        .select("*")
        .order("synced_at", { ascending: false });

      if (!igError && igData) {
        setInstagramAccounts(igData.map(ig => ({
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
      setLoadingConversionEvents(false);
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
    } catch (error: any) {
      console.error("Failed to sync Meta resources:", error);
      toast.error("Failed to sync Meta resources");
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch connected platforms and Meta resources on mount
  useEffect(() => {
    const fetchConnectedData = async () => {
      try {
        // Fetch connected platforms
        const { data: platformsData, error: platformsError } = await supabase
          .from("connected_platforms")
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
  const needsConversionEvent = (market: any, platformName: string) => {
    if (!platformName.toLowerCase().includes("meta")) return false;
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
          const usedMarketNames = p.markets.map(m => m.name.toLowerCase());
          let marketNum = p.markets.length + 1;
          let marketName = `Market ${marketNum}`;
          
          while (usedMarketNames.includes(marketName.toLowerCase())) {
            marketNum++;
            marketName = `Market ${marketNum}`;
          }
          
          // Apply default targeting values for R&F compatibility
          const newMarket: Market = {
            id: `market-${Date.now()}`,
            name: marketName,
            budgetPercentage: 0,
            phases: [],
            // Default targeting for Meta R&F
            countries: ["US"],
            ageMin: 18,
            ageMax: 65,
            gender: "all",
            languages: [],
            publisherPlatforms: ["facebook"],
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

  const updateMarketField = (platformIndex: number, marketId: string, field: keyof Market, value: any) => {
    setPlatforms(
      platforms.map((p, i) => 
        i === platformIndex 
          ? { 
              ...p, 
              markets: p.markets.map(m => 
                m.id === marketId ? { ...m, [field]: value } : m
              )
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
                              <Input
                                value={market.name}
                                onChange={(e) => updateMarketName(platformIndex, market.id, e.target.value)}
                                className="h-7 text-sm flex-1"
                                placeholder="Market name"
                              />
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
                                    Ad Account {needsConversionEvent(market, platform.name) && <span className="text-destructive">*</span>}
                                  </Label>
                                  <Select
                                    value={market.adAccountId || ""}
                                    onValueChange={(value) => {
                                      const account = adAccounts.find(a => a.id === value);
                                      updateMarketField(platformIndex, market.id, 'adAccountId', value);
                                      updateMarketField(platformIndex, market.id, 'accountName', account?.name || "");
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
                                          No ad accounts found. Connect your Meta account first.
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
                                  <Label className="text-xs">Facebook Page</Label>
                                  <Select
                                    value={market.pageId || ""}
                                    onValueChange={(value) => {
                                      const page = pages.find(p => p.id === value);
                                      updateMarketField(platformIndex, market.id, 'pageId', value);
                                      updateMarketField(platformIndex, market.id, 'page', page?.name || "");
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
                                          No pages found. Make sure you have admin access to Facebook pages.
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
                                  <Label className="text-xs">
                                    Pixel {needsConversionEvent(market, platform.name) && <span className="text-destructive">*</span>}
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

                                {needsConversionEvent(market, platform.name) && market.pixel && (
                                  <div className="space-y-1">
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
                                  <Label className="text-xs">Catalog</Label>
                                  <Select
                                    value={market.catalog || ""}
                                    onValueChange={(value) => updateMarketField(platformIndex, market.id, 'catalog', value)}
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
                              </div>
                            )}

                            {/* Ad Formats */}
                            <AdFormatSelector
                              platformName={platform.name}
                              selectedFormats={market.adFormats || []}
                              onFormatsChange={(formats) => updateMarketField(platformIndex, market.id, 'adFormats', formats)}
                            />

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
                                onValueChange={([value]) => updateMarketBudget(platformIndex, market.id, value)}
                                min={0}
                                max={100}
                                step={0.5}
                                className="w-full"
                              />
                            </div>
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
