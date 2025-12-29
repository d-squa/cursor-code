import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { DataSourceBadge } from "@/components/ui/data-source-badge";

interface ActiplanDeliverablesViewProps {
  actiplanForecast: {
    totalBudget: number;
    totalAudienceSize: number;
    totalImpressions: number;
    totalReach: number;
    avgCPM: number;
    frequency: number;
    sov: number;
    platformDeliverables: Record<string, Array<{ kpi: string; result: number }>>;
    platforms: Array<{
      platformId: string;
      platformName: string;
      totalBudget: number;
      totalAudienceSize: number;
      totalImpressions: number;
      totalReach: number;
      avgCPM: number;
      frequency: number;
      sov: number;
      dataSource?: 'live_api' | 'estimated'; // Data source indicator
      markets: Array<{
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
        phases: Array<{
          phaseName: string;
          budget: number;
          startDate: string;
          endDate: string;
          kpi: string;
          optimizationGoal: string;
          result: number;
          costPerResult: number;
          resultRate: number;
          adSets?: Array<{
            adSetName: string;
            budget: number;
            budgetPercentage: number;
            impressions: number;
            reach: number;
            result: number;
            costPerResult: number;
          }>;
        }>;
      }>;
    }>;
  };
}

const formatNumber = (num: number) => num.toLocaleString();

