import { useMemo } from "react";
import { Layers, Globe, FolderTree } from "lucide-react";
import { MultiTreeNav, type TreeSection, type TreeNode } from "@/components/navigation/MultiTreeNav";

interface ForecastPhase {
  phaseName: string;
}
interface ForecastMarket {
  marketName: string;
  phases?: ForecastPhase[];
}
interface ForecastPlatform {
  platformId: string;
  platformName: string;
  markets: ForecastMarket[];
}
interface Step5ForecastNavProps {
  actiplanForecast: { platforms: ForecastPlatform[] } | null;
}

/**
 * Floating mini-map navigation for Step 5: Campaign Forecast.
 * Mirrors the deliverables hierarchy Platform > Market > Phase using anchors:
 *   step5-platform-{platformId}
 *   step5-market-{platformId}-{marketName}
 *   step5-phase-{platformId}-{marketName}-{phaseName}
 *
 * Clicking dispatches `step5:navigate` so ActiplanDeliverablesView opens parents
 * and scrolls to the target after layout settles.
 */
export function Step5ForecastNav({ actiplanForecast }: Step5ForecastNavProps) {
  const sections = useMemo<TreeSection[]>(() => {
    const platforms = actiplanForecast?.platforms ?? [];
    if (platforms.length === 0) return [];

    const nodes: TreeNode[] = platforms.map((platform) => ({
      id: `step5-platform-${platform.platformId}`,
      label: platform.platformName || platform.platformId,
      icon: <Layers className="h-3 w-3" />,
      defaultExpanded: true,
      children: platform.markets.map((market) => ({
        id: `step5-market-${platform.platformId}-${market.marketName}`,
        label: market.marketName,
        icon: <Globe className="h-3 w-3" />,
        children: (market.phases || []).map((phase) => ({
          id: `step5-phase-${platform.platformId}-${market.marketName}-${phase.phaseName}`,
          label: phase.phaseName,
          icon: <FolderTree className="h-3 w-3" />,
        })),
      })),
    }));

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
        const text = (button.textContent ?? "").trim();
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
