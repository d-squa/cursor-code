import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getTierFromPriceId,
  SubscriptionTier,
  TIER_DISPLAY_NAMES,
} from "@/config/subscriptionTiers";

// Helper to get active workspace ID from localStorage
function getActiveWorkspaceId(userId: string | undefined): string | null {
  if (!userId) return null;
  return localStorage.getItem(`actiplan.activeWorkspaceId:${userId}`);
}

// Cache duration: 5 minutes - avoid redundant API calls
const SUBSCRIPTION_CACHE_DURATION_MS = 5 * 60 * 1000;

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

  // Track when we last successfully checked subscription
  const lastCheckTimeRef = useRef<number>(0);
  const hasCheckedOnceRef = useRef(false);

  // Prevent cross-account leakage: never keep a previous user's subscription state.
  const currentUserIdRef = useRef<string | null>(null);
  const lastSuccessfulUserIdRef = useRef<string | null>(null);

  const checkSubscription = useCallback(
    async ({ showLoading, force }: { showLoading?: boolean; force?: boolean } = {}) => {
      const now = Date.now();
      const timeSinceLastCheck = now - lastCheckTimeRef.current;

      // Skip if we've checked recently and not forcing, and we have a valid subscription
      if (
        !force &&
        hasCheckedOnceRef.current &&
        timeSinceLastCheck < SUBSCRIPTION_CACHE_DURATION_MS &&
        subscription !== null
      ) {
        return;
      }

      const shouldShowLoading = showLoading ?? !hasCheckedOnceRef.current;

      let sessionUserId: string | null = null;

      try {
        if (shouldShowLoading) setLoading(true);
        setError(null);

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setSubscription(null);
          currentUserIdRef.current = null;
          lastSuccessfulUserIdRef.current = null;
          return;
        }

        sessionUserId = session.user.id;

        // If the authenticated user changed, immediately drop any prior subscription state.
        if (currentUserIdRef.current !== sessionUserId) {
          currentUserIdRef.current = sessionUserId;
          lastSuccessfulUserIdRef.current = null;
          setSubscription(null);
          // Force check on user change
        } else if (
          !force &&
          hasCheckedOnceRef.current &&
          timeSinceLastCheck < SUBSCRIPTION_CACHE_DURATION_MS
        ) {
          // Same user, recently checked, not forced - skip
          return;
        }

        // Pass active workspace ID so subscription is scoped correctly
        const activeWorkspaceId = getActiveWorkspaceId(sessionUserId);

        const { data, error: fnError } = await supabase.functions.invoke(
          "check-subscription",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            body: { activeWorkspaceId },
          }
        );

        if (fnError) throw fnError;

        setSubscription(data);
        lastSuccessfulUserIdRef.current = sessionUserId;
        lastCheckTimeRef.current = Date.now();
      } catch (err: any) {
        console.error("Error checking subscription:", err);
        setError(err?.message ?? "Failed to check subscription");

        // Keep existing data for transient errors, but never across account switches.
        if (
          sessionUserId &&
          lastSuccessfulUserIdRef.current &&
          lastSuccessfulUserIdRef.current !== sessionUserId
        ) {
          setSubscription(null);
          lastSuccessfulUserIdRef.current = null;
        }
      } finally {
        hasCheckedOnceRef.current = true;
        if (shouldShowLoading) setLoading(false);
        else setLoading((v) => v); // no-op; avoids toggling UI during background refresh
      }
    },
    [subscription]
  );

  useEffect(() => {
    checkSubscription({ showLoading: true, force: true });

    // Listen for auth changes - only SIGNED_IN triggers full check
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        // Force check on sign in
        checkSubscription({ showLoading: true, force: true });
      } else if (event === "TOKEN_REFRESHED") {
        // Do NOT re-check on token refresh - this is what causes the window minimize issue
        // Token refresh happens on visibility change and we don't need to re-check subscription
      } else if (event === "SIGNED_OUT") {
        setSubscription(null);
        setError(null);
        setLoading(false);
        hasCheckedOnceRef.current = false;
        lastCheckTimeRef.current = 0;
        currentUserIdRef.current = null;
        lastSuccessfulUserIdRef.current = null;
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
    refetch: (opts?: { showLoading?: boolean; force?: boolean }) => checkSubscription(opts),
  };
}

