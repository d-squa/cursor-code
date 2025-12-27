// Spreadsheet Upload Component for creative metadata import
import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileSpreadsheet, 
  Upload, 
  Download,
  Loader2,
  Info,
  Grid3X3,
  FileUp,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import type { Creative, Platform, CreativeType, SpreadsheetCreativeRow } from '@/types/creative';
import { VALID_OPTIMIZATION_GOALS, VALID_FUNNEL_STAGES } from '@/utils/creativeValidation';
import { SpreadsheetEditor } from './SpreadsheetEditor';

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

// Validate a single row for the editor
const validateRow = (row: SpreadsheetCreativeRow): string[] => {
  const errors: string[] = [];
  
  if (!row.name?.trim()) errors.push('Name is required');
  
  const platform = validatePlatform(row.platform);
  if (!platform) errors.push(`Invalid platform: ${row.platform}`);
  
  if (!row.market?.trim() || !/^[A-Z]{2}$/i.test(row.market)) {
    errors.push(`Invalid market code: ${row.market}`);
  }
  
  if (row.phase && !VALID_FUNNEL_STAGES.map(s => s.toLowerCase()).includes(row.phase.toLowerCase())) {
    errors.push(`Invalid phase: ${row.phase}`);
  }
  
  if (platform && row.optimizationGoal && !VALID_OPTIMIZATION_GOALS[platform]?.includes(row.optimizationGoal.toUpperCase())) {
    errors.push(`Invalid optimization goal for ${platform}: ${row.optimizationGoal}`);
  }
  
  const creativeType = validateCreativeType(row.creativeType);
  if (!creativeType) errors.push(`Invalid creative type: ${row.creativeType}`);
  
  if (row.creativeType === 'dark_post' && !row.mediaUrl) {
    errors.push('Dark post requires a media URL');
  }
  if (row.creativeType === 'existing_post' && !row.externalPostId) {
    errors.push('Existing post requires a post ID');
  }
  
  return errors;
};

export function SpreadsheetUpload({ onUploadComplete, isUploading = false }: SpreadsheetUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<SpreadsheetCreativeRow[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeMode, setActiveMode] = useState<'import' | 'editor'>('import');

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

        // Get values
        const name = String(row[mapping.name] || '').trim();
        const platformRaw = String(row[mapping.platform] || '').trim();
        const market = String(row[mapping.market] || '').trim().toUpperCase();
        const phase = String(row[mapping.phase] || '').trim();
        const optimizationGoal = String(row[mapping.optimization_goal] || '').trim().toUpperCase();
        const creativeTypeRaw = String(row[mapping.creative_type] || '').trim();

        const platform = validatePlatform(platformRaw);
        const creativeType = validateCreativeType(creativeTypeRaw);

        // Get optional fields
        const mediaUrl = mapping.media_url !== undefined ? String(row[mapping.media_url] || '') : undefined;
        const externalPostId = mapping.external_post_id !== undefined ? String(row[mapping.external_post_id] || '') : undefined;
        const primaryText = mapping.primary_text !== undefined ? String(row[mapping.primary_text] || '') : undefined;
        const headline = mapping.headline !== undefined ? String(row[mapping.headline] || '') : undefined;
        const description = mapping.description !== undefined ? String(row[mapping.description] || '') : undefined;
        const caption = mapping.caption !== undefined ? String(row[mapping.caption] || '') : undefined;
        const callToAction = mapping.call_to_action !== undefined ? String(row[mapping.call_to_action] || '') : undefined;
        const destinationUrl = mapping.destination_url !== undefined ? String(row[mapping.destination_url] || '') : undefined;

        const parsedRow: SpreadsheetCreativeRow = {
          rowNumber: i,
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
          isValid: false,
          validationErrors: [],
        };

        // Validate
        const errors = validateRow(parsedRow);
        parsedRow.isValid = errors.length === 0;
        parsedRow.validationErrors = errors;

        rows.push(parsedRow);
      }

      setParsedRows(rows);
      setActiveMode('editor');
      toast.success(`Loaded ${rows.length} rows into editor`);
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

  // Handle editor changes
  const handleEditorChange = useCallback((newRows: SpreadsheetCreativeRow[]) => {
    setParsedRows(newRows);
  }, []);

  // Start fresh with empty editor
  const handleStartFresh = useCallback(() => {
    const emptyRow: SpreadsheetCreativeRow = {
      rowNumber: 1,
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
    setParsedRows([emptyRow]);
    setActiveMode('editor');
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
      setActiveMode('import');
      toast.success(`Created ${creatives.length} creatives`);
    } catch (error) {
      toast.error('Upload failed: ' + (error as Error).message);
    }
  }, [parsedRows, onUploadComplete]);

  // Stats
  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.filter(r => !r.isValid).length;

  return (
    <Card className="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Spreadsheet Editor
            </CardTitle>
            <CardDescription>
              Import from Excel/CSV or create directly in the grid editor
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Template
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden">
        {activeMode === 'import' ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-6">
            {/* Import Options */}
            <div className="grid grid-cols-2 gap-4 w-full max-w-md">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button 
                variant="outline"
                className="h-32 flex-col gap-2"
                onClick={() => inputRef.current?.click()}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <FileUp className="h-8 w-8" />
                )}
                <span className="text-sm font-medium">
                  {isProcessing ? 'Processing...' : 'Import File'}
                </span>
                <span className="text-xs text-muted-foreground">
                  Excel or CSV
                </span>
              </Button>
              <Button 
                variant="outline"
                className="h-32 flex-col gap-2"
                onClick={handleStartFresh}
              >
                <Grid3X3 className="h-8 w-8" />
                <span className="text-sm font-medium">Start Fresh</span>
                <span className="text-xs text-muted-foreground">
                  Empty grid
                </span>
              </Button>
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg text-sm max-w-md">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Required columns for import:</p>
                <p className="text-muted-foreground">
                  {REQUIRED_COLUMNS.map(c => c.replace(/_/g, ' ')).join(', ')}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            {/* Editor */}
            <div className="flex-1 overflow-hidden">
              <SpreadsheetEditor 
                rows={parsedRows} 
                onChange={handleEditorChange} 
              />
            </div>

            {/* Actions */}
            {uploadProgress > 0 && uploadProgress < 100 && (
              <Progress value={uploadProgress} className="h-2" />
            )}
            
            <div className="flex justify-between items-center">
              <Button variant="outline" onClick={() => {
                setParsedRows([]);
                setActiveMode('import');
              }}>
                Clear All
              </Button>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs">
                  {parsedRows.length} total rows
                </Badge>
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
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
