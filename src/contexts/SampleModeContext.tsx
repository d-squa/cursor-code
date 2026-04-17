import React, { createContext, useContext, useCallback } from "react";
import { toast } from "sonner";
import { useTourDataContext } from "@/contexts/TourDataContext";

interface SampleModeContextValue {
  /** True when sample tour data is currently being shown (read-only mode). */
  isSampleMode: boolean;
  /** True if seeded at all (whether visible or not). */
  isSeeded: boolean;
  /**
   * Call before any mutation. Returns true if the action should proceed,
   * false (and shows toast) if blocked by sample mode.
   */
  guardWrite: (actionLabel?: string) => boolean;
}

const SampleModeContext = createContext<SampleModeContextValue | null>(null);

export function SampleModeProvider({ children }: { children: React.ReactNode }) {
  const { isSeeded, isVisible } = useTourDataContext();
  const isSampleMode = isSeeded && isVisible;

  const guardWrite = useCallback(
    (actionLabel?: string) => {
      if (isSampleMode) {
        toast.warning(
          actionLabel
            ? `${actionLabel} is disabled in Sample Mode`
            : "Sample Mode is read-only",
          {
            description:
              "Turn off Sample Tour Data in Settings to make changes to your real account.",
          }
        );
        return false;
      }
      return true;
    },
    [isSampleMode]
  );

  return (
    <SampleModeContext.Provider value={{ isSampleMode, isSeeded, guardWrite }}>
      {children}
    </SampleModeContext.Provider>
  );
}

export function useSampleMode() {
  const ctx = useContext(SampleModeContext);
  if (!ctx) {
    // Safe defaults if used outside provider
    return {
      isSampleMode: false,
      isSeeded: false,
      guardWrite: () => true,
    } as SampleModeContextValue;
  }
  return ctx;
}
