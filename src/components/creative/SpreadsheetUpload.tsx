// Spreadsheet Upload Component for creative metadata import - aligned with content calendar template
import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
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
import { SpreadsheetEditor } from './SpreadsheetEditor';

interface SpreadsheetUploadProps {
  onUploadComplete: (creatives: Partial<Creative>[]) => Promise<void>;
  isUploading?: boolean;
}

// Content calendar column mapping - matches the uploaded template format
const TEMPLATE_COLUMNS = [
  'name', 'platform', 'markets', 'objective', 'language', 'format',
  'actual_length', 'dimensions', 'caption_char_limit', 'headline_char_limit',
  'description_char_limit', 'cta_char_limit', 'material_delivery_deadline',
  'launch_date', 'specs_link', 'assets_link', 'notes', 'status'
];

const REQUIRED_COLUMNS = ['name', 'platform', 'markets', 'objective', 'format'];

// Normalize column names to match our schema
const normalizeColumnName = (name: string): string => {
  const normalized = name.toLowerCase().trim()
    .replace(/[\s-]+/g, '_')
    .replace(/\(.*?\)/g, '') // Remove parentheses content
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  // Map common variations
  const columnMap: Record<string, string> = {
    'market': 'markets',
    'country': 'markets',
    'countries': 'markets',
    'phase': 'objective',
    'funnel_stage': 'objective',
    'funnel_phase': 'objective',
    'lang': 'language',
    'languages': 'language',
    'type': 'format',
    'creative_type': 'format',
    'ad_format': 'format',
    'duration': 'actual_length',
    'length': 'actual_length',
    'actual_length_details': 'actual_length',
    'size': 'dimensions',
    'dimension': 'dimensions',
    'aspect_ratio': 'dimensions',
    'caption_character_limit': 'caption_char_limit',
    'headline_character_limit': 'headline_char_limit',
    'description_character_limit': 'description_char_limit',
    'cta_character_limit': 'cta_char_limit',
    'delivery_deadline': 'material_delivery_deadline',
    'deadline': 'material_delivery_deadline',
    'tbwa_asset_delivery_dates': 'material_delivery_deadline',
    'specs': 'specs_link',
    'spec_doc': 'specs_link',
    'link_for_spec_doc': 'specs_link',
    'assets': 'assets_link',
    'links_to_assets': 'assets_link',
    'asset_link': 'assets_link',
    'note': 'notes',
    'notes_by_spark': 'notes',
    'creative_name': 'name',
  };
  
  return columnMap[normalized] || normalized;
};

// Validate platform
const validatePlatform = (value: string): Platform | null => {
  const map: Record<string, Platform> = {
    meta: 'meta', facebook: 'meta', fb: 'meta', instagram: 'meta', ig: 'meta',
    tiktok: 'tiktok', tt: 'tiktok',
    google: 'google', 'google ads': 'google', gads: 'google', dv360: 'google', programmatic: 'google',
    linkedin: 'linkedin', li: 'linkedin',
    snapchat: 'snapchat', snap: 'snapchat',
    pinterest: 'pinterest', pin: 'pinterest',
    x: 'x', twitter: 'x',
  };
  return map[value.toLowerCase().trim()] || null;
};

// Derive creative type from format string
const deriveCreativeType = (format: string): CreativeType => {
  const lower = format.toLowerCase();
  if (lower.includes('video') || lower.includes('reel') || lower.includes('vod')) return 'video';
  if (lower.includes('carousel') || lower.includes('car')) return 'carousel';
  if (lower.includes('collection')) return 'collection';
  if (lower.includes('image') || lower.includes('static') || lower.includes('banner')) return 'image';
  if (lower.includes('story') || lower.includes('stories')) return 'video';
  if (lower.includes('existing') || lower.includes('post')) return 'existing_post';
  return 'dark_post';
};

