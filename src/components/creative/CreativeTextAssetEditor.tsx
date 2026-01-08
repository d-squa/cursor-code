// Creative Text Asset Editor - Excel-like grid with hierarchical paste
// Simplified flat table with collapsible group rows

import { useState, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  ChevronDown, 
  ChevronRight, 
  Image, 
  Video, 
  AlertCircle, 
  Clipboard,
  Save,
  Layers,
  Globe,
  Target,
  LayoutGrid,
  Copy
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { 
  CreativeTextAssetRow, 
  TextAssetFieldConfig 
} from '@/types/creativeTextAssets';
import { 
  PLATFORM_TEXT_FIELDS, 
  PLATFORM_CTAS, 
  validateTextAssetRow,
  getCharacterStatus
} from '@/types/creativeTextAssets';
import type { CallToAction, Platform } from '@/types/creative';

interface CreativeTextAssetEditorProps {
  rows: CreativeTextAssetRow[];
  campaignName: string;
  onRowChange: (id: string, updates: Partial<CreativeTextAssetRow>) => void;
  onBulkUpdate: (ids: string[], updates: Partial<CreativeTextAssetRow>) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
}

// Hierarchy types
type HierarchyLevel = 'campaign' | 'platform' | 'market' | 'phase' | 'adset' | 'creative';

interface HierarchyNode {
  level: HierarchyLevel;
  key: string;
  label: string;
  parentKey?: string;
  rowIds: string[];
  childCount: number;
}

// Build flat hierarchy with all levels
function buildHierarchy(rows: CreativeTextAssetRow[]): { nodes: HierarchyNode[]; rowsByKey: Map<string, CreativeTextAssetRow> } {
  const rowsByKey = new Map<string, CreativeTextAssetRow>();
  rows.forEach(r => rowsByKey.set(r.id, r));

  const nodes: HierarchyNode[] = [];
  const platformSet = new Set<string>();
  const marketSet = new Set<string>();
  const phaseSet = new Set<string>();
  const adsetSet = new Set<string>();

  // Group rows
  for (const row of rows) {
    platformSet.add(row.platform);
    marketSet.add(`${row.platform}|${row.market}`);
    phaseSet.add(`${row.platform}|${row.market}|${row.phase}`);
    adsetSet.add(`${row.platform}|${row.market}|${row.phase}|${row.adSet}`);
  }

  // Platform nodes
  for (const platform of platformSet) {
    const platformRows = rows.filter(r => r.platform === platform);
    nodes.push({
      level: 'platform',
      key: `platform:${platform}`,
      label: platform,
      rowIds: platformRows.map(r => r.id),
      childCount: platformRows.length
    });
  }

  // Market nodes
  for (const marketKey of marketSet) {
    const [platform, market] = marketKey.split('|');
    const marketRows = rows.filter(r => r.platform === platform && r.market === market);
    nodes.push({
      level: 'market',
      key: `market:${marketKey}`,
      label: market,
      parentKey: `platform:${platform}`,
      rowIds: marketRows.map(r => r.id),
      childCount: marketRows.length
    });
  }

  // Phase nodes
  for (const phaseKey of phaseSet) {
    const [platform, market, phase] = phaseKey.split('|');
    const phaseRows = rows.filter(r => r.platform === platform && r.market === market && r.phase === phase);
    nodes.push({
      level: 'phase',
      key: `phase:${phaseKey}`,
      label: phase,
      parentKey: `market:${platform}|${market}`,
      rowIds: phaseRows.map(r => r.id),
      childCount: phaseRows.length
    });
  }

  // AdSet nodes
  for (const adsetKey of adsetSet) {
    const [platform, market, phase, adSet] = adsetKey.split('|');
    const adsetRows = rows.filter(r => r.platform === platform && r.market === market && r.phase === phase && r.adSet === adSet);
    nodes.push({
      level: 'adset',
      key: `adset:${adsetKey}`,
      label: adSet,
      parentKey: `phase:${platform}|${market}|${phase}`,
      rowIds: adsetRows.map(r => r.id),
      childCount: adsetRows.length
    });
  }

  return { nodes, rowsByKey };
}

// Parse clipboard text (tab-separated values from Excel)
function parseClipboardData(text: string): { primaryText?: string; headline?: string; description?: string; callToAction?: string; destinationUrl?: string }[] {
  const lines = text.trim().split('\n');
  return lines.map(line => {
    const cols = line.split('\t');
    return {
      primaryText: cols[0]?.trim() || undefined,
      headline: cols[1]?.trim() || undefined,
      description: cols[2]?.trim() || undefined,
      callToAction: cols[3]?.trim() || undefined,
      destinationUrl: cols[4]?.trim() || undefined,
    };
  });
}

// Character counter
function CharCounter({ value, maxLength }: { value: string; maxLength?: number }) {
  if (!maxLength) return null;
  const len = value?.length || 0;
  const isOver = len > maxLength;
  return (
    <span className={cn("text-[10px] ml-1", isOver ? "text-destructive" : "text-muted-foreground")}>
      {len}/{maxLength}
    </span>
  );
}

// Inline text inputs state for hierarchy levels
interface GroupTextInputs {
  primaryText: string;
  headline: string;
  description: string;
  callToAction: string;
  destinationUrl: string;
}

const defaultGroupInputs: GroupTextInputs = {
  primaryText: '',
  headline: '',
  description: '',
  callToAction: '',
  destinationUrl: '',
};

export function CreativeTextAssetEditor({
  rows,
  campaignName,
  onRowChange,
  onBulkUpdate,
  onSave,
  isSaving
}: CreativeTextAssetEditorProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupInputs, setGroupInputs] = useState<Map<string, GroupTextInputs>>(new Map());
  const tableRef = useRef<HTMLDivElement>(null);
  const { nodes, rowsByKey } = useMemo(() => buildHierarchy(rows), [rows]);
  
  const validCount = useMemo(() => 
    rows.filter(r => validateTextAssetRow(r).length === 0).length
  , [rows]);

  // Toggle collapse
  const toggleCollapse = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Check if a node should be visible (all ancestors expanded)
  const isNodeVisible = useCallback((node: HierarchyNode): boolean => {
    if (!node.parentKey) return true;
    if (collapsed.has(node.parentKey)) return false;
    const parent = nodes.find(n => n.key === node.parentKey);
    return parent ? isNodeVisible(parent) : true;
  }, [collapsed, nodes]);

  // Check if creative row should be visible
  const isCreativeVisible = useCallback((row: CreativeTextAssetRow): boolean => {
    const adsetKey = `adset:${row.platform}|${row.market}|${row.phase}|${row.adSet}`;
    if (collapsed.has(adsetKey)) return false;
    
    const phaseKey = `phase:${row.platform}|${row.market}|${row.phase}`;
    if (collapsed.has(phaseKey)) return false;
    
    const marketKey = `market:${row.platform}|${row.market}`;
    if (collapsed.has(marketKey)) return false;
    
    const platformKey = `platform:${row.platform}`;
    if (collapsed.has(platformKey)) return false;
    
    return true;
  }, [collapsed]);

  // Paste handler for a group
  const handlePasteToGroup = useCallback(async (rowIds: string[], level: HierarchyLevel) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error('Clipboard is empty');
        return;
      }

      const parsed = parseClipboardData(text);
      if (parsed.length === 0) {
        toast.error('No valid data in clipboard');
        return;
      }

      // Apply first row to all if only one row pasted, otherwise map 1:1
      if (parsed.length === 1) {
        const updates: Partial<CreativeTextAssetRow> = {};
        if (parsed[0].primaryText) updates.primaryText = parsed[0].primaryText;
        if (parsed[0].headline) updates.headline = parsed[0].headline;
        if (parsed[0].description) updates.description = parsed[0].description;
        if (parsed[0].callToAction) updates.callToAction = parsed[0].callToAction as CallToAction;
        if (parsed[0].destinationUrl) updates.destinationUrl = parsed[0].destinationUrl;
        
        onBulkUpdate(rowIds, updates);
        toast.success(`Pasted to ${rowIds.length} creatives`);
      } else {
        // Map each pasted row to corresponding creative
        const count = Math.min(parsed.length, rowIds.length);
        for (let i = 0; i < count; i++) {
          const updates: Partial<CreativeTextAssetRow> = {};
          if (parsed[i].primaryText) updates.primaryText = parsed[i].primaryText;
          if (parsed[i].headline) updates.headline = parsed[i].headline;
          if (parsed[i].description) updates.description = parsed[i].description;
          if (parsed[i].callToAction) updates.callToAction = parsed[i].callToAction as CallToAction;
          if (parsed[i].destinationUrl) updates.destinationUrl = parsed[i].destinationUrl;
          onRowChange(rowIds[i], updates);
        }
        toast.success(`Pasted ${count} rows`);
      }
    } catch (err) {
      toast.error('Failed to read clipboard');
    }
  }, [onBulkUpdate, onRowChange]);

  // Get/set group inputs
  const getGroupInputs = useCallback((key: string): GroupTextInputs => {
    return groupInputs.get(key) || { ...defaultGroupInputs };
  }, [groupInputs]);

  const updateGroupInput = useCallback((key: string, field: keyof GroupTextInputs, value: string) => {
    setGroupInputs(prev => {
      const next = new Map(prev);
      const current = next.get(key) || { ...defaultGroupInputs };
      next.set(key, { ...current, [field]: value });
      return next;
    });
  }, []);

  // Apply text to all rows in a group
  const handleApplyToGroup = useCallback((rowIds: string[], key: string, field: keyof GroupTextInputs) => {
    const inputs = groupInputs.get(key);
    if (!inputs) return;
    
    const value = inputs[field];
    if (!value.trim()) {
      toast.error(`Enter ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} first`);
      return;
    }

    const updates: Partial<CreativeTextAssetRow> = {};
    if (field === 'callToAction') {
      updates[field] = value as CallToAction;
    } else {
      updates[field] = value;
    }
    
    onBulkUpdate(rowIds, updates);
    toast.success(`Applied to ${rowIds.length} creatives`);
  }, [groupInputs, onBulkUpdate]);

  // Apply all filled fields to group
  const handleApplyAllToGroup = useCallback((rowIds: string[], key: string) => {
    const inputs = groupInputs.get(key);
    if (!inputs) return;
    
    const updates: Partial<CreativeTextAssetRow> = {};
    let hasValue = false;
    
    if (inputs.primaryText.trim()) { updates.primaryText = inputs.primaryText; hasValue = true; }
    if (inputs.headline.trim()) { updates.headline = inputs.headline; hasValue = true; }
    if (inputs.description.trim()) { updates.description = inputs.description; hasValue = true; }
    if (inputs.callToAction.trim()) { updates.callToAction = inputs.callToAction as CallToAction; hasValue = true; }
    if (inputs.destinationUrl.trim()) { updates.destinationUrl = inputs.destinationUrl; hasValue = true; }
    
    if (!hasValue) {
      toast.error('Enter at least one field to apply');
      return;
    }
    
    onBulkUpdate(rowIds, updates);
    toast.success(`Applied to ${rowIds.length} creatives`);
  }, [groupInputs, onBulkUpdate]);

  // Level icons
  const getLevelIcon = (level: HierarchyLevel) => {
    switch (level) {
      case 'platform': return <Layers className="h-4 w-4" />;
      case 'market': return <Globe className="h-4 w-4" />;
      case 'phase': return <Target className="h-4 w-4" />;
      case 'adset': return <LayoutGrid className="h-4 w-4" />;
      default: return null;
    }
  };

  // Level indentation
  const getLevelIndent = (level: HierarchyLevel) => {
    switch (level) {
      case 'platform': return 'pl-2';
      case 'market': return 'pl-8';
      case 'phase': return 'pl-14';
      case 'adset': return 'pl-20';
      case 'creative': return 'pl-26';
      default: return '';
    }
  };

  // Level background colors
  const getLevelBg = (level: HierarchyLevel) => {
    switch (level) {
      case 'platform': return 'bg-primary/10';
      case 'market': return 'bg-secondary/50';
      case 'phase': return 'bg-muted/50';
      case 'adset': return 'bg-muted/30';
      default: return '';
    }
  };

  // Build visible rows for table
  const visibleItems = useMemo(() => {
    const items: { type: 'node' | 'row'; data: HierarchyNode | CreativeTextAssetRow }[] = [];
    
    // Sort nodes by hierarchy order
    const platformNodes = nodes.filter(n => n.level === 'platform').sort((a, b) => a.label.localeCompare(b.label));
    
    for (const platformNode of platformNodes) {
      items.push({ type: 'node', data: platformNode });
      if (collapsed.has(platformNode.key)) continue;
      
      const marketNodes = nodes.filter(n => n.level === 'market' && n.parentKey === platformNode.key).sort((a, b) => a.label.localeCompare(b.label));
      for (const marketNode of marketNodes) {
        items.push({ type: 'node', data: marketNode });
        if (collapsed.has(marketNode.key)) continue;
        
        const phaseNodes = nodes.filter(n => n.level === 'phase' && n.parentKey === marketNode.key).sort((a, b) => a.label.localeCompare(b.label));
        for (const phaseNode of phaseNodes) {
          items.push({ type: 'node', data: phaseNode });
          if (collapsed.has(phaseNode.key)) continue;
          
          const adsetNodes = nodes.filter(n => n.level === 'adset' && n.parentKey === phaseNode.key).sort((a, b) => a.label.localeCompare(b.label));
          for (const adsetNode of adsetNodes) {
            items.push({ type: 'node', data: adsetNode });
            if (collapsed.has(adsetNode.key)) continue;
            
            // Add creative rows for this adset
            const adsetRows = adsetNode.rowIds.map(id => rowsByKey.get(id)!).filter(Boolean);
            for (const row of adsetRows) {
              items.push({ type: 'row', data: row });
            }
          }
        }
      }
    }
    
    return items;
  }, [nodes, collapsed, rowsByKey]);

  // Handle cell input change
  const handleCellChange = useCallback((rowId: string, field: keyof CreativeTextAssetRow, value: string) => {
    onRowChange(rowId, { [field]: value });
  }, [onRowChange]);

  // Get field config for platform
  const getFieldConfig = (platform: string, fieldId: string): TextAssetFieldConfig | undefined => {
    const fields = PLATFORM_TEXT_FIELDS[platform.toLowerCase() as Platform] || PLATFORM_TEXT_FIELDS.meta;
    return fields.find(f => f.id === fieldId);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div>
          <h3 className="text-lg font-semibold">Text Asset Editor</h3>
          <p className="text-sm text-muted-foreground">
            {rows.length} creatives • Paste from Excel: Primary Text, Headline, Description, CTA, URL (tab-separated)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={validCount === rows.length ? "default" : "outline"}>
            {validCount}/{rows.length} ready
          </Badge>
          <Button onClick={onSave} disabled={isSaving || validCount === 0}>
            {isSaving ? 'Saving...' : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save & Continue
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Excel-like grid */}
      <div className="flex-1 overflow-hidden" ref={tableRef}>
        <ScrollArea className="h-full">
          <div className="min-w-[2400px]">
            {/* Table header */}
            <div className="sticky top-0 z-10 bg-muted border-b grid grid-cols-[280px_150px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_100px_180px_80px_80px] gap-px font-medium text-xs">
              <div className="px-3 py-2 bg-muted">Creative / Group</div>
              <div className="px-3 py-2 bg-muted">Primary Text</div>
              <div className="px-3 py-2 bg-muted">Primary Text 2</div>
              <div className="px-3 py-2 bg-muted">Primary Text 3</div>
              <div className="px-3 py-2 bg-muted">Primary Text 4</div>
              <div className="px-3 py-2 bg-muted">Primary Text 5</div>
              <div className="px-3 py-2 bg-muted">Headline</div>
              <div className="px-3 py-2 bg-muted">Headline 2</div>
              <div className="px-3 py-2 bg-muted">Headline 3</div>
              <div className="px-3 py-2 bg-muted">Headline 4</div>
              <div className="px-3 py-2 bg-muted">Headline 5</div>
              <div className="px-3 py-2 bg-muted">Description</div>
              <div className="px-3 py-2 bg-muted">Description 2</div>
              <div className="px-3 py-2 bg-muted">Description 3</div>
              <div className="px-3 py-2 bg-muted">Description 4</div>
              <div className="px-3 py-2 bg-muted">Description 5</div>
              <div className="px-3 py-2 bg-muted">CTA</div>
              <div className="px-3 py-2 bg-muted">Destination URL</div>
              <div className="px-3 py-2 bg-muted">Brand Name</div>
              <div className="px-3 py-2 bg-muted text-center">UTM</div>
            </div>

            {/* Table body */}
            <div className="divide-y">
              {visibleItems.map((item, idx) => {
                if (item.type === 'node') {
                  const node = item.data as HierarchyNode;
                  const isCollapsed = collapsed.has(node.key);
                  const inputs = getGroupInputs(node.key);
                  
                  return (
                    <div key={node.key} className={cn("border-b", getLevelBg(node.level))}>
                      {/* Header row */}
                      <div
                        className={cn(
                          "grid grid-cols-[280px_150px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_100px_180px_80px_80px] gap-px",
                          "hover:bg-accent/50 cursor-pointer"
                        )}
                      >
                        <div
                          className={cn("px-3 py-2 flex items-center gap-2", getLevelIndent(node.level))}
                          onClick={() => toggleCollapse(node.key)}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0" />
                          )}
                          {getLevelIcon(node.level)}
                          <span className="font-medium truncate">{node.label}</span>
                          <Badge variant="secondary" className="text-xs ml-auto shrink-0">
                            {node.childCount}
                          </Badge>
                        </div>
                        
                        {/* Paste button spanning remaining columns */}
                        <div className="col-span-19 px-3 py-2 flex items-center gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePasteToGroup(node.rowIds, node.level);
                                  }}
                                >
                                  <Clipboard className="h-3 w-3 mr-1" />
                                  Paste to all
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Paste from clipboard to {node.childCount} creatives
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleApplyAllToGroup(node.rowIds, node.key);
                                  }}
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  Apply all fields
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Apply all filled fields below to {node.childCount} creatives
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                      
                      {/* Input row - simplified for group apply */}
                      <div className="grid grid-cols-[280px_150px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_100px_180px_80px_80px] gap-px bg-background/50">
                        <div className={cn("px-3 py-1.5 text-xs text-muted-foreground italic", getLevelIndent(node.level))}>
                          Group apply (bulk actions)
                        </div>
                        {/* Primary Text columns - show only first one for group apply */}
                        <div className="px-1 py-1">
                          <Input
                            value={inputs.primaryText}
                            onChange={(e) => updateGroupInput(node.key, 'primaryText', e.target.value)}
                            className="h-6 text-xs"
                            placeholder="Primary..."
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        {/* Empty cells for PT 2-5 */}
                        <div className="px-1 py-1" />
                        <div className="px-1 py-1" />
                        <div className="px-1 py-1" />
                        <div className="px-1 py-1" />
                        {/* Headline */}
                        <div className="px-1 py-1">
                          <Input
                            value={inputs.headline}
                            onChange={(e) => updateGroupInput(node.key, 'headline', e.target.value)}
                            className="h-6 text-xs"
                            placeholder="Headline..."
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        {/* Empty cells for H 2-5 */}
                        <div className="px-1 py-1" />
                        <div className="px-1 py-1" />
                        <div className="px-1 py-1" />
                        <div className="px-1 py-1" />
                        {/* Description */}
                        <div className="px-1 py-1">
                          <Input
                            value={inputs.description}
                            onChange={(e) => updateGroupInput(node.key, 'description', e.target.value)}
                            className="h-6 text-xs"
                            placeholder="Desc..."
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        {/* Empty cells for D 2-5 */}
                        <div className="px-1 py-1" />
                        <div className="px-1 py-1" />
                        <div className="px-1 py-1" />
                        <div className="px-1 py-1" />
                        {/* CTA */}
                        <div className="px-1 py-1">
                          <Select
                            value={inputs.callToAction}
                            onValueChange={(v) => updateGroupInput(node.key, 'callToAction', v)}
                          >
                            <SelectTrigger className="h-6 text-xs" onClick={(e) => e.stopPropagation()}>
                              <SelectValue placeholder="CTA" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover z-50">
                              {PLATFORM_CTAS.meta.map(cta => (
                                <SelectItem key={cta} value={cta} className="text-xs">
                                  {cta.replace(/_/g, ' ')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* URL */}
                        <div className="px-1 py-1">
                          <Input
                            value={inputs.destinationUrl}
                            onChange={(e) => updateGroupInput(node.key, 'destinationUrl', e.target.value)}
                            className="h-6 text-xs"
                            placeholder="URL..."
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        {/* Brand Name - empty for group */}
                        <div className="px-1 py-1" />
                        {/* UTM */}
                        <div className="px-1 py-1" />
                      </div>
                    </div>
                  );
                } else {
                  const row = item.data as CreativeTextAssetRow;
                  const platform = row.platform.toLowerCase() as Platform;
                  const errors = validateTextAssetRow(row);
                  const hasErrors = errors.length > 0;
                  const primaryField = getFieldConfig(row.platform, 'primaryText');
                  const headlineField = getFieldConfig(row.platform, 'headline');
                  const descField = getFieldConfig(row.platform, 'description');
                  
                  return (
                    <div
                      key={row.id}
                      className={cn(
                        "grid grid-cols-[280px_150px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_120px_100px_180px_80px_80px] gap-px",
                        hasErrors && "bg-destructive/5",
                        "hover:bg-accent/20"
                      )}
                    >
                      {/* Creative name */}
                      <div className={cn("px-2 py-1 flex items-center gap-1.5", getLevelIndent('creative'))}>
                        {row.mediaType === 'video' ? (
                          <Video className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <Image className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-xs truncate" title={row.creativeName}>
                          {row.creativeName}
                        </span>
                        {hasErrors && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs">
                                <ul className="text-xs space-y-1">
                                  {errors.map((err, i) => <li key={i}>{err}</li>)}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      
                      {/* Primary Text 1-5 */}
                      <div className="px-1 py-1">
                        <Input
                          value={row.primaryText || ''}
                          onChange={(e) => handleCellChange(row.id, 'primaryText', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="Primary..."
                        />
                      </div>
                      <div className="px-1 py-1">
                        <Input
                          value={row.primaryText2 || ''}
                          onChange={(e) => handleCellChange(row.id, 'primaryText2', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="PT 2..."
                        />
                      </div>
                      <div className="px-1 py-1">
                        <Input
                          value={row.primaryText3 || ''}
                          onChange={(e) => handleCellChange(row.id, 'primaryText3', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="PT 3..."
                        />
                      </div>
                      <div className="px-1 py-1">
                        <Input
                          value={row.primaryText4 || ''}
                          onChange={(e) => handleCellChange(row.id, 'primaryText4', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="PT 4..."
                        />
                      </div>
                      <div className="px-1 py-1">
                        <Input
                          value={row.primaryText5 || ''}
                          onChange={(e) => handleCellChange(row.id, 'primaryText5', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="PT 5..."
                        />
                      </div>
                      
                      {/* Headline 1-5 */}
                      <div className="px-1 py-1">
                        <Input
                          value={row.headline || ''}
                          onChange={(e) => handleCellChange(row.id, 'headline', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="Headline..."
                        />
                      </div>
                      <div className="px-1 py-1">
                        <Input
                          value={row.headline2 || ''}
                          onChange={(e) => handleCellChange(row.id, 'headline2', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="H 2..."
                        />
                      </div>
                      <div className="px-1 py-1">
                        <Input
                          value={row.headline3 || ''}
                          onChange={(e) => handleCellChange(row.id, 'headline3', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="H 3..."
                        />
                      </div>
                      <div className="px-1 py-1">
                        <Input
                          value={row.headline4 || ''}
                          onChange={(e) => handleCellChange(row.id, 'headline4', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="H 4..."
                        />
                      </div>
                      <div className="px-1 py-1">
                        <Input
                          value={row.headline5 || ''}
                          onChange={(e) => handleCellChange(row.id, 'headline5', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="H 5..."
                        />
                      </div>
                      
                      {/* Description 1-5 */}
                      <div className="px-1 py-1">
                        <Input
                          value={row.description || ''}
                          onChange={(e) => handleCellChange(row.id, 'description', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="Desc..."
                        />
                      </div>
                      <div className="px-1 py-1">
                        <Input
                          value={row.description2 || ''}
                          onChange={(e) => handleCellChange(row.id, 'description2', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="D 2..."
                        />
                      </div>
                      <div className="px-1 py-1">
                        <Input
                          value={row.description3 || ''}
                          onChange={(e) => handleCellChange(row.id, 'description3', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="D 3..."
                        />
                      </div>
                      <div className="px-1 py-1">
                        <Input
                          value={row.description4 || ''}
                          onChange={(e) => handleCellChange(row.id, 'description4', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="D 4..."
                        />
                      </div>
                      <div className="px-1 py-1">
                        <Input
                          value={row.description5 || ''}
                          onChange={(e) => handleCellChange(row.id, 'description5', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="D 5..."
                        />
                      </div>
                      
                      {/* CTA */}
                      <div className="px-1 py-1">
                        <Select
                          value={row.callToAction || ''}
                          onValueChange={(v) => handleCellChange(row.id, 'callToAction', v)}
                        >
                          <SelectTrigger className="h-6 text-xs border-transparent hover:border-input bg-transparent">
                            <SelectValue placeholder="CTA" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover z-50">
                            {(PLATFORM_CTAS[platform] || PLATFORM_CTAS.meta).map(cta => (
                              <SelectItem key={cta} value={cta} className="text-xs">
                                {cta.replace(/_/g, ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Destination URL */}
                      <div className="px-1 py-1">
                        <Input
                          value={row.destinationUrl || ''}
                          onChange={(e) => handleCellChange(row.id, 'destinationUrl', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="URL..."
                        />
                      </div>
                      
                      {/* Brand Name */}
                      <div className="px-1 py-1">
                        <Input
                          value={row.brandName || ''}
                          onChange={(e) => handleCellChange(row.id, 'brandName', e.target.value)}
                          className="h-6 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                          placeholder="Brand..."
                        />
                      </div>
                      
                      {/* Auto UTM */}
                      <div className="px-2 py-1 flex items-center justify-center">
                        <Checkbox
                          checked={row.autoBuildUtm || false}
                          onCheckedChange={(checked) => onRowChange(row.id, { autoBuildUtm: checked === true })}
                        />
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
