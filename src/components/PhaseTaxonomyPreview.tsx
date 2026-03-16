import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

  const campaignExtracted = campaignTemplate.length > 0 
    ? extractTaxonomyValues(campaignTemplate, context) 
    : {};
  const adsetExtracted = adsetTemplate.length > 0 
    ? extractTaxonomyValues(adsetTemplate, context) 
    : {};

  const campaignValues = { ...campaignExtracted, ...campaignCustomValues };
  const adsetValues = { ...adsetExtracted, ...adsetCustomValues };

  const campaignMissing = getMissingRequiredCount(campaignTemplate, campaignValues);
  const adsetMissing = getMissingRequiredCount(adsetTemplate, adsetValues);
  const totalMissing = campaignMissing + adsetMissing;

  return (
    <div className="flex items-center gap-1.5">
      {totalMissing > 0 ? (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 bg-amber-500/10">
          <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
          {totalMissing} pending
        </Badge>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-600 border-green-500/30">
                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                Names ready
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>Expand phase to copy campaign & ad set names</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
