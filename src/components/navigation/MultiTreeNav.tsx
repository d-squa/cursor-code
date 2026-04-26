import { useMemo, useState, useCallback, useEffect } from "react";
import { ChevronRight, PanelRightClose, PanelLeftClose } from "lucide-react";
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
}

function NodeRow({
  node,
  depth,
  onNavigate,
  activeTargetId,
}: {
  node: TreeNode;
  depth: number;
  onNavigate: (targetId: string) => void;
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
        onClick={() => {
          if (hasChildren) setOpen((o) => !o);
          onNavigate(target);
        }}
        className={cn(
          "group w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors",
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
        <span className="truncate flex-1">{node.label}</span>
        {node.badge}
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
}: MultiTreeNavProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (!storageKey || typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey) === "1";
  });

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
  }, [collapsed, storageKey]);

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

  return (
    <aside
      style={{ top: topOffset, maxHeight: `calc(100vh - ${topOffset + 24}px)` }}
      className={cn(
        "fixed z-30 hidden lg:flex flex-col",
        "bg-background/80 backdrop-blur-md border border-border rounded-xl shadow-lg",
        "transition-all duration-200",
        collapsed ? "w-10" : "w-64",
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
        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-2">
            {sections.map((section) => {
              const isActive = activeId === section.id;
              return (
                <div key={section.id} className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => scrollToSection(section.id)}
                    className={cn(
                      "w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-semibold transition-all",
                      "hover:bg-muted/60",
                      isActive
                        ? "bg-primary/10 text-primary border-l-2 border-primary"
                        : "text-foreground border-l-2 border-transparent"
                    )}
                  >
                    {section.icon && (
                      <span className="text-muted-foreground">{section.icon}</span>
                    )}
                    <span className="truncate">{section.label}</span>
                  </button>
                  <div className="space-y-0.5">
                    {section.nodes.map((node) => (
                      <NodeRow
                        key={node.id}
                        node={node}
                        depth={0}
                        onNavigate={handleNavigate}
                        activeTargetId={activeId}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}
