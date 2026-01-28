export type CampaignAdAccountInfo = {
  platform: 'meta' | 'tiktok';
  accountId: string;
};

export type CampaignPageConfig = {
  platform: 'meta' | 'tiktok';
  pageId?: string;
  identityId?: string;
  advertiserId?: string;
  pageName?: string;
};

const uniqByKey = <T,>(items: T[], getKey: (item: T) => string): T[] => {
  return Array.from(new Map(items.map((i) => [getKey(i), i])).values());
};

const normalizeMetaAdAccountId = (id: unknown): string | null => {
  if (!id) return null;
  return String(id).replace(/^act_/, '');
};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

/**
 * Extracts page/identity IDs and ad account IDs from the (often messy) campaign.market_splits payload.
 * Handles camelCase + snake_case, and platform keys like meta/facebook/instagram.
 */
export function extractCampaignLinksFromMarketSplits(marketSplits: unknown): {
  adAccounts: CampaignAdAccountInfo[];
  pageConfigs: CampaignPageConfig[];
} {
  const splits: Record<string, any> =
    marketSplits && typeof marketSplits === 'object' ? (marketSplits as any) : {};

  const adAccounts: CampaignAdAccountInfo[] = [];
  const pageConfigs: CampaignPageConfig[] = [];

  for (const [platformKey, marketsRaw] of Object.entries(splits)) {
    const key = String(platformKey).toLowerCase();
    const isTikTok = key.includes('tiktok');
    const isMeta = key.includes('meta') || key.includes('facebook') || key.includes('instagram');
    if (!isMeta && !isTikTok) continue;

    const markets = asArray(marketsRaw);
    for (const market of markets) {
      const phases = asArray(market?.phases);

      // --- Ad accounts (Meta + TikTok) ---
      const rawAdAccountId =
        market?.adAccountId ??
        market?.ad_account_id ??
        market?.metaAdAccountId ??
        market?.meta_ad_account_id ??
        market?.tiktokAdvertiserId ??
        market?.tiktok_advertiser_id ??
        market?.advertiser_id ??
        market?.advertiserId;

      if (rawAdAccountId) {
        if (isTikTok) {
          adAccounts.push({ platform: 'tiktok', accountId: String(rawAdAccountId) });
        } else if (isMeta) {
          const normalized = normalizeMetaAdAccountId(rawAdAccountId);
          if (normalized) adAccounts.push({ platform: 'meta', accountId: normalized });
        }
      }

      // --- Meta pages (market + phases) ---
      if (isMeta) {
        const marketPageId =
          market?.pageId ??
          market?.page_id ??
          market?.page ??
          market?.metaPageId ??
          market?.meta_page_id;

        if (marketPageId) {
          pageConfigs.push({
            platform: 'meta',
            pageId: String(marketPageId),
            pageName:
              market?.pageName ??
              market?.page_name ??
              market?.pageNameFromApi ??
              market?.name,
          });
        }

        for (const phase of phases) {
          const phasePageId =
            phase?.pageId ??
            phase?.page_id ??
            phase?.page ??
            phase?.metaPageId ??
            phase?.meta_page_id;

          if (phasePageId) {
            pageConfigs.push({
              platform: 'meta',
              pageId: String(phasePageId),
              pageName:
                phase?.pageName ?? phase?.page_name ?? market?.pageName ?? market?.name,
            });
          }
        }
      }

      // --- TikTok identities (market + phases) ---
      if (isTikTok) {
        const advertiserId =
          market?.adAccountId ??
          market?.ad_account_id ??
          market?.tiktokAdvertiserId ??
          market?.tiktok_advertiser_id ??
          market?.advertiser_id ??
          market?.advertiserId;

        const marketIdentityId =
          market?.tiktokIdentityId ??
          market?.tiktok_identity_id ??
          market?.tiktokIdentity ??
          market?.identityId ??
          market?.identity_id;

        if (marketIdentityId) {
          pageConfigs.push({
            platform: 'tiktok',
            identityId: String(marketIdentityId),
            advertiserId: advertiserId ? String(advertiserId) : undefined,
            pageName:
              market?.tiktokIdentityName ??
              market?.tiktok_identity_name ??
              market?.accountName ??
              market?.name,
          });
        }

        for (const phase of phases) {
          const phaseIdentityId =
            phase?.tiktokIdentityId ??
            phase?.tiktok_identity_id ??
            phase?.tiktokIdentity ??
            phase?.identityId ??
            phase?.identity_id;

          if (phaseIdentityId) {
            pageConfigs.push({
              platform: 'tiktok',
              identityId: String(phaseIdentityId),
              advertiserId: advertiserId ? String(advertiserId) : undefined,
              pageName:
                phase?.tiktokIdentityName ??
                phase?.tiktok_identity_name ??
                market?.tiktokIdentityName ??
                market?.accountName ??
                market?.name,
            });
          }
        }
      }
    }
  }

  return {
    adAccounts: uniqByKey(adAccounts, (a) => `${a.platform}:${a.accountId}`),
    pageConfigs: uniqByKey(
      pageConfigs.filter((c) => (c.platform === 'meta' ? !!c.pageId : !!c.identityId)),
      (c) => `${c.platform}:${c.platform === 'meta' ? c.pageId : c.identityId}`
    ),
  };
}
