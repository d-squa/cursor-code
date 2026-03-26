// Creative Content Editor - Excel-like grid with full copy/paste support
// Similar to Google Ads Editor bulk editing experience
// Supports format-specific fields, carousel creation, and TikTok thumbnails

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Save, Download, Upload, Copy, Clipboard, Undo2, Redo2,
  Image, Video, AlertCircle, CheckCircle, XCircle,
  ChevronDown, ChevronRight, Layers, Globe, Target, LayoutGrid, Sparkles,
  Plus, Link2, Layout, Film, Grid, Settings2, ImageIcon, Maximize2, Minimize2, 
  ChevronsUpDown, Trash2, Unlink, SquareStack
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CreativeTextAssetRow, TextAssetFieldConfig, AdFormat } from '@/types/creativeTextAssets';
import { PLATFORM_TEXT_FIELDS, PLATFORM_CTAS, validateTextAssetRow } from '@/types/creativeTextAssets';
import type { CallToAction, Platform } from '@/types/creative';
import { 
  downloadTextAssetExcel, 
  parseTextAssetExcel, 
  parseClipboardForGrid,
  parseClipboardWithHeaders,
  gridDataToClipboard,
  TEXT_ASSET_COLUMNS,
  EDITABLE_COLUMNS,
  type TextAssetColumnKey 
} from '@/utils/textAssetExcelUtils';
import { getAvailableFormats, getFormatLabel, AD_FORMAT_LABELS } from '@/utils/adFormatDetection';
import { CarouselCreator } from './CarouselCreator';
import type { CarouselLink } from '@/types/carouselTypes';
import { getPlacementBadges, validateCarouselCreatives } from '@/utils/placementCompatibility';
import { detectCarouselGroups, validateCarouselSelection, type CarouselGroup } from '@/utils/carouselDetection';
import { BulkParameterEditor } from './BulkParameterEditor';
import { AssetCustomizationBuilder } from './AssetCustomizationBuilder';
import type { DetectedACGroup } from '@/utils/assetCustomizationEngine';
import type { CompilationResult } from '@/utils/assetFeedSpecCompiler';
import { ApplyModeDialog, type ApplyMode } from './ApplyModeDialog';
import { ThumbnailUploader } from './ThumbnailUploader';
import { PageIdentityIndicator } from './PageIdentityIndicator';

interface TextAssetExcelEditorProps {
  rows: CreativeTextAssetRow[];
  campaignName: string;
  onRowChange: (id: string, updates: Partial<CreativeTextAssetRow>) => void;
  onBulkUpdate: (ids: string[], updates: Partial<CreativeTextAssetRow>) => void;
  onImportRows: (rows: CreativeTextAssetRow[]) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
  /** Called when user wants to add more creatives */
  onAddCreatives?: () => void;
  /** Called when an assignment should be deleted */
  onDeleteAssignment?: (assignmentId: string) => void | Promise<void>;
  /** Called when multiple assignments should be deleted at once */
  onDeleteAssignments?: (assignmentIds: string[]) => void | Promise<void>;
  /** Called when a row is ungrouped from a processing group */
  onUngroupRow?: (rowId: string, groupType?: ProcessingGroupKind) => void;
}

// Grid column definition - now includes checkbox for multi-select
interface GridColumn {
  key: string;
  label: string;
  width: number;
  editable: boolean;
  type?: 'text' | 'select' | 'adFormat' | 'checkbox' | 'thumbnail';
  // Format-specific visibility
  showFor?: ('image' | 'video' | 'carousel')[];
  // Platform-specific visibility
  showForPlatform?: ('tiktok')[];
  // Whether this column should be sticky
  sticky?: boolean;
}

type ProcessingGroupKind = 'carousel' | 'asset_customization';

function getProcessingGroupId(row: CreativeTextAssetRow, groupType: ProcessingGroupKind) {
  if (groupType === 'carousel') {
    return row.carouselGroupId || (row.processingGroupType === 'carousel' ? row.processingGroupId : undefined);
  }

  return row.assetCustomizationGroupId || (row.processingGroupType === 'asset_customization' ? row.processingGroupId : undefined);
}

function getProcessingGroupTypes(row: CreativeTextAssetRow): ProcessingGroupKind[] {
  const groupTypes: ProcessingGroupKind[] = [];

  if (getProcessingGroupId(row, 'carousel')) {
    groupTypes.push('carousel');
  }

  if (getProcessingGroupId(row, 'asset_customization')) {
    groupTypes.push('asset_customization');
  }

  return groupTypes;
}

// Hierarchy columns (sticky)
const HIERARCHY_COLUMNS: GridColumn[] = [
  { key: 'select', label: '', width: 36, editable: false, type: 'checkbox', sticky: true },
  { key: 'adType', label: 'Type', width: 70, editable: false, type: 'text', sticky: true },
  { key: 'platform', label: 'Platform', width: 80, editable: false, type: 'text', sticky: true },
  { key: 'market', label: 'Market', width: 80, editable: false, type: 'text', sticky: true },
  { key: 'phase', label: 'Phase', width: 100, editable: false, type: 'text', sticky: true },
  { key: 'adSet', label: 'Ad Set', width: 140, editable: false, type: 'text', sticky: true },
  { key: 'creativeName', label: 'Creative', width: 180, editable: false, type: 'text', sticky: true },
  { key: 'originalFilename', label: 'Upload Path', width: 280, editable: false, type: 'text', sticky: true },
  { key: 'folderPath', label: 'Folder Path', width: 220, editable: false, type: 'text', sticky: true },
];

// Scrollable columns
const SCROLLABLE_COLUMNS: GridColumn[] = [
  { key: 'placements', label: 'Placements', width: 150, editable: false, type: 'text' },
  { key: 'adFormat', label: 'Ad Format', width: 140, editable: true, type: 'adFormat' },
  { key: 'thumbnail', label: 'Thumbnail', width: 100, editable: false, type: 'thumbnail', showFor: ['video'], showForPlatform: ['tiktok'] },
  { key: 'primaryText', label: 'Primary Text', width: 220, editable: true, type: 'text', showFor: ['image', 'video'] },
  { key: 'headline', label: 'Headline', width: 160, editable: true, type: 'text', showFor: ['image', 'video', 'carousel'] },
  { key: 'description', label: 'Description', width: 160, editable: true, type: 'text', showFor: ['image', 'video', 'carousel'] },
  { key: 'caption', label: 'Video Caption', width: 160, editable: true, type: 'text', showFor: ['video'] },
  { key: 'callToAction', label: 'CTA', width: 130, editable: true, type: 'select', showFor: ['image', 'video'] },
  { key: 'destinationUrl', label: 'Destination URL', width: 220, editable: true, type: 'text' },
  { key: 'displayLink', label: 'Display Link', width: 120, editable: true, type: 'text', showFor: ['image', 'video'] },
  { key: 'delete', label: '', width: 50, editable: false, type: 'text' },
];

// Combine all columns
const ALL_GRID_COLUMNS: GridColumn[] = [...HIERARCHY_COLUMNS, ...SCROLLABLE_COLUMNS];

// Calculate sticky column total width
const STICKY_WIDTH = HIERARCHY_COLUMNS.reduce((sum, col) => sum + col.width, 0);

