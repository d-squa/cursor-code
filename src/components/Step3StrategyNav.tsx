import { useMemo } from "react";
import { Layers, Globe, FolderTree } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MultiTreeNav, type TreeSection, type TreeNode } from "@/components/navigation/MultiTreeNav";
import type { PlatformWithMarkets } from "@/types/mediaplan";

interface Step3StrategyNavProps {
  platforms: PlatformWithMarkets[];
  onNavigatePlatform?: (platformId: string) => void;
  onNavigateMarket?: (marketId: string) => void;
}

/**
 * Floating mini-map navigation for Step 3: Strategy Configuration.
 * Lists Platform > Market > Phase using anchors `step3-platform-{id}`,
 * `step3-market-{id}`, and `step3-phase-{id}` injected on the rendered nodes.
 *
 * Each node shows a combined budget badge: `<parent%> · <total%>↑`
 *   - parent% = share within its immediate parent
 *   - total%  = share of the overall campaign budget (cumulative)
 */
export function Step3StrategyNav({
  platforms,
  onNavigatePlatform,
  onNavigateMarket,
}: Step3StrategyNavProps) {
  const sections = useMemo<TreeSection[]>(() => {
    const enabled = platforms.filter((p) => p.enabled && p.markets.length > 0);

    const fmt = (n: number | undefined | null) =>
      n == null || Number.isNaN(n) ? null : Math.round(n);

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

    const nodes: TreeNode[] = enabled.map((platform) => {
      const platformParent = fmt(platform.budgetPercentage);
      const platformTotal = platformParent; // platform parent IS total

      return {
        id: `step3-platform-${platform.id}`,
        label: platform.name || platform.id,
        icon: <Layers className="h-3 w-3" />,
        defaultExpanded: true,
        badge: renderBadge(platformParent, null),
        children: platform.markets.map((market) => {
          const marketParent = fmt(market.budgetPercentage);
          const marketTotal =
            marketParent != null && platformTotal != null
              ? Math.round((marketParent * platformTotal) / 100)
              : null;

          return {
            id: `step3-market-${market.id}`,
            label: market.name || "Market",
            icon: <Globe className="h-3 w-3" />,
            badge: renderBadge(marketParent, marketTotal),
            children: (market.phases || []).map((phase) => {
              const phaseParent = fmt(phase.budgetPercentage);
              const phaseTotal =
                phaseParent != null && marketTotal != null
                  ? Math.round((phaseParent * marketTotal) / 100)
                  : null;

              return {
                id: `step3-phase-${phase.id}`,
                label: phase.name || "Phase",
                icon: <FolderTree className="h-3 w-3" />,
                badge: renderBadge(phaseParent, phaseTotal),
              };
            }),
          };
        }),
      };
    });

    if (nodes.length === 0) return [];

    return [
      {
        id: nodes[0].id,
        label: "Strategy by Platform",
        icon: <Layers className="h-3.5 w-3.5" />,
        nodes,
      },
    ];
  }, [platforms]);

  if (sections.length === 0) return null;

  return (
    <div
      onClickCapture={(e) => {
        const target = e.target as HTMLElement;
        const button = target.closest("button");
        if (!button) return;
        const text = button.textContent ?? "";
        platforms.forEach((p) => {
          if (text.includes(p.name || p.id)) onNavigatePlatform?.(p.id);
          p.markets.forEach((m) => {
            if (m.name && text.includes(m.name)) onNavigateMarket?.(m.id);
            (m.phases || []).forEach((phase) => {
              if (phase.name && text.includes(phase.name)) {
                // Ensure parents are open so the phase anchor exists in the DOM
                onNavigatePlatform?.(p.id);
                onNavigateMarket?.(m.id);
                // Tell PhaseScheduler to open this phase
                window.dispatchEvent(
                  new CustomEvent("multitree:expand-phase", {
                    detail: { phaseId: phase.id },
                  })
                );
              }
            });
          });
        });
      }}
    >
      <MultiTreeNav
        sections={sections}
        title="Strategy Outline"
        position="left"
        topOffset={120}
        storageKey="step3-strategy-nav-collapsed"
      />
    </div>
  );
}
