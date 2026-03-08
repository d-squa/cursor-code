import { useEffect, useRef } from "react";
import { AmplitudeAnalytics } from "./AmplitudeAnalytics";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Loader2 } from "lucide-react";

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const navigate = useNavigate();
  const { user, loading: authLoading, isEmailConfirmed } = useAuth();
  const { isSubscribed, loading: subLoading, error: subError } = useSubscription();
  const { loading: workspaceLoading, activeWorkspaceId } = useWorkspace();
  
  // Track if user was ever subscribed in this session to prevent redirect during transient errors
  const wasSubscribedRef = useRef(false);
  
  // Update the ref when subscription status is confirmed
  useEffect(() => {
    if (isSubscribed) {
      wasSubscribedRef.current = true;
    }
  }, [isSubscribed]);

  useEffect(() => {
    // Wait for auth to complete
    if (authLoading) return;
    
    // Wait for workspace to load - subscription check depends on activeWorkspaceId
    if (workspaceLoading) return;
    
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
    // 4. Workspace is loaded (so subscription check has correct context)
    if (!isSubscribed && !wasSubscribedRef.current && !subError && !subLoading) {
      navigate("/choose-plan");
      return;
    }
  }, [user, authLoading, isSubscribed, subLoading, subError, navigate, isEmailConfirmed, workspaceLoading, activeWorkspaceId]);

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
