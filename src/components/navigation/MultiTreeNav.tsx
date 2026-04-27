import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { ChevronRight, ChevronDown, PanelRightClose, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActiveSection } from "@/hooks/useActiveSection";

export interface TreeNode {
  id: string;
  label: string;
  /** Optional DOM id to scroll to when clicked. Defaults to node id. */
  targetId?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  children?: TreeNode[];
  /** Initial expanded state */
  defaultExpanded?: boolean;
  /** Arbitrary data forwarded to onNavigate for caller-side handling */
  data?: Record<string, unknown>;
}


export interface TreeSection {
  /** DOM id of the section container in the page */
  id: string;
  label: string;
  icon?: React.ReactNode;
  nodes: TreeNode[];
}

interface MultiTreeNavProps {
  sections: TreeSection[];
  /** Optional title shown at the top of the panel */
  title?: string;
  /** Position relative to viewport */
  position?: "left" | "right";
  /** Top offset (px) — leave room for headers */
  topOffset?: number;
  /** Pass a scroll container ref if the page scrolls inside a container */
  scrollRootRef?: React.RefObject<HTMLElement>;
  className?: string;
  /** Persist collapsed state in localStorage under this key */
  storageKey?: string;
  /** Optional callback fired when a leaf or branch row is clicked */
  onNavigate?: (targetId: string, node?: TreeNode) => void;

}

function NodeRow({
  node,
  depth,
  onNavigate,
  activeTargetId,
}: {
  node: TreeNode;
  depth: number;
  onNavigate: (targetId: string, node?: TreeNode) => void;
  activeTargetId: string | null;
}) {
  const [open, setOpen] = useState(node.defaultExpanded ?? depth === 0);
  const hasChildren = !!node.children?.length;
  const target = node.targetId ?? node.id;
  const isActive = activeTargetId === target;

  return (
    <div>
      <button
        type="button"
        id={node.id}
        onClick={() => {
          if (hasChildren) setOpen((o) => !o);
          onNavigate(target, node);
        }}
        className={cn(
          "group w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 pr-2 text-left text-xs transition-colors min-w-0 overflow-hidden",
          "hover:bg-muted/60",
          isActive && "bg-primary/10 text-primary font-medium"
        )}
        style={{ paddingLeft: `${depth * 10 + 6}px` }}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform text-muted-foreground",
            !hasChildren && "opacity-0",
            open && "rotate-90"
          )}
        />
        {node.icon && <span className="shrink-0 text-muted-foreground">{node.icon}</span>}
        <span className="truncate flex-1 min-w-0">{node.label}</span>
        {node.badge && <span className="shrink-0">{node.badge}</span>}
      </button>
      {hasChildren && open && (
        <div className="mt-0.5 space-y-0.5">
          {node.children!.map((child) => (
            <NodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onNavigate={onNavigate}
              activeTargetId={activeTargetId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MultiTreeNav({
  sections,
  title = "Outline",
  position = "left",
  topOffset = 88,
  scrollRootRef,
  className,
  storageKey,
  onNavigate,
}: MultiTreeNavProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (!storageKey || typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey) === "1";
  });
  const [hovered, setHovered] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
  }, [collapsed, storageKey]);

  // Click outside the panel collapses it
  useEffect(() => {
    if (collapsed) return;
    const onPointerDown = (e: MouseEvent) => {
      const node = asideRef.current;
      if (!node) return;
      if (!node.contains(e.target as Node)) {
        setCollapsed(true);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [collapsed]);

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const { activeId, scrollToSection } = useActiveSection(sectionIds, {
    rootRef: scrollRootRef,
  });

  const handleNavigate = useCallback(
    (targetId: string) => {
      scrollToSection(targetId);
    },
    [scrollToSection]
  );

  const sideClasses =
    position === "left"
      ? "left-3"
      : "right-3";

  // When idle (expanded but not hovered), slide half of the panel off-screen on its side
  const idle = !collapsed && !hovered;
  const hiddenX =
    position === "left" ? "translateX(-50%)" : "translateX(50%)";
  const transform = `translateY(-50%) ${idle ? hiddenX : "translateX(0)"}`;

  return (
    <aside
      ref={asideRef as React.RefObject<HTMLElement>}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        top: "50%",
        transform,
        maxHeight: `calc(100vh - ${topOffset + 24}px)`,
        transition:
          "transform 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out, width 200ms ease-out",
      }}
      className={cn(
        "fixed z-30 hidden lg:flex flex-col overflow-hidden",
        "bg-background/80 backdrop-blur-md border border-border rounded-xl shadow-lg",
        collapsed ? "w-10" : "w-64",
        idle && "opacity-40",
        sideClasses,
        className
      )}
      aria-label={title}
    >
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
        {!collapsed && (
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pl-1">
            {title}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 ml-auto"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand outline" : "Collapse outline"}
          title={collapsed ? "Expand outline" : "Collapse outline"}
        >
          {collapsed ? (
            <PanelRightClose className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {!collapsed && (
        <ScrollArea className="flex-1 w-full [&>[data-radix-scroll-area-viewport]>div]:!block">
          <div className="p-1.5 space-y-2 w-full max-w-full overflow-x-hidden">
            {sections.map((section) => (
              <SectionBlock
                key={section.id}
                section={section}
                isActive={activeId === section.id}
                onSectionClick={() => scrollToSection(section.id)}
                onNavigate={handleNavigate}
                activeTargetId={activeId}
                storageKey={storageKey}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}

function SectionBlock({
  section,
  isActive,
  onSectionClick,
  onNavigate,
  activeTargetId,
  storageKey,
}: {
  section: TreeSection;
  isActive: boolean;
  onSectionClick: () => void;
  onNavigate: (targetId: string) => void;
  activeTargetId: string | null;
  storageKey?: string;
}) {
  const sectionStorageKey = storageKey ? `${storageKey}:section:${section.id}` : null;
  const [open, setOpen] = useState<boolean>(() => {
    if (!sectionStorageKey || typeof window === "undefined") return true;
    return window.localStorage.getItem(sectionStorageKey) !== "0";
  });

  useEffect(() => {
    if (!sectionStorageKey || typeof window === "undefined") return;
    window.localStorage.setItem(sectionStorageKey, open ? "1" : "0");
  }, [open, sectionStorageKey]);

  return (
    <div className="space-y-0.5 min-w-0">
      <div
        className={cn(
          "w-full flex items-center gap-1 rounded-md text-xs font-semibold transition-all min-w-0 overflow-hidden",
          isActive
            ? "bg-primary/10 text-primary border-l-2 border-primary"
            : "text-foreground border-l-2 border-transparent",
          "hover:bg-muted/60"
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Collapse section" : "Expand section"}
          className="shrink-0 p-1 rounded hover:bg-muted"
        >
          {open ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <button
          type="button"
          onClick={onSectionClick}
          className="flex-1 flex items-center gap-1.5 px-1 py-1 text-left min-w-0 overflow-hidden"
        >
          {section.icon && (
            <span className="text-muted-foreground shrink-0">{section.icon}</span>
          )}
          <span className="truncate min-w-0">{section.label}</span>
        </button>
      </div>
      {open && (
        <div className="space-y-0.5 min-w-0">
          {section.nodes.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              depth={0}
              onNavigate={onNavigate}
              activeTargetId={activeTargetId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
