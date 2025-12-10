import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import OnboardingWizard from "@/components/OnboardingWizard";

const Onboarding = () => {
  const navigate = useNavigate();
  const [canAccess, setCanAccess] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Check if user just signed up (pending email confirmation)
      const pendingSignupEmail = localStorage.getItem("actiplan_pending_signup_email");
      
      if (session) {
        // User is authenticated - check if onboarding is complete
        const onboardingData = localStorage.getItem("actiplan_onboarding");
        if (onboardingData) {
          const parsed = JSON.parse(onboardingData);
          if (parsed.completedAt) {
            navigate("/app");
            return;
          }
        }
        setCanAccess(true);
      } else if (pendingSignupEmail) {
        // User just signed up but hasn't confirmed email yet - allow onboarding
        setCanAccess(true);
      } else {
        // No session and no pending signup - redirect to auth
        navigate("/auth");
      }
    };

    checkAccess();
  }, [navigate]);

  if (!canAccess) {
    return null;
  }

  return <OnboardingWizard />;
};

export default Onboarding;
