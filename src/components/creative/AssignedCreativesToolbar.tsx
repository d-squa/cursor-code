// Toolbar for bulk actions on assigned creatives
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Trash2, Copy, RefreshCw, CheckSquare, Square, Loader2, Upload } from 'lucide-react';

interface AssignedCreativesToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRefresh: () => void;
  onUploadToDsp?: () => void;
  isDeleting: boolean;
  isDuplicating: boolean;
  isUploading?: boolean;
  uploadableCount?: number;
}

export function AssignedCreativesToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onDuplicate,
  onRefresh,
  onUploadToDsp,
  isDeleting,
  isDuplicating,
  isUploading = false,
  uploadableCount = 0,
}: AssignedCreativesToolbarProps) {
  const hasSelection = selectedCount > 0;
  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
      {/* Selection controls */}
      <Button
        variant="ghost"
        size="sm"
        onClick={allSelected ? onDeselectAll : onSelectAll}
        className="h-8 px-2"
      >
        {allSelected ? (
          <Square className="h-4 w-4 mr-1" />
        ) : (
          <CheckSquare className="h-4 w-4 mr-1" />
        )}
        {allSelected ? 'Deselect All' : 'Select All'}
      </Button>

      {hasSelection && (
        <>
          <Badge variant="secondary" className="text-xs">
            {selectedCount} selected
          </Badge>

          <Separator orientation="vertical" className="h-6" />


           {/* Upload-to-DSP removed to avoid confusion with "Push Creatives" on Launch page */}

          {/* Bulk actions */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDuplicate}
            disabled={isDuplicating}
            className="h-8 px-2 text-primary hover:text-primary"
          >
            {isDuplicating ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Copy className="h-4 w-4 mr-1" />
            )}
            Duplicate
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
            className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1" />
            )}
            Delete
          </Button>
        </>
      )}

      <div className="flex-1" />

      <Button variant="outline" size="sm" onClick={onRefresh} className="h-8">
        <RefreshCw className="h-4 w-4 mr-1" />
        Refresh
      </Button>
    </div>
  );
}
