// Creative Management Plugin Types
// Aligned with ActiPlan's campaign structure

export type CreativeType = 'dark_post' | 'existing_post' | 'image' | 'video' | 'carousel' | 'collection' | 'instant_experience';

export type CreativeStatus = 'draft' | 'ready' | 'needs_review' | 'error' | 'published';

export type Platform = 'meta' | 'tiktok' | 'google' | 'linkedin' | 'snapchat' | 'pinterest' | 'x';

export type CallToAction = 
  | 'SHOP_NOW' | 'LEARN_MORE' | 'SIGN_UP' | 'DOWNLOAD' | 'BOOK_NOW' 
  | 'CONTACT_US' | 'GET_QUOTE' | 'APPLY_NOW' | 'SUBSCRIBE' | 'ORDER_NOW'
  | 'GET_OFFER' | 'WATCH_MORE' | 'SEE_MENU' | 'GET_DIRECTIONS' | 'CALL_NOW'
  | 'SEND_MESSAGE' | 'WHATSAPP_MESSAGE' | 'INSTALL_APP' | 'USE_APP' | 'PLAY_GAME';

// ActiPlan-approved taxonomy structure for folder uploads
export interface CreativeTaxonomy {
  platform: Platform;
  market: string;        // Country code (e.g., 'US', 'UK', 'DE')
  phase: string;         // Funnel phase name (e.g., 'Awareness', 'Consideration', 'Conversion')
  optimizationGoal: string; // e.g., 'CONVERSIONS', 'LINK_CLICKS', 'REACH'
  creativeType: CreativeType;
}

// Main Creative interface
export interface Creative {
  id: string;
  userId: string;
  teamId?: string;
  campaignId?: string;
  
  // Basic info
  name: string;
  creativeType: CreativeType;
  status: CreativeStatus;
  
  // Platform targeting
  platform: Platform;
  
  // ActiPlan mapping (taxonomy-based)
  market?: string;
  phaseName?: string;
  optimizationGoal?: string;
  funnelStage?: string;
  
  // Media assets
  mediaUrls: string[];
  thumbnailUrl?: string;
  
  // Creative copy
  primaryText?: string;
  headline?: string;
  description?: string;
  caption?: string;
  callToAction?: CallToAction;
  destinationUrl?: string;
  
  // For existing posts (reference by ID)
  externalPostId?: string;
  externalPageId?: string;
  externalAccountName?: string;
  
  // Platform-specific metadata
  platformMetadata?: Record<string, unknown>;
  
  // Validation
  validationErrors: string[];
  isValid: boolean;
  
  // Dimensions & format info
  width?: number;
  height?: number;
  aspectRatio?: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  
  // Folder structure metadata
  folderPath?: string;
  originalFilename?: string;
  
  // Spreadsheet import metadata
  spreadsheetRowNumber?: number;
  importBatchId?: string;
  
  createdAt: string;
  updatedAt: string;
}

// Creative Assignment for mapping to campaign structure
export interface CreativeAssignment {
  id: string;
  creativeId: string;
  campaignId: string;
  
  // ActiPlan structure mapping
  platform: string;
  market: string;
  phaseName: string;
  
  // Assignment metadata
  assignedAt: string;
  assignedBy?: string;
  position: number;
  
  // Status
  status: 'pending' | 'pushed' | 'error';
  dspCreativeId?: string;
  errorMessage?: string;
}

// Import batch tracking
export interface CreativeImportBatch {
  id: string;
  userId: string;
  importType: 'folder' | 'spreadsheet' | 'manual';
  sourceFilename?: string;
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  status: 'processing' | 'completed' | 'failed';
  errorLog: Array<{ row?: number; file?: string; error: string }>;
  createdAt: string;
  completedAt?: string;
}

// Folder upload structure (parsed from folder hierarchy)
export interface ParsedFolderStructure {
  platform: Platform;
  market: string;
  phase: string;
  optimizationGoal: string;
  creativeType: CreativeType;
  files: File[];
  path: string;
  isValid: boolean;
  validationErrors: string[];
}

// Spreadsheet row for import
export interface SpreadsheetCreativeRow {
  rowNumber: number;
  
  // Required fields
  name: string;
  platform: string;
  market: string;
  phase: string;
  optimizationGoal: string;
  creativeType: string;
  
  // Media
  mediaUrl?: string;
  externalPostId?: string;
  
  // Copy
  primaryText?: string;
  headline?: string;
  description?: string;
  caption?: string;
  callToAction?: string;
  destinationUrl?: string;
  
  // Validation
  isValid: boolean;
  validationErrors: string[];
}

// Platform-specific specs for validation
export interface PlatformCreativeSpecs {
  platform: Platform;
  aspectRatios: {
    value: string;
    label: string;
    recommended: boolean;
  }[];
  imageDimensions: {
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
    recommended: { width: number; height: number }[];
  };
  videoDimensions: {
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
    maxDuration: number;
    minDuration: number;
    maxFileSize: number;
  };
  textLimits: {
    primaryText: { max: number; recommended: number };
    headline: { max: number; recommended: number };
    description: { max: number; recommended: number };
  };
  callToActions: CallToAction[];
}

