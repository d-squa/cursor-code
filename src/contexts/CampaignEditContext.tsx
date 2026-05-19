import { createContext, useContext, type ReactNode } from "react";

type CampaignEditContextValue = {
  canEdit: boolean;
  isViewer: boolean;
  loading: boolean;
};

const CampaignEditContext = createContext<CampaignEditContextValue>({
  canEdit: true,
  isViewer: false,
  loading: false,
});

export function CampaignEditProvider({
  value,
  children,
}: {
  value: CampaignEditContextValue;
  children: ReactNode;
}) {
  return <CampaignEditContext.Provider value={value}>{children}</CampaignEditContext.Provider>;
}

export function useCampaignEditContext() {
  return useContext(CampaignEditContext);
}
