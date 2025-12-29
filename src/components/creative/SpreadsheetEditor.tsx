// Excel-like Grid Editor with inline editing - aligned with content calendar template
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Plus,
  Trash2,
  Copy,
  ClipboardPaste,
  Undo2,
  Redo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SpreadsheetCreativeRow } from '@/types/creative';

interface SpreadsheetEditorProps {
  rows: SpreadsheetCreativeRow[];
  onChange: (rows: SpreadsheetCreativeRow[]) => void;
}

// Content calendar aligned column definitions
const COLUMNS = [
  { key: 'name', label: 'Name', width: 180, required: true, type: 'text' },
  { key: 'brandName', label: 'Brand', width: 120, required: false, type: 'text' },
  { key: 'campaignName', label: 'Campaign', width: 150, required: false, type: 'text' },
  { key: 'platform', label: 'Platform', width: 100, required: true, type: 'select' },
  { key: 'markets', label: 'Markets', width: 150, required: true, type: 'text' },
  { key: 'objective', label: 'Objective', width: 120, required: true, type: 'select' },
  { key: 'language', label: 'Language', width: 80, required: false, type: 'text' },
  { key: 'format', label: 'Format', width: 140, required: true, type: 'select' },
  { key: 'placement', label: 'Placement', width: 120, required: false, type: 'select' },
  { key: 'mediaType', label: 'Media Type', width: 100, required: false, type: 'select' },
  { key: 'actualLength', label: 'Duration', width: 100, required: false, type: 'text' },
  { key: 'dimensions', label: 'Dimensions', width: 140, required: false, type: 'text' },
  { key: 'priority', label: 'Priority', width: 90, required: false, type: 'select' },
  { key: 'assignedTo', label: 'Assigned To', width: 120, required: false, type: 'text' },
  { key: 'flightStartDate', label: 'Flight Start', width: 100, required: false, type: 'text' },
  { key: 'flightEndDate', label: 'Flight End', width: 100, required: false, type: 'text' },
  { key: 'materialDeliveryDeadline', label: 'Delivery Deadline', width: 120, required: false, type: 'text' },
  { key: 'launchDate', label: 'Launch Date', width: 100, required: false, type: 'text' },
  { key: 'specsLink', label: 'Specs Link', width: 180, required: false, type: 'text' },
  { key: 'assetsLink', label: 'Assets Link', width: 180, required: false, type: 'text' },
  { key: 'approvalStatus', label: 'Approval', width: 120, required: false, type: 'select' },
  { key: 'status', label: 'Status', width: 100, required: false, type: 'select' },
  { key: 'notes', label: 'Notes', width: 200, required: false, type: 'text' },
] as const;

type ColumnKey = typeof COLUMNS[number]['key'];

