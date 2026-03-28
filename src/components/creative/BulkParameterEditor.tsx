// Bulk Parameter Editor for Creative Content
// Allows users to write parameter values and apply them to different levels of the campaign structure

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ChevronDown, ChevronRight, Check, Layers, Globe, Target, LayoutGrid, 
  Type, Heading1, FileText, MousePointer, Link, Sparkles, AlertTriangle,
  Wand2, Settings2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';
import { PLATFORM_CTAS } from '@/types/creativeTextAssets';
import type { CallToAction, Platform } from '@/types/creative';

// Advantage+ feature definitions
interface AdvantagePlusFeature {
  key: string;
  label: string;
  description: string;
}

const ADVANTAGE_PLUS_FEATURES: AdvantagePlusFeature[] = [
  { key: 'advantage_plus_video_touchups', label: 'Video touch-ups', description: 'Auto-enhance video quality' },
  { key: 'advantage_plus_text_improvements', label: 'Text improvements', description: 'Optimize text for performance' },
  { key: 'advantage_plus_product_tags', label: 'Add product tags', description: 'Tag products in creatives' },
  { key: 'advantage_plus_video_effects', label: 'Add video effects', description: 'Apply video enhancements' },
  { key: 'advantage_plus_relevant_comments', label: 'Relevant Comments', description: 'Show relevant user comments' },
  { key: 'advantage_plus_enhance_cta', label: 'Enhance CTA', description: 'Optimize call-to-action' },
  { key: 'advantage_plus_reveal_details', label: 'Reveal details overtime', description: 'Progressive detail reveal' },
  { key: 'advantage_plus_show_spotlights', label: 'Show Spotlights', description: 'Highlight key elements' },
  { key: 'advantage_plus_optimize_text_per_person', label: 'Optimize text per person', description: 'Personalize text for each user' },
  { key: 'advantage_plus_sitelinks', label: 'Sitelinks', description: 'Add sitelink extensions' },
  { key: 'advantage_plus_products', label: 'Products', description: 'Show product catalog items' },
];

interface BulkParameterEditorProps {
  rows: CreativeTextAssetRow[];
  selectedRowIds: Set<string>;
  onBulkUpdate: (ids: string[], updates: Partial<CreativeTextAssetRow>) => void;
}

type ParameterType = 'primaryText' | 'headline' | 'description' | 'caption' | 'callToAction' | 'destinationUrl' | 'displayLink';

interface ParameterConfig {
  key: ParameterType;
  label: string;
  icon: React.ReactNode;
  type: 'text' | 'textarea' | 'select' | 'url';
  placeholder: string;
  // Which platforms support this field
  supportedPlatforms?: Platform[];
}

const PARAMETERS: ParameterConfig[] = [
  { 
    key: 'primaryText', 
    label: 'Primary Text', 
    icon: <Type className="h-4 w-4" />, 
    type: 'textarea',
    placeholder: 'Enter primary text...'
  },
  { 
    key: 'headline', 
    label: 'Headline', 
    icon: <Heading1 className="h-4 w-4" />, 
    type: 'text',
    placeholder: 'Enter headline...'
  },
  { 
    key: 'description', 
    label: 'Description', 
    icon: <FileText className="h-4 w-4" />, 
    type: 'text',
    placeholder: 'Enter description...'
  },
  { 
    key: 'caption', 
    label: 'Video Caption', 
    icon: <FileText className="h-4 w-4" />, 
    type: 'textarea',
    placeholder: 'Enter video caption...'
  },
  {
    key: 'callToAction', 
    label: 'Call to Action', 
    icon: <MousePointer className="h-4 w-4" />, 
    type: 'select',
    placeholder: 'Select CTA...'
  },
  { 
    key: 'destinationUrl', 
    label: 'Destination URL', 
    icon: <Link className="h-4 w-4" />, 
    type: 'url',
    placeholder: 'https://...'
  },
  { 
    key: 'displayLink', 
    label: 'Display Link', 
    icon: <Sparkles className="h-4 w-4" />, 
    type: 'text',
    placeholder: 'yoursite.com'
  },
];

