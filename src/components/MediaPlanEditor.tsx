import { useState, useEffect } from "react";
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
import { CampaignForecast } from "./CampaignForecast";
import { PhaseScheduler } from "./PhaseScheduler";
import { getDefaultPhases, generateAutoDetectPhases } from "@/utils/funnelPhases";
import { Calendar, Download, Rocket, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PlatformWithMarkets, FunnelStage } from "@/types/mediaplan";
import { Platform, PlatformConfiguration } from "./PlatformConfiguration";
import { determineStrategyFocus } from "@/utils/strategyFocusMapping";
import { Badge } from "@/components/ui/badge";


export function MediaPlanEditor() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [campaignName, setCampaignName] = useState<string>("Q1 2025 Campaign");
  const [totalBudget, setTotalBudget] = useState<string>("100000");
  
  // Initialize dates: start = today+1, end = today+1 month
  const getDefaultDates = () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() + 1);
    const end = new Date(today);
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() + 1);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd")
    };
  };
  
  const defaultDates = getDefaultDates();
  const [startDate, setStartDate] = useState<string>(defaultDates.start);
  const [endDate, setEndDate] = useState<string>(defaultDates.end);
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
  
  // Hydrate editor from a saved campaign record
  const hydrateFromCampaign = (c: any) => {
    try {
      setCampaignName(c.name || "");
      setTotalBudget(String(c.total_budget ?? ""));
      setStartDate(c.start_date || defaultDates.start);
      setEndDate(c.end_date || defaultDates.end);
      
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
      if (!user) return;
      let cid = new URLSearchParams(window.location.search).get('campaignId') || localStorage.getItem('draftCampaignId') || '';
      if (!cid) {
        const { data } = await supabase
          .from('campaigns')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'draft')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) cid = (data as any).id;
      }
      if (cid) {
        const { data: c, error } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', cid)
          .single();
        if (!error && c) {
          setSavedCampaignId((c as any).id);
          localStorage.setItem('draftCampaignId', (c as any).id);
          hydrateFromCampaign(c);
        } else {
          setIsHydrated(true);
        }
      } else {
        setIsHydrated(true);
      }
    };
    restore();
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

  // Auto-update strategy focus based on pixel/catalog in markets
  useEffect(() => {
    const hasPixel = platformsWithMarkets.some(p => p.markets.some(m => m.pixel));
    const hasCatalog = platformsWithMarkets.some(p => p.markets.some(m => m.catalog));
    
    if (hasPixel || hasCatalog) {
      const determinedFocus = determineStrategyFocus({
        adFormats: genericConfig.targeting?.adFormats || [],
        hasPixel,
        hasCatalog,
      });
      
      if (determinedFocus && determinedFocus !== genericConfig.strategyFocus) {
        setGenericConfig(prev => ({ ...prev, strategyFocus: determinedFocus }));
      }
    }
  }, [platformsWithMarkets]);

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
              conversionEvent: m.conversionEvent,
              adFormats: m.adFormats,
              phases: m.phases,
              isCBOEnabled: m.isCBOEnabled,
              isLifetimeBudget: m.isLifetimeBudget,
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
  }, [campaignName, totalBudget, startDate, endDate, platformsWithMarkets, genericConfig, savedCampaignId, user]);

  const isActivationDetailsComplete = () => {
    const allPlatformsSelected = platformsWithMarkets.every(p => p.id !== "");
    const allHaveMarkets = platformsWithMarkets.every(p => p.markets.length > 0);
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
            conversionEvent: m.conversionEvent,
            adFormats: m.adFormats,
            phases: m.phases,
            isCBOEnabled: m.isCBOEnabled,
            isLifetimeBudget: m.isLifetimeBudget,
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

  const saveCampaignDraft = async () => {
    if (!campaignName.trim()) {
      toast.error("Please enter a campaign name");
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
            conversionEvent: m.conversionEvent,
            adFormats: m.adFormats,
            phases: m.phases,
            isCBOEnabled: m.isCBOEnabled,
            isLifetimeBudget: m.isLifetimeBudget,
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
                Next: Strategy Configuration
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

      {/* Step 2: Targeting */}
      {currentStep >= 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Step 2: Targeting</CardTitle>
                <CardDescription>Define your audience targeting parameters</CardDescription>
              </div>
              {currentStep > 2 && (
                <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)}>
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          {currentStep === 2 ? (
            <CardContent className="space-y-6">
              <TargetingConfigComponent
                targeting={genericConfig.targeting || {}}
                onUpdate={(targeting) => {
                  setGenericConfig({
                    ...genericConfig,
                    targeting,
                  });
                }}
                platformName={platformsWithMarkets[0]?.name || "Facebook (Meta)"}
                showAdFormats={true}
              />

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  Back
                </Button>
                <Button 
                  onClick={() => setCurrentStep(3)}
                  disabled={!genericConfig.targeting?.adFormats || genericConfig.targeting.adFormats.length === 0}
                >
                  Next
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
                <div className="flex justify-between">
                  <span>Focus:</span>
                  <span className="font-medium text-foreground capitalize">{genericConfig.strategyFocus?.replace('-', ' ')}</span>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Step 3: Targeting */}
      {currentStep === 3 && (
        <GenericStrategyConfig
          config={genericConfig}
          setConfig={setGenericConfig}
          startDate={startDate}
          endDate={endDate}
          showOnlyTargeting
          hasPixel={platformsWithMarkets.some(p => p.markets.some(m => !!m.pixel || !!m.conversionEvent))}
          hasCatalog={platformsWithMarkets.some(p => p.markets.some(m => !!m.catalog || !!m.productSet))}
          onNext={() => {
            // Generate phases per platform/market based on strategy type
            if (genericConfig.strategy === "auto-detect") {
              // Auto-detect: Generate phases based on market-specific configuration
              const updatedPlatforms = platformsWithMarkets.map(platform => ({
                ...platform,
                markets: platform.markets.map(market => {
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
              // Full-funnel: Apply the global funnel phases to all markets
              const phases = getDefaultPhases(genericConfig.strategyFocus, startDate, endDate);
              const updatedPlatforms = platformsWithMarkets.map(platform => ({
                ...platform,
                markets: platform.markets.map(market => ({
                  ...market,
                phases: phases.map(p => ({
                  ...p,
                  id: `phase-${market.id}-${p.id}`,
                }))
                }))
              }));
              setPlatformsWithMarkets(updatedPlatforms);
            } else if (genericConfig.strategy === "manual") {
              // Manual: Create empty phase structure for user to fill
              const updatedPlatforms = platformsWithMarkets.map(platform => ({
                ...platform,
                markets: platform.markets.map(market => ({
                  ...market,
                  phases: [{
                    id: `phase-${market.id}-${Date.now()}`,
                    name: "Campaign 1",
                    startDate: startDate,
                    endDate: endDate,
                    budgetPercentage: 100,
                  }]
                }))
              }));
              setPlatformsWithMarkets(updatedPlatforms);
            }
            // Skip step 4 (Platform Customization) - now handled in step 2
            saveCampaignDraft().then(() => setCurrentStep(5));
          }}
          onBack={() => setCurrentStep(2)}
          isTargetingComplete={isTargetingComplete()}
          platformName={(platformsWithMarkets.find(p => p.id !== "")?.name) || platformsWithMarkets[0]?.name || "Facebook (Meta)"}
        />
      )}

      {/* Step 4: Platform Customization - REMOVED, now integrated in Step 2 */}

      {/* Step 5: Campaign Forecast */}
      {currentStep >= 5 && currentStep === 5 && (
        <CampaignForecast
          platforms={platformsWithMarkets}
          totalBudget={parseFloat(totalBudget) || 0}
          genericConfig={genericConfig}
          startDate={startDate}
          endDate={endDate}
          campaignId={savedCampaignId || undefined}
          onBack={() => setCurrentStep(3)}
          onFinalize={handleLaunch}
        />
      )}
    </div>
  );
}
