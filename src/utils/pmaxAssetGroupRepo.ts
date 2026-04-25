// Data-access layer for the PMax "Shared Asset Pool" model.
//
// One asset group per (campaign, market, phase, ad_group) lives in
// `pmax_asset_groups`. Its text pool (headlines, long headlines, descriptions)
// lives in `pmax_text_assets`. Its creative pool (image/video pointers into
// the creative library, bucketed by usage) lives in `pmax_creative_assets`.
//
// This module is the ONLY place app code touches those three tables.

import { supabase } from '@/integrations/supabase/client';

export type PmaxBucket =
  | 'marketing_image'
  | 'square_image'
  | 'portrait_image'
  | 'logo'
  | 'video';

export interface PmaxAssetGroupRow {
  id: string;
  campaign_id: string;
  team_id: string | null;
  user_id: string;
  market: string;
  phase_name: string;
  ad_group_name: string;
  group_name: string | null;
  business_name: string | null;
  final_url: string | null;
  call_to_action: string | null;
  status: string;
  dsp_entity_id: string | null;
  error_message: string | null;
}

export interface PmaxTextAsset {
  id?: string;
  asset_group_id: string;
  asset_type: 'headline' | 'long_headline' | 'description';
  content: string;
  position: number;
}

export interface PmaxCreativeLink {
  id?: string;
  asset_group_id: string;
  creative_id: string;
  bucket: PmaxBucket;
  position: number;
}

export interface PmaxAssetGroupFull {
  group: PmaxAssetGroupRow;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  creativesByBucket: Record<PmaxBucket, string[]>; // public.creatives.id[]
}

const EMPTY_BUCKETS: Record<PmaxBucket, string[]> = {
  marketing_image: [],
  square_image: [],
  portrait_image: [],
  logo: [],
  video: [],
};

/** Fetch every asset group + its pools for a campaign. */
export async function fetchPmaxAssetGroups(campaignId: string): Promise<PmaxAssetGroupFull[]> {
  const { data: groups, error } = await supabase
    .from('pmax_asset_groups')
    .select('*')
    .eq('campaign_id', campaignId);
  if (error) throw error;
  if (!groups || groups.length === 0) return [];

  const ids = groups.map((g) => g.id);
  const [{ data: texts }, { data: links }] = await Promise.all([
    supabase.from('pmax_text_assets').select('*').in('asset_group_id', ids).order('position'),
    supabase.from('pmax_creative_assets').select('*').in('asset_group_id', ids).order('position'),
  ]);

  return groups.map((g) => {
    const groupTexts = (texts || []).filter((t: any) => t.asset_group_id === g.id);
    const groupLinks = (links || []).filter((l: any) => l.asset_group_id === g.id);
    const buckets: Record<PmaxBucket, string[]> = { ...EMPTY_BUCKETS, marketing_image: [], square_image: [], portrait_image: [], logo: [], video: [] };
    for (const l of groupLinks) buckets[l.bucket as PmaxBucket]?.push(l.creative_id);
    return {
      group: g as PmaxAssetGroupRow,
      headlines: groupTexts.filter((t: any) => t.asset_type === 'headline').map((t: any) => t.content),
      longHeadlines: groupTexts.filter((t: any) => t.asset_type === 'long_headline').map((t: any) => t.content),
      descriptions: groupTexts.filter((t: any) => t.asset_type === 'description').map((t: any) => t.content),
      creativesByBucket: buckets,
    };
  });
}

export interface UpsertGroupInput {
  campaignId: string;
  userId: string;
  teamId?: string | null;
  market: string;
  phaseName: string;
  adGroupName: string;
  groupName?: string | null;
  businessName?: string | null;
  finalUrl?: string | null;
  callToAction?: string | null;
}

/** Get-or-create the asset group row (idempotent on the natural key). */
export async function upsertPmaxAssetGroup(input: UpsertGroupInput): Promise<PmaxAssetGroupRow> {
  const payload = {
    campaign_id: input.campaignId,
    user_id: input.userId,
    team_id: input.teamId ?? null,
    market: input.market,
    phase_name: input.phaseName,
    ad_group_name: input.adGroupName,
    group_name: input.groupName ?? null,
    business_name: input.businessName ?? null,
    final_url: input.finalUrl ?? null,
    call_to_action: input.callToAction ?? null,
  };
  const { data, error } = await supabase
    .from('pmax_asset_groups')
    .upsert(payload, { onConflict: 'campaign_id,market,phase_name,ad_group_name' })
    .select('*')
    .single();
  if (error) throw error;
  return data as PmaxAssetGroupRow;
}

export interface ReplaceTextInput {
  groupId: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
}

/** Replace the entire text pool for a group (delete + insert). */
export async function replacePmaxTextAssets(input: ReplaceTextInput): Promise<void> {
  const { error: delErr } = await supabase
    .from('pmax_text_assets')
    .delete()
    .eq('asset_group_id', input.groupId);
  if (delErr) throw delErr;

  const rows: Omit<PmaxTextAsset, 'id'>[] = [];
  input.headlines.forEach((c, i) => c.trim() && rows.push({ asset_group_id: input.groupId, asset_type: 'headline', content: c.trim(), position: i }));
  input.longHeadlines.forEach((c, i) => c.trim() && rows.push({ asset_group_id: input.groupId, asset_type: 'long_headline', content: c.trim(), position: i }));
  input.descriptions.forEach((c, i) => c.trim() && rows.push({ asset_group_id: input.groupId, asset_type: 'description', content: c.trim(), position: i }));

  if (rows.length === 0) return;
  const { error: insErr } = await supabase.from('pmax_text_assets').insert(rows);
  if (insErr) throw insErr;
}

export interface ReplaceCreativesInput {
  groupId: string;
  /** Map of bucket → ordered list of creative_library_assets.id values. */
  byBucket: Partial<Record<PmaxBucket, string[]>>;
}

/** Replace the entire creative pool for a group. */
export async function replacePmaxCreativeAssets(input: ReplaceCreativesInput): Promise<void> {
  const { error: delErr } = await supabase
    .from('pmax_creative_assets')
    .delete()
    .eq('asset_group_id', input.groupId);
  if (delErr) throw delErr;

  const rows: Omit<PmaxCreativeLink, 'id'>[] = [];
  (Object.keys(input.byBucket) as PmaxBucket[]).forEach((bucket) => {
    const ids = input.byBucket[bucket] || [];
    ids.forEach((cid, i) => rows.push({ asset_group_id: input.groupId, creative_id: cid, bucket, position: i }));
  });
  if (rows.length === 0) return;
  const { error: insErr } = await supabase.from('pmax_creative_assets').insert(rows);
  if (insErr) throw insErr;
}

/** Delete an entire asset group (cascades to text + creative pools). */
export async function deletePmaxAssetGroup(groupId: string): Promise<void> {
  const { error } = await supabase.from('pmax_asset_groups').delete().eq('id', groupId);
  if (error) throw error;
}
