import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingDown, ArrowDown, DollarSign } from "lucide-react";

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
    label: "Clicks",
    metaEvents: ["link_clicks", "clicks", "landing_page_views"],
    tiktokEvents: ["clicks", "view_content", "ViewContent"],
    googleEvents: ["clicks", "landing_page_views"],
    snapchatEvents: ["swipe_ups", "clicks", "page_views"],
    color: "hsl(200, 65%, 50%)",
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
    id: "results",
    label: "Results",
    metaEvents: ["purchase", "offsite_conversion.fb_pixel_purchase", "complete_registration", "lead", "offsite_conversion.fb_pixel_lead", "submit_form"],
    tiktokEvents: ["CompletePayment", "complete_payment", "PlaceAnOrder", "SubmitForm", "submit_form"],
    googleEvents: ["conversions", "purchase", "submit_lead_form"],
    snapchatEvents: ["purchase", "sign_up"],
    color: "hsl(145, 60%, 42%)",
  },
];

// Click sub-categories for the horizontal split
const CLICK_SUB_CATEGORIES = [
  {
    id: "link_clicks",
    label: "Link Clicks",
    metaEvents: ["link_clicks"],
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
    color: "hsl(200, 50%, 38%)",
  },
];

interface ClickSubBreakdown {
  linkClicks: number;
  landingPageViews: number;
}

