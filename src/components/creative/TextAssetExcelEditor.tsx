// Excel-like Text Asset Editor with full copy/paste support
// Similar to Google Ads Editor bulk editing experience

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Save, Download, Upload, Copy, Clipboard, Undo2, Redo2,
  Image, Video, AlertCircle, CheckCircle, XCircle,
  ChevronDown, ChevronRight, Layers, Globe, Target, LayoutGrid, Sparkles
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
  gridDataToClipboard,
  TEXT_ASSET_COLUMNS,
  EDITABLE_COLUMNS,
  type TextAssetColumnKey 
} from '@/utils/textAssetExcelUtils';
import { getAvailableFormats, getFormatLabel, AD_FORMAT_LABELS } from '@/utils/adFormatDetection';

interface TextAssetExcelEditorProps {
  rows: CreativeTextAssetRow[];
  campaignName: string;
  onRowChange: (id: string, updates: Partial<CreativeTextAssetRow>) => void;
  onBulkUpdate: (ids: string[], updates: Partial<CreativeTextAssetRow>) => void;
  onImportRows: (rows: CreativeTextAssetRow[]) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
}

// Grid columns for the editor (focused on editable fields)
const GRID_COLUMNS: Array<{ key: string; label: string; width: number; editable: boolean; type?: 'text' | 'select' | 'adFormat' }> = [
  { key: 'structure', label: 'Platform / Market / Phase / Ad Set / Creative', width: 320, editable: false, type: 'text' },
  { key: 'adFormat', label: 'Ad Format', width: 140, editable: true, type: 'adFormat' },
  { key: 'primaryText', label: 'Primary Text', width: 220, editable: true, type: 'text' },
  { key: 'headline', label: 'Headline', width: 160, editable: true, type: 'text' },
  { key: 'description', label: 'Description', width: 160, editable: true, type: 'text' },
  { key: 'callToAction', label: 'CTA', width: 130, editable: true, type: 'select' },
  { key: 'destinationUrl', label: 'Destination URL', width: 220, editable: true, type: 'text' },
  { key: 'displayLink', label: 'Display Link', width: 120, editable: true, type: 'text' },
];

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
  isSaving
}: TextAssetExcelEditorProps) {
  // State
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [history, setHistory] = useState<CreativeTextAssetRow[][]>([rows]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isSelecting, setIsSelecting] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation stats
  const validCount = useMemo(() => rows.filter(r => validateTextAssetRow(r).length === 0).length, [rows]);
  const invalidCount = rows.length - validCount;

  // Build flat list with group headers
  const flatList = useMemo(() => {
    const items: { type: 'group' | 'row'; key: string; row?: CreativeTextAssetRow; groupLabel?: string; groupKey?: string; level?: number; rowIds?: string[] }[] = [];
    
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
      
      // Creative rows
      for (const row of groupRows) {
        items.push({ type: 'row', key: row.id, row });
      }
    }
    
    return items;
  }, [rows, collapsedGroups]);

  // Get row indices for selection
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
  const handleCellDoubleClick = useCallback((rowIndex: number, colIndex: number) => {
    const col = GRID_COLUMNS[colIndex];
    if (!col?.editable || col.type === 'select') return;
    
    const row = rowItems[rowIndex]?.row;
    if (!row) return;
    
    const key = cellKey(rowIndex, colIndex);
    setEditingCell(key);
    setEditValue((row as any)[col.key] || '');
  }, [rowItems]);

  // Commit edit
  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    
    const [rowIndexStr, colIndexStr] = editingCell.split('-');
    const rowIndex = parseInt(rowIndexStr);
    const colIndex = parseInt(colIndexStr);
    const row = rowItems[rowIndex]?.row;
    const col = GRID_COLUMNS[colIndex];
    
    if (row && col) {
      onRowChange(row.id, { [col.key]: editValue });
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
    if (!selection) return;
    
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

  // Paste from clipboard
  const pasteSelection = useCallback(async () => {
    if (!selection) return;
    
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error('Clipboard is empty');
        return;
      }
      
      const parsed = parseClipboardForGrid(text);
      if (parsed.length === 0) {
        toast.error('No valid data in clipboard');
        return;
      }
      
      const startRow = Math.min(selection.startRow, selection.endRow);
      const startCol = Math.min(selection.startCol, selection.endCol);
      
      let updateCount = 0;
      
      for (let r = 0; r < parsed.length; r++) {
        const targetRowIndex = startRow + r;
        if (targetRowIndex >= rowItems.length) break;
        
        const row = rowItems[targetRowIndex]?.row;
        if (!row) continue;
        
        const updates: Partial<CreativeTextAssetRow> = {};
        
        for (let c = 0; c < parsed[r].length; c++) {
          const targetColIndex = startCol + c;
          const col = GRID_COLUMNS[targetColIndex];
          if (!col?.editable) continue;
          
          let value = parsed[r][c];
          
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
    } catch (err) {
      toast.error('Failed to read clipboard');
    }
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

  // Paste to group
  const handlePasteToGroup = useCallback(async (rowIds: string[]) => {
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
      
      if (Object.keys(updates).length > 0) {
        onBulkUpdate(rowIds, updates);
        toast.success(`Applied to ${rowIds.length} creatives`);
      }
    } catch (err) {
      toast.error('Failed to read clipboard');
    }
  }, [onBulkUpdate]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If editing, handle edit shortcuts
      if (editingCell) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitEdit();
        } else if (e.key === 'Escape') {
          cancelEdit();
        }
        return;
      }
      
      // Global shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        copySelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        pasteSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
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
        handleCellDoubleClick(startRow, startCol);
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

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
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
        <span className="font-medium">Excel-like editing:</span> Select cells and paste from Excel (Ctrl+V) • Copy selection (Ctrl+C) • Double-click to edit • Delete to clear • F2 to edit selected cell
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-hidden" ref={containerRef}>
        <ScrollArea className="h-full">
          <div className="min-w-max">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-muted border-b flex">
              {GRID_COLUMNS.map((col, colIdx) => (
                <div
                  key={col.key}
                  className="px-2 py-2 text-xs font-medium text-muted-foreground border-r shrink-0"
                  style={{ width: col.width }}
                >
                  {col.label}
                </div>
              ))}
            </div>

            {/* Body */}
            <div className="divide-y">
              {flatList.map((item) => {
                if (item.type === 'group') {
                  const isCollapsed = collapsedGroups.has(item.groupKey!);
                  
                  return (
                    <div
                      key={item.key}
                      className={cn("flex border-b cursor-pointer hover:bg-accent/50", getLevelBg(item.level!))}
                      onClick={() => toggleGroup(item.groupKey!)}
                    >
                      <div 
                        className={cn("flex items-center gap-2 py-2 shrink-0", getLevelIndent(item.level!))}
                        style={{ width: GRID_COLUMNS[0].width }}
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
                      
                      {/* Paste to group button */}
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
                                  handlePasteToGroup(item.rowIds || []);
                                }}
                              >
                                <Clipboard className="h-3 w-3 mr-1" />
                                Paste to all
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Paste from clipboard to {item.rowIds?.length || 0} creatives
                              <br />
                              <span className="text-muted-foreground">Format: Primary Text, Headline, Description, CTA, URL (tab-separated)</span>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  );
                }
                
                // Data row
                currentRowIndex++;
                const rowIndex = currentRowIndex;
                const row = item.row!;
                const errors = validateTextAssetRow(row);
                const hasErrors = errors.length > 0;
                const platform = row.platform.toLowerCase() as Platform;
                
                return (
                  <div
                    key={item.key}
                    className={cn("flex border-b", hasErrors && "bg-destructive/5", "hover:bg-accent/10")}
                  >
                    {GRID_COLUMNS.map((col, colIdx) => {
                      const isSelected = isInSelection(rowIndex, colIdx);
                      const isEditing = editingCell === cellKey(rowIndex, colIdx);
                      
                      if (col.key === 'structure') {
                        return (
                          <div
                            key={col.key}
                            className="px-2 py-1.5 flex items-center gap-2 border-r shrink-0 pl-[72px]"
                            style={{ width: col.width }}
                          >
                            {row.mediaType === 'video' ? (
                              <Video className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <Image className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="text-sm truncate" title={row.creativeName}>
                              {row.creativeName}
                            </span>
                            {hasErrors && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
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
                            onMouseDown={(e) => handleCellMouseDown(rowIndex, colIdx, e)}
                            onMouseEnter={() => handleCellMouseEnter(rowIndex, colIdx)}
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
                              isSelected && "bg-primary/20 outline outline-2 outline-primary"
                            )}
                            style={{ width: col.width }}
                            onMouseDown={(e) => handleCellMouseDown(rowIndex, colIdx, e)}
                            onMouseEnter={() => handleCellMouseEnter(rowIndex, colIdx)}
                          >
                            <Select
                              value={value}
                              onValueChange={(v) => onRowChange(row.id, { [col.key]: v })}
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
                      
                      return (
                        <div
                          key={col.key}
                          className={cn(
                            "px-1 py-1 border-r shrink-0",
                            isSelected && "bg-primary/20 outline outline-2 outline-primary"
                          )}
                          style={{ width: col.width }}
                          onMouseDown={(e) => handleCellMouseDown(rowIndex, colIdx, e)}
                          onMouseEnter={() => handleCellMouseEnter(rowIndex, colIdx)}
                          onDoubleClick={() => handleCellDoubleClick(rowIndex, colIdx)}
                        >
                          <div className="flex items-center">
                            {isEditing ? (
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
                                  className="h-7 px-2 text-xs flex items-center truncate flex-1 rounded hover:bg-muted/50"
                                  title={value}
                                >
                                  {value || <span className="text-muted-foreground italic">Empty</span>}
                                </div>
                                {fieldConfig?.maxLength && (
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
              })}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
