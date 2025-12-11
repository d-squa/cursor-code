import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTierFromPriceId, SubscriptionTier, TIER_DISPLAY_NAMES } from "@/config/subscriptionTiers";

interface SubscriptionStatus {
  subscribed: boolean;
  onTrial: boolean;
  productId: string | null;
  priceId: string | null;
  billingPeriod: 'monthly' | 'yearly' | null;
  subscriptionEnd: string | null;
  trialEnd: string | null;
  status?: string;
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkSubscription = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSubscription(null);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("check-subscription", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnError) throw fnError;
      setSubscription(data);
    } catch (err: any) {
      console.error("Error checking subscription:", err);
      setError(err.message);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSubscription();
    
    // Listen for auth changes
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        checkSubscription();
      } else if (event === 'SIGNED_OUT') {
        setSubscription(null);
      }
    });

    return () => authSub.unsubscribe();
  }, [checkSubscription]);

  // Derive the subscription tier from the price ID (more reliable than product ID)
  const tier: SubscriptionTier = useMemo(() => {
    if (!subscription) return 'trial';
    if (!subscription.subscribed) return 'trial';
    
    // Use priceId for tier detection - it's more reliable
    const detectedTier = getTierFromPriceId(subscription.priceId);
    
    // If on trial and tier is detected, show that tier
    // If not on trial, show the detected tier
    return detectedTier;
  }, [subscription]);

  // Get display name for the tier
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
    refetch: checkSubscription,
  };
}
