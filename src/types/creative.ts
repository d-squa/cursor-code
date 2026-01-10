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
  
  // Creative copy - Primary
  primaryText?: string;
  headline?: string;
  description?: string;
  caption?: string;
  callToAction?: CallToAction;
  destinationUrl?: string;
  
  // Creative copy - Additional variants (Meta supports up to 5)
  primaryText2?: string;
  primaryText3?: string;
  primaryText4?: string;
  primaryText5?: string;
  headline2?: string;
  headline3?: string;
  headline4?: string;
  headline5?: string;
  description2?: string;
  description3?: string;
  description4?: string;
  description5?: string;
  
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
  
  // DSP upload tracking
  platformVideoId?: string;      // Video ID after upload to Meta/TikTok
  platformImageHash?: string;    // Meta image hash after upload
  platformThumbnailId?: string;  // TikTok thumbnail image ID
  dspUploadStatus?: 'pending' | 'uploading' | 'uploaded' | 'error';
  dspUploadError?: string;
  dspUploadedAt?: string;
  
  // TikTok-specific identity
  tiktokDisplayName?: string;    // Display name for custom identity
  tiktokIdentityId?: string;     // TikTok identity ID (Spark Ads)
  tiktokAdFormat?: string;       // SINGLE_VIDEO, SINGLE_IMAGE, CAROUSEL, etc.
  
  // Meta-specific placement images
  storyImageUrl?: string;        // Image for Stories/Reels placements
  rightColumnImageUrl?: string;  // Image for Right Column placement
  
  // URL & tracking
  urlParameters?: string;        // UTM and other tracking parameters
  
  // Meta creative control flags
  disableCreativeEnhancements?: boolean;
  disableMultiAdvertiserAds?: boolean;
  
  // Ad scheduling (Meta supports ad-level)
  adStartTime?: string;
  adEndTime?: string;
  
  // Lead generation
  leadFormId?: string;
  
  // Carousel & Collection
  carouselCards?: CarouselCard[];
  instantExperienceId?: string;
  catalogId?: string;
  productSetId?: string;
  
  // App promotion / Deep linking
  appLink?: string;
  deeplinkUrl?: string;
  
  createdAt: string;
  updatedAt: string;
}

// Carousel card for multi-asset ads
export interface CarouselCard {
  imageUrl?: string;
  imageHash?: string;
  videoId?: string;
  link: string;
  headline?: string;
  description?: string;
  callToAction?: CallToAction;
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

// Spreadsheet row for import - aligned with content calendar template
export interface SpreadsheetCreativeRow {
  rowNumber: number;
  
  // Core fields from content calendar
  name: string;
  platform: string;
  markets: string;           // Multiple markets comma-separated (e.g., "UAE, KSA, Qatar")
  objective: string;         // Campaign objective (e.g., "Awareness", "Consideration", "Conversion")
  language: string;          // Language codes (e.g., "EN/AR", "EN", "AR")
  format: string;            // Creative format (e.g., "Video - Feed", "Image/Carousel", "Video - Stories")
  
  // ZNM content calendar fields
  postNumber?: string;       // Post number identifier
  postType?: string;         // Post type (e.g., "Brand Post", "ZNM Launch Post")
  organicVsDark?: string;    // Organic or Dark post
  existingPostLink?: string; // Link to existing post or dark asset
  optimizationGoal?: string; // Optimization goal (e.g., "Video Views", "Reach")
  
  // New fields from content calendar templates
  brandName?: string;        // Brand or product line
  campaignName?: string;     // Campaign name
  productCategory?: string;  // Product category (e.g., "Leathergoods", "Bags")
  placement?: string;        // Ad placement (Feed, Stories, Reels)
  mediaType?: string;        // Video/Image/GIF/Carousel
  adType?: string;           // Paid/Organic/Spark
  priority?: string;         // High/Medium/Low
  approvalStatus?: string;   // Client approved, Internal review, etc.
  assignedTo?: string;       // Team member assigned
  flightStartDate?: string;  // Campaign flight start
  flightEndDate?: string;    // Campaign flight end
  contentPillar?: string;    // Content pillar or theme
  campaignTheme?: string;    // Specific campaign theme
  
  // Arabic copy variations
  primaryTextAr?: string;
  headlineAr?: string;
  descriptionAr?: string;
  captionAr?: string;
  
  // Dimensions & specs
  dimensions: string;        // e.g., "1080x1080px", "Aspect Ratio: 9:16"
  actualLength: string;      // Duration (e.g., "6, 15, 30 sec")
  
  // Character limits (from content calendar specs)
  captionCharLimit?: string;
  headlineCharLimit?: string;
  descriptionCharLimit?: string;
  ctaCharLimit?: string;
  
  // Scheduling
  materialDeliveryDeadline?: string;
  launchDate?: string;
  deliveryDeadline?: string;
  
  // Links & references
  specsLink?: string;
  assetsLink?: string;
  
  // Status & notes
  status?: string;
  notes?: string;
  
  // Legacy fields for backward compatibility
  phase?: string;             // Alias for objective
  creativeType?: string;      // Derived from format
  market?: string;            // Single market (first from markets list)
  
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
    
    // Primary copy
    primaryText: row.primary_text as string | undefined,
    headline: row.headline as string | undefined,
    description: row.description as string | undefined,
    caption: row.caption as string | undefined,
    callToAction: row.call_to_action as CallToAction | undefined,
    destinationUrl: row.destination_url as string | undefined,
    
