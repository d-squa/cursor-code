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
  subscriptionStart: string | null;
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
  // Track whether we have data to avoid showing loading on re-checks
  const hasDataRef = useRef(false);

  // Prevent cross-account leakage: never keep a previous user's subscription state.
  const currentUserIdRef = useRef<string | null>(null);
  const lastSuccessfulUserIdRef = useRef<string | null>(null);

  // Cache the session from onAuthStateChange so we never call getSession()/refreshSession
  const cachedSessionRef = useRef<{ accessToken: string; userId: string } | null>(null);

  const checkSubscription = useCallback(
    async ({ showLoading, force }: { showLoading?: boolean; force?: boolean } = {}) => {
      const now = Date.now();
      const timeSinceLastCheck = now - lastCheckTimeRef.current;

      // Skip if we've checked recently and not forcing
      if (
        !force &&
        hasCheckedOnceRef.current &&
        timeSinceLastCheck < SUBSCRIPTION_CACHE_DURATION_MS
      ) {
        return;
      }

      // Never show loading if we already have subscription data - prevents UI unmounts on re-checks
      const shouldShowLoading = (showLoading ?? !hasCheckedOnceRef.current) && !hasDataRef.current;

      // Use cached session — never call supabase.auth.getSession() to avoid session refresh
      const cached = cachedSessionRef.current;
      if (!cached) {
        // No session yet — mark as unauthenticated
        setSubscription(null);
        currentUserIdRef.current = null;
        lastSuccessfulUserIdRef.current = null;
        if (shouldShowLoading) setLoading(false);
        hasCheckedOnceRef.current = true;
        return;
      }

      const sessionUserId = cached.userId;

      try {
        if (shouldShowLoading) setLoading(true);
        setError(null);

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
              Authorization: `Bearer ${cached.accessToken}`,
            },
            body: { activeWorkspaceId },
          }
        );

        if (fnError) throw fnError;

        setSubscription(data);
        hasDataRef.current = true;
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
          hasDataRef.current = false;
          lastSuccessfulUserIdRef.current = null;
        }
      } finally {
        hasCheckedOnceRef.current = true;
        if (shouldShowLoading) setLoading(false);
        else setLoading((v) => v); // no-op; avoids toggling UI during background refresh
      }
    },
    [] // No dependencies - use refs for state checks
  );

  useEffect(() => {
    // Listen for auth changes only — avoid getSession() entirely so this hook
    // never proactively touches the user's auth session.
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session) {
          cachedSessionRef.current = {
            accessToken: session.access_token,
            userId: session.user.id,
          };
        }

        if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
          queueMicrotask(() => {
            void checkSubscription({ showLoading: true, force: true });
          });
        }

        // TOKEN_REFRESHED: update cached token only; do not re-check subscription.
      } else if (event === "SIGNED_OUT") {
        cachedSessionRef.current = null;
        setSubscription(null);
        setError(null);
        setLoading(false);
        hasCheckedOnceRef.current = false;
        hasDataRef.current = false;
        lastCheckTimeRef.current = 0;
        currentUserIdRef.current = null;
        lastSuccessfulUserIdRef.current = null;
      } else if (event === "INITIAL_SESSION" && !session) {
        cachedSessionRef.current = null;
        setSubscription(null);
        setError(null);
        setLoading(false);
        hasCheckedOnceRef.current = true;
        hasDataRef.current = false;
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
    subscriptionStart: subscription?.subscriptionStart ?? null,
    subscriptionEnd: subscription?.subscriptionEnd ?? null,
    trialEnd: subscription?.trialEnd ?? null,
    subscriptionType: subscription?.subscriptionType ?? null,
    teamId: subscription?.teamId ?? null,
    refetch: (opts?: { showLoading?: boolean; force?: boolean }) => checkSubscription(opts),
  };
}

