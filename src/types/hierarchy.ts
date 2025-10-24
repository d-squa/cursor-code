// Hierarchical budget structure types

export interface Campaign {
  id: string;
  name: string;
  budgetPercentage: number;
  objective?: string;
  campaignType?: string;
  optimizationGoal?: string;
  funnelStage?: string;
  targeting?: {
    locations?: string[];
    ageMin?: number;
    ageMax?: number;
    genders?: string[];
    interests?: string[];
  };
}

export interface Phase {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  budgetPercentage: number;
  campaigns: Campaign[];
  assetTypes?: string[];
  isLoyaltyPhase?: boolean;
}

export interface Market {
  id: string;
  name: string;
  budgetPercentage: number;
  phases: Phase[];
}

export interface PlatformHierarchy {
  id: string;
  name: string;
  enabled: boolean;
  budgetPercentage: number;
  markets: Market[];
}
