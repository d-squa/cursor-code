import { useMemo } from "react";
import { Layers, Globe, FolderTree, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MultiTreeNav, type TreeSection, type TreeNode } from "@/components/navigation/MultiTreeNav";
import type {
  AdSetStatus,
  CreativeAssignmentItem,
} from "./LaunchProgressTracker";

interface QCNavItem {
  platform: string;
  market: string | null;
  phase_name: string | null;
}

interface LaunchTrackerNavProps {
  adSetStatuses: AdSetStatus[];
  creativeAssignments: CreativeAssignmentItem[];
  qcItems?: QCNavItem[];
  onNavigate?: (sectionKey: "shell" | "creatives" | "qc") => void;
  /** Called when a tree row at any depth is clicked. Lets the host expand
   * the matching tree path inside the corresponding card. */
  onNavigateNode?: (payload: {
    section: "shell" | "creatives" | "qc";
    level: "platform" | "market" | "phase";
    platform: string;
    market?: string;
    phase?: string;
  }) => void;
}

/**
 * Floating mini-map navigation for the Launch Status tracker.
 * Builds Platform > Market > Phase trees from ad set, creative, and QC data,
 * scrolls to the matching anchor when clicked, and tracks the active
 * section based on viewport center.
 */
export function LaunchTrackerNav({
  adSetStatuses,
  creativeAssignments,
  qcItems = [],
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
        targetId: "nav-section-shell",
        children: Array.from(markets.entries()).map(([market, phases]) => ({
          id: `nav-shell-market-${platform}-${market}`,
          label: market,
          icon: <Globe className="h-3 w-3" />,
          targetId: "nav-section-shell",
          children: Array.from(phases).map((phase) => ({
            id: `nav-shell-phase-${platform}-${market}-${phase}`,
            label: phase,
            icon: <FolderTree className="h-3 w-3" />,
            targetId: "nav-section-shell",
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

    // ---- Step 3: Quality Check ----
    const qcByPlatform = new Map<string, Map<string, Map<string, number>>>();
    for (const item of qcItems) {
      const platform = item.platform || "unknown";
      const market = item.market || "—";
      const phase = item.phase_name || "default";
      if (!qcByPlatform.has(platform)) qcByPlatform.set(platform, new Map());
      const markets = qcByPlatform.get(platform)!;
      if (!markets.has(market)) markets.set(market, new Map());
      const phases = markets.get(market)!;
      phases.set(phase, (phases.get(phase) ?? 0) + 1);
    }

    const qcNodes: TreeNode[] = Array.from(qcByPlatform.entries()).map(
      ([platform, markets]) => ({
        id: `nav-qc-platform-${platform}`,
        label: platform,
        icon: <Layers className="h-3 w-3" />,
        targetId: "nav-section-qc",
        children: Array.from(markets.entries()).map(([market, phases]) => ({
          id: `nav-qc-market-${platform}-${market}`,
          label: market,
          icon: <Globe className="h-3 w-3" />,
          targetId: "nav-section-qc",
          children: Array.from(phases.entries()).map(([phase, count]) => ({
            id: `nav-qc-phase-${platform}-${market}-${phase}`,
            label: phase,
            icon: <CheckCircle2 className="h-3 w-3" />,
            targetId: "nav-section-qc",
            badge: (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {count}
              </Badge>
            ),
          })),
        })),
      })
    );

    if (qcNodes.length > 0) {
      result.push({
        id: "nav-section-qc",
        label: "Quality Check",
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        nodes: qcNodes,
      });
    }

    return result;
  }, [adSetStatuses, creativeAssignments, qcItems]);

  if (sections.length === 0) return null;

  return (
    <div
      onClickCapture={(e) => {
        // Open the matching parent collapsible when navigating
        const target = e.target as HTMLElement;
        const button = target.closest("button");
        if (!button) return;
        // Match against the label span so the badge text doesn't confuse matching
        const labelEl = button.querySelector(".truncate") as HTMLElement | null;
        const text = (labelEl?.textContent ?? button.textContent ?? "").toLowerCase();

        // Section-level clicks
        if (text.includes("campaigns shell")) onNavigate?.("shell");
        if (text.includes("meshed creatives")) onNavigate?.("creatives");
        if (text.includes("quality check")) onNavigate?.("qc");

        // Child-row clicks: walk up to find the section so the right card opens
        const buttonId = button.id || "";
        if (buttonId.startsWith("nav-shell")) onNavigate?.("shell");
        else if (buttonId.startsWith("nav-creatives")) onNavigate?.("creatives");
        else if (buttonId.startsWith("nav-qc")) onNavigate?.("qc");
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
