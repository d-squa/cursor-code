import { supabase } from "@/integrations/supabase/client";

export const BO_NUMBER_CONFLICT_MESSAGE =
  "BO number must be unique within your workspace. This number is already in use on another ActiPlan here.";

/** Returns another campaign id in the same team that already uses this BO number, if any. */
export async function findBoNumberConflict(
  boNumber: string,
  excludeCampaignId?: string | null,
  teamId?: string | null,
): Promise<string | null> {
  const trimmed = boNumber.trim();
  if (!trimmed || !teamId) return null;

  let query = supabase
    .from("campaigns")
    .select("id")
    .eq("bo_number", trimmed)
    .eq("team_id", teamId);

  if (excludeCampaignId) {
    query = query.neq("id", excludeCampaignId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("BO number uniqueness check failed:", error);
    return null;
  }

  return data?.id ?? null;
}

export function isBoNumberUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "23505") return true;
  const blob = `${e.code ?? ""} ${e.message ?? ""}`.toLowerCase();
  return (
    blob.includes("23505") ||
    blob.includes("campaigns_bo_number") ||
    blob.includes("campaigns_team_id_bo_number_key") ||
    blob.includes("campaigns_bo_number_no_team_key")
  );
}
