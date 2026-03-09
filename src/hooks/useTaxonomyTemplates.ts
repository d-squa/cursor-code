import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  TaxonomyParam,
  getDefaultCampaignParams,
  getDefaultAdSetParams,
} from "@/utils/taxonomyUtils";
import type { Json } from "@/integrations/supabase/types";

export interface TaxonomyTemplates {
  campaign: TaxonomyParam[];
  adset: TaxonomyParam[];
}

interface UseTaxonomyTemplatesResult {
  templates: TaxonomyTemplates;
  loading: boolean;
  refresh: () => void;
}

// Module-level cache so all hook instances share resolved templates
const templateCache = new Map<string, TaxonomyTemplates>();
const dbAccountIdCache = new Map<string, string | null>();
const inflightRequests = new Map<string, Promise<TaxonomyTemplates>>();

async function resolveDbAccountId(
  adAccountId: string,
  platform: 'meta' | 'tiktok' | 'google'
): Promise<string | null> {
  const cacheKey = `${platform}:${adAccountId}`;
  if (dbAccountIdCache.has(cacheKey)) return dbAccountIdCache.get(cacheKey)!;

  let dbId: string | null = null;

  if (platform === 'tiktok') {
    const { data } = await supabase
      .from('tiktok_ad_accounts')
      .select('id')
      .eq('advertiser_id', adAccountId)
      .maybeSingle();
    dbId = data?.id ?? null;
  } else if (platform === 'google') {
    const { data } = await supabase
      .from('google_ad_accounts')
      .select('id')
      .eq('customer_id', adAccountId)
      .maybeSingle();
    if (!data) {
      const { data: data2 } = await supabase
        .from('google_ad_accounts')
        .select('id')
        .eq('account_id', adAccountId)
        .maybeSingle();
      dbId = data2?.id ?? null;
    } else {
      dbId = data.id;
    }
  } else {
    const { data } = await supabase
      .from('meta_ad_accounts')
      .select('id')
      .eq('account_id', adAccountId)
      .maybeSingle();
    dbId = data?.id ?? null;
  }

  dbAccountIdCache.set(cacheKey, dbId);
  return dbId;
}

async function fetchTemplates(
  adAccountId: string,
  platform: 'meta' | 'tiktok' | 'google'
): Promise<TaxonomyTemplates> {
  const cacheKey = `${platform}:${adAccountId}`;

  // Return from cache
  if (templateCache.has(cacheKey)) return templateCache.get(cacheKey)!;

  // Deduplicate in-flight requests
  if (inflightRequests.has(cacheKey)) return inflightRequests.get(cacheKey)!;

  const promise = (async () => {
    try {
      const dbAccountId = await resolveDbAccountId(adAccountId, platform);
      if (!dbAccountId) return { campaign: [], adset: [] };

      const { data, error } = await supabase
        .from('taxonomy_templates')
        .select('entity_type, template')
        .eq('ad_account_id', dbAccountId)
        .eq('platform', platform)
        .in('entity_type', ['campaign', 'adset']);

      if (error) {
        console.error('Error loading taxonomy templates:', error);
        return { campaign: [], adset: [] };
      }

      const result: TaxonomyTemplates = { campaign: [], adset: [] };
      data?.forEach(row => {
        if (row.entity_type === 'campaign' || row.entity_type === 'adset') {
          result[row.entity_type] = row.template as unknown as TaxonomyParam[];
        }
      });

      // Auto-create missing default templates
      const missingTypes: ('campaign' | 'adset')[] = [];
      if (result.campaign.length === 0) missingTypes.push('campaign');
      if (result.adset.length === 0) missingTypes.push('adset');

      if (missingTypes.length > 0) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            for (const et of missingTypes) {
              const defaultParams = et === 'campaign'
                ? getDefaultCampaignParams(platform)
                : getDefaultAdSetParams(platform);
              const { error: insertError } = await supabase
                .from('taxonomy_templates')
                .insert([{
                  ad_account_id: dbAccountId,
                  platform,
                  entity_type: et,
                  template: JSON.parse(JSON.stringify(defaultParams)) as Json,
                  user_id: user.id,
                }]);
              if (!insertError) {
                result[et] = defaultParams;
              }
            }
          }
        } catch {
          // Silently continue
        }
      }

      templateCache.set(cacheKey, result);
      return result;
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Shared hook that caches taxonomy template lookups across all phase instances.
 * Call once per PhaseScheduler - all PhaseTaxonomyPreview and PhaseTaxonomyInputs
 * components receive templates as props instead of fetching independently.
 */
export function useTaxonomyTemplates(
  adAccountId: string | undefined,
  platform: 'meta' | 'tiktok' | 'google'
): UseTaxonomyTemplatesResult {
  const [templates, setTemplates] = useState<TaxonomyTemplates>({ campaign: [], adset: [] });
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    console.log(`[TaxonomyTemplates] load called: platform=${platform}, adAccountId=${adAccountId}`);
    if (!adAccountId) {
      console.log(`[TaxonomyTemplates] No adAccountId, skipping`);
      setTemplates({ campaign: [], adset: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await fetchTemplates(adAccountId, platform);
      if (mountedRef.current) {
        setTemplates(result);
      }
    } catch (err) {
      console.error('Error loading taxonomy templates:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [adAccountId, platform]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const refresh = useCallback(() => {
    if (adAccountId) {
      const cacheKey = `${platform}:${adAccountId}`;
      templateCache.delete(cacheKey);
      dbAccountIdCache.delete(cacheKey);
    }
    load();
  }, [adAccountId, platform, load]);

  return { templates, loading, refresh };
}

/** Invalidate cache for a specific account (e.g. after editing templates in TaxonomyBuilder) */
export function invalidateTaxonomyCache(adAccountId: string, platform: string) {
  const cacheKey = `${platform}:${adAccountId}`;
  templateCache.delete(cacheKey);
  dbAccountIdCache.delete(cacheKey);
}
