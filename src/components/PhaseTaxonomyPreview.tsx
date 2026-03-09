import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { 
  TaxonomyParam, 
  TaxonomyContext,
  extractTaxonomyValues,
  generateTaxonomyString,
  getMissingRequiredCount,
} from "@/utils/taxonomyUtils";

interface PhaseTaxonomyPreviewProps {
  platform: 'meta' | 'tiktok' | 'google';
  context: TaxonomyContext;
  campaignCustomValues?: Record<string, string>;
  adsetCustomValues?: Record<string, string>;
  // Templates passed from parent (shared hook)
  campaignTemplate: TaxonomyParam[];
  adsetTemplate: TaxonomyParam[];
}

export function PhaseTaxonomyPreview({
  platform,
  context,
  campaignCustomValues = {},
  adsetCustomValues = {},
  campaignTemplate,
  adsetTemplate,
}: PhaseTaxonomyPreviewProps) {
  if (campaignTemplate.length === 0 && adsetTemplate.length === 0) {
    return null;
  }

  // Extract values and merge with custom values
  const campaignExtracted = campaignTemplate.length > 0 
    ? extractTaxonomyValues(campaignTemplate, context) 
    : {};
  const adsetExtracted = adsetTemplate.length > 0 
    ? extractTaxonomyValues(adsetTemplate, context) 
    : {};

  const campaignValues = { ...campaignExtracted, ...campaignCustomValues };
  const adsetValues = { ...adsetExtracted, ...adsetCustomValues };

  const campaignTaxonomy = campaignTemplate.length > 0 
    ? generateTaxonomyString(campaignTemplate, campaignValues)
    : '';
  const adsetTaxonomy = adsetTemplate.length > 0
    ? generateTaxonomyString(adsetTemplate, adsetValues)
    : '';

  const campaignMissing = getMissingRequiredCount(campaignTemplate, campaignValues);
  const adsetMissing = getMissingRequiredCount(adsetTemplate, adsetValues);
  const totalMissing = campaignMissing + adsetMissing;

  const displayTaxonomy = campaignTaxonomy || adsetTaxonomy;

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
