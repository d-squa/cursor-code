// Data-access layer for the PMax "Shared Asset Pool" model.
//
// One asset group per (campaign, market, phase, ad_group) lives in
// `pmax_asset_groups`. Its text pool (headlines, long headlines, descriptions)
// lives in `pmax_text_assets`. Its creative pool (image/video pointers into
// the creative library, bucketed by usage) lives in `pmax_creative_assets`.
//
// This module is the ONLY place app code touches those three tables.

import { supabase } from '@/integrations/supabase/client';
import { resolvePmaxAssetGroupName } from '@/utils/googlePmaxAssetGroupName';

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
  /** Map of bucket → ordered list of `public.creatives.id` values. */
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

// ---------- High-level sync from CreativeTextAssetRow[] ----------

import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';

interface CreativeBucketHints {
  width?: number | null;
  height?: number | null;
  original_filename?: string | null;
  name?: string | null;
  folder_path?: string | null;
  media_type?: string | null;
  platform_video_id?: string | null;
}

function bucketCreative(c: CreativeBucketHints, id: string): { bucket: PmaxBucket | null } {
  if (c.media_type === 'video' || c.platform_video_id) return { bucket: 'video' };
  const w = Number(c.width || 0);
  const h = Number(c.height || 0);
  if (!w || !h) return { bucket: null };
  const ratio = w / h;
  const hay = `${c.original_filename || ''} ${c.name || ''} ${c.folder_path || ''}`.toLowerCase();
  const logoHint = /\blogo\b/.test(hay);
  if (Math.abs(ratio - 1) <= 0.05) {
    if (logoHint || Math.max(w, h) <= 512) return { bucket: 'logo' };
    return { bucket: 'square_image' };
  }
  if (Math.abs(ratio - 1.91) <= 0.06 || Math.abs(ratio - 16 / 9) <= 0.03) return { bucket: 'marketing_image' };
  if (Math.abs(ratio - 0.8) <= 0.05) return { bucket: 'portrait_image' };
  return { bucket: null };
}

/**
 * Mirror PMax rows from the editor's `CreativeTextAssetRow[]` model into the
 * `pmax_asset_groups` + children tables. One row per (market, phase, adSet)
 * tuple becomes one asset group. Idempotent: replaces text + creative pool on
 * every call. Safe to invoke after Excel import or "Save & Proceed".
 */
export async function syncPmaxGroupsFromRows(
  campaignId: string,
  userId: string,
  rows: CreativeTextAssetRow[],
  detectIsPmax: (row: CreativeTextAssetRow) => boolean,
): Promise<{ groupsSynced: number; errors: string[] }> {
  const errors: string[] = [];
  const groups = new Map<string, CreativeTextAssetRow[]>();
  for (const r of rows) {
    if (!detectIsPmax(r)) continue;
    // Group by the RESOLVED taxonomy ad-group name (same value used as the
    // upsert key below). Grouping by raw `adSet` would split rows that share
    // a logical PMax asset group across multiple buckets and run extra upserts
    // that overwrite each other.
    const resolvedAdGroup = resolvePmaxAssetGroupName(r);
    const key = `${r.market}||${r.phase}||${resolvedAdGroup}`;
    const arr = groups.get(key) || [];
    arr.push(r);
    groups.set(key, arr);
  }
  if (groups.size === 0) return { groupsSynced: 0, errors };

  // Pull all creative records once.
  const allCreativeIds = Array.from(new Set(
    Array.from(groups.values()).flat().map((r) => r.creativeId).filter(Boolean),
  ));
  const creativesById = new Map<string, CreativeBucketHints>();
  if (allCreativeIds.length > 0) {
    const { data } = await supabase
      .from('creatives')
      .select('id, width, height, original_filename, name, folder_path, media_type, platform_video_id')
      .in('id', allCreativeIds);
    for (const c of data || []) creativesById.set(c.id, c as any);
  }

  let synced = 0;
  for (const [, groupRows] of groups) {
    // Pick the most-populated row as the anchor for text values.
    const anchor = groupRows.reduce((best, cur) => {
      const score = (r: any) =>
        ['headline','headline2','headline3','headline4','headline5',
         'long_headline_1','long_headline_2','long_headline_3','long_headline_4','long_headline_5',
         'description','description2','description3','description4','description5',
         'business_name','brandName','destinationUrl','callToAction']
          .reduce((s, k) => s + (String((r as any)[k] || '').trim() ? 1 : 0), 0);
      return score(cur) > score(best) ? cur : best;
    }, groupRows[0]);

    const a = anchor as any;
    try {
      // The push function (push-pmax-asset-groups) looks groups up by
      // `ad_group_name = campaign_launch_status.entity_name`, which is the
      // fully-resolved taxonomy name (e.g. "PMAX Test - AE - PMax — Product
      // Discovery - Default_LANG_ENG"). Persist that exact name so the lookup
      // matches; fall back to `adSet` only if no taxonomy name is set.
      const resolvedAdGroupName = resolvePmaxAssetGroupName(anchor);
      const group = await upsertPmaxAssetGroup({
        campaignId,
        userId,
        market: anchor.market,
        phaseName: anchor.phase,
        adGroupName: resolvedAdGroupName,
        groupName: resolvedAdGroupName || null,
        businessName: String(a.business_name || a.brandName || '').trim() || null,
        finalUrl: String(a.destinationUrl || '').trim() || null,
        callToAction: String(a.callToAction || a.call_to_action || '').trim() || null,
      });

      const headlines = [a.headline, a.headline2, a.headline3, a.headline4, a.headline5]
        .map((v) => String(v || '').trim()).filter(Boolean);
      const longHeadlines = [a.long_headline_1, a.long_headline_2, a.long_headline_3, a.long_headline_4, a.long_headline_5]
        .map((v) => String(v || '').trim()).filter(Boolean);
      const descriptions = [a.description, a.description2, a.description3, a.description4, a.description5]
        .map((v) => String(v || '').trim()).filter(Boolean);

      await replacePmaxTextAssets({ groupId: group.id, headlines, longHeadlines, descriptions });

      const byBucket: Record<PmaxBucket, string[]> = {
        marketing_image: [], square_image: [], portrait_image: [], logo: [], video: [],
      };
      for (const r of groupRows) {
        if (!r.creativeId) continue;
        const c = creativesById.get(r.creativeId);
        if (!c) continue;
        const { bucket } = bucketCreative(c, r.creativeId);
        if (bucket) byBucket[bucket].push(r.creativeId);
      }
      // Dedupe per bucket.
      (Object.keys(byBucket) as PmaxBucket[]).forEach((b) => {
        byBucket[b] = Array.from(new Set(byBucket[b]));
      });
      await replacePmaxCreativeAssets({ groupId: group.id, byBucket });
      synced++;
    } catch (err: any) {
      errors.push(`${anchor.market}/${anchor.phase}/${anchor.adSet}: ${err?.message || err}`);
    }
  }
  return { groupsSynced: synced, errors };
}
