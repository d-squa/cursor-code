import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ForecastVersion {
  id: string;
  campaign_id: string;
  version_number: number;
  forecast_data: any;
  platforms_snapshot: any;
  total_budget: number;
  label: string | null;
  description: string | null;
  created_at: string;
  user_id: string;
}

export function useForecastVersions(campaignId: string | undefined) {
  const [versions, setVersions] = useState<ForecastVersion[]>([]);
  const [loading, setLoading] = useState(false);

  const loadVersions = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("forecast_versions")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("version_number", { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (err) {
      console.error("Failed to load forecast versions:", err);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const resolveNextVersionNumber = useCallback(async (): Promise<number> => {
    if (!campaignId) return 1;

    const { data, error } = await (supabase as any)
      .from("forecast_versions")
      .select("version_number")
      .eq("campaign_id", campaignId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return (data?.version_number ?? 0) + 1;
  }, [campaignId]);

  const saveVersion = useCallback(async (
    forecastData: any,
    platformsSnapshot: any,
    totalBudget: number,
    label?: string,
    description?: string,
  ) => {
    if (!campaignId) return null;
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) throw new Error("Not authenticated");

      const insertPayload = (versionNumber: number) => ({
        campaign_id: campaignId,
        version_number: versionNumber,
        forecast_data: forecastData,
        platforms_snapshot: platformsSnapshot,
        total_budget: totalBudget,
        label: label || `Forecast v${versionNumber}`,
        description: description || null,
        user_id: userData.user.id,
      });

      const maxAttempts = 3;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const nextVersion = await resolveNextVersionNumber();
        const { data, error } = await (supabase as any)
          .from("forecast_versions")
          .insert(insertPayload(nextVersion))
          .select()
          .single();

        if (!error) {
          setVersions(prev => [data, ...prev]);
          return data as ForecastVersion;
        }

        if (error.code === "23505" && attempt < maxAttempts - 1) {
          lastError = error;
          continue;
        }

        throw error;
      }

      throw lastError ?? new Error("Failed to save forecast version");
    } catch (err) {
      console.error("Failed to save forecast version:", err);
      toast.error("Failed to save forecast version");
      return null;
    }
  }, [campaignId, resolveNextVersionNumber]);

  return { versions, loading, loadVersions, saveVersion };
}
