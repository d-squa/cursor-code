import { useMemo } from "react";
import { Layers, Globe, FolderTree, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MultiTreeNav, type TreeSection, type TreeNode } from "@/components/navigation/MultiTreeNav";
import type {
  AdSetStatus,
  CreativeAssignmentItem,
} from "./LaunchProgressTracker";

interface LaunchTrackerNavProps {
  adSetStatuses: AdSetStatus[];
  creativeAssignments: CreativeAssignmentItem[];
  onNavigate?: (sectionKey: "shell" | "creatives") => void;
}

/**
 * Floating mini-map navigation for the Launch Status tracker.
 * Builds Platform > Market > Phase trees from ad set + creative data,
 * scrolls to the matching anchor when clicked, and tracks the active
 * section based on viewport center.
 */
export function LaunchTrackerNav({
  adSetStatuses,
  creativeAssignments,
  onNavigate,
}: LaunchTrackerNavProps) {
  const sections = useMemo<TreeSection[]>(() => {
    const result: TreeSection[] = [];

    // ---- Step 1: Campaigns Shell ----
    const shellByPlatform = new Map<string, Map<string, Set<string>>>();
    for (const s of adSetStatuses) {
      if (!shellByPlatform.has(s.platform)) shellByPlatform.set(s.platform, new Map());
      const markets = shellByPlatform.get(s.platform)!;
      if (!markets.has(s.market)) markets.set(s.market, new Set());
      markets.get(s.market)!.add(s.phaseName || "default");
    }

    const shellNodes: TreeNode[] = Array.from(shellByPlatform.entries()).map(
      ([platform, markets]) => ({
        id: `nav-shell-platform-${platform}`,
        label: platform,
        icon: <Layers className="h-3 w-3" />,
        defaultExpanded: true,
        children: Array.from(markets.entries()).map(([market, phases]) => ({
          id: `nav-shell-market-${platform}-${market}`,
          label: market,
          icon: <Globe className="h-3 w-3" />,
          children: Array.from(phases).map((phase) => ({
            id: `nav-shell-market-${platform}-${market}`,
            label: phase,
            icon: <FolderTree className="h-3 w-3" />,
            // Phase doesn't have its own DOM anchor — scroll to its market.
            targetId: `nav-shell-market-${platform}-${market}`,
          })),
        })),
      })
    );

    if (shellNodes.length > 0) {
      result.push({
        id: "nav-section-shell",
        label: "Campaigns Shell",
        icon: <Layers className="h-3.5 w-3.5" />,
        nodes: shellNodes,
      });
    }

    // ---- Step 2: Meshed Creatives ----
    const creativesByPlatform = new Map<string, Map<string, Map<string, number>>>();
    for (const c of creativeAssignments) {
      if (!creativesByPlatform.has(c.platform))
        creativesByPlatform.set(c.platform, new Map());
      const markets = creativesByPlatform.get(c.platform)!;
      if (!markets.has(c.market)) markets.set(c.market, new Map());
      const phases = markets.get(c.market)!;
      const k = c.phaseName || "default";
      phases.set(k, (phases.get(k) ?? 0) + 1);
    }

    const creativeNodes: TreeNode[] = Array.from(creativesByPlatform.entries()).map(
      ([platform, markets]) => ({
        id: `nav-creatives-platform-${platform}`,
        label: platform,
        icon: <Layers className="h-3 w-3" />,
        // Creatives tree doesn't have per-platform anchors yet — scroll to section.
        targetId: "nav-section-creatives",
        children: Array.from(markets.entries()).map(([market, phases]) => ({
          id: `nav-creatives-market-${platform}-${market}`,
          label: market,
          icon: <Globe className="h-3 w-3" />,
          targetId: "nav-section-creatives",
          children: Array.from(phases.entries()).map(([phase, count]) => ({
            id: `nav-creatives-phase-${platform}-${market}-${phase}`,
            label: phase,
            icon: <ImageIcon className="h-3 w-3" />,
            targetId: "nav-section-creatives",
            badge: (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {count}
              </Badge>
            ),
          })),
        })),
      })
    );

    if (creativeNodes.length > 0) {
      result.push({
        id: "nav-section-creatives",
        label: "Meshed Creatives",
        icon: <ImageIcon className="h-3.5 w-3.5" />,
        nodes: creativeNodes,
      });
    }

    return result;
  }, [adSetStatuses, creativeAssignments]);

  if (sections.length === 0) return null;

  return (
    <div
      onClickCapture={(e) => {
        // Open the matching parent collapsible when navigating
        const target = e.target as HTMLElement;
        const button = target.closest("button");
        if (!button) return;
        const text = button.textContent?.toLowerCase() ?? "";
        if (text.includes("campaigns shell")) onNavigate?.("shell");
        if (text.includes("meshed creatives")) onNavigate?.("creatives");
      }}
    >
      <MultiTreeNav
        sections={sections}
        title="Outline"
        position="left"
        topOffset={96}
        storageKey="launch-tracker-nav-collapsed"
      />
    </div>
  );
}
