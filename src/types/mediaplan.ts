export interface Market {
  id: string;
  name: string;
  budgetPercentage: number;
  phases?: Phase[];
  useGlobalFunnel?: boolean;
  adFormats?: string[];
  accountName?: string;
  page?: string;
  pixel?: string;
  catalog?: string;
  strategyFocus?: string;
}

export interface FunnelStage {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  budgetPercentage: number;
}

export interface Phase {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  budgetPercentage: number;
  campaigns?: Campaign[];
  assetTypes?: string[];
  isLoyaltyPhase?: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  budgetPercentage: number;
  objective?: string;
  funnelStage?: string;
}

export interface PlatformWithMarkets {
  id: string;
  name: string;
  enabled: boolean;
  budgetPercentage: number;
  markets: Market[];
}
