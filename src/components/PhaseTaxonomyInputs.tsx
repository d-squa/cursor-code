import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, FileText, Info, RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  // Validation callback - reports whether all custom fields are complete
  onValidationChange?: (isComplete: boolean, missingCount: number) => void;
  // Custom parameter values (user-entered values for non-system params)
  customValues?: Record<string, string>;
  // Callback when user changes a custom parameter value
  onCustomValueChange?: (paramId: string, value: string) => void;
}

export function PhaseTaxonomyInputs({
  adAccountId,
  platform,
  entityType,
  context,
  onValidationChange,
  customValues = {},
  onCustomValueChange
}: PhaseTaxonomyInputsProps) {
  const [template, setTemplate] = useState<TaxonomyParam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [taxonomyString, setTaxonomyString] = useState("");
  const [extractedValues, setExtractedValues] = useState<Record<string, string>>({});

  // Load taxonomy template for this account and entity type
  const loadTemplate = useCallback(async (showRefreshState = false) => {
    if (!adAccountId) {
      setLoading(false);
      return;
    }

    if (showRefreshState) setRefreshing(true);
    else setLoading(true);

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
      setRefreshing(false);
    }
  }, [adAccountId, entityType, platform]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const handleRefresh = () => {
    loadTemplate(true);
  };

  // Merge extracted values with custom values (custom values override)
  const mergedValues = { ...extractedValues, ...customValues };

  // Auto-generate taxonomy when template, context, or custom values change
  useEffect(() => {
    if (template.length > 0) {
      const values = extractTaxonomyValues(template, context);
      setExtractedValues(values);
      
      // Merge with custom values for display
      const allValues = { ...values, ...customValues };
      const generated = generateTaxonomyString(template, allValues);
      setTaxonomyString(generated);
      
      // Report validation status using merged values
      const missing = getMissingRequiredCount(template, allValues);
      onValidationChange?.(missing === 0, missing);
    } else {
      // No template = complete (nothing to validate)
      onValidationChange?.(true, 0);
    }
  }, [template, context, customValues, onValidationChange]);

  if (loading) {
    return null;
  }

  if (template.length === 0) {
    return null; // No template configured, don't show anything
  }

  const missingCount = getMissingRequiredCount(template, mergedValues);
  const entityLabel = entityType === 'campaign' ? 'Campaign' : (platform === 'tiktok' ? 'Ad Group' : 'Ad Set');
  
  // Check if all system params have values (for different badge display)
  const systemParamsFilled = template
    .filter(p => p.system)
    .every(p => mergedValues[p.id] || p.value);

  // Render custom parameter input (dropdown for options, text input for text)
  const renderCustomParamInput = (param: TaxonomyParam) => {
    const currentValue = mergedValues[param.id] || '';
    
    if (param.type === 'options' && param.options && param.options.length > 0) {
      return (
        <div className="space-y-2 p-1">
          <Label className="text-xs font-medium">{param.label}</Label>
          {param.description && (
            <p className="text-xs text-muted-foreground">{param.description}</p>
          )}
          <Select
            value={currentValue}
            onValueChange={(value) => onCustomValueChange?.(param.id, value)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={`Select ${param.label}`} />
            </SelectTrigger>
            <SelectContent>
              {param.options.map((option) => (
                <SelectItem key={option} value={option} className="text-xs">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    
    // Default to text input
    return (
      <div className="space-y-2 p-1">
        <Label className="text-xs font-medium">{param.label}</Label>
        {param.description && (
          <p className="text-xs text-muted-foreground">{param.description}</p>
        )}
        <Input
          className="h-8 text-xs"
          placeholder={`Enter ${param.label}`}
          value={currentValue}
          onChange={(e) => onCustomValueChange?.(param.id, e.target.value)}
        />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {entityLabel} Name
        </Label>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh taxonomy template"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          {missingCount > 0 ? (
            <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
              <AlertCircle className="h-3 w-3 mr-1" />
              {missingCount} custom {missingCount === 1 ? 'field' : 'fields'} required
            </Badge>
          ) : systemParamsFilled ? (
            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Auto-generated
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Complete
            </Badge>
          )}
        </div>
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

      {/* Show extracted values breakdown with tooltips/popovers */}
      {template.length > 0 && (
        <TooltipProvider>
          <div className="flex flex-wrap gap-1.5">
            {template
              .filter(p => p.required !== false || p.system)
              .map(param => {
                const value = mergedValues[param.id] || param.value;
                const isSystemWithValue = param.system && value;
                const isSystemMissing = param.system && !value;
                const isCustomMissing = !param.system && !value;
                const isCustomFilled = !param.system && value;
                
                const badgeClassName = `text-xs ${
                  isCustomMissing 
                    ? 'border-destructive bg-destructive/10 text-destructive cursor-pointer hover:bg-destructive/20' 
                    : isCustomFilled
                      ? 'bg-green-500/10 text-green-700 border-green-500/30 cursor-pointer hover:bg-green-500/20'
                      : isSystemMissing 
                        ? 'border-dashed border-amber-500/50 text-amber-600 bg-amber-500/10 cursor-help' 
                        : isSystemWithValue 
                          ? 'bg-green-500/10 text-green-700 border-green-500/30 cursor-help'
                          : 'cursor-help'
                }`;

                // Custom params get Popover with input
                if (!param.system) {
                  return (
                    <Popover key={param.id}>
                      <PopoverTrigger asChild>
                        <Badge
                          variant={value ? "secondary" : "outline"}
                          className={badgeClassName}
                        >
                          {param.key}: {value || '—'}
                        </Badge>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-3" align="start">
                        {renderCustomParamInput(param)}
                      </PopoverContent>
                    </Popover>
                  );
                }
                
                // System params get Tooltip (read-only)
                return (
                  <Tooltip key={param.id}>
                    <TooltipTrigger asChild>
                      <Badge
                        variant={value ? "secondary" : "outline"}
                        className={badgeClassName}
                      >
                        <Info className="h-2.5 w-2.5 mr-1 opacity-60" />
                        {param.key}: {value || '—'}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px]">
                      <div className="space-y-1">
                        <p className="font-medium text-xs">{param.label}</p>
                        {param.description && (
                          <p className="text-xs text-muted-foreground">{param.description}</p>
                        )}
                        {!value && (
                          <p className="text-xs text-amber-600">
                            Configure this field in ActiPlan to auto-populate
                          </p>
                        )}
                        {value && (
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
