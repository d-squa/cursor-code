import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingDown, ArrowDown, DollarSign, Filter } from "lucide-react";

// Unified standard events across all platforms, ordered top-of-funnel → bottom
const UNIFIED_FUNNEL_STAGES = [
  {
    id: "impressions",
    label: "Impressions",
    metaEvents: ["impressions"],
    tiktokEvents: ["impressions"],
    googleEvents: ["impressions"],
    snapchatEvents: ["impressions"],
    color: "hsl(var(--primary))",
  },
  {
    id: "reach",
    label: "Reach",
    metaEvents: ["reach"],
    tiktokEvents: ["reach"],
    googleEvents: ["reach"],
    snapchatEvents: ["reach"],
    color: "hsl(220, 70%, 55%)",
  },
  {
    id: "clicks",
    label: "Clicks / Link Clicks",
    metaEvents: ["link_clicks", "clicks"],
    tiktokEvents: ["clicks"],
    googleEvents: ["clicks"],
    snapchatEvents: ["swipe_ups", "clicks"],
    color: "hsl(200, 65%, 50%)",
  },
  {
    id: "landing_page_views",
    label: "Landing Page Views",
    metaEvents: ["landing_page_views"],
    tiktokEvents: ["view_content", "ViewContent"],
    googleEvents: ["landing_page_views"],
    snapchatEvents: ["page_views"],
    color: "hsl(180, 60%, 45%)",
  },
  {
    id: "add_to_cart",
    label: "Add to Cart",
    metaEvents: ["add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"],
    tiktokEvents: ["AddToCart", "add_to_cart"],
    googleEvents: ["add_to_cart"],
    snapchatEvents: ["add_cart"],
    color: "hsl(45, 80%, 50%)",
  },
  {
    id: "initiate_checkout",
    label: "Initiate Checkout",
    metaEvents: ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"],
    tiktokEvents: ["StartCheckout", "initiate_checkout"],
    googleEvents: ["begin_checkout"],
    snapchatEvents: ["start_checkout"],
    color: "hsl(30, 75%, 50%)",
  },
  {
    id: "purchase",
    label: "Purchase / Conversion",
    metaEvents: ["purchase", "offsite_conversion.fb_pixel_purchase", "complete_registration"],
    tiktokEvents: ["CompletePayment", "complete_payment", "PlaceAnOrder"],
    googleEvents: ["conversions", "purchase"],
    snapchatEvents: ["purchase"],
    color: "hsl(145, 60%, 42%)",
  },
  {
    id: "lead",
    label: "Lead / Submit Form",
    metaEvents: ["lead", "offsite_conversion.fb_pixel_lead", "submit_form"],
    tiktokEvents: ["SubmitForm", "submit_form"],
    googleEvents: ["submit_lead_form"],
    snapchatEvents: ["sign_up"],
    color: "hsl(270, 55%, 50%)",
  },
];

interface FunnelStageData {
  id: string;
  label: string;
  volume: number;
  spend: number;
  costPerEvent: number;
  dropoffRate: number; // % drop from previous stage
  stickiness: number; // % retained from previous stage
  platformBreakdown: Record<string, number>;
}

interface FunnelAnalysisChartProps {
  campaign: {
    id: string;
    name: string;
    platforms?: any[];
    total_budget: number;
    forecast_data?: any;
    market_splits?: any;
  };
  insights?: any[];
  actualMetrics?: {
    reach: number;
    impressions: number;
    clicks: number;
    spend: number;
  } | null;
}

