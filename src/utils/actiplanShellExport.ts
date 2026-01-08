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
  primary_text: string | null;
  description: string | null;
  call_to_action: string | null;
  url_parameters: string | null;
  creative?: {
    name: string;
    media_type: string | null;
    media_urls: string[] | null;
    thumbnail_url: string | null;
  };
}

interface AdSetStatus {
  id: string;
  platform: string;
  market: string;
  phase_name: string | null;
  entity_type: string;
  entity_name: string | null;
  dsp_entity_id: string | null;
  status: string;
  planned_budget: number | null;
  planned_reach: number | null;
  planned_impressions: number | null;
  planned_clicks: number | null;
  planned_conversions: number | null;
}

interface Campaign {
  name: string;
  total_budget: number;
  start_date: string;
  end_date: string;
}

export function downloadActiplanShell(
  campaign: Campaign,
  adSetStatuses: AdSetStatus[],
  creativeAssignments: CreativeAssignment[]
): void {
  const workbook = XLSX.utils.book_new();

  // Create full shell data combining ad sets and creatives
  const shellData: any[] = [];

  // Group creatives by platform/market/phase/adset
  const creativesByStructure = new Map<string, CreativeAssignment[]>();
  creativeAssignments.forEach(ca => {
    const key = `${ca.platform}|${ca.market}|${ca.phase_name}|${ca.ad_set_name || 'default'}`;
    if (!creativesByStructure.has(key)) {
      creativesByStructure.set(key, []);
    }
    creativesByStructure.get(key)!.push(ca);
  });

  // Build rows for each platform/market/phase/adset/ad combination
  adSetStatuses.forEach(adSet => {
    const key = `${adSet.platform}|${adSet.market}|${adSet.phase_name || ''}|${adSet.entity_name || 'default'}`;
    const creatives = creativesByStructure.get(key) || [];

    if (creatives.length === 0) {
      // Add row for ad set without creatives
      shellData.push({
        'Platform': adSet.platform,
        'Market': adSet.market,
        'Campaign/Phase': adSet.phase_name || campaign.name,
        'Entity Type': adSet.entity_type,
        'Ad Set Name': adSet.entity_name || '-',
        'Ad Set Status': adSet.status,
        'DSP Ad Set ID': adSet.dsp_entity_id || '-',
        'Planned Budget': adSet.planned_budget || '-',
        'Planned Reach': adSet.planned_reach || '-',
        'Planned Impressions': adSet.planned_impressions || '-',
        'Planned Clicks': adSet.planned_clicks || '-',
        'Planned Conversions': adSet.planned_conversions || '-',
        'Creative Name': '-',
        'Media Type': '-',
        'Ad Status': '-',
        'DSP Ad ID': '-',
        'Headline': '-',
        'Primary Text': '-',
        'Description': '-',
        'Call to Action': '-',
        'Destination URL': '-',
        'URL Parameters': '-',
        'Creative Preview URL': '-',
        'Ad Mockup URL': '-',
      });
    } else {
      // Add row for each creative in the ad set
      creatives.forEach(creative => {
        const creativePreviewUrl = creative.creative?.media_urls?.[0] || 
          creative.creative?.thumbnail_url || '-';
        
        // Generate mockup URL placeholder (in real implementation, this would be a link to a mockup generator)
        const mockupUrl = creative.dsp_creative_id 
          ? `https://business.facebook.com/ads/manager/account/${creative.dsp_creative_id}` 
          : '-';

        shellData.push({
          'Platform': adSet.platform,
          'Market': adSet.market,
          'Campaign/Phase': adSet.phase_name || campaign.name,
          'Entity Type': adSet.entity_type,
          'Ad Set Name': adSet.entity_name || creative.ad_set_name || '-',
          'Ad Set Status': adSet.status,
          'DSP Ad Set ID': adSet.dsp_entity_id || '-',
          'Planned Budget': adSet.planned_budget || '-',
          'Planned Reach': adSet.planned_reach || '-',
          'Planned Impressions': adSet.planned_impressions || '-',
          'Planned Clicks': adSet.planned_clicks || '-',
          'Planned Conversions': adSet.planned_conversions || '-',
          'Creative Name': creative.creative?.name || '-',
          'Media Type': creative.creative?.media_type || '-',
          'Ad Status': creative.status || 'pending',
          'DSP Ad ID': creative.dsp_creative_id || '-',
          'Headline': creative.headline || '-',
          'Primary Text': creative.primary_text || '-',
          'Description': creative.description || '-',
          'Call to Action': creative.call_to_action || '-',
          'Destination URL': creative.destination_url || '-',
          'URL Parameters': creative.url_parameters || '-',
          'Creative Preview URL': creativePreviewUrl,
          'Ad Mockup URL': mockupUrl,
        });
      });
    }
  });

  // Create worksheet from data
  const worksheet = XLSX.utils.json_to_sheet(shellData);

  // Set column widths
  const colWidths = [
    { wch: 12 }, // Platform
    { wch: 10 }, // Market
    { wch: 20 }, // Campaign/Phase
    { wch: 10 }, // Entity Type
    { wch: 25 }, // Ad Set Name
    { wch: 12 }, // Ad Set Status
    { wch: 20 }, // DSP Ad Set ID
    { wch: 12 }, // Planned Budget
    { wch: 12 }, // Planned Reach
    { wch: 14 }, // Planned Impressions
    { wch: 12 }, // Planned Clicks
    { wch: 14 }, // Planned Conversions
    { wch: 30 }, // Creative Name
    { wch: 10 }, // Media Type
    { wch: 10 }, // Ad Status
    { wch: 20 }, // DSP Ad ID
    { wch: 40 }, // Headline
    { wch: 50 }, // Primary Text
    { wch: 40 }, // Description
    { wch: 15 }, // Call to Action
    { wch: 50 }, // Destination URL
    { wch: 40 }, // URL Parameters
    { wch: 50 }, // Creative Preview URL
    { wch: 50 }, // Ad Mockup URL
  ];
  worksheet['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Actiplan Shell');

  // Generate filename
  const date = new Date().toISOString().split('T')[0];
  const safeName = campaign.name.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  const filename = `${safeName}_actiplan_shell_${date}.xlsx`;

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
