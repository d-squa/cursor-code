import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Tracks which registered section element is closest to the vertical center
 * of the scroll container (or window). Suppresses updates briefly during
 * programmatic scrolls to prevent feedback loops / flicker.
 */
export function useActiveSection(
  sectionIds: string[],
  options?: {
    /** Scrollable container; defaults to window */
    rootRef?: React.RefObject<HTMLElement>;
    /** Suppression window after programmatic scroll (ms) */
    suppressMs?: number;
  }
) {
  const { rootRef, suppressMs = 700 } = options || {};
  const [activeId, setActiveId] = useState<string | null>(sectionIds[0] ?? null);
  const suppressedUntil = useRef(0);
  const rafId = useRef<number | null>(null);

  const compute = useCallback(() => {
    if (Date.now() < suppressedUntil.current) return;
    const root = rootRef?.current ?? null;
    const viewportTop = root ? root.getBoundingClientRect().top : 0;
    const viewportHeight = root ? root.clientHeight : window.innerHeight;
    const center = viewportTop + viewportHeight / 2;

    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      // Skip fully out-of-view sections
      if (rect.bottom < viewportTop || rect.top > viewportTop + viewportHeight) continue;
      const sectionCenter = rect.top + rect.height / 2;
      const dist = Math.abs(sectionCenter - center);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
    if (bestId && bestId !== activeId) setActiveId(bestId);
  }, [sectionIds, rootRef, activeId]);

  useEffect(() => {
    const onScroll = () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(compute);
    };
    const target: HTMLElement | Window = rootRef?.current ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // Initial pass after layout settles
    const t = setTimeout(compute, 50);
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId.current) cancelAnimationFrame(rafId.current);
      clearTimeout(t);
    };
  }, [compute, rootRef]);

  const scrollToSection = useCallback(
    (id: string, opts?: { offset?: number }) => {
      const el = document.getElementById(id);
      if (!el) return;
      suppressedUntil.current = Date.now() + suppressMs;
      setActiveId(id);
      const offset = opts?.offset ?? 80;
      const root = rootRef?.current;
      if (root) {
        const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - offset;
        root.scrollTo({ top, behavior: "smooth" });
      } else {
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: "smooth" });
      }
    },
    [rootRef, suppressMs]
  );

  return { activeId, setActiveId, scrollToSection };
}