// Creative validation result
export interface CreativeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

// Creative mapping result (auto-mapping to campaign structure)
export interface CreativeMappingResult {
  creative: Creative;
  suggestedCampaignId?: string;
  suggestedPlatform: Platform;
  suggestedMarket: string;
  suggestedPhase: string;
  confidence: 'high' | 'medium' | 'low';
  mappingReason: string;
  alternativeMappings?: {
    platform: Platform;
    market: string;
    phase: string;
    reason: string;
  }[];
}

// Bulk action types
export interface BulkCreativeAction {
  type: 'move' | 'duplicate' | 'delete' | 'update_status' | 'update_mapping';
  creativeIds: string[];
  targetPlatform?: Platform;
  targetMarket?: string;
  targetPhase?: string;
  newStatus?: CreativeStatus;
  metadata?: Record<string, unknown>;
}

// Creative filter options
export interface CreativeFilters {
  platforms?: Platform[];
  markets?: string[];
  phases?: string[];
  statuses?: CreativeStatus[];
  types?: CreativeType[];
  campaignId?: string;
  search?: string;
  dateRange?: {
    start: string;
    end: string;
  };
}

// Drag and drop data
export interface CreativeDragData {
  creativeId: string;
  sourceLocation: {
    platform?: Platform;
    market?: string;
    phase?: string;
  };
}

export interface CreativeDropTarget {
  platform: Platform;
  market: string;
  phase: string;
}

// Helper function to convert database row to Creative type
export function dbRowToCreative(row: Record<string, unknown>): Creative {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    teamId: row.team_id as string | undefined,
    campaignId: row.campaign_id as string | undefined,
    name: row.name as string,
    creativeType: row.creative_type as CreativeType,
    status: row.status as CreativeStatus,
    platform: row.platform as Platform,
    market: row.market as string | undefined,
    phaseName: row.phase_name as string | undefined,
    optimizationGoal: row.optimization_goal as string | undefined,
    funnelStage: row.funnel_stage as string | undefined,
    mediaUrls: (row.media_urls as string[]) || [],
    thumbnailUrl: row.thumbnail_url as string | undefined,
    primaryText: row.primary_text as string | undefined,
    headline: row.headline as string | undefined,
    description: row.description as string | undefined,
    caption: row.caption as string | undefined,
    callToAction: row.call_to_action as CallToAction | undefined,
    destinationUrl: row.destination_url as string | undefined,
    externalPostId: row.external_post_id as string | undefined,
    externalPageId: row.external_page_id as string | undefined,
    externalAccountName: row.external_account_name as string | undefined,
    platformMetadata: row.platform_metadata as Record<string, unknown> | undefined,
    validationErrors: (row.validation_errors as string[]) || [],
    isValid: row.is_valid as boolean,
    width: row.width as number | undefined,
    height: row.height as number | undefined,
    aspectRatio: row.aspect_ratio as string | undefined,
    fileSizeBytes: row.file_size_bytes as number | undefined,
    durationSeconds: row.duration_seconds as number | undefined,
    folderPath: row.folder_path as string | undefined,
    originalFilename: row.original_filename as string | undefined,
    spreadsheetRowNumber: row.spreadsheet_row_number as number | undefined,
    importBatchId: row.import_batch_id as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// Helper function to convert Creative to database insert format
export function creativeToDbInsert(creative: Partial<Creative> & { userId: string; name: string; platform: Platform }): Record<string, unknown> {
  return {
    user_id: creative.userId,
    team_id: creative.teamId,
    campaign_id: creative.campaignId,
    name: creative.name,
    creative_type: creative.creativeType || 'dark_post',
    status: creative.status || 'draft',
    platform: creative.platform,
    market: creative.market,
    phase_name: creative.phaseName,
    optimization_goal: creative.optimizationGoal,
    funnel_stage: creative.funnelStage,
    media_urls: creative.mediaUrls || [],
    thumbnail_url: creative.thumbnailUrl,
    primary_text: creative.primaryText,
    headline: creative.headline,
    description: creative.description,
    caption: creative.caption,
    call_to_action: creative.callToAction,
    destination_url: creative.destinationUrl,
    external_post_id: creative.externalPostId,
    external_page_id: creative.externalPageId,
    external_account_name: creative.externalAccountName,
    platform_metadata: creative.platformMetadata || {},
    validation_errors: creative.validationErrors || [],
    width: creative.width,
    height: creative.height,
    aspect_ratio: creative.aspectRatio,
    file_size_bytes: creative.fileSizeBytes,
    duration_seconds: creative.durationSeconds,
    folder_path: creative.folderPath,
    original_filename: creative.originalFilename,
    spreadsheet_row_number: creative.spreadsheetRowNumber,
    import_batch_id: creative.importBatchId,
  };
}