// Fields not supported by certain platforms
const UNSUPPORTED_FIELDS: Record<Platform, ParameterType[]> = {
  meta: [],
  tiktok: ['headline', 'description', 'displayLink'],
  google: ['primaryText', 'caption', 'displayLink'],
  linkedin: [],
  snapchat: ['primaryText', 'description', 'caption', 'displayLink'],
  pinterest: ['headline', 'caption', 'displayLink'],
  x: ['caption'],
};

type ApplyScope = 'selection' | 'all' | 'platform' | 'market' | 'phase' | 'contains';

interface ApplyScopeOption {
  value: ApplyScope;
  label: string;
  icon: React.ReactNode;
  requiresValue?: boolean;
}

const APPLY_SCOPES: ApplyScopeOption[] = [
  { value: 'selection', label: 'Apply to Selection', icon: <Check className="h-4 w-4" /> },
  { value: 'all', label: 'Apply to All', icon: <Layers className="h-4 w-4" /> },
  { value: 'platform', label: 'Apply to Platform', icon: <Globe className="h-4 w-4" />, requiresValue: true },
  { value: 'market', label: 'Apply to Market', icon: <Target className="h-4 w-4" />, requiresValue: true },
  { value: 'phase', label: 'Apply to Phase', icon: <Layers className="h-4 w-4" />, requiresValue: true },
  { value: 'contains', label: 'Apply where name contains', icon: <LayoutGrid className="h-4 w-4" />, requiresValue: true },
];

interface SkippedEntity {
  id: string;
  name: string;
  platform: string;
  reason: string;
}

