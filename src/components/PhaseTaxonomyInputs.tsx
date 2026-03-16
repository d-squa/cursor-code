import { useState, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, FileText, Info, RefreshCw, AlertCircle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
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
  getMissingRequiredCount,
} from "@/utils/taxonomyUtils";

interface PhaseTaxonomyInputsProps {
  platform: 'meta' | 'tiktok' | 'google';
  entityType: 'campaign' | 'adset';
  context: TaxonomyContext;
  onValidationChange?: (isComplete: boolean, missingCount: number) => void;
  customValues?: Record<string, string>;
  onCustomValueChange?: (paramId: string, value: string) => void;
  // Template passed from parent (shared hook)
  template: TaxonomyParam[];
  onRefresh?: () => void;
}

export function PhaseTaxonomyInputs({
  platform,
  entityType,
  context,
  onValidationChange,
  customValues = {},
  onCustomValueChange,
  template,
  onRefresh,
}: PhaseTaxonomyInputsProps) {
  const [taxonomyString, setTaxonomyString] = useState("");
  const [extractedValues, setExtractedValues] = useState<Record<string, string>>({});

  const validationCallbackRef = useRef(onValidationChange);
  validationCallbackRef.current = onValidationChange;

  const mergedValues = { ...extractedValues, ...customValues };
  const customValuesKey = JSON.stringify(customValues);

  useEffect(() => {
    if (template.length > 0) {
      const values = extractTaxonomyValues(template, context);
      setExtractedValues(values);
      
      const allValues = { ...values, ...customValues };
      const generated = generateTaxonomyString(template, allValues);
      setTaxonomyString(generated);
      
      const missing = getMissingRequiredCount(template, allValues);
      validationCallbackRef.current?.(missing === 0, missing);
    } else {
      validationCallbackRef.current?.(true, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, context, customValuesKey]);

  if (template.length === 0) {
    return null;
  }

  const missingCount = getMissingRequiredCount(template, mergedValues);
  const entityLabel = entityType === 'campaign' ? 'Campaign' : (platform === 'tiktok' || platform === 'google' ? 'Ad Group' : 'Ad Set');
  
  const systemParamsFilled = template
    .filter(p => p.system)
    .every(p => mergedValues[p.id] || p.value);

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
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onRefresh}
              title="Refresh taxonomy template"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
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

      <div className="p-3 bg-muted rounded-md border">
        {taxonomyString ? (
          <code className="text-sm font-mono break-all">{taxonomyString}</code>
        ) : (
          <span className="text-sm text-muted-foreground italic">
            Configure campaign settings to generate name
          </span>
        )}
      </div>

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

                if (!param.system) {
                  return (
                    <Popover key={param.id}>
                      <PopoverTrigger asChild>
                        <button type="button" className="focus:outline-none">
                          <Badge
                            variant={value ? "secondary" : "outline"}
                            className={badgeClassName}
                          >
                            {param.key}: {value || '—'}
                          </Badge>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-3 pointer-events-auto" align="start">
                        {renderCustomParamInput(param)}
                      </PopoverContent>
                    </Popover>
                  );
                }
                
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
