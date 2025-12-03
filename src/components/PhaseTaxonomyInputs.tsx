import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileText, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  TaxonomyParam, 
  TaxonomyContext,
  extractTaxonomyValues,
  generateTaxonomyString,
  getMissingRequiredCount
} from "@/utils/taxonomyUtils";

interface PhaseTaxonomyInputsProps {
  adAccountId: string;
  platform: 'meta' | 'tiktok';
  entityType: 'campaign' | 'adset';
  // Context values automatically extracted from ActiPlan
  context: TaxonomyContext;
}

export function PhaseTaxonomyInputs({
  adAccountId,
  platform,
  entityType,
  context
}: PhaseTaxonomyInputsProps) {
  const [template, setTemplate] = useState<TaxonomyParam[]>([]);
  const [loading, setLoading] = useState(true);
  const [taxonomyString, setTaxonomyString] = useState("");
  const [extractedValues, setExtractedValues] = useState<Record<string, string>>({});

  // Load taxonomy template for this account and entity type
  useEffect(() => {
    const loadTemplate = async () => {
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
          .select('template')
          .eq('ad_account_id', dbAccountId)
          .eq('entity_type', entityType)
          .eq('platform', platform)
          .maybeSingle();

        if (error) {
          console.error('Error loading taxonomy template:', error);
          setLoading(false);
          return;
        }

        if (data?.template) {
          const templateData = data.template as unknown as TaxonomyParam[];
          setTemplate(templateData);
        }
      } catch (err) {
        console.error('Error loading taxonomy template:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTemplate();
  }, [adAccountId, entityType, platform]);

  // Auto-generate taxonomy when template or context changes
  useEffect(() => {
    if (template.length > 0) {
      const values = extractTaxonomyValues(template, context);
      setExtractedValues(values);
      const generated = generateTaxonomyString(template, values);
      setTaxonomyString(generated);
    }
  }, [template, context]);

  if (loading) {
    return null;
  }

  if (template.length === 0) {
    return null; // No template configured, don't show anything
  }

  const missingCount = getMissingRequiredCount(template, extractedValues);
  const isComplete = missingCount === 0;
  const entityLabel = entityType === 'campaign' ? 'Campaign' : (platform === 'tiktok' ? 'Ad Group' : 'Ad Set');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {entityLabel} Name
        </Label>
        {isComplete ? (
          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Auto-generated
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-xs">
            {missingCount} values missing
          </Badge>
        )}
      </div>

      {/* Generated Taxonomy Preview */}
      <div className="p-3 bg-muted rounded-md border">
        {taxonomyString ? (
          <code className="text-sm font-mono break-all">{taxonomyString}</code>
        ) : (
          <span className="text-sm text-muted-foreground italic">
            Configure campaign settings to generate name
          </span>
        )}
      </div>

      {/* Show extracted values breakdown with tooltips */}
      {template.length > 0 && (
        <TooltipProvider>
          <div className="flex flex-wrap gap-1.5">
            {template
              .filter(p => p.required !== false || p.system)
              .map(param => {
                const value = extractedValues[param.id] || param.value;
                const isSystemWithValue = param.system && value;
                const isSystemMissing = param.system && !value;
                
                return (
                  <Tooltip key={param.id}>
                    <TooltipTrigger asChild>
                      <Badge
                        variant={value ? "secondary" : "outline"}
                        className={`text-xs cursor-help ${
                          isSystemMissing 
                            ? 'border-dashed border-amber-500/50 text-amber-600 bg-amber-500/10' 
                            : isSystemWithValue 
                              ? 'bg-green-500/10 text-green-700 border-green-500/30'
                              : !value 
                                ? 'border-dashed text-muted-foreground' 
                                : ''
                        }`}
                      >
                        {param.system && <Info className="h-2.5 w-2.5 mr-1 opacity-60" />}
                        {param.key}: {value || '—'}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px]">
                      <div className="space-y-1">
                        <p className="font-medium text-xs">{param.label}</p>
                        {param.description && (
                          <p className="text-xs text-muted-foreground">{param.description}</p>
                        )}
                        {param.system && !value && (
                          <p className="text-xs text-amber-600">
                            Configure this field in ActiPlan to auto-populate
                          </p>
                        )}
                        {param.system && value && (
                          <p className="text-xs text-green-600">✓ Auto-filled from ActiPlan</p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

// Helper function to check if taxonomy is complete for a phase
export function isTaxonomyComplete(
  template: TaxonomyParam[],
  context: TaxonomyContext
): boolean {
  const values = extractTaxonomyValues(template, context);
  return getMissingRequiredCount(template, values) === 0;
}

// Export for use in campaign publishing
export function generatePhaseTaxonomy(
  template: TaxonomyParam[],
  context: TaxonomyContext
): string {
  const values = extractTaxonomyValues(template, context);
  return generateTaxonomyString(template, values);
}
