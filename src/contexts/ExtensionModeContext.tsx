import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { PlatformWithMarkets } from '@/types/mediaplan';

export interface OriginalCampaignSnapshot {
  platformIds: Set<string>;
  marketIds: Set<string>;
  phaseIds: Set<string>;
  adSetIds: Set<string>;
}

interface ExtensionModeContextValue {
  isExtensionMode: boolean;
  originalSnapshot: OriginalCampaignSnapshot | null;
  captureSnapshot: (platforms: PlatformWithMarkets[]) => void;
  isOriginalPlatform: (platformId: string) => boolean;
  isOriginalMarket: (marketId: string) => boolean;
  isOriginalPhase: (phaseId: string) => boolean;
  isOriginalAdSet: (adSetId: string) => boolean;
  canEditItem: (itemId: string, type: 'platform' | 'market' | 'phase' | 'adset') => boolean;
  canDeleteItem: (itemId: string, type: 'platform' | 'market' | 'phase' | 'adset') => boolean;
}

const ExtensionModeContext = createContext<ExtensionModeContextValue | undefined>(undefined);

interface ExtensionModeProviderProps {
  children: ReactNode;
}

export function ExtensionModeProvider({ children }: ExtensionModeProviderProps) {
  const location = useLocation();
  const [originalSnapshot, setOriginalSnapshot] = useState<OriginalCampaignSnapshot | null>(null);

  // Check if we're in extension mode from URL
  const isExtensionMode = useMemo(() => {
    const urlParams = new URLSearchParams(location.search);
    return urlParams.get('mode') === 'extend';
  }, [location.search]);

  // Reset snapshot when leaving extension mode
  useEffect(() => {
    if (!isExtensionMode) {
      setOriginalSnapshot(null);
    }
  }, [isExtensionMode]);

  // Capture snapshot from platforms - call this once when campaign is loaded in extension mode
  const captureSnapshot = useCallback((platforms: PlatformWithMarkets[]) => {
    console.log('📸 captureSnapshot called', { 
      isExtensionMode, 
      hasExistingSnapshot: !!originalSnapshot,
      platformCount: platforms.length 
    });
    
    if (!isExtensionMode) {
      console.log('📸 Skipping snapshot - not in extension mode');
      return;
    }
    
    if (originalSnapshot) {
      console.log('📸 Skipping snapshot - already captured');
      return;
    }
    
    if (platforms.length === 0) {
      console.log('📸 Skipping snapshot - no platforms provided');
      return;
    }

    const platformIds = new Set<string>();
    const marketIds = new Set<string>();
    const phaseIds = new Set<string>();
    const adSetIds = new Set<string>();

    platforms.forEach((platform) => {
      platformIds.add(platform.id);
      platform.markets.forEach((market) => {
        marketIds.add(market.id);
        market.phases?.forEach((phase) => {
          phaseIds.add(phase.id);
          phase.adSets?.forEach((adSet) => {
            adSetIds.add(adSet.id);
          });
        });
      });
    });

    console.log('📸 Extension mode: Captured original campaign snapshot', {
      platforms: Array.from(platformIds),
      markets: Array.from(marketIds),
      phases: Array.from(phaseIds),
      adSets: adSetIds.size,
    });

    setOriginalSnapshot({ platformIds, marketIds, phaseIds, adSetIds });
  }, [isExtensionMode, originalSnapshot]);

  // Check functions
  const isOriginalPlatform = useCallback(
    (platformId: string) => originalSnapshot?.platformIds.has(platformId) ?? false,
    [originalSnapshot]
  );

  const isOriginalMarket = useCallback(
    (marketId: string) => originalSnapshot?.marketIds.has(marketId) ?? false,
    [originalSnapshot]
  );

  const isOriginalPhase = useCallback(
    (phaseId: string) => originalSnapshot?.phaseIds.has(phaseId) ?? false,
    [originalSnapshot]
  );

  const isOriginalAdSet = useCallback(
    (adSetId: string) => originalSnapshot?.adSetIds.has(adSetId) ?? false,
    [originalSnapshot]
  );

  // Permission functions - in extension mode, original items cannot be edited/deleted
  const canEditItem = useCallback(
    (itemId: string, type: 'platform' | 'market' | 'phase' | 'adset') => {
      if (!isExtensionMode) return true;
      
      let isOriginal = false;
      switch (type) {
        case 'platform':
          isOriginal = isOriginalPlatform(itemId);
          break;
        case 'market':
          isOriginal = isOriginalMarket(itemId);
          break;
        case 'phase':
          isOriginal = isOriginalPhase(itemId);
          break;
        case 'adset':
          isOriginal = isOriginalAdSet(itemId);
          break;
      }
      
      console.log(`🔒 canEditItem(${itemId}, ${type}):`, { isOriginal, canEdit: !isOriginal });
      return !isOriginal;
    },
    [isExtensionMode, isOriginalPlatform, isOriginalMarket, isOriginalPhase, isOriginalAdSet]
  );

  const canDeleteItem = useCallback(
    (itemId: string, type: 'platform' | 'market' | 'phase' | 'adset') => {
      if (!isExtensionMode) return true;
      
      let isOriginal = false;
      switch (type) {
        case 'platform':
          isOriginal = isOriginalPlatform(itemId);
          break;
        case 'market':
          isOriginal = isOriginalMarket(itemId);
          break;
        case 'phase':
          isOriginal = isOriginalPhase(itemId);
          break;
        case 'adset':
          isOriginal = isOriginalAdSet(itemId);
          break;
      }
      
      console.log(`🔒 canDeleteItem(${itemId}, ${type}):`, { isOriginal, canDelete: !isOriginal });
      return !isOriginal;
    },
    [isExtensionMode, isOriginalPlatform, isOriginalMarket, isOriginalPhase, isOriginalAdSet]
  );

  const value: ExtensionModeContextValue = {
    isExtensionMode,
    originalSnapshot,
    captureSnapshot,
    isOriginalPlatform,
    isOriginalMarket,
    isOriginalPhase,
    isOriginalAdSet,
    canEditItem,
    canDeleteItem,
  };

  return (
    <ExtensionModeContext.Provider value={value}>
      {children}
    </ExtensionModeContext.Provider>
  );
}

export function useExtensionMode() {
  const context = useContext(ExtensionModeContext);
  if (!context) {
    throw new Error('useExtensionMode must be used within an ExtensionModeProvider');
  }
  return context;
}

// Optional hook that doesn't throw if context is missing (for components that may be used outside provider)
export function useExtensionModeOptional() {
  const context = useContext(ExtensionModeContext);
  return context ?? {
    isExtensionMode: false,
    originalSnapshot: null,
    captureSnapshot: () => {},
    isOriginalPlatform: () => false,
    isOriginalMarket: () => false,
    isOriginalPhase: () => false,
    isOriginalAdSet: () => false,
    canEditItem: () => true,
    canDeleteItem: () => true,
  };
}
