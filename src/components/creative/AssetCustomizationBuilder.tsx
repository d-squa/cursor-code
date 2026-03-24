// Asset Customization Builder Dialog
// Allows users to detect, create, edit, and manage asset customization groups
// Supports Placement, Language, and Flexible Creative customization types

import { useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LayoutGrid,
  Globe,
  Sparkles,
  Wand2,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Image,
  Video,
  ArrowRight,
  Unlink,
  Eye,
  ChevronDown,
  ChevronRight,
  Monitor,
  Smartphone,
  Tablet,
  FileJson,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';
import {
  type DetectedACGroup,
  type CustomizationType,
  type DeliveryBucket,
  detectAssetCustomizationGroups,
  validateACSelection,
  classifyDeliveryBucket,
  detectLanguage,
  DELIVERY_BUCKETS,
} from '@/utils/assetCustomizationEngine';
import { compileAssetFeedSpec, type CompilationResult } from '@/utils/assetFeedSpecCompiler';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssetCustomizationBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: CreativeTextAssetRow[];
  selectedRowIds: Set<string>;
  platform: string;
  campaignId?: string;
  onCreateGroup: (group: DetectedACGroup, compiledSpec: CompilationResult) => void;
  onUngroupRows: (rowIds: string[]) => void;
}

const TYPE_ICONS: Record<CustomizationType, React.ReactNode> = {
  placement: <Monitor className="h-4 w-4" />,
  language: <Globe className="h-4 w-4" />,
  flexible_creative: <Sparkles className="h-4 w-4" />,
};

const TYPE_LABELS: Record<CustomizationType, string> = {
  placement: 'Placement Customization',
  language: 'Language Customization',
  flexible_creative: 'Flexible Creative',
};

const TYPE_COLORS: Record<CustomizationType, string> = {
  placement: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
  language: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30',
  flexible_creative: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
};

const BUCKET_ICONS: Record<DeliveryBucket, React.ReactNode> = {
  vertical: <Smartphone className="h-3.5 w-3.5" />,
  square: <Tablet className="h-3.5 w-3.5" />,
  landscape: <Monitor className="h-3.5 w-3.5" />,
  other: <Image className="h-3.5 w-3.5" />,
};

// ─── Sub-Components ──────────────────────────────────────────────────────────

