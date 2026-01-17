// TikTok Thumbnail Uploader Component
// TikTok video ads require a thumbnail image - this component handles upload/management
import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Image as ImageIcon,
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ThumbnailUploaderProps {
  creativeId: string;
  advertiserId: string;
  currentThumbnailId?: string | null;
  thumbnailPreviewUrl?: string | null;
  videoPreviewUrl?: string | null;
  onThumbnailChange?: (thumbnailId: string | null) => void;
  compact?: boolean;
}

export function ThumbnailUploader({
  creativeId,
  advertiserId,
  currentThumbnailId,
  thumbnailPreviewUrl,
  videoPreviewUrl,
  onThumbnailChange,
  compact = false,
}: ThumbnailUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(thumbnailPreviewUrl || null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Upload thumbnail mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload to TikTok
      const { data, error } = await supabase.functions.invoke('upload-creative-to-tiktok', {
        body: {
          advertiserId,
          fileName: `thumbnail_${creativeId}_${Date.now()}.${file.name.split('.').pop()}`,
          fileData: base64,
          fileType: 'image',
          mimeType: file.type,
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Upload failed');
      }

      return data.imageId;
    },
    onSuccess: async (imageId) => {
      // Update creative with thumbnail ID
      await supabase
        .from('creatives')
        .update({ platform_thumbnail_id: imageId })
        .eq('id', creativeId);

      onThumbnailChange?.(imageId);
      toast.success('Thumbnail uploaded successfully');
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Failed to upload thumbnail: ${error.message}`);
    },
  });

  // Remove thumbnail mutation
  const removeMutation = useMutation({
    mutationFn: async () => {
      await supabase
        .from('creatives')
        .update({ platform_thumbnail_id: null })
        .eq('id', creativeId);
    },
    onSuccess: () => {
      setPreviewUrl(null);
      onThumbnailChange?.(null);
      toast.success('Thumbnail removed');
    },
    onError: (error) => {
      toast.error(`Failed to remove thumbnail: ${error.message}`);
    },
  });

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large (max 10MB)');
      return;
    }

    // Create preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    // Upload
    uploadMutation.mutate(file);
  }, [uploadMutation]);

  // Handle drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      toast.error('Please drop an image file');
      return;
    }
    
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    uploadMutation.mutate(file);
  }, [uploadMutation]);

  const hasThumbnail = !!currentThumbnailId;
  const isLoading = uploadMutation.isPending || removeMutation.isPending;

  // Compact view for inline display
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {hasThumbnail ? (
          <>
            <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-400">
              <CheckCircle className="h-3 w-3 mr-1" />
              Thumbnail set
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsDialogOpen(true)}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDialogOpen(true)}
            className="h-7 text-xs"
          >
            <Upload className="h-3 w-3 mr-1" />
            Add Thumbnail
          </Button>
        )}

        <ThumbnailDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          inputRef={inputRef}
          previewUrl={previewUrl}
          videoPreviewUrl={videoPreviewUrl}
          hasThumbnail={hasThumbnail}
          isLoading={isLoading}
          onFileSelect={handleFileSelect}
          onDrop={handleDrop}
          onRemove={() => removeMutation.mutate()}
        />
      </div>
    );
  }

  // Full view
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Video Thumbnail</span>
          </div>
          {hasThumbnail && (
            <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-400">
              <CheckCircle className="h-3 w-3 mr-1" />
              Set
            </Badge>
          )}
        </div>

        {!hasThumbnail && (
          <Alert variant="destructive" className="mb-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              TikTok video ads require a thumbnail image. Upload one to enable ad creation.
            </AlertDescription>
          </Alert>
        )}

        <div
          className={cn(
            'relative aspect-video rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors',
            isLoading && 'opacity-50 pointer-events-none',
            !hasThumbnail ? 'border-destructive/50 bg-destructive/5' : 'border-muted-foreground/30 hover:border-primary'
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Uploading...</span>
            </div>
          ) : previewUrl || thumbnailPreviewUrl ? (
            <img
              src={previewUrl || thumbnailPreviewUrl || ''}
              alt="Thumbnail preview"
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Upload className="h-8 w-8" />
              <span className="text-sm">Drop image or click to upload</span>
              <span className="text-xs">JPG, PNG (max 10MB)</span>
            </div>
          )}
        </div>

        {hasThumbnail && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-destructive hover:text-destructive"
            onClick={() => removeMutation.mutate()}
            disabled={isLoading}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove Thumbnail
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Dialog component for thumbnail management
function ThumbnailDialog({
  open,
  onOpenChange,
  inputRef,
  previewUrl,
  videoPreviewUrl,
  hasThumbnail,
  isLoading,
  onFileSelect,
  onDrop,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  previewUrl: string | null;
  videoPreviewUrl?: string | null;
  hasThumbnail: boolean;
  isLoading: boolean;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onRemove: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Video Thumbnail</DialogTitle>
          <DialogDescription>
            TikTok video ads require a thumbnail image. Upload a custom image to use as the video cover.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video preview for reference */}
          {videoPreviewUrl && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Video Preview</label>
              <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                <video
                  src={videoPreviewUrl}
                  className="w-full h-full object-cover"
                  controls
                  muted
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: Pause the video on a good frame and take a screenshot to use as thumbnail
              </p>
            </div>
          )}

          {/* Upload area */}
          <div
            className={cn(
              'aspect-video rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors',
              isLoading && 'opacity-50 pointer-events-none',
              'border-muted-foreground/30 hover:border-primary hover:bg-primary/5'
            )}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileSelect}
            />

            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Uploading to TikTok...</span>
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt="Thumbnail"
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-10 w-10" />
                <span className="font-medium">Drop image or click to upload</span>
                <span className="text-xs">JPG, PNG • Max 10MB • 16:9 recommended</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          {hasThumbnail && (
            <Button
              variant="outline"
              onClick={onRemove}
              disabled={isLoading}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {hasThumbnail ? 'Done' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
