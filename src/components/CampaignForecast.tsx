import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PlatformWithMarkets } from "@/types/mediaplan";
import { GenericConfig } from "./GenericStrategyConfig";
import { Loader2, TrendingUp, Users, Eye, Target, DollarSign, Download, Mail, FileSpreadsheet, FileText, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { getOptimizationGoalMetrics, getResultLabel, calculateResultFromImpressions } from "@/utils/optimizationGoals";
import { getObjectiveFromPhaseName } from "@/utils/phaseObjectiveMapping";
import { downloadMediaPlanPDF } from "@/utils/pdfGenerator";
import { downloadMediaPlanExcel } from "@/utils/excelGenerator";
import { ApprovalDialog } from "./ApprovalDialog";
import { ActiplanDeliverablesView } from "./ActiplanDeliverablesView";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface CampaignForecastProps {
  platforms: PlatformWithMarkets[];
  totalBudget: number;
  genericConfig: GenericConfig;
  startDate: string;
  endDate: string;
  campaignId?: string;
  onBack: () => void;
  onFinalize: () => void;
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
}

interface MarketForecast {
  marketName: string;
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
  marketDeliverables: Record<string, Array<{ kpi: string; result: number }>>;
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
  startDate,
  endDate,
  campaignId,
  onBack,
  onFinalize,
}: CampaignForecastProps) {
  const [loading, setLoading] = useState(false);
  const [forecasts, setForecasts] = useState<Record<string, CampaignForecast[]>>({});
  const [actiplanForecast, setActiplanForecast] = useState<ActiplanForecast | null>(null);
  const [debugInfo, setDebugInfo] = useState<{startTimeUnix: number; endTimeUnix: number; startDateFormatted: string; endDateFormatted: string} | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [pdfBase64Data, setPdfBase64Data] = useState<string>("");
  const [pushingToDSP, setPushingToDSP] = useState(false);
  const [hasExistingForecast, setHasExistingForecast] = useState(false);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({});
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({});

  // Load existing forecast on mount
  useEffect(() => {
    const loadExistingForecast = async () => {
      if (!campaignId) return;

      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('forecast_data')
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
      }
    };

    loadExistingForecast();
  }, [campaignId]);

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

  const handlePushToDSP = async () => {
    if (!campaignId) {
      toast.error("Please save the campaign first");
      return;
    }

    setPushingToDSP(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      
      const { data, error } = await supabase.functions.invoke('push-campaign-to-dsp', {
        body: { campaignId }
      });

      if (error) throw error;

      toast.success("Campaign pushed to DSP successfully!");
      console.log("DSP Push Results:", data);
    } catch (error: any) {
      console.error("Error pushing to DSP:", error);
      toast.error(error.message || "Failed to push campaign to DSP");
    } finally {
      setPushingToDSP(false);
    }
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
      forecasts: totalMetrics ? {
        totalReach: totalMetrics.reach,
        audienceSize: totalMetrics.audienceSize,
        sov: totalMetrics.sov,
        cpm: totalMetrics.cpm,
        totalImpressions: totalMetrics.impressions,
        campaigns: campaignsData,
      } : undefined,
      actiplanForecast,
    };
  };

  const handleDownloadPDF = async () => {
    const planData = getPlanData();

    try {
      const { generateMediaPlanPDF } = await import("@/utils/pdfGenerator");
      const blob = generateMediaPlanPDF(planData);
      
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
        } else {
          // Update campaign with PDF URL
          await (supabase as any).from('campaigns')
            .update({ pdf_url: fileName })
            .eq('id', campaignId);
          
          toast.success("PDF saved and attached to ActiPlan!");
        }
      }
      
      // Download PDF
      downloadMediaPlanPDF(planData);
      
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
    // Call actual platform APIs for Meta, use mock for others
    if (platformId.includes("facebook") || platformId.includes("instagram") || platformId.includes("meta")) {
        const strategyFocus = market.strategyFocus || genericConfig.strategyFocus || 'conversions';
        
        // Validate and normalize market code
        const marketCode = market.name.substring(0, 2).trim().toUpperCase();
        console.log('**Selected market', marketCode);
        if (!/^[A-Z]{2}$/.test(marketCode)) {
          toast.error(`Invalid country code: "${marketCode}". Use 2-letter ISO codes (e.g., US, CA, GB).`, {
            duration: 5000,
          });
          throw new Error(`Invalid country code: ${marketCode}`);
        }
        
        try {
          const { supabase } = await import("@/integrations/supabase/client");
        
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

        if (error) throw error;

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
        const strategyFocusValue = market.strategyFocus || genericConfig.strategyFocus || 'conversions';
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
        
        // Calculate result based on optimization goal
        const result = calculateResultFromImpressions(
          data.forecast.impressions,
          budget,
          optimizationGoal
        );
        
        // Calculate result rate
        let resultRate = 0;
        if (goalMetrics) {
          // Most result rates are: result/impressions
          resultRate = data.forecast.impressions > 0 
            ? (result / data.forecast.impressions) * 100 
            : 0;
        }
        
        // Calculate cost per result
        const costPerResult = result > 0 ? budget / result : 0;

        // Transform Meta API response to our format
        return {
          audienceSize: data.forecast?.audienceSize || data.forecast.reach * 15,
          reach: data.forecast.reach,
          impressions: data.forecast.impressions,
          cpm: data.forecast.cpm,
          result,
          resultLabel: getResultLabel(optimizationGoal),
          resultKPI: goalMetrics?.kpi || optimizationGoal,
          costPerResult: parseFloat(costPerResult.toFixed(2)),
          resultRate: parseFloat(resultRate.toFixed(2)),
          resultRateName: goalMetrics?.rateName || "Rate",
          objective,
          optimizationGoal,
          destination,
        };
      } catch (error: any) {
        console.error('Meta forecast error:', error);
        
        // Check for specific error types
        if (error?.message?.includes('INVALID_TOKEN')) {
          toast.error('Meta access token is invalid or expired. Please update it in settings.', {
            duration: 6000,
          });
        } else if (error?.message?.includes('PERMISSION_ERROR')) {
          toast.error('Meta API permission error. Please check your access token has ads_read permission.', {
            duration: 5000,
          });
        } else {
          toast.error('Meta R&F failed, trying standard reach estimates...');
        }
        
        // Attempt fallback to standard reach estimates (meta-forecast)
        try {
          const { supabase } = await import("@/integrations/supabase/client");
          const { data: fallbackData, error: fbError } = await supabase.functions.invoke('meta-forecast', {
            body: {
              markets: [marketCode],
              budget,
              strategyFocus,
              ageMin: genericConfig.targeting?.ageMin ?? market.ageMin ?? 18,
              ageMax: genericConfig.targeting?.ageMax ?? market.ageMax ?? 65,
              gender: (genericConfig.targeting?.genders?.[0]) ?? market.gender ?? 'all',
            }
          });

          if (fbError) throw fbError;

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
            const strategyFocusValue = market.strategyFocus || genericConfig.strategyFocus || 'conversions';
            const autoDetected = getObjectiveFromPhaseName(market.phaseName, strategyFocusValue);
            objective = autoDetected.objective;
            optimizationGoal = autoDetected.optimizationGoal;
            destination = autoDetected.destination;
          } else {
            // Fallback to strategy focus for market-level forecasts
            const strategyFocusValue = market.strategyFocus || genericConfig.strategyFocus || 'conversions';
            const autoDetected = getObjectiveFromPhaseName('default', strategyFocusValue);
            objective = autoDetected.objective;
            optimizationGoal = autoDetected.optimizationGoal;
            destination = autoDetected.destination;
          }
          const goalMetrics = getOptimizationGoalMetrics(objective, optimizationGoal, destination);
          
          const impressions = Number((fallbackData as any).impressions) || 0;
          const result = calculateResultFromImpressions(impressions, budget, optimizationGoal);
          const resultRate = impressions > 0 ? (result / impressions) * 100 : 0;
          const costPerResult = result > 0 ? budget / result : 0;

          return {
            audienceSize: (fallbackData as any).reach * 10,
            reach: Number((fallbackData as any).reach) || 0,
            impressions,
            cpm: Number((fallbackData as any).cpm) || 0,
            result,
            resultLabel: getResultLabel(optimizationGoal),
            resultKPI: goalMetrics?.kpi || optimizationGoal,
            costPerResult: parseFloat(costPerResult.toFixed(2)),
            resultRate: parseFloat(resultRate.toFixed(2)),
            resultRateName: goalMetrics?.rateName || "Rate",
            objective,
            optimizationGoal,
            destination,
          } as ForecastMetrics;
        } catch (fbErr) {
          console.error('Meta reachestimate fallback failed:', fbErr);
          toast.error('Meta API fallback failed, using estimates');
        }
        
        // Fall through to mock data
      }
    }

    // Mock forecast calculation for non-Meta platforms or fallback
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const baseCPM = platformId.includes("google") ? 8 :
                    platformId.includes("linkedin") ? 25 : 12;
    
    const impressions = Math.floor((budget / baseCPM) * 1000);
    const avgFrequency = 3.5;
    const reach = Math.floor(impressions / avgFrequency);
    
    // Map strategy focus to optimization goal for mock
    const strategyFocusValue = market.strategyFocus || genericConfig.strategyFocus || 'conversions';
    let optimizationGoal = "OFFSITE_CONVERSIONS";
    let objective = "OUTCOME_SALES";
    let destination = "Website";
    
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
      objective = "OUTCOME_TRAFFIC";
      optimizationGoal = "LINK_CLICKS";
      destination = "Website";
    }
    const goalMetrics = getOptimizationGoalMetrics(objective, optimizationGoal, destination);
    
    const result = calculateResultFromImpressions(impressions, budget, optimizationGoal);
    const resultRate = impressions > 0 ? (result / impressions) * 100 : 0;
    const costPerResult = result > 0 ? budget / result : 0;

    return {
      audienceSize: reach * 10,
      reach,
      impressions,
      cpm: baseCPM,
      result,
      resultLabel: getResultLabel(optimizationGoal),
      resultKPI: goalMetrics?.kpi || optimizationGoal,
      costPerResult: parseFloat(costPerResult.toFixed(2)),
      resultRate: parseFloat(resultRate.toFixed(2)),
      resultRateName: goalMetrics?.rateName || "Rate",
      objective,
      optimizationGoal,
      destination,
    };
  };

  const handleFetchForecasts = async () => {
    setLoading(true);
    setHasExistingForecast(false);
    try {
      const newForecasts: Record<string, CampaignForecast[]> = {};
      const platformForecasts: PlatformForecast[] = [];

      for (const platform of platforms) {
        const platformBudget = totalBudget * (platform.budgetPercentage / 100);
        const campaignForecasts: CampaignForecast[] = [];
        const marketForecastsArray: MarketForecast[] = [];

        for (const market of platform.markets) {
          const marketBudget = platformBudget * (market.budgetPercentage / 100);
          
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
                  const strategyFocusValue = market.strategyFocus || genericConfig.strategyFocus || 'conversions';
                  const autoDetected = getObjectiveFromPhaseName(phase.name, strategyFocusValue);
                  objective = autoDetected.objective;
                  optimizationGoal = autoDetected.optimizationGoal;
                destination = autoDetected.destination;
              }
              
              const goalMetrics = getOptimizationGoalMetrics(objective, optimizationGoal, destination);
              
              // Calculate results using optimization goal modifiers
              const result = calculateResultFromImpressions(phaseImpressions, campaignBudget, optimizationGoal);
              const resultRate = phaseImpressions > 0 ? (result / phaseImpressions) * 100 : 0;
              const costPerResult = result > 0 ? campaignBudget / result : 0;
              
              console.log(`  ✓ Phase ${phase.name} allocated:`, {
                budgetRatio: `${(budgetRatio * 100).toFixed(1)}%`,
                impressions: phaseImpressions,
                reach: phaseReach,
                result,
                resultLabel: getResultLabel(optimizationGoal)
              });

              // Store phase forecast
              phaseForecasts.push({
                phaseName: phase.name,
                budget: campaignBudget,
                startDate: phase.startDate,
                endDate: phase.endDate,
                kpi: goalMetrics?.kpi || optimizationGoal,
                optimizationGoal,
                result,
                costPerResult: parseFloat(costPerResult.toFixed(2)),
                resultRate: parseFloat(resultRate.toFixed(2)),
              });

              // Aggregate results by goal
              if (!resultsByGoal[optimizationGoal]) {
                resultsByGoal[optimizationGoal] = {
                  kpi: goalMetrics?.kpi || optimizationGoal,
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
                  resultKPI: goalMetrics?.kpi || optimizationGoal,
                  costPerResult: parseFloat(costPerResult.toFixed(2)),
                  resultRate: parseFloat(resultRate.toFixed(2)),
                  resultRateName: goalMetrics?.rateName || "Rate",
                  objective,
                  optimizationGoal,
                  destination,
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
                  kpi: goalMetrics?.kpi || forecast.resultKPI,
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
              const strategyFocusValue = market.strategyFocus || genericConfig.strategyFocus || 'conversions';
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
                  kpi: goalMetrics?.kpi || autoDetected.optimizationGoal,
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
                  resultKPI: goalMetrics?.kpi || autoDetected.optimizationGoal,
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
        const platformAvgCPM = platformTotalImp > 0 ? (platformBudget / (platformTotalImp / 1000)) : 0;
        const platformFrequency = platformTotalReach > 0 ? platformTotalImp / platformTotalReach : 0;
        const platformSOV = platformTotalAudienceSize > 0 ? (platformTotalReach / platformTotalAudienceSize) * 100 : 0;

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
          markets: marketForecastsArray,
        });

        newForecasts[platform.id] = campaignForecasts;
      }

      // Build Actiplan-level aggregation from platforms
      const actiplanTotalBudget = platformForecasts.reduce((sum, p) => sum + p.totalBudget, 0);
      const actiplanTotalAudienceSize = platformForecasts.reduce((sum, p) => sum + p.totalAudienceSize, 0);
      const actiplanTotalImpressions = platformForecasts.reduce((sum, p) => sum + p.totalImpressions, 0);
      const actiplanTotalReach = platformForecasts.reduce((sum, p) => sum + p.totalReach, 0);
      const actiplanAvgCPM = actiplanTotalImpressions > 0 ? actiplanTotalBudget / (actiplanTotalImpressions / 1000) : 0;
      const actiplanFrequency = actiplanTotalReach > 0 ? actiplanTotalImpressions / actiplanTotalReach : 0;
      const actiplanSOV = actiplanTotalAudienceSize > 0 ? (actiplanTotalReach / actiplanTotalAudienceSize) * 100 : 0;

      // Aggregate market deliverables across all platforms
      const marketDeliverables: Record<string, Array<{ kpi: string; result: number }>> = {};
      platformForecasts.forEach(platform => {
        platform.markets.forEach(market => {
          if (!marketDeliverables[market.marketName]) {
            marketDeliverables[market.marketName] = [];
          }
          market.resultsByGoal.forEach(r => {
            marketDeliverables[market.marketName].push({
              kpi: r.kpi,
              result: r.result,
            });
          });
        });
      });

      setForecasts(newForecasts);
      setActiplanForecast({
        totalBudget: actiplanTotalBudget,
        totalAudienceSize: actiplanTotalAudienceSize,
        totalImpressions: actiplanTotalImpressions,
        totalReach: actiplanTotalReach,
        avgCPM: actiplanAvgCPM,
        frequency: actiplanFrequency,
        sov: actiplanSOV,
        marketDeliverables,
        platforms: platformForecasts,
      });
      toast.success("Forecasts fetched successfully!");
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
            {!loading && Object.keys(forecasts).length === 0 && (
              <Button onClick={handleFetchForecasts}>
                <TrendingUp className="h-4 w-4 mr-2" />
                Fetch Forecasts
              </Button>
            )}
            {!loading && Object.keys(forecasts).length > 0 && (
              <Button onClick={handleFetchForecasts} variant="outline">
                <TrendingUp className="h-4 w-4 mr-2" />
                Refresh Forecast
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
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
            {/* Debug Panel - Show Unix Timestamps */}
            {debugInfo && (
              <Card className="bg-muted/50 border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Meta R&F API Timestamps (Debug)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                    <div>
                      <p className="text-muted-foreground mb-1">Start Time (Unix)</p>
                      <p className="font-semibold">{debugInfo.startTimeUnix}</p>
                      <p className="text-xs text-muted-foreground">{debugInfo.startDateFormatted}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">End Time (Unix)</p>
                      <p className="font-semibold">{debugInfo.endTimeUnix}</p>
                      <p className="text-xs text-muted-foreground">{debugInfo.endDateFormatted}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2">
                    Both timestamps are set to 7:00 AM UTC as per Meta R&F API requirements
                  </p>
                </CardContent>
              </Card>
            )}
            
            {/* Summary Cards */}
            {getTotalMetrics() && (
              <>
                <div className="grid gap-4 md:grid-cols-5">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Total Reach
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatNumber(getTotalMetrics()!.reach)}</div>
                      {getTotalMetrics()!.hasMultipleCampaigns && (
                        <p className="text-xs text-muted-foreground">
                          Includes duplication
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Audience Size
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatNumber(getTotalMetrics()!.audienceSize)}</div>
                      {getTotalMetrics()!.hasMultipleCampaigns && (
                        <p className="text-xs text-muted-foreground">
                          Max across campaigns
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        SOV (Share of Voice)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{getTotalMetrics()!.sov.toFixed(2)}%</div>
                      <p className="text-xs text-muted-foreground">
                        (Reach/Audience Size) × 100
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        CPM
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">${getTotalMetrics()!.cpm.toFixed(2)}</div>
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(getTotalMetrics()!.impressions)} impressions
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Total Budget
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">${formatNumber(getTotalMetrics()!.totalBudget)}</div>
                      <p className="text-xs text-muted-foreground">
                        Across all campaigns
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Results by Optimization Goal */}
                {getTotalMetrics()!.resultsByGoal.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Results by Optimization Goal</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {getTotalMetrics()!.resultsByGoal.map((goalData, idx) => (
                          <div key={idx} className="border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <h4 className="font-medium">{goalData.label}</h4>
                                <p className="text-xs text-muted-foreground">KPI: {goalData.kpi}</p>
                              </div>
                              <Badge variant="outline">{goalData.goal}</Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground mb-1">Result</p>
                                <p className="font-semibold text-lg">{formatNumber(goalData.result)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Cost/Result</p>
                                <p className="font-semibold text-lg">${goalData.costPerResult.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Result Rate ({goalData.rateName})</p>
                                <p className="font-semibold text-lg">{goalData.resultRate.toFixed(2)}%</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Actiplan Deliverables View */}
            {actiplanForecast && (
              <ActiplanDeliverablesView actiplanForecast={actiplanForecast} />
            )}
          </>
        )}

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <div className="flex gap-2">
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
            <Button 
              variant="outline" 
              onClick={() => setApprovalDialogOpen(true)} 
              disabled={Object.keys(forecasts).length === 0}
            >
              <Mail className="h-4 w-4 mr-2" />
              Send for Approval
            </Button>
            <Button 
              variant="gradient" 
              onClick={handlePushToDSP} 
              disabled={Object.keys(forecasts).length === 0 || !campaignId || pushingToDSP}
            >
              {pushingToDSP ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Pushing to DSP...
                </>
              ) : (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  Push to DSP
                </>
              )}
            </Button>
            <Button onClick={onFinalize} disabled={Object.keys(forecasts).length === 0}>
              Save Draft
            </Button>
          </div>
        </div>

        <ApprovalDialog
          open={approvalDialogOpen}
          onOpenChange={setApprovalDialogOpen}
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
        />
      </CardContent>
    </Card>
  );
}
