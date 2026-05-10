import { useEffect, useRef, useState } from "react";
import { AmplitudeAnalytics } from "./AmplitudeAnalytics";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  // Once children have been rendered, never unmount them due to transient loading states
  const childrenRenderedRef = useRef(false);
  // Track if we've already attempted workspace recovery
  const [recoveringWorkspace, setRecoveringWorkspace] = useState(false);
  const recoveryAttemptedRef = useRef(false);
  // Track pending invitation processing
  const [processingInvitation, setProcessingInvitation] = useState(false);
  const invitationProcessedRef = useRef(false);
  const lastUserIdForInviteRef = useRef<string | undefined>(undefined);
  
  // Track prior subscription only while useful; reset once access is clearly revoked so redirects work.
  useEffect(() => {
    if (isSubscribed) {
      wasSubscribedRef.current = true;
    } else if (!subLoading && !subError) {
      wasSubscribedRef.current = false;
      childrenRenderedRef.current = false;
    }
  }, [isSubscribed, subLoading, subError]);

  // If a different user signs in, allow pending-invite processing for the new account
  useEffect(() => {
    const id = user?.id;
    if (lastUserIdForInviteRef.current && id && lastUserIdForInviteRef.current !== id) {
      invitationProcessedRef.current = false;
    }
    lastUserIdForInviteRef.current = id;
  }, [user?.id]);

  // Check and process pending invitation after sign-in
  useEffect(() => {
    if (authLoading || !user || !isEmailConfirmed) return;
    if (invitationProcessedRef.current) return;

    const pendingRaw = localStorage.getItem("actiplan_pending_invitation");
    if (!pendingRaw) return;

    invitationProcessedRef.current = true;
    setProcessingInvitation(true);

    (async () => {
      try {
        const pending = JSON.parse(pendingRaw);
        const { data: session } = await supabase.auth.getSession();
        const accessToken = session?.session?.access_token;
        if (!accessToken) throw new Error("No session");

        const { data, error } = await supabase.functions.invoke("accept-invitation", {
          body: {
            token: pending.token,
            subscriptionChoice: null,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (error) throw error;

        // Set workspace to the invited team
        if (pending.teamId && user.id) {
          localStorage.setItem(`actiplan.activeWorkspaceId:${user.id}`, pending.teamId);
        }
        localStorage.removeItem("actiplan_signup_source");
        
        // Ensure onboarding is marked complete
        const existingOnboarding = localStorage.getItem("actiplan_onboarding");
        if (!existingOnboarding) {
          localStorage.setItem(
            "actiplan_onboarding",
            JSON.stringify({
              completedAt: new Date().toISOString(),
              skippedViaTeamInvite: true,
            })
          );
        }

        localStorage.removeItem("actiplan_pending_invitation");
        toast.success("Welcome to the team!");

        // Reload to pick up new workspace and subscription
        window.location.href = "/app/overview";
      } catch (err: any) {
        console.error("Failed to auto-accept invitation:", err);
        localStorage.removeItem("actiplan_pending_invitation");
        setProcessingInvitation(false);
      }
    })();
  }, [authLoading, user, isEmailConfirmed]);

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

    // Post–email-confirm invite flow: AcceptInvitation stores this before redirect to /auth.
    // Block /choose-plan until the accept-invitation effect runs (setState is async; this is synchronous).
    if (
      user &&
      isEmailConfirmed &&
      typeof localStorage !== "undefined" &&
      localStorage.getItem("actiplan_pending_invitation")
    ) {
      return;
    }

    // Still recovering workspace or processing invitation
    if (recoveringWorkspace || processingInvitation) return;
    
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
  }, [user, authLoading, isSubscribed, subLoading, subError, navigate, isEmailConfirmed, workspaceLoading, activeWorkspaceId, recoveringWorkspace, processingInvitation]);

  const waitingOnPendingInvite =
    !!user &&
    isEmailConfirmed &&
    typeof localStorage !== "undefined" &&
    !!localStorage.getItem("actiplan_pending_invitation");

  // Keep rendering while subscribed, loading after prior access, or Stripe/subscription errors (transient).
  const shouldRenderChildren =
    user &&
    isEmailConfirmed &&
    (isSubscribed || subError || (subLoading && wasSubscribedRef.current));

  if (shouldRenderChildren) {
    childrenRenderedRef.current = true;
  }

  // After first paint of the app, only stay mounted while subscription access or recovery still applies.
  if (childrenRenderedRef.current && user && (isSubscribed || subLoading || subError)) {
    return (
      <>
        <AmplitudeAnalytics />
        {children}
      </>
    );
  }

  // Show loading only on initial load (never after children have been rendered)
  if (
    authLoading ||
    workspaceLoading ||
    recoveringWorkspace ||
    processingInvitation ||
    waitingOnPendingInvite ||
    (subLoading && !isSubscribed && !wasSubscribedRef.current)
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render children if not authenticated or email not confirmed
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
