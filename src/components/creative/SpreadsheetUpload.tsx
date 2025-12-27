// Spreadsheet Upload Component for creative metadata import
import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  FileSpreadsheet, 
  Upload, 
  Download,
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Loader2,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import type { Creative, Platform, CreativeType, SpreadsheetCreativeRow } from '@/types/creative';
import { VALID_OPTIMIZATION_GOALS, VALID_FUNNEL_STAGES } from '@/utils/creativeValidation';
import { cn } from '@/lib/utils';

interface SpreadsheetUploadProps {
  onUploadComplete: (creatives: Partial<Creative>[]) => Promise<void>;
  isUploading?: boolean;
}

const REQUIRED_COLUMNS = ['name', 'platform', 'market', 'phase', 'optimization_goal', 'creative_type'];
const OPTIONAL_COLUMNS = [
  'media_url', 'external_post_id', 'external_page_id', 
  'primary_text', 'headline', 'description', 'caption', 
  'call_to_action', 'destination_url'
];

// Normalize column names
const normalizeColumnName = (name: string): string => {
  return name.toLowerCase().trim().replace(/[\s-]+/g, '_');
};

// Validate platform
const validatePlatform = (value: string): Platform | null => {
  const map: Record<string, Platform> = {
    meta: 'meta', facebook: 'meta', fb: 'meta',
    tiktok: 'tiktok', tt: 'tiktok',
    google: 'google', 'google ads': 'google', gads: 'google',
    linkedin: 'linkedin', li: 'linkedin',
    snapchat: 'snapchat', snap: 'snapchat',
    pinterest: 'pinterest', pin: 'pinterest',
    x: 'x', twitter: 'x',
  };
  return map[value.toLowerCase().trim()] || null;
};

// Validate creative type
const validateCreativeType = (value: string): CreativeType | null => {
  const map: Record<string, CreativeType> = {
    dark_post: 'dark_post', darkpost: 'dark_post', dark: 'dark_post',
    existing_post: 'existing_post', existing: 'existing_post', post: 'existing_post',
    image: 'image', img: 'image', static: 'image',
    video: 'video', vid: 'video',
    carousel: 'carousel', car: 'carousel',
    collection: 'collection', col: 'collection',
    instant_experience: 'instant_experience', ix: 'instant_experience',
  };
  return map[value.toLowerCase().trim().replace(/[\s-]+/g, '_')] || null;
};

