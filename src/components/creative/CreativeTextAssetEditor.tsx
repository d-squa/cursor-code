// Creative Text Asset Editor - Excel-like grid for editing creative copy
// Shows hierarchical structure: ActiPlan > Platform > Market > Phase > Ad Set > Creative

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  ChevronDown, 
  ChevronRight, 
  Image, 
  Video, 
  AlertCircle, 
  Check, 
  Link2, 
  Tag, 
  ExternalLink,
  Copy,
  Wand2,
  Save
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { 
  CreativeTextAssetRow, 
  UtmConfig,
  TextAssetFieldConfig 
} from '@/types/creativeTextAssets';
import { 
  PLATFORM_TEXT_FIELDS, 
  PLATFORM_CTAS, 
  validateTextAssetRow,
  generateAutoUtm,
  buildUrlWithUtm,
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

// Grouped structure for hierarchical display
interface GroupedStructure {
  platform: string;
  markets: {
    market: string;
    phases: {
      phase: string;
      adSets: {
        adSet: string;
        rows: CreativeTextAssetRow[];
      }[];
    }[];
  }[];
}

// Group rows by hierarchy
function groupRows(rows: CreativeTextAssetRow[]): GroupedStructure[] {
  const platformMap = new Map<string, Map<string, Map<string, Map<string, CreativeTextAssetRow[]>>>>();
  
  for (const row of rows) {
    if (!platformMap.has(row.platform)) {
      platformMap.set(row.platform, new Map());
    }
    const marketMap = platformMap.get(row.platform)!;
    
    if (!marketMap.has(row.market)) {
      marketMap.set(row.market, new Map());
    }
    const phaseMap = marketMap.get(row.market)!;
    
    if (!phaseMap.has(row.phase)) {
      phaseMap.set(row.phase, new Map());
    }
    const adSetMap = phaseMap.get(row.phase)!;
    
    if (!adSetMap.has(row.adSet)) {
      adSetMap.set(row.adSet, []);
    }
    adSetMap.get(row.adSet)!.push(row);
  }
  
  const result: GroupedStructure[] = [];
  for (const [platform, marketMap] of platformMap) {
    const markets = [];
    for (const [market, phaseMap] of marketMap) {
      const phases = [];
      for (const [phase, adSetMap] of phaseMap) {
        const adSets = [];
        for (const [adSet, groupRows] of adSetMap) {
          adSets.push({ adSet, rows: groupRows });
        }
        phases.push({ phase, adSets });
      }
      markets.push({ market, phases });
    }
    result.push({ platform, markets });
  }
  
  return result;
}

// Character counter component with visual feedback
function CharacterCounter({ 
  value, 
  field 
}: { 
  value: string; 
  field: TextAssetFieldConfig;
}) {
  if (!field.maxLength) return null;
  
  const length = value?.length || 0;
  const status = getCharacterStatus(value || '', field);
  
  const statusColors = {
    ok: 'text-muted-foreground',
    warning: 'text-amber-500',
    error: 'text-destructive',
    over: 'text-destructive font-semibold'
  };
  
  return (
    <div className={cn('text-[10px] mt-0.5 flex items-center gap-1', statusColors[status])}>
      <span>{length}</span>
      <span>/</span>
      <span>{field.maxLength}</span>
      {field.recommendedLength && length > field.recommendedLength && length <= field.maxLength && (
        <span className="text-amber-500">(rec: {field.recommendedLength})</span>
      )}
      {status === 'over' && (
        <AlertCircle className="h-3 w-3 inline ml-0.5" />
      )}
    </div>
  );
}

// Cell editor component with character limit indicator
function CellEditor({ 
  value, 
  field,
  platform,
  onChange,
  onBlur,
  showCounter = true
}: { 
  value: string;
  field: TextAssetFieldConfig;
  platform: Platform;
  onChange: (value: string) => void;
  onBlur?: () => void;
  showCounter?: boolean;
}) {
  const status = getCharacterStatus(value || '', field);
  const isOverLimit = status === 'over';
  
  if (field.id === 'callToAction') {
    const ctas = PLATFORM_CTAS[platform] || PLATFORM_CTAS.meta;
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select CTA" />
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
          {ctas.map(cta => (
            <SelectItem key={cta} value={cta} className="text-xs">
              {cta.replace(/_/g, ' ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  
  if (field.multiline) {
    return (
      <div className="space-y-0.5">
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={field.placeholder}
          className={cn(
            "w-full h-16 px-2 py-1 text-xs border rounded resize-none focus:outline-none focus:ring-1 focus:ring-primary bg-background",
            isOverLimit && "border-destructive focus:ring-destructive",
            status === 'warning' && "border-amber-500/50"
          )}
        />
        {showCounter && <CharacterCounter value={value || ''} field={field} />}
      </div>
    );
  }
  
  return (
    <div className="space-y-0.5">
      <Input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={field.placeholder}
        className={cn(
          "h-8 text-xs",
          isOverLimit && "border-destructive focus:ring-destructive",
          status === 'warning' && "border-amber-500/50"
        )}
      />
      {showCounter && field.maxLength && <CharacterCounter value={value || ''} field={field} />}
    </div>
  );
}

// Row editor component
function RowEditor({ 
  row, 
  onRowChange,
  isSelected,
  onSelect
}: { 
  row: CreativeTextAssetRow;
  onRowChange: (updates: Partial<CreativeTextAssetRow>) => void;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
}) {
  const platform = row.platform.toLowerCase() as Platform;
  const fields = PLATFORM_TEXT_FIELDS[platform] || PLATFORM_TEXT_FIELDS.meta;
  const errors = validateTextAssetRow(row);
  const hasErrors = errors.length > 0;
  
  return (
    <TableRow className={cn(
      hasErrors && "bg-destructive/5",
      isSelected && "bg-primary/5"
    )}>
      <TableCell className="w-10">
        <Checkbox checked={isSelected} onCheckedChange={onSelect} />
      </TableCell>
      <TableCell className="min-w-[180px]">
        <div className="flex items-center gap-2">
          {row.mediaType === 'video' ? (
            <Video className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Image className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-xs font-medium truncate" title={row.creativeName}>
            {row.creativeName}
          </span>
          {hasErrors && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <ul className="text-xs space-y-1">
                    {errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </TableCell>
      
      {/* Primary Text */}
      <TableCell className="min-w-[200px]">
        <CellEditor
          value={row.primaryText}
          field={fields.find(f => f.id === 'primaryText') || { id: 'primaryText', label: 'Primary Text', required: true }}
          platform={platform}
          onChange={(value) => onRowChange({ primaryText: value })}
        />
      </TableCell>
      
      {/* Headline */}
      <TableCell className="min-w-[150px]">
        <CellEditor
          value={row.headline}
          field={fields.find(f => f.id === 'headline') || { id: 'headline', label: 'Headline', required: false }}
          platform={platform}
          onChange={(value) => onRowChange({ headline: value })}
        />
      </TableCell>
      
      {/* Description */}
      <TableCell className="min-w-[150px]">
        <CellEditor
          value={row.description}
          field={fields.find(f => f.id === 'description') || { id: 'description', label: 'Description', required: false }}
          platform={platform}
          onChange={(value) => onRowChange({ description: value })}
        />
      </TableCell>
      
      {/* CTA */}
      <TableCell className="min-w-[120px]">
        <CellEditor
          value={row.callToAction}
          field={{ id: 'callToAction', label: 'CTA', required: true }}
          platform={platform}
          onChange={(value) => onRowChange({ callToAction: value as CallToAction })}
        />
      </TableCell>
      
      {/* Destination URL */}
      <TableCell className="min-w-[200px]">
        <Input
          value={row.destinationUrl}
          onChange={(e) => onRowChange({ destinationUrl: e.target.value })}
          placeholder="https://"
          className="h-8 text-xs"
        />
      </TableCell>
      
      {/* Auto UTM Toggle */}
      <TableCell className="w-20">
        <div className="flex items-center justify-center">
          <Checkbox
            checked={row.autoBuildUtm}
            onCheckedChange={(checked) => onRowChange({ autoBuildUtm: checked === true })}
          />
        </div>
      </TableCell>
      
      {/* Click Tracker */}
      <TableCell className="min-w-[150px]">
        <Input
          value={row.clickTracker || ''}
          onChange={(e) => onRowChange({ clickTracker: e.target.value })}
          placeholder="Click tracker URL"
          className="h-8 text-xs"
        />
      </TableCell>
      
      {/* Impression Tracker */}
      <TableCell className="min-w-[150px]">
        <Input
          value={row.impressionTracker || ''}
          onChange={(e) => onRowChange({ impressionTracker: e.target.value })}
          placeholder="Impression tracker URL"
          className="h-8 text-xs"
        />
      </TableCell>
    </TableRow>
  );
}

// Ad Set group section
function AdSetSection({ 
  adSet, 
  rows,
  selectedIds,
  onRowChange,
  onSelectRow,
  defaultExpanded = true
}: { 
  adSet: string;
  rows: CreativeTextAssetRow[];
  selectedIds: Set<string>;
  onRowChange: (id: string, updates: Partial<CreativeTextAssetRow>) => void;
  onSelectRow: (id: string, selected: boolean) => void;
  defaultExpanded?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const validCount = rows.filter(r => validateTextAssetRow(r).length === 0).length;
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg mb-2">
      <CollapsibleTrigger className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/50">
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="text-sm font-medium">{adSet}</span>
          <Badge variant="secondary" className="text-xs">
            {rows.length} creative{rows.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {validCount === rows.length ? (
            <Badge className="bg-emerald-500 text-xs">
              <Check className="h-3 w-3 mr-1" />
              Ready
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              {validCount}/{rows.length} valid
            </Badge>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="min-w-[180px]">Creative</TableHead>
                <TableHead className="min-w-[200px]">Primary Text</TableHead>
                <TableHead className="min-w-[150px]">Headline</TableHead>
                <TableHead className="min-w-[150px]">Description</TableHead>
                <TableHead className="min-w-[120px]">CTA</TableHead>
                <TableHead className="min-w-[200px]">Destination URL</TableHead>
                <TableHead className="w-20 text-center">Auto UTM</TableHead>
                <TableHead className="min-w-[150px]">Click Tracker</TableHead>
                <TableHead className="min-w-[150px]">Impression Tracker</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <RowEditor
                  key={row.id}
                  row={row}
                  onRowChange={(updates) => onRowChange(row.id, updates)}
                  isSelected={selectedIds.has(row.id)}
                  onSelect={(selected) => onSelectRow(row.id, selected)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Phase group section
function PhaseSection({ 
  phase, 
  adSets,
  selectedIds,
  onRowChange,
  onSelectRow
}: { 
  phase: string;
  adSets: { adSet: string; rows: CreativeTextAssetRow[] }[];
  selectedIds: Set<string>;
  onRowChange: (id: string, updates: Partial<CreativeTextAssetRow>) => void;
  onSelectRow: (id: string, selected: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const totalCreatives = adSets.reduce((sum, as) => sum + as.rows.length, 0);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-3">
      <CollapsibleTrigger className="w-full px-4 py-2 flex items-center gap-2 bg-muted/30 rounded-lg hover:bg-muted/50">
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-medium">{phase}</span>
        <Badge variant="outline" className="text-xs ml-auto">
          {adSets.length} ad set{adSets.length !== 1 ? 's' : ''} • {totalCreatives} creative{totalCreatives !== 1 ? 's' : ''}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 mt-2">
        {adSets.map(({ adSet, rows }) => (
          <AdSetSection
            key={adSet}
            adSet={adSet}
            rows={rows}
            selectedIds={selectedIds}
            onRowChange={onRowChange}
            onSelectRow={onSelectRow}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Market group section
function MarketSection({ 
  market, 
  phases,
  selectedIds,
  onRowChange,
  onSelectRow
}: { 
  market: string;
  phases: { phase: string; adSets: { adSet: string; rows: CreativeTextAssetRow[] }[] }[];
  selectedIds: Set<string>;
  onRowChange: (id: string, updates: Partial<CreativeTextAssetRow>) => void;
  onSelectRow: (id: string, selected: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <CollapsibleTrigger className="w-full px-4 py-2.5 flex items-center gap-2 bg-muted/50 rounded-lg hover:bg-muted/70">
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-semibold">{market}</span>
        <Badge variant="secondary" className="ml-auto">
          {phases.length} phase{phases.length !== 1 ? 's' : ''}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 mt-2">
        {phases.map(({ phase, adSets }) => (
          <PhaseSection
            key={phase}
            phase={phase}
            adSets={adSets}
            selectedIds={selectedIds}
            onRowChange={onRowChange}
            onSelectRow={onSelectRow}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Platform group section
function PlatformSection({ 
  platform, 
  markets,
  selectedIds,
  onRowChange,
  onSelectRow
}: { 
  platform: string;
  markets: { market: string; phases: { phase: string; adSets: { adSet: string; rows: CreativeTextAssetRow[] }[] }[] }[];
  selectedIds: Set<string>;
  onRowChange: (id: string, updates: Partial<CreativeTextAssetRow>) => void;
  onSelectRow: (id: string, selected: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  
  const platformIcon = {
    meta: '📘',
    tiktok: '🎵',
    google: '🔍',
    linkedin: '💼',
    snapchat: '👻',
    pinterest: '📌',
    x: '✖️',
  }[platform.toLowerCase()] || '📱';
  
  return (
    <Card className="mb-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30">
            <div className="flex items-center gap-3">
              {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              <span className="text-xl">{platformIcon}</span>
              <CardTitle className="capitalize">{platform}</CardTitle>
              <Badge className="ml-auto">
                {markets.length} market{markets.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            {markets.map(({ market, phases }) => (
              <MarketSection
                key={market}
                market={market}
                phases={phases}
                selectedIds={selectedIds}
                onRowChange={onRowChange}
                onSelectRow={onSelectRow}
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function CreativeTextAssetEditor({
  rows,
  campaignName,
  onRowChange,
  onBulkUpdate,
  onSave,
  isSaving
}: CreativeTextAssetEditorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCta, setBulkCta] = useState<string>('');
  const [bulkUrl, setBulkUrl] = useState<string>('');
  
  const groupedData = useMemo(() => groupRows(rows), [rows]);
  
  const validCount = useMemo(() => 
    rows.filter(r => validateTextAssetRow(r).length === 0).length
  , [rows]);
  
  const handleSelectRow = useCallback((id: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);
  
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)));
    }
  }, [rows, selectedIds.size]);
  
  const handleBulkApply = useCallback(() => {
    if (selectedIds.size === 0) {
      toast.error('Select rows first');
      return;
    }
    
    const updates: Partial<CreativeTextAssetRow> = {};
    if (bulkCta) updates.callToAction = bulkCta as CallToAction;
    if (bulkUrl) updates.destinationUrl = bulkUrl;
    
    if (Object.keys(updates).length === 0) {
      toast.error('Enter values to apply');
      return;
    }
    
    onBulkUpdate(Array.from(selectedIds), updates);
    toast.success(`Updated ${selectedIds.size} rows`);
    setBulkCta('');
    setBulkUrl('');
  }, [selectedIds, bulkCta, bulkUrl, onBulkUpdate]);
  
  const handleAutoUtmAll = useCallback(() => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : rows.map(r => r.id);
    onBulkUpdate(ids, { autoBuildUtm: true });
    toast.success(`Enabled auto UTM for ${ids.length} rows`);
  }, [selectedIds, rows, onBulkUpdate]);
  
  const handleCopyFromFirst = useCallback(() => {
    if (selectedIds.size < 2) {
      toast.error('Select at least 2 rows');
      return;
    }
    
    const ids = Array.from(selectedIds);
    const firstRow = rows.find(r => r.id === ids[0]);
    if (!firstRow) return;
    
    const updates: Partial<CreativeTextAssetRow> = {
      primaryText: firstRow.primaryText,
      headline: firstRow.headline,
      description: firstRow.description,
      callToAction: firstRow.callToAction,
      destinationUrl: firstRow.destinationUrl,
      autoBuildUtm: firstRow.autoBuildUtm,
    };
    
    onBulkUpdate(ids.slice(1), updates);
    toast.success(`Copied to ${ids.length - 1} rows`);
  }, [selectedIds, rows, onBulkUpdate]);
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Creative Text Assets</h3>
          <p className="text-sm text-muted-foreground">
            Configure copy, CTAs, and tracking for {rows.length} creatives
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={validCount === rows.length ? "default" : "outline"}>
            {validCount}/{rows.length} ready
          </Badge>
          <Button onClick={onSave} disabled={isSaving || validCount === 0}>
            {isSaving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save & Continue
              </>
            )}
          </Button>
        </div>
      </div>
      
      {/* Bulk actions toolbar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.size === rows.length && rows.length > 0}
              onCheckedChange={handleSelectAll}
            />
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </span>
          </div>
          
          <div className="h-6 w-px bg-border" />
          
          <Select value={bulkCta} onValueChange={setBulkCta}>
            <SelectTrigger className="w-[150px] h-8">
              <SelectValue placeholder="Bulk CTA" />
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_CTAS.meta.map(cta => (
                <SelectItem key={cta} value={cta} className="text-xs">
                  {cta.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Input
            value={bulkUrl}
            onChange={(e) => setBulkUrl(e.target.value)}
            placeholder="Bulk destination URL"
            className="w-[200px] h-8"
          />
          
          <Button size="sm" variant="secondary" onClick={handleBulkApply} disabled={selectedIds.size === 0}>
            Apply to Selected
          </Button>
          
          <div className="h-6 w-px bg-border" />
          
          <Button size="sm" variant="ghost" onClick={handleAutoUtmAll}>
            <Tag className="h-4 w-4 mr-1" />
            Auto UTM
          </Button>
          
          <Button size="sm" variant="ghost" onClick={handleCopyFromFirst} disabled={selectedIds.size < 2}>
            <Copy className="h-4 w-4 mr-1" />
            Copy First to All
          </Button>
        </div>
      </Card>
      
      {/* Hierarchical structure */}
      <ScrollArea className="h-[500px] pr-4">
        {groupedData.map(({ platform, markets }) => (
          <PlatformSection
            key={platform}
            platform={platform}
            markets={markets}
            selectedIds={selectedIds}
            onRowChange={onRowChange}
            onSelectRow={handleSelectRow}
          />
        ))}
      </ScrollArea>
    </div>
  );
}
