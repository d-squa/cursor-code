import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PlatformWithMarkets } from "@/types/mediaplan";
import { GenericConfig } from "./GenericStrategyConfig";
import { Loader2, TrendingUp, Users, Eye, Target, DollarSign, Download, Mail } from "lucide-react";
import { toast } from "sonner";
import { getOptimizationGoalMetrics, getResultLabel, calculateResultFromImpressions } from "@/utils/optimizationGoals";
import { getObjectiveFromPhaseName } from "@/utils/phaseObjectiveMapping";
import { downloadMediaPlanPDF } from "@/utils/pdfGenerator";
import { ApprovalDialog } from "./ApprovalDialog";

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
  const [debugInfo, setDebugInfo] = useState<{startTimeUnix: number; endTimeUnix: number; startDateFormatted: string; endDateFormatted: string} | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [pdfBase64Data, setPdfBase64Data] = useState<string>("");

  const handleDownloadPDF = async () => {
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

    const planData = {
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
    };

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
            .from('connected_platforms')
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
        if (market.phaseObjective && market.phaseOptimizationGoal) {
          objective = market.phaseObjective;
          optimizationGoal = market.phaseOptimizationGoal;
          // Determine destination from optimization goal
          const goalMetricsLookup = getOptimizationGoalMetrics(objective, optimizationGoal);
          destination = goalMetricsLookup?.destination || "Website";
        } else if (market.phaseName) {
          // Auto-detect from phase name
          const autoDetected = getObjectiveFromPhaseName(market.phaseName, strategyFocusValue);
          objective = autoDetected.objective;
          optimizationGoal = autoDetected.optimizationGoal;
          destination = autoDetected.destination;
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
          
          // Map strategy focus to optimization goal for fallback
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
    try {
      const newForecasts: Record<string, CampaignForecast[]> = {};

      for (const platform of platforms) {
        const platformBudget = totalBudget * (platform.budgetPercentage / 100);
        const campaignForecasts: CampaignForecast[] = [];

        for (const market of platform.markets) {
          const marketBudget = platformBudget * (market.budgetPercentage / 100);
          
          // Each phase is a campaign - fetch forecast for each
          if (market.phases && market.phases.length > 0) {
            for (const phase of market.phases) {
              const campaignBudget = marketBudget * (phase.budgetPercentage / 100);
              
              try {
                // Create a campaign-specific market object with phase overrides
                const campaignMarket = {
                  ...market,
                  // Override with phase-specific settings
                  publisherPlatforms: phase.publisherPlatforms || market.publisherPlatforms,
                  positions: phase.positions || market.positions,
                  ageMin: phase.ageMin || market.ageMin,
                  ageMax: phase.ageMax || market.ageMax,
                  gender: phase.gender || market.gender,
                  countries: phase.countries || market.countries,
                  languages: phase.languages || market.languages,
                  detailedTargeting: phase.detailedTargeting || market.detailedTargeting,
                  // Add phase objective and optimization goal
                  phaseObjective: phase.objective,
                  phaseOptimizationGoal: phase.optimizationGoal,
                  phaseName: phase.name,
                };

                const forecast = await fetchForecast(
                  platform.id,
                  market.id,
                  campaignBudget,
                  campaignMarket,
                  phase.startDate,
                  phase.endDate
                );
                
                campaignForecasts.push({
                  market: `${market.name} - ${phase.name}`,
                  budget: campaignBudget,
                  campaign: phase.name,
                  dates: `${phase.startDate} → ${phase.endDate}`,
                  metrics: forecast,
                });
              } catch (error: any) {
                console.error(`Forecast error for ${platform.id} - ${market.name} - ${phase.name}:`, error);
                toast.error(`Could not fetch forecast for ${market.name} - ${phase.name}. Using estimates.`);
                
                // Return estimated metrics as fallback
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
                
                campaignForecasts.push({
                  market: `${market.name} - ${phase.name}`,
                  budget: campaignBudget,
                  campaign: phase.name,
                  dates: `${phase.startDate} → ${phase.endDate}`,
                  metrics: {
                    audienceSize: Math.round(campaignBudget * 100),
                    reach: Math.round(campaignBudget * 50),
                    impressions: Math.round(campaignBudget * 100),
                    cpm: 10,
                    result: Math.round(campaignBudget * 5),
                    resultLabel: getResultLabel(optimizationGoal),
                    resultKPI: goalMetrics?.kpi || optimizationGoal,
                    costPerResult: 2.0,
                    resultRate: 5.0,
                    resultRateName: goalMetrics?.rateName || "Rate",
                  },
                });
              }
            }
          } else {
            // Fallback: if no phases, treat entire market as one campaign
            try {
              const forecast = await fetchForecast(platform.id, market.id, marketBudget, market);
              campaignForecasts.push({
                market: market.name,
                budget: marketBudget,
                metrics: forecast,
              });
            } catch (error: any) {
              console.error(`Forecast error for ${platform.id} - ${market.name}:`, error);
              toast.error(`Could not fetch forecast for ${market.name}. Using estimates.`);
              
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
              
              campaignForecasts.push({
                market: market.name,
                budget: marketBudget,
                metrics: {
                  audienceSize: Math.round(marketBudget * 100),
                  reach: Math.round(marketBudget * 50),
                  impressions: Math.round(marketBudget * 100),
                  cpm: 10,
                  result: Math.round(marketBudget * 5),
                  resultLabel: getResultLabel(optimizationGoal),
                  resultKPI: goalMetrics?.kpi || optimizationGoal,
                  costPerResult: 2.0,
                  resultRate: 5.0,
                  resultRateName: goalMetrics?.rateName || "Rate",
                },
              });
            }
          }
        }

        newForecasts[platform.id] = campaignForecasts;
      }

      setForecasts(newForecasts);
      
      // Save forecast data to database if we have a campaign ID
      if (campaignId) {
        try {
          const { supabase } = await import("@/integrations/supabase/client");
          await (supabase as any).from('campaigns')
            .update({ 
              forecast_data: {
                forecasts: newForecasts,
                totalMetrics: getTotalMetricsFromForecasts(newForecasts),
                generatedAt: new Date().toISOString(),
              }
            })
            .eq('id', campaignId);
          
          toast.success("Forecasts fetched and saved successfully!");
        } catch (err) {
          console.error("Error saving forecast data:", err);
          toast.success("Forecasts fetched successfully!");
        }
      } else {
        toast.success("Forecasts fetched successfully!");
      }
    } catch (error) {
      toast.error("Failed to fetch forecasts");
      console.error(error);
    } finally {
      setLoading(false);
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
              View projected performance metrics for your campaigns
            </CardDescription>
          </div>
          {!loading && Object.keys(forecasts).length === 0 && (
            <Button onClick={handleFetchForecasts}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Fetch Forecasts
            </Button>
          )}
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

            {/* Detailed Metrics by Platform */}
            <Tabs defaultValue={platforms[0]?.id} className="w-full">
              <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${platforms.length}, 1fr)` }}>
                {platforms.map((platform) => (
                  <TabsTrigger key={platform.id} value={platform.id}>
                    {platform.name}
                  </TabsTrigger>
                ))}
              </TabsList>

              {platforms.map((platform) => (
                <TabsContent key={platform.id} value={platform.id}>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Campaign</TableHead>
                          <TableHead>Objective / Goal</TableHead>
                          <TableHead>Dates</TableHead>
                          <TableHead>Budget</TableHead>
                          <TableHead>Impressions</TableHead>
                          <TableHead>Reach</TableHead>
                          <TableHead>CPM</TableHead>
                          <TableHead>Result</TableHead>
                          <TableHead>Cost/Result</TableHead>
                          <TableHead>Result Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {forecasts[platform.id]?.map((forecast, idx) => {
                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">
                                <div>{forecast.market}</div>
                                {forecast.campaign && (
                                  <div className="text-xs text-muted-foreground">{forecast.campaign}</div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <Badge variant="outline" className="mb-1">{forecast.metrics.objective || 'N/A'}</Badge>
                                  <div className="text-xs text-muted-foreground">
                                    {forecast.metrics.optimizationGoal || 'N/A'}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">{forecast.dates || 'N/A'}</TableCell>
                              <TableCell>${formatNumber(forecast.budget)}</TableCell>
                              <TableCell>{formatNumber(forecast.metrics.impressions)}</TableCell>
                              <TableCell>{formatNumber(forecast.metrics.reach)}</TableCell>
                              <TableCell>${forecast.metrics.cpm.toFixed(2)}</TableCell>
                              <TableCell>
                                <div>{formatNumber(forecast.metrics.result)}</div>
                                <div className="text-xs text-muted-foreground">{forecast.metrics.resultKPI}</div>
                              </TableCell>
                              <TableCell>${forecast.metrics.costPerResult.toFixed(2)}</TableCell>
                              <TableCell>
                                <div>{forecast.metrics.resultRate.toFixed(2)}%</div>
                                <div className="text-xs text-muted-foreground">{forecast.metrics.resultRateName}</div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleDownloadPDF} 
              disabled={Object.keys(forecasts).length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setApprovalDialogOpen(true)} 
              disabled={Object.keys(forecasts).length === 0}
            >
              <Mail className="h-4 w-4 mr-2" />
              Send for Approval
            </Button>
            <Button onClick={onFinalize} disabled={Object.keys(forecasts).length === 0}>
              Finalize & Export
            </Button>
          </div>
        </div>

        <ApprovalDialog
          open={approvalDialogOpen}
          onOpenChange={setApprovalDialogOpen}
          planName={`${genericConfig.strategyFocus || 'Media'} Plan`}
          planDetails={{
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
