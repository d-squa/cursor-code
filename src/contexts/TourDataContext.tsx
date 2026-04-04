import React, { createContext, useContext } from "react";
import { useTourData, TourDataState } from "@/hooks/useTourData";

interface TourDataContextValue extends TourDataState {
  seedTourData: () => Promise<string | null>;
  toggleVisibility: (visible: boolean) => Promise<void>;
  resetTour: () => void;
  refreshState: () => Promise<void>;
}

const TourDataContext = createContext<TourDataContextValue | null>(null);

export function TourDataProvider({ children }: { children: React.ReactNode }) {
  const tourData = useTourData();
  return (
    <TourDataContext.Provider value={tourData}>
      {children}
    </TourDataContext.Provider>
  );
}

export function useTourDataContext() {
  const ctx = useContext(TourDataContext);
  if (!ctx) throw new Error("useTourDataContext must be used within TourDataProvider");
  return ctx;
}
