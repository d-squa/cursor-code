// Creative Grid with drag-drop support and bulk actions
import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Search, 
  Filter, 
  Grid3X3, 
  List,
  Trash2,
  Copy,
  FolderInput,
  CheckSquare,
  Square,
  LayoutGrid,
  MoreVertical,
  Play,
  Image as ImageIcon,
  Edit,
} from 'lucide-react';
import { CreativeCard } from './CreativeCard';
import type { Creative, CreativeFilters, CreativeStatus, Platform, CreativeDragData } from '@/types/creative';
import { cn } from '@/lib/utils';

interface CreativeGridProps {
  creatives: Creative[];
  isLoading?: boolean;
  onEdit?: (creative: Creative) => void;
  onDuplicate?: (creative: Creative) => void;
  onDelete?: (id: string) => void;
  onBulkAction?: (action: string, ids: string[]) => void;
  onDrop?: (creativeId: string, target: { platform: Platform; market: string; phase: string }) => void;
  filters?: CreativeFilters;
  onFiltersChange?: (filters: CreativeFilters) => void;
  emptyMessage?: string;
}

type ViewMode = 'grid' | 'compact' | 'list';

// Compact list row with tiny thumbnail
function CreativeListRow({
  creative,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  creative: Creative;
  isSelected: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onEdit?: (creative: Creative) => void;
  onDuplicate?: (creative: Creative) => void;
  onDelete?: (id: string) => void;
}) {
  const [imageError, setImageError] = useState(false);
  const thumbnailUrl = creative.thumbnailUrl || creative.mediaUrls?.[0];
  const isVideo = creative.creativeType === 'video' || creative.durationSeconds;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors',
        isSelected && 'ring-2 ring-primary bg-accent/30'
      )}
    >
      {/* Selection Checkbox */}
      {onSelect && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onSelect(creative.id, !!checked)}
          className="shrink-0"
        />
      )}

      {/* Tiny Thumbnail - 32x32 */}
      <div className="relative w-8 h-8 shrink-0 rounded overflow-hidden bg-muted">
        {thumbnailUrl && !imageError ? (
          <>
            <img
              src={thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
              loading="lazy"
            />
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Play className="h-3 w-3 text-white" fill="white" />
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" title={creative.name}>
          {creative.name}
        </p>
      </div>

      {/* Platform badge */}
      <Badge variant="outline" className="text-xs shrink-0">
        {creative.platform}
      </Badge>

      {/* Market */}
      {creative.market && (
        <Badge variant="secondary" className="text-xs shrink-0">
          {creative.market}
        </Badge>
      )}

      {/* Dimensions */}
      {creative.width && creative.height && (
        <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
          {creative.width}×{creative.height}
        </span>
      )}

      {/* Status */}
      <Badge
        variant="secondary"
        className={cn(
          'text-xs shrink-0',
          creative.status === 'ready' && 'bg-green-500/20 text-green-700 dark:text-green-400',
          creative.status === 'error' && 'bg-destructive/20 text-destructive',
          creative.status === 'needs_review' && 'bg-yellow-500/20 text-yellow-700'
        )}
      >
        {creative.status.replace('_', ' ')}
      </Badge>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onEdit && (
            <DropdownMenuItem onClick={() => onEdit(creative)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
          )}
          {onDuplicate && (
            <DropdownMenuItem onClick={() => onDuplicate(creative)}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(creative.id)} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
export function CreativeGrid({
  creatives,
  isLoading = false,
  onEdit,
  onDuplicate,
  onDelete,
  onBulkAction,
  onDrop,
  filters = {},
  onFiltersChange,
  emptyMessage = 'No creatives found',
}: CreativeGridProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState(filters.search || '');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Handle selection
  const handleSelect = useCallback((id: string, selected: boolean) => {
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
    if (selectedIds.size === creatives.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(creatives.map(c => c.id)));
    }
  }, [creatives, selectedIds.size]);

  // Handle drag start
  const handleDragStart = useCallback((e: React.DragEvent, creative: Creative) => {
    setDraggingId(creative.id);
    const dragData: CreativeDragData = {
      creativeId: creative.id,
      sourceLocation: {
        platform: creative.platform,
        market: creative.market,
        phase: creative.phaseName,
      },
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
  }, []);

  // Handle search
  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    onFiltersChange?.({ ...filters, search: value || undefined });
  }, [filters, onFiltersChange]);

  // Filter options
  const handleFilterChange = useCallback((key: keyof CreativeFilters, value: string | undefined) => {
    if (key === 'platforms') {
      onFiltersChange?.({ ...filters, platforms: value ? [value as Platform] : undefined });
    } else if (key === 'statuses') {
      onFiltersChange?.({ ...filters, statuses: value ? [value as CreativeStatus] : undefined });
    }
  }, [filters, onFiltersChange]);

  // Stats
  const stats = useMemo(() => {
    const byStatus = creatives.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const byPlatform = creatives.reduce((acc, c) => {
      acc[c.platform] = (acc[c.platform] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { byStatus, byPlatform, total: creatives.length };
  }, [creatives]);

  // Bulk actions
  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size > 0) {
      onBulkAction?.('delete', Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  }, [selectedIds, onBulkAction]);

  const handleBulkDuplicate = useCallback(() => {
    if (selectedIds.size > 0) {
      onBulkAction?.('duplicate', Array.from(selectedIds));
    }
  }, [selectedIds, onBulkAction]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-[4/5] rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search creatives..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Platform Filter */}
          <Select
            value={filters.platforms?.[0] || 'all'}
            onValueChange={(v) => handleFilterChange('platforms', v === 'all' ? undefined : v)}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              <SelectItem value="meta">Meta</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select
            value={filters.statuses?.[0] || 'all'}
            onValueChange={(v) => handleFilterChange('statuses', v === 'all' ? undefined : v)}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="needs_review">Needs Review</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          {/* Selection & Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mr-2">
              <Badge variant="secondary">{selectedIds.size} selected</Badge>
              <Button variant="ghost" size="sm" onClick={handleBulkDuplicate}>
                <Copy className="h-4 w-4 mr-1" />
                Duplicate
              </Button>
              <Button variant="ghost" size="sm" onClick={handleBulkDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          )}

          {/* Select All */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSelectAll}
            title={selectedIds.size === creatives.length ? 'Deselect all' : 'Select all'}
          >
            {selectedIds.size === creatives.length && creatives.length > 0 ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </Button>

          {/* View Mode */}
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="rounded-r-none"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'compact' ? 'secondary' : 'ghost'}
              size="icon"
              className="rounded-none border-x"
              onClick={() => setViewMode('compact')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="rounded-l-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{stats.total} creatives</Badge>
        {Object.entries(stats.byStatus).map(([status, count]) => (
          <Badge key={status} variant="outline" className="capitalize">
            {status.replace('_', ' ')}: {count}
          </Badge>
        ))}
      </div>

      {/* Grid */}
      {creatives.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FolderInput className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">{emptyMessage}</p>
          <p className="text-sm">Upload creatives using folder or spreadsheet import</p>
        </div>
      ) : (
        <div
          className={cn(
            'grid gap-4',
            viewMode === 'grid' && 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
            viewMode === 'compact' && 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
            viewMode === 'list' && 'grid-cols-1 gap-2'
          )}
          onDragEnd={handleDragEnd}
        >
          {creatives.map((creative) => (
            viewMode === 'list' ? (
              <CreativeListRow
                key={creative.id}
                creative={creative}
                isSelected={selectedIds.has(creative.id)}
                onSelect={handleSelect}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            ) : (
              <CreativeCard
                key={creative.id}
                creative={creative}
                isSelected={selectedIds.has(creative.id)}
                onSelect={handleSelect}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onDragStart={onDrop ? handleDragStart : undefined}
                isDragging={draggingId === creative.id}
                compact={viewMode === 'compact'}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}
