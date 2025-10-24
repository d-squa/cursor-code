import { useState } from "react";
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
import { getDefaultPhases } from "@/utils/funnelPhases";
import { Calendar, Download, Rocket, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PlatformWithMarkets, FunnelStage } from "@/types/mediaplan";
import { Platform, PlatformConfiguration } from "./PlatformConfiguration";


export function MediaPlanEditor() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [campaignName, setCampaignName] = useState<string>("");
  const [totalBudget, setTotalBudget] = useState<string>("10000");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [genericConfig, setGenericConfig] = useState<GenericConfig>({});
  const [platformsWithMarkets, setPlatformsWithMarkets] = useState<PlatformWithMarkets[]>([
    { id: "", name: "", enabled: true, budgetPercentage: 0, markets: [{ id: "market-1", name: "Market 1", budgetPercentage: 100, phases: [] }] },
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
      const selectedPlatforms = platformsWithMarkets.filter(p => p.id !== "");
      const budgetAllocation = selectedPlatforms
        .reduce((acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }), {});

      const { error } = await supabase.from("campaigns").insert({
        user_id: user?.id,
        name: campaignName,
        objective: genericConfig.strategyFocus || "conversions",
        total_budget: parseFloat(totalBudget) || 0,
        start_date: startDate || null,
        end_date: endDate || null,
        platforms: selectedPlatforms.map(p => ({ id: p.id, name: p.name })),
        budget_allocation: budgetAllocation,
        status: "active",
      });

      if (error) throw error;
      
      toast.success("Campaign launched successfully!");
      setCampaignName("");
    } catch (error: any) {
      toast.error(error.message || "Failed to launch campaign");
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
                      <SelectItem value="full-funnel">Full-Funnel</SelectItem>
                      <SelectItem value="partial">Partial Strategy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Strategy Focus</Label>
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
                </div>
              </div>

              <GlobalFunnelPhasing
                startDate={startDate}
                endDate={endDate}
                globalFunnel={globalFunnel}
                onGlobalFunnelChange={setGlobalFunnel}
                onSaveGlobal={() => {
                  // Apply global funnel to all platforms and markets
                  setPlatformsWithMarkets(
                    platformsWithMarkets.map(p => ({
                      ...p,
                      markets: p.markets.map(m => {
                        const phases = globalFunnel.map(stage => ({
                          id: `phase-${stage.id}-${Date.now()}-${Math.random()}`,
                          name: stage.name,
                          startDate: stage.startDate,
                          endDate: stage.endDate,
                          budgetPercentage: stage.budgetPercentage,
                          campaigns: []
                        }));
                        return { ...m, phases, useGlobalFunnel: true };
                      })
                    }))
                  );
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
          onNext={() => setCurrentStep(4)}
          onBack={() => setCurrentStep(2)}
          isTargetingComplete={isTargetingComplete()}
        />
      )}

      {/* Step 4: Platform Selection & Configuration */}
      {currentStep >= 4 && isGenericConfigComplete() && (
        <>
          <PlatformSelector platforms={platforms} setPlatforms={handlePlatformToggle} />

          {platforms.some(p => p.enabled) && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
              <div className="space-y-6">
                <PlatformConfiguration 
                  platforms={platforms} 
                  setPlatforms={setPlatforms} 
                  startDate={startDate}
                  endDate={endDate}
                />

                {isAllPlatformsConfigured() && (
                  <CampaignMetrics platforms={platforms} totalBudget={parseFloat(totalBudget) || 0} />
                )}

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row gap-4 justify-end">
                      <Button variant="outline" onClick={handleExport} className="gap-2">
                        <Download className="h-4 w-4" />
                        Export Media Plan
                      </Button>
                      <Button variant="gradient" onClick={handleLaunch} className="gap-2" disabled={saving}>
                        {saving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Launching...
                          </>
                        ) : (
                          <>
                            <Rocket className="h-4 w-4" />
                            Launch Campaign
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="lg:block hidden">
                <BudgetSummary 
                  platforms={platforms} 
                  setPlatforms={setPlatforms} 
                  totalBudget={parseFloat(totalBudget) || 0}
                  startDate={startDate}
                  endDate={endDate}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