export function BulkParameterEditor({ rows, selectedRowIds, onBulkUpdate }: BulkParameterEditorProps) {
  const [activeParameter, setActiveParameter] = useState<ParameterType>('primaryText');
  const [inputValue, setInputValue] = useState('');
  const [applyScope, setApplyScope] = useState<ApplyScope>('selection');
  const [scopeFilter, setScopeFilter] = useState('');
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  
  // Advantage+ settings state
  const [advantagePlusOpen, setAdvantagePlusOpen] = useState(false);
  const [advantagePlusValues, setAdvantagePlusValues] = useState<Record<string, boolean>>({});
  
  // Dialog for showing skipped entities
  const [showSkippedDialog, setShowSkippedDialog] = useState(false);
  const [skippedEntities, setSkippedEntities] = useState<SkippedEntity[]>([]);
  const [appliedCount, setAppliedCount] = useState(0);

  // Get unique platforms, markets, and phases for filter options
  const { platforms, markets, phases } = useMemo(() => {
    const p = new Set<string>();
    const m = new Set<string>();
    const ph = new Set<string>();
    rows.forEach(row => {
      p.add(row.platform);
      m.add(row.market);
      ph.add(row.phase);
    });
    return { platforms: Array.from(p), markets: Array.from(m), phases: Array.from(ph) };
  }, [rows]);

  // Get available CTAs based on platforms in selection
  const availableCTAs = useMemo(() => {
    const allCTAs = new Set<CallToAction>();
    const relevantPlatforms = applyScope === 'selection' && selectedRowIds.size > 0
      ? new Set(rows.filter(r => selectedRowIds.has(r.id)).map(r => r.platform.toLowerCase() as Platform))
      : new Set(platforms.map(p => p.toLowerCase() as Platform));
    
    relevantPlatforms.forEach(platform => {
      const platformCTAs = PLATFORM_CTAS[platform] || PLATFORM_CTAS.meta;
      platformCTAs.forEach(cta => allCTAs.add(cta));
    });
    
    return Array.from(allCTAs);
  }, [rows, selectedRowIds, platforms, applyScope]);

  // Exclude rows that belong to carousel or asset customization groups
  // These grouped creatives have their own dedicated editors and should not be modified via bulk actions
  const isGroupedRow = useCallback((row: CreativeTextAssetRow): boolean => {
    return !!(row.carouselGroupId || row.assetCustomizationGroupId);
  }, []);

  // Get target rows based on scope (excluding grouped creatives)
  const getTargetRows = useCallback((): CreativeTextAssetRow[] => {
    let candidates: CreativeTextAssetRow[];
    switch (applyScope) {
      case 'selection':
        candidates = rows.filter(r => selectedRowIds.has(r.id));
        break;
      case 'all':
        candidates = rows;
        break;
      case 'platform':
        candidates = rows.filter(r => r.platform.toLowerCase() === scopeFilter.toLowerCase());
        break;
      case 'market':
        candidates = rows.filter(r => r.market.toLowerCase() === scopeFilter.toLowerCase());
        break;
      case 'phase':
        candidates = rows.filter(r => r.phase.toLowerCase() === scopeFilter.toLowerCase());
        break;
      case 'contains':
        const searchLower = scopeFilter.toLowerCase();
        candidates = rows.filter(r => 
          r.creativeName.toLowerCase().includes(searchLower) ||
          r.adSet.toLowerCase().includes(searchLower) ||
          r.phase.toLowerCase().includes(searchLower)
        );
        break;
      default:
        candidates = [];
    }
    // Filter out creatives in carousel or asset customization groups
    return candidates.filter(r => !isGroupedRow(r));
  }, [rows, selectedRowIds, applyScope, scopeFilter, isGroupedRow]);

  // Check if field is supported for a platform
  const isFieldSupported = (platform: string, field: ParameterType): boolean => {
    const platformLower = platform.toLowerCase() as Platform;
    const unsupported = UNSUPPORTED_FIELDS[platformLower] || [];
    return !unsupported.includes(field);
  };

  // Handle apply
  const handleApply = useCallback(() => {
    if (!inputValue.trim() && activeParameter !== 'callToAction') {
      toast.error('Please enter a value first');
      return;
    }

    if (applyScope === 'selection' && selectedRowIds.size === 0) {
      toast.error('No rows selected');
      return;
    }

    if ((applyScope === 'platform' || applyScope === 'market' || applyScope === 'phase' || applyScope === 'contains') && !scopeFilter) {
      toast.error('Please specify a filter value');
      return;
    }

    const targetRows = getTargetRows();
    
    // Count how many were excluded due to grouping
    let rawCandidateCount: number;
    switch (applyScope) {
      case 'selection': rawCandidateCount = rows.filter(r => selectedRowIds.has(r.id)).length; break;
      case 'all': rawCandidateCount = rows.length; break;
      default: rawCandidateCount = targetRows.length; break;
    }
    const groupedSkipCount = rawCandidateCount - targetRows.length;

    if (targetRows.length === 0) {
      if (groupedSkipCount > 0) {
        toast.error(`All ${groupedSkipCount} matching creative(s) are part of a carousel or asset customization group. Use their dedicated editors instead.`);
      } else {
        toast.error('No matching rows found');
      }
      return;
    }

    // Check which rows support this field
    const supportedRows: CreativeTextAssetRow[] = [];
    const skipped: SkippedEntity[] = [];

    targetRows.forEach(row => {
      if (isFieldSupported(row.platform, activeParameter)) {
        supportedRows.push(row);
      } else {
        skipped.push({
          id: row.id,
          name: row.creativeName,
          platform: row.platform,
          reason: `${PARAMETERS.find(p => p.key === activeParameter)?.label} is not supported on ${row.platform}`
        });
      }
    });

    if (supportedRows.length === 0) {
      toast.error(`This field is not supported for any of the selected rows`);
      return;
    }

    // Build update
    const updates: Partial<CreativeTextAssetRow> = {};
    if (activeParameter === 'callToAction') {
      updates[activeParameter] = inputValue as CallToAction;
    } else {
      updates[activeParameter] = inputValue;
    }

    // Apply to supported rows
    const ids = supportedRows.map(r => r.id);
    onBulkUpdate(ids, updates);

    // Show results
    if (skipped.length > 0) {
      setSkippedEntities(skipped);
      setAppliedCount(supportedRows.length);
      setShowSkippedDialog(true);
    } else {
      toast.success(`Applied to ${supportedRows.length} creatives`);
    }

    setIsApplyOpen(false);
    setInputValue('');
    setScopeFilter('');
  }, [inputValue, activeParameter, applyScope, selectedRowIds, scopeFilter, getTargetRows, onBulkUpdate]);

  // Apply Advantage+ settings to selection
  const handleApplyAdvantagePlus = useCallback(() => {
    if (selectedRowIds.size === 0) {
      toast.error('Select rows first to apply Advantage+ settings');
      return;
    }
    
    const enabledFeatures = Object.entries(advantagePlusValues)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
    
    if (enabledFeatures.length === 0) {
      toast.error('Enable at least one Advantage+ feature');
      return;
    }
    
    // Only apply to Meta rows
    const metaRows = rows.filter(r => 
      selectedRowIds.has(r.id) && r.platform.toLowerCase().includes('meta')
    );
    
    if (metaRows.length === 0) {
      toast.error('Advantage+ features only apply to Meta creatives');
      return;
    }
    
    const updates: Partial<CreativeTextAssetRow> = {};
    enabledFeatures.forEach(key => {
      (updates as any)[key] = true;
    });
    
    onBulkUpdate(metaRows.map(r => r.id), updates);
    toast.success(`Applied ${enabledFeatures.length} Advantage+ features to ${metaRows.length} creatives`);
    setAdvantagePlusValues({});
  }, [selectedRowIds, advantagePlusValues, rows, onBulkUpdate]);

  const activeConfig = PARAMETERS.find(p => p.key === activeParameter)!;
  const targetCount = getTargetRows().length;
  const enabledAdvantagePlusCount = Object.values(advantagePlusValues).filter(Boolean).length;

  return (
    <>
      <div className="bg-card/50 border-b px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Parameter selector */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Parameter</label>
            <Select value={activeParameter} onValueChange={(v) => { setActiveParameter(v as ParameterType); setInputValue(''); }}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARAMETERS.map(param => (
                  <SelectItem key={param.key} value={param.key}>
                    <div className="flex items-center gap-2">
                      {param.icon}
                      <span>{param.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Value input */}
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Value</label>
            {activeConfig.type === 'textarea' ? (
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={activeConfig.placeholder}
                className="h-9 min-h-[36px] py-2 resize-none"
              />
            ) : activeConfig.type === 'select' ? (
              <Select value={inputValue} onValueChange={setInputValue}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={activeConfig.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {availableCTAs.map(cta => (
                    <SelectItem key={cta} value={cta}>
                      {cta.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={activeConfig.placeholder}
                type={activeConfig.type === 'url' ? 'url' : 'text'}
                className="h-9"
              />
            )}
          </div>

          {/* Apply button with dropdown */}
          <Popover open={isApplyOpen} onOpenChange={setIsApplyOpen}>
            <PopoverTrigger asChild>
              <Button 
                variant="default" 
                size="sm" 
                className="gap-1"
                disabled={!inputValue.trim() && activeParameter !== 'callToAction'}
              >
                Apply
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[300px] p-2">
              <div className="space-y-2">
                {APPLY_SCOPES.map(scope => (
                  <div key={scope.value}>
                    <Button
                      variant={applyScope === scope.value ? 'secondary' : 'ghost'}
                      size="sm"
                      className="w-full justify-start gap-2"
                      onClick={() => {
                        setApplyScope(scope.value);
                        if (!scope.requiresValue) {
                          setScopeFilter('');
                        }
                      }}
                    >
                      {scope.icon}
                      <span>{scope.label}</span>
                      {scope.value === 'selection' && selectedRowIds.size > 0 && (
                        <Badge variant="outline" className="ml-auto text-xs">
                          {selectedRowIds.size}
                        </Badge>
                      )}
                    </Button>
                    
                    {/* Filter value for scopes that require it */}
                    {applyScope === scope.value && scope.requiresValue && (
                      <div className="mt-2 pl-6">
                        {scope.value === 'platform' ? (
                          <Select value={scopeFilter} onValueChange={setScopeFilter}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select platform..." />
                            </SelectTrigger>
                            <SelectContent>
                              {platforms.map(p => (
                                <SelectItem key={p} value={p.toLowerCase()}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : scope.value === 'market' ? (
                          <Select value={scopeFilter} onValueChange={setScopeFilter}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select market..." />
                            </SelectTrigger>
                            <SelectContent>
                              {markets.map(m => (
                                <SelectItem key={m} value={m.toLowerCase()}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : scope.value === 'phase' ? (
                          <Select value={scopeFilter} onValueChange={setScopeFilter}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select phase..." />
                            </SelectTrigger>
                            <SelectContent>
                              {phases.map(p => (
                                <SelectItem key={p} value={p.toLowerCase()}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={scopeFilter}
                            onChange={(e) => setScopeFilter(e.target.value)}
                            placeholder="Enter text to match..."
                            className="h-8 text-xs"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
                
                <div className="border-t pt-2 mt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>Will apply to:</span>
                    <Badge variant="outline">{targetCount} creatives</Badge>
                  </div>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="w-full"
                    onClick={handleApply}
                    disabled={targetCount === 0}
                  >
                    Confirm Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Advantage+ Settings Popover */}
          <Popover open={advantagePlusOpen} onOpenChange={setAdvantagePlusOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Wand2 className="h-4 w-4" />
                Advantage+
                {enabledAdvantagePlusCount > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">{enabledAdvantagePlusCount}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] p-3">
              <div className="space-y-3">
                <div className="text-sm font-medium">Advantage+ Creative Enhancements</div>
                <p className="text-xs text-muted-foreground">Select features to apply to selected Meta creatives</p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {ADVANTAGE_PLUS_FEATURES.map(feature => (
                    <div key={feature.key} className="flex items-center justify-between py-1">
                      <div>
                        <div className="text-sm">{feature.label}</div>
                        <div className="text-xs text-muted-foreground">{feature.description}</div>
                      </div>
                      <Switch
                        checked={advantagePlusValues[feature.key] || false}
                        onCheckedChange={(checked) => setAdvantagePlusValues(prev => ({
                          ...prev,
                          [feature.key]: checked
                        }))}
                      />
                    </div>
                  ))}
                </div>
                <Button 
                  variant="default" 
                  size="sm" 
                  className="w-full"
                  onClick={handleApplyAdvantagePlus}
                  disabled={enabledAdvantagePlusCount === 0 || selectedRowIds.size === 0}
                >
                  Apply to {selectedRowIds.size} selected
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Skipped entities dialog */}
      <Dialog open={showSkippedDialog} onOpenChange={setShowSkippedDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Partial Application
            </DialogTitle>
            <DialogDescription>
              Applied to {appliedCount} creatives. {skippedEntities.length} were skipped because the field is not supported.
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {skippedEntities.map(entity => (
              <div 
                key={entity.id} 
                className="flex items-start gap-2 p-2 rounded bg-muted/50 text-sm"
              >
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">{entity.name}</div>
                  <div className="text-xs text-muted-foreground">{entity.reason}</div>
                </div>
              </div>
            ))}
          </div>
          
          <DialogFooter>
            <Button onClick={() => setShowSkippedDialog(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
