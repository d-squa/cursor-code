import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { PlatformWithMarkets } from '@/types/mediaplan';
import { extensionMarketLockKey } from '@/utils/campaignLaunchLocks';

export interface OriginalCampaignSnapshot {
  platformIds: Set<string>;
  marketIds: Set<string>;
  phaseIds: Set<string>;
  adSetIds: Set<string>;
}

interface ExtensionModeContextValue {
  isExtensionMode: boolean;
  originalSnapshot: OriginalCampaignSnapshot | null;
  captureSnapshot: (platforms: PlatformWithMarkets[], campaignId?: string | null) => void;
  isOriginalPlatform: (platformId: string) => boolean;
  isOriginalMarket: (marketId: string) => boolean;
  isOriginalPhase: (phaseId: string) => boolean;
  isOriginalAdSet: (adSetId: string) => boolean;
  canEditItem: (itemId: string, type: 'platform' | 'market' | 'phase' | 'adset') => boolean;
  canDeleteItem: (itemId: string, type: 'platform' | 'market' | 'phase' | 'adset') => boolean;
}

const ExtensionModeContext = createContext<ExtensionModeContextValue | undefined>(undefined);

function snapshotStorageKey(campaignId: string) {
  return `actiplan-extension-snapshot:${campaignId}`;
}

function buildSnapshotFromPlatforms(platforms: PlatformWithMarkets[]): OriginalCampaignSnapshot {
  const platformIds = new Set<string>();
  const marketIds = new Set<string>();
  const phaseIds = new Set<string>();
  const adSetIds = new Set<string>();

  platforms.forEach((platform) => {
    if (platform.id) platformIds.add(platform.id);
    platform.markets.forEach((market) => {
      if (platform.id) marketIds.add(extensionMarketLockKey(platform.id, market));
      else if (market.id) marketIds.add(market.id);
      market.phases?.forEach((phase) => {
        if (phase.id) phaseIds.add(phase.id);
        phase.adSets?.forEach((adSet) => {
          if (adSet.id) adSetIds.add(adSet.id);
        });
      });
    });
  });

  return { platformIds, marketIds, phaseIds, adSetIds };
}

