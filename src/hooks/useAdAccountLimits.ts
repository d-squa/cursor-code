import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { 
  SubscriptionTier, 
  AD_ACCOUNT_LIMITS, 
  SWAP_LIMITS 
} from "@/config/subscriptionTiers";

// Re-export for convenience
export { AD_ACCOUNT_LIMITS, SWAP_LIMITS };

// Helper to calculate next billing cycle reset date
export function getNextBillingReset(subscriptionStart: string | null): Date {
  if (!subscriptionStart) {
    // Fallback to calendar month (1st of next month)
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }
  
  const anchorDate = new Date(subscriptionStart);
  const anchorDay = anchorDate.getUTCDate();
  const now = new Date();
  
  // Calculate the anchor date in the current month
  let currentMonthAnchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), anchorDay));
  
  // Handle months with fewer days
  const daysInCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  if (anchorDay > daysInCurrentMonth) {
    currentMonthAnchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), daysInCurrentMonth));
  }
  
  // If we're past the anchor day this month, the next reset is next month
  if (now >= currentMonthAnchor) {
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, anchorDay));
    const daysInNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0)).getUTCDate();
    if (anchorDay > daysInNextMonth) {
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, daysInNextMonth));
    }
    return nextMonth;
  }
  
  return currentMonthAnchor;
}

// Check if tier can have multiple ad accounts per platform
export function canHaveMultipleAccounts(tier: SubscriptionTier): boolean {
  return AD_ACCOUNT_LIMITS[tier] > 1;
}

export interface AdAccountLimitsState {
  meta: {
    currentCount: number;
    maxAllowed: number;
    swapsUsed: number;
    swapsAllowed: number;
    canAddMore: boolean;
    canSwap: boolean;
  };
  tiktok: {
    currentCount: number;
    maxAllowed: number;
    swapsUsed: number;
    swapsAllowed: number;
    canAddMore: boolean;
    canSwap: boolean;
  };
  loading: boolean;
  tier: SubscriptionTier;
}

