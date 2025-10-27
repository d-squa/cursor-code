import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PlatformWithMarkets } from "@/types/mediaplan";
import { GenericConfig } from "./GenericStrategyConfig";
import { Loader2, TrendingUp, Users, Eye, MousePointer, DollarSign } from "lucide-react";
import { toast } from "sonner";

interface CampaignForecastProps {
  platforms: PlatformWithMarkets[];
  totalBudget: number;
  genericConfig: GenericConfig;
  onBack: () => void;
  onFinalize: () => void;
}

interface ForecastMetrics {
  audienceSize: number;
  impressions: number;
  cpm: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  results: number;
  resultType?: string;
  costPerResult: number;
  conversionRate: number;
}

export function CampaignForecast({
  platforms,
  totalBudget,
  genericConfig,
  onBack,
  onFinalize,
}: CampaignForecastProps) {
  const [loading, setLoading] = useState(false);
  const [forecasts, setForecasts] = useState<Record<string, Array<{ market: string; budget: number; metrics: ForecastMetrics }>>>({});

  const fetchForecast = async (platformId: string, marketId: string, budget: number, market: any) => {
    // Call actual platform APIs for Meta, use mock for others
    if (platformId.includes("facebook") || platformId.includes("instagram") || platformId.includes("meta")) {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        
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
        
        const { data, error } = await supabase.functions.invoke('meta-forecast', {
          body: {
            markets: [marketCode],
            budget,
            strategyFocus,
          }
        });

        if (error) throw error;

        // Transform Meta API response to our format
        return {
          audienceSize: data.forecast?.audienceSize || data.reach * 15,
          impressions: data.forecast?.impressions || data.impressions,
          cpm: data.forecast?.cpm || parseFloat(data.cpm),
          reach: data.forecast?.reach || data.reach,
          clicks: data.forecast?.clicks || data.clicks,
          ctr: data.forecast?.ctr || parseFloat(data.ctr),
          cpc: data.forecast?.cpc || parseFloat(data.cpc),
          results: data.forecast?.results || data.conversions,
          resultType: data.forecast?.resultType || data.resultMetric || 'Conversions',
          costPerResult: data.forecast?.costPerResult || parseFloat(data.costPerConversion),
          conversionRate: data.forecast?.conversionRate || parseFloat(data.conversionRate),
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
          toast.error('Meta forecast failed, using estimates');
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
    const avgCTR = 1.5;
    const clicks = Math.floor(impressions * (avgCTR / 100));
    const cpc = budget / clicks;
    
    // Determine result metric based on strategy focus
    const strategyFocus = market.strategyFocus || genericConfig.strategyFocus || 'conversions';
    let results = 0;
    let resultRate = 0;
    let resultMetric = 'Conversions';
    
    if (strategyFocus === 'brand-awareness') {
      results = reach;
      resultRate = (reach / impressions) * 100;
      resultMetric = 'Reach';
    } else if (strategyFocus === 'traffic') {
      results = clicks;
      resultRate = avgCTR;
      resultMetric = 'Link Clicks';
    } else if (strategyFocus === 'leads') {
      const leadRate = 3;
      results = Math.floor(clicks * (leadRate / 100));
      resultRate = leadRate;
      resultMetric = 'Leads';
    } else if (strategyFocus === 'app-installs') {
      const installRate = 4;
      results = Math.floor(clicks * (installRate / 100));
      resultRate = installRate;
      resultMetric = 'App Installs';
    } else { // purchase or conversions
      const avgConversionRate = 2.5;
      results = Math.floor(clicks * (avgConversionRate / 100));
      resultRate = avgConversionRate;
      resultMetric = 'Conversions';
    }
    
    const costPerResult = budget / results;

    return {
      audienceSize: reach * 10,
      impressions,
      cpm: baseCPM,
      reach,
      clicks,
      ctr: avgCTR,
      cpc,
      results,
      resultType: resultMetric,
      costPerResult,
      conversionRate: resultRate,
    };
  };

  const handleFetchForecasts = async () => {
    setLoading(true);
    try {
      const newForecasts: Record<string, any[]> = {};

      for (const platform of platforms) {
        const platformBudget = totalBudget * (platform.budgetPercentage / 100);
        const platformMarkets = platform.markets.map(market => {
          const marketBudget = platformBudget * (market.budgetPercentage / 100);
          return {
            name: market.name,
            budget: marketBudget,
            market
          };
        });

        newForecasts[platform.id] = await Promise.all(
          platformMarkets.map(async ({ name, budget, market }) => {
            try {
              const forecast = await fetchForecast(platform.id, market.id, budget, market);
              return {
                market: name,
                budget,
                metrics: forecast,
              };
            } catch (error: any) {
              console.error(`Forecast error for ${platform.id} - ${name}:`, error);
              toast.error(`Could not fetch forecast for ${name} on ${platform.name}. Using estimates.`);
              
              // Return estimated metrics as fallback
              return {
                market: name,
                budget,
                metrics: {
                  audienceSize: Math.round(budget * 100),
                  reach: Math.round(budget * 50),
                  impressions: Math.round(budget * 100),
                  cpm: 10,
                  clicks: Math.round(budget * 10),
                  ctr: 1.0,
                  cpc: 1.0,
                  results: Math.round(budget * 2),
                  resultMetric: "conversions",
                  costPerResult: budget > 0 ? (budget / Math.round(budget * 2)) : 0,
                  resultRate: 2.0,
                },
              };
            }
          })
        );
      }

      setForecasts(newForecasts);
      toast.success("Forecasts fetched successfully!");
    } catch (error) {
      toast.error("Failed to fetch forecasts");
      console.error(error);
    } finally {
      setLoading(false);
    }
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
      impressions: 0,
      cpm: 0,
      reach: 0,
      clicks: 0,
      ctr: 0,
      cpc: 0,
      results: 0,
      costPerResult: 0,
      conversionRate: 0,
      totalBudget: 0,
    };

    let count = 0;
    Object.values(forecasts).forEach((platformForecasts) => {
      platformForecasts.forEach((forecast) => {
        total.audienceSize += forecast.metrics.audienceSize;
        total.impressions += forecast.metrics.impressions;
        total.reach += forecast.metrics.reach;
        total.totalBudget += forecast.budget;
        total.clicks += forecast.metrics.clicks;
        total.results += forecast.metrics.results;
        total.cpm += forecast.metrics.cpm;
        total.ctr += forecast.metrics.ctr;
        total.cpc += forecast.metrics.cpc;
        total.conversionRate += forecast.metrics.conversionRate;
        count++;
      });
    });

    // Calculate averages for rate-based metrics
    total.cpm = total.cpm / count;
    total.ctr = total.ctr / count;
    total.cpc = total.totalBudget / total.clicks;
    total.costPerResult = total.totalBudget / total.results;
    total.conversionRate = total.conversionRate / count;

    return total;
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
            {/* Summary Cards */}
            {getTotalMetrics() && (
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Total Reach
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(getTotalMetrics()!.reach)}</div>
                    <p className="text-xs text-muted-foreground">
                      Audience: {formatNumber(getTotalMetrics()!.audienceSize)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Impressions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(getTotalMetrics()!.impressions)}</div>
                    <p className="text-xs text-muted-foreground">
                      CPM: ${getTotalMetrics()!.cpm.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <MousePointer className="h-4 w-4" />
                      Clicks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(getTotalMetrics()!.clicks)}</div>
                    <p className="text-xs text-muted-foreground">
                      CTR: {getTotalMetrics()!.ctr.toFixed(2)}%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(getTotalMetrics()!.results)}</div>
                    <p className="text-xs text-muted-foreground">
                      Cost/Result: ${getTotalMetrics()!.costPerResult.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </div>
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
                          <TableHead>Market</TableHead>
                          <TableHead>Budget</TableHead>
                          <TableHead>SOV %</TableHead>
                          <TableHead>Audience Size</TableHead>
                          <TableHead>Reach</TableHead>
                          <TableHead>Impressions</TableHead>
                          <TableHead>CPM</TableHead>
                          <TableHead>Clicks</TableHead>
                          <TableHead>CTR</TableHead>
                          <TableHead>CPC</TableHead>
                          <TableHead>{forecasts[platform.id]?.[0]?.metrics.resultType || "Results"}</TableHead>
                          <TableHead>Conv. Rate</TableHead>
                          <TableHead>Cost/{forecasts[platform.id]?.[0]?.metrics.resultType || "Result"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {forecasts[platform.id]?.map((forecast, idx) => {
                          const platformBudget = forecast.budget || 0;
                          const sov = totalBudget > 0 ? ((platformBudget / totalBudget) * 100).toFixed(1) : "0.0";
                          
                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{forecast.market}</TableCell>
                              <TableCell>${formatNumber(platformBudget)}</TableCell>
                              <TableCell>{sov}%</TableCell>
                              <TableCell>{formatNumber(forecast.metrics.audienceSize)}</TableCell>
                              <TableCell>{formatNumber(forecast.metrics.reach)}</TableCell>
                              <TableCell>{formatNumber(forecast.metrics.impressions)}</TableCell>
                              <TableCell>${forecast.metrics.cpm.toFixed(2)}</TableCell>
                              <TableCell>{formatNumber(forecast.metrics.clicks)}</TableCell>
                              <TableCell>{forecast.metrics.ctr}%</TableCell>
                              <TableCell>${forecast.metrics.cpc.toFixed(2)}</TableCell>
                              <TableCell>{formatNumber(forecast.metrics.results)}</TableCell>
                              <TableCell>{forecast.metrics.conversionRate}%</TableCell>
                              <TableCell>${forecast.metrics.costPerResult.toFixed(2)}</TableCell>
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
          <Button onClick={onFinalize} disabled={Object.keys(forecasts).length === 0}>
            Finalize & Export
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
