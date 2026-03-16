import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, AlertCircle, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  const campaignTaxonomy = campaignTemplate.length > 0 
    ? generateTaxonomyString(campaignTemplate, campaignValues)
    : '';
  const adsetTaxonomy = adsetTemplate.length > 0
    ? generateTaxonomyString(adsetTemplate, adsetValues)
    : '';

  const campaignMissing = getMissingRequiredCount(campaignTemplate, campaignValues);
  const adsetMissing = getMissingRequiredCount(adsetTemplate, adsetValues);
  const totalMissing = campaignMissing + adsetMissing;

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(`${field} name copied to clipboard`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const CopyableBadge = ({ text, field }: { text: string; field: string }) => {
    const isCopied = copiedField === field;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className="text-[10px] px-1.5 py-0 font-mono max-w-[200px] truncate bg-green-500/10 text-green-600 border-green-500/30 cursor-pointer hover:bg-green-500/20 transition-colors" 
              onClick={(e) => {
                e.stopPropagation();
                handleCopy(text, field);
              }}
            >
              {isCopied ? (
                <Check className="h-2.5 w-2.5 mr-0.5" />
              ) : (
                <Copy className="h-2.5 w-2.5 mr-0.5" />
              )}
              {text.substring(0, 25)}{text.length > 25 ? '...' : ''}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="font-mono text-xs max-w-[400px] break-all">
            <p className="mb-1 font-sans font-medium">{field} Name (click to copy)</p>
            {text}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <FileText className="h-3 w-3 text-muted-foreground" />
      {totalMissing > 0 ? (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 bg-amber-500/10">
          <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
          {totalMissing} pending
        </Badge>
      ) : (
        <div className="flex items-center gap-1">
          {campaignTaxonomy && (
            <CopyableBadge text={campaignTaxonomy} field="Campaign" />
          )}
          {adsetTaxonomy && (
            <CopyableBadge text={adsetTaxonomy} field="Ad Set" />
          )}
          {!campaignTaxonomy && !adsetTaxonomy && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
              No name
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