interface FunnelStageData {
  id: string;
  label: string;
  volume: number;
  spend: number;
  costPerEvent: number;
  dropoffRate: number;
  stickiness: number;
  platformBreakdown: Record<string, number>;
  clickSubBreakdown?: ClickSubBreakdown;
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

/** Sum ALL matching event volumes from metrics (not just the first match) */
function extractEventVolumeSum(
  metrics: any,
  eventNames: string[],
): number {
  if (!metrics) return 0;
  let total = 0;
  const counted = new Set<string>();

  // Check direct metric fields
  for (const name of eventNames) {
    if (typeof metrics[name] === "number" && metrics[name] > 0 && !counted.has(name)) {
      total += metrics[name];
      counted.add(name);
    }
  }

  // Check actions array (Meta format) — only add if not already counted from direct fields
  if (Array.isArray(metrics.actions)) {
    for (const action of metrics.actions) {
      if (eventNames.includes(action.action_type) && !counted.has(action.action_type)) {
        total += parseInt(action.value || "0");
        counted.add(action.action_type);
      }
    }
  }

  return total;
}

/** Extract a single event volume (first match) for sub-category breakdown */
function extractSingleEventVolume(
  metrics: any,
  eventNames: string[],
): number {
  if (!metrics) return 0;

  for (const name of eventNames) {
    if (typeof metrics[name] === "number" && metrics[name] > 0) {
      return metrics[name];
    }
  }

  if (Array.isArray(metrics.actions)) {
    for (const action of metrics.actions) {
      if (eventNames.includes(action.action_type)) {
        return parseInt(action.value || "0");
      }
    }
  }

  return 0;
}

function getPlatformEventNames(stage: typeof UNIFIED_FUNNEL_STAGES[0], platform: string) {
  return platform === "meta" || platform === "facebook"
    ? stage.metaEvents
    : platform === "tiktok"
    ? stage.tiktokEvents
    : platform === "google" || platform === "google_ads"
    ? stage.googleEvents
    : stage.snapchatEvents;
}

function getClickSubEventNames(sub: typeof CLICK_SUB_CATEGORIES[0], platform: string) {
  return platform === "meta" || platform === "facebook"
    ? sub.metaEvents
    : platform === "tiktok"
    ? sub.tiktokEvents
    : platform === "google" || platform === "google_ads"
    ? sub.googleEvents
    : sub.snapchatEvents;
}

export default function FunnelAnalysisChart({
  campaign,
  insights,
  actualMetrics,
}: FunnelAnalysisChartProps) {

  const funnelData = useMemo((): FunnelStageData[] => {
    const totalSpend = actualMetrics?.spend || campaign.total_budget * 0.48;
    const baseImpressions = actualMetrics?.impressions || 500000;
    const baseReach = actualMetrics?.reach || 100000;
    const baseClicks = actualMetrics?.clicks || Math.round(baseImpressions * 0.012);

    const platformTotals: Record<string, Record<string, number>> = {};
    const clickSubTotals: ClickSubBreakdown = { linkClicks: 0, landingPageViews: 0 };

    if (insights && insights.length > 0) {
      for (const insight of insights) {
        const platform = (insight.platform || "").toLowerCase();
        const metrics = insight.metrics || {};

        for (const stage of UNIFIED_FUNNEL_STAGES) {
          const eventNames = getPlatformEventNames(stage, platform);
          const volume = extractEventVolumeSum(metrics, eventNames);
          if (!platformTotals[stage.id]) platformTotals[stage.id] = {};
          platformTotals[stage.id][platform] =
            (platformTotals[stage.id][platform] || 0) + volume;
        }

        // Extract click sub-categories
        for (const sub of CLICK_SUB_CATEGORIES) {
          const subEventNames = getClickSubEventNames(sub, platform);
          const subVol = extractSingleEventVolume(metrics, subEventNames);
          if (sub.id === "link_clicks") {
            clickSubTotals.linkClicks += subVol;
          } else {
            clickSubTotals.landingPageViews += subVol;
          }
        }
      }
    }

    const conversionRates: Record<string, number> = {
      impressions: 1,
      reach: baseReach / Math.max(baseImpressions, 1),
      clicks: baseClicks / Math.max(baseImpressions, 1),
      add_to_cart: (baseClicks * 0.15) / Math.max(baseImpressions, 1),
      initiate_checkout: (baseClicks * 0.08) / Math.max(baseImpressions, 1),
      results: (baseClicks * 0.05) / Math.max(baseImpressions, 1),
    };

    const stages: FunnelStageData[] = [];
    let previousVolume = 0;

    for (const stage of UNIFIED_FUNNEL_STAGES) {
      const platformBreakdown = platformTotals[stage.id] || {};
      const totalFromPlatforms = Object.values(platformBreakdown).reduce(
        (sum, v) => sum + v,
        0
      );

      const volume =
        totalFromPlatforms > 0
          ? totalFromPlatforms
          : Math.round(baseImpressions * (conversionRates[stage.id] || 0));

      if (volume <= 0) continue;

      const costPerEvent = volume > 0 ? totalSpend / volume : 0;
      const dropoffRate =
        previousVolume > 0
          ? ((previousVolume - volume) / previousVolume) * 100
          : 0;
      const stickiness = previousVolume > 0 ? (volume / previousVolume) * 100 : 100;

      // For clicks stage, add sub-breakdown
      let clickSubBreakdown: ClickSubBreakdown | undefined;
      if (stage.id === "clicks") {
        const hasRealClickSubs = clickSubTotals.linkClicks > 0 || clickSubTotals.landingPageViews > 0;
        if (hasRealClickSubs) {
          clickSubBreakdown = clickSubTotals;
        } else {
          // Simulate: 60% link clicks, 40% LPV
          clickSubBreakdown = {
            linkClicks: Math.round(volume * 0.6),
            landingPageViews: Math.round(volume * 0.4),
          };
        }
      }

      stages.push({
        id: stage.id,
        label: stage.label,
        volume,
        spend: totalSpend,
        costPerEvent: Math.round(costPerEvent * 100) / 100,
        dropoffRate: Math.round(dropoffRate * 10) / 10,
        stickiness: Math.round(stickiness * 10) / 10,
        platformBreakdown,
        clickSubBreakdown,
      });

      previousVolume = volume;
    }

    return stages;
  }, [campaign, insights, actualMetrics]);

  const maxVolume = funnelData.length > 0 ? funnelData[0].volume : 1;

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Funnel Analysis
          </CardTitle>
          <CardDescription>
            Unified standard events across all platforms — volume, dropoff &amp; cost per event
          </CardDescription>
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
              const isClicks = stage.id === "clicks" && stage.clickSubBreakdown;

              return (
                <TooltipProvider key={stage.id}>
                  <div className="w-full flex flex-col items-center">
                    {/* Stage bar */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="relative flex items-center justify-center transition-all duration-300 hover:brightness-110 cursor-default overflow-hidden"
                          style={{
                            width: `${widthPct}%`,
                            minHeight: "52px",
                            background: isClicks ? "transparent" : (stageConfig?.color || "hsl(var(--primary))"),
                            clipPath:
                              idx === 0
                                ? "polygon(2% 0%, 98% 0%, 96% 100%, 4% 100%)"
                                : isLast
                                ? "polygon(4% 0%, 96% 0%, 50% 100%, 50% 100%)"
                                : `polygon(${2 + idx * 0.5}% 0%, ${98 - idx * 0.5}% 0%, ${96 - idx * 0.5}% 100%, ${4 + idx * 0.5}% 100%)`,
                            borderRadius: idx === 0 ? "6px 6px 0 0" : isLast ? "0 0 4px 4px" : undefined,
                          }}
                        >
                          {/* Click sub-segments shown as horizontal split */}
                          {isClicks && stage.clickSubBreakdown ? (
                            <ClickSubSegments
                              breakdown={stage.clickSubBreakdown}
                              totalVolume={stage.volume}
                              formatNumber={formatNumber}
                            />
                          ) : (
                            <div className="flex items-center gap-3 text-white px-4">
                              <span className="font-semibold text-sm drop-shadow-sm">
                                {stage.label}
                              </span>
                              <span className="font-bold text-base drop-shadow-sm">
                                {formatNumber(stage.volume)}
                              </span>
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <div className="space-y-1.5 text-xs">
                          <p className="font-semibold">{stage.label}: {stage.volume.toLocaleString()}</p>
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
                          {stage.clickSubBreakdown && (
                            <div className="pt-1 border-t border-border/50">
                              <p className="font-medium mb-0.5">Click breakdown:</p>
                              <p>Link Clicks: {stage.clickSubBreakdown.linkClicks.toLocaleString()}</p>
                              <p>Landing Page Views: {stage.clickSubBreakdown.landingPageViews.toLocaleString()}</p>
                            </div>
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
                  <>
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
                    {/* Click sub-rows */}
                    {stage.clickSubBreakdown && (
                      <>
                        <tr key={`${stage.id}-lc`} className="border-t border-border/30 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-1.5 pl-10 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: "hsl(200, 65%, 50%)" }} />
                            <span className="text-xs text-muted-foreground">Link Clicks</span>
                          </td>
                          <td className="text-right px-4 py-1.5 tabular-nums text-xs text-muted-foreground">
                            {formatNumber(stage.clickSubBreakdown.linkClicks)}
                          </td>
                          <td className="text-right px-4 py-1.5 tabular-nums text-xs text-muted-foreground">
                            ${stage.clickSubBreakdown.linkClicks > 0 ? (stage.spend / stage.clickSubBreakdown.linkClicks).toFixed(2) : "—"}
                          </td>
                          <td colSpan={2} />
                        </tr>
                        <tr key={`${stage.id}-lpv`} className="border-t border-border/30 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-1.5 pl-10 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: "hsl(200, 50%, 38%)" }} />
                            <span className="text-xs text-muted-foreground">Landing Page Views</span>
                          </td>
                          <td className="text-right px-4 py-1.5 tabular-nums text-xs text-muted-foreground">
                            {formatNumber(stage.clickSubBreakdown.landingPageViews)}
                          </td>
                          <td className="text-right px-4 py-1.5 tabular-nums text-xs text-muted-foreground">
                            ${stage.clickSubBreakdown.landingPageViews > 0 ? (stage.spend / stage.clickSubBreakdown.landingPageViews).toFixed(2) : "—"}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Horizontal split within the Clicks funnel bar */
function ClickSubSegments({
  breakdown,
  totalVolume,
  formatNumber,
}: {
  breakdown: ClickSubBreakdown;
  totalVolume: number;
  formatNumber: (n: number) => string;
}) {
  const lcPct = totalVolume > 0 ? (breakdown.linkClicks / totalVolume) * 100 : 50;
  const lpvPct = 100 - lcPct;

  return (
    <div className="absolute inset-0 flex">
      <div
        className="flex items-center justify-center"
        style={{
          width: `${lcPct}%`,
          backgroundColor: "hsl(200, 65%, 50%)",
        }}
      >
        <div className="flex flex-col items-center text-white px-1">
          <span className="text-[10px] font-medium drop-shadow-sm whitespace-nowrap">Link Clicks</span>
          <span className="font-bold text-xs drop-shadow-sm">{formatNumber(breakdown.linkClicks)}</span>
        </div>
      </div>
      <div
        className="flex items-center justify-center border-l border-white/30"
        style={{
          width: `${lpvPct}%`,
          backgroundColor: "hsl(200, 50%, 38%)",
        }}
      >
        <div className="flex flex-col items-center text-white px-1">
          <span className="text-[10px] font-medium drop-shadow-sm whitespace-nowrap">LPV</span>
          <span className="font-bold text-xs drop-shadow-sm">{formatNumber(breakdown.landingPageViews)}</span>
        </div>
      </div>
    </div>
  );
}
