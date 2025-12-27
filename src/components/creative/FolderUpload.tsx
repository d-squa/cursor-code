// Folder Upload Component with hierarchical taxonomy parsing
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
import { validateFolderPath, inferCreativeTypeFromFile, calculateAspectRatio } from '@/utils/creativeValidation';
import type { Creative, Platform, CreativeType, ParsedFolderStructure } from '@/types/creative';
import { cn } from '@/lib/utils';

interface FolderUploadProps {
  onUploadComplete: (creatives: Partial<Creative>[]) => Promise<void>;
  onUploadFile: (file: File) => Promise<string>;
  isUploading?: boolean;
}

interface ParsedFile {
  file: File;
  path: string;
  parsed: Partial<ParsedFolderStructure>;
  isValid: boolean;
  errors: string[];
  preview?: string;
  dimensions?: { width: number; height: number };
}

export function FolderUpload({ onUploadComplete, onUploadFile, isUploading = false }: FolderUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

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
      const { isValid, parsed: taxonomy, errors } = validateFolderPath(folderPath);

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
        preview,
        dimensions,
      });
    }

    setParsedFiles(parsed);
    return parsed;
  }, []);

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

  // Upload all valid files
  const handleUpload = useCallback(async () => {
    const validFiles = parsedFiles.filter(f => f.isValid);
    if (validFiles.length === 0) {
      toast.error('No valid files to upload');
      return;
    }

    setUploadProgress(0);
    const creatives: Partial<Creative>[] = [];
    
    try {
      for (let i = 0; i < validFiles.length; i++) {
        const { file, parsed, dimensions } = validFiles[i];
        
        // Upload file to storage
        const mediaUrl = await onUploadFile(file);
        
        // Create creative object
        const creative: Partial<Creative> = {
          name: file.name.replace(/\.[^/.]+$/, ''),
          platform: parsed.platform as Platform,
          market: parsed.market,
          phaseName: parsed.phase,
          optimizationGoal: parsed.optimizationGoal,
          creativeType: (parsed.creativeType as CreativeType) || inferCreativeTypeFromFile(file),
          mediaUrls: [mediaUrl],
          thumbnailUrl: mediaUrl,
          folderPath: validFiles[i].path,
          originalFilename: file.name,
          width: dimensions?.width,
          height: dimensions?.height,
          aspectRatio: dimensions ? calculateAspectRatio(dimensions.width, dimensions.height) : undefined,
          fileSizeBytes: file.size,
          status: 'draft',
          validationErrors: [],
        };

        creatives.push(creative);
        setUploadProgress(((i + 1) / validFiles.length) * 100);
      }

      await onUploadComplete(creatives);
      setParsedFiles([]);
      toast.success(`Uploaded ${creatives.length} creatives`);
    } catch (error) {
      toast.error('Upload failed: ' + (error as Error).message);
    }
  }, [parsedFiles, onUploadFile, onUploadComplete]);

  // Stats
  const validCount = parsedFiles.filter(f => f.isValid).length;
  const invalidCount = parsedFiles.filter(f => !f.isValid).length;

  // Group by folder path
  const groupedFiles = parsedFiles.reduce((acc, file) => {
    const folder = file.path.split('/').slice(0, -1).join('/') || 'Root';
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(file);
    return acc;
  }, {} as Record<string, ParsedFile[]>);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderUp className="h-5 w-5" />
          Folder Upload
        </CardTitle>
        <CardDescription>
          Upload a folder with ActiPlan taxonomy structure: Platform/Market/Phase/Goal/Type/
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
            isDragOver && 'border-primary bg-primary/5',
            !isDragOver && 'border-muted-foreground/25 hover:border-muted-foreground/50'
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
              <Button onClick={() => inputRef.current?.click()}>
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
                {validCount} valid
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  {invalidCount} invalid
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
                        {files.some(f => !f.isValid) && (
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4">
                      <div className="space-y-2">
                        {files.map((f, i) => (
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
                              </div>
                              {f.errors.length > 0 && (
                                <p className="text-xs text-destructive mt-1">
                                  {f.errors[0]}
                                </p>
                              )}
                            </div>
                            {f.isValid ? (
                              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive shrink-0" />
                            )}
                          </div>
                        ))}
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
                disabled={validCount === 0 || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {validCount} Creatives
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
