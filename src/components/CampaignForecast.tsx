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
  cpr: number;
  sov: number;
  frequency: number;
  cost: number;
  clicks: number;
  ctr: number;
  cpc: number;
  results: number;
  costPerResult: number;
  resultRate: number;
}

export function CampaignForecast({
  platforms,
  totalBudget,
  genericConfig,
  onBack,
  onFinalize,
}: CampaignForecastProps) {
  const [loading, setLoading] = useState(false);
  const [forecasts, setForecasts] = useState<Record<string, Record<string, ForecastMetrics>>>({});

  const fetchForecast = async (platformId: string, marketId: string, budget: number) => {
    // Simulate API call - In production, this would call actual platform APIs
    // For Meta: use Marketing API reach estimate endpoint
    // For Google Ads: use Keyword Planner or Reach Planner API
    
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock forecast calculation based on platform and budget
    const baseCPM = platformId.includes("facebook") ? 10 : 
                    platformId.includes("google") ? 8 :
                    platformId.includes("linkedin") ? 25 : 12;
    
    const impressions = Math.floor((budget / baseCPM) * 1000);
    const avgFrequency = 3.5;
    const reach = Math.floor(impressions / avgFrequency);
    const avgCTR = 1.5; // 1.5%
    const clicks = Math.floor(impressions * (avgCTR / 100));
    const cpc = budget / clicks;
    const avgConversionRate = 2.5; // 2.5%
    const results = Math.floor(clicks * (avgConversionRate / 100));
    const costPerResult = budget / results;

    return {
      audienceSize: reach * 10, // Potential audience is larger than reach
      impressions,
      cpm: baseCPM,
      reach,
      cpr: budget / reach,
      sov: 5.2, // Share of Voice percentage
      frequency: avgFrequency,
      cost: budget,
      clicks,
      ctr: avgCTR,
      cpc,
      results,
      costPerResult,
      resultRate: avgConversionRate,
    };
  };

  const handleFetchForecasts = async () => {
    setLoading(true);
    try {
      const newForecasts: Record<string, Record<string, ForecastMetrics>> = {};

      for (const platform of platforms) {
        newForecasts[platform.id] = {};
        
        for (const market of platform.markets) {
          const marketBudget = (totalBudget * platform.budgetPercentage / 100) * (market.budgetPercentage / 100);
          const forecast = await fetchForecast(platform.id, market.id, marketBudget);
          newForecasts[platform.id][market.id] = forecast;
        }
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

  const getTotalMetrics = (): ForecastMetrics | null => {
    if (Object.keys(forecasts).length === 0) return null;

    let total: ForecastMetrics = {
      audienceSize: 0,
      impressions: 0,
      cpm: 0,
      reach: 0,
      cpr: 0,
      sov: 0,
      frequency: 0,
      cost: 0,
      clicks: 0,
      ctr: 0,
      cpc: 0,
      results: 0,
      costPerResult: 0,
      resultRate: 0,
    };

    let count = 0;
    Object.values(forecasts).forEach((platformForecasts) => {
      Object.values(platformForecasts).forEach((forecast) => {
        total.audienceSize += forecast.audienceSize;
        total.impressions += forecast.impressions;
        total.reach += forecast.reach;
        total.cost += forecast.cost;
        total.clicks += forecast.clicks;
        total.results += forecast.results;
        total.cpm += forecast.cpm;
        total.ctr += forecast.ctr;
        total.cpc += forecast.cpc;
        total.frequency += forecast.frequency;
        total.sov += forecast.sov;
        count++;
      });
    });

    // Calculate averages for rate-based metrics
    total.cpm = total.cpm / count;
    total.ctr = total.ctr / count;
    total.cpc = total.cost / total.clicks;
    total.cpr = total.cost / total.reach;
    total.frequency = total.impressions / total.reach;
    total.costPerResult = total.cost / total.results;
    total.resultRate = (total.results / total.clicks) * 100;
    total.sov = total.sov / count;

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
                      Frequency: {getTotalMetrics()!.frequency.toFixed(2)}x
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
                          <TableHead className="text-right">Audience Size</TableHead>
                          <TableHead className="text-right">Impressions</TableHead>
                          <TableHead className="text-right">CPM</TableHead>
                          <TableHead className="text-right">Reach</TableHead>
                          <TableHead className="text-right">CPR</TableHead>
                          <TableHead className="text-right">Frequency</TableHead>
                          <TableHead className="text-right">Clicks</TableHead>
                          <TableHead className="text-right">CTR</TableHead>
                          <TableHead className="text-right">CPC</TableHead>
                          <TableHead className="text-right">Results</TableHead>
                          <TableHead className="text-right">Cost/Result</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {platform.markets.map((market) => {
                          const forecast = forecasts[platform.id]?.[market.id];
                          if (!forecast) return null;

                          return (
                            <TableRow key={market.id}>
                              <TableCell className="font-medium">{market.name}</TableCell>
                              <TableCell className="text-right">{formatNumber(forecast.audienceSize)}</TableCell>
                              <TableCell className="text-right">{formatNumber(forecast.impressions)}</TableCell>
                              <TableCell className="text-right">${forecast.cpm.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{formatNumber(forecast.reach)}</TableCell>
                              <TableCell className="text-right">${forecast.cpr.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{forecast.frequency.toFixed(2)}x</TableCell>
                              <TableCell className="text-right">{formatNumber(forecast.clicks)}</TableCell>
                              <TableCell className="text-right">{forecast.ctr.toFixed(2)}%</TableCell>
                              <TableCell className="text-right">${forecast.cpc.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{formatNumber(forecast.results)}</TableCell>
                              <TableCell className="text-right">${forecast.costPerResult.toFixed(2)}</TableCell>
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
