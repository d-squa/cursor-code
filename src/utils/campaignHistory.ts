import { supabase } from "@/integrations/supabase/client";

interface CampaignHistoryEntryInput {
  campaignId: string;
  userId?: string | null;
  action: string;
  changeType?: string | null;
  description?: string | null;
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
}: CampaignHistoryEntryInput) {
  if (!campaignId || !userId) return;

  const { error } = await supabase.from("campaign_change_history").insert({
    campaign_id: campaignId,
    user_id: userId,
    action,
    change_type: changeType ?? null,
    description: description ?? null,
  });

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

  const { error } = await supabase.from("activity_logs").insert({
    campaign_id: campaignId,
    user_id: userId,
    action_type: actionType,
    title,
    description: description ?? null,
    affected_platforms: affectedPlatforms ?? null,
    affected_markets: affectedMarkets ?? null,
    affected_phases: affectedPhases ?? null,
    metadata: metadata ?? {},
  });

  if (error) {
    console.error("Failed to log campaign activity entry:", error);
  }
}