function persistSnapshot(campaignId: string, snapshot: OriginalCampaignSnapshot) {
  try {
    sessionStorage.setItem(
      snapshotStorageKey(campaignId),
      JSON.stringify({
        platformIds: [...snapshot.platformIds],
        marketIds: [...snapshot.marketIds],
        phaseIds: [...snapshot.phaseIds],
        adSetIds: [...snapshot.adSetIds],
      }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

function loadPersistedSnapshot(campaignId: string): OriginalCampaignSnapshot | null {
  try {
    const raw = sessionStorage.getItem(snapshotStorageKey(campaignId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      platformIds: string[];
      marketIds: string[];
      phaseIds: string[];
      adSetIds: string[];
    };
    return {
      platformIds: new Set(parsed.platformIds || []),
      marketIds: new Set(parsed.marketIds || []),
      phaseIds: new Set(parsed.phaseIds || []),
      adSetIds: new Set(parsed.adSetIds || []),
    };
  } catch {
    return null;
  }
}

interface ExtensionModeProviderProps {
  children: ReactNode;
}

export function ExtensionModeProvider({ children }: ExtensionModeProviderProps) {
  const location = useLocation();
  const [originalSnapshot, setOriginalSnapshot] = useState<OriginalCampaignSnapshot | null>(null);
  const snapshotCampaignIdRef = useRef<string | null>(null);

  const isExtensionMode = useMemo(() => {
    const urlParams = new URLSearchParams(location.search);
    return urlParams.get('mode') === 'extend';
  }, [location.search]);

  const urlCampaignId = useMemo(() => {
    const urlParams = new URLSearchParams(location.search);
    return urlParams.get('campaignId');
  }, [location.search]);

  useEffect(() => {
    if (!isExtensionMode) {
      setOriginalSnapshot(null);
      snapshotCampaignIdRef.current = null;
      return;
    }

    if (urlCampaignId && urlCampaignId !== snapshotCampaignIdRef.current) {
      const persisted = loadPersistedSnapshot(urlCampaignId);
      if (persisted) {
        setOriginalSnapshot(persisted);
        snapshotCampaignIdRef.current = urlCampaignId;
      } else {
        setOriginalSnapshot(null);
        snapshotCampaignIdRef.current = null;
      }
    }
  }, [isExtensionMode, urlCampaignId]);

  const originalSnapshotRef = useRef(originalSnapshot);
  originalSnapshotRef.current = originalSnapshot;

  const captureSnapshot = useCallback(
    (platforms: PlatformWithMarkets[], campaignId?: string | null) => {
      if (!isExtensionMode || platforms.length === 0) return;

      const cid = campaignId ?? urlCampaignId;
      if (!cid) return;

      const existing = originalSnapshotRef.current;
      if (existing && snapshotCampaignIdRef.current === cid) {
        const hasEntities = existing.platformIds.size > 0 || existing.marketIds.size > 0;
        const next = buildSnapshotFromPlatforms(platforms);
        const nextHasEntities = next.platformIds.size > 0 || next.marketIds.size > 0;
        if (hasEntities || !nextHasEntities) return;
      }

      const snapshot = buildSnapshotFromPlatforms(platforms);
      if (snapshot.platformIds.size === 0 && snapshot.marketIds.size === 0) {
        return;
      }

      snapshotCampaignIdRef.current = cid;
      setOriginalSnapshot(snapshot);
      persistSnapshot(cid, snapshot);
    },
    [isExtensionMode, urlCampaignId],
  );

  const isOriginalPlatform = useCallback(
    (platformId: string) => (platformId ? (originalSnapshot?.platformIds.has(platformId) ?? false) : false),
    [originalSnapshot],
  );

  const isOriginalMarket = useCallback(
    (marketId: string) => (marketId ? (originalSnapshot?.marketIds.has(marketId) ?? false) : false),
    [originalSnapshot],
  );

  const isOriginalPhase = useCallback(
    (phaseId: string) => (phaseId ? (originalSnapshot?.phaseIds.has(phaseId) ?? false) : false),
    [originalSnapshot],
  );

  const isOriginalAdSet = useCallback(
    (adSetId: string) => (adSetId ? (originalSnapshot?.adSetIds.has(adSetId) ?? false) : false),
    [originalSnapshot],
  );

  const canEditItem = useCallback(
    (itemId: string, type: 'platform' | 'market' | 'phase' | 'adset') => {
      if (!isExtensionMode) return true;

      switch (type) {
        case 'platform':
          return !isOriginalPlatform(itemId);
        case 'market':
          return !isOriginalMarket(itemId);
        case 'phase':
          return !isOriginalPhase(itemId);
        case 'adset':
          return !isOriginalAdSet(itemId);
        default:
          return true;
      }
    },
    [isExtensionMode, isOriginalPlatform, isOriginalMarket, isOriginalPhase, isOriginalAdSet],
  );

  const canDeleteItem = useCallback(
    (itemId: string, type: 'platform' | 'market' | 'phase' | 'adset') => {
      if (!isExtensionMode) return true;

      switch (type) {
        case 'platform':
          return !isOriginalPlatform(itemId);
        case 'market':
          return !isOriginalMarket(itemId);
        case 'phase':
          return !isOriginalPhase(itemId);
        case 'adset':
          return !isOriginalAdSet(itemId);
        default:
          return true;
      }
    },
    [isExtensionMode, isOriginalPlatform, isOriginalMarket, isOriginalPhase, isOriginalAdSet],
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

  return <ExtensionModeContext.Provider value={value}>{children}</ExtensionModeContext.Provider>;
}

export function useExtensionMode() {
  const context = useContext(ExtensionModeContext);
  if (!context) {
    throw new Error('useExtensionMode must be used within an ExtensionModeProvider');
  }
  return context;
}

export function useExtensionModeOptional() {
  const context = useContext(ExtensionModeContext);
  return (
    context ?? {
      isExtensionMode: false,
      originalSnapshot: null,
      captureSnapshot: () => {},
      isOriginalPlatform: () => false,
      isOriginalMarket: () => false,
      isOriginalPhase: () => false,
      isOriginalAdSet: () => false,
      canEditItem: () => true,
      canDeleteItem: () => true,
    }
  );
}
