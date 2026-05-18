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

/** Stable key for extension-mode market locks when market.id is missing. */
export function extensionMarketLockKey(
  platformId: string,
  market: { id?: string; name: string },
): string {
  return market.id || marketLockKey(platformId, market.name);
}

export function phaseLockKey(platformId: string, marketName: string, phaseName: string): string {
  return `${platformId}::${marketName}::${phaseName}`;
}

export function resolveLaunchPlatformId(platformLabel: string): string | null {
  return detectPlatformType(platformLabel);
}

/** Plan builder may use google vs google_ads; launch rows use display names — match all aliases. */
export function planPlatformIdVariants(platformId: string): string[] {
  const lower = platformId.toLowerCase();
  if (lower === "google" || lower === "google_ads") return ["google", "google_ads"];
  return [platformId];
}

function registerPlatformMarketLock(
  lockedMarketKeys: Set<string>,
  platformId: string,
  marketName: string,
): void {
  if (!marketName) return;
  for (const id of planPlatformIdVariants(platformId)) {
    lockedMarketKeys.add(marketLockKey(id, marketName));
  }
}

function registerPhaseLock(
  lockedPhaseKeys: Set<string>,
  platformId: string,
  marketName: string,
  phaseName: string,
): void {
  if (!marketName || !phaseName) return;
  for (const id of planPlatformIdVariants(platformId)) {
    lockedPhaseKeys.add(phaseLockKey(id, marketName, phaseName));
  }
}

function hasMarketLockKey(scope: LaunchLockScope, platformId: string, marketName: string): boolean {
  return planPlatformIdVariants(platformId).some((id) =>
    scope.lockedMarketKeys.has(marketLockKey(id, marketName)),
  );
}

function hasPhaseLockKey(
  scope: LaunchLockScope,
  platformId: string,
  marketName: string,
  phaseName: string,
): boolean {
  return planPlatformIdVariants(platformId).some((id) =>
    scope.lockedPhaseKeys.has(phaseLockKey(id, marketName, phaseName)),
  );
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
      registerPlatformMarketLock(lockedMarketKeys, platformId, entry.market);
      if (entry.phase_name) {
        registerPhaseLock(lockedPhaseKeys, platformId, entry.market, entry.phase_name);
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

/** Platform row locked when any market on that platform is live (platform % shifts live EUR). */
export function resolveLockedPlatformIds(
  platforms: PlatformWithMarkets[],
  lockedMarketKeys: Set<string>,
): Set<string> {
  const lockedPlatformIds = new Set<string>();
  const scope: LaunchLockScope = {
    lockedPlatformIds,
    lockedMarketKeys,
    lockedPhaseKeys: new Set(),
    hasPartialPush: false,
  };

  for (const platform of platforms) {
    if (!platform.id) continue;
    const hasLockedMarket = (platform.markets || []).some((market) =>
      hasMarketLockKey(scope, platform.id, market.name),
    );
    if (hasLockedMarket) {
      for (const id of planPlatformIdVariants(platform.id)) {
        lockedPlatformIds.add(id);
      }
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
  if (planPlatformIdVariants(platformId).some((id) => scope.lockedPlatformIds.has(id))) {
    return true;
  }
  return (markets || []).some((market) => isMarketBudgetLocked(platformId, market.name, scope));
}

export function isMarketBudgetLocked(platformId: string, marketName: string, scope: LaunchLockScope): boolean {
  if (!platformId || !marketName) return false;
  return hasMarketLockKey(scope, platformId, marketName);
}

export function isPhaseBudgetLocked(
  platformId: string,
  marketName: string,
  phaseName: string,
  scope: LaunchLockScope,
): boolean {
  return isPhaseConfigLocked(platformId, marketName, phaseName, scope);
}

/** Phase or its whole market is live in the DSP — no edits (use per-phase override on unpublished phases only). */
export function isPhaseConfigLocked(
  platformId: string,
  marketName: string,
  phaseName: string,
  scope: LaunchLockScope,
): boolean {
  if (!platformId) return false;
  if (isMarketBudgetLocked(platformId, marketName, scope)) return true;
  if (phaseName && hasPhaseLockKey(scope, platformId, marketName, phaseName)) {
    return true;
  }
  return false;
}

export function hasDspLivePlanLocks(scope: LaunchLockScope): boolean {
  return scope.lockedMarketKeys.size > 0 || scope.lockedPhaseKeys.size > 0;
}

/** €50 validation runs only on unpublished markets (DSP-live slices excluded). */
export function filterPlatformsForBudgetValidation(
  platforms: PlatformWithMarkets[],
  scope: LaunchLockScope,
): PlatformWithMarkets[] {
  return platforms
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
