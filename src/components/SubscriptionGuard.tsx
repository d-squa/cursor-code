import { useEffect, useRef, useState } from "react";
import { AmplitudeAnalytics } from "./AmplitudeAnalytics";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const navigate = useNavigate();
  const { user, loading: authLoading, isEmailConfirmed } = useAuth();
  const { isSubscribed, loading: subLoading, error: subError } = useSubscription();
  const { loading: workspaceLoading, activeWorkspaceId, workspaces } = useWorkspace();
  
  // Track if user was ever subscribed in this session to prevent redirect during transient errors
  const wasSubscribedRef = useRef(false);
  // Track if we've already attempted workspace recovery
  const [recoveringWorkspace, setRecoveringWorkspace] = useState(false);
  const recoveryAttemptedRef = useRef(false);
  
  // Update the ref when subscription status is confirmed
  useEffect(() => {
    if (isSubscribed) {
      wasSubscribedRef.current = true;
    }
  }, [isSubscribed]);

  // If user is authenticated but has no workspaces, attempt to recreate via ensure_user_workspace
  useEffect(() => {
    if (authLoading || workspaceLoading) return;
    if (!user || !isEmailConfirmed) return;
    if (workspaces.length > 0) return;
    if (recoveryAttemptedRef.current) return;

    recoveryAttemptedRef.current = true;
    setRecoveringWorkspace(true);

    supabase.rpc("ensure_user_workspace").then(({ error }) => {
      if (error) {
        console.error("Failed to recover workspace:", error);
      }
      // Force a full reload so useWorkspace re-fetches
      window.location.reload();
    });
  }, [authLoading, workspaceLoading, user, isEmailConfirmed, workspaces]);

  useEffect(() => {
    // Wait for auth to complete
    if (authLoading) return;
    
    // Wait for workspace to load - subscription check depends on activeWorkspaceId
    if (workspaceLoading) return;

    // Still recovering workspace
    if (recoveringWorkspace) return;
    
    // For subscription refreshes, don't disrupt if we already know the user is subscribed
    // or if they were subscribed before (prevents redirect during transient errors)
    if (subLoading && (isSubscribed || wasSubscribedRef.current)) return;

    // Not logged in - redirect to auth
    if (!user) {
      wasSubscribedRef.current = false; // Reset on logout
      navigate("/auth");
      return;
    }

    // Email not confirmed - redirect to auth with message
    if (!isEmailConfirmed) {
      navigate("/auth?confirm_email=true");
      return;
    }

    // Check onboarding status
    const onboardingData = localStorage.getItem("actiplan_onboarding");
    const onboardingComplete = onboardingData && JSON.parse(onboardingData).completedAt;

    if (!onboardingComplete) {
      navigate("/onboarding");
      return;
    }

    // Only redirect to choose-plan if:
    // 1. Not currently subscribed AND
    // 2. Never was subscribed in this session (or explicitly confirmed unsubscribed) AND
    // 3. No subscription error (errors should not trigger redirect) AND
    // 4. Subscription check is complete
    if (!isSubscribed && !wasSubscribedRef.current && !subError && !subLoading) {
      // Preserve checkout success params so ChoosePlan can handle post-checkout polling
      const currentParams = new URLSearchParams(window.location.search);
      const successParam = currentParams.get("success");
      if (successParam === "true") {
        navigate(`/choose-plan${window.location.search}`);
      } else {
        navigate("/choose-plan");
      }
      return;
    }
  }, [user, authLoading, isSubscribed, subLoading, subError, navigate, isEmailConfirmed, workspaceLoading, activeWorkspaceId, recoveringWorkspace]);

  // Show loading while checking auth, workspace, and subscription (only when we *don't* already have
  // a subscribed user). This prevents UI unmounts on background token refreshes.
  if (authLoading || workspaceLoading || (subLoading && !isSubscribed && !wasSubscribedRef.current)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render children if not authenticated or email not confirmed
  // But DO render if there's a subscription error - let user see app while we retry
  if (!user || !isEmailConfirmed) {
    return null;
  }
  
  // Allow access if subscribed OR was subscribed before (handle transient errors gracefully)
  if (!isSubscribed && !wasSubscribedRef.current && !subError) {
    return null;
  }

  return (
    <>
      <AmplitudeAnalytics />
      {children}
    </>
  );
}