// Placement badge component
function PlacementBadge({ type, variant, tooltip }: { type: string; variant: 'compatible' | 'primary' | 'incompatible'; tooltip: string }) {
  const icons: Record<string, React.ReactNode> = {
    feed: <Layout className="h-3 w-3" />,
    story: <Film className="h-3 w-3" />,
    carousel: <Grid className="h-3 w-3" />,
  };
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={variant === 'incompatible' ? 'outline' : 'secondary'}
            className={cn(
              "text-[9px] px-1 py-0 h-4 gap-0.5 cursor-default",
              variant === 'primary' && "bg-primary/20 text-primary border-primary/30",
              variant === 'compatible' && "bg-green-500/15 text-green-600 border-green-500/30",
              variant === 'incompatible' && "bg-muted/30 text-muted-foreground/50 line-through"
            )}
          >
            {icons[type]}
            <span className="hidden sm:inline">{type.charAt(0).toUpperCase()}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Legacy alias for compatibility
const GRID_COLUMNS = ALL_GRID_COLUMNS;

type GridColumnKey = typeof GRID_COLUMNS[number]['key'];

// Cell selection state
interface CellSelection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

// Character counter component
function CharCounter({ value, maxLength }: { value: string; maxLength?: number }) {
  if (!maxLength) return null;
  const len = value?.length || 0;
  const isOver = len > maxLength;
  return (
    <span className={cn("text-[10px] ml-1 shrink-0", isOver ? "text-destructive font-medium" : "text-muted-foreground")}>
      {len}/{maxLength}
    </span>
  );
}

export function TextAssetExcelEditor({
  rows,
  campaignName,
  onRowChange,
  onBulkUpdate,
  onImportRows,
  onSave,
  isSaving,
  onAddCreatives,
  onDeleteAssignment,
  onDeleteAssignments,
  onUngroupRow
}: TextAssetExcelEditorProps) {
  // State
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [history, setHistory] = useState<CreativeTextAssetRow[][]>([rows]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isSelecting, setIsSelecting] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  
  // Multi-select state for carousel creation
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [showCarouselCreator, setShowCarouselCreator] = useState(false);
  const [editingCarouselGroupId, setEditingCarouselGroupId] = useState<string | null>(null);
  const [showAssetCustomizationBuilder, setShowAssetCustomizationBuilder] = useState(false);
  const [showBulkEditor, setShowBulkEditor] = useState(true);
  const [lastSelectedRowId, setLastSelectedRowId] = useState<string | null>(null);
  
  // Full screen state
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Copied row values for row-to-row paste
  const [copiedRowValues, setCopiedRowValues] = useState<Partial<CreativeTextAssetRow> | null>(null);
  
  // Apply mode dialog state
  const [applyModeDialogOpen, setApplyModeDialogOpen] = useState(false);
  const [pendingApplyData, setPendingApplyData] = useState<{
    rowIds: string[];
    updates: Partial<CreativeTextAssetRow>;
    groupLabel: string;
  } | null>(null);

  // Carousel detection state
  
  const [detectedCarousels, setDetectedCarousels] = useState<CarouselGroup[]>([]);
  const [showDetectionResults, setShowDetectionResults] = useState(false);
  const [selectedDetectedIds, setSelectedDetectedIds] = useState<Set<string>>(new Set());
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation stats
  const validCount = useMemo(() => rows.filter(r => validateTextAssetRow(r).length === 0).length, [rows]);
  const invalidCount = rows.length - validCount;

  // Get selected rows for carousel creation
  const selectedRows = useMemo(() => 
    rows.filter(r => selectedRowIds.has(r.id)),
    [rows, selectedRowIds]
  );

  // Build processing group lookup: groupId → row IDs
  const processingGroups = useMemo(() => {
    const groups = new Map<string, { id: string; type: ProcessingGroupKind; rowIds: string[] }>();
    rows.forEach(row => {
      (['carousel', 'asset_customization'] as const).forEach((groupType) => {
        const groupId = getProcessingGroupId(row, groupType);
        if (!groupId) return;

        const key = `${groupType}:${groupId}`;
        if (!groups.has(key)) {
          groups.set(key, { id: groupId, type: groupType, rowIds: [] });
        }
        groups.get(key)!.rowIds.push(row.id);
      });
    });
    return groups;
  }, [rows]);

  // Handle ungrouping a row from its processing group
  const handleUngroupRow = useCallback((rowId: string, groupType?: ProcessingGroupKind) => {
    if (onUngroupRow) {
      onUngroupRow(rowId, groupType);
    } else {
      onRowChange(rowId, groupType === 'asset_customization'
        ? { assetCustomizationGroupId: undefined, processingGroupId: undefined, processingGroupType: undefined } as any
        : groupType === 'carousel'
          ? { carouselGroupId: undefined, processingGroupId: undefined, processingGroupType: undefined } as any
          : { carouselGroupId: undefined, assetCustomizationGroupId: undefined, processingGroupId: undefined, processingGroupType: undefined } as any);
    }
    toast.success('Creative removed from group');
  }, [onUngroupRow, onRowChange]);

  const selectedGroupRows = useMemo(
    () => rows.filter((row) => selectedRowIds.has(row.id)),
    [rows, selectedRowIds]
  );

  const selectedGroupTypes = useMemo(
    () => new Set(selectedGroupRows.flatMap((row) => getProcessingGroupTypes(row))),
    [selectedGroupRows]
  );

  const hasGroupedSelection = selectedGroupTypes.size > 0;
  const hasCarouselSelection = selectedGroupTypes.has('carousel');
  const hasAssetCustomizationSelection = selectedGroupTypes.has('asset_customization');

  // Create asset customization group from selected rows (defined after clearSelection)
  const handleCreateAssetCustomization = useCallback(() => {
    if (selectedRows.some((row) => !!getProcessingGroupId(row, 'asset_customization'))) {
      toast.error('Selected creatives already belong to an asset customization group. Ungroup that first.');
      return;
    }

    const groupId = `ac-manual-${Date.now()}`;
    const ids = Array.from(selectedRowIds);
    onBulkUpdate(ids, { assetCustomizationGroupId: groupId, processingGroupId: groupId, processingGroupType: 'asset_customization' } as any);
    setSelectedRowIds(new Set());
    toast.success(`Created Asset Customization group with ${ids.length} assets`);
  }, [selectedRowIds, onBulkUpdate, selectedRows]);

  // Handle AC Builder group creation
  const handleACBuilderCreateGroup = useCallback((group: DetectedACGroup, compiled: CompilationResult) => {
    const groupId = group.id;
    const rowIds = group.rows.map(r => r.id);
    onBulkUpdate(rowIds, { assetCustomizationGroupId: groupId, processingGroupId: groupId, processingGroupType: 'asset_customization' } as any);
  }, [onBulkUpdate]);

  const handleACBuilderUngroupRows = useCallback((rowIds: string[]) => {
    onBulkUpdate(rowIds, { assetCustomizationGroupId: undefined, processingGroupId: undefined, processingGroupType: undefined } as any);
  }, [onBulkUpdate]);

  // Ungroup entire processing group
  const handleUngroupEntireGroup = useCallback((groupType: ProcessingGroupKind, groupId: string) => {
    const group = processingGroups.get(`${groupType}:${groupId}`);
    if (!group) return;
    onBulkUpdate(group.rowIds, groupType === 'carousel'
      ? { carouselGroupId: undefined, processingGroupId: undefined, processingGroupType: undefined } as any
      : { assetCustomizationGroupId: undefined, processingGroupId: undefined, processingGroupType: undefined } as any);
    toast.success('Group dissolved');
  }, [processingGroups, onBulkUpdate]);

  // For asset customization groups: sync text changes across all members
  const handleRowChangeWithGroupSync = useCallback((id: string, updates: Partial<CreativeTextAssetRow>) => {
    const row = rows.find(r => r.id === id);
    const assetCustomizationGroupId = row ? getProcessingGroupId(row, 'asset_customization') : undefined;
    if (assetCustomizationGroupId) {
      // Sync text fields to all members of the same group
      const group = processingGroups.get(`asset_customization:${assetCustomizationGroupId}`);
      if (group && group.rowIds.length > 1) {
        // Only sync text asset fields, not structural ones
        const textKeys: (keyof CreativeTextAssetRow)[] = [
          'primaryText', 'primaryText2', 'primaryText3', 'primaryText4', 'primaryText5',
          'headline', 'headline2', 'headline3', 'headline4', 'headline5',
          'description', 'description2', 'description3', 'description4', 'description5',
          'caption', 'callToAction', 'destinationUrl', 'displayLink', 'brandName',
        ];
        const syncUpdates: Partial<CreativeTextAssetRow> = {};
        let hasSync = false;
        for (const key of textKeys) {
          if (key in updates) {
            (syncUpdates as any)[key] = (updates as any)[key];
            hasSync = true;
          }
        }
        if (hasSync) {
          // Apply to all group members
          onBulkUpdate(group.rowIds, syncUpdates);
          return;
        }
      }
    }
    // Default: update single row
    onRowChange(id, updates);
  }, [rows, processingGroups, onBulkUpdate, onRowChange]);

  // Rows for the carousel dialog: either selected rows (create) or editing group rows
  const carouselDialogRows = useMemo(() => {
    if (editingCarouselGroupId) {
      const group = processingGroups.get(`carousel:${editingCarouselGroupId}`);
      if (group) return rows.filter(r => group.rowIds.includes(r.id));
    }
    return selectedRows;
  }, [selectedRows, editingCarouselGroupId, processingGroups, rows]);

  // Build existingCarousel object when editing
  const editingCarousel = useMemo<CarouselLink | null>(() => {
    if (!editingCarouselGroupId) return null;
    const group = processingGroups.get(`carousel:${editingCarouselGroupId}`);
    if (!group) return null;
    const groupRows = rows.filter(r => group.rowIds.includes(r.id));
    if (groupRows.length === 0) return null;
    const first = groupRows[0];
    const cardData: Record<string, import('@/types/carouselTypes').CarouselCardData> = {};
    for (const r of groupRows) {
      cardData[r.id] = {
        cardHeadline: (r as any).carouselCardHeadline || '',
        cardDescription: (r as any).carouselCardDescription || '',
        cardWebsiteUrl: (r as any).carouselCardWebsiteUrl || '',
        cardCallToAction: (r as any).carouselCardCta || '',
      };
    }
    return {
      id: editingCarouselGroupId,
      carouselName: editingCarouselGroupId,
      adSetId: first.assignmentId?.split('_')[0] || '',
      adSetName: first.adSet || '',
      platform: first.platform || 'meta',
      market: first.market || '',
      phase: first.phase || '',
      cardIds: groupRows.map(r => r.id),
      cardData,
    };
  }, [editingCarouselGroupId, processingGroups, rows]);

  // Check if selection is valid for carousel (same ad set, 2+ creatives)
  const canCreateCarousel = useMemo(() => {
    if (selectedRows.length < 2) return false;
    const validation = validateCarouselSelection(selectedRows);
    return validation.isValid;
  }, [selectedRows]);

  const canCreateAssetCustomization = useMemo(() => {
    if (selectedRows.length < 2) return false;
    if (selectedRows.some((row) => !!getProcessingGroupId(row, 'asset_customization'))) return false;
    // Must be same ad set
    const adSets = new Set(selectedRows.map(r => `${r.platform}|${r.market}|${r.phase}|${r.adSet}`));
    if (adSets.size !== 1) return false;
    // Must be meta
    if (selectedRows[0]?.platform?.toLowerCase() !== 'meta') return false;
    return true;
  }, [selectedRows]);

  // Toggle row selection with shift+click support
  // Organic posts are excluded from selection (they are read-only)
  const toggleRowSelection = useCallback((rowId: string, shiftKey: boolean = false) => {
    // Find the row to check if it's organic
    const row = rows.find(r => r.id === rowId);
    const isOrganic = !!(row as any)?.isOrganic || !!(row as any)?.externalPostId;
    
    // Don't allow selection of organic posts
    if (isOrganic) {
      toast.info('Organic posts are read-only and cannot be selected');
      return;
    }
    
    if (shiftKey && lastSelectedRowId) {
      // Get all row IDs in order (excluding organic posts)
      const allRowIds = rows
        .filter(r => !(r as any).isOrganic && !(r as any).externalPostId)
        .map(r => r.id);
      const lastIndex = allRowIds.indexOf(lastSelectedRowId);
      const currentIndex = allRowIds.indexOf(rowId);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const startIdx = Math.min(lastIndex, currentIndex);
        const endIdx = Math.max(lastIndex, currentIndex);
        const rangeIds = allRowIds.slice(startIdx, endIdx + 1);
        
        setSelectedRowIds(prev => {
          const next = new Set(prev);
          rangeIds.forEach(id => next.add(id));
          return next;
        });
        return;
      }
    }
    
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
    setLastSelectedRowId(rowId);
  }, [rows, lastSelectedRowId]);

  // Select/deselect all in ad set (excluding organic posts)
  const toggleAdSetSelection = useCallback((rowIds: string[]) => {
    // Filter out organic posts
    const selectableIds = rowIds.filter(id => {
      const row = rows.find(r => r.id === id);
      return !(row as any)?.isOrganic && !(row as any)?.externalPostId;
    });
    
    if (selectableIds.length === 0) {
      toast.info('No selectable rows (organic posts are read-only)');
      return;
    }
    
    setSelectedRowIds(prev => {
      const allSelected = selectableIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        selectableIds.forEach(id => next.delete(id));
      } else {
        selectableIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [rows]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedRowIds(new Set());
  }, []);

  // Count filled rows for a given set of updates (moved up for dependency order)
  const countFilledRows = useCallback((rowIds: string[], updateKeys: (keyof CreativeTextAssetRow)[]) => {
    const targetRows = rows.filter(r => rowIds.includes(r.id));
    return targetRows.filter(row => {
      // A row is "filled" if ANY of the fields we're about to update already has a value
      return updateKeys.some(key => {
        const value = (row as any)[key];
        return value && String(value).trim() !== '';
      });
    }).length;
  }, [rows]);

  // Copy selected row's field values (uses first selected row)
  const copySelectedRowValues = useCallback(() => {
    if (selectedRowIds.size === 0) {
      toast.error('Select a row first');
      return;
    }
    
    const firstSelectedId = Array.from(selectedRowIds)[0];
    const sourceRow = rows.find(r => r.id === firstSelectedId);
    if (!sourceRow) return;
    
    // Copy all editable text asset fields
    const valuesToCopy: Partial<CreativeTextAssetRow> = {
      primaryText: sourceRow.primaryText,
      headline: sourceRow.headline,
      description: sourceRow.description,
      caption: sourceRow.caption,
      callToAction: sourceRow.callToAction,
      destinationUrl: sourceRow.destinationUrl,
      displayLink: sourceRow.displayLink,
    };
    
    setCopiedRowValues(valuesToCopy);
    toast.success(`Copied values from "${sourceRow.creativeName}"`);
  }, [selectedRowIds, rows]);

  // Paste copied values to all selected rows
  const pasteToSelectedRows = useCallback(() => {
    if (!copiedRowValues) {
      toast.error('No values copied. Select a row and click "Copy Row Values" first.');
      return;
    }
    
    if (selectedRowIds.size === 0) {
      toast.error('Select target rows first');
      return;
    }
    
    const targetIds = Array.from(selectedRowIds);
    
    // Filter out empty values from the copied data
    const updates: Partial<CreativeTextAssetRow> = {};
    Object.entries(copiedRowValues).forEach(([key, value]) => {
      if (value && String(value).trim() !== '') {
        (updates as any)[key] = value;
      }
    });
    
    if (Object.keys(updates).length === 0) {
      toast.error('Copied row has no values to paste');
      return;
    }
    
    // Check if any target rows already have values
    const updateKeys = Object.keys(updates) as (keyof CreativeTextAssetRow)[];
    const filledCount = countFilledRows(targetIds, updateKeys);
    
    if (filledCount > 0) {
      // Show dialog to choose mode
      setPendingApplyData({ rowIds: targetIds, updates, groupLabel: `${targetIds.length} selected rows` });
      setApplyModeDialogOpen(true);
    } else {
      // No filled fields, apply directly
      onBulkUpdate(targetIds, updates);
      toast.success(`Pasted values to ${targetIds.length} rows`);
    }
  }, [copiedRowValues, selectedRowIds, countFilledRows, onBulkUpdate]);

  const handleDeleteSelected = useCallback(async () => {
    const assignmentIds = Array.from(new Set(
      rows
        .filter((row) => selectedRowIds.has(row.id))
        .map((row) => row.assignmentId)
        .filter(Boolean)
    ));

    if (assignmentIds.length === 0) {
      toast.error('Select at least one creative to delete');
      return;
    }

    try {
      if (onDeleteAssignments) {
        await onDeleteAssignments(assignmentIds);
      } else if (onDeleteAssignment) {
        await Promise.all(assignmentIds.map((assignmentId) => Promise.resolve(onDeleteAssignment(assignmentId))));
      } else {
        return;
      }

      clearSelection();
    } catch (error) {
      console.error('Error deleting selected creatives:', error);
      toast.error('Failed to delete selected creatives');
    }
  }, [clearSelection, onDeleteAssignment, onDeleteAssignments, rows, selectedRowIds]);

  // Select rows by blank field
  const selectByBlankField = useCallback((field: keyof CreativeTextAssetRow, fieldLabel: string) => {
    const isEmpty = (val: any) => !val || String(val).trim() === '';
    const blankRowIds = rows.filter(row => isEmpty(row[field])).map(r => r.id);
    
    if (blankRowIds.length === 0) {
      toast.info(`No rows with blank ${fieldLabel} found`);
      return;
    }
    
    setSelectedRowIds(new Set(blankRowIds));
    toast.success(`Selected ${blankRowIds.length} rows with blank ${fieldLabel}`);
  }, [rows]);

  // Select all blanks (any blank field)
  const selectAllBlanks = useCallback(() => {
    const isEmpty = (val: any) => !val || String(val).trim() === '';
    const blankRowIds = rows.filter(row => 
      isEmpty(row.primaryText) || isEmpty(row.headline) || isEmpty(row.description) || 
      isEmpty(row.caption) || isEmpty(row.callToAction) || isEmpty(row.destinationUrl)
    ).map(r => r.id);
    
    if (blankRowIds.length === 0) {
      toast.info('No rows with blank fields found');
      return;
    }
    
    setSelectedRowIds(new Set(blankRowIds));
    toast.success(`Selected ${blankRowIds.length} rows with blank fields`);
  }, [rows]);

  // Handle carousel creation / edit
  const handleCreateCarousel = useCallback((carousel: CarouselLink) => {
    // Set carouselGroupId on all cards
    onBulkUpdate(
      carousel.cardIds,
      {
        carouselGroupId: carousel.id,
      } as any
    );

    // Seed card-level data from each row's existing text fields if not already set in cardData
    const rowMap = new Map(rows.map(r => [r.id, r]));
    for (const cardId of carousel.cardIds) {
      const existingCardData = carousel.cardData?.[cardId];
      const row = rowMap.get(cardId);
      if (!row) continue;

      const seeded: Record<string, string | undefined> = {
        carouselCardHeadline: existingCardData?.cardHeadline || (row.headline as string) || undefined,
        carouselCardDescription: existingCardData?.cardDescription || (row.description as string) || undefined,
        carouselCardWebsiteUrl: existingCardData?.cardWebsiteUrl || (row.destinationUrl as string) || undefined,
        carouselCardCta: existingCardData?.cardCallToAction || (row.callToAction as string) || undefined,
      };

      onBulkUpdate([cardId], seeded as any);
    }

    setShowCarouselCreator(false);
    setEditingCarouselGroupId(null);
    clearSelection();

    toast.success(`Carousel "${carousel.carouselName}" ${editingCarouselGroupId ? 'updated' : 'created'} with ${carousel.cardIds.length} cards`);
  }, [clearSelection, onBulkUpdate, rows]);

  // Handle carousel detection at a specific scope level
  const handleDetectCarousels = useCallback((scopeLevel: 'all' | 'platform' | 'market' | 'phase' | 'adset') => {
    let targetRows = rows;

    // If specific scope level, filter rows based on what's visible/relevant
    // For simplicity, we detect across all rows (the algorithm already groups by ad set)
    const detected = detectCarouselGroups(targetRows);

    if (detected.length === 0) {
      toast.info('No carousel groups detected. Try selecting creatives manually and using "Create Carousel".');
      return;
    }

    setDetectedCarousels(detected);
    setSelectedDetectedIds(new Set(detected.map(g => g.id)));
    setShowDetectionResults(true);
  }, [rows]);

  // Apply detected carousel groups
  const handleApplyDetectedCarousels = useCallback((selectedGroupIds: string[]) => {
    const groupsToApply = detectedCarousels.filter(g => selectedGroupIds.includes(g.id));
    let totalCards = 0;
    const rowMap = new Map(rows.map(r => [r.id, r]));

    for (const group of groupsToApply) {
      onBulkUpdate(group.rowIds, { carouselGroupId: group.id } as any);

      // Seed card-level data from each row's existing text fields
      for (const cardId of group.rowIds) {
        const row = rowMap.get(cardId);
        if (!row) continue;
        const seeded: Record<string, string | undefined> = {
          carouselCardHeadline: (row.headline as string) || undefined,
          carouselCardDescription: (row.description as string) || undefined,
          carouselCardWebsiteUrl: (row.destinationUrl as string) || undefined,
          carouselCardCta: (row.callToAction as string) || undefined,
        };
        onBulkUpdate([cardId], seeded as any);
      }

      totalCards += group.rowIds.length;
    }

    setShowDetectionResults(false);
    setDetectedCarousels([]);
    toast.success(`Created ${groupsToApply.length} carousel(s) with ${totalCards} total cards`);
  }, [detectedCarousels, onBulkUpdate]);

  // Get visible columns based on row's media type
  const getVisibleColumns = useCallback((mediaType: 'image' | 'video'): GridColumn[] => {
    const formatKey = mediaType === 'video' ? 'video' : 'image';
    return ALL_GRID_COLUMNS.filter(col => {
      if (!col.showFor) return true; // Always show columns without showFor
      return col.showFor.includes(formatKey);
    });
  }, []);

  // Tree view expand/collapse all
  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    // Collapse all platform-level groups
    const platformKeys = [...new Set(rows.map(r => `platform:${r.platform}`))];
    setCollapsedGroups(new Set(platformKeys));
  }, [rows]);

  // Build flat list with group headers
  const flatList = useMemo(() => {
    const items: { type: 'group' | 'row' | 'processingGroup'; key: string; row?: CreativeTextAssetRow; groupLabel?: string; groupKey?: string; level?: number; rowIds?: string[]; processingGroupType?: 'carousel' | 'asset_customization'; processingGroupId?: string; groupOrder?: number; isInProcessingGroup?: boolean }[] = [];
    
    // Group by platform > market > phase > adset
    const grouped = new Map<string, CreativeTextAssetRow[]>();
    rows.forEach(row => {
      const key = `${row.platform}|${row.market}|${row.phase}|${row.adSet}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    });
    
    // Sort and flatten
    const sortedKeys = Array.from(grouped.keys()).sort();
    let prevPlatform = '';
    let prevMarket = '';
    let prevPhase = '';
    
    for (const key of sortedKeys) {
      const [platform, market, phase, adSet] = key.split('|');
      const groupRows = grouped.get(key)!;
      
      // Platform header
      if (platform !== prevPlatform) {
        const platformKey = `platform:${platform}`;
        const platformRows = rows.filter(r => r.platform === platform);
        items.push({ 
          type: 'group', 
          key: platformKey, 
          groupLabel: platform, 
          groupKey: platformKey,
          level: 0,
          rowIds: platformRows.map(r => r.id)
        });
        prevPlatform = platform;
        prevMarket = '';
        prevPhase = '';
      }
      
      if (collapsedGroups.has(`platform:${platform}`)) continue;
      
      // Market header  
      if (market !== prevMarket) {
        const marketKey = `market:${platform}|${market}`;
        const marketRows = rows.filter(r => r.platform === platform && r.market === market);
        items.push({ 
          type: 'group', 
          key: marketKey, 
          groupLabel: market, 
          groupKey: marketKey,
          level: 1,
          rowIds: marketRows.map(r => r.id)
        });
        prevMarket = market;
        prevPhase = '';
      }
      
      if (collapsedGroups.has(`market:${platform}|${market}`)) continue;
      
      // Phase header
      if (phase !== prevPhase) {
        const phaseKey = `phase:${platform}|${market}|${phase}`;
        const phaseRows = rows.filter(r => r.platform === platform && r.market === market && r.phase === phase);
        items.push({ 
          type: 'group', 
          key: phaseKey, 
          groupLabel: phase, 
          groupKey: phaseKey,
          level: 2,
          rowIds: phaseRows.map(r => r.id)
        });
        prevPhase = phase;
      }
      
      if (collapsedGroups.has(`phase:${platform}|${market}|${phase}`)) continue;
      
      // Ad Set header
      const adSetKey = `adset:${key}`;
      items.push({ 
        type: 'group', 
        key: adSetKey, 
        groupLabel: adSet, 
        groupKey: adSetKey,
        level: 3,
        rowIds: groupRows.map(r => r.id)
      });
      
      if (collapsedGroups.has(adSetKey)) continue;
      
      // Organize rows into processing groups vs ungrouped
      const carouselMap = new Map<string, CreativeTextAssetRow[]>();
      const assetCustomizationMap = new Map<string, CreativeTextAssetRow[]>();
      const ungrouped: CreativeTextAssetRow[] = [];
      for (const row of groupRows) {
        const carouselGroupId = getProcessingGroupId(row, 'carousel');
        const assetCustomizationGroupId = getProcessingGroupId(row, 'asset_customization');

        if (carouselGroupId) {
          if (!carouselMap.has(carouselGroupId)) carouselMap.set(carouselGroupId, []);
          carouselMap.get(carouselGroupId)!.push(row);
          continue;
        }

        if (assetCustomizationGroupId) {
          if (!assetCustomizationMap.has(assetCustomizationGroupId)) assetCustomizationMap.set(assetCustomizationGroupId, []);
          assetCustomizationMap.get(assetCustomizationGroupId)!.push(row);
          continue;
        }

        ungrouped.push(row);
      }
      
      // Processing group parents + children
      for (const [pgId, pgRows] of carouselMap) {
        const pgType: ProcessingGroupKind = 'carousel';
        const pgKey = `pg:${pgType}:${pgId}`;
        items.push({
          type: 'processingGroup',
          key: pgKey,
          groupLabel: `Carousel (${pgRows.length} cards)`,
          groupKey: pgKey,
          level: 4,
          rowIds: pgRows.map(r => r.id),
          processingGroupType: pgType,
          processingGroupId: pgId,
        });

        if (!collapsedGroups.has(pgKey)) {
          pgRows.forEach((row, idx) => {
            items.push({
              type: 'row',
              key: row.id,
              row,
              groupOrder: idx + 1,
              isInProcessingGroup: true,
              processingGroupType: pgType,
            });
          });
        }
      }

      for (const [pgId, pgRows] of assetCustomizationMap) {
        const pgType: ProcessingGroupKind = 'asset_customization';
        const pgKey = `pg:asset_customization:${pgId}`;
        items.push({
          type: 'processingGroup',
          key: pgKey,
          groupLabel: `Asset Customization (${pgRows.length} assets)`,
          groupKey: pgKey,
          level: 4,
          rowIds: pgRows.map(r => r.id),
          processingGroupType: pgType,
          processingGroupId: pgId,
          row: pgRows[0],
        });
        
        if (!collapsedGroups.has(pgKey)) {
          pgRows.forEach((row, idx) => {
            items.push({
              type: 'row',
              key: row.id,
              row,
              groupOrder: undefined,
              isInProcessingGroup: true,
              processingGroupType: pgType,
            });
          });
        }
      }
      
      // Ungrouped rows
      for (const row of ungrouped) {
        items.push({ type: 'row', key: row.id, row });
      }
    }
    
    return items;
  }, [rows, collapsedGroups]);

  // Get row indices for actual data rows
  const rowItems = useMemo(() => flatList.filter(item => item.type === 'row'), [flatList]);

  // Cell key helper
  const cellKey = (rowIndex: number, colIndex: number) => `${rowIndex}-${colIndex}`;

  // Check if cell is in selection
  const isInSelection = useCallback((rowIndex: number, colIndex: number) => {
    if (!selection) return false;
    const minRow = Math.min(selection.startRow, selection.endRow);
    const maxRow = Math.max(selection.startRow, selection.endRow);
    const minCol = Math.min(selection.startCol, selection.endCol);
    const maxCol = Math.max(selection.startCol, selection.endCol);
    return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol;
  }, [selection]);

  // Get editable column index (1-based, 0 is structure)
  const getEditableColIndex = (colKey: GridColumnKey): number => {
    return GRID_COLUMNS.findIndex(c => c.key === colKey);
  };

  // Get column key from index
  const getColumnKey = (colIndex: number): GridColumnKey => {
    return GRID_COLUMNS[colIndex]?.key || 'structure';
  };

  // Handle cell mouse down
  const handleCellMouseDown = useCallback((rowIndex: number, colIndex: number, e: React.MouseEvent) => {
    if (colIndex === 0) return; // Structure column not selectable
    
    if (e.shiftKey && selection) {
      setSelection(prev => prev ? { ...prev, endRow: rowIndex, endCol: colIndex } : null);
    } else {
      setSelection({ startRow: rowIndex, startCol: colIndex, endRow: rowIndex, endCol: colIndex });
      setIsSelecting(true);
    }
    setEditingCell(null);
  }, [selection]);

  // Handle cell mouse enter (for drag selection)
  const handleCellMouseEnter = useCallback((rowIndex: number, colIndex: number) => {
    if (isSelecting && colIndex > 0) {
      setSelection(prev => prev ? { ...prev, endRow: rowIndex, endCol: colIndex } : null);
    }
  }, [isSelecting]);

  // Handle mouse up
  useEffect(() => {
    const handleMouseUp = () => setIsSelecting(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Handle cell double click (start editing)
  const handleCellDoubleClick = useCallback((rowIndex: number, colIndex: number, row: CreativeTextAssetRow) => {
    const col = GRID_COLUMNS[colIndex];
    if (!col?.editable || col.type === 'select') return;
    
    // Check if row is organic (read-only) - but allow destinationUrl editing
    const isOrganic = !!(row as any).isOrganic || !!(row as any).externalPostId;
    const isOrganicEditableColumn = col.key === 'destinationUrl';
    if (isOrganic && !isOrganicEditableColumn) {
      toast.info('Organic posts are read-only (except Destination URL)');
      return;
    }
    
    const key = cellKey(rowIndex, colIndex);
    setEditingCell(key);
    setEditValue((row as any)[col.key] || '');
  }, []);

  // Commit edit
  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    
    const [rowIndexStr, colIndexStr] = editingCell.split('-');
    const rowIndex = parseInt(rowIndexStr);
    const colIndex = parseInt(colIndexStr);
    const row = rowItems[rowIndex]?.row;
    const col = GRID_COLUMNS[colIndex];
    
    if (row && col) {
      handleRowChangeWithGroupSync(row.id, { [col.key]: editValue });
    }
    
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, rowItems, onRowChange]);

  // Cancel edit
  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  // Copy selected cells
  const copySelection = useCallback(async () => {
    if (!selection) {
      toast.error('Select cells first (Ctrl+C)');
      return;
    }
    
    const minRow = Math.min(selection.startRow, selection.endRow);
    const maxRow = Math.max(selection.startRow, selection.endRow);
    const minCol = Math.min(selection.startCol, selection.endCol);
    const maxCol = Math.max(selection.startCol, selection.endCol);
    
    const data: string[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const rowData: string[] = [];
      const row = rowItems[r]?.row;
      if (!row) continue;
      
      for (let c = minCol; c <= maxCol; c++) {
        const col = GRID_COLUMNS[c];
        if (!col) continue;
        const value = (row as any)[col.key] || '';
        rowData.push(String(value));
      }
      data.push(rowData);
    }
    
    const clipboardText = gridDataToClipboard(data);
    await navigator.clipboard.writeText(clipboardText);
    toast.success(`Copied ${data.length} rows × ${data[0]?.length || 0} columns`);
  }, [selection, rowItems]);

  // Paste from clipboard with smart header detection
  const pasteSelection = useCallback(async () => {
    if (!selection) {
      toast.error('Select a cell first, then paste (Ctrl+V)');
      return;
    }
    
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error('Clipboard is empty');
        return;
      }
      
      // Try to parse with header detection first
      const parsed = parseClipboardWithHeaders(text);
      
      if (parsed.dataRows.length === 0) {
        toast.error('No valid data in clipboard');
        return;
      }
      
      let updateCount = 0;
      
      if (parsed.hasHeaders && parsed.headerMap) {
        // Smart paste: use headers to map columns and match rows
        const rowLookup = new Map<string, CreativeTextAssetRow>();
        rows.forEach(row => {
          const key = `${row.platform}|${row.market}|${row.phase}|${row.adSet}|${row.creativeName}`;
          rowLookup.set(key.toLowerCase(), row);
        });
        
        for (const dataRow of parsed.dataRows) {
          const matchKey = parsed.matchKey(dataRow);
          const targetRow = matchKey ? rowLookup.get(matchKey.toLowerCase()) : null;
          
          // If we have match columns and found a match, update that row
          // Otherwise fall back to position-based paste
          if (targetRow) {
            // Skip organic rows
            const isOrganic = !!(targetRow as any).isOrganic || !!(targetRow as any).externalPostId;
            if (isOrganic) continue;
            
            const updates: Partial<CreativeTextAssetRow> = {};
            
            parsed.headerMap.forEach((colKey, colIdx) => {
              // Only update editable fields
              if (!EDITABLE_COLUMNS.includes(colKey as TextAssetColumnKey)) return;
              
              let value = dataRow[colIdx] || '';
              
              // Handle CTA column
              if (colKey === 'callToAction' && value) {
                value = value.toUpperCase().replace(/ /g, '_');
              }
              
              // Handle boolean columns
              if (colKey === 'autoBuildUtm') {
                (updates as any)[colKey] = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true' || value === '1';
              } else {
                (updates as any)[colKey] = value;
              }
            });
            
            if (Object.keys(updates).length > 0) {
              onRowChange(targetRow.id, updates);
              updateCount++;
            }
          }
        }
        
        if (updateCount > 0) {
          toast.success(`Smart paste: Updated ${updateCount} matched rows`);
        } else {
          // Fall back to position-based paste if no matches
          toast.info('No matching rows found, trying position-based paste...');
          await doPositionBasedPaste(parsed.dataRows);
        }
      } else {
        // Standard position-based paste
        await doPositionBasedPaste(parsed.dataRows);
      }
    } catch (err) {
      toast.error('Failed to read clipboard');
    }
  }, [selection, rows, rowItems, onRowChange]);

  // Position-based paste helper
  const doPositionBasedPaste = useCallback(async (dataRows: string[][]) => {
    if (!selection) return;
    
    const startRow = Math.min(selection.startRow, selection.endRow);
    const startCol = Math.min(selection.startCol, selection.endCol);
    
    let updateCount = 0;
    
    for (let r = 0; r < dataRows.length; r++) {
      const targetRowIndex = startRow + r;
      if (targetRowIndex >= rowItems.length) break;
      
      const row = rowItems[targetRowIndex]?.row;
      if (!row) continue;
      
      // Skip organic rows
      const isOrganic = !!(row as any).isOrganic || !!(row as any).externalPostId;
      if (isOrganic) continue;
      
      const updates: Partial<CreativeTextAssetRow> = {};
      
      for (let c = 0; c < dataRows[r].length; c++) {
        const targetColIndex = startCol + c;
        const col = GRID_COLUMNS[targetColIndex];
        if (!col?.editable) continue;
        
        let value = dataRows[r][c];
        
        // Handle CTA column - convert to uppercase with underscores
        if (col.key === 'callToAction' && value) {
          value = value.toUpperCase().replace(/ /g, '_');
        }
        
        (updates as any)[col.key] = value;
      }
      
      if (Object.keys(updates).length > 0) {
        onRowChange(row.id, updates);
        updateCount++;
      }
    }
    
    toast.success(`Pasted ${updateCount} rows`);
  }, [selection, rowItems, onRowChange]);

  // Handle file upload
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const { updatedRows, matchCount, errorCount } = await parseTextAssetExcel(file, rows);
      onImportRows(updatedRows);
      toast.success(`Imported: ${matchCount} matched, ${errorCount} unmatched`);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import file');
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [rows, onImportRows]);

  // Download Excel
  const handleDownload = useCallback(() => {
    downloadTextAssetExcel(rows, campaignName);
    toast.success('Excel file downloaded');
  }, [rows, campaignName]);

  // Undo/Redo
  const addToHistory = useCallback((newRows: CreativeTextAssetRow[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newRows);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      onImportRows(history[historyIndex - 1]);
    }
  }, [history, historyIndex, onImportRows]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      onImportRows(history[historyIndex + 1]);
    }
  }, [history, historyIndex, onImportRows]);

  // Toggle group collapse
  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);


  // Apply updates with mode (all or blanks only)
  const applyUpdatesWithMode = useCallback((
    rowIds: string[], 
    updates: Partial<CreativeTextAssetRow>, 
    mode: ApplyMode
  ) => {
    if (mode === 'all') {
      onBulkUpdate(rowIds, updates);
      toast.success(`Applied to ${rowIds.length} creatives`);
    } else {
      // Only apply to rows where the fields are blank
      const updateKeys = Object.keys(updates) as (keyof CreativeTextAssetRow)[];
      let updatedCount = 0;
      
      rowIds.forEach(id => {
        const row = rows.find(r => r.id === id);
        if (!row) return;
        
        // Build updates only for blank fields
        const blankUpdates: Partial<CreativeTextAssetRow> = {};
        updateKeys.forEach(key => {
          const currentValue = (row as any)[key];
          if (!currentValue || String(currentValue).trim() === '') {
            (blankUpdates as any)[key] = (updates as any)[key];
          }
        });
        
        if (Object.keys(blankUpdates).length > 0) {
          onRowChange(id, blankUpdates);
          updatedCount++;
        }
      });
      
      toast.success(`Applied to ${updatedCount} creatives (blank fields only)`);
    }
  }, [rows, onBulkUpdate, onRowChange]);

  // Handle apply mode confirmation
  const handleApplyModeConfirm = useCallback((mode: ApplyMode) => {
    if (pendingApplyData) {
      applyUpdatesWithMode(pendingApplyData.rowIds, pendingApplyData.updates, mode);
      setPendingApplyData(null);
    }
  }, [pendingApplyData, applyUpdatesWithMode]);

  // Paste to group - now checks for filled fields
  const handlePasteToGroup = useCallback(async (rowIds: string[], groupLabel: string) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error('Clipboard is empty');
        return;
      }
      
      const parsed = parseClipboardForGrid(text);
      if (parsed.length === 0 || parsed[0].length === 0) {
        toast.error('No valid data in clipboard');
        return;
      }
      
      // Apply first row values to all rows in group
      const firstRow = parsed[0];
      const updates: Partial<CreativeTextAssetRow> = {};
      
      // Map by column order: primaryText, headline, description, CTA, URL
      const editableKeys: (keyof CreativeTextAssetRow)[] = ['primaryText', 'headline', 'description', 'callToAction', 'destinationUrl'];
      firstRow.forEach((value, idx) => {
        if (idx < editableKeys.length && value.trim()) {
          const key = editableKeys[idx];
          if (key === 'callToAction') {
            updates[key] = value.toUpperCase().replace(/ /g, '_') as CallToAction;
          } else {
            (updates as any)[key] = value;
          }
        }
      });
      
      if (Object.keys(updates).length === 0) {
        toast.error('No valid data to apply');
        return;
      }
      
      // Check if any target rows already have values
      const updateKeys = Object.keys(updates) as (keyof CreativeTextAssetRow)[];
      const filledCount = countFilledRows(rowIds, updateKeys);
      
      if (filledCount > 0) {
        // Show dialog to choose mode
        setPendingApplyData({ rowIds, updates, groupLabel });
        setApplyModeDialogOpen(true);
      } else {
        // No filled fields, apply directly
        onBulkUpdate(rowIds, updates);
        toast.success(`Applied to ${rowIds.length} creatives`);
      }
    } catch (err) {
      toast.error('Failed to read clipboard');
    }
  }, [onBulkUpdate, countFilledRows]);

  // Keyboard shortcuts - Fixed to work properly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in input fields (except our grid)
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      
      // If the target is inside a dialog (carousel editor, etc.), don't intercept
      const isInsideDialog = target.closest('[role="dialog"]');
      if (isInsideDialog && !editingCell) return;
      
      // If editing a cell in our grid, handle edit shortcuts
      if (editingCell) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitEdit();
        } else if (e.key === 'Escape') {
          cancelEdit();
        }
        return;
      }
      
      // Skip if focused on other input fields (search, filters, etc.)
      if (isInputField) return;
      
      // Global shortcuts when not editing
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Clear selected cells
        if (selection) {
          e.preventDefault();
          const minRow = Math.min(selection.startRow, selection.endRow);
          const maxRow = Math.max(selection.startRow, selection.endRow);
          const minCol = Math.min(selection.startCol, selection.endCol);
          const maxCol = Math.max(selection.startCol, selection.endCol);
          
          for (let r = minRow; r <= maxRow; r++) {
            const row = rowItems[r]?.row;
            if (!row) continue;
            
            // Skip organic rows
            const isOrganic = !!(row as any).isOrganic || !!(row as any).externalPostId;
            if (isOrganic) continue;
            
            const updates: Partial<CreativeTextAssetRow> = {};
            for (let c = minCol; c <= maxCol; c++) {
              const col = GRID_COLUMNS[c];
              if (col?.editable) {
                (updates as any)[col.key] = '';
              }
            }
            if (Object.keys(updates).length > 0) {
              onRowChange(row.id, updates);
            }
          }
        }
      } else if (e.key === 'F2' && selection) {
        // Start editing selected cell
        const startRow = Math.min(selection.startRow, selection.endRow);
        const startCol = Math.min(selection.startCol, selection.endCol);
        const row = rowItems[startRow]?.row;
        if (row) {
          handleCellDoubleClick(startRow, startCol, row);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingCell, selection, commitEdit, cancelEdit, copySelection, pasteSelection, undo, redo, rowItems, onRowChange, handleCellDoubleClick]);

  // Focus input when editing
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Get level styles
  const getLevelIndent = (level: number) => {
    switch (level) {
      case 0: return 'pl-2';
      case 1: return 'pl-6';
      case 2: return 'pl-10';
      case 3: return 'pl-14';
      default: return 'pl-18';
    }
  };

  const getLevelBg = (level: number) => {
    switch (level) {
      case 0: return 'bg-primary/10';
      case 1: return 'bg-secondary/50';
      case 2: return 'bg-muted/50';
      case 3: return 'bg-muted/30';
      default: return '';
    }
  };

  const getLevelIcon = (level: number) => {
    switch (level) {
      case 0: return <Layers className="h-4 w-4" />;
      case 1: return <Globe className="h-4 w-4" />;
      case 2: return <Target className="h-4 w-4" />;
      case 3: return <LayoutGrid className="h-4 w-4" />;
      default: return null;
    }
  };

  // Track row index for actual data rows
  let currentRowIndex = -1;

  // Render the grid content (reused in both normal and fullscreen mode)
  const renderGridContent = () => (
    <div className="h-full flex flex-col bg-background">
      {/* Bulk Parameter Editor - Collapsible */}
      <Collapsible open={showBulkEditor} onOpenChange={setShowBulkEditor}>
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 -ml-2">
              {showBulkEditor ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Settings2 className="h-4 w-4" />
              <span className="font-medium">Bulk Edit Parameters</span>
            </Button>
          </CollapsibleTrigger>
          {selectedRowIds.size > 0 && (
            <Badge variant="outline" className="text-xs">
              {selectedRowIds.size} selected for editing
            </Badge>
          )}
        </div>
        <CollapsibleContent>
          <BulkParameterEditor
            rows={rows}
            selectedRowIds={selectedRowIds}
            onBulkUpdate={onBulkUpdate}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tree view controls */}
          <div className="flex items-center gap-1 border-r pr-2 mr-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={expandAll}>
                    <ChevronsUpDown className="h-4 w-4" />
                    <span className="ml-1 text-xs">Expand All</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Expand all groups</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={collapseAll}>
                    <ChevronsUpDown className="h-4 w-4 rotate-90" />
                    <span className="ml-1 text-xs">Collapse All</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Collapse all groups</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          {/* Row actions */}
          {selectedRowIds.size > 0 && (
            <>
              <Badge variant="outline" className="gap-1">
                <Link2 className="h-3 w-3" />
                {selectedRowIds.size} selected
              </Badge>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copySelectedRowValues}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy Row Values
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy text values from the first selected row</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={pasteToSelectedRows}
                      disabled={!copiedRowValues}
                    >
                      <Clipboard className="h-4 w-4 mr-1" />
                      Paste to Selected
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {copiedRowValues 
                      ? 'Paste copied values to all selected rows' 
                      : 'Copy a row first'
                    }
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {(onDeleteAssignment || onDeleteAssignments) && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteSelected}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete Selected
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete all selected creatives</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Carousel buttons */}
              {canCreateCarousel && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950"
                        onClick={() => setShowCarouselCreator(true)}
                      >
                        <Layers className="h-4 w-4 mr-1" />
                        Create Carousel
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Group selected creatives as a carousel (same format, 2-10 cards)</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Asset Customization button (shown when 2+ selected, meta only) */}
              {canCreateAssetCustomization && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950"
                        onClick={() => setShowAssetCustomizationBuilder(true)}
                      >
                        <LayoutGrid className="h-4 w-4 mr-1" />
                        Asset Customization
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Group selected creatives as an asset customization set (different formats/languages)</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <div className="h-5 w-px bg-border mx-1" />
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                <XCircle className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Detect buttons (shown when no selection) */}
          {selectedRowIds.size === 0 && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950"
                      onClick={() => handleDetectCarousels('all')}
                    >
                      <Sparkles className="h-4 w-4 mr-1" />
                      Detect Carousel
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Auto-detect carousel groups from creative naming patterns</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950"
                      onClick={() => setShowAssetCustomizationBuilder(true)}
                    >
                      <LayoutGrid className="h-4 w-4 mr-1" />
                      Asset Customization
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Detect and build asset customization groups for Meta</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" />
            Download Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />
            Upload Excel
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileUpload}
          />
          <div className="h-5 w-px bg-border mx-1" />
          <Select onValueChange={(value) => {
            if (value === 'all') selectAllBlanks();
            else if (value === 'primaryText') selectByBlankField('primaryText', 'Primary Text');
            else if (value === 'headline') selectByBlankField('headline', 'Headline');
            else if (value === 'description') selectByBlankField('description', 'Description');
            else if (value === 'caption') selectByBlankField('caption', 'Caption');
            else if (value === 'callToAction') selectByBlankField('callToAction', 'CTA');
            else if (value === 'destinationUrl') selectByBlankField('destinationUrl', 'Destination URL');
          }}>
            <SelectTrigger className="w-[140px] h-8">
              <Target className="h-4 w-4 mr-1" />
              <SelectValue placeholder="Select Blanks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Blank Field</SelectItem>
              <SelectItem value="primaryText">Blank Primary Text</SelectItem>
              <SelectItem value="headline">Blank Headline</SelectItem>
              <SelectItem value="description">Blank Description</SelectItem>
              <SelectItem value="caption">Blank Caption</SelectItem>
              <SelectItem value="callToAction">Blank CTA</SelectItem>
              <SelectItem value="destinationUrl">Blank URL</SelectItem>
            </SelectContent>
          </Select>
          <div className="h-5 w-px bg-border mx-1" />
          <Button variant="ghost" size="sm" onClick={copySelection} disabled={!selection}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={pasteSelection} disabled={!selection}>
            <Clipboard className="h-4 w-4" />
          </Button>
          <div className="h-5 w-px bg-border mx-1" />
          <Button variant="ghost" size="sm" onClick={undo} disabled={historyIndex === 0}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={historyIndex >= history.length - 1}>
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              {validCount} valid
            </Badge>
            {invalidCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                {invalidCount} invalid
              </Badge>
            )}
          </div>
          {/* Full Screen toggle */}
          <Button variant="outline" size="sm" onClick={() => setIsFullScreen(!isFullScreen)}>
            {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="ml-1">{isFullScreen ? 'Exit' : 'Full Screen'}</span>
          </Button>
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
      
      {/* Help text */}
      <div className="px-4 py-2 bg-muted/30 border-b text-xs text-muted-foreground">
        <span className="font-medium">Excel-like editing:</span> Select cells and paste from Excel (Ctrl+V) • Copy selection (Ctrl+C) • Double-click to edit • Delete to clear • F2 to edit
        <span className="mx-2">|</span>
        <span className="text-amber-600 font-medium">Organic posts: read-only except Destination URL</span>
      </div>

      {/* Grid with sticky columns */}
      <div className="flex-1 overflow-hidden relative" ref={containerRef}>
        <div className="h-full flex">
          {/* Sticky columns (left side) */}
          <div className="shrink-0 bg-background z-10 border-r shadow-sm" style={{ width: STICKY_WIDTH }}>
            <ScrollArea className="h-full">
              {/* Header for sticky columns */}
              <div className="sticky top-0 z-20 bg-muted border-b flex">
                {HIERARCHY_COLUMNS.map((col) => (
                  <div
                    key={col.key}
                    className="px-2 py-2 text-xs font-medium text-muted-foreground border-r shrink-0 whitespace-nowrap"
                    style={{ width: col.width }}
                  >
                    {col.label}
                  </div>
                ))}
              </div>

              {/* Body for sticky columns */}
              <div className="divide-y">
                {(() => {
                  let rowIdx = -1;
                  return flatList.map((item) => {
                    if (item.type === 'group') {
                      const isCollapsed = collapsedGroups.has(item.groupKey!);
                      
                      return (
                        <div
                          key={item.key}
                          className={cn("flex border-b cursor-pointer hover:bg-accent/50", getLevelBg(item.level!))}
                          onClick={() => toggleGroup(item.groupKey!)}
                          style={{ height: 40 }}
                        >
                          {/* Checkbox for ad set level (level 3) */}
                          {item.level === 3 && (
                            <div 
                              className="px-2 py-2 flex items-center justify-center shrink-0"
                              style={{ width: HIERARCHY_COLUMNS[0].width }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Checkbox
                                checked={item.rowIds?.every(id => selectedRowIds.has(id)) || false}
                                onCheckedChange={() => toggleAdSetSelection(item.rowIds || [])}
                                className="h-4 w-4"
                              />
                            </div>
                          )}
                          <div 
                            className={cn("flex items-center gap-2 py-2 shrink-0", item.level !== 3 && getLevelIndent(item.level!))}
                            style={{ width: item.level === 3 ? STICKY_WIDTH - HIERARCHY_COLUMNS[0].width : STICKY_WIDTH }}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            )}
                            {getLevelIcon(item.level!)}
                            <span className="font-medium truncate">{item.groupLabel}</span>
                            <Badge variant="secondary" className="text-xs ml-auto mr-2">
                              {item.rowIds?.length || 0}
                            </Badge>
                          </div>
                        </div>
                      );
                    }
                    
                    // Processing group parent header
                    if (item.type === 'processingGroup') {
                      const isCollapsed = collapsedGroups.has(item.groupKey!);
                      const isCarousel = item.processingGroupType === 'carousel';
                      const isAC = item.processingGroupType === 'asset_customization';
                      
                      return (
                        <div
                          key={item.key}
                          className={cn(
                            "flex border-b cursor-pointer hover:bg-accent/50",
                            isCarousel && "bg-blue-50/60 dark:bg-blue-950/30",
                            isAC && "bg-purple-50/60 dark:bg-purple-950/30"
                          )}
                          style={{ height: 44 }}
                        >
                          <div 
                            className="px-2 py-2 flex items-center justify-center shrink-0"
                            style={{ width: HIERARCHY_COLUMNS[0].width }}
                          />
                          <div 
                            className="flex items-center gap-2 py-2 pl-[72px] flex-1 min-w-0"
                            onClick={() => toggleGroup(item.groupKey!)}
                          >
                            {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                            {isCarousel ? (
                              <Layers className="h-4 w-4 text-blue-500 shrink-0" />
                            ) : (
                              <SquareStack className="h-4 w-4 text-purple-500 shrink-0" />
                            )}
                            <span className={cn("font-medium text-sm truncate", isCarousel ? "text-blue-700 dark:text-blue-300" : "text-purple-700 dark:text-purple-300")}>
                              {item.groupLabel}
                            </span>
                            {isCarousel && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-xs ml-auto shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCarouselGroupId(item.processingGroupId!);
                                        setShowCarouselCreator(true);
                                      }}
                                    >
                                      <Settings2 className="h-3 w-3 mr-1" />
                                      Edit
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit carousel order and text assets</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs mr-2 shrink-0"
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       handleUngroupEntireGroup(item.processingGroupType!, item.processingGroupId!);
                                     }}
                                  >
                                    <Unlink className="h-3 w-3 mr-1" />
                                    Ungroup
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Dissolve this group into individual creatives</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      );
                    }
                    
                    // Data row
                    rowIdx++;
                    const row = item.row!;
                    const errors = validateTextAssetRow(row);
                    const hasErrors = errors.length > 0;
                    const isOrganic = !!(row as any).isOrganic || !!(row as any).externalPostId;
                    const carouselGroupId = getProcessingGroupId(row, 'carousel');
                    const assetCustomizationGroupId = getProcessingGroupId(row, 'asset_customization');
                    const isCarouselGrouped = !!carouselGroupId;
                    const isACGrouped = !!assetCustomizationGroupId;
                    const isGrouped = isCarouselGrouped || isACGrouped;
                    
                    return (
                      <div
                        key={item.key}
                        className={cn(
                          "flex border-b relative",
                          hasErrors && "bg-destructive/5",
                          isOrganic && "bg-green-50/50 dark:bg-green-950/20",
                          isCarouselGrouped && !isACGrouped && "bg-blue-50/40 dark:bg-blue-950/15",
                          !isCarouselGrouped && isACGrouped && "bg-purple-50/40 dark:bg-purple-950/15",
                          isCarouselGrouped && isACGrouped && "bg-muted/40",
                          "hover:bg-accent/10"
                        )}
                        style={{ height: 40 }}
                      >
                        {/* Colored left border for processing groups */}
                        {isCarouselGrouped && (
                          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-blue-500" />
                        )}
                        {isACGrouped && (
                          <div className={cn(
                            "absolute top-0 bottom-0 w-[2px] bg-purple-500",
                            isCarouselGrouped ? "left-[2px]" : "left-0"
                          )} />
                        )}
                        
                        {/* Select checkbox */}
                        <div
                          className="px-2 py-1.5 flex items-center justify-center border-r shrink-0 cursor-pointer"
                          style={{ width: HIERARCHY_COLUMNS[0].width }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRowSelection(row.id, e.shiftKey);
                          }}
                        >
                          <Checkbox
                            checked={selectedRowIds.has(row.id)}
                            onCheckedChange={() => {}}
                            className="h-4 w-4 pointer-events-none"
                          />
                        </div>
                        
                        {/* Ad Type - shows group badge when grouped */}
                        <div
                          className="px-2 py-1.5 flex items-center justify-center gap-1 border-r shrink-0"
                          style={{ width: HIERARCHY_COLUMNS[1].width }}
                        >
                          {isGrouped ? (
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              {isCarouselGrouped && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge 
                                        variant="outline"
                                        className="text-[9px] px-1 gap-0.5 cursor-pointer border-blue-400 text-blue-600 dark:border-blue-600 dark:text-blue-400"
                                        onClick={() => handleUngroupRow(row.id, 'carousel')}
                                      >
                                        <Layers className="h-3 w-3" />
                                        <Unlink className="h-2.5 w-2.5" />
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="text-xs">
                                      <p className="font-medium">Carousel Group</p>
                                      <p className="text-muted-foreground">Click to remove this creative from the carousel</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {isACGrouped && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge 
                                        variant="outline"
                                        className="text-[9px] px-1 gap-0.5 cursor-pointer border-purple-400 text-purple-600 dark:border-purple-600 dark:text-purple-400"
                                        onClick={() => handleUngroupRow(row.id, 'asset_customization')}
                                      >
                                        <SquareStack className="h-3 w-3" />
                                        <Unlink className="h-2.5 w-2.5" />
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="text-xs">
                                      <p className="font-medium">Asset Customization Group</p>
                                      <p className="text-muted-foreground">Click to remove this creative from asset customization</p>
                                      <p className="text-muted-foreground mt-1">Text edits sync to all group members</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          ) : (
                            <Badge 
                              variant={isOrganic ? 'default' : 'secondary'}
                              className={cn(
                                "text-[10px] px-1.5",
                                isOrganic ? "bg-green-600 hover:bg-green-600" : ""
                              )}
                            >
                              {isOrganic ? 'Organic' : 'Dark'}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Platform */}
                        <div
                          className="px-2 py-1.5 flex items-center border-r shrink-0"
                          style={{ width: HIERARCHY_COLUMNS[2].width }}
                        >
                          <span className="text-xs capitalize truncate">{row.platform}</span>
                        </div>
                        
                        {/* Market */}
                        <div
                          className="px-2 py-1.5 flex items-center border-r shrink-0"
                          style={{ width: HIERARCHY_COLUMNS[3].width }}
                        >
                          <span className="text-xs truncate">{row.market}</span>
                        </div>
                        
                        {/* Phase */}
                        <div
                          className="px-2 py-1.5 flex items-center border-r shrink-0"
                          style={{ width: HIERARCHY_COLUMNS[4].width }}
                        >
                          <span className="text-xs truncate">{row.phase}</span>
                        </div>
                        
                        {/* Ad Set */}
                        <div
                          className="px-2 py-1.5 flex items-center border-r shrink-0"
                          style={{ width: HIERARCHY_COLUMNS[5].width }}
                        >
                          <span className="text-xs truncate" title={row.adSet}>{row.adSet}</span>
                        </div>
                        
                        {/* Creative Name with order badge and Thumbnail Preview */}
                        <div
                          className="px-2 py-1.5 flex items-center gap-1 border-r shrink-0"
                          style={{ width: HIERARCHY_COLUMNS[6].width }}
                        >
                          {item.groupOrder && (
                            <Badge variant="outline" className="text-[9px] px-1 h-4 shrink-0 border-blue-400 text-blue-600 dark:border-blue-600 dark:text-blue-400 font-mono">
                              #{item.groupOrder}
                            </Badge>
                          )}
                          {row.mediaType === 'video' ? (
                            <Video className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <Image className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <HoverCard openDelay={200} closeDelay={100}>
                            <HoverCardTrigger asChild>
                              <span className="text-xs truncate cursor-pointer hover:text-primary hover:underline" title={row.creativeName}>
                                {row.creativeName}
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent side="right" align="start" className="w-64 p-2">
                              <div className="space-y-2">
                                {row.thumbnailUrl ? (
                                  <AspectRatio ratio={row.width && row.height ? row.width / row.height : 16 / 9}>
                                    <div className="relative w-full h-full rounded-md overflow-hidden bg-muted">
                                      <img
                                        src={row.thumbnailUrl}
                                        alt={row.creativeName}
                                        className="w-full h-full object-cover"
                                      />
                                      {row.mediaType === 'video' && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                          <Video className="h-8 w-8 text-white" />
                                        </div>
                                      )}
                                    </div>
                                  </AspectRatio>
                                ) : (
                                  <div className="aspect-video flex items-center justify-center bg-muted rounded-md">
                                    {row.mediaType === 'video' ? (
                                      <Video className="h-10 w-10 text-muted-foreground" />
                                    ) : (
                                      <Image className="h-10 w-10 text-muted-foreground" />
                                    )}
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <p className="text-xs font-medium truncate">{row.creativeName}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {row.width && row.height && (
                                      <span>{row.width}×{row.height}</span>
                                    )}
                                    {row.aspectRatio && (
                                      <span>({row.aspectRatio})</span>
                                    )}
                                  </div>
                                  {isGrouped && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {isCarouselGrouped && (
                                        <Badge variant="outline" className="text-[9px] border-blue-400 text-blue-600">
                                          Carousel Group
                                        </Badge>
                                      )}
                                      {isACGrouped && (
                                        <Badge variant="outline" className="text-[9px] border-purple-400 text-purple-600">
                                          Asset Customization
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
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
                        
                        {/* Original Filename */}
                        <div
                          className="px-2 py-1.5 flex items-center border-r shrink-0"
                          style={{ width: HIERARCHY_COLUMNS[7].width }}
                        >
                          <span className="text-xs truncate text-muted-foreground" title={row.originalFilename || ''}>
                            {row.originalFilename || '—'}
                          </span>
                        </div>
                        
                        {/* Folder Path */}
                        <div
                          className="px-2 py-1.5 flex items-center border-r shrink-0"
                          style={{ width: HIERARCHY_COLUMNS[8].width }}
                        >
                          <span className="text-xs truncate text-muted-foreground" title={row.folderPath || ''}>
                            {row.folderPath || '—'}
                          </span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </ScrollArea>
          </div>

          {/* Scrollable columns (right side) */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="min-w-max">
                {/* Header for scrollable columns */}
                <div className="sticky top-0 z-10 bg-muted border-b flex">
                  {SCROLLABLE_COLUMNS.map((col) => (
                    <div
                      key={col.key}
                      className="px-2 py-2 text-xs font-medium text-muted-foreground border-r shrink-0"
                      style={{ width: col.width }}
                    >
                      {col.label}
                    </div>
                  ))}
                </div>

              {/* Body for scrollable columns */}
              <div className="divide-y">
                {(() => {
                  let rowIdx = -1;
                  return flatList.map((item) => {
                    if (item.type === 'group') {
                      const isCollapsed = collapsedGroups.has(item.groupKey!);
                        
                        return (
                          <div
                            key={item.key}
                            className={cn("flex border-b cursor-pointer hover:bg-accent/50", getLevelBg(item.level!))}
                            onClick={() => toggleGroup(item.groupKey!)}
                            style={{ height: 40 }}
                          >
                            {/* Paste to group button in scrollable area */}
                            <div className="flex-1 flex items-center px-2 gap-2">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePasteToGroup(item.rowIds || [], item.groupLabel || '');
                                      }}
                                    >
                                      <Clipboard className="h-3 w-3 mr-1" />
                                      Paste to all
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Paste from clipboard to {item.rowIds?.length || 0} creatives
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        );
                      }
                      
                      // Processing group parent in scrollable area
                      if (item.type === 'processingGroup') {
                        const isCarouselPG = item.processingGroupType === 'carousel';
                        const isACPG = item.processingGroupType === 'asset_customization';
                        const isCollapsedPG = collapsedGroups.has(item.groupKey!);
                        
                        if (isACPG && item.row) {
                          // AC parent: show shared text fields
                          const acRow = item.row;
                          const acPlatform = acRow.platform.toLowerCase() as Platform;
                          
                          return (
                            <div
                              key={item.key}
                              className="flex border-b bg-purple-50/60 dark:bg-purple-950/30"
                              style={{ height: 44 }}
                            >
                              {SCROLLABLE_COLUMNS.map((col) => {
                                if (col.key === 'delete') {
                                  return <div key={col.key} className="px-1 py-1 border-r shrink-0" style={{ width: col.width }} />;
                                }
                                if (col.key === 'placements' || col.key === 'adFormat' || col.key === 'thumbnail') {
                                  return (
                                    <div key={col.key} className="px-1 py-1 border-r shrink-0" style={{ width: col.width }}>
                                      {col.key === 'placements' && (
                                      <div
                                        className="h-7 inline-flex items-center gap-1 px-2 text-xs text-purple-600 dark:text-purple-400 font-medium italic rounded cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-900/30"
                                        onClick={() => toggleGroup(item.groupKey!)}
                                      >
                                          {isCollapsedPG ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                          Shared text
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                
                                if (col.type === 'select') {
                                  const val = (acRow as any)[col.key] || '';
                                  return (
                                    <div key={col.key} className="px-1 py-1 border-r shrink-0 bg-purple-50/30 dark:bg-purple-950/10" style={{ width: col.width }}>
                                      <Select
                                        value={val}
                                        onValueChange={(v) => onBulkUpdate(item.rowIds || [], { [col.key]: v })}
                                      >
                                        <SelectTrigger className="h-7 text-xs border-purple-200 dark:border-purple-800 bg-transparent">
                                          <SelectValue placeholder="Select..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-popover z-50">
                                          {(PLATFORM_CTAS[acPlatform] || PLATFORM_CTAS.meta).map(cta => (
                                            <SelectItem key={cta} value={cta} className="text-xs">
                                              {cta.replace(/_/g, ' ')}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  );
                                }
                                
                                // Text fields - editable, synced to all group members
                                const val = (acRow as any)[col.key] || '';
                                const fieldCfg = PLATFORM_TEXT_FIELDS[acPlatform]?.find(f => f.id === col.key);
                                
                                return (
                                  <div
                                    key={col.key}
                                    className="px-1 py-1 border-r shrink-0 bg-purple-50/30 dark:bg-purple-950/10"
                                    style={{ width: col.width }}
                                    onDoubleClick={() => {
                                      const fakeIdx = rowItems.findIndex(ri => ri.row?.id === acRow.id);
                                      if (fakeIdx >= 0) {
                                        const absCol = HIERARCHY_COLUMNS.length + SCROLLABLE_COLUMNS.indexOf(col);
                                        handleCellDoubleClick(fakeIdx, absCol, acRow);
                                      }
                                    }}
                                  >
                                    <div className="flex items-center">
                                      <div className="h-7 px-2 text-xs flex items-center truncate flex-1 rounded hover:bg-purple-100/50 dark:hover:bg-purple-900/30" title={val}>
                                        {val || <span className="text-muted-foreground italic">Empty</span>}
                                      </div>
                                      {fieldCfg?.maxLength && <CharCounter value={val} maxLength={fieldCfg.maxLength} />}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                        
                        // Carousel parent: summary row
                        return (
                            <div
                            key={item.key}
                              className="flex border-b bg-blue-50/60 dark:bg-blue-950/30 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/40"
                              onClick={() => toggleGroup(item.groupKey!)}
                            style={{ height: 44 }}
                          >
                            <div className="flex-1 flex items-center px-4 gap-2">
                                {isCollapsedPG ? <ChevronRight className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> : <ChevronDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
                              <span className="text-xs text-blue-600 dark:text-blue-400 italic">
                                {isCollapsedPG ? 'Expand to edit individual card text' : 'Edit text for each card below'}
                              </span>
                            </div>
                          </div>
                        );
                      }
                      
                      // Data row
                      rowIdx++;
                      const rowIndex = rowIdx;
                      const row = item.row!;
                      const errors = validateTextAssetRow(row);
                      const hasErrors = errors.length > 0;
                      const platform = row.platform.toLowerCase() as Platform;
                      const isOrganic = !!(row as any).isOrganic || !!(row as any).externalPostId;
                      const isCarouselGrouped = row.processingGroupType === 'carousel';
                      const isACGrouped = row.processingGroupType === 'asset_customization';
                      const isGrouped = !!(row.processingGroupId && row.processingGroupType);
                      const isACChild = !!(item.isInProcessingGroup && item.processingGroupType === 'asset_customization');
                      
                      return (
                        <div
                          key={item.key}
                          className={cn(
                            "flex border-b",
                            hasErrors && "bg-destructive/5",
                            isOrganic && "bg-green-50/50 dark:bg-green-950/20",
                            isCarouselGrouped && "bg-blue-50/40 dark:bg-blue-950/15",
                            isACGrouped && "bg-purple-50/40 dark:bg-purple-950/15",
                            "hover:bg-accent/10"
                          )}
                          style={{ height: 40 }}
                        >
                          {SCROLLABLE_COLUMNS.map((col, colIdx) => {
                            const absoluteColIdx = HIERARCHY_COLUMNS.length + colIdx;
                            const isSelected = isInSelection(rowIndex, absoluteColIdx);
                            const isEditing = editingCell === cellKey(rowIndex, absoluteColIdx);
                            
                            // Placements column
                            if (col.key === 'placements') {
                              const width = (row as any).width;
                              const height = (row as any).height;
                              const placementBadges = getPlacementBadges(width, height, row.mediaType, row.platform);
                              
                              return (
                                <div
                                  key={col.key}
                                  className="px-1 py-1.5 flex items-center gap-1 border-r shrink-0"
                                  style={{ width: col.width }}
                                >
                                  {placementBadges.map((badge) => (
                                    <PlacementBadge
                                      key={badge.type}
                                      type={badge.type}
                                      variant={badge.variant}
                                      tooltip={badge.tooltip}
                                    />
                                  ))}
                                </div>
                              );
                            }
                            
                            // Skip columns not applicable to this row's format
                            if (col.showFor && !col.showFor.includes(row.mediaType)) {
                              return (
                                <div
                                  key={col.key}
                                  className="px-1 py-1 border-r shrink-0 bg-muted/20"
                                  style={{ width: col.width }}
                                >
                                  <div className="h-7 flex items-center justify-center text-xs text-muted-foreground italic">
                                    N/A
                                  </div>
                                </div>
                              );
                            }
                            
                            // Skip columns not applicable to this row's platform
                            if (col.showForPlatform && !col.showForPlatform.includes(platform as 'tiktok')) {
                              return (
                                <div
                                  key={col.key}
                                  className="px-1 py-1 border-r shrink-0 bg-muted/20"
                                  style={{ width: col.width }}
                                >
                                  <div className="h-7 flex items-center justify-center text-xs text-muted-foreground italic">
                                    —
                                  </div>
                                </div>
                              );
                            }
                            
                            // Thumbnail column for TikTok videos
                            if (col.type === 'thumbnail') {
                              const creativeId = row.creativeId;
                              const advertiserId = (row as any).tiktokAdvertiserId || (row as any).advertiserId || '';
                              const thumbnailId = (row as any).platformThumbnailId;
                              const thumbnailUrl = (row as any).thumbnailUrl || (row as any).thumbnail_url;
                              
                              return (
                                <div
                                  key={col.key}
                                  className="px-1 py-1 border-r shrink-0"
                                  style={{ width: col.width }}
                                >
                                  <ThumbnailUploader
                                    creativeId={creativeId}
                                    advertiserId={advertiserId}
                                    currentThumbnailId={thumbnailId}
                                    thumbnailPreviewUrl={thumbnailUrl}
                                    compact
                                    onThumbnailChange={(newId) => {
                                      toast.success('Thumbnail updated');
                                    }}
                                  />
                                </div>
                              );
                            }
                            
                            // Delete column
                            if (col.key === 'delete') {
                              return (
                                <div
                                  key={col.key}
                                  className="px-1 py-1 border-r shrink-0 flex items-center justify-center"
                                  style={{ width: col.width }}
                                >
                                  {onDeleteAssignment && (row as any).assignmentId && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => onDeleteAssignment((row as any).assignmentId)}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Delete this assignment</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                              );
                            }
                            
                            const value = (row as any)[col.key] || '';
                            const fieldConfig = PLATFORM_TEXT_FIELDS[platform]?.find(f => f.id === col.key);
                            
                            if (col.type === 'adFormat') {
                              const availableFormats = getAvailableFormats(row.platform, row.mediaType);
                              const isSuggested = !row.adFormatConfirmed && row.suggestedAdFormat;
                              
                              return (
                                <div
                                  key={col.key}
                                  className={cn(
                                    "px-1 py-1 border-r shrink-0",
                                    isSelected && "bg-primary/20 outline outline-2 outline-primary"
                                  )}
                                  style={{ width: col.width }}
                                  onMouseDown={(e) => handleCellMouseDown(rowIndex, absoluteColIdx, e)}
                                  onMouseEnter={() => handleCellMouseEnter(rowIndex, absoluteColIdx)}
                                >
                                  <div className="flex items-center gap-1">
                                    {isSuggested && (
                                      <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                                    )}
                                    <Select
                                      value={row.adFormat}
                                      onValueChange={(v) => onRowChange(row.id, { 
                                        adFormat: v as AdFormat, 
                                        adFormatConfirmed: true 
                                      })}
                                      disabled={isOrganic}
                                    >
                                      <SelectTrigger className={cn(
                                        "h-7 text-xs border-transparent hover:border-input bg-transparent flex-1",
                                        isSuggested && "text-amber-600"
                                      )}>
                                        <SelectValue placeholder="Select format..." />
                                      </SelectTrigger>
                                      <SelectContent className="bg-popover z-50">
                                        {availableFormats.map(format => (
                                          <SelectItem key={format} value={format} className="text-xs">
                                            {getFormatLabel(format)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              );
                            }
                            
                            if (col.type === 'select') {
                              return (
                                <div
                                  key={col.key}
                                  className={cn(
                                    "px-1 py-1 border-r shrink-0",
                                    isSelected && "bg-primary/20 outline outline-2 outline-primary",
                                    isOrganic && "opacity-75",
                                    isACChild && "bg-purple-50/20 dark:bg-purple-950/10 opacity-60"
                                  )}
                                  style={{ width: col.width }}
                                  onMouseDown={(e) => handleCellMouseDown(rowIndex, absoluteColIdx, e)}
                                  onMouseEnter={() => handleCellMouseEnter(rowIndex, absoluteColIdx)}
                                >
                                  <Select
                                    value={value}
                                    onValueChange={(v) => handleRowChangeWithGroupSync(row.id, { [col.key]: v })}
                                    disabled={isOrganic || isACChild}
                                  >
                                    <SelectTrigger className="h-7 text-xs border-transparent hover:border-input bg-transparent">
                                      <SelectValue placeholder="Select..." />
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
                              );
                            }
                            
                            // Text columns - read-only for organic posts and AC children (text shared from parent)
                            const isOrganicEditableColumn = col.key === 'destinationUrl';
                            const isLockedOrganic = isOrganic && !isOrganicEditableColumn;
                            const isLockedACChild = isACChild && ['primaryText', 'headline', 'description', 'caption', 'callToAction', 'displayLink', 'brandName'].includes(col.key);
                            const isLocked = isLockedOrganic || isLockedACChild;
                            
                            return (
                              <div
                                key={col.key}
                                className={cn(
                                  "px-1 py-1 border-r shrink-0",
                                  isSelected && "bg-primary/20 outline outline-2 outline-primary",
                                  isOrganic && !isOrganicEditableColumn && "bg-green-50/30 dark:bg-green-950/10",
                                  isOrganic && isOrganicEditableColumn && "bg-amber-50/30 dark:bg-amber-950/10",
                                  isLockedACChild && "bg-purple-50/20 dark:bg-purple-950/10"
                                )}
                                style={{ width: col.width }}
                                onMouseDown={(e) => !isLocked && handleCellMouseDown(rowIndex, absoluteColIdx, e)}
                                onMouseEnter={() => !isLocked && handleCellMouseEnter(rowIndex, absoluteColIdx)}
                                onDoubleClick={() => !isLocked && handleCellDoubleClick(rowIndex, absoluteColIdx, row)}
                              >
                                <div className="flex items-center">
                                  {isEditing && !isLocked ? (
                                    <Input
                                      ref={inputRef}
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onBlur={commitEdit}
                                      className="h-7 text-xs"
                                    />
                                  ) : (
                                    <>
                                      <div 
                                        className={cn(
                                          "h-7 px-2 text-xs flex items-center truncate flex-1 rounded",
                                          !isLocked && "hover:bg-muted/50",
                                          isLocked && "cursor-default italic text-muted-foreground"
                                        )}
                                        title={isLockedACChild ? '↑ Shared from parent' : value}
                                      >
                                        {isLockedACChild 
                                          ? <span className="text-purple-400 dark:text-purple-600 italic text-[10px]">↑ Shared</span>
                                          : (value || <span className="text-muted-foreground italic">{isLockedOrganic ? '—' : 'Empty'}</span>)
                                        }
                                      </div>
                                      {fieldConfig?.maxLength && !isLockedOrganic && (
                                        <CharCounter value={value} maxLength={fieldConfig.maxLength} />
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
      
      {/* Apply Mode Dialog */}
      <ApplyModeDialog
        open={applyModeDialogOpen}
        onOpenChange={setApplyModeDialogOpen}
        onConfirm={handleApplyModeConfirm}
        groupLabel={pendingApplyData?.groupLabel || ''}
        itemCount={pendingApplyData?.rowIds.length || 0}
        filledCount={pendingApplyData ? countFilledRows(
          pendingApplyData.rowIds, 
          Object.keys(pendingApplyData.updates) as (keyof CreativeTextAssetRow)[]
        ) : 0}
      />

      {/* Carousel Creator Dialog */}
      <CarouselCreator
        selectedRows={carouselDialogRows}
        existingCarousel={editingCarousel}
        onCreateCarousel={handleCreateCarousel}
        onCancel={() => {
          setShowCarouselCreator(false);
          setEditingCarouselGroupId(null);
        }}
        open={showCarouselCreator}
        onRowChange={onRowChange}
      />


       {/* Detection Results Dialog */}
      <Dialog open={showDetectionResults} onOpenChange={(open) => {
        setShowDetectionResults(open);
        if (!open) setSelectedDetectedIds(new Set());
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-500" />
              Detected Carousels ({detectedCarousels.length})
            </DialogTitle>
          </DialogHeader>
          {detectedCarousels.length > 1 && (
            <div className="flex items-center gap-2 pb-1">
              <Checkbox
                id="select-all-carousels"
                checked={selectedDetectedIds.size === detectedCarousels.length}
                onCheckedChange={(checked) => {
                  setSelectedDetectedIds(checked ? new Set(detectedCarousels.map(g => g.id)) : new Set());
                }}
              />
              <label htmlFor="select-all-carousels" className="text-xs text-muted-foreground cursor-pointer">
                Select all
              </label>
            </div>
          )}
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {detectedCarousels.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No carousel groups detected.</p>
            ) : (
              detectedCarousels.map(group => {
                const isSelected = selectedDetectedIds.has(group.id);
                return (
                  <div
                    key={group.id}
                    className={cn(
                      "border rounded-lg p-3 space-y-2 cursor-pointer transition-colors",
                      isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50"
                    )}
                    onClick={() => {
                      setSelectedDetectedIds(prev => {
                        const next = new Set(prev);
                        if (next.has(group.id)) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      });
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            setSelectedDetectedIds(prev => {
                              const next = new Set(prev);
                              if (checked) next.add(group.id); else next.delete(group.id);
                              return next;
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Layers className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-sm">{group.name}</span>
                        <Badge variant={group.confidence === 'high' ? 'default' : 'secondary'} className="text-[10px]">
                          {group.confidence}
                        </Badge>
                      </div>
                      <Badge variant="outline" className="text-xs">{group.rowIds.length} cards • {group.aspectGroup}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Detected by: {group.reason}</p>
                    <div className="flex flex-wrap gap-1">
                      {group.rowIds.map(id => {
                        const row = rows.find(r => r.id === id);
                        return row ? (
                          <Badge key={id} variant="secondary" className="text-[10px] gap-1">
                            {row.mediaType === 'video' ? <Video className="h-2.5 w-2.5" /> : <Image className="h-2.5 w-2.5" />}
                            {row.creativeName}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {detectedCarousels.length > 0 && (
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setShowDetectionResults(false)}>Cancel</Button>
              <Button
                className="gap-1"
                disabled={selectedDetectedIds.size === 0}
                onClick={() => handleApplyDetectedCarousels([...selectedDetectedIds])}
              >
                <Layers className="h-4 w-4" />
                Apply{selectedDetectedIds.size === detectedCarousels.length ? ' All' : ''} ({selectedDetectedIds.size} carousel{selectedDetectedIds.size !== 1 ? 's' : ''})
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Asset Customization Builder Dialog */}
      <AssetCustomizationBuilder
        open={showAssetCustomizationBuilder}
        onOpenChange={setShowAssetCustomizationBuilder}
        rows={rows}
        selectedRowIds={selectedRowIds}
        platform={rows[0]?.platform || 'meta'}
        onCreateGroup={handleACBuilderCreateGroup}
        onUngroupRows={handleACBuilderUngroupRows}
      />
    </div>
  );

  // Full screen modal
  if (isFullScreen) {
    return (
      <Dialog open={isFullScreen} onOpenChange={setIsFullScreen}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] max-h-[95vh] p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Creative Content Editor - Full Screen</DialogTitle>
          </DialogHeader>
          {renderGridContent()}
        </DialogContent>
      </Dialog>
    );
  }

  return renderGridContent();
}
