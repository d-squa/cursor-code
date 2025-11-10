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
import { PlatformCustomization } from "./PlatformCustomization";
import { CampaignForecast } from "./CampaignForecast";
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
  const [genericConfig, setGenericConfig] = useState<GenericConfig>({
    strategy: "auto-detect",
    strategyFocus: "auto",
    targeting: {
      adFormats: [],
      ageMin: 25,
      ageMax: 45,
      genders: ["all"],
      devices: ["mobile"],
      targetingExpansion: true,
      os: ["iOS", "Android"],
      language: "en",
      interests: "Technology, Shopping, Fashion",
      websiteAudience: "Website Visitors - Last 30 Days",
      keywordList: "buy online\npurchase products\nshop now\nbest deals",
      customerList: "Existing Customers 2023",
      lookalikeAudience: "Lookalike - Top Purchasers (1%)"
    }
  });
  const [platformsWithMarkets, setPlatformsWithMarkets] = useState<PlatformWithMarkets[]>([
    { 
      id: "facebook", 
      name: "Facebook (Meta)", 
      enabled: true, 
      budgetPercentage: 60, 
      markets: [
        { 
          id: "market-1", 
          name: "United States", 
          budgetPercentage: 60,
          accountName: "Main Ad Account",
          page: "Company Page",
          pixel: "Main Pixel",
          catalog: "Product Catalog 2024",
          adFormats: ["Image ads", "Video ads", "Carousel ads"],
          phases: [] 
        },
        { 
          id: "market-2", 
          name: "United Kingdom", 
          budgetPercentage: 40,
          accountName: "EMEA Ad Account",
          page: "Company Page UK",
          pixel: "UK Pixel",
          catalog: "Product Catalog UK",
          adFormats: ["Image ads", "Stories ads"],
          phases: [] 
        }
      ] 
    },
    { 
      id: "google", 
      name: "Google Ads", 
      enabled: true, 
      budgetPercentage: 40, 
      markets: [
        { 
          id: "market-3", 
          name: "United States", 
          budgetPercentage: 100,
          accountName: "Google Main Account",
          adFormats: ["Skippable In-Stream ads", "In-Feed video ads"],
          phases: [] 
        }
      ] 
    },
  ]);
  const [globalFunnel, setGlobalFunnel] = useState<FunnelStage[]>([]);
  
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
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("User not authenticated");

      // Get user's first team
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("team_id")
        .eq("user_id", user.id)
        .limit(1);

      const teamId = userRoles?.[0]?.team_id;

      const selectedPlatforms = platformsWithMarkets.filter(p => p.id !== "");
      const budgetAllocation = selectedPlatforms
        .reduce((acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }), {});

      const { data: campaign, error } = await supabase.from("campaigns").insert({
        user_id: user.id,
        team_id: teamId,
        name: campaignName,
        objective: genericConfig.strategyFocus || "conversions",
        total_budget: parseFloat(totalBudget) || 0,
        start_date: startDate || null,
        end_date: endDate || null,
        platforms: selectedPlatforms.map(p => ({ id: p.id, name: p.name })),
        budget_allocation: budgetAllocation,
        status: "draft",
      }).select().single();

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
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g., Q1 2024 Brand Activation"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget">Total Activation Budget ($)</Label>
              <Input
                id="budget"
                type="number"
                value={totalBudget}
                onChange={(e) => setTotalBudget(e.target.value)}
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
                  onChange={(e) => setStartDate(e.target.value)}
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
                  onChange={(e) => setEndDate(e.target.value)}
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
                onClick={() => setCurrentStep(2)} 
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

      {/* Step 2: Strategy Configuration */}
      {currentStep >= 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Step 2: Strategy Configuration</CardTitle>
                <CardDescription>Define your campaign strategy, phases, and campaigns</CardDescription>
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
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Strategy Type</Label>
                  <Select
                    value={genericConfig.strategy || ""}
                    onValueChange={(value) => setGenericConfig({ ...genericConfig, strategy: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto-detect">Auto-Detect (Based on selections)</SelectItem>
                      <SelectItem value="full-funnel">Pre-Defined Full-Funnel</SelectItem>
                      <SelectItem value="manual">Manual Strategy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {genericConfig.strategy !== "manual" && (
                  <div className="space-y-2">
                    <Label>Strategy Focus</Label>
                    {genericConfig.strategy === "auto-detect" ? (
                      <Input
                        value="Auto"
                        disabled
                        className="bg-muted"
                      />
                    ) : (
                      <Select
                        value={genericConfig.strategyFocus || ""}
                        onValueChange={(value) => {
                          setGenericConfig({ ...genericConfig, strategyFocus: value as any });
                          // Auto-generate global funnel phases based on strategy focus
                          if (startDate && endDate) {
                            const phases = getDefaultPhases(value, startDate, endDate);
                            setGlobalFunnel(phases);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select focus" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Awareness">Awareness</SelectItem>
                          <SelectItem value="Market Presence">Market Presence</SelectItem>
                          <SelectItem value="In-App Actions">In-App Actions</SelectItem>
                          <SelectItem value="Purchases">Purchases</SelectItem>
                          <SelectItem value="Actions">Actions</SelectItem>
                          <SelectItem value="Conversions">Conversions</SelectItem>
                          <SelectItem value="Leads">Leads</SelectItem>
                          <SelectItem value="Revenue">Revenue</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {(platformsWithMarkets.some(p => p.markets.some(m => m.pixel || m.catalog))) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        💡 Auto-detected based on pixel/catalog configuration
                      </p>
                    )}
                  </div>
                )}
              </div>

{genericConfig.strategy === "auto-detect" ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Auto-detect previews per platform/market based on selected ad formats, pixel and catalog.
                  </p>
                  <div className="space-y-3">
                    {platformsWithMarkets.map((p) => (
                      <div key={p.id} className="border rounded-lg p-3">
                        <h4 className="font-medium text-sm">{p.name}</h4>
                        <div className="mt-2 space-y-2">
                          {p.markets.map((m) => {
                            const adFormats = m.adFormats || genericConfig.targeting?.adFormats || [];
                            const hasPixel = !!m.pixel;
                            const hasCatalog = !!m.catalog;
                            const focus = (determineStrategyFocus({ adFormats, hasPixel, hasCatalog }) || "conversions").replace("-", " ").toUpperCase();
                            const phasesPreview = (startDate && endDate)
                              ? generateAutoDetectPhases(adFormats, hasPixel, hasCatalog, startDate, endDate)
                              : [];
                            return (
                              <div key={m.id} className="text-xs bg-muted/30 rounded p-2">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">{m.name}</span>
                                  <Badge variant="outline" className="text-[10px]">{focus}</Badge>
                                </div>
                                <div className="text-muted-foreground mt-1">
                                  Formats: {adFormats.length ? adFormats.join(", ") : "—"} • Pixel: {hasPixel ? "Yes" : "No"} • Catalog: {hasCatalog ? "Yes" : "No"}
                                </div>
                                {phasesPreview && phasesPreview.length > 0 && (
                                  <div className="mt-1 text-muted-foreground">
                                    Preview phases: {phasesPreview.map((ph) => ph.name).join(" → ")}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={() => {
                        const updatedPlatforms = platformsWithMarkets.map((platform) => ({
                          ...platform,
                          markets: platform.markets.map((market) => {
                            const adFormats = market.adFormats || genericConfig.targeting?.adFormats || [];
                            const hasPixel = !!market.pixel;
                            const hasCatalog = !!market.catalog;
                            const detectedFocus = determineStrategyFocus({ adFormats, hasPixel, hasCatalog });
                            const phases = generateAutoDetectPhases(adFormats, hasPixel, hasCatalog, startDate, endDate);
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
                        toast.success("Auto-detected phases applied to all markets");
                      }}
                    >
                      Apply Auto-Detected Phases
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <GlobalFunnelPhasing
                    startDate={startDate}
                    endDate={endDate}
                    globalFunnel={globalFunnel}
                    onGlobalFunnelChange={(newFunnel) => {
                      // Update global funnel and immediately propagate to all markets
                      setGlobalFunnel(newFunnel);
                      setPlatformsWithMarkets(
                        platformsWithMarkets.map(p => ({
                          ...p,
                          markets: p.markets.map(m => ({
                            ...m,
                            strategyFocus: genericConfig.strategyFocus, // Propagate strategy focus
                            phases: newFunnel.map(stage => ({
                              id: `phase-${m.id}-${stage.id}`,
                              name: stage.name,
                              startDate: stage.startDate,
                              endDate: stage.endDate,
                              budgetPercentage: stage.budgetPercentage,
                            })),
                            useGlobalFunnel: true,
                          }))
                        }))
                      );
                    }}
                    onSaveGlobal={() => {
                      toast.success("Global funnel phasing applied to all platforms and markets");
                    }}
                  />

                  <HierarchicalTimelineScheduler
                    platforms={platformsWithMarkets}
                    setPlatforms={setPlatformsWithMarkets}
                    startDate={startDate}
                    endDate={endDate}
                    globalFunnel={globalFunnel}
                  />
                </>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  Back
                </Button>
                <Button 
                  onClick={() => setCurrentStep(3)} 
                  disabled={!isStrategyComplete()}
                >
                  Next: Targeting
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
            setCurrentStep(4);
          }}
          onBack={() => setCurrentStep(2)}
          isTargetingComplete={isTargetingComplete()}
          platformName={(platformsWithMarkets.find(p => p.id !== "")?.name) || platformsWithMarkets[0]?.name || "Facebook (Meta)"}
          hasPixel={platformsWithMarkets.some(p => p.markets.some(m => m.pixel))}
          hasCatalog={platformsWithMarkets.some(p => p.markets.some(m => m.catalog))}
        />
      )}

      {/* Step 4: Platform Customization */}
      {currentStep >= 4 && currentStep === 4 && (
        <PlatformCustomization
          platforms={platformsWithMarkets}
          genericConfig={genericConfig}
          onPlatformsUpdate={setPlatformsWithMarkets}
          onNext={() => setCurrentStep(5)}
          onBack={() => setCurrentStep(3)}
          startDate={startDate}
          endDate={endDate}
        />
      )}

      {/* Step 5: Campaign Forecast */}
      {currentStep >= 5 && currentStep === 5 && (
        <CampaignForecast
          platforms={platformsWithMarkets}
          totalBudget={parseFloat(totalBudget) || 0}
          genericConfig={genericConfig}
          startDate={startDate}
          endDate={endDate}
          onBack={() => setCurrentStep(4)}
          onFinalize={handleLaunch}
        />
      )}
    </div>
  );
}
