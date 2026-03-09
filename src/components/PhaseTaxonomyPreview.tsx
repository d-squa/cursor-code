import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { 
  TaxonomyParam, 
  TaxonomyContext,
  extractTaxonomyValues,
  generateTaxonomyString,
  getMissingRequiredCount
} from "@/utils/taxonomyUtils";

interface PhaseTaxonomyPreviewProps {
  adAccountId: string;
  platform: 'meta' | 'tiktok' | 'google';
  // Context values automatically extracted from ActiPlan phase/market data
  context: TaxonomyContext;
  // Custom parameter values filled by user
  campaignCustomValues?: Record<string, string>;
  adsetCustomValues?: Record<string, string>;
}

interface TaxonomyTemplates {
  campaign: TaxonomyParam[];
  adset: TaxonomyParam[];
}

export function PhaseTaxonomyPreview({
  adAccountId,
  platform,
  context,
  campaignCustomValues = {},
  adsetCustomValues = {}
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
        // First resolve the internal UUID for this platform account.
        // The taxonomy_templates.ad_account_id column is UUID, so we MUST
        // convert platform-native IDs (like TikTok's numeric advertiser_id) first.
        let dbAccountId: string | null = null;

        if (platform === 'tiktok') {
          const { data: accountData } = await supabase
            .from('tiktok_ad_accounts')
            .select('id')
            .eq('advertiser_id', adAccountId)
            .maybeSingle();
          dbAccountId = accountData?.id ?? null;
        } else {
          const { data: accountData } = await supabase
            .from('meta_ad_accounts')
            .select('id')
            .eq('account_id', adAccountId)
            .maybeSingle();
          dbAccountId = accountData?.id ?? null;
        }

        // If we couldn't resolve a UUID, we can't query taxonomy_templates
        if (!dbAccountId) {
          setLoading(false);
          return;
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

  // Extract values and merge with custom values
  const campaignExtracted = templates.campaign.length > 0 
    ? extractTaxonomyValues(templates.campaign, context) 
    : {};
  const adsetExtracted = templates.adset.length > 0 
    ? extractTaxonomyValues(templates.adset, context) 
    : {};

  // Merge extracted system values with user-provided custom values
  const campaignValues = { ...campaignExtracted, ...campaignCustomValues };
  const adsetValues = { ...adsetExtracted, ...adsetCustomValues };

  const campaignTaxonomy = templates.campaign.length > 0 
    ? generateTaxonomyString(templates.campaign, campaignValues)
    : '';
  const adsetTaxonomy = templates.adset.length > 0
    ? generateTaxonomyString(templates.adset, adsetValues)
    : '';

  // Calculate missing counts (only custom params, system params should auto-fill)
  const campaignMissing = getMissingRequiredCount(templates.campaign, campaignValues);
  const adsetMissing = getMissingRequiredCount(templates.adset, adsetValues);
  const totalMissing = campaignMissing + adsetMissing;

  const displayTaxonomy = campaignTaxonomy || adsetTaxonomy;
  const hasTemplates = templates.campaign.length > 0 || templates.adset.length > 0;

  if (!hasTemplates) return null;

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <FileText className="h-3 w-3 text-muted-foreground" />
      {totalMissing > 0 ? (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 bg-amber-500/10">
          <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
          {totalMissing} pending
        </Badge>
      ) : displayTaxonomy ? (
        <Badge 
          variant="outline" 
          className="text-[10px] px-1.5 py-0 font-mono max-w-[200px] truncate bg-green-500/10 text-green-600 border-green-500/30" 
          title={displayTaxonomy}
        >
          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
          {displayTaxonomy.substring(0, 25)}{displayTaxonomy.length > 25 ? '...' : ''}
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
          No name
        </Badge>
      )}
    </div>
  );
}
