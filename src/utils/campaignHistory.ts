import { supabase } from "@/integrations/supabase/client";

/** Must stay in sync with activity_logs_action_type_check (see migrations). */
export const ACTIVITY_LOG_ACTION_TYPES = [
  "budget_adjustment",
  "targeting_change",
  "creative_update",
  "campaign_pause_resume",
  "pause_resume",
  "audience_update",
  "bid_change",
  "schedule_modification",
  "landing_page_change",
  "ad_copy_change",
  "placement_update",
  "conversion_setup",
  "reporting_delivery",
  "setup_mistake",
  "note",
  "other",
  "campaign_shell_push",
  "creative_push",
  "qc_transition",
  "qc_check_completed",
  "qc_check_reopened",
  "qc_bulk_check_completed",
  "qc_bulk_check_reopened",
] as const;

const ALLOWED_ACTIVITY_ACTION_TYPES = new Set<string>(ACTIVITY_LOG_ACTION_TYPES);

interface CampaignHistoryEntryInput {
  campaignId: string;
  userId?: string | null;
  action: string;
  changeType?: string | null;
  description?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
}

interface CampaignActivityEntryInput {
  campaignId: string;
  userId?: string | null;
  actionType: string;
  title: string;
  description?: string | null;
  affectedPlatforms?: string[];
  affectedMarkets?: string[];
  affectedPhases?: string[];
  metadata?: Record<string, unknown>;
}

export async function logCampaignHistoryEntry({
  campaignId,
  userId,
  action,
  changeType,
  description,
  oldStatus,
  newStatus,
}: CampaignHistoryEntryInput) {
  if (!campaignId || !userId) return;

  const row: Record<string, unknown> = {
    campaign_id: campaignId,
    user_id: userId,
    action,
    change_type: changeType ?? null,
    description: description ?? null,
  };
  if (oldStatus != null) row.old_status = oldStatus;
  if (newStatus != null) row.new_status = newStatus;

  const { error } = await supabase.from("campaign_change_history").insert(row as any);

  if (error) {
    console.error("Failed to log campaign history entry:", error);
  }
}

export async function logCampaignActivity({
  campaignId,
  userId,
  actionType,
  title,
  description,
  affectedPlatforms,
  affectedMarkets,
  affectedPhases,
  metadata,
}: CampaignActivityEntryInput) {
  if (!campaignId || !userId) return;

  const normalizedActionType = ALLOWED_ACTIVITY_ACTION_TYPES.has(actionType)
    ? actionType
    : "other";
  if (normalizedActionType !== actionType) {
    console.warn(
      `activity_logs: unknown action_type "${actionType}", logging as "other"`,
    );
  }

  const payload: Record<string, unknown> = {
    campaign_id: campaignId,
    user_id: userId,
    action_type: normalizedActionType,
    title,
    description: description ?? null,
    metadata: metadata ?? {},
  };
  if (affectedPlatforms?.length) payload.affected_platforms = affectedPlatforms;
  if (affectedMarkets?.length) payload.affected_markets = affectedMarkets;
  if (affectedPhases?.length) payload.affected_phases = affectedPhases;

  const { error } = await (supabase.from("activity_logs") as any).insert(payload);

  if (error) {
    console.error("Failed to log campaign activity entry:", error, "payload:", payload);
    throw error;
  }
}