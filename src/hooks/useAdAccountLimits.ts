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

export function useAdAccountLimits() {
  const { tier, loading: subscriptionLoading } = useSubscription();
  const [limits, setLimits] = useState<AdAccountLimitsState>({
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
  });

  const fetchLimits = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLimits(prev => ({ ...prev, loading: false }));
        return;
      }

      const userId = session.user.id;

      // Fetch counts and swaps in parallel
      const [metaCountRes, tiktokCountRes, metaSwapsRes, tiktokSwapsRes] = await Promise.all([
        supabase.rpc('count_linked_ad_accounts', { _user_id: userId, _platform: 'meta' }),
        supabase.rpc('count_linked_ad_accounts', { _user_id: userId, _platform: 'tiktok' }),
        supabase.rpc('count_swaps_this_month', { _user_id: userId, _platform: 'meta' }),
        supabase.rpc('count_swaps_this_month', { _user_id: userId, _platform: 'tiktok' }),
      ]);

      const metaCount = metaCountRes.data ?? 0;
      const tiktokCount = tiktokCountRes.data ?? 0;
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
  }, [tier]);

  useEffect(() => {
    if (!subscriptionLoading) {
      fetchLimits();
    }
  }, [subscriptionLoading, fetchLimits]);

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