export function useAdAccountLimits(teamId?: string | null) {
  const { tier, loading: subscriptionLoading, subscriptionStart } = useSubscription();
  const [limits, setLimits] = useState<AdAccountLimitsState>(() => ({
    meta: {
      currentCount: 0,
      maxAllowed: AD_ACCOUNT_LIMITS[tier],
      swapsUsed: 0,
      swapsAllowed: SWAP_LIMITS[tier],
      canAddMore: true,
      canSwap: true,
    },
    tiktok: {
      currentCount: 0,
      maxAllowed: AD_ACCOUNT_LIMITS[tier],
      swapsUsed: 0,
      swapsAllowed: SWAP_LIMITS[tier],
      canAddMore: true,
      canSwap: true,
    },
    loading: true,
    tier,
  }));

  // Update tier-dependent values when tier changes
  useEffect(() => {
    setLimits(prev => ({
      ...prev,
      tier,
      meta: {
        ...prev.meta,
        maxAllowed: AD_ACCOUNT_LIMITS[tier],
        swapsAllowed: SWAP_LIMITS[tier],
        canAddMore: prev.meta.currentCount < AD_ACCOUNT_LIMITS[tier],
        canSwap: prev.meta.swapsUsed < SWAP_LIMITS[tier],
      },
      tiktok: {
        ...prev.tiktok,
        maxAllowed: AD_ACCOUNT_LIMITS[tier],
        swapsAllowed: SWAP_LIMITS[tier],
        canAddMore: prev.tiktok.currentCount < AD_ACCOUNT_LIMITS[tier],
        canSwap: prev.tiktok.swapsUsed < SWAP_LIMITS[tier],
      },
    }));
  }, [tier]);

  const fetchLimits = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLimits(prev => ({ ...prev, loading: false }));
        return;
      }

      // If no teamId provided, we can't scope properly - use user_id as fallback
      // This happens during initial load before workspace is resolved
      if (!teamId) {
        setLimits(prev => ({ ...prev, loading: false }));
        return;
      }

      // Count real (non-sample) ad accounts — matches subscription slots; tour/demo rows use is_sample=true
      const [metaCountRes, tiktokCountRes, metaSwapsRes, tiktokSwapsRes] = await Promise.all([
        supabase
          .from('meta_ad_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('team_id', teamId)
          .eq('is_sample', false),
        supabase
          .from('tiktok_ad_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('team_id', teamId)
          .eq('is_sample', false),
        // Use billing-cycle-scoped swap counting
        supabase.rpc('count_swaps_in_billing_period', { 
          _user_id: session.user.id, 
          _platform: 'meta',
          _team_id: teamId,
          _billing_anchor_date: subscriptionStart || null
        }),
        supabase.rpc('count_swaps_in_billing_period', { 
          _user_id: session.user.id, 
          _platform: 'tiktok',
          _team_id: teamId,
          _billing_anchor_date: subscriptionStart || null
        }),
      ]);

      // IMPORTANT: don’t silently treat RLS/query errors as “0 used”, or limits won’t enforce.
      if (metaCountRes.error) throw metaCountRes.error;
      if (tiktokCountRes.error) throw tiktokCountRes.error;
      if (metaSwapsRes.error) throw metaSwapsRes.error;
      if (tiktokSwapsRes.error) throw tiktokSwapsRes.error;

      const metaCount = metaCountRes.count ?? 0;
      const tiktokCount = tiktokCountRes.count ?? 0;
      const metaSwaps = metaSwapsRes.data ?? 0;
      const tiktokSwaps = tiktokSwapsRes.data ?? 0;

      const maxAllowed = AD_ACCOUNT_LIMITS[tier];
      const swapsAllowed = SWAP_LIMITS[tier];

      setLimits({
        meta: {
          currentCount: metaCount,
          maxAllowed,
          swapsUsed: metaSwaps,
          swapsAllowed,
          canAddMore: metaCount < maxAllowed,
          canSwap: metaSwaps < swapsAllowed,
        },
        tiktok: {
          currentCount: tiktokCount,
          maxAllowed,
          swapsUsed: tiktokSwaps,
          swapsAllowed,
          canAddMore: tiktokCount < maxAllowed,
          canSwap: tiktokSwaps < swapsAllowed,
        },
        loading: false,
        tier,
      });
    } catch (error) {
      console.error("Error fetching ad account limits:", error);
      setLimits(prev => ({ ...prev, loading: false }));
    }
  }, [tier, teamId, subscriptionStart]);

  useEffect(() => {
    if (!subscriptionLoading && teamId) {
      fetchLimits();
    }
  }, [subscriptionLoading, teamId, fetchLimits]);

  // Log a swap event
  const logSwap = useCallback(async (
    platform: 'meta' | 'tiktok',
    previousAccountId: string,
    newAccountId: string,
    swapType: 'swap' | 'initial' | 'reconnect' | 'oauth_refresh' = 'swap'
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;

      const { error } = await supabase
        .from('ad_account_swap_logs')
        .insert({
          user_id: session.user.id,
          platform,
          previous_account_id: previousAccountId,
          new_account_id: newAccountId,
          swap_type: swapType,
        });

      if (error) throw error;
      
      // Refresh limits after logging
      await fetchLimits();
      return true;
    } catch (error) {
      console.error("Error logging swap:", error);
      return false;
    }
  }, [fetchLimits]);

  // Check if an account change would be a swap (vs initial connection or reconnect)
  const wouldBeSwap = useCallback((
    platform: 'meta' | 'tiktok',
    newAccountId: string,
    existingAccountIds: string[]
  ): { isSwap: boolean; previousAccountId?: string } => {
    // If this account already exists, it's a reconnect
    if (existingAccountIds.includes(newAccountId)) {
      return { isSwap: false };
    }

    // If there are no existing accounts, it's an initial connection
    if (existingAccountIds.length === 0) {
      return { isSwap: false };
    }

    // If we're at limit and adding a new account, it's a swap
    const maxAllowed = AD_ACCOUNT_LIMITS[tier];
    if (existingAccountIds.length >= maxAllowed) {
      // The first account would be swapped out
      return { isSwap: true, previousAccountId: existingAccountIds[0] };
    }

    // Otherwise, it's just adding a new account (not at limit)
    return { isSwap: false };
  }, [tier]);

  return {
    ...limits,
    refetch: fetchLimits,
    logSwap,
    wouldBeSwap,
    canHaveMultipleAccounts: canHaveMultipleAccounts(tier),
  };
}