// Validate a single row
const validateRow = (row: SpreadsheetCreativeRow): string[] => {
  const errors: string[] = [];
  
  if (!row.name?.trim()) errors.push('Name is required');
  
  const platform = validatePlatform(row.platform);
  if (!platform && row.platform) errors.push(`Invalid platform: ${row.platform}`);
  
  if (!row.markets?.trim()) errors.push('Markets is required');
  
  if (!row.objective?.trim()) errors.push('Objective is required');
  
  if (!row.format?.trim()) errors.push('Format is required');
  
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
      
      // Try to find the most relevant sheet (prefer sheets with "Platform" header)
      let sheetName = workbook.SheetNames[0];
      for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
        if (jsonData.length > 0) {
          const firstRow = jsonData[0]?.map(h => String(h || '').toLowerCase()) || [];
          if (firstRow.some(h => h.includes('platform') || h.includes('format'))) {
            sheetName = name;
            break;
          }
        }
      }
      
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

      if (jsonData.length < 2) {
        toast.error('Spreadsheet must have a header row and at least one data row');
        return;
      }

      // Find header row (might not be first row)
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(5, jsonData.length); i++) {
        const row = jsonData[i]?.map(h => String(h || '').toLowerCase()) || [];
        if (row.some(h => h.includes('platform') || h.includes('market') || h.includes('format'))) {
          headerRowIndex = i;
          break;
        }
      }

      // Parse header row
      const headers = jsonData[headerRowIndex].map(h => normalizeColumnName(String(h || '')));
      
      // Create column mapping
      const mapping: Record<string, number> = {};
      headers.forEach((header, index) => {
        if (header) mapping[header] = index;
      });

      // Parse data rows
      const rows: SpreadsheetCreativeRow[] = [];
      
      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.every(cell => !cell)) continue; // Skip empty rows

        const getValue = (key: string): string => {
          return mapping[key] !== undefined ? String(row[mapping[key]] || '').trim() : '';
        };

        // Build row from template columns
        const name = getValue('name') || `Creative ${i}`;
        const platform = getValue('platform');
        const markets = getValue('markets');
        const objective = getValue('objective');
        const language = getValue('language') || 'EN';
        const format = getValue('format');
        const actualLength = getValue('actual_length');
        const dimensions = getValue('dimensions');
        
        // Skip rows without essential data
        if (!platform && !markets && !format) continue;

        const parsedRow: SpreadsheetCreativeRow = {
          rowNumber: i,
          name,
          platform: platform || 'meta',
          markets: markets || '',
          objective: objective || 'Awareness',
          language,
          format: format || 'Video',
          actualLength,
          dimensions,
          captionCharLimit: getValue('caption_char_limit'),
          headlineCharLimit: getValue('headline_char_limit'),
          descriptionCharLimit: getValue('description_char_limit'),
          ctaCharLimit: getValue('cta_char_limit'),
          materialDeliveryDeadline: getValue('material_delivery_deadline'),
          launchDate: getValue('launch_date'),
          specsLink: getValue('specs_link'),
          assetsLink: getValue('assets_link'),
          status: getValue('status'),
          notes: getValue('notes'),
          // Derived fields for backward compatibility
          phase: objective || 'Awareness',
          creativeType: deriveCreativeType(format),
          market: markets.split(',')[0]?.trim().toUpperCase() || '',
          isValid: false,
          validationErrors: [],
        };

        // Validate
        const errors = validateRow(parsedRow);
        parsedRow.isValid = errors.length === 0;
        parsedRow.validationErrors = errors;

        rows.push(parsedRow);
      }

      if (rows.length === 0) {
        toast.error('No valid data rows found. Make sure your spreadsheet has a header row with Platform, Markets, and Format columns.');
        return;
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

  // Download template matching the content calendar format
  const handleDownloadTemplate = useCallback(() => {
    const templateData = [
      ['Name', 'Platform', 'Markets', 'Objective', 'Language', 'Format', 'Actual Length (Details)', 'Dimensions', 'Caption Char Limit', 'Headline Char Limit', 'Description Char Limit', 'CTA Char Limit', 'Material Delivery Deadline', 'Launch Date', 'Specs Link', 'Assets Link', 'Notes', 'Status'],
      ['Summer Campaign Video 1', 'Meta', 'UAE, KSA, Qatar, Bahrain, Oman', 'Awareness', 'EN/AR', 'Video - Feed', '6, 15, 30 sec', 'Aspect Ratio: 1:1\n1080x1080px', '125 CL', '27 CL', '27 CL', '-', 'Dec-18', 'Nov-15', 'https://www.facebook.com/business/ads-guide/update', '', 'Additional assets needed', 'Pending'],
      ['TikTok Awareness Video', 'TikTok', 'UAE, KSA', 'Awareness', 'EN/AR', 'Video - TikTok', '6, 15, 30 sec', 'Aspect Ratio: 9:16\n1080x1920px', '100 CL', '55 CL', '-', '-', 'Nov-6', 'Nov-15', 'https://ads.tiktok.com/help/category', '', '', 'Ready'],
      ['Snapchat Story Ad', 'Snapchat', 'UAE', 'Awareness', 'EN/AR', 'Video - Snap Ads', '6 sec', 'Aspect Ratio: 9:16\n1080x1920px', '-', '34 CL', '-', '-', 'Nov-29', 'Nov-28', '', '', 'First Commercial slot', 'Pending'],
      ['Instagram Carousel', 'Meta', 'UAE, KSA, Qatar', 'Consideration', 'EN/AR', 'Image/Carousel', '-', 'Aspect Ratio: 1:1\n1080x1080px', '125 CL', '27 CL', '27 CL', '-', 'Dec-4', 'Dec-5', '', '', '', 'Draft'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 25 }, // Name
      { wch: 12 }, // Platform
      { wch: 30 }, // Markets
      { wch: 15 }, // Objective
      { wch: 10 }, // Language
      { wch: 18 }, // Format
      { wch: 18 }, // Actual Length
      { wch: 25 }, // Dimensions
      { wch: 12 }, // Caption Char Limit
      { wch: 12 }, // Headline Char Limit
      { wch: 12 }, // Description Char Limit
      { wch: 10 }, // CTA Char Limit
      { wch: 20 }, // Material Delivery Deadline
      { wch: 12 }, // Launch Date
      { wch: 40 }, // Specs Link
      { wch: 30 }, // Assets Link
      { wch: 30 }, // Notes
      { wch: 12 }, // Status
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Content Calendar');
    XLSX.writeFile(wb, 'content_calendar_template.xlsx');
    
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
      platform: 'Meta',
      markets: '',
      objective: 'Awareness',
      language: 'EN',
      format: 'Video - Feed',
      actualLength: '',
      dimensions: '',
      phase: 'Awareness',
      creativeType: 'video',
      market: '',
      isValid: false,
      validationErrors: ['Name is required', 'Markets is required'],
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
        
        const platform = validatePlatform(row.platform) || 'meta';
        const creativeType = deriveCreativeType(row.format);
        
        return {
          name: row.name,
          platform,
          market: row.markets.split(',')[0]?.trim().toUpperCase(),
          phaseName: row.objective,
          optimizationGoal: row.objective?.toUpperCase() === 'AWARENESS' ? 'REACH' : 
                           row.objective?.toUpperCase() === 'CONSIDERATION' ? 'LINK_CLICKS' : 'CONVERSIONS',
          creativeType,
          mediaUrls: row.assetsLink ? [row.assetsLink] : [],
          primaryText: row.primaryText,
          headline: row.headline,
          description: row.description,
          caption: row.caption,
          callToAction: row.callToAction as any,
          destinationUrl: row.destinationUrl || row.specsLink,
          spreadsheetRowNumber: row.rowNumber,
          status: 'draft',
          validationErrors: [],
          // Store additional metadata
          platformMetadata: {
            language: row.language,
            markets: row.markets,
            format: row.format,
            actualLength: row.actualLength,
            dimensions: row.dimensions,
            captionCharLimit: row.captionCharLimit,
            headlineCharLimit: row.headlineCharLimit,
            descriptionCharLimit: row.descriptionCharLimit,
            ctaCharLimit: row.ctaCharLimit,
            materialDeliveryDeadline: row.materialDeliveryDeadline,
            launchDate: row.launchDate,
            specsLink: row.specsLink,
            assetsLink: row.assetsLink,
            notes: row.notes,
            importedStatus: row.status,
          },
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

  return (
    <Card className="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Content Calendar Import
            </CardTitle>
            <CardDescription>
              Import from content calendar template or create directly in the grid editor
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
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg text-sm max-w-lg">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Content Calendar Format:</p>
                <p className="text-muted-foreground">
                  Platform, Markets, Objective, Language, Format, Dimensions, Launch Date, Specs Link, Assets Link, Status
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
