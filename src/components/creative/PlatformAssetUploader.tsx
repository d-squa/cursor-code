// Platform Asset Uploader - Upload files to TikTok/Meta Creative Library, then sync
import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Upload,
  FolderUp,
  CheckCircle,
  XCircle,
  Loader2,
  FileVideo,
  FileImage,
  Trash2,
  Play,
  Image as ImageIcon,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FileToUpload {
  file: File;
  id: string;
  preview?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  platformAssetId?: string;
}

interface PlatformAssetUploaderProps {
  platform: 'tiktok' | 'meta';
  advertiserId: string;
  onUploadComplete?: (count: number) => void;
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB for videos

/**
 * ⚠️ IMPORTANT: TikTok Platform Limitation ⚠️
 * 
 * TikTok requires creatives to be uploaded via the Ads Manager UI for ad delivery.
 * API-uploaded creatives are stored in the Creative Library but are NOT delivery-eligible.
 * 
 * For TikTok:
 * - Users MUST upload creatives manually in TikTok Ads Manager
 * - Then use "Sync Library" to fetch those creatives into ActiPlan
 * - Only synced creatives (origin: UI_SYNC) can be used for ad creation
 * 
 * For Meta:
 * - API uploads work normally for ad delivery
 */

export function PlatformAssetUploader({
  platform,
  advertiserId,
  onUploadComplete,
}: PlatformAssetUploaderProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileToUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // TikTok requires UI uploads for ad delivery
  const isTikTokBlocked = platform === 'tiktok';

  // Handle file selection
  const handleFileSelect = useCallback((selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles);
    const newFiles: FileToUpload[] = [];

    for (const file of fileArray) {
      // Skip non-media files
      if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
        continue;
      }

      // Skip files that are too large
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} is too large (max 500MB)`);
        continue;
      }

      // Create preview for images
      let preview: string | undefined;
      if (file.type.startsWith('image/')) {
        preview = URL.createObjectURL(file);
      }

      newFiles.push({
        file,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        preview,
        status: 'pending',
      });
    }

    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  // Remove file from queue
  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // Upload single file to DSP
  const uploadFileToDsp = async (fileToUpload: FileToUpload): Promise<string> => {
    const { file } = fileToUpload;
    const fileType = file.type.startsWith('video/') ? 'video' : 'image';

    // Read file as base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Call upload edge function
    const functionName = platform === 'tiktok' ? 'upload-creative-to-tiktok' : 'upload-creative-to-meta';
    
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: {
        advertiserId,
        fileName: file.name,
        fileData: base64,
        fileType,
        mimeType: file.type,
        ...(platform === 'meta' ? { adAccountId: advertiserId } : {}),
      },
    });

    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || 'Upload failed');
    }

    // Return the platform asset ID
    return data.videoId || data.imageId || data.imageHash;
  };

  // Upload all files
  const handleUploadAll = async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending');
    if (pendingFiles.length === 0) {
      toast.error('No files to upload');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    let successCount = 0;

    for (let i = 0; i < pendingFiles.length; i++) {
      const fileToUpload = pendingFiles[i];

      // Update status to uploading
      setFiles((prev) =>
        prev.map((f) => (f.id === fileToUpload.id ? { ...f, status: 'uploading' as const } : f))
      );

      try {
        const platformAssetId = await uploadFileToDsp(fileToUpload);

        // Update status to success
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileToUpload.id
              ? { ...f, status: 'success' as const, platformAssetId }
              : f
          )
        );
        successCount++;
      } catch (error) {
        // Update status to error
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileToUpload.id
              ? { ...f, status: 'error' as const, error: (error as Error).message }
              : f
          )
        );
      }

      setUploadProgress(((i + 1) / pendingFiles.length) * 100);
    }

    setIsUploading(false);

    if (successCount > 0) {
      // Sync the creative library to cache the new assets
      try {
        await supabase.functions.invoke('sync-creative-library', {
          body: { platform, advertiserId },
        });
        queryClient.invalidateQueries({ queryKey: ['platform-assets', platform, advertiserId] });
        toast.success(`Uploaded ${successCount} files and synced library`);
        onUploadComplete?.(successCount);
      } catch (syncError) {
        toast.warning(`Uploaded ${successCount} files but sync failed. Please refresh.`);
      }
    } else {
      toast.error('All uploads failed');
    }
  };

  // Clear completed files
  const clearCompleted = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.preview && (f.status === 'success' || f.status === 'error')) {
          URL.revokeObjectURL(f.preview);
        }
      });
      return prev.filter((f) => f.status === 'pending' || f.status === 'uploading');
    });
  }, []);

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const successCount = files.filter((f) => f.status === 'success').length;
  const errorCount = files.filter((f) => f.status === 'error').length;

  const platformDisplayName = platform === 'tiktok' ? 'TikTok' : 'Meta';
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isTikTokBlocked 
            ? 'TikTok Creative Library' 
            : `Upload to ${platformDisplayName} Creative Library`
          }
        </CardTitle>
        <CardDescription>
          {isTikTokBlocked
            ? 'Upload creatives in TikTok Ads Manager, then sync them here'
            : `Upload videos and images directly to your ${platformDisplayName} Creative Library`
          }
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* TikTok Platform Limitation Warning */}
        {isTikTokBlocked && (
          <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-700">TikTok requires manual upload</AlertTitle>
            <AlertDescription className="text-amber-600/90">
              <p className="mb-2">
                TikTok only allows creatives uploaded through their Ads Manager to be used for ad delivery.
                API-uploaded creatives cannot be used for launching ads.
              </p>
              <p className="font-medium">Required workflow:</p>
              <ol className="list-decimal list-inside mt-1 space-y-1 text-sm">
                <li>Upload creatives in TikTok Ads Manager</li>
                <li>Click "Sync Library" below to import them</li>
                <li>Assign synced creatives to your campaigns</li>
              </ol>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3 border-amber-500/50 text-amber-700 hover:bg-amber-500/10"
                onClick={() => window.open('https://ads.tiktok.com/i18n/creatives', '_blank')}
              >
                <ExternalLink className="h-3 w-3 mr-2" />
                Open TikTok Ads Manager
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Sync Library Button for TikTok */}
        {isTikTokBlocked && (
          <Button 
            variant="secondary" 
            className="w-full"
            onClick={async () => {
              try {
                toast.info('Syncing TikTok Creative Library...');
                await supabase.functions.invoke('sync-creative-library', {
                  body: { platform: 'tiktok', advertiserId },
                });
                queryClient.invalidateQueries({ queryKey: ['platform-assets', 'tiktok', advertiserId] });
                toast.success('Creative Library synced successfully');
                onUploadComplete?.(0);
              } catch (error) {
                toast.error('Failed to sync library');
              }
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync TikTok Creative Library
          </Button>
        )}

        {/* Drop Zone - Only show for Meta */}
        {!isTikTokBlocked && (
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
              isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30',
              'hover:border-primary hover:bg-primary/5'
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="video/*,image/*"
              className="hidden"
              onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
            />
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">Drop files here or click to select</p>
            <p className="text-sm text-muted-foreground mt-1">
              Videos (MP4, MOV, AVI) and Images (JPG, PNG, GIF)
            </p>
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{files.length} files</Badge>
                {successCount > 0 && (
                  <Badge variant="secondary" className="bg-green-500/20 text-green-700">
                    {successCount} uploaded
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge variant="secondary" className="bg-destructive/20 text-destructive">
                    {errorCount} failed
                  </Badge>
                )}
              </div>
              {(successCount > 0 || errorCount > 0) && (
                <Button variant="ghost" size="sm" onClick={clearCompleted}>
                  Clear completed
                </Button>
              )}
            </div>

            <ScrollArea className="h-[200px]">
              <div className="space-y-2 pr-4">
                {files.map((fileItem) => (
                  <FileRow
                    key={fileItem.id}
                    fileItem={fileItem}
                    onRemove={() => removeFile(fileItem.id)}
                  />
                ))}
              </div>
            </ScrollArea>

            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            {/* Upload Button - Only show for Meta */}
            {!isTikTokBlocked && (
              <Button
                onClick={handleUploadAll}
                disabled={pendingCount === 0 || isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload {pendingCount} file{pendingCount !== 1 ? 's' : ''} to {platformDisplayName}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// File row component
function FileRow({
  fileItem,
  onRemove,
}: {
  fileItem: FileToUpload;
  onRemove: () => void;
}) {
  const isVideo = fileItem.file.type.startsWith('video/');
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg border',
        fileItem.status === 'success' && 'bg-green-500/5 border-green-500/30',
        fileItem.status === 'error' && 'bg-destructive/5 border-destructive/30',
        fileItem.status === 'uploading' && 'bg-primary/5 border-primary/30'
      )}
    >
      {/* Preview */}
      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
        {fileItem.preview ? (
          <img src={fileItem.preview} alt="" className="w-full h-full object-cover" />
        ) : isVideo ? (
          <FileVideo className="h-6 w-6 text-muted-foreground" />
        ) : (
          <FileImage className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileItem.file.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{isVideo ? 'Video' : 'Image'}</span>
          <span>•</span>
          <span>{formatSize(fileItem.file.size)}</span>
          {fileItem.error && (
            <>
              <span>•</span>
              <span className="text-destructive">{fileItem.error}</span>
            </>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="shrink-0">
        {fileItem.status === 'pending' && (
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
        {fileItem.status === 'uploading' && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        {fileItem.status === 'success' && <CheckCircle className="h-5 w-5 text-green-600" />}
        {fileItem.status === 'error' && <XCircle className="h-5 w-5 text-destructive" />}
      </div>
    </div>
  );
}
