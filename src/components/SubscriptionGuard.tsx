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
  const { user, loading: authLoading } = useAuth();
  const { isSubscribed, loading: subLoading } = useSubscription();

  useEffect(() => {
    // Wait for loading to complete
    if (authLoading || subLoading) return;

    // Not logged in - redirect to auth
    if (!user) {
      navigate("/auth");
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
  }, [user, authLoading, isSubscribed, subLoading, navigate]);

  // Show loading while checking auth and subscription
  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render children if not authenticated or not subscribed
  if (!user || !isSubscribed) {
    return null;
  }

  return <>{children}</>;
}
