import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronsDownUp, Database, Calculator, ShieldCheck, Target, Swords, Ban } from "lucide-react";
import { format } from "date-fns";
import { useState, useCallback } from "react";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import type { KeywordItem } from "@/components/KeywordTargeting";
import { buildSearchStrategyCampaignName, getEffectiveSearchKeywords, getSearchStrategyGroups, isSearchPhaseLike } from "@/utils/searchStrategyCampaigns";
import type { BenchmarkData } from "@/utils/benchmarkData";
import { getPlatformKeyFromId } from "@/utils/benchmarkData";

interface ActiplanDeliverablesViewProps {
  selectedKeywords?: KeywordItem[];
  benchmarks?: Map<string, BenchmarkData>;
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
      dataSource?: 'live_api' | 'estimated' | 'ai_predicted'; // Data source indicator
      markets: Array<{
        marketName: string;
        marketCode?: string;
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
            isBenchmarkBased?: boolean;
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
             isBenchmarkBased?: boolean;
             strategyCampaigns?: Array<{
               strategy: "brand" | "generic" | "competition";
               campaignName: string;
               budget: number;
               budgetPercentage: number;
               searchVolume: number;
               keywordsCount: number;
               negativeKeywordsCount: number;
               impressions: number;
               reach: number;
               result: number;
               costPerResult: number;
               resultRate: number;
               kpi: string;
               startDate: string;
               endDate: string;
               ctr?: number | null;
               roas?: number | null;
             }>;
             ctr?: number | null;
             roas?: number | null;
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

export function ActiplanDeliverablesView({ actiplanForecast, selectedKeywords, benchmarks }: ActiplanDeliverablesViewProps) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({});
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({});

  const expandAllPlatforms = useCallback(() => {
    const newState: Record<string, boolean> = {};
    actiplanForecast.platforms.forEach(p => { newState[p.platformId] = true; });
    setExpandedPlatforms(newState);
  }, [actiplanForecast.platforms]);

  const collapseAllPlatforms = useCallback(() => {
    setExpandedPlatforms({});
    setExpandedMarkets({});
  }, []);

  const expandAllMarkets = useCallback(() => {
    const newState: Record<string, boolean> = {};
    actiplanForecast.platforms.forEach(p => {
      p.markets.forEach(m => { newState[m.marketName] = true; });
    });
    setExpandedMarkets(newState);
  }, [actiplanForecast.platforms]);

  const collapseAllMarkets = useCallback(() => {
    setExpandedMarkets({});
  }, []);

  return (
    <div className="space-y-4">
      {/* Actiplan Deliverables - Top Level */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Actiplan Deliverables</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => { expandAllPlatforms(); expandAllMarkets(); }} className="h-7 px-2 text-xs">
              <ChevronsUpDown className="h-3 w-3 mr-1" />
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { collapseAllPlatforms(); collapseAllMarkets(); }} className="h-7 px-2 text-xs">
              <ChevronsDownUp className="h-3 w-3 mr-1" />
              Collapse All
            </Button>
          </div>
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
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  Reach
                  {platform.dataSource && <DataSourceBadge dataSource={platform.dataSource} platformName={platform.platformName} />}
                </div>
                <div className="text-lg font-semibold">{formatNumber(platform.totalReach)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">CPM</div>
                <div className="text-lg font-semibold">${platform.avgCPM.toFixed(2)}</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  Frequency
                  {platform.dataSource && <DataSourceBadge dataSource={platform.dataSource} platformName={platform.platformName} />}
                </div>
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
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        Reach
                        {platform.dataSource && <DataSourceBadge dataSource={platform.dataSource} platformName={platform.platformName} />}
                      </div>
                      <div className="text-sm font-semibold">{formatNumber(market.reach)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">CPM</div>
                      <div className="text-sm font-semibold">${market.cpm.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        Frequency
                        {platform.dataSource && <DataSourceBadge dataSource={platform.dataSource} platformName={platform.platformName} />}
                      </div>
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
                             <TableHead>CTR / ROAS</TableHead>
                             <TableHead>Source</TableHead>
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
                                 <TableCell>
                                   {phase.roas != null ? (
                                     <span className="text-xs font-medium">{phase.roas.toFixed(2)}x ROAS</span>
                                   ) : phase.ctr != null ? (
                                     <span className="text-xs font-medium">{phase.ctr.toFixed(2)}% CTR</span>
                                   ) : (
                                     <span className="text-xs text-muted-foreground">—</span>
                                   )}
                                 </TableCell>
                                <TableCell>
                                   <TooltipProvider delayDuration={0}>
                                     <Tooltip>
                                       <TooltipTrigger asChild>
                                         <span className="inline-flex cursor-pointer">
                                           {phase.isBenchmarkBased ? (
                                             <Badge className="gap-1 text-xs bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600">
                                               <Database className="h-3 w-3" />
                                               Benchmark
                                             </Badge>
                                           ) : (
                                             <Badge variant="secondary" className="gap-1 text-xs">
                                               <Calculator className="h-3 w-3" />
                                               Estimated
                                             </Badge>
                                           )}
                                         </span>
                                       </TooltipTrigger>
                                       <TooltipContent side="top" className="max-w-xs">
                                         {phase.isBenchmarkBased 
                                           ? (() => {
                                               const platformKey = getPlatformKeyFromId(platform.platformId || platform.platformName);
                                               const goalKey = `${platformKey}_${market.marketName.toUpperCase()}_${phase.optimizationGoal.toUpperCase()}`;
                                               const bm = benchmarks?.get(goalKey);
                                               const dateInfo = bm?.date_range_start && bm?.date_range_end
                                                 ? ` (${bm.date_range_start} → ${bm.date_range_end})`
                                                 : '';
                                               return `Based on ${bm?.campaign_count || 0} campaigns${dateInfo}`;
                                             })()
                                           : "Estimated using industry averages - no matching benchmark found"
                                         }
                                       </TooltipContent>
                                     </Tooltip>
                                   </TooltipProvider>
                                </TableCell>
                              </TableRow>
                              {/* Display Ad Set splits if present — but NOT for search phases (they use strategy campaigns instead) */}
                              {(() => {
                                const phaseConfig = {
                                  name: phase.phaseName,
                                  strategyCampaigns: phase.strategyCampaigns,
                                } as Record<string, unknown>;
                                const effectiveSearchKeywords = getEffectiveSearchKeywords({
                                  keywords: selectedKeywords,
                                  platformId: platform.platformId,
                                  market: { marketName: market.marketName, marketCode: market.marketCode },
                                  phase: phaseConfig,
                                });
                                const isSearchWithKeywords = isSearchPhaseLike({ platformId: platform.platformId, phase: phaseConfig }) && effectiveSearchKeywords.length > 0;

                                if (!phase.adSets || phase.adSets.length === 0 || isSearchWithKeywords) {
                                  return null;
                                }

                                return phase.adSets.map((adSet, adSetIdx) => (
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
                                ));
                              })()}
                              {(() => {
                                const STRATEGY_META: Record<string, { label: string; icon: React.ReactNode }> = {
                                  brand: { label: "Brand", icon: <ShieldCheck className="h-3 w-3" /> },
                                  generic: { label: "Generic", icon: <Target className="h-3 w-3" /> },
                                  competition: { label: "Competition", icon: <Swords className="h-3 w-3" /> },
                                };

                                const phaseConfig = {
                                  name: phase.phaseName,
                                  strategyCampaigns: phase.strategyCampaigns,
                                } as Record<string, unknown>;
                                const effectiveSearchKeywords = getEffectiveSearchKeywords({
                                  keywords: selectedKeywords,
                                  platformId: platform.platformId,
                                  market: { marketName: market.marketName, marketCode: market.marketCode },
                                  phase: phaseConfig,
                                });
                                const isSearch = isSearchPhaseLike({ platformId: platform.platformId, phase: phaseConfig });

                                const strategyCampaigns = phase.strategyCampaigns?.length
                                  ? phase.strategyCampaigns
                                  : isSearch
                                    ? getSearchStrategyGroups({
                                        keywords: effectiveSearchKeywords,
                                        platformId: platform.platformId,
                                        market: { marketName: market.marketName, marketCode: market.marketCode },
                                      }).map((group) => ({
                                        strategy: group.strategy,
                                        campaignName: buildSearchStrategyCampaignName(phase.phaseName, group.label),
                                        budget: phase.budget * group.budgetShare,
                                        budgetPercentage: group.budgetPercentage,
                                        searchVolume: group.totalVolume,
                                        keywordsCount: group.positives.length,
                                        negativeKeywordsCount: group.negatives.length,
                                        impressions: 0,
                                        reach: 0,
                                        result: 0,
                                        costPerResult: 0,
                                        resultRate: 0,
                                        kpi: phase.kpi,
                                        startDate: phase.startDate,
                                        endDate: phase.endDate,
                                        ctr: null,
                                        roas: null,
                                      }))
                                    : [];

                                if (!strategyCampaigns.length) return null;

                                return strategyCampaigns.map((strategyCampaign) => {
                                  const meta = STRATEGY_META[strategyCampaign.strategy] || {
                                    label: strategyCampaign.strategy,
                                    icon: <Target className="h-3 w-3" />,
                                  };
                                  const fmtVol = strategyCampaign.searchVolume >= 1_000_000
                                    ? `${(strategyCampaign.searchVolume / 1_000_000).toFixed(1)}M`
                                    : strategyCampaign.searchVolume >= 1_000
                                      ? `${(strategyCampaign.searchVolume / 1_000).toFixed(1)}K`
                                      : String(strategyCampaign.searchVolume || 0);

                                  return (
                                    <TableRow key={`${idx}-kw-${strategyCampaign.strategy}`} className="bg-muted/20">
                                      <TableCell className="pl-8 text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                          {meta.icon}
                                          <span className="text-xs font-medium">{strategyCampaign.campaignName}</span>
                                          <Badge variant="outline" className="text-[10px] ml-1">
                                            {strategyCampaign.keywordsCount} kw
                                          </Badge>
                                          {strategyCampaign.negativeKeywordsCount > 0 && (
                                            <span className="flex items-center gap-0.5 text-destructive text-[10px]">
                                              <Ban className="h-2.5 w-2.5" />{strategyCampaign.negativeKeywordsCount}
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>{strategyCampaign.kpi}</TableCell>
                                      <TableCell>{format(new Date(strategyCampaign.startDate), 'MMM d, yyyy')}</TableCell>
                                      <TableCell>{format(new Date(strategyCampaign.endDate), 'MMM d, yyyy')}</TableCell>
                                      <TableCell>
                                        ${formatNumber(strategyCampaign.budget)}
                                        <span className="text-xs text-muted-foreground"> ({strategyCampaign.budgetPercentage.toFixed(0)}%)</span>
                                      </TableCell>
                                      <TableCell>
                                        {strategyCampaign.result > 0 ? formatNumber(strategyCampaign.result) : `${fmtVol} vol/mo`}
                                      </TableCell>
                                      <TableCell>
                                        {strategyCampaign.result > 0 && strategyCampaign.costPerResult > 0
                                          ? `$${strategyCampaign.costPerResult.toFixed(3)}`
                                          : "—"}
                                      </TableCell>
                                      <TableCell>
                                        {strategyCampaign.roas != null ? (
                                          <span className="text-xs font-medium">{strategyCampaign.roas.toFixed(2)}x ROAS</span>
                                        ) : strategyCampaign.ctr != null ? (
                                          <span className="text-xs font-medium">{strategyCampaign.ctr.toFixed(2)}% CTR</span>
                                        ) : strategyCampaign.resultRate > 0 ? (
                                          <span className="text-xs font-medium">{strategyCampaign.resultRate.toFixed(2)}%</span>
                                        ) : (
                                          <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className="text-[10px]">
                                          Campaign
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  );
                                });
                              })()}
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
