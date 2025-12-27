// Excel-like Grid Editor with inline editing and real-time validation
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
import type { Platform, CreativeType, SpreadsheetCreativeRow } from '@/types/creative';
import { VALID_OPTIMIZATION_GOALS, VALID_FUNNEL_STAGES } from '@/utils/creativeValidation';

interface SpreadsheetEditorProps {
  rows: SpreadsheetCreativeRow[];
  onChange: (rows: SpreadsheetCreativeRow[]) => void;
}

// Column definitions
const COLUMNS = [
  { key: 'name', label: 'Name', width: 180, required: true, type: 'text' },
  { key: 'platform', label: 'Platform', width: 100, required: true, type: 'select' },
  { key: 'market', label: 'Market', width: 80, required: true, type: 'text' },
  { key: 'phase', label: 'Phase', width: 120, required: true, type: 'select' },
  { key: 'optimizationGoal', label: 'Optimization Goal', width: 150, required: true, type: 'select' },
  { key: 'creativeType', label: 'Type', width: 120, required: true, type: 'select' },
  { key: 'mediaUrl', label: 'Media URL', width: 200, required: false, type: 'text' },
  { key: 'externalPostId', label: 'Post ID', width: 120, required: false, type: 'text' },
  { key: 'primaryText', label: 'Primary Text', width: 200, required: false, type: 'text' },
  { key: 'headline', label: 'Headline', width: 150, required: false, type: 'text' },
  { key: 'description', label: 'Description', width: 180, required: false, type: 'text' },
  { key: 'callToAction', label: 'CTA', width: 120, required: false, type: 'select' },
  { key: 'destinationUrl', label: 'Destination URL', width: 200, required: false, type: 'text' },
] as const;

type ColumnKey = typeof COLUMNS[number]['key'];

const PLATFORMS: Platform[] = ['meta', 'tiktok', 'google', 'linkedin', 'snapchat', 'pinterest', 'x'];
const CREATIVE_TYPES: CreativeType[] = ['dark_post', 'existing_post', 'image', 'video', 'carousel', 'collection', 'instant_experience'];
const CTAS = ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW', 'CONTACT_US', 'GET_QUOTE', 'APPLY_NOW', 'SUBSCRIBE', 'ORDER_NOW', 'INSTALL_APP', 'WATCH_MORE'];

// Validate a single row
function validateRow(row: SpreadsheetCreativeRow): string[] {
  const errors: string[] = [];
  
  if (!row.name?.trim()) errors.push('Name is required');
  if (!PLATFORMS.includes(row.platform as Platform)) errors.push(`Invalid platform: ${row.platform}`);
  if (!row.market?.trim() || !/^[A-Z]{2}$/i.test(row.market)) errors.push(`Invalid market code: ${row.market}`);
  if (row.phase && !VALID_FUNNEL_STAGES.map(s => s.toLowerCase()).includes(row.phase.toLowerCase())) {
    errors.push(`Invalid phase: ${row.phase}`);
  }
  if (!CREATIVE_TYPES.includes(row.creativeType as CreativeType)) errors.push(`Invalid type: ${row.creativeType}`);
  
  // Platform-specific optimization goal validation
  const platform = row.platform as Platform;
  if (platform && row.optimizationGoal && VALID_OPTIMIZATION_GOALS[platform]) {
    if (!VALID_OPTIMIZATION_GOALS[platform].includes(row.optimizationGoal.toUpperCase())) {
      errors.push(`Invalid optimization goal for ${platform}: ${row.optimizationGoal}`);
    }
  }
  
  // Type-specific validation
  if (row.creativeType === 'dark_post' && !row.mediaUrl) {
    errors.push('Dark post requires a media URL');
  }
  if (row.creativeType === 'existing_post' && !row.externalPostId) {
    errors.push('Existing post requires a post ID');
  }
  
  return errors;
}

// Create empty row
function createEmptyRow(rowNumber: number): SpreadsheetCreativeRow {
  return {
    rowNumber,
    name: '',
    platform: 'meta',
    market: '',
    phase: 'Awareness',
    optimizationGoal: 'REACH',
    creativeType: 'dark_post',
    mediaUrl: '',
    externalPostId: '',
    primaryText: '',
    headline: '',
    description: '',
    callToAction: '',
    destinationUrl: '',
    isValid: false,
    validationErrors: ['Name is required', 'Invalid market code: '],
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
    return String(row[colKey] ?? '');
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
      // Range selection
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
      // Toggle selection
      const newSelection = new Set(selectedCells);
      if (newSelection.has(key)) {
        newSelection.delete(key);
      } else {
        newSelection.add(key);
      }
      setSelectedCells(newSelection);
    } else {
      // Single selection
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
    const [targetRowStr, targetCol] = targetKey.split('-');
    const targetRow = parseInt(targetRowStr);
    
    const newRows = [...rows];
    
    // Get the offset from copied cells
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
          // Clear selected cells
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

  // Get optimization goals for platform
  const getOptimizationGoals = (platform: string) => {
    return VALID_OPTIMIZATION_GOALS[platform as Platform] || [];
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
                    const isSelected = selectedCells.has(key);
                    const isEditing = editingCell === key;
                    const value = getCellValue(row, col.key);
                    const hasError = row.validationErrors.some(e => 
                      e.toLowerCase().includes(col.key.toLowerCase()) || 
                      e.toLowerCase().includes(col.label.toLowerCase())
                    );

                    return (
                      <div
                        key={col.key}
                        className={cn(
                          'p-1 border-r flex items-center cursor-pointer transition-colors',
                          isSelected && 'bg-primary/10 ring-1 ring-primary ring-inset',
                          hasError && !isSelected && 'bg-destructive/10'
                        )}
                        style={{ width: col.width, minWidth: col.width }}
                        onClick={(e) => handleCellClick(rowIndex, col.key, e)}
                        onDoubleClick={() => handleCellDoubleClick(rowIndex, col.key)}
                      >
                        {isEditing ? (
                          <Input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            className="h-7 text-sm"
                          />
                        ) : col.type === 'select' ? (
                          <Select
                            value={value}
                            onValueChange={(v) => handleSelectChange(rowIndex, col.key, v)}
                          >
                            <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {col.key === 'platform' && PLATFORMS.map(p => (
                                <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                              ))}
                              {col.key === 'phase' && VALID_FUNNEL_STAGES.map(p => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                              {col.key === 'creativeType' && CREATIVE_TYPES.map(t => (
                                <SelectItem key={t} value={t} className="capitalize">
                                  {t.replace(/_/g, ' ')}
                                </SelectItem>
                              ))}
                              {col.key === 'optimizationGoal' && getOptimizationGoals(row.platform).map(g => (
                                <SelectItem key={g} value={g}>{g}</SelectItem>
                              ))}
                              {col.key === 'callToAction' && CTAS.map(c => (
                                <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={cn(
                            'text-sm truncate px-1',
                            !value && 'text-muted-foreground italic'
                          )}>
                            {value || (col.required ? 'Required' : '-')}
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
                  const newRow = { ...row, rowNumber: rows.length + 1, name: `${row.name} (copy)` };
                  updateRows([...rows, newRow]);
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
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p className="text-sm">No rows yet</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={addRow}>
                <Plus className="h-4 w-4 mr-1" />
                Add First Row
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer hints */}
      <div className="p-2 border-t bg-muted/30 text-xs text-muted-foreground flex items-center gap-4">
        <span>Double-click to edit • Ctrl+C/V to copy/paste • Ctrl+Z to undo • Delete to clear</span>
      </div>
    </div>
  );
}
