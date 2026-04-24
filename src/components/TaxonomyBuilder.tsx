import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  GripVertical, 
  Plus, 
  Trash2, 
  Save, 
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Eye,
  Settings2,
  Info
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  TaxonomyParam,
  TaxonomyParamType,
  getDefaultCampaignParams,
  getDefaultAdSetParams,
  getDefaultAdParams,
  previewTaxonomy,
  validateTaxonomyString,
  getAllAvailableParams,
} from "@/utils/taxonomyUtils";
import { invalidateTaxonomyCache } from "@/hooks/useTaxonomyTemplates";

interface TaxonomyBuilderProps {
  adAccountId: string;
  platform: 'meta' | 'tiktok' | 'google';
  userId: string;
  entityType: 'campaign' | 'adset' | 'ad';
  onSave?: () => void;
}

const PARAM_TYPE_OPTIONS: { value: TaxonomyParamType; label: string }[] = [
  { value: 'mixed', label: 'Mixed Value' },
  { value: 'number', label: 'Numbers Only' },
  { value: 'fixed', label: 'Fixed Value' },
  { value: 'options', label: 'Dropdown Options' },
  { value: 'text', label: 'Free Text' },
];

function mergeTemplateWithDefaults(params: TaxonomyParam[], defaults: TaxonomyParam[]): TaxonomyParam[] {
  const defaultIds = new Set(defaults.map((param) => param.id));
  const paramMap = new Map(params.map((param) => [param.id, param]));
  const mergedDefaults = defaults.map((defaultParam) => ({
    ...defaultParam,
    ...(paramMap.get(defaultParam.id) || {}),
  }));
  const customOnly = params.filter((param) => !defaultIds.has(param.id) && param.id !== 'qcState' && param.key !== 'QC');
  return [...mergedDefaults, ...customOnly];
}

