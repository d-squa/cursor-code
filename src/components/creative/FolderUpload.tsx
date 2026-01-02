// Folder Upload Component - Uploads directly to DSP (Meta/TikTok)
import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  FolderUp, 
  Upload, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Folder,
  FileImage,
  FileVideo,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { validateFolderPath, inferCreativeTypeFromFile, calculateAspectRatio } from '@/utils/creativeValidation';
import type { Creative, Platform, CreativeType, ParsedFolderStructure } from '@/types/creative';
import { cn } from '@/lib/utils';

interface AdAccountInfo {
  platform: 'meta' | 'tiktok';
  accountId: string; // Meta: act_xxx or xxx, TikTok: advertiser_id
}

interface FolderUploadProps {
  onUploadComplete: (creatives: Partial<Creative>[]) => Promise<void>;
  adAccounts: AdAccountInfo[]; // Ad accounts from the selected ActiPlan
  isUploading?: boolean;
}

interface ParsedFile {
  file: File;
  path: string;
  parsed: Partial<ParsedFolderStructure>;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  preview?: string;
  dimensions?: { width: number; height: number };
  dspUploadResult?: {
    platform: 'meta' | 'tiktok';
    imageHash?: string;
    videoId?: string;
    imageId?: string;
  };
}

// Max file size: 100MB for DSP uploads
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export function FolderUpload({ onUploadComplete, adAccounts, isUploading = false }: FolderUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Get ad account for a platform
  const getAdAccountForPlatform = useCallback((platform: string): AdAccountInfo | undefined => {
    const normalizedPlatform = platform?.toLowerCase();
    if (normalizedPlatform === 'meta' || normalizedPlatform === 'facebook' || normalizedPlatform === 'instagram') {
      return adAccounts.find(a => a.platform === 'meta');
    }
    if (normalizedPlatform === 'tiktok') {
      return adAccounts.find(a => a.platform === 'tiktok');
    }
    // Default to first available
    return adAccounts[0];
  }, [adAccounts]);

  // Upload file to DSP (Meta or TikTok)
  const uploadToDsp = useCallback(async (
    file: File,
    platform: 'meta' | 'tiktok',
    adAccount: AdAccountInfo
  ): Promise<{ imageHash?: string; videoId?: string; imageId?: string }> => {
    // Read file as base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const fileType = file.type.startsWith('video/') ? 'video' : 'image';

    if (platform === 'meta') {
      const { data, error } = await supabase.functions.invoke('upload-creative-to-meta', {
        body: {
          adAccountId: adAccount.accountId,
          fileName: file.name,
          fileData: base64,
          fileType,
          mimeType: file.type,
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Failed to upload to Meta');
      }

      return {
        imageHash: data.imageHash,
        videoId: data.videoId,
      };
    } else {
      const { data, error } = await supabase.functions.invoke('upload-creative-to-tiktok', {
        body: {
          advertiserId: adAccount.accountId,
          fileName: file.name,
          fileData: base64,
          fileType,
          mimeType: file.type,
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Failed to upload to TikTok');
      }

      return {
        videoId: data.videoId,
        imageId: data.imageId,
      };
    }
  }, []);

  // Parse folder structure from file paths
  const parseFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const parsed: ParsedFile[] = [];

    for (const file of fileArray) {
      // Get relative path from webkitRelativePath or name
      const path = (file as any).webkitRelativePath || file.name;
      
      // Skip hidden files and system files
      if (file.name.startsWith('.') || file.name === 'Thumbs.db' || file.name === '.DS_Store') {
        continue;
      }

      // Only process media files
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        continue;
      }

      // Parse folder path to extract taxonomy
      const folderPath = path.split('/').slice(0, -1).join('/');
      const { isValid: pathValid, parsed: taxonomy, errors: pathErrors, warnings } = validateFolderPath(folderPath);

      // Check file size
      const isTooLarge = file.size > MAX_FILE_SIZE;
      const sizeErrors = isTooLarge 
        ? [`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max allowed: 100MB`] 
        : [];
      
      // Check if we have an ad account for the platform
      const platform = taxonomy.platform?.toLowerCase() as 'meta' | 'tiktok' | undefined;
      const adAccount = platform ? getAdAccountForPlatform(platform) : adAccounts[0];
      const noAdAccountError = !adAccount ? ['No ad account configured for this platform'] : [];
      
      const errors = [...pathErrors, ...sizeErrors, ...noAdAccountError];
      const isValid = !isTooLarge && !!adAccount;

      // Generate preview for images
      let preview: string | undefined;
      let dimensions: { width: number; height: number } | undefined;

      if (file.type.startsWith('image/')) {
        preview = URL.createObjectURL(file);
        // Get image dimensions
        dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.width, height: img.height });
          img.onerror = () => resolve({ width: 0, height: 0 });
          img.src = preview!;
        });
      }

      parsed.push({
        file,
        path,
        parsed: {
          platform: taxonomy.platform,
          market: taxonomy.market,
          phase: taxonomy.phase,
          optimizationGoal: taxonomy.optimizationGoal,
          creativeType: taxonomy.creativeType || inferCreativeTypeFromFile(file),
          isValid,
          validationErrors: errors,
        },
        isValid,
        errors,
        warnings,
        preview,
        dimensions,
      });
    }

    setParsedFiles(parsed);
    return parsed;
  }, [adAccounts, getAdAccountForPlatform]);

  // Handle folder selection
  const handleFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setIsProcessing(true);
    try {
      await parseFiles(files);
      toast.success(`Parsed ${files.length} files from folder`);
    } catch (error) {
      toast.error('Failed to parse folder structure');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  }, [parseFiles]);

  // Handle drag and drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const items = e.dataTransfer.items;
    const files: File[] = [];

    // Process dropped items recursively
    const processEntry = async (entry: FileSystemEntry, path = ''): Promise<void> => {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        return new Promise((resolve) => {
          fileEntry.file((file) => {
            // Attach path to file
            Object.defineProperty(file, 'webkitRelativePath', {
              value: path + file.name,
              writable: false,
            });
            files.push(file);
            resolve();
          });
        });
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const reader = dirEntry.createReader();
        
        return new Promise((resolve) => {
          reader.readEntries(async (entries) => {
            for (const childEntry of entries) {
              await processEntry(childEntry, path + entry.name + '/');
            }
            resolve();
          });
        });
      }
    };

    setIsProcessing(true);
    try {
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry();
        if (entry) {
          await processEntry(entry);
        }
      }
      
      if (files.length > 0) {
        await parseFiles(files);
        toast.success(`Parsed ${files.length} files from dropped folder`);
      }
    } catch (error) {
      toast.error('Failed to process dropped files');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  }, [parseFiles]);

  // Upload all valid files to DSP and create creative records
  const handleUpload = useCallback(async () => {
    const validFiles = parsedFiles.filter(f => f.isValid);
    if (validFiles.length === 0) {
      toast.error('No valid files to upload');
      return;
    }

    if (adAccounts.length === 0) {
      toast.error('No ad accounts configured. Please select an ActiPlan with connected ad accounts.');
      return;
    }

    setUploadProgress(0);
    const creatives: Partial<Creative>[] = [];
    const failedUploads: string[] = [];
    
    try {
      for (let i = 0; i < validFiles.length; i++) {
        const parsedFile = validFiles[i];
        const { file, parsed, dimensions } = parsedFile;
        
        // Determine platform and get ad account
        const platform = (parsed.platform?.toLowerCase() || 'meta') as 'meta' | 'tiktok';
        const adAccount = getAdAccountForPlatform(platform);
        
        if (!adAccount) {
          failedUploads.push(`${file.name}: No ad account for ${platform}`);
          continue;
        }

        try {
          // Upload to DSP
          const dspResult = await uploadToDsp(file, adAccount.platform, adAccount);
          
          // Create creative object with DSP IDs
          const creative: Partial<Creative> = {
            name: file.name.replace(/\.[^/.]+$/, ''),
            platform: (platform === 'meta' ? 'meta' : 'tiktok') as Platform,
            market: parsed.market,
            phaseName: parsed.phase,
            optimizationGoal: parsed.optimizationGoal,
            creativeType: (parsed.creativeType as CreativeType) || inferCreativeTypeFromFile(file),
            // Store DSP IDs instead of local storage URLs
            platformImageHash: dspResult.imageHash,
            platformVideoId: dspResult.videoId,
            // For TikTok images, store in platformMetadata
            platformMetadata: dspResult.imageId ? { tiktokImageId: dspResult.imageId } : undefined,
            folderPath: parsedFile.path,
            originalFilename: file.name,
            width: dimensions?.width,
            height: dimensions?.height,
            aspectRatio: dimensions ? calculateAspectRatio(dimensions.width, dimensions.height) : undefined,
            fileSizeBytes: file.size,
            status: 'draft',
            dspUploadStatus: 'uploaded',
            dspUploadedAt: new Date().toISOString(),
            validationErrors: [],
          };

          creatives.push(creative);
        } catch (uploadError) {
          console.error(`Failed to upload ${file.name}:`, uploadError);
          failedUploads.push(`${file.name}: ${(uploadError as Error).message}`);
        }
        
        setUploadProgress(((i + 1) / validFiles.length) * 100);
      }

      if (creatives.length > 0) {
        await onUploadComplete(creatives);
        setParsedFiles([]);
        
        if (failedUploads.length > 0) {
          toast.warning(`Uploaded ${creatives.length} creatives. ${failedUploads.length} failed.`);
        } else {
          toast.success(`Uploaded ${creatives.length} creatives to DSP`);
        }
      } else {
        toast.error('All uploads failed. Check console for details.');
      }
    } catch (error) {
      toast.error('Upload failed: ' + (error as Error).message);
    }
  }, [parsedFiles, adAccounts, getAdAccountForPlatform, uploadToDsp, onUploadComplete]);

  // Stats - count files with and without metadata
  const validCount = parsedFiles.filter(f => f.isValid).length;
  const invalidCount = parsedFiles.filter(f => !f.isValid).length;
  const withMetadataCount = parsedFiles.filter(f => f.isValid && (f.parsed.platform || f.parsed.market)).length;
  const withoutMetadataCount = parsedFiles.filter(f => f.isValid && !f.parsed.platform && !f.parsed.market).length;

  // Group by folder path
  const groupedFiles = parsedFiles.reduce((acc, file) => {
    const folder = file.path.split('/').slice(0, -1).join('/') || 'Root';
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(file);
    return acc;
  }, {} as Record<string, ParsedFile[]>);

  const hasNoAdAccounts = adAccounts.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderUp className="h-5 w-5" />
          Folder Upload
        </CardTitle>
        <CardDescription>
          Upload a folder with ActiPlan taxonomy structure. Files are uploaded directly to the ad platform.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ad Account Warning */}
        {hasNoAdAccounts && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              No ad accounts configured. Select an ActiPlan with connected Meta or TikTok ad accounts.
            </p>
          </div>
        )}

        {/* Connected Platforms */}
        {adAccounts.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Uploading to:</span>
            {adAccounts.map((acc, i) => (
              <Badge key={i} variant="outline">
                {acc.platform === 'meta' ? 'Meta' : 'TikTok'}: {acc.accountId}
              </Badge>
            ))}
          </div>
        )}

        {/* Drop Zone */}
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
            isDragOver && 'border-primary bg-primary/5',
            !isDragOver && 'border-muted-foreground/25 hover:border-muted-foreground/50',
            hasNoAdAccounts && 'opacity-50 pointer-events-none'
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            // @ts-ignore - webkitdirectory is a non-standard attribute
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleFolderSelect}
            className="hidden"
            disabled={hasNoAdAccounts}
          />
          
          {isProcessing ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Processing folder...</p>
            </div>
          ) : (
            <>
              <FolderUp className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                Drop a folder here or click to browse
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Folder structure: Meta/US/Awareness/REACH/image/
              </p>
              <Button onClick={() => inputRef.current?.click()} disabled={hasNoAdAccounts}>
                <Upload className="h-4 w-4 mr-2" />
                Select Folder
              </Button>
            </>
          )}
        </div>

        {/* Parsed Files Preview */}
        {parsedFiles.length > 0 && (
          <>
            {/* Stats */}
            <div className="flex items-center gap-4">
              <Badge variant="secondary" className="gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                {validCount} files ready
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  {invalidCount} invalid
                </Badge>
              )}
              {withMetadataCount > 0 && (
                <Badge variant="outline" className="gap-1">
                  {withMetadataCount} with metadata
                </Badge>
              )}
              {withoutMetadataCount > 0 && (
                <Badge variant="outline" className="gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  {withoutMetadataCount} without metadata
                </Badge>
              )}
            </div>

            {/* File List */}
            <ScrollArea className="h-[300px] border rounded-lg">
              <Accordion type="multiple" className="w-full">
                {Object.entries(groupedFiles).map(([folder, files]) => (
                  <AccordionItem key={folder} value={folder}>
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4" />
                        <span className="text-sm">{folder}</span>
                        <Badge variant="outline" className="ml-2">
                          {files.length} files
                        </Badge>
                        {files.some(f => f.warnings.length > 0) && (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4">
                      <div className="space-y-2">
                        {files.map((f, i) => {
                          const hasMetadata = f.parsed.platform || f.parsed.market;
                          return (
                          <div
                            key={i}
                            className={cn(
                              'flex items-center gap-3 p-2 rounded-md',
                              f.isValid ? 'bg-muted/50' : 'bg-destructive/10'
                            )}
                          >
                            {f.preview ? (
                              <img
                                src={f.preview}
                                alt={f.file.name}
                                className="w-10 h-10 object-cover rounded"
                              />
                            ) : f.file.type.startsWith('video/') ? (
                              <FileVideo className="w-10 h-10 p-2 bg-muted rounded" />
                            ) : (
                              <FileImage className="w-10 h-10 p-2 bg-muted rounded" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{f.file.name}</p>
                              <div className="flex gap-1 flex-wrap">
                                {f.parsed.platform && (
                                  <Badge variant="outline" className="text-xs">{f.parsed.platform}</Badge>
                                )}
                                {f.parsed.market && (
                                  <Badge variant="outline" className="text-xs">{f.parsed.market}</Badge>
                                )}
                                {f.parsed.phase && (
                                  <Badge variant="outline" className="text-xs">{f.parsed.phase}</Badge>
                                )}
                                {!hasMetadata && (
                                  <Badge variant="outline" className="text-xs text-amber-600">No metadata</Badge>
                                )}
                              </div>
                              {f.errors.length > 0 && (
                                <p className="text-xs text-destructive mt-1">
                                  {f.errors[0]}
                                </p>
                              )}
                              {f.warnings.length > 0 && !f.errors.length && (
                                <p className="text-xs text-amber-600 mt-1">
                                  {f.warnings[0]}
                                </p>
                              )}
                            </div>
                            {f.isValid ? (
                              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive shrink-0" />
                            )}
                          </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </ScrollArea>

            {/* Upload Button */}
            {uploadProgress > 0 && uploadProgress < 100 && (
              <Progress value={uploadProgress} className="h-2" />
            )}
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setParsedFiles([])}>
                Clear
              </Button>
              <Button 
                onClick={handleUpload} 
                disabled={validCount === 0 || isUploading || hasNoAdAccounts}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading to DSP...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {validCount} to DSP
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
