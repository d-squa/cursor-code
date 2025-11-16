import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AudienceRecommendation {
  category: "Retargeting" | "Lookalikes" | "New Acquisition" | "Saved Audiences";
  items: Array<{
    source: string;
    type: string;
    description: string;
    available: boolean;
    audienceId?: string;
    audienceName?: string;
    setupInstructions?: string;
  }>;
  justification: string;
}

export function useAudienceRecommendations() {
  const [recommendations, setRecommendations] = useState<AudienceRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateRecommendations = async (
    description: string,
    strategyFocus: string,
    platform: string = "Meta"
  ) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        "audience-recommendations",
        {
          body: {
            description,
            strategyFocus,
            platform
          }
        }
      );

      if (functionError) throw functionError;

      setRecommendations(data.recommendations || []);
      
      if (data.recommendations && data.recommendations.length > 0) {
        toast.success("Audience recommendations generated successfully");
      } else {
        toast.info("No specific recommendations available for this configuration");
      }
    } catch (err: any) {
      console.error("Error generating recommendations:", err);
      setError(err.message || "Failed to generate recommendations");
      toast.error("Failed to generate audience recommendations");
    } finally {
      setLoading(false);
    }
  };

  const clearRecommendations = () => {
    setRecommendations([]);
    setError(null);
  };

  return {
    recommendations,
    loading,
    error,
    generateRecommendations,
    clearRecommendations
  };
}