function DetectedGroupCard({
  group,
  isSelected,
  onToggle,
  expanded,
  onToggleExpand,
}: {
  group: DetectedACGroup;
  isSelected: boolean;
  onToggle: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const hasErrors = group.validationErrors.length > 0;

  return (
    <div className={cn(
      'border rounded-lg transition-colors',
      isSelected && !hasErrors ? 'border-primary bg-primary/5' : '',
      hasErrors ? 'border-destructive/50 bg-destructive/5' : '',
    )}>
      <div className="flex items-center gap-3 p-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggle}
          disabled={hasErrors}
        />
        <button
          onClick={onToggleExpand}
          className="p-0.5 hover:bg-muted rounded"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className={cn('p-1.5 rounded-md', TYPE_COLORS[group.type])}>
          {TYPE_ICONS[group.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{group.label}</span>
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {group.rows.length} assets
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{group.description}</p>
        </div>
        {hasErrors && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <ul className="text-xs space-y-1">
                  {group.validationErrors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {expanded && (
        <div className="border-t px-3 py-2 space-y-2">
          {/* Delivery bucket breakdown */}
          {group.type === 'placement' && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Delivery Buckets</span>
              {[...group.deliveryBuckets.entries()].filter(([b]) => b !== 'other').map(([bucket, rows]) => (
                <div key={bucket} className="flex items-center gap-2 pl-2">
                  {BUCKET_ICONS[bucket]}
                  <span className="text-xs">{DELIVERY_BUCKETS[bucket].label}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground truncate">
                    {rows.map(r => r.creativeName).join(', ')}
                  </span>
                  {rows.length > 1 && (
                    <Badge variant="destructive" className="text-[9px] h-4">
                      {rows.length} (max 1)
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Language breakdown */}
          {group.type === 'language' && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Languages</span>
              {[...group.languages.entries()].filter(([l]) => l !== 'unknown').map(([lang, rows]) => (
                <div key={lang} className="flex items-center gap-2 pl-2">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium uppercase">{lang}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground truncate">
                    {rows.map(r => r.creativeName).join(', ')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Flexible creative - list all assets */}
          {group.type === 'flexible_creative' && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Asset Variations</span>
              {group.rows.map((row, i) => (
                <div key={row.id} className="flex items-center gap-2 pl-2 text-xs">
                  {row.mediaType === 'video' ? <Video className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                  <span className="truncate">{row.creativeName}</span>
                  {row.aspectRatio && (
                    <Badge variant="outline" className="text-[9px] h-4">{row.aspectRatio}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Validation errors */}
          {hasErrors && (
            <Alert variant="destructive" className="py-2">
              <AlertDescription className="text-xs">
                {group.validationErrors.map((e, i) => <div key={i}>• {e}</div>)}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}

function ManualSelectionPanel({
  rows,
  selectedIds,
  onToggleRow,
}: {
  rows: CreativeTextAssetRow[];
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
}) {
  const validation = useMemo(() => {
    const selected = rows.filter(r => selectedIds.has(r.id));
    if (selected.length < 2) return null;
    return validateACSelection(selected);
  }, [rows, selectedIds]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Select Creatives</span>
        {selectedIds.size >= 2 && validation && (
          <div className="flex items-center gap-1.5">
            {validation.valid ? (
              <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px]">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {TYPE_LABELS[validation.type!]}
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px]">
                <XCircle className="h-3 w-3 mr-1" />
                Invalid
              </Badge>
            )}
          </div>
        )}
      </div>

      <ScrollArea className="h-[300px] border rounded-md">
        <div className="p-2 space-y-1">
          {rows.map(row => {
            const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
            const lang = detectLanguage(row);
            const isDisabled = !!(row as any).isOrganic || !!row.carouselGroupId || !!row.assetCustomizationGroupId;

            return (
              <label
                key={row.id}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors',
                  selectedIds.has(row.id) && 'bg-primary/10',
                  isDisabled && 'opacity-50 cursor-not-allowed',
                )}
              >
                <Checkbox
                  checked={selectedIds.has(row.id)}
                  onCheckedChange={() => onToggleRow(row.id)}
                  disabled={isDisabled}
                />
                {row.mediaType === 'video' ? <Video className="h-3.5 w-3.5 text-muted-foreground" /> : <Image className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-xs truncate flex-1">{row.creativeName}</span>
                <Badge variant="outline" className="text-[9px] h-4 shrink-0">
                  {DELIVERY_BUCKETS[bucket].label.split(' ')[0]}
                </Badge>
                {lang && (
                  <Badge variant="secondary" className="text-[9px] h-4 shrink-0 uppercase">
                    {lang}
                  </Badge>
                )}
                {row.aspectRatio && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{row.aspectRatio}</span>
                )}
              </label>
            );
          })}
        </div>
      </ScrollArea>

      {validation && !validation.valid && validation.errors.length > 0 && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">
            {validation.errors.map((e, i) => <div key={i}>• {e}</div>)}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function SpecPreviewPanel({ spec }: { spec: CompilationResult | null }) {
  if (!spec) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileJson className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Compiled asset_feed_spec Preview</span>
        {spec.success ? (
          <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px]">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Valid
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-[10px]">
            <XCircle className="h-3 w-3 mr-1" />
            Errors
          </Badge>
        )}
      </div>

      {spec.warnings.length > 0 && (
        <Alert className="py-2">
          <AlertDescription className="text-xs">
            {spec.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
          </AlertDescription>
        </Alert>
      )}

      {spec.errors.length > 0 && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">
            {spec.errors.map((e, i) => <div key={i}>• {e}</div>)}
          </AlertDescription>
        </Alert>
      )}

      <ScrollArea className="h-[250px] border rounded-md bg-muted/30">
        <pre className="p-3 text-[11px] font-mono text-foreground whitespace-pre-wrap">
          {JSON.stringify(spec.spec, null, 2)}
        </pre>
      </ScrollArea>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AssetCustomizationBuilder({
  open,
  onOpenChange,
  rows,
  selectedRowIds,
  platform,
  campaignId,
  onCreateGroup,
  onUngroupRows,
}: AssetCustomizationBuilderProps) {
  const [tab, setTab] = useState<'detect' | 'manual'>('detect');
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [manualSelectedIds, setManualSelectedIds] = useState<Set<string>>(new Set(selectedRowIds));
  const [previewGroupId, setPreviewGroupId] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [defaultLanguage, setDefaultLanguage] = useState<string>('en');
  const [groupName, setGroupName] = useState('');

  // Filter to same-adset rows for manual mode
  const eligibleRows = useMemo(() => {
    return rows.filter(r =>
      r.platform.toLowerCase() === 'meta' &&
      !(r as any).isOrganic &&
      !r.carouselGroupId
    );
  }, [rows]);

  // Run detection
  const detectedGroups = useMemo(() => {
    return detectAssetCustomizationGroups(eligibleRows, platform);
  }, [eligibleRows, platform]);

  // Compile preview
  const previewSpec = useMemo(() => {
    if (!previewGroupId) return null;
    const group = detectedGroups.find(g => g.id === previewGroupId);
    if (!group) return null;
    return compileAssetFeedSpec(group, { defaultLanguage });
  }, [previewGroupId, detectedGroups, defaultLanguage]);

  // Manual selection validation + preview
  const manualGroup = useMemo<DetectedACGroup | null>(() => {
    const selected = eligibleRows.filter(r => manualSelectedIds.has(r.id));
    if (selected.length < 2) return null;

    const validation = validateACSelection(selected);
    if (!validation.type) return null;

    // Build a synthetic DetectedACGroup
    const bucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
    const languageMap = new Map<string, CreativeTextAssetRow[]>();

    for (const row of selected) {
      const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
      if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
      bucketMap.get(bucket)!.push(row);

      const lang = detectLanguage(row) || 'unknown';
      if (!languageMap.has(lang)) languageMap.set(lang, []);
      languageMap.get(lang)!.push(row);
    }

    return {
      id: `ac-manual-${Date.now()}`,
      type: validation.type,
      label: TYPE_LABELS[validation.type],
      description: `${selected.length} creatives manually grouped`,
      rows: selected,
      taxonomyKey: '',
      deliveryBuckets: bucketMap,
      languages: languageMap,
      validationErrors: validation.errors,
    };
  }, [eligibleRows, manualSelectedIds]);

  const manualSpec = useMemo(() => {
    if (!manualGroup || manualGroup.validationErrors.length > 0) return null;
    return compileAssetFeedSpec(manualGroup, { defaultLanguage });
  }, [manualGroup, defaultLanguage]);

  // Toggle group selection
  const toggleGroupSelection = useCallback((id: string) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreviewGroupId(id);
  }, []);

  const toggleGroupExpand = useCallback((id: string) => {
    setExpandedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleManualRow = useCallback((id: string) => {
    setManualSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Confirm creation
  const handleConfirmDetected = useCallback(() => {
    setIsCompiling(true);
    try {
      const selected = detectedGroups.filter(g => selectedGroupIds.has(g.id));
      let count = 0;

      for (const group of selected) {
        if (group.validationErrors.length > 0) continue;
        const compiled = compileAssetFeedSpec(group, { defaultLanguage });
        if (compiled.success) {
          onCreateGroup(group, compiled);
          count++;
        }
      }

      if (count > 0) {
        toast.success(`Created ${count} asset customization group(s)`);
        onOpenChange(false);
      } else {
        toast.error('No valid groups to create');
      }
    } finally {
      setIsCompiling(false);
    }
  }, [detectedGroups, selectedGroupIds, defaultLanguage, onCreateGroup, onOpenChange]);

  const handleConfirmManual = useCallback(() => {
    if (!manualGroup || !manualSpec || !manualSpec.success) return;

    setIsCompiling(true);
    try {
      onCreateGroup(manualGroup, manualSpec);
      toast.success(`Created ${TYPE_LABELS[manualGroup.type]} group`);
      onOpenChange(false);
    } finally {
      setIsCompiling(false);
    }
  }, [manualGroup, manualSpec, onCreateGroup, onOpenChange]);

  const validSelectedCount = detectedGroups.filter(
    g => selectedGroupIds.has(g.id) && g.validationErrors.length === 0
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Asset Customization Builder
          </DialogTitle>
          <DialogDescription>
            Group creatives into asset customization structures for Meta's asset_feed_spec.
            Only one customization type per group.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 min-h-0 flex flex-col">
          <div className="px-6">
            <TabsList className="w-full">
              <TabsTrigger value="detect" className="flex-1 gap-1.5">
                <Wand2 className="h-3.5 w-3.5" />
                Auto-Detect
                {detectedGroups.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
                    {detectedGroups.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex-1 gap-1.5">
                <LayoutGrid className="h-3.5 w-3.5" />
                Manual Selection
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 px-6 pb-2">
            <ScrollArea className="h-full">
              <TabsContent value="detect" className="mt-4 space-y-4">
                {detectedGroups.length === 0 ? (
                  <Alert>
                    <AlertDescription className="text-xs">
                      No asset customization patterns detected in your {eligibleRows.length} Meta creatives.
                      Try the Manual Selection tab to group creatives yourself.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {detectedGroups.length} group(s) detected. Select the ones you want to create.
                    </p>
                    <div className="space-y-2">
                      {detectedGroups.map(group => (
                        <DetectedGroupCard
                          key={group.id}
                          group={group}
                          isSelected={selectedGroupIds.has(group.id)}
                          onToggle={() => toggleGroupSelection(group.id)}
                          expanded={expandedGroupIds.has(group.id)}
                          onToggleExpand={() => toggleGroupExpand(group.id)}
                        />
                      ))}
                    </div>

                    {/* Preview */}
                    {previewSpec && (
                      <>
                        <Separator />
                        <SpecPreviewPanel spec={previewSpec} />
                      </>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="manual" className="mt-4 space-y-4">
                <ManualSelectionPanel
                  rows={eligibleRows}
                  selectedIds={manualSelectedIds}
                  onToggleRow={toggleManualRow}
                />

                {manualGroup && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2">
                      <div className={cn('p-1.5 rounded-md', TYPE_COLORS[manualGroup.type])}>
                        {TYPE_ICONS[manualGroup.type]}
                      </div>
                      <div>
                        <span className="text-sm font-medium">{TYPE_LABELS[manualGroup.type]}</span>
                        <p className="text-xs text-muted-foreground">{manualGroup.description}</p>
                      </div>
                    </div>

                    {manualGroup.type === 'language' && (
                      <div className="flex items-center gap-3">
                        <Label className="text-xs shrink-0">Default Language</Label>
                        <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[...manualGroup.languages.keys()]
                              .filter(l => l !== 'unknown')
                              .map(l => (
                                <SelectItem key={l} value={l} className="text-xs uppercase">
                                  {l}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {manualSpec && (
                      <>
                        <Separator />
                        <SpecPreviewPanel spec={manualSpec} />
                      </>
                    )}
                  </>
                )}
              </TabsContent>
            </ScrollArea>
          </div>
        </Tabs>

        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCompiling}>
            Cancel
          </Button>

          {tab === 'detect' ? (
            <Button
              onClick={handleConfirmDetected}
              disabled={isCompiling || validSelectedCount === 0}
              className="gap-2"
            >
              {isCompiling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LayoutGrid className="h-4 w-4" />
              )}
              {isCompiling
                ? 'Creating...'
                : `Create ${validSelectedCount} Group${validSelectedCount !== 1 ? 's' : ''}`}
            </Button>
          ) : (
            <Button
              onClick={handleConfirmManual}
              disabled={isCompiling || !manualGroup || !manualSpec?.success}
              className="gap-2"
            >
              {isCompiling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LayoutGrid className="h-4 w-4" />
              )}
              {isCompiling ? 'Creating...' : 'Create Group'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
