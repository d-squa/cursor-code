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
 */
export function Step3StrategyNav({
  platforms,
  onNavigatePlatform,
  onNavigateMarket,
}: Step3StrategyNavProps) {
  const sections = useMemo<TreeSection[]>(() => {
    const enabled = platforms.filter((p) => p.enabled && p.markets.length > 0);

    const nodes: TreeNode[] = enabled.map((platform) => ({
      id: `step3-platform-${platform.id}`,
      label: platform.name || platform.id,
      icon: <Layers className="h-3 w-3" />,
      defaultExpanded: true,
      children: platform.markets.map((market) => ({
        id: `step3-market-${market.id}`,
        label: market.name || "Market",
        icon: <Globe className="h-3 w-3" />,
        children: (market.phases || []).map((phase) => ({
          id: `step3-phase-${phase.id}`,
          label: phase.name || "Phase",
          icon: <FolderTree className="h-3 w-3" />,
          badge: phase.budgetPercentage != null ? (
            <Badge variant="outline" className="h-4 px-1 text-[10px]">
              {phase.budgetPercentage.toFixed(0)}%
            </Badge>
          ) : undefined,
        })),
      })),
    }));

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
