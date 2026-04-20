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
      
      if (!session) {
        // No session - redirect to auth
        navigate("/auth");
        return;
      }

      // Super admin bypass
      if (session.user.email === "superadmin@actiplan.app") {
        navigate("/app/admin");
      }
      
      // Check if email is confirmed
      if (!session.user.email_confirmed_at) {
        // Email not confirmed - redirect to auth with message
        navigate("/auth?confirm_email=true");
        return;
      }
      
      // If user permanently dismissed onboarding, skip it forever
      if (localStorage.getItem("actiplan_onboarding_dismissed") === "true") {
        navigate("/app/overview");
        return;
      }

      // Check if onboarding is already complete
      const onboardingData = localStorage.getItem("actiplan_onboarding");
      if (onboardingData) {
        const parsed = JSON.parse(onboardingData);
        if (parsed.completedAt) {
          navigate("/app/overview");
          return;
        }
      }
      
      setCanAccess(true);
    };

    checkAccess();
  }, [navigate]);

  if (!canAccess) {
    return null;
  }

  return <OnboardingWizard />;
};

export default Onboarding;
