import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getTierFromPriceId,
  SubscriptionTier,
  TIER_DISPLAY_NAMES,
} from "@/config/subscriptionTiers";

interface SubscriptionStatus {
  subscribed: boolean;
  onTrial: boolean;
  productId: string | null;
  priceId: string | null;
  billingPeriod: "monthly" | "yearly" | null;
  subscriptionEnd: string | null;
  trialEnd: string | null;
  status?: string;
  subscriptionType?: "personal" | "team";
  teamId?: string;
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // NOTE: must be a ref to avoid stale closures inside onAuthStateChange callback.
  const hasCheckedOnceRef = useRef(false);

  const checkSubscription = useCallback(
    async ({ showLoading }: { showLoading?: boolean } = {}) => {
      const shouldShowLoading = showLoading ?? !hasCheckedOnceRef.current;

      try {
        if (shouldShowLoading) setLoading(true);
        setError(null);

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setSubscription(null);
          return;
        }

        const { data, error: fnError } = await supabase.functions.invoke(
          "check-subscription",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (fnError) throw fnError;
        setSubscription(data);
      } catch (err: any) {
        console.error("Error checking subscription:", err);
        setError(err?.message ?? "Failed to check subscription");

        // NEVER clear subscription on errors - keep existing data to avoid
        // unnecessary redirects during transient API failures or plan changes.
        // Only clear on explicit sign-out (handled in onAuthStateChange).
      } finally {
        hasCheckedOnceRef.current = true;
        if (shouldShowLoading) setLoading(false);
        else setLoading((v) => v); // no-op; avoids toggling UI during background refresh
      }
    },
    []
  );

  useEffect(() => {
    checkSubscription({ showLoading: true });

    // Listen for auth changes - but only SIGNED_IN should trigger a UI loading state.
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        checkSubscription({ showLoading: true });
      } else if (event === "TOKEN_REFRESHED") {
        // Silent background refresh - don't disrupt the UI
        checkSubscription({ showLoading: false });
      } else if (event === "SIGNED_OUT") {
        setSubscription(null);
        setError(null);
        setLoading(false);
        hasCheckedOnceRef.current = false;
      }
    });

    return () => authSub.unsubscribe();
  }, [checkSubscription]);

  // Derive the subscription tier from the price ID (more reliable than product ID)
  const tier: SubscriptionTier = useMemo(() => {
    if (!subscription) return "trial";
    if (!subscription.subscribed) return "trial";

    // Use priceId for tier detection - it's more reliable
    return getTierFromPriceId(subscription.priceId);
  }, [subscription]);

  const tierDisplayName = useMemo(() => {
    return TIER_DISPLAY_NAMES[tier];
  }, [tier]);

  return {
    subscription,
    loading,
    error,
    isSubscribed: subscription?.subscribed ?? false,
    isOnTrial: subscription?.onTrial ?? false,
    tier,
    tierDisplayName,
    productId: subscription?.productId ?? null,
    priceId: subscription?.priceId ?? null,
    billingPeriod: subscription?.billingPeriod ?? null,
    subscriptionEnd: subscription?.subscriptionEnd ?? null,
    trialEnd: subscription?.trialEnd ?? null,
    subscriptionType: subscription?.subscriptionType ?? null,
    teamId: subscription?.teamId ?? null,
    refetch: (opts?: { showLoading?: boolean }) => checkSubscription(opts),
  };
}

