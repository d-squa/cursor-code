import { useMemo } from "react";
import { Layers, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MultiTreeNav, type TreeSection, type TreeNode } from "@/components/navigation/MultiTreeNav";
import type { PlatformWithMarkets } from "@/types/mediaplan";

interface PlatformMarketNavProps {
  platforms: PlatformWithMarkets[];
  onNavigatePlatform?: (index: number) => void;
  onNavigateMarket?: (marketId: string) => void;
}

/**
 * Floating mini-map navigation for the Platform & Market Selection step.
 * Uses platform index for the platform anchor (matches the rendered key)
 * and the market UUID for the market anchor.
 */
export function PlatformMarketNav({
  platforms,
  onNavigatePlatform,
  onNavigateMarket,
}: PlatformMarketNavProps) {
  const sections = useMemo<TreeSection[]>(() => {
    const nodes: TreeNode[] = platforms.map((platform, index) => {
      const platformKey = platform.id || `idx-${index}`;
      return {
        id: `pm-platform-${platformKey}`,
        label: platform.name || platform.id || `Platform ${index + 1}`,
        icon: <Layers className="h-3 w-3" />,
        defaultExpanded: true,
        badge: (
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            {platform.budgetPercentage?.toFixed?.(0) ?? 0}%
          </Badge>
        ),
        children: (platform.markets || []).map((market) => ({
          id: `pm-market-${market.id}`,
          label: market.name || "Unnamed market",
          icon: <Globe className="h-3 w-3" />,
          badge: (
            <Badge variant="outline" className="h-4 px-1 text-[10px]">
              {market.budgetPercentage?.toFixed?.(0) ?? 0}%
            </Badge>
          ),
        })),
      };
    });

    if (nodes.length === 0) return [];

    return [
      {
        id: "pm-section-platform-market",
        label: "Platform & Market",
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
        // Find which anchor this button targets by reading visible text + structure.
        // Easiest: parse the data-* via the rendered tree — but MultiTreeNav doesn't expose ids on buttons.
        // Instead, infer from text:
        const text = button.textContent ?? "";
        platforms.forEach((p, idx) => {
          if (text.includes(p.name || p.id || `Platform ${idx + 1}`)) {
            onNavigatePlatform?.(idx);
          }
          (p.markets || []).forEach((m) => {
            if (m.name && text.includes(m.name)) {
              onNavigateMarket?.(m.id);
            }
          });
        });
      }}
    >
      <MultiTreeNav
        sections={sections}
        title="Outline"
        position="left"
        topOffset={120}
        storageKey="pm-nav-collapsed"
      />
    </div>
  );
}