export function ActiplanDeliverablesView({ actiplanForecast }: ActiplanDeliverablesViewProps) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({});
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-4">
      {/* Actiplan Deliverables - Top Level */}
      <Card>
        <CardHeader>
          <CardTitle>Actiplan Deliverables</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Total Budget</div>
              <div className="text-lg font-semibold">${formatNumber(actiplanForecast.totalBudget)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Audience Size</div>
              <div className="text-lg font-semibold">{formatNumber(actiplanForecast.totalAudienceSize)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Impressions</div>
              <div className="text-lg font-semibold">{formatNumber(actiplanForecast.totalImpressions)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Reach</div>
              <div className="text-lg font-semibold">{formatNumber(actiplanForecast.totalReach)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Avg. CPM</div>
              <div className="text-lg font-semibold">${actiplanForecast.avgCPM.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Frequency</div>
              <div className="text-lg font-semibold">{actiplanForecast.frequency.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">SOV</div>
              <div className="text-lg font-semibold">{actiplanForecast.sov.toFixed(1)}%</div>
            </div>
          </div>

          {/* Platform Deliverables */}
          {Object.keys(actiplanForecast.platformDeliverables).length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold">Platform Deliverables</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(actiplanForecast.platformDeliverables).map(([platformName, kpis]) => (
                  <div key={platformName} className="p-3 bg-muted/20 rounded-lg">
                    <div className="font-medium text-sm mb-2">{platformName}</div>
                    <div className="space-y-1">
                      {kpis.map((kpi, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{kpi.kpi}</span>
                          <span className="font-semibold">{formatNumber(kpi.result)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platforms grouped under Actiplan */}
      {actiplanForecast.platforms.map((platform) => (
        <Collapsible
          key={platform.platformId}
          open={expandedPlatforms[platform.platformId]}
          onOpenChange={(open) => setExpandedPlatforms(prev => ({ ...prev, [platform.platformId]: open }))}
          className="border rounded-lg"
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between p-4 hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">{platform.platformName} Deliverables</span>
                {platform.dataSource && (
                  <DataSourceBadge dataSource={platform.dataSource} platformName={platform.platformName} />
                )}
              </div>
              {expandedPlatforms[platform.platformId] ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4">
            {/* Platform-level metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
              <div>
                <div className="text-sm text-muted-foreground">Budget</div>
                <div className="text-lg font-semibold">${formatNumber(platform.totalBudget)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Audience Size</div>
                <div className="text-lg font-semibold">{formatNumber(platform.totalAudienceSize)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Impressions</div>
                <div className="text-lg font-semibold">{formatNumber(platform.totalImpressions)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Reach</div>
                <div className="text-lg font-semibold">{formatNumber(platform.totalReach)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">CPM</div>
                <div className="text-lg font-semibold">${platform.avgCPM.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Frequency</div>
                <div className="text-lg font-semibold">{platform.frequency.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">SOV</div>
                <div className="text-lg font-semibold">{platform.sov.toFixed(1)}%</div>
              </div>
            </div>

            {/* Markets under Platform */}
            {platform.markets.map((market) => (
              <Collapsible
                key={market.marketName}
                open={expandedMarkets[market.marketName]}
                onOpenChange={(open) => setExpandedMarkets(prev => ({ ...prev, [market.marketName]: open }))}
                className="ml-4 border-l-2 border-border pl-4 mb-4"
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between p-3 hover:bg-accent"
                  >
                    <span className="font-semibold text-base">{market.marketName} Forecast</span>
                    {expandedMarkets[market.marketName] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3">
                  {/* Market-level metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 bg-muted/20 rounded-lg">
                    <div>
                      <div className="text-xs text-muted-foreground">Budget</div>
                      <div className="text-sm font-semibold">${formatNumber(market.budget)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Audience Size</div>
                      <div className="text-sm font-semibold">{formatNumber(market.audienceSize)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Impressions</div>
                      <div className="text-sm font-semibold">{formatNumber(market.impressions)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Reach</div>
                      <div className="text-sm font-semibold">{formatNumber(market.reach)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">CPM</div>
                      <div className="text-sm font-semibold">${market.cpm.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Frequency</div>
                      <div className="text-sm font-semibold">{market.frequency.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">SOV</div>
                      <div className="text-sm font-semibold">{market.sov.toFixed(1)}%</div>
                    </div>
                  </div>

                  {/* Market KPI Results */}
                  {market.resultsByGoal.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold mb-2">KPI Results</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {market.resultsByGoal.map((result, idx) => (
                          <div key={idx} className="p-2 bg-muted/10 rounded">
                            <div className="text-xs text-muted-foreground">{result.kpi}</div>
                            <div className="text-sm font-semibold">{formatNumber(result.result)}</div>
                            <div className="text-xs text-muted-foreground">
                              ${result.costPerResult.toFixed(3)} per result • {result.resultRate.toFixed(2)}% rate
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Phase-level details */}
                  {market.phases.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Phase Details</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Phase</TableHead>
                            <TableHead>KPI</TableHead>
                            <TableHead>Start Date</TableHead>
                            <TableHead>End Date</TableHead>
                            <TableHead>Budget</TableHead>
                            <TableHead>Result</TableHead>
                            <TableHead>Cost/Result</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {market.phases.map((phase, idx) => (
                            <>
                              <TableRow key={idx}>
                                <TableCell className="font-medium">{phase.phaseName}</TableCell>
                                <TableCell>{phase.kpi}</TableCell>
                                <TableCell>{format(new Date(phase.startDate), 'MMM d, yyyy')}</TableCell>
                                <TableCell>{format(new Date(phase.endDate), 'MMM d, yyyy')}</TableCell>
                                <TableCell>${formatNumber(phase.budget)}</TableCell>
                                <TableCell>{formatNumber(phase.result)}</TableCell>
                                <TableCell>${phase.costPerResult.toFixed(3)}</TableCell>
                              </TableRow>
                              {/* Display Ad Set splits if present */}
                              {phase.adSets && phase.adSets.length > 0 && phase.adSets.map((adSet, adSetIdx) => (
                                <TableRow key={`${idx}-adset-${adSetIdx}`} className="bg-muted/30">
                                  <TableCell className="pl-8 text-muted-foreground">
                                    ↳ {adSet.adSetName}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">{phase.kpi}</TableCell>
                                  <TableCell className="text-muted-foreground">-</TableCell>
                                  <TableCell className="text-muted-foreground">-</TableCell>
                                  <TableCell className="text-muted-foreground">
                                    ${formatNumber(adSet.budget)} ({adSet.budgetPercentage.toFixed(0)}%)
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">{formatNumber(adSet.result)}</TableCell>
                                  <TableCell className="text-muted-foreground">${adSet.costPerResult.toFixed(3)}</TableCell>
                                </TableRow>
                              ))}
                            </>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
