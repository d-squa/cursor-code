import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PRICE_IDS } from "@/config/subscriptionTiers";

export const useTrialCheckout = () => {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);

  const startBasicTrial = async () => {
    setIsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to start your trial");
        navigate("/auth");
        return false;
      }

      // Always use Basic Monthly for trial (30-day free trial)
      const priceId = PRICE_IDS.basic.monthly;

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.url) {
        // Redirect to Stripe checkout
        window.location.href = data.url;
        return true;
      }
      
      return false;
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error.message || "Failed to start checkout");
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  return { startBasicTrial, isProcessing };
};