    // Additional copy variants
    primaryText2: row.primary_text_2 as string | undefined,
    primaryText3: row.primary_text_3 as string | undefined,
    primaryText4: row.primary_text_4 as string | undefined,
    primaryText5: row.primary_text_5 as string | undefined,
    headline2: row.headline_2 as string | undefined,
    headline3: row.headline_3 as string | undefined,
    headline4: row.headline_4 as string | undefined,
    headline5: row.headline_5 as string | undefined,
    description2: row.description_2 as string | undefined,
    description3: row.description_3 as string | undefined,
    description4: row.description_4 as string | undefined,
    description5: row.description_5 as string | undefined,
    
    // External post references
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
    
    // DSP upload tracking
    platformVideoId: row.platform_video_id as string | undefined,
    platformImageHash: row.platform_image_hash as string | undefined,
    platformThumbnailId: row.platform_thumbnail_id as string | undefined,
    dspUploadStatus: row.dsp_upload_status as Creative['dspUploadStatus'] | undefined,
    dspUploadError: row.dsp_upload_error as string | undefined,
    dspUploadedAt: row.dsp_uploaded_at as string | undefined,
    
    // TikTok-specific
    tiktokDisplayName: row.tiktok_display_name as string | undefined,
    tiktokIdentityId: row.tiktok_identity_id as string | undefined,
    tiktokAdFormat: row.tiktok_ad_format as string | undefined,
    
    // Meta placement images
    storyImageUrl: row.story_image_url as string | undefined,
    rightColumnImageUrl: row.right_column_image_url as string | undefined,
    
    // URL tracking
    urlParameters: row.url_parameters as string | undefined,
    
    // Meta control flags
    disableCreativeEnhancements: row.disable_creative_enhancements as boolean | undefined,
    disableMultiAdvertiserAds: row.disable_multi_advertiser_ads as boolean | undefined,
    
    // Ad scheduling
    adStartTime: row.ad_start_time as string | undefined,
    adEndTime: row.ad_end_time as string | undefined,
    
    // Lead gen & commerce
    leadFormId: row.lead_form_id as string | undefined,
    carouselCards: row.carousel_cards as CarouselCard[] | undefined,
    instantExperienceId: row.instant_experience_id as string | undefined,
    catalogId: row.catalog_id as string | undefined,
    productSetId: row.product_set_id as string | undefined,
    
    // App / deep linking
    appLink: row.app_link as string | undefined,
    deeplinkUrl: row.deeplink_url as string | undefined,
    
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
    
    // Primary copy
    primary_text: creative.primaryText,
    headline: creative.headline,
    description: creative.description,
    caption: creative.caption,
    call_to_action: creative.callToAction,
    destination_url: creative.destinationUrl,
    
    // Additional copy variants
    primary_text_2: creative.primaryText2,
    primary_text_3: creative.primaryText3,
    primary_text_4: creative.primaryText4,
    primary_text_5: creative.primaryText5,
    headline_2: creative.headline2,
    headline_3: creative.headline3,
    headline_4: creative.headline4,
    headline_5: creative.headline5,
    description_2: creative.description2,
    description_3: creative.description3,
    description_4: creative.description4,
    description_5: creative.description5,
    
    // External post references
    external_post_id: creative.externalPostId,
    external_page_id: creative.externalPageId,
    external_account_name: creative.externalAccountName,
    
    platform_metadata: creative.platformMetadata || {},
    validation_errors: creative.validationErrors || [],
    width: creative.width,
    height: creative.height,
    aspect_ratio: creative.aspectRatio,
    file_size_bytes: creative.fileSizeBytes,
    duration_seconds: typeof creative.durationSeconds === 'number' ? Math.round(creative.durationSeconds) : creative.durationSeconds,
    folder_path: creative.folderPath,
    original_filename: creative.originalFilename,
    spreadsheet_row_number: creative.spreadsheetRowNumber,
    import_batch_id: creative.importBatchId,
    
    // DSP upload tracking
    platform_video_id: creative.platformVideoId,
    platform_image_hash: creative.platformImageHash,
    platform_thumbnail_id: creative.platformThumbnailId,
    dsp_upload_status: creative.dspUploadStatus,
    dsp_upload_error: creative.dspUploadError,
    dsp_uploaded_at: creative.dspUploadedAt,
    
    // TikTok-specific
    tiktok_display_name: creative.tiktokDisplayName,
    tiktok_identity_id: creative.tiktokIdentityId,
    tiktok_ad_format: creative.tiktokAdFormat,
    
    // Meta placement images
    story_image_url: creative.storyImageUrl,
    right_column_image_url: creative.rightColumnImageUrl,
    
    // URL tracking
    url_parameters: creative.urlParameters,
    
    // Meta control flags
    disable_creative_enhancements: creative.disableCreativeEnhancements,
    disable_multi_advertiser_ads: creative.disableMultiAdvertiserAds,
    
    // Ad scheduling
    ad_start_time: creative.adStartTime,
    ad_end_time: creative.adEndTime,
    
    // Lead gen & commerce
    lead_form_id: creative.leadFormId,
    carousel_cards: creative.carouselCards || [],
    instant_experience_id: creative.instantExperienceId,
    catalog_id: creative.catalogId,
    product_set_id: creative.productSetId,
    
    // App / deep linking
    app_link: creative.appLink,
    deeplink_url: creative.deeplinkUrl,
  };
}
