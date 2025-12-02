import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TaxonomyParam, generateTaxonomyString } from "@/utils/taxonomyUtils";

interface PhaseTaxonomyInputsProps {
  adAccountId: string;
  platform: 'meta' | 'tiktok';
  entityType: 'campaign' | 'adset';
  taxonomyValues: Record<string, string>;
  onValuesChange: (values: Record<string, string>) => void;
  // Context values that are auto-filled from phase/campaign data
  contextValues?: {
    objective?: string;
    optimizationGoal?: string;
    country?: string;
    funnelStage?: string;
    placement?: string;
    bidStrategy?: string;
    conversionEvent?: string;
  };
}

export function PhaseTaxonomyInputs({
  adAccountId,
  platform,
  entityType,
  taxonomyValues,
  onValuesChange,
  contextValues
}: PhaseTaxonomyInputsProps) {
  const [template, setTemplate] = useState<TaxonomyParam[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewString, setPreviewString] = useState("");

  // Load taxonomy template for this account and entity type
  useEffect(() => {
    const loadTemplate = async () => {
      if (!adAccountId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('taxonomy_templates')
          .select('template')
          .eq('ad_account_id', adAccountId)
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

  // Update preview string when values change
  useEffect(() => {
    if (template.length > 0) {
      const mergedValues = { ...contextValues, ...taxonomyValues };
      const preview = generateTaxonomyString(template, mergedValues);
      setPreviewString(preview);
    }
  }, [template, taxonomyValues, contextValues]);

  // Get user-editable params (non-system params that need user input)
  const getUserEditableParams = () => {
    return template.filter(param => {
      // System params with fixed values or auto-filled from context are not editable
      if (param.type === 'fixed' && param.value) return false;
      
      // Check if this param is auto-filled from context
      const contextKey = param.id;
      if (contextValues && contextKey in contextValues && contextValues[contextKey as keyof typeof contextValues]) {
        return false;
      }
      
      return true;
    });
  };

  const handleValueChange = (paramId: string, value: string) => {
    onValuesChange({
      ...taxonomyValues,
      [paramId]: value
    });
  };

  // Check if all required fields are filled
  const getMissingRequiredFields = () => {
    const missing: string[] = [];
    template.forEach(param => {
      if (param.required) {
        const value = taxonomyValues[param.id] || 
          (contextValues && param.id in contextValues ? contextValues[param.id as keyof typeof contextValues] : undefined) ||
          param.value;
        if (!value) {
          missing.push(param.label);
        }
      }
    });
    return missing;
  };

  if (loading) {
    return null; // Don't show anything while loading
  }

  if (template.length === 0) {
    return null; // No taxonomy template configured
  }

  const editableParams = getUserEditableParams();
  const missingFields = getMissingRequiredFields();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {entityType === 'campaign' ? 'Campaign' : 'Ad Set'} Taxonomy
        </Label>
        {missingFields.length > 0 && (
          <Badge variant="destructive" className="text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />
            {missingFields.length} required
          </Badge>
        )}
      </div>

      {/* Preview */}
      {previewString && (
        <div className="p-2 bg-muted rounded-md">
          <p className="text-xs text-muted-foreground mb-1">Preview:</p>
          <code className="text-xs font-mono break-all">{previewString}</code>
        </div>
      )}

      {/* Editable Parameters */}
      {editableParams.length > 0 && (
        <div className="grid gap-3">
          {editableParams.map(param => (
            <div key={param.id} className="space-y-1">
              <Label className="text-xs">
                {param.label}
                {param.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              
              {param.type === 'options' && param.options ? (
                <Select
                  value={taxonomyValues[param.id] || ''}
                  onValueChange={(value) => handleValueChange(param.id, value)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={`Select ${param.label}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {param.options.map(option => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : param.type === 'number' ? (
                <Input
                  type="number"
                  value={taxonomyValues[param.id] || ''}
                  onChange={(e) => handleValueChange(param.id, e.target.value)}
                  placeholder={`Enter ${param.label}`}
                  className="h-8 text-xs"
                />
              ) : (
                <Input
                  type="text"
                  value={taxonomyValues[param.id] || ''}
                  onChange={(e) => {
                    // Remove invalid characters
                    const cleaned = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
                    handleValueChange(param.id, cleaned.toUpperCase());
                  }}
                  placeholder={`Enter ${param.label}`}
                  className="h-8 text-xs"
                  maxLength={20}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {editableParams.length === 0 && (
        <p className="text-xs text-muted-foreground">
          All taxonomy fields are auto-filled from campaign settings.
        </p>
      )}
    </div>
  );
}

// Helper function to check if taxonomy is complete for a phase
export function isTaxonomyComplete(
  template: TaxonomyParam[],
  taxonomyValues: Record<string, string>,
  contextValues?: Record<string, string>
): boolean {
  for (const param of template) {
    if (param.required) {
      const value = taxonomyValues[param.id] || 
        contextValues?.[param.id] ||
        param.value;
      if (!value) return false;
    }
  }
  return true;
}
