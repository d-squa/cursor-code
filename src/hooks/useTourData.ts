import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TourDataState {
  isSeeded: boolean;
  isVisible: boolean;
  seededCampaignId: string | null;
  loading: boolean;
}

const TOUR_STORAGE_KEY = "actiplan_tour_completed";
const TOUR_DATA_SEEDED_KEY = "actiplan_tour_data_seeded";

export function useTourData() {
  const [state, setState] = useState<TourDataState>({
    isSeeded: false,
    isVisible: false,
    seededCampaignId: null,
    loading: true,
  });

  const loadState = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setState(s => ({ ...s, loading: false }));
        return;
      }

      const { data } = await (supabase as any)
        .from("tour_data_state")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setState({
          isSeeded: data.is_seeded,
          isVisible: data.is_visible,
          seededCampaignId: data.seeded_campaign_id,
          loading: false,
        });
      } else {
        setState(s => ({ ...s, loading: false }));
      }
    } catch {
      setState(s => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const seedTourData = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("seed-tour-data", {
        body: {},
      });

      if (error) throw error;

      if (data?.success) {
        setState({
          isSeeded: true,
          isVisible: true,
          seededCampaignId: data.campaign_id,
          loading: false,
        });
        localStorage.setItem(TOUR_DATA_SEEDED_KEY, "true");
        toast.success("Sample tour data loaded! Explore the platform with realistic demo data.");
        return data.campaign_id;
      }
    } catch (err: any) {
      console.error("Failed to seed tour data:", err);
      toast.error("Failed to load sample data");
      setState(s => ({ ...s, loading: false }));
    }
    return null;
  }, []);

  const toggleVisibility = useCallback(async (visible: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await (supabase as any)
        .from("tour_data_state")
        .update({ is_visible: visible })
        .eq("user_id", user.id);

      setState(s => ({ ...s, isVisible: visible }));
      toast.success(visible ? "Sample tour data is now visible" : "Sample tour data hidden");
    } catch (err) {
      console.error("Failed to toggle tour visibility:", err);
    }
  }, []);

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  }, []);

  return {
    ...state,
    seedTourData,
    toggleVisibility,
    resetTour,
    refreshState: loadState,
  };
}
