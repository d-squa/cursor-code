import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTierFromProductId, SubscriptionTier } from "@/config/subscriptionTiers";

interface SubscriptionStatus {
  subscribed: boolean;
  onTrial: boolean;
  productId: string | null;
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

  // Derive the subscription tier from the product ID
  const tier: SubscriptionTier = useMemo(() => {
    if (!subscription) return 'trial';
    if (subscription.onTrial) {
      return getTierFromProductId(subscription.productId);
    }
    if (!subscription.subscribed) return 'trial';
    return getTierFromProductId(subscription.productId);
  }, [subscription]);

  return {
    subscription,
    loading,
    error,
    isSubscribed: subscription?.subscribed ?? false,
    isOnTrial: subscription?.onTrial ?? false,
    tier,
    productId: subscription?.productId ?? null,
    subscriptionEnd: subscription?.subscriptionEnd ?? null,
    trialEnd: subscription?.trialEnd ?? null,
    refetch: checkSubscription,
  };
}