export default function TaxonomyBuilder({
  adAccountId,
  platform,
  userId,
  entityType,
  onSave,
}: TaxonomyBuilderProps) {
  const [params, setParams] = useState<TaxonomyParam[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [showAddParam, setShowAddParam] = useState(false);
  const [newParam, setNewParam] = useState<Partial<TaxonomyParam>>({
    key: '',
    label: '',
    type: 'text',
    options: [],
    description: '',
  });
  const [newOptionValue, setNewOptionValue] = useState('');

  useEffect(() => {
    loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adAccountId, entityType, platform]);

  const resolveInternalAdAccountId = async (): Promise<string> => {
    if (!adAccountId) return adAccountId;

    try {
      if (platform === 'tiktok') {
        const { data } = await supabase
          .from('tiktok_ad_accounts')
          .select('id')
          .eq('advertiser_id', adAccountId)
          .maybeSingle();
        return data?.id || adAccountId;
      }

      if (platform === 'google') {
        const { data } = await supabase
          .from('google_ad_accounts')
          .select('id')
          .eq('customer_id', adAccountId)
          .maybeSingle();
        if (!data) {
          // Also try account_id
          const { data: data2 } = await supabase
            .from('google_ad_accounts')
            .select('id')
            .eq('account_id', adAccountId)
            .maybeSingle();
          return data2?.id || adAccountId;
        }
        return data?.id || adAccountId;
      }

      if (platform === 'meta') {
        const { data } = await supabase
          .from('meta_ad_accounts')
          .select('id')
          .eq('account_id', adAccountId)
          .maybeSingle();
        return data?.id || adAccountId;
      }

      return adAccountId;
    } catch {
      return adAccountId;
    }
  };

  const loadTemplate = async () => {
    setLoading(true);

    try {
      const internalAdAccountId = await resolveInternalAdAccountId();

      // Prefer internal UUID (new standard), but fall back to legacy platform ID if needed.
      const tryLoad = async (accountIdToTry: string) => {
        const { data, error } = await supabase
          .from('taxonomy_templates')
          .select('*')
          .eq('ad_account_id', accountIdToTry)
          .eq('entity_type', entityType)
          .eq('platform', platform)
          .maybeSingle();

        return { data, error };
      };

      // 1) Try internal UUID first
      let { data, error } = await tryLoad(internalAdAccountId);

      // 2) If missing and internal differs, try legacy platform ID (old behavior)
      if (!data && internalAdAccountId !== adAccountId) {
        const legacy = await tryLoad(adAccountId);
        data = legacy.data;
        error = legacy.error;

        // If legacy exists, migrate it to internal UUID so ActiPlan + publishing can find it.
        if (data?.template && internalAdAccountId) {
          try {
            const { data: migrated, error: migrateError } = await supabase
              .from('taxonomy_templates')
              .insert([
                {
                  ad_account_id: internalAdAccountId,
                  platform,
                  entity_type: entityType,
                  template: JSON.parse(JSON.stringify(data.template)) as Json,
                  user_id: userId,
                },
              ])
              .select()
              .single();

            if (!migrateError && migrated) {
              setTemplateId(migrated.id);
              setParams((migrated.template as unknown) as TaxonomyParam[]);
              return;
            }
          } catch {
            // Ignore migration errors; we will still use legacy template for editing.
          }
        }
      }

      if (error) throw error;

      if (data) {
        const existingTemplate = ((data.template as unknown) as TaxonomyParam[]).filter(
          (param) => param.id !== 'qcState' && param.key !== 'QC'
        );
        const mergedTemplate = mergeTemplateWithDefaults(
          existingTemplate,
          getDefaultParams()
        );

        setTemplateId(data.id);
        setParams(mergedTemplate);

        if (JSON.stringify(mergedTemplate) !== JSON.stringify(data.template)) {
          await supabase
            .from('taxonomy_templates')
            .update({
              template: JSON.parse(JSON.stringify(mergedTemplate)) as Json,
              updated_at: new Date().toISOString(),
            })
            .eq('id', data.id);
        }
      } else {
        // Generate default template
        const defaultParams = getDefaultParams();
        setParams(defaultParams);
        // Auto-save default template under internal UUID (if available)
        await saveTemplate(defaultParams, true, internalAdAccountId);
      }
    } catch (error: any) {
      console.error('Error loading taxonomy template:', error);
      // Fall back to defaults
      setParams(getDefaultParams());
    } finally {
      setLoading(false);
    }
  };

  const getDefaultParams = (): TaxonomyParam[] => {
    switch (entityType) {
      case 'campaign':
        return getDefaultCampaignParams(platform);
      case 'adset':
        return getDefaultAdSetParams(platform);
      case 'ad':
        return getDefaultAdParams();
      default:
        return [];
    }
  };

  const saveTemplate = async (paramsToSave: TaxonomyParam[], isDefault = false, overrideAdAccountId?: string) => {
    setSaving(true);
    try {
      const mergedParams = mergeTemplateWithDefaults(paramsToSave, getDefaultParams());

      if (templateId) {
        const { error } = await supabase
          .from('taxonomy_templates')
          .update({
            template: JSON.parse(JSON.stringify(mergedParams)) as Json,
            updated_at: new Date().toISOString(),
          })
          .eq('id', templateId);

        if (error) throw error;
      } else {
        const internalAdAccountId = overrideAdAccountId || (await resolveInternalAdAccountId());

        const { data, error } = await supabase
          .from('taxonomy_templates')
          .insert([
            {
              ad_account_id: internalAdAccountId,
              platform,
              entity_type: entityType,
              template: JSON.parse(JSON.stringify(mergedParams)) as Json,
              user_id: userId,
            },
          ])
          .select()
          .single();

        if (error) throw error;
        setTemplateId(data.id);
      }

      invalidateTaxonomyCache(adAccountId, platform);

      if (!isDefault) {
        toast.success('Taxonomy template saved');
        onSave?.();
      }
    } catch (error: any) {
      console.error('Error saving taxonomy template:', error);
      if (!isDefault) {
        toast.error('Failed to save taxonomy template');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    saveTemplate(params);
  };

  const resetToDefault = () => {
    const defaultParams = getDefaultParams();
    setParams(defaultParams);
    toast.info('Reset to default template');
  };

  const moveParam = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= params.length) return;

    const newParams = [...params];
    [newParams[index], newParams[newIndex]] = [newParams[newIndex], newParams[index]];
    setParams(newParams);
  };

  const toggleParam = (index: number) => {
    const newParams = [...params];
    newParams[index] = {
      ...newParams[index],
      required: !newParams[index].required,
    };
    setParams(newParams);
  };

  const removeParam = (index: number) => {
    if (params[index].system) {
      toast.error('System parameters cannot be removed');
      return;
    }
    const newParams = params.filter((_, i) => i !== index);
    setParams(newParams);
  };

  const addNewParam = () => {
    if (!newParam.key || !newParam.label) {
      toast.error('Key and Label are required');
      return;
    }

    const validation = validateTaxonomyString(newParam.key);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    const param: TaxonomyParam = {
      id: newParam.key.toLowerCase().replace(/[^a-z0-9]/g, ''),
      key: newParam.key.toUpperCase(),
      label: newParam.label,
      type: newParam.type || 'text',
      options: newParam.type === 'options' ? newParam.options : undefined,
      value: newParam.type === 'fixed' ? newParam.value : undefined,
      description: newParam.description || undefined,
      system: false,
      required: false,
    };

    setParams([...params, param]);
    setNewParam({ key: '', label: '', type: 'text', options: [], description: '' });
    setShowAddParam(false);
    toast.success('Parameter added');
  };

  const addOption = () => {
    if (!newOptionValue.trim()) return;
    
    const validation = validateTaxonomyString(newOptionValue);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setNewParam({
      ...newParam,
      options: [...(newParam.options || []), newOptionValue.toUpperCase()],
    });
    setNewOptionValue('');
  };

  const removeOption = (optionIndex: number) => {
    setNewParam({
      ...newParam,
      options: newParam.options?.filter((_, i) => i !== optionIndex),
    });
  };

  const previewString = previewTaxonomy(params.filter(p => p.required !== false || p.system));

  const entityLabel = entityType === 'adset' 
    ? (platform === 'tiktok' || platform === 'google' ? 'Ad Group' : 'Ad Set') 
    : entityType.charAt(0).toUpperCase() + entityType.slice(1);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              {entityLabel} Taxonomy
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Structure only - values auto-populate from ActiPlan
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetToDefault}
              className="text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="text-xs"
            >
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Preview */}
        <div className="p-3 bg-muted rounded-md">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Preview</span>
          </div>
          <code className="text-sm font-mono break-all">{previewString}</code>
        </div>

        {/* Parameters List */}
        <TooltipProvider>
          <div className="space-y-2">
            {params.map((param, index) => (
              <div
                key={param.id}
                className="flex items-center gap-2 p-2 bg-card border rounded-md"
              >
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => moveParam(index, 'up')}
                    disabled={index === 0}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => moveParam(index, 'down')}
                    disabled={index === params.length - 1}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {param.key}
                    </Badge>
                    <span className="text-sm truncate">{param.label}</span>
                    {param.system && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-xs cursor-help bg-green-500/10 text-green-700 border-green-500/30">
                            <Info className="h-2.5 w-2.5 mr-1" />
                            Auto-fill
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[280px]">
                          <p className="text-xs">{param.description || 'This value is automatically extracted from ActiPlan workflow data'}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground capitalize">
                      {param.type}
                    </span>
                    {param.options && param.options.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({param.options.length} options)
                      </span>
                    )}
                    {param.description && !param.system && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[280px]">
                          <p className="text-xs">{param.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={param.required !== false}
                      onCheckedChange={() => toggleParam(index)}
                      className="scale-75"
                    />
                    <span className="text-xs text-muted-foreground">Include</span>
                  </div>
                  {!param.system && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeParam(index)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TooltipProvider>

        {/* Add New Parameter */}
        {!showAddParam ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddParam(true)}
            className="w-full"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Custom Parameter
          </Button>
        ) : (
          <Card className="p-4">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Key (Short Code)</Label>
                  <Input
                    value={newParam.key || ''}
                    onChange={(e) => setNewParam({ ...newParam, key: e.target.value.toUpperCase() })}
                    placeholder="e.g., CLT"
                    className="h-8 text-sm font-mono"
                    maxLength={5}
                  />
                </div>
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={newParam.label || ''}
                    onChange={(e) => setNewParam({ ...newParam, label: e.target.value })}
                    placeholder="e.g., Client Name"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Data Type</Label>
                <Select
                  value={newParam.type}
                  onValueChange={(value: TaxonomyParamType) => setNewParam({ ...newParam, type: value })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARAM_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {newParam.type === 'fixed' && (
                <div>
                  <Label className="text-xs">Fixed Value</Label>
                  <Input
                    value={newParam.value || ''}
                    onChange={(e) => setNewParam({ ...newParam, value: e.target.value.toUpperCase() })}
                    placeholder="e.g., TEST"
                    className="h-8 text-sm font-mono"
                  />
                </div>
              )}

              {newParam.type === 'options' && (
                <div>
                  <Label className="text-xs">Options</Label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={newOptionValue}
                      onChange={(e) => setNewOptionValue(e.target.value.toUpperCase())}
                      placeholder="Add option"
                      className="h-8 text-sm font-mono"
                      onKeyDown={(e) => e.key === 'Enter' && addOption()}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addOption}
                      className="h-8"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {newParam.options?.map((opt, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="cursor-pointer text-xs"
                        onClick={() => removeOption(i)}
                      >
                        {opt}
                        <span className="ml-1 text-muted-foreground">×</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs">Description (shown in tooltip)</Label>
                <Input
                  value={newParam.description || ''}
                  onChange={(e) => setNewParam({ ...newParam, description: e.target.value })}
                  placeholder="Describe what this parameter represents..."
                  className="h-8 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAddParam(false);
                    setNewParam({ key: '', label: '', type: 'text', options: [], description: '' });
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={addNewParam}>
                  Add Parameter
                </Button>
              </div>
            </div>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