const PLATFORMS = ['Meta', 'TikTok', 'Google', 'Snapchat', 'LinkedIn', 'Pinterest', 'X', 'DV360', 'Programmatic'];
const OBJECTIVES = ['Awareness', 'Consideration', 'Conversion', 'Traffic', 'Engagement', 'App Installs', 'Video Views', 'Lead Generation'];
const FORMATS = [
  'Video - Feed', 'Video - Stories', 'Video - Reels', 'Video - TikTok', 'Video - Snap Ads',
  'Image', 'Image/Carousel', 'Carousel', 'Collection',
  'Static Banner', 'Display', 'Native',
  'Dark Post', 'Existing Post', 'Spark Ads'
];
const PLACEMENTS = ['Feed', 'Stories', 'Reels', 'In-Stream', 'Search', 'Explore', 'TikTok For You', 'Spotlight', 'Native', 'Display'];
const MEDIA_TYPES = ['Video', 'Image', 'GIF', 'Carousel', 'Collection'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const APPROVAL_STATUSES = ['Pending Review', 'Internal Approved', 'Client Approved', 'Needs Revision', 'Rejected'];
const STATUSES = ['Draft', 'Pending', 'Ready', 'In Progress', 'Live', 'Completed', 'On Hold'];

// Validate a single row
function validateRow(row: SpreadsheetCreativeRow): string[] {
  const errors: string[] = [];
  
  if (!row.name?.trim()) errors.push('Name is required');
  if (!row.platform?.trim()) errors.push('Platform is required');
  if (!row.markets?.trim()) errors.push('Markets is required');
  if (!row.objective?.trim()) errors.push('Objective is required');
  if (!row.format?.trim()) errors.push('Format is required');
  
  return errors;
}

// Create empty row
function createEmptyRow(rowNumber: number): SpreadsheetCreativeRow {
  return {
    rowNumber,
    name: '',
    platform: 'Meta',
    markets: '',
    objective: 'Awareness',
    language: 'EN',
    format: 'Video - Feed',
    actualLength: '',
    dimensions: '',
    captionCharLimit: '',
    headlineCharLimit: '',
    descriptionCharLimit: '',
    ctaCharLimit: '',
    materialDeliveryDeadline: '',
    launchDate: '',
    specsLink: '',
    assetsLink: '',
    status: 'Draft',
    notes: '',
    phase: 'Awareness',
    creativeType: 'video',
    market: '',
    isValid: false,
    validationErrors: ['Name is required', 'Markets is required'],
  };
}

export function SpreadsheetEditor({ rows, onChange }: SpreadsheetEditorProps) {
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [history, setHistory] = useState<SpreadsheetCreativeRow[][]>([rows]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [copiedCells, setCopiedCells] = useState<Map<string, string>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update rows with validation
  const updateRows = useCallback((newRows: SpreadsheetCreativeRow[], addToHistory = true) => {
    const validatedRows = newRows.map(row => {
      const errors = validateRow(row);
      return { ...row, isValid: errors.length === 0, validationErrors: errors };
    });
    
    onChange(validatedRows);
    
    if (addToHistory) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(validatedRows);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [onChange, history, historyIndex]);

  // Cell key helper
  const cellKey = (rowIndex: number, colKey: string) => `${rowIndex}-${colKey}`;

  // Get cell value
  const getCellValue = (row: SpreadsheetCreativeRow, colKey: ColumnKey): string => {
    return String((row as any)[colKey] ?? '');
  };

  // Start editing a cell
  const startEditing = useCallback((rowIndex: number, colKey: ColumnKey) => {
    const key = cellKey(rowIndex, colKey);
    setEditingCell(key);
    setEditValue(getCellValue(rows[rowIndex], colKey));
  }, [rows]);

  // Commit edit
  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    
    const [rowIndexStr, colKey] = editingCell.split('-');
    const rowIndex = parseInt(rowIndexStr);
    
    const newRows = [...rows];
    newRows[rowIndex] = { ...newRows[rowIndex], [colKey]: editValue };
    updateRows(newRows);
    
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, rows, updateRows]);

  // Cancel edit
  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  // Handle cell click
  const handleCellClick = useCallback((rowIndex: number, colKey: ColumnKey, e: React.MouseEvent) => {
    const key = cellKey(rowIndex, colKey);
    
    if (e.shiftKey && selectedCells.size > 0) {
      const lastSelected = Array.from(selectedCells).pop();
      if (lastSelected) {
        const [lastRow] = lastSelected.split('-').map(Number);
        const minRow = Math.min(lastRow, rowIndex);
        const maxRow = Math.max(lastRow, rowIndex);
        const newSelection = new Set<string>();
        for (let r = minRow; r <= maxRow; r++) {
          newSelection.add(cellKey(r, colKey));
        }
        setSelectedCells(newSelection);
      }
    } else if (e.ctrlKey || e.metaKey) {
      const newSelection = new Set(selectedCells);
      if (newSelection.has(key)) {
        newSelection.delete(key);
      } else {
        newSelection.add(key);
      }
      setSelectedCells(newSelection);
    } else {
      setSelectedCells(new Set([key]));
    }
  }, [selectedCells]);

  // Handle cell double-click to edit
  const handleCellDoubleClick = useCallback((rowIndex: number, colKey: ColumnKey) => {
    const col = COLUMNS.find(c => c.key === colKey);
    if (col?.type === 'text') {
      startEditing(rowIndex, colKey);
    }
  }, [startEditing]);

  // Handle select change
  const handleSelectChange = useCallback((rowIndex: number, colKey: ColumnKey, value: string) => {
    const newRows = [...rows];
    newRows[rowIndex] = { ...newRows[rowIndex], [colKey]: value };
    updateRows(newRows);
  }, [rows, updateRows]);

  // Add new row
  const addRow = useCallback(() => {
    const newRow = createEmptyRow(rows.length + 1);
    updateRows([...rows, newRow]);
  }, [rows, updateRows]);

  // Delete selected rows
  const deleteSelectedRows = useCallback(() => {
    const rowIndicesToDelete = new Set<number>();
    selectedCells.forEach(key => {
      const [rowIndex] = key.split('-').map(Number);
      rowIndicesToDelete.add(rowIndex);
    });
    
    const newRows = rows.filter((_, i) => !rowIndicesToDelete.has(i))
      .map((row, i) => ({ ...row, rowNumber: i + 1 }));
    
    updateRows(newRows);
    setSelectedCells(new Set());
  }, [rows, selectedCells, updateRows]);

  // Copy selected cells
  const copySelectedCells = useCallback(() => {
    const copied = new Map<string, string>();
    selectedCells.forEach(key => {
      const [rowIndexStr, colKey] = key.split('-');
      const rowIndex = parseInt(rowIndexStr);
      copied.set(key, getCellValue(rows[rowIndex], colKey as ColumnKey));
    });
    setCopiedCells(copied);
  }, [rows, selectedCells]);

  // Paste cells
  const pasteCells = useCallback(() => {
    if (copiedCells.size === 0 || selectedCells.size === 0) return;
    
    const targetKey = Array.from(selectedCells)[0];
    const [targetRowStr] = targetKey.split('-');
    const targetRow = parseInt(targetRowStr);
    
    const newRows = [...rows];
    
    const copiedKeys = Array.from(copiedCells.keys());
    const [firstCopiedRowStr] = copiedKeys[0].split('-');
    const firstCopiedRow = parseInt(firstCopiedRowStr);
    const rowOffset = targetRow - firstCopiedRow;
    
    copiedCells.forEach((value, key) => {
      const [rowStr, col] = key.split('-');
      const newRowIndex = parseInt(rowStr) + rowOffset;
      if (newRowIndex >= 0 && newRowIndex < newRows.length) {
        newRows[newRowIndex] = { ...newRows[newRowIndex], [col]: value };
      }
    });
    
    updateRows(newRows);
  }, [copiedCells, rows, selectedCells, updateRows]);

  // Undo/Redo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      onChange(history[historyIndex - 1]);
    }
  }, [history, historyIndex, onChange]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      onChange(history[historyIndex + 1]);
    }
  }, [history, historyIndex, onChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingCell) {
        if (e.key === 'Enter') {
          commitEdit();
        } else if (e.key === 'Escape') {
          cancelEdit();
        }
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        copySelectedCells();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        pasteCells();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedCells.size > 0 && !editingCell) {
          e.preventDefault();
          const newRows = [...rows];
          selectedCells.forEach(key => {
            const [rowStr, col] = key.split('-');
            const rowIndex = parseInt(rowStr);
            newRows[rowIndex] = { ...newRows[rowIndex], [col]: '' };
          });
          updateRows(newRows);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingCell, commitEdit, cancelEdit, undo, redo, copySelectedCells, pasteCells, selectedCells, rows, updateRows]);

  // Focus input when editing
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Stats
  const validCount = useMemo(() => rows.filter(r => r.isValid).length, [rows]);
  const invalidCount = useMemo(() => rows.filter(r => !r.isValid).length, [rows]);

  // Get select options based on column
  const getSelectOptions = (colKey: ColumnKey): string[] => {
    switch (colKey) {
      case 'platform': return PLATFORMS;
      case 'objective': return OBJECTIVES;
      case 'format': return FORMATS;
      case 'status': return STATUSES;
      default: return [];
    }
  };

  return (
    <div className="flex flex-col h-full border rounded-lg bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-2 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" />
            Add Row
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={deleteSelectedRows}
            disabled={selectedCells.size === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" onClick={copySelectedCells} disabled={selectedCells.size === 0}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={pasteCells} disabled={copiedCells.size === 0}>
            <ClipboardPaste className="h-4 w-4" />
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" onClick={undo} disabled={historyIndex === 0}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={historyIndex >= history.length - 1}>
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Grid */}
      <ScrollArea className="flex-1" ref={containerRef}>
        <div className="min-w-max">
          {/* Header */}
          <div className="flex sticky top-0 z-10 bg-muted border-b">
            <div className="w-12 shrink-0 p-2 text-xs font-medium text-muted-foreground border-r flex items-center justify-center">
              #
            </div>
            <div className="w-10 shrink-0 p-2 text-xs font-medium text-muted-foreground border-r flex items-center justify-center">
              ✓
            </div>
            {COLUMNS.map(col => (
              <div
                key={col.key}
                className="p-2 text-xs font-medium text-muted-foreground border-r flex items-center gap-1"
                style={{ width: col.width, minWidth: col.width }}
              >
                {col.label}
                {col.required && <span className="text-destructive">*</span>}
              </div>
            ))}
          </div>

          {/* Rows */}
          {rows.map((row, rowIndex) => (
            <ContextMenu key={row.rowNumber}>
              <ContextMenuTrigger asChild>
                <div className={cn(
                  'flex border-b hover:bg-muted/30',
                  !row.isValid && 'bg-destructive/5'
                )}>
                  {/* Row number */}
                  <div className="w-12 shrink-0 p-2 text-xs text-muted-foreground border-r flex items-center justify-center font-mono">
                    {row.rowNumber}
                  </div>
                  
                  {/* Validation status */}
                  <div className="w-10 shrink-0 p-2 border-r flex items-center justify-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          {row.isValid ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          )}
                        </TooltipTrigger>
                        {!row.isValid && row.validationErrors.length > 0 && (
                          <TooltipContent side="right" className="max-w-xs">
                            <ul className="text-xs space-y-1">
                              {row.validationErrors.map((err, i) => (
                                <li key={i}>• {err}</li>
                              ))}
                            </ul>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  {/* Data cells */}
                  {COLUMNS.map(col => {
                    const key = cellKey(rowIndex, col.key);
                    const isEditing = editingCell === key;
                    const isSelected = selectedCells.has(key);
                    const value = getCellValue(row, col.key);
                    
                    return (
                      <div
                        key={col.key}
                        className={cn(
                          'p-1 border-r flex items-center cursor-pointer',
                          isSelected && 'bg-primary/10 ring-1 ring-inset ring-primary',
                          !value && col.required && 'bg-destructive/5'
                        )}
                        style={{ width: col.width, minWidth: col.width }}
                        onClick={(e) => handleCellClick(rowIndex, col.key, e)}
                        onDoubleClick={() => handleCellDoubleClick(rowIndex, col.key)}
                      >
                        {isEditing && col.type === 'text' ? (
                          <Input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            className="h-7 text-xs"
                          />
                        ) : col.type === 'select' ? (
                          <Select
                            value={value}
                            onValueChange={(v) => handleSelectChange(rowIndex, col.key, v)}
                          >
                            <SelectTrigger className="h-7 text-xs border-0 shadow-none">
                              <SelectValue placeholder={`Select ${col.label}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {getSelectOptions(col.key).map(opt => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={cn(
                            'text-xs truncate px-1',
                            !value && 'text-muted-foreground italic'
                          )}>
                            {value || (col.required ? 'Required' : '')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => {
                  const newRow = createEmptyRow(rows.length + 1);
                  const newRows = [...rows];
                  newRows.splice(rowIndex + 1, 0, newRow);
                  updateRows(newRows.map((r, i) => ({ ...r, rowNumber: i + 1 })));
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Insert Row Below
                </ContextMenuItem>
                <ContextMenuItem onClick={() => {
                  const duplicatedRow = { ...row, rowNumber: rows.length + 1 };
                  updateRows([...rows, duplicatedRow].map((r, i) => ({ ...r, rowNumber: i + 1 })));
                }}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate Row
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem 
                  onClick={() => {
                    const newRows = rows.filter((_, i) => i !== rowIndex)
                      .map((r, i) => ({ ...r, rowNumber: i + 1 }));
                    updateRows(newRows);
                  }}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Row
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}

          {/* Empty state */}
          {rows.length === 0 && (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              No rows. Click "Add Row" to start.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
