import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlatformWithMarkets } from "@/types/mediaplan";
import { supabase } from "@/integrations/supabase/client";
import {
  applyLockedBudgetSnapshots,
  buildLaunchLockScopeForPlan,
  isMarketBudgetLocked,
  hasDspLivePlanLocks,
  isPhaseBudgetLocked,
  isPhaseConfigLocked,
  isPlatformBudgetLocked,
  marketLockKey,
  type LaunchLockScope,
  type LaunchStatusRow,
} from "@/utils/campaignLaunchLocks";

const EMPTY_SCOPE: LaunchLockScope = {
  lockedPlatformIds: new Set(),
  lockedMarketKeys: new Set(),
  lockedPhaseKeys: new Set(),
  hasPartialPush: false,
};

export function useCampaignLaunchLocks(
  campaignId: string | undefined,
  platforms: PlatformWithMarkets[],
) {
  const [entries, setEntries] = useState<LaunchStatusRow[]>([]);
  const [loading, setLoading] = useState(Boolean(campaignId));
  const reloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!campaignId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("campaign_launch_status")
        .select("platform, market, phase_name, status, entity_type")
        .eq("campaign_id", campaignId);

      if (error) throw error;
      setEntries((data as LaunchStatusRow[]) || []);
    } catch (err) {
      console.error("Failed to load campaign launch locks:", err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!campaignId) return;

    const channel = supabase
      .channel(`campaign-launch-locks-${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campaign_launch_status",
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          if (reloadTimeoutRef.current !== null) {
            clearTimeout(reloadTimeoutRef.current);
          }
          reloadTimeoutRef.current = setTimeout(() => {
            reloadTimeoutRef.current = null;
            void load();
          }, 200);
        },
      )
      .subscribe();

    return () => {
      if (reloadTimeoutRef.current !== null) {
        clearTimeout(reloadTimeoutRef.current);
      }
      void supabase.removeChannel(channel);
    };
  }, [campaignId, load]);

  const scope = useMemo(
    () => (entries.length > 0 ? buildLaunchLockScopeForPlan(entries, platforms) : EMPTY_SCOPE),
    [entries, platforms],
  );

  const frozenBudgetSnapshots = useMemo(() => {
    const platformPctById: Record<string, number> = {};
    const marketPctByKey: Record<string, number> = {};

    for (const platform of platforms) {
      if (!platform.id) continue;
      if (isPlatformBudgetLocked(platform.id, platform.markets, scope)) {
        platformPctById[platform.id] = platform.budgetPercentage;
      }
      for (const market of platform.markets || []) {
        if (isMarketBudgetLocked(platform.id, market.name, scope)) {
          platformPctById[platform.id] = platform.budgetPercentage;
          marketPctByKey[marketLockKey(platform.id, market.name)] = market.budgetPercentage;
        }
      }
    }

    return { platformPctById, marketPctByKey };
  }, [platforms, scope]);

  const applyFrozenBudgets = useCallback(
    (next: PlatformWithMarkets[]) =>
      applyLockedBudgetSnapshots(next, scope, frozenBudgetSnapshots.platformPctById, frozenBudgetSnapshots.marketPctByKey),
    [scope, frozenBudgetSnapshots],
  );

  return {
    loading,
    scope,
    hasPartialPush: scope.hasPartialPush,
    lockedPlatformIds: scope.lockedPlatformIds,
    lockedMarketKeys: scope.lockedMarketKeys,
    reload: load,
    isPlatformBudgetLocked: (platformId: string, markets = platforms.find((p) => p.id === platformId)?.markets || []) =>
      isPlatformBudgetLocked(platformId, markets, scope),
    isMarketBudgetLocked: (platformId: string, marketName: string) =>
      isMarketBudgetLocked(platformId, marketName, scope),
    isPhaseBudgetLocked: (platformId: string, marketName: string, phaseName: string) =>
      isPhaseBudgetLocked(platformId, marketName, phaseName, scope),
    isPhaseConfigLocked: (platformId: string, marketName: string, phaseName: string) =>
      isPhaseConfigLocked(platformId, marketName, phaseName, scope),
    isUnifiedTargetingLocked: hasDspLivePlanLocks(scope),
    applyFrozenBudgets,
  };
}
