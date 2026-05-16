import { supabase } from "@/integrations/supabase/client";

export const BO_NUMBER_CONFLICT_MESSAGE =
  "This BO number is already used by another campaign. Choose a different number or clear the field.";

/** Returns another campaign id that already uses this BO number, if any. */
export async function findBoNumberConflict(
  boNumber: string,
  excludeCampaignId?: string | null,
): Promise<string | null> {
  const trimmed = boNumber.trim();
  if (!trimmed) return null;

  let query = supabase.from("campaigns").select("id").eq("bo_number", trimmed);
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
  return blob.includes("23505") || blob.includes("campaigns_bo_number");
}
