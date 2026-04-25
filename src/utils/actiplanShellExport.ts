import * as XLSX from 'xlsx';
import type { PmaxAssetGroupFull } from './pmaxAssetGroupRepo';

interface CreativeAssignment {
  id: string;
  platform: string;
  market: string;
  phase_name: string;
  ad_set_name: string | null;
  ad_set_id: string | null;
  creative_id: string;
  status: string | null;
  dsp_creative_id: string | null;
  destination_url: string | null;
  headline: string | null;
  headline_2: string | null;
  headline_3: string | null;
  headline_4: string | null;
  headline_5: string | null;
  primary_text: string | null;
  primary_text_2: string | null;
  primary_text_3: string | null;
  primary_text_4: string | null;
  primary_text_5: string | null;
  description: string | null;
  description_2: string | null;
  description_3: string | null;
  description_4: string | null;
  description_5: string | null;
  call_to_action: string | null;
  url_parameters: string | null;
  display_name: string | null;
  brand_name: string | null;
  creative?: {
    name: string;
    media_type: string | null;
    media_urls: string[] | null;
    thumbnail_url: string | null;
  };
}

interface Campaign {
  name: string;
  total_budget: number;
  start_date: string;
  end_date: string;
}

interface PmaxExportContext {
  pmaxGroups: PmaxAssetGroupFull[];
  /** Set of `${market}||${phase_name}||${ad_group_name}` keys that are PMax. */
  pmaxKeys: Set<string>;
  /** Map of public.creatives.id → display info for the PMax sheet. */
  creativeMediaMap: Map<string, { name: string | null; url: string | null }>;
}

const BUCKET_LABELS: Record<string, string> = {
  marketing_image: 'Marketing Images',
  square_image: 'Square Images',
  portrait_image: 'Portrait Images',
  logo: 'Logos',
  video: 'Videos',
};

export function downloadActiplanShell(
  campaign: Campaign,
  creativeAssignments: CreativeAssignment[],
  pmaxContext?: PmaxExportContext
): void {
  const workbook = XLSX.utils.book_new();

  // ---------- Ads tab (per-ad rows, excludes PMax) ----------
  // PMax campaigns use a shared asset pool at the asset-group level — per-ad
  // text columns don't apply, so suppress those rows here. They appear in the
  // dedicated "PMax Asset Groups" sheet instead.
  const pmaxKeys = pmaxContext?.pmaxKeys ?? new Set<string>();
  const isPmaxAd = (ad: CreativeAssignment) =>
    pmaxKeys.has(`${ad.market}||${ad.phase_name}||${ad.ad_set_name || ''}`);

  const nonPmaxAds = creativeAssignments.filter((ad) => !isPmaxAd(ad));

  const shellData = nonPmaxAds.map((ad) => {
    let previewLink = '';
    if (ad.dsp_creative_id && ad.platform.toLowerCase() === 'meta') {
      previewLink = `https://fb.me/adspreview/facebook/${ad.dsp_creative_id}`;
    } else if (ad.dsp_creative_id) {
      previewLink = ad.dsp_creative_id;
    }
    const adName = ad.display_name || ad.creative?.name || '';
    return {
      'Platform': ad.platform,
      'Market': ad.market,
      'Campaign Name': ad.phase_name || campaign.name,
      'Ad Set Name': ad.ad_set_name || '',
      'Ad Name': adName,
      'Primary Text': ad.primary_text || '',
      'Primary Text 2': ad.primary_text_2 || '',
      'Primary Text 3': ad.primary_text_3 || '',
      'Primary Text 4': ad.primary_text_4 || '',
      'Primary Text 5': ad.primary_text_5 || '',
      'Headline': ad.headline || '',
      'Headline 2': ad.headline_2 || '',
      'Headline 3': ad.headline_3 || '',
      'Headline 4': ad.headline_4 || '',
      'Headline 5': ad.headline_5 || '',
      'Description': ad.description || '',
      'Description 2': ad.description_2 || '',
      'Description 3': ad.description_3 || '',
      'Description 4': ad.description_4 || '',
      'Description 5': ad.description_5 || '',
      'Call to Action': ad.call_to_action || '',
      'Brand Name': ad.brand_name || '',
      'Destination URL': ad.destination_url || '',
      'URL Parameters': ad.url_parameters || '',
      'Ad Preview Link': previewLink,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(shellData);
  worksheet['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 35 }, { wch: 35 }, { wch: 45 },
    { wch: 50 }, { wch: 50 }, { wch: 50 }, { wch: 50 }, { wch: 50 },
    { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 40 },
    { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 40 },
    { wch: 20 }, { wch: 20 }, { wch: 60 }, { wch: 50 }, { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ads Export');

  // ---------- PMax Asset Groups tab (shared asset pool) ----------
  if (pmaxContext && pmaxContext.pmaxGroups.length > 0) {
    const creativeMap = pmaxContext.creativeMediaMap;
    const formatPool = (ids: string[]) =>
      ids
        .map((id) => {
          const info = creativeMap.get(id);
          if (!info) return id;
          return info.url ? `${info.name || id} (${info.url})` : info.name || id;
        })
        .join('\n');

    const pmaxRows = pmaxContext.pmaxGroups.map(({ group, headlines, longHeadlines, descriptions, creativesByBucket }) => ({
      'Market': group.market,
      'Phase': group.phase_name,
      'Asset Group': group.ad_group_name,
      'Group Name': group.group_name || '',
      'Business Name': group.business_name || '',
      'Final URL': group.final_url || '',
      'Call to Action': group.call_to_action || '',
      'Headlines': headlines.join('\n'),
      'Long Headlines': longHeadlines.join('\n'),
      'Descriptions': descriptions.join('\n'),
      [BUCKET_LABELS.marketing_image]: formatPool(creativesByBucket.marketing_image || []),
      [BUCKET_LABELS.square_image]: formatPool(creativesByBucket.square_image || []),
      [BUCKET_LABELS.portrait_image]: formatPool(creativesByBucket.portrait_image || []),
      [BUCKET_LABELS.logo]: formatPool(creativesByBucket.logo || []),
      [BUCKET_LABELS.video]: formatPool(creativesByBucket.video || []),
      'Status': group.status,
      'DSP Asset Group ID': group.dsp_entity_id || '',
    }));

    const pmaxSheet = XLSX.utils.json_to_sheet(pmaxRows);
    pmaxSheet['!cols'] = [
      { wch: 10 }, { wch: 25 }, { wch: 35 }, { wch: 30 }, { wch: 25 },
      { wch: 50 }, { wch: 20 }, { wch: 60 }, { wch: 60 }, { wch: 60 },
      { wch: 50 }, { wch: 50 }, { wch: 50 }, { wch: 50 }, { wch: 50 },
      { wch: 14 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(workbook, pmaxSheet, 'PMax Asset Groups');
  }

  // Generate filename
  const date = new Date().toISOString().split('T')[0];
  const safeName = campaign.name.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  const filename = `${safeName}_ads_export_${date}.xlsx`;

  // Download
  const blob = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const file = new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