export function SpreadsheetUpload({ onUploadComplete, isUploading = false }: SpreadsheetUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<SpreadsheetCreativeRow[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Parse spreadsheet file
  const parseSpreadsheet = useCallback(async (file: File) => {
    setIsProcessing(true);
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

      if (jsonData.length < 2) {
        toast.error('Spreadsheet must have a header row and at least one data row');
        return;
      }

      // Parse header row
      const headers = jsonData[0].map(h => normalizeColumnName(String(h || '')));
      
      // Check for required columns
      const missingColumns = REQUIRED_COLUMNS.filter(col => !headers.includes(col));
      if (missingColumns.length > 0) {
        toast.error(`Missing required columns: ${missingColumns.join(', ')}`);
        return;
      }

      // Create column mapping
      const mapping: Record<string, number> = {};
      headers.forEach((header, index) => {
        mapping[header] = index;
      });

      // Parse data rows
      const rows: SpreadsheetCreativeRow[] = [];
      
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.every(cell => !cell)) continue; // Skip empty rows

        const errors: string[] = [];
        
        // Get values
        const name = String(row[mapping.name] || '').trim();
        const platformRaw = String(row[mapping.platform] || '').trim();
        const market = String(row[mapping.market] || '').trim().toUpperCase();
        const phase = String(row[mapping.phase] || '').trim();
        const optimizationGoal = String(row[mapping.optimization_goal] || '').trim().toUpperCase();
        const creativeTypeRaw = String(row[mapping.creative_type] || '').trim();

        // Validate required fields
        if (!name) errors.push('Name is required');
        
        const platform = validatePlatform(platformRaw);
        if (!platform) errors.push(`Invalid platform: ${platformRaw}`);
        
        if (!market || !/^[A-Z]{2}$/.test(market)) {
          errors.push(`Invalid market code: ${market}`);
        }
        
        if (phase && !VALID_FUNNEL_STAGES.map(s => s.toLowerCase()).includes(phase.toLowerCase())) {
          errors.push(`Invalid phase: ${phase}`);
        }
        
        if (platform && optimizationGoal && !VALID_OPTIMIZATION_GOALS[platform]?.includes(optimizationGoal)) {
          errors.push(`Invalid optimization goal for ${platform}: ${optimizationGoal}`);
        }
        
        const creativeType = validateCreativeType(creativeTypeRaw);
        if (!creativeType) errors.push(`Invalid creative type: ${creativeTypeRaw}`);

        // Get optional fields
        const mediaUrl = mapping.media_url !== undefined ? String(row[mapping.media_url] || '') : undefined;
        const externalPostId = mapping.external_post_id !== undefined ? String(row[mapping.external_post_id] || '') : undefined;
        const primaryText = mapping.primary_text !== undefined ? String(row[mapping.primary_text] || '') : undefined;
        const headline = mapping.headline !== undefined ? String(row[mapping.headline] || '') : undefined;
        const description = mapping.description !== undefined ? String(row[mapping.description] || '') : undefined;
        const caption = mapping.caption !== undefined ? String(row[mapping.caption] || '') : undefined;
        const callToAction = mapping.call_to_action !== undefined ? String(row[mapping.call_to_action] || '') : undefined;
        const destinationUrl = mapping.destination_url !== undefined ? String(row[mapping.destination_url] || '') : undefined;

        // Validate creative type specific requirements
        if (creativeType === 'dark_post' && !mediaUrl) {
          errors.push('Dark post requires a media URL');
        }
        if (creativeType === 'existing_post' && !externalPostId) {
          errors.push('Existing post requires a post ID');
        }

        rows.push({
          rowNumber: i + 1,
          name,
          platform: platform || platformRaw,
          market,
          phase,
          optimizationGoal,
          creativeType: creativeType || creativeTypeRaw,
          mediaUrl,
          externalPostId,
          primaryText,
          headline,
          description,
          caption,
          callToAction,
          destinationUrl,
          isValid: errors.length === 0,
          validationErrors: errors,
        });
      }

      setParsedRows(rows);
      toast.success(`Parsed ${rows.length} rows from spreadsheet`);
    } catch (error) {
      toast.error('Failed to parse spreadsheet: ' + (error as Error).message);
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseSpreadsheet(file);
    }
  }, [parseSpreadsheet]);

  // Download template
  const handleDownloadTemplate = useCallback(() => {
    const templateData = [
      [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].map(c => c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())),
      ['Summer Campaign Ad 1', 'Meta', 'US', 'Awareness', 'REACH', 'image', 'https://example.com/image.jpg', '', '', 'Check out our summer sale!', 'Summer Sale', 'Best deals of the season', '', 'SHOP_NOW', 'https://example.com/shop'],
      ['TikTok Video Ad', 'TikTok', 'UK', 'Consideration', 'VIDEO_VIEW', 'video', 'https://example.com/video.mp4', '', '', 'Watch now!', 'Amazing Deal', '', '', 'LEARN_MORE', 'https://example.com'],
      ['Existing Page Post', 'Meta', 'DE', 'Conversion', 'CONVERSIONS', 'existing_post', '', '123456789', '987654321', '', '', '', '', '', ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Creative Template');
    XLSX.writeFile(wb, 'creative_upload_template.xlsx');
    
    toast.success('Template downloaded');
  }, []);

  // Upload valid rows
  const handleUpload = useCallback(async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      toast.error('No valid rows to upload');
      return;
    }

    setUploadProgress(0);
    
    try {
      const creatives: Partial<Creative>[] = validRows.map((row, i) => {
        setUploadProgress(((i + 1) / validRows.length) * 100);
        
        return {
          name: row.name,
          platform: row.platform as Platform,
          market: row.market,
          phaseName: row.phase,
          optimizationGoal: row.optimizationGoal,
          creativeType: row.creativeType as CreativeType,
          mediaUrls: row.mediaUrl ? [row.mediaUrl] : [],
          thumbnailUrl: row.mediaUrl,
          externalPostId: row.externalPostId,
          primaryText: row.primaryText,
          headline: row.headline,
          description: row.description,
          caption: row.caption,
          callToAction: row.callToAction as any,
          destinationUrl: row.destinationUrl,
          spreadsheetRowNumber: row.rowNumber,
          status: 'draft',
          validationErrors: [],
        };
      });

      await onUploadComplete(creatives);
      setParsedRows([]);
      toast.success(`Created ${creatives.length} creatives from spreadsheet`);
    } catch (error) {
      toast.error('Upload failed: ' + (error as Error).message);
    }
  }, [parsedRows, onUploadComplete]);

  // Stats
  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.filter(r => !r.isValid).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Spreadsheet Upload
            </CardTitle>
            <CardDescription>
              Upload an Excel or CSV file with creative metadata
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Input */}
        <div className="flex items-center gap-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button 
            onClick={() => inputRef.current?.click()}
            disabled={isProcessing}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Select Spreadsheet
              </>
            )}
          </Button>
        </div>

        {/* Required Columns Info */}
        <div className="flex items-start gap-2 p-3 bg-muted rounded-lg text-sm">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Required columns:</p>
            <p className="text-muted-foreground">
              {REQUIRED_COLUMNS.map(c => c.replace(/_/g, ' ')).join(', ')}
            </p>
          </div>
        </div>

        {/* Parsed Rows Preview */}
        {parsedRows.length > 0 && (
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

            {/* Data Table */}
            <ScrollArea className="h-[300px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Row</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Market</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row) => (
                    <TableRow 
                      key={row.rowNumber}
                      className={cn(!row.isValid && 'bg-destructive/5')}
                    >
                      <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                      <TableCell>
                        {row.isValid ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium max-w-[150px] truncate">
                        {row.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.platform}</Badge>
                      </TableCell>
                      <TableCell>{row.market}</TableCell>
                      <TableCell>{row.phase}</TableCell>
                      <TableCell className="capitalize">
                        {row.creativeType.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell>
                        {row.validationErrors.length > 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {row.validationErrors.length}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-[300px]">
                                <ul className="text-xs space-y-1">
                                  {row.validationErrors.map((err, i) => (
                                    <li key={i}>• {err}</li>
                                  ))}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {/* Upload Button */}
            {uploadProgress > 0 && uploadProgress < 100 && (
              <Progress value={uploadProgress} className="h-2" />
            )}
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setParsedRows([])}>
                Clear
              </Button>
              <Button 
                onClick={handleUpload} 
                disabled={validCount === 0 || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Create {validCount} Creatives
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
