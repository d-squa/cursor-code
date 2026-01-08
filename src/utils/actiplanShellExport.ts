import * as XLSX from 'xlsx';

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

export function downloadActiplanShell(
  campaign: Campaign,
  creativeAssignments: CreativeAssignment[]
): void {
  const workbook = XLSX.utils.book_new();

  // Create rows - one per ad (creative assignment)
  const shellData: any[] = creativeAssignments.map(ad => {
    // Generate Meta ad preview link
    let previewLink = '';
    if (ad.dsp_creative_id && ad.platform.toLowerCase() === 'meta') {
      previewLink = `https://fb.me/adspreview/facebook/${ad.dsp_creative_id}`;
    } else if (ad.dsp_creative_id) {
      previewLink = ad.dsp_creative_id;
    }

    // Use display_name (DSP ad name) if available, otherwise fallback to creative name
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

  // Create worksheet from data
  const worksheet = XLSX.utils.json_to_sheet(shellData);

  // Set column widths
  const colWidths = [
    { wch: 12 },  // Platform
    { wch: 10 },  // Market
    { wch: 35 },  // Campaign Name
    { wch: 35 },  // Ad Set Name
    { wch: 45 },  // Ad Name
    { wch: 50 },  // Primary Text
    { wch: 50 },  // Primary Text 2
    { wch: 50 },  // Primary Text 3
    { wch: 50 },  // Primary Text 4
    { wch: 50 },  // Primary Text 5
    { wch: 40 },  // Headline
    { wch: 40 },  // Headline 2
    { wch: 40 },  // Headline 3
    { wch: 40 },  // Headline 4
    { wch: 40 },  // Headline 5
    { wch: 40 },  // Description
    { wch: 40 },  // Description 2
    { wch: 40 },  // Description 3
    { wch: 40 },  // Description 4
    { wch: 40 },  // Description 5
    { wch: 20 },  // Call to Action
    { wch: 20 },  // Brand Name
    { wch: 60 },  // Destination URL
    { wch: 50 },  // URL Parameters
    { wch: 60 },  // Ad Preview Link
  ];
  worksheet['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ads Export');

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