function extractEventVolume(
  metrics: any,
  eventNames: string[],
  platform: string
): number {
  if (!metrics) return 0;

  // Check direct metric fields
  for (const name of eventNames) {
    if (typeof metrics[name] === "number" && metrics[name] > 0) {
      return metrics[name];
    }
  }

  // Check actions array (Meta format)
  if (Array.isArray(metrics.actions)) {
    for (const action of metrics.actions) {
      if (eventNames.includes(action.action_type)) {
        return parseInt(action.value || "0");
      }
    }
  }

  // Check cost_per_action_type (Meta format)
  if (Array.isArray(metrics.cost_per_action_type)) {
    for (const cpa of metrics.cost_per_action_type) {
      if (eventNames.includes(cpa.action_type)) {
        return parseFloat(cpa.value || "0");
      }
    }
  }

  return 0;
}

export default function FunnelAnalysisChart({
  campaign,
  insights,
  actualMetrics,
}: FunnelAnalysisChartProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);

  // Extract available filters from campaign
  const availablePlatforms = useMemo(() => {
    return (campaign.platforms || []).map((p: any) => ({
      id: (p.type || p.name || "").toLowerCase(),
      label: p.name || p.type || "",
    }));
  }, [campaign.platforms]);

  const availableMarkets = useMemo(() => {
    const markets = new Set<string>();
    const splits = campaign.market_splits as Record<string, any> | undefined;
    if (splits) {
      for (const [, platformMarkets] of Object.entries(splits)) {
        const arr = Array.isArray(platformMarkets) ? platformMarkets : [];
        arr.forEach((m: any) => {
          if (m.market || m.country) markets.add(m.market || m.country);
        });
      }
    }
    return Array.from(markets);
  }, [campaign.market_splits]);

  const availablePhases = useMemo(() => {
    const phases = new Set<string>();
    const splits = campaign.market_splits as Record<string, any> | undefined;
    if (splits) {
      for (const [, platformMarkets] of Object.entries(splits)) {
        const arr = Array.isArray(platformMarkets) ? platformMarkets : [];
        arr.forEach((m: any) => {
          (m.phases || []).forEach((p: any) => {
            if (p.name || p.phase) phases.add(p.name || p.phase);
          });
        });
      }
    }
    return Array.from(phases);
  }, [campaign.market_splits]);

  // Build funnel data from insights + forecast
  const funnelData = useMemo((): FunnelStageData[] => {
    const totalSpend = actualMetrics?.spend || campaign.total_budget * 0.48;
    const baseImpressions = actualMetrics?.impressions || 500000;
    const baseReach = actualMetrics?.reach || 100000;
    const baseClicks = actualMetrics?.clicks || Math.round(baseImpressions * 0.012);

    // Try to extract real event data from insights
    const platformTotals: Record<string, Record<string, number>> = {};

    if (insights && insights.length > 0) {
      for (const insight of insights) {
        const platform = (insight.platform || "").toLowerCase();

        // Filter by selected platforms
        if (selectedPlatforms.length > 0 && !selectedPlatforms.includes(platform)) {
          continue;
        }

        const metrics = insight.metrics || {};

        for (const stage of UNIFIED_FUNNEL_STAGES) {
          const eventNames =
            platform === "meta" || platform === "facebook"
              ? stage.metaEvents
              : platform === "tiktok"
              ? stage.tiktokEvents
              : platform === "google" || platform === "google_ads"
              ? stage.googleEvents
              : stage.snapchatEvents;

          const volume = extractEventVolume(metrics, eventNames, platform);
          if (!platformTotals[stage.id]) platformTotals[stage.id] = {};
          platformTotals[stage.id][platform] =
            (platformTotals[stage.id][platform] || 0) + volume;
        }
      }
    }

    // Build stages using real data or simulated conversion rates
    const conversionRates: Record<string, number> = {
      impressions: 1,
      reach: baseReach / Math.max(baseImpressions, 1),
      clicks: baseClicks / Math.max(baseImpressions, 1),
      landing_page_views: (baseClicks * 0.72) / Math.max(baseImpressions, 1),
      add_to_cart: (baseClicks * 0.15) / Math.max(baseImpressions, 1),
      initiate_checkout: (baseClicks * 0.08) / Math.max(baseImpressions, 1),
      purchase: (baseClicks * 0.035) / Math.max(baseImpressions, 1),
      lead: (baseClicks * 0.06) / Math.max(baseImpressions, 1),
    };

    const stages: FunnelStageData[] = [];
    let previousVolume = 0;

    for (const stage of UNIFIED_FUNNEL_STAGES) {
      const platformBreakdown = platformTotals[stage.id] || {};
      const totalFromPlatforms = Object.values(platformBreakdown).reduce(
        (sum, v) => sum + v,
        0
      );

      // Use real data if available, otherwise simulate
      const volume =
        totalFromPlatforms > 0
          ? totalFromPlatforms
          : Math.round(baseImpressions * (conversionRates[stage.id] || 0));

      if (volume <= 0) continue; // Skip stages with no data

      const costPerEvent = volume > 0 ? totalSpend / volume : 0;
      const dropoffRate =
        previousVolume > 0
          ? ((previousVolume - volume) / previousVolume) * 100
          : 0;
      const stickiness = previousVolume > 0 ? (volume / previousVolume) * 100 : 100;

      stages.push({
        id: stage.id,
        label: stage.label,
        volume,
        spend: totalSpend,
        costPerEvent: Math.round(costPerEvent * 100) / 100,
        dropoffRate: Math.round(dropoffRate * 10) / 10,
        stickiness: Math.round(stickiness * 10) / 10,
        platformBreakdown,
      });

      previousVolume = volume;
    }

    return stages;
  }, [campaign, insights, actualMetrics, selectedPlatforms]);

  const maxVolume = funnelData.length > 0 ? funnelData[0].volume : 1;

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleMarket = (id: string) => {
    setSelectedMarkets((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const togglePhase = (id: string) => {
    setSelectedPhases((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const hasFilters =
    selectedPlatforms.length > 0 ||
    selectedMarkets.length > 0 ||
    selectedPhases.length > 0;

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" />
              Funnel Analysis
            </CardTitle>
            <CardDescription>
              Unified standard events across all platforms — volume, dropoff &amp; cost per event
            </CardDescription>
          </div>
          {hasFilters && (
            <Badge
              variant="outline"
              className="cursor-pointer"
              onClick={() => {
                setSelectedPlatforms([]);
                setSelectedMarkets([]);
                setSelectedPhases([]);
              }}
            >
              Clear filters
            </Badge>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {availablePlatforms.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Platform:</span>
              {availablePlatforms.map((p: any) => (
                <Badge
                  key={p.id}
                  variant={selectedPlatforms.includes(p.id) ? "default" : "outline"}
                  className="cursor-pointer text-xs capitalize"
                  onClick={() => togglePlatform(p.id)}
                >
                  {p.label}
                </Badge>
              ))}
            </div>
          )}
          {availableMarkets.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Market:</span>
              {availableMarkets.map((m) => (
                <Badge
                  key={m}
                  variant={selectedMarkets.includes(m) ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => toggleMarket(m)}
                >
                  {m}
                </Badge>
              ))}
            </div>
          )}
          {availablePhases.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Phase:</span>
              {availablePhases.map((p) => (
                <Badge
                  key={p}
                  variant={selectedPhases.includes(p) ? "default" : "outline"}
                  className="cursor-pointer text-xs capitalize"
                  onClick={() => togglePhase(p)}
                >
                  {p}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {funnelData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No funnel data available for this campaign.
          </div>
        ) : (
          <div className="flex flex-col items-center gap-0 py-4">
            {funnelData.map((stage, idx) => {
              const widthPct = Math.max(
                20,
                (stage.volume / maxVolume) * 100
              );
              const stageConfig = UNIFIED_FUNNEL_STAGES.find(
                (s) => s.id === stage.id
              );
              const isLast = idx === funnelData.length - 1;

              return (
                <TooltipProvider key={stage.id}>
                  <div className="w-full flex flex-col items-center">
                    {/* Stage bar */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="relative flex items-center justify-center transition-all duration-300 hover:brightness-110 cursor-default"
                          style={{
                            width: `${widthPct}%`,
                            minHeight: "52px",
                            background: stageConfig?.color || "hsl(var(--primary))",
                            clipPath:
                              idx === 0
                                ? "polygon(2% 0%, 98% 0%, 96% 100%, 4% 100%)"
                                : isLast
                                ? "polygon(4% 0%, 96% 0%, 50% 100%, 50% 100%)"
                                : `polygon(${2 + idx * 0.5}% 0%, ${98 - idx * 0.5}% 0%, ${96 - idx * 0.5}% 100%, ${4 + idx * 0.5}% 100%)`,
                            borderRadius: idx === 0 ? "6px 6px 0 0" : isLast ? "0 0 4px 4px" : undefined,
                          }}
                        >
                          <div className="flex items-center gap-3 text-white px-4">
                            <span className="font-semibold text-sm drop-shadow-sm">
                              {stage.label}
                            </span>
                            <span className="font-bold text-base drop-shadow-sm">
                              {formatNumber(stage.volume)}
                            </span>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <div className="space-y-1.5 text-xs">
                          <p className="font-semibold">{stage.label}</p>
                          <p>Volume: {stage.volume.toLocaleString()}</p>
                          <p className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            Cost per event: ${stage.costPerEvent.toFixed(2)}
                          </p>
                          {idx > 0 && (
                            <>
                              <p className="text-destructive">
                                Dropoff: {stage.dropoffRate}%
                              </p>
                              <p className="text-green-400">
                                Stickiness: {stage.stickiness}%
                              </p>
                            </>
                          )}
                          {Object.keys(stage.platformBreakdown).length > 0 && (
                            <div className="pt-1 border-t border-border/50">
                              <p className="font-medium mb-0.5">By platform:</p>
                              {Object.entries(stage.platformBreakdown).map(
                                ([plat, vol]) => (
                                  <p key={plat} className="capitalize">
                                    {plat}: {(vol as number).toLocaleString()}
                                  </p>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>

                    {/* Dropoff indicator between stages */}
                    {!isLast && (
                      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                        <ArrowDown className="h-3 w-3" />
                        <span>
                          {funnelData[idx + 1]?.stickiness}% retained
                        </span>
                        <span className="text-destructive">
                          ({funnelData[idx + 1]?.dropoffRate}% drop)
                        </span>
                      </div>
                    )}
                  </div>
                </TooltipProvider>
              );
            })}
          </div>
        )}

        {/* Cost per event summary table */}
        {funnelData.length > 0 && (
          <div className="mt-6 border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Event</th>
                  <th className="text-right px-4 py-2 font-medium">Volume</th>
                  <th className="text-right px-4 py-2 font-medium">
                    Cost / Event
                  </th>
                  <th className="text-right px-4 py-2 font-medium">
                    Dropoff %
                  </th>
                  <th className="text-right px-4 py-2 font-medium">
                    Stickiness %
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnelData.map((stage, idx) => (
                  <tr
                    key={stage.id}
                    className="border-t border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{
                          backgroundColor:
                            UNIFIED_FUNNEL_STAGES.find((s) => s.id === stage.id)
                              ?.color || "hsl(var(--primary))",
                        }}
                      />
                      <span className="font-medium">{stage.label}</span>
                    </td>
                    <td className="text-right px-4 py-2.5 tabular-nums">
                      {formatNumber(stage.volume)}
                    </td>
                    <td className="text-right px-4 py-2.5 tabular-nums font-medium">
                      ${stage.costPerEvent.toFixed(2)}
                    </td>
                    <td className="text-right px-4 py-2.5 tabular-nums">
                      {idx === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="text-destructive">
                          {stage.dropoffRate}%
                        </span>
                      )}
                    </td>
                    <td className="text-right px-4 py-2.5 tabular-nums">
                      {idx === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400">
                          {stage.stickiness}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
