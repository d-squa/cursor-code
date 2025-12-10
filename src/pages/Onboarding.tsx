import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import OnboardingWizard from "@/components/OnboardingWizard";

const Onboarding = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      // Check if onboarding is already complete
      const onboardingData = localStorage.getItem("actiplan_onboarding");
      if (onboardingData) {
        const parsed = JSON.parse(onboardingData);
        if (parsed.completedAt) {
          navigate("/app");
        }
      }
    };

    checkAuth();
  }, [navigate]);

  return <OnboardingWizard />;
};

export default Onboarding;
