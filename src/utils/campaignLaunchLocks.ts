import type { Market, PlatformWithMarkets } from "@/types/mediaplan";
import { detectPlatformType } from "@/utils/objectiveOptimizationMapping";

export const LAUNCH_LOCKED_STATUSES = ["pushed_to_dsp", "live"] as const;

export type LaunchStatusRow = {
  platform: string;
  market: string;
  phase_name?: string | null;
  status: string;
  entity_type?: string | null;
};

export type LaunchLockScope = {
  lockedPlatformIds: Set<string>;
  lockedMarketKeys: Set<string>;
  lockedPhaseKeys: Set<string>;
  hasPartialPush: boolean;
};

export function isLaunchStatusLocked(status: string): boolean {
  return (LAUNCH_LOCKED_STATUSES as readonly string[]).includes(status);
}

export function marketLockKey(platformId: string, marketName: string): string {
  return `${platformId}::${marketName}`;
}

export function phaseLockKey(platformId: string, marketName: string, phaseName: string): string {
  return `${platformId}::${marketName}::${phaseName}`;
}

export function resolveLaunchPlatformId(platformLabel: string): string | null {
  return detectPlatformType(platformLabel);
}

export function buildLaunchLockScope(entries: LaunchStatusRow[]): LaunchLockScope {
  const lockedMarketKeys = new Set<string>();
  const lockedPhaseKeys = new Set<string>();
  let hasLocked = false;
  let hasUnlocked = false;

  for (const entry of entries) {
    const platformId = resolveLaunchPlatformId(entry.platform);
    if (!platformId) continue;

    if (isLaunchStatusLocked(entry.status)) {
      hasLocked = true;
      lockedMarketKeys.add(marketLockKey(platformId, entry.market));
      if (entry.phase_name) {
        lockedPhaseKeys.add(phaseLockKey(platformId, entry.market, entry.phase_name));
      }
    } else if (
      ["push_failed", "validation_error", "ready_for_push", "pending_validation", "pushing"].includes(
        entry.status,
      )
    ) {
      hasUnlocked = true;
    }
  }

  return {
    lockedPlatformIds: new Set<string>(),
    lockedMarketKeys,
    lockedPhaseKeys,
    hasPartialPush: hasLocked && hasUnlocked,
  };
}

/** Platform row locked when every configured market on that platform is live in the DSP. */
export function resolveLockedPlatformIds(
  platforms: PlatformWithMarkets[],
  lockedMarketKeys: Set<string>,
): Set<string> {
  const lockedPlatformIds = new Set<string>();

  for (const platform of platforms) {
    if (!platform.id) continue;
    const markets = platform.markets || [];
    if (markets.length === 0) continue;

    const allMarketsLocked = markets.every((market) =>
      lockedMarketKeys.has(marketLockKey(platform.id, market.name)),
    );
    if (allMarketsLocked) {
      lockedPlatformIds.add(platform.id);
    }
  }

  return lockedPlatformIds;
}

export function buildLaunchLockScopeForPlan(
  entries: LaunchStatusRow[],
  platforms: PlatformWithMarkets[],
): LaunchLockScope {
  const base = buildLaunchLockScope(entries);
  const lockedPlatformIds = resolveLockedPlatformIds(platforms, base.lockedMarketKeys);
  return { ...base, lockedPlatformIds };
}

export function isPlatformBudgetLocked(
  platformId: string,
  markets: Market[],
  scope: LaunchLockScope,
): boolean {
  if (!platformId) return false;
  if (scope.lockedPlatformIds.has(platformId)) return true;
  if (markets.length === 0) return false;
  return markets.every((market) => scope.lockedMarketKeys.has(marketLockKey(platformId, market.name)));
}

export function isMarketBudgetLocked(platformId: string, marketName: string, scope: LaunchLockScope): boolean {
  if (!platformId) return false;
  return scope.lockedMarketKeys.has(marketLockKey(platformId, marketName));
}

export function isPhaseBudgetLocked(
  platformId: string,
  marketName: string,
  phaseName: string,
  scope: LaunchLockScope,
): boolean {
  if (!platformId || !phaseName) return false;
  return scope.lockedPhaseKeys.has(phaseLockKey(platformId, marketName, phaseName));
}

/** Re-apply frozen budget % for DSP-live slices so autosave cannot drift plan numbers. */
/** Platforms/markets still editable for €50 validation (excludes DSP-live slices). */
export function filterPlatformsForBudgetValidation(
  platforms: PlatformWithMarkets[],
  scope: LaunchLockScope,
): PlatformWithMarkets[] {
  return platforms
    .filter((platform) => !isPlatformBudgetLocked(platform.id, platform.markets, scope))
    .map((platform) => ({
      ...platform,
      markets: (platform.markets || []).filter(
        (market) => !isMarketBudgetLocked(platform.id, market.name, scope),
      ),
    }))
    .filter((platform) => (platform.markets?.length ?? 0) > 0);
}

export function applyLockedBudgetSnapshots(
  platforms: PlatformWithMarkets[],
  scope: LaunchLockScope,
  platformPctById: Record<string, number>,
  marketPctByKey: Record<string, number>,
): PlatformWithMarkets[] {
  return platforms.map((platform) => {
    if (!platform.id) return platform;

    const platformPct = platformPctById[platform.id];
    const nextPlatform =
      platformPct !== undefined && isPlatformBudgetLocked(platform.id, platform.markets, scope)
        ? { ...platform, budgetPercentage: platformPct }
        : platform;

    const markets = (nextPlatform.markets || []).map((market) => {
      const key = marketLockKey(platform.id, market.name);
      const frozen = marketPctByKey[key];
      if (frozen !== undefined && isMarketBudgetLocked(platform.id, market.name, scope)) {
        return { ...market, budgetPercentage: frozen };
      }
      return market;
    });

    return { ...nextPlatform, markets };
  });
}
