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
  
  // Map common variations - aligned with ZNM content calendar format
  const columnMap: Record<string, string> = {
    // Core identifiers
    'post_number': 'post_number',
    'post_no': 'post_number',
    'number': 'post_number',
    'post_type': 'post_type',
    'post_name': 'name',
    'creative_name': 'name',
    
    // Platform and market
    'market': 'markets',
    'country': 'markets',
    'countries': 'markets',
    
    // Funnel/objective
    'phase': 'objective',
    'funnel_stage': 'objective',
    'funnel_phase': 'objective',
    'optimization': 'optimization_goal',
    'optimization_goal': 'optimization_goal',
    
    // Organic vs Paid
    'organic_vs_dark': 'organic_vs_dark',
    'organic_dark': 'organic_vs_dark',
    'organic': 'organic_vs_dark',
    'dark': 'organic_vs_dark',
    
    // Language
    'lang': 'language',
    'languages': 'language',
    
    // Format and type
    'type': 'format',
    'creative_type': 'format',
    'ad_format': 'format',
    
    // Duration and dimensions
    'duration': 'actual_length',
    'length': 'actual_length',
    'actual_length_details': 'actual_length',
    'size': 'dimensions',
    'dimension': 'dimensions',
    'aspect_ratio': 'dimensions',
    
    // Character limits
    'caption_character_limit': 'caption_char_limit',
    'headline_character_limit': 'headline_char_limit',
    'description_character_limit': 'description_char_limit',
    'cta_character_limit': 'cta_char_limit',
    
    // Dates and deadlines
    'delivery_deadline': 'material_delivery_deadline',
    'deadline': 'material_delivery_deadline',
    'tbwa_asset_delivery_dates': 'material_delivery_deadline',
    'start_date': 'flight_start_date',
    'end_date': 'flight_end_date',
    'flight_start': 'flight_start_date',
    'flight_start_date': 'flight_start_date',
    'flight_end': 'flight_end_date',
    'flight_end_date': 'flight_end_date',
    
    // Links
    'specs': 'specs_link',
    'spec_doc': 'specs_link',
    'link_for_spec_doc': 'specs_link',
    'assets': 'assets_link',
    'links_to_assets': 'assets_link',
    
    // Existing post links (platform-specific variations from ZNM calendar)
    'facebook_existing_post_link_or_dark_asset': 'existing_post_link',
    'facebookexisting_post_link_or_dark_asset': 'existing_post_link',
    'instagram_existing_post_link_or_dark_asset': 'existing_post_link',
    'instagramexisting_post_link_or_dark_asset': 'existing_post_link',
    'x_existing_post_link_or_dark_asset': 'existing_post_link',
    'existing_post_link_or_dark_asset': 'existing_post_link',
    'existing_post_link': 'existing_post_link',
    'post_link': 'existing_post_link',
    'asset_link': 'existing_post_link',
    
    // Caption for dark posts
    'caption_if_dark_post': 'caption',
    'dark_post_caption': 'caption',
    
    // Call to action
    'call_to_action': 'call_to_action',
    'cta': 'call_to_action',
    
    // Landing page
    'landing_page': 'destination_url',
    'landing_page_url': 'destination_url',
    'destination': 'destination_url',
    
    // Notes and comments
    'note': 'notes',
    'notes_by_spark': 'notes',
    'comments': 'notes',
    
    // Brand and campaign info
    'brand': 'brand_name',
    'brand_name': 'brand_name',
    'campaign': 'campaign_name',
    'campaign_name': 'campaign_name',
    'product': 'product_category',
    'product_category': 'product_category',
    'category': 'product_category',
    
    // Additional fields
    'placement': 'placement',
    'media_type': 'media_type',
    'ad_type': 'ad_type',
    'priority': 'priority',
    'approval': 'approval_status',
    'approval_status': 'approval_status',
    'assigned': 'assigned_to',
    'assigned_to': 'assigned_to',
    'owner': 'assigned_to',
    
    // Arabic text fields
    'primary_text_ar': 'primary_text_ar',
    'headline_ar': 'headline_ar',
    'description_ar': 'description_ar',
    'caption_ar': 'caption_ar',
    
    // Content organization
    'content_pillar': 'content_pillar',
    'pillar': 'content_pillar',
    'campaign_theme': 'campaign_theme',
    'theme': 'campaign_theme',
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
          // ZNM content calendar fields
          postNumber: getValue('post_number'),
          postType: getValue('post_type'),
          organicVsDark: getValue('organic_vs_dark'),
          existingPostLink: getValue('existing_post_link'),
          optimizationGoal: getValue('optimization_goal'),
          // Additional fields
          brandName: getValue('brand_name'),
          campaignName: getValue('campaign_name'),
          productCategory: getValue('product_category'),
          placement: getValue('placement'),
          mediaType: getValue('media_type'),
          adType: getValue('ad_type'),
          priority: getValue('priority'),
          approvalStatus: getValue('approval_status'),
          assignedTo: getValue('assigned_to'),
          flightStartDate: getValue('flight_start_date'),
          flightEndDate: getValue('flight_end_date'),
          primaryText: getValue('primary_text'),
          primaryTextAr: getValue('primary_text_ar'),
          headline: getValue('headline'),
          headlineAr: getValue('headline_ar'),
          description: getValue('description'),
          descriptionAr: getValue('description_ar'),
          caption: getValue('caption'),
          captionAr: getValue('caption_ar'),
          callToAction: getValue('cta') || getValue('call_to_action'),
          destinationUrl: getValue('destination_url') || getValue('landing_page'),
          contentPillar: getValue('content_pillar'),
          campaignTheme: getValue('campaign_theme'),
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
      [
        'Name', 'Brand', 'Campaign', 'Platform', 'Markets', 'Objective', 'Language', 'Format', 
        'Placement', 'Media Type', 'Actual Length (Details)', 'Dimensions', 'Priority', 'Assigned To',
        'Flight Start Date', 'Flight End Date', 'Material Delivery Deadline', 'Launch Date', 
        'Primary Text', 'Primary Text (AR)', 'Headline', 'Headline (AR)', 'Description', 'Description (AR)',
        'Caption', 'Caption (AR)', 'CTA', 'Destination URL', 'Content Pillar', 'Campaign Theme',
        'Specs Link', 'Assets Link', 'Approval Status', 'Status', 'Notes'
      ],
      [
        'Summer Campaign Video 1', 'BrandX', 'Summer 2025', 'Meta', 'UAE, KSA, Qatar', 'Awareness', 'EN/AR', 'Video - Feed',
        'Feed', 'Video', '6, 15, 30 sec', '1080x1080px', 'High', 'John Doe',
        '2025-01-15', '2025-02-15', 'Dec-18', 'Jan-15',
        'Discover our new collection', 'اكتشف مجموعتنا الجديدة', 'New Arrivals', 'وصل حديثاً', 'Shop now', 'تسوق الآن',
        'Limited time offer', 'عرض لفترة محدودة', 'Shop Now', 'https://example.com',
        'Product Launch', 'Summer Vibes',
        'https://www.facebook.com/business/ads-guide', '', 'Pending Review', 'Draft', 'Additional assets needed'
      ],
      [
        'TikTok Awareness Video', 'BrandX', 'Summer 2025', 'TikTok', 'UAE, KSA', 'Awareness', 'EN/AR', 'Video - TikTok',
        'TikTok For You', 'Video', '6, 15 sec', '1080x1920px', 'Medium', 'Jane Smith',
        '2025-01-20', '2025-02-20', 'Nov-6', 'Jan-20',
        'Check this out!', 'شاهد هذا!', 'Trending Now', 'رائج الآن', '', '',
        '', '', 'Learn More', 'https://example.com',
        'Brand Awareness', 'Trendy',
        'https://ads.tiktok.com/help', '', 'Client Approved', 'Ready', ''
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 25 }, { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 18 },
      { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 10 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 12 },
      { wch: 30 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 25 },
      { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 15 },
      { wch: 35 }, { wch: 35 }, { wch: 15 }, { wch: 12 }, { wch: 30 },
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
          primaryTextAr: row.primaryTextAr,
          headline: row.headline,
          headlineAr: row.headlineAr,
          description: row.description,
          descriptionAr: row.descriptionAr,
          caption: row.caption,
          captionAr: row.captionAr,
          callToAction: row.callToAction as any,
          destinationUrl: row.destinationUrl || row.specsLink,
          spreadsheetRowNumber: row.rowNumber,
          status: 'draft',
          validationErrors: [],
          // New direct fields
          brandName: row.brandName,
          campaignName: row.campaignName,
          productCategory: row.productCategory,
          placement: row.placement,
          mediaType: row.mediaType,
          adType: row.adType,
          priority: row.priority,
          approvalStatus: row.approvalStatus,
          assignedTo: row.assignedTo,
          flightStartDate: row.flightStartDate,
          flightEndDate: row.flightEndDate,
          language: row.language,
          contentPillar: row.contentPillar,
          campaignTheme: row.campaignTheme,
          specsLink: row.specsLink,
          assetsLink: row.assetsLink,
          deliveryDeadline: row.materialDeliveryDeadline,
          // Store additional metadata
          platformMetadata: {
            markets: row.markets,
            format: row.format,
            actualLength: row.actualLength,
            dimensions: row.dimensions,
            captionCharLimit: row.captionCharLimit,
            headlineCharLimit: row.headlineCharLimit,
            descriptionCharLimit: row.descriptionCharLimit,
            ctaCharLimit: row.ctaCharLimit,
            launchDate: row.launchDate,
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
