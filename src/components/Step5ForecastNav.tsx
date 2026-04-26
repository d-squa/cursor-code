import { useMemo } from "react";
import { Layers, Globe, FolderTree } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MultiTreeNav, type TreeSection, type TreeNode } from "@/components/navigation/MultiTreeNav";

interface ForecastPhase {
  phaseName: string;
  budget?: number;
}
interface ForecastMarket {
  marketName: string;
  budget?: number;
  phases?: ForecastPhase[];
}
interface ForecastPlatform {
  platformId: string;
  platformName: string;
  totalBudget?: number;
  markets: ForecastMarket[];
}
interface Step5ForecastNavProps {
  actiplanForecast:
    | { totalBudget?: number; platforms: ForecastPlatform[] }
    | null;
}

/**
 * Floating mini-map navigation for Step 5: Campaign Forecast.
 * Mirrors the deliverables hierarchy Platform > Market > Phase using anchors:
 *   step5-platform-{platformId}
 *   step5-market-{platformId}-{marketName}
 *   step5-phase-{platformId}-{marketName}-{phaseName}
 *
 * Each node shows a combined badge: `<parent%> · <total%>↑`
 *   - parent% = share within its immediate parent
 *   - total%  = share of the overall campaign budget (cumulative)
 */
export function Step5ForecastNav({ actiplanForecast }: Step5ForecastNavProps) {
  const sections = useMemo<TreeSection[]>(() => {
    const platforms = actiplanForecast?.platforms ?? [];
    if (platforms.length === 0) return [];

    const totalBudget =
      actiplanForecast?.totalBudget ??
      platforms.reduce((sum, p) => sum + (p.totalBudget ?? 0), 0);

    const pct = (numerator?: number, denominator?: number) => {
      if (
        numerator == null ||
        denominator == null ||
        !Number.isFinite(numerator) ||
        !Number.isFinite(denominator) ||
        denominator <= 0
      )
        return null;
      return Math.round((numerator / denominator) * 100);
    };

    const renderBadge = (parentPct: number | null, totalPct: number | null) => {
      if (parentPct == null && totalPct == null) return undefined;
      return (
        <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal gap-0.5">
          {parentPct != null && <span>{parentPct}%</span>}
          {parentPct != null && totalPct != null && (
            <span className="text-muted-foreground">·</span>
          )}
          {totalPct != null && (
            <span className="text-muted-foreground">{totalPct}%↑</span>
          )}
        </Badge>
      );
    };

    const nodes: TreeNode[] = platforms.map((platform) => {
      const platformTotalPct = pct(platform.totalBudget, totalBudget);

      return {
        id: `step5-platform-${platform.platformId}`,
        label: platform.platformName || platform.platformId,
        icon: <Layers className="h-3 w-3" />,
        defaultExpanded: true,
        // For platforms, parent% == total% (parent IS total) — show once
        badge: renderBadge(platformTotalPct, null),
        children: platform.markets.map((market) => {
          const marketParentPct = pct(market.budget, platform.totalBudget);
          const marketTotalPct = pct(market.budget, totalBudget);

          return {
            id: `step5-market-${platform.platformId}-${market.marketName}`,
            label: market.marketName,
            icon: <Globe className="h-3 w-3" />,
            badge: renderBadge(marketParentPct, marketTotalPct),
            children: (market.phases || []).map((phase) => {
              const phaseParentPct = pct(phase.budget, market.budget);
              const phaseTotalPct = pct(phase.budget, totalBudget);

              return {
                id: `step5-phase-${platform.platformId}-${market.marketName}-${phase.phaseName}`,
                label: phase.phaseName,
                icon: <FolderTree className="h-3 w-3" />,
                badge: renderBadge(phaseParentPct, phaseTotalPct),
              };
            }),
          };
        }),
      };
    });

    return [
      {
        id: nodes[0].id,
        label: "Forecast by Platform",
        icon: <Layers className="h-3.5 w-3.5" />,
        nodes,
      },
    ];
  }, [actiplanForecast]);

  if (sections.length === 0) return null;

  const dispatch = (detail: Record<string, unknown>) => {
    window.dispatchEvent(new CustomEvent("step5:navigate", { detail }));
  };

  return (
    <div
      onClickCapture={(e) => {
        const target = e.target as HTMLElement;
        const button = target.closest("button");
        if (!button) return;
        // Use the label span (first .truncate) so the badge text doesn't confuse matching
        const labelEl = button.querySelector(".truncate") as HTMLElement | null;
        const text = (labelEl?.textContent ?? button.textContent ?? "").trim();
        const platforms = actiplanForecast?.platforms ?? [];
        for (const p of platforms) {
          if (text === (p.platformName || p.platformId)) {
            dispatch({
              platformId: p.platformId,
              anchorId: `step5-platform-${p.platformId}`,
            });
            return;
          }
          for (const m of p.markets) {
            if (text === m.marketName) {
              dispatch({
                platformId: p.platformId,
                marketName: m.marketName,
                anchorId: `step5-market-${p.platformId}-${m.marketName}`,
              });
              return;
            }
            for (const phase of m.phases || []) {
              if (text === phase.phaseName) {
                dispatch({
                  platformId: p.platformId,
                  marketName: m.marketName,
                  anchorId: `step5-phase-${p.platformId}-${m.marketName}-${phase.phaseName}`,
                });
                return;
              }
            }
          }
        }
      }}
    >
      <MultiTreeNav
        sections={sections}
        title="Forecast Outline"
        position="left"
        topOffset={120}
        storageKey="step5-forecast-nav-collapsed"
      />
    </div>
  );
}
