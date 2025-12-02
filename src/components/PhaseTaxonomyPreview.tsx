import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TaxonomyParam, generateTaxonomyString } from "@/utils/taxonomyUtils";

interface PhaseTaxonomyPreviewProps {
  adAccountId: string;
  platform: 'meta' | 'tiktok';
  campaignTaxonomyValues?: Record<string, string>;
  adsetTaxonomyValues?: Record<string, string>;
  contextValues?: Record<string, string>;
}

interface TaxonomyTemplates {
  campaign: TaxonomyParam[];
  adset: TaxonomyParam[];
}

export function PhaseTaxonomyPreview({
  adAccountId,
  platform,
  campaignTaxonomyValues = {},
  adsetTaxonomyValues = {},
  contextValues = {}
}: PhaseTaxonomyPreviewProps) {
  const [templates, setTemplates] = useState<TaxonomyTemplates>({ campaign: [], adset: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTemplates = async () => {
      if (!adAccountId) {
        setLoading(false);
        return;
      }

      try {
        // First try to get the database UUID for this platform account
        let dbAccountId = adAccountId;
        
        if (platform === 'tiktok') {
          const { data: accountData } = await supabase
            .from('tiktok_ad_accounts')
            .select('id')
            .eq('advertiser_id', adAccountId)
            .maybeSingle();
          if (accountData?.id) dbAccountId = accountData.id;
        } else {
          const { data: accountData } = await supabase
            .from('meta_ad_accounts')
            .select('id')
            .eq('account_id', adAccountId)
            .maybeSingle();
          if (accountData?.id) dbAccountId = accountData.id;
        }

        const { data, error } = await supabase
          .from('taxonomy_templates')
          .select('entity_type, template')
          .eq('ad_account_id', dbAccountId)
          .eq('platform', platform)
          .in('entity_type', ['campaign', 'adset']);

        if (error) {
          console.error('Error loading taxonomy templates:', error);
          setLoading(false);
          return;
        }

        const newTemplates: TaxonomyTemplates = { campaign: [], adset: [] };
        data?.forEach(row => {
          if (row.entity_type === 'campaign' || row.entity_type === 'adset') {
            newTemplates[row.entity_type] = row.template as unknown as TaxonomyParam[];
          }
        });
        setTemplates(newTemplates);
      } catch (err) {
        console.error('Error loading taxonomy templates:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTemplates();
  }, [adAccountId, platform]);

  if (loading || (templates.campaign.length === 0 && templates.adset.length === 0)) {
    return null;
  }

  // Count missing required fields
  const getMissingCount = (template: TaxonomyParam[], values: Record<string, string>) => {
    let missing = 0;
    template.forEach(param => {
      if (param.required) {
        const value = values[param.id] || contextValues[param.id] || param.value;
        if (!value) missing++;
      }
    });
    return missing;
  };

  const campaignMissing = getMissingCount(templates.campaign, campaignTaxonomyValues);
  const adsetMissing = getMissingCount(templates.adset, adsetTaxonomyValues);
  const totalMissing = campaignMissing + adsetMissing;
  const hasTemplates = templates.campaign.length > 0 || templates.adset.length > 0;

  if (!hasTemplates) return null;

  // Generate preview strings
  const campaignPreview = templates.campaign.length > 0 
    ? generateTaxonomyString(templates.campaign, { ...contextValues, ...campaignTaxonomyValues })
    : '';
  const adsetPreview = templates.adset.length > 0
    ? generateTaxonomyString(templates.adset, { ...contextValues, ...adsetTaxonomyValues })
    : '';

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <FileText className="h-3 w-3 text-muted-foreground" />
      {totalMissing > 0 ? (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          {totalMissing} taxonomy fields required
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono max-w-[200px] truncate" title={campaignPreview || adsetPreview}>
          {(campaignPreview || adsetPreview).substring(0, 25)}{(campaignPreview || adsetPreview).length > 25 ? '...' : ''}
        </Badge>
      )}
    </div>
  );
}
