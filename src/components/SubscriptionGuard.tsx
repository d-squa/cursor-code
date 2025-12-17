import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { Loader2 } from "lucide-react";

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const navigate = useNavigate();
  const { user, loading: authLoading, isEmailConfirmed } = useAuth();
  const { isSubscribed, loading: subLoading } = useSubscription();

  useEffect(() => {
    // Wait for auth to complete. For subscription refreshes, don't disrupt if we already
    // know the user is subscribed.
    if (authLoading) return;
    if (subLoading && !isSubscribed) return;

    // Not logged in - redirect to auth
    if (!user) {
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

    // Not subscribed - redirect to choose plan
    if (!isSubscribed) {
      navigate("/choose-plan");
      return;
    }
  }, [user, authLoading, isSubscribed, subLoading, navigate, isEmailConfirmed]);

  // Show loading while checking auth and subscription (only when we *don't* already have
  // a subscribed user). This prevents UI unmounts on background token refreshes.
  if (authLoading || (subLoading && !isSubscribed)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render children if not authenticated, email not confirmed, or not subscribed
  if (!user || !isEmailConfirmed || !isSubscribed) {
    return null;
  }

  return <>{children}</>;
}
