// Creative-to-Plan Matching Engine Types
// This system is NOT a campaign builder - it's a creative-to-plan matching engine
// that respects user-defined ActiPlan strategy

// =============================================================================
// PLATFORMS & SUPPORTED FORMATS
// =============================================================================

export type SupportedPlatform = 
  | 'meta' 
  | 'tiktok' 
  | 'snapchat' 
  | 'linkedin' 
  | 'x' 
  | 'pinterest' 
  | 'google';

export type AssetMediaType = 'image' | 'video' | 'gif' | 'html5' | 'audio';

export type CompositeFormat = 
  | 'single' 
  | 'carousel' 
  | 'collection' 
  | 'instant_experience' 
  | 'catalog' 
  | 'responsive' 
  | 'lead_form' 
  | 'app_install';

export type PostType = 'organic' | 'promoted' | 'dark_post' | 'spark_ad';

// =============================================================================
// HARD CONSTRAINTS (NON-NEGOTIABLE)
// =============================================================================

// These must be 100% respected - no inference, no confidence override
export interface HardConstraints {
  market?: string;       // Country code (e.g., 'US', 'UK', 'DE')
  language?: string;     // Language code (e.g., 'en', 'es', 'de')
  variant?: string;      // Variant identifier (e.g., 'A', 'B', 'control')
}

// Extended constraints that can be inferred from filename/path
export interface InferrableConstraints extends HardConstraints {
  // Device targeting
  device?: 'mobile' | 'desktop' | 'tablet' | 'ctv' | 'all';
  
  // Demographic targeting
  gender?: 'male' | 'female' | 'all';
  ageMin?: number;
  ageMax?: number;
  
  // Audience targeting
  audienceType?: 'broad' | 'lookalike' | 'retargeting' | 'custom' | 'interest' | 'demographic' | 'value_based';
  
  // Optimization goal
  optimizationGoal?: string;
  
  // Content attributes
  placement?: string;
  format?: string;
  aspectRatio?: string;
  contentPillar?: string;
}

// =============================================================================
// ASSET TECHNICAL ATTRIBUTES (DIGESTION LAYER)
// =============================================================================

export interface AssetDimensions {
  width: number;
  height: number;
  aspectRatio: string;           // e.g., '16:9', '1:1', '9:16'
  aspectRatioNumeric: number;    // width/height decimal
}

export interface AssetTechnicalAttributes {
  // File info
  fileType: string;              // MIME type
  fileSizeBytes: number;
  originalFilename: string;
  
  // Media dimensions
  dimensions?: AssetDimensions;
  
  // Video-specific
  durationSeconds?: number;
  frameRate?: number;
  hasAudio?: boolean;
  
  // Extracted content
  ocrText?: string;
  detectedLanguage?: string;
  languageConfidence?: number;
  
  // Hash for deduplication
  contentHash?: string;
}

// =============================================================================
// COMPATIBILITY SIGNALS
// =============================================================================

export interface CompatibilitySignal {
  signal: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AssetCompatibility {
  // Platform compatibility
  supportedPlatforms: SupportedPlatform[];
  unsupportedPlatforms: Array<{ platform: SupportedPlatform; reason: string }>;
  
  // Placement compatibility
  compatiblePlacements: string[];
  incompatiblePlacements: Array<{ placement: string; reason: string }>;
  
  // Signals
  signals: CompatibilitySignal[];
  
  // Risk flags
  croppingRisk: 'none' | 'low' | 'medium' | 'high';
  durationViolations: string[];
  textDensityRisk: 'none' | 'low' | 'medium' | 'high';
  policyRiskFlags: string[];
}

// =============================================================================
// INGESTED CREATIVE (Pre-Matching)
// =============================================================================

export interface IngestedCreative {
  id: string;
  
  // Source info
  sourceType: 'folder' | 'file' | 'url' | 'post' | 'spreadsheet';
  sourcePath?: string;
  sourceUrl?: string;
  
  // For platform posts
  externalPostId?: string;
  externalPlatform?: SupportedPlatform;
  postType?: PostType;
  postUsability?: {
    canUseAsExistingPostAd: boolean;
    canUseAsSparkAd: boolean;
    needsDuplication: boolean;
    limitations: string[];
  };
  
  // Technical attributes (from digestion)
  technicalAttributes: AssetTechnicalAttributes;
  compatibility: AssetCompatibility;
  
  // Hard constraints (from asset or user)
  hardConstraints: HardConstraints;
  
  // Media assets
  mediaType: AssetMediaType;
  compositeFormat: CompositeFormat;
  mediaUrls: string[];
  thumbnailUrl?: string;
  
  // Copy elements
  copy?: {
    primaryText?: string;
    headline?: string;
    description?: string;
    caption?: string;
    callToAction?: string;
    destinationUrl?: string;
    displayUrl?: string;
    utmParameters?: Record<string, string>;
    legalDisclaimer?: string;
  };
  
  // Carousel/Collection specific
  cards?: Array<{
    index: number;
    mediaUrl: string;
    headline?: string;
    description?: string;
    destinationUrl?: string;
    productName?: string;
    productPrice?: string;
  }>;
  
  // Validation status
  validationResult: CreativeValidationResult;
  
  // Timestamps
  ingestedAt: string;
  lastModified?: string;
}

export interface CreativeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  characterLimitViolations?: Array<{
    field: string;
    limit: number;
    actual: number;
    platform: SupportedPlatform;
  }>;
  missingRequiredFields?: string[];
  duplicateContentFlag?: boolean;
}

// =============================================================================
// ACTIPLAN STRUCTURE (Authoritative Input)
// =============================================================================

// Represents a target slot in an existing ActiPlan structure
export interface ActiPlanTarget {
  campaignId: string;
  campaignName: string;
  
  // Identifiers
  platform: SupportedPlatform;
  adAccountId?: string;
  
  // Campaign-level
  objective: string;
  
  // Ad Set level
  adSetId?: string;
  adSetName?: string;
  phaseName: string;
  
  // Hard constraints (must match exactly)
  market: string;
  language?: string;
  variant?: string;
  
  // Soft constraints (compatibility check)
  placementConstraints?: string[];
  formatConstraints?: CompositeFormat[];
  aspectRatioConstraints?: string[];
  durationConstraints?: { min?: number; max?: number };
  
  // Additional metadata
  optimizationGoal?: string;
  funnelStage?: string;
  
  // Ad set split dimensions (for precise matching)
  deviceConstraints?: string[];        // ['mobile', 'desktop', 'tablet']
  genderConstraint?: string;           // 'male', 'female', 'all'
  ageConstraints?: { min: number; max: number };
  audienceTypeConstraint?: string;     // 'broad', 'lookalike', 'retargeting', 'custom'
  
  // Budget info (for display purposes)
  budgetAmount?: number;
  budgetType?: 'daily' | 'lifetime';
}

// =============================================================================
// MATCHING RESULT
// =============================================================================

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none';

export interface MatchReason {
  factor: string;
  contribution: 'positive' | 'negative' | 'neutral';
  weight: number;
  explanation: string;
}

export interface CreativeMatch {
  creative: IngestedCreative;
  target: ActiPlanTarget;
  
  // Overall match assessment
  confidence: MatchConfidence;
  confidenceScore: number;  // 0-100
  
  // Detailed reasoning
  reasons: MatchReason[];
  
  // Hard constraint check results
  hardConstraintsPassed: boolean;
  hardConstraintFailures?: Array<{
    constraint: keyof HardConstraints;
    expected: string;
    actual: string;
  }>;
  
  // Soft compatibility results
  softCompatibilityScore: number;  // 0-100
  compatibilityIssues: Array<{
    type: 'platform' | 'placement' | 'format' | 'aspect_ratio' | 'duration' | 'objective';
    severity: 'warning' | 'error';
    message: string;
    canOverride: boolean;
  }>;
}

export interface MatchingResult {
  creative: IngestedCreative;
  
  // All valid matches (passed hard constraints)
  validMatches: CreativeMatch[];
  
  // Best recommended match
  recommendedMatch?: CreativeMatch;
  
  // Alternative matches
  alternativeMatches: CreativeMatch[];
  
  // If no valid matches
  noMatchReasons?: string[];
  suggestedActions?: Array<{
    action: 'create_structure' | 'modify_asset' | 'alternative_placement';
    description: string;
  }>;
}

// =============================================================================
// MAPPING STATE (User Decisions)
// =============================================================================

export type MappingStatus = 
  | 'pending'      // Awaiting user review
  | 'accepted'     // User accepted the match
  | 'rejected'     // User rejected the match
  | 'reassigned'   // User manually assigned to different target
  | 'unassigned';  // No valid match, waiting for action

export interface CreativeMapping {
  id: string;
  creativeId: string;
  
  // Current status
  status: MappingStatus;
  
  // The match (if any)
  match?: CreativeMatch;
  
  // If manually assigned
  manuallyAssignedTarget?: ActiPlanTarget;
  manualAssignmentReason?: string;
  
  // Multi-structure assignment
  additionalTargets?: ActiPlanTarget[];
  
  // User actions
  acceptedBy?: string;
  acceptedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// MATCHING SESSION
// =============================================================================

export interface MatchingSession {
  id: string;
  campaignId: string;        // The ActiPlan being matched against
  campaignName: string;
  
  // Available targets from the ActiPlan
  targets: ActiPlanTarget[];
  
  // Ingested creatives
  creatives: IngestedCreative[];
  
  // Matching results
  results: MatchingResult[];
  
  // Current mappings (user decisions)
  mappings: CreativeMapping[];
  
  // Summary stats
  stats: {
    totalCreatives: number;
    matched: number;
    unmatched: number;
    accepted: number;
    rejected: number;
    pending: number;
    highConfidence: number;
    lowConfidence: number;
  };
  
  // Session metadata
  createdBy: string;
  createdAt: string;
  lastActivityAt: string;
  status: 'active' | 'completed' | 'cancelled';
}

// =============================================================================
// COPY VALIDATION SPECS PER PLATFORM
// =============================================================================

export interface CopyLimits {
  primaryText: { max: number; recommended?: number };
  headline: { max: number; recommended?: number };
  description: { max: number; recommended?: number };
  callToAction: string[];
}

export const PLATFORM_COPY_LIMITS: Record<SupportedPlatform, CopyLimits> = {
  meta: {
    primaryText: { max: 2200, recommended: 125 },
    headline: { max: 255, recommended: 40 },
    description: { max: 255, recommended: 30 },
    callToAction: [
      'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW',
      'CONTACT_US', 'GET_QUOTE', 'APPLY_NOW', 'SUBSCRIBE', 'ORDER_NOW',
      'GET_OFFER', 'WATCH_MORE', 'SEE_MENU', 'GET_DIRECTIONS', 'CALL_NOW',
      'SEND_MESSAGE', 'WHATSAPP_MESSAGE', 'INSTALL_APP', 'USE_APP', 'PLAY_GAME',
    ],
  },
  tiktok: {
    primaryText: { max: 100, recommended: 80 },
    headline: { max: 100, recommended: 50 },
    description: { max: 100, recommended: 50 },
    callToAction: [
      'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW',
      'CONTACT_US', 'APPLY_NOW', 'SUBSCRIBE', 'ORDER_NOW', 'INSTALL_APP',
    ],
  },
  snapchat: {
    primaryText: { max: 150, recommended: 100 },
    headline: { max: 34, recommended: 25 },
    description: { max: 150, recommended: 80 },
    callToAction: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'INSTALL_APP'],
  },
  linkedin: {
    primaryText: { max: 700, recommended: 150 },
    headline: { max: 200, recommended: 70 },
    description: { max: 300, recommended: 100 },
    callToAction: ['LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'APPLY_NOW', 'SUBSCRIBE', 'CONTACT_US'],
  },
  x: {
    primaryText: { max: 280, recommended: 100 },
    headline: { max: 70, recommended: 50 },
    description: { max: 200, recommended: 70 },
    callToAction: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'INSTALL_APP'],
  },
  pinterest: {
    primaryText: { max: 500, recommended: 100 },
    headline: { max: 100, recommended: 40 },
    description: { max: 500, recommended: 100 },
    callToAction: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD'],
  },
  google: {
    primaryText: { max: 90, recommended: 80 },
    headline: { max: 30, recommended: 25 },
    description: { max: 90, recommended: 60 },
    callToAction: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW', 'CONTACT_US', 'GET_QUOTE', 'APPLY_NOW', 'SUBSCRIBE'],
  },
};

// =============================================================================
// PLATFORM ASPECT RATIO REQUIREMENTS
// =============================================================================

export interface AspectRatioSpec {
  ratio: string;
  numericValue: number;
  tolerance: number;  // Allowed variance percentage
  placements: string[];
  recommended: boolean;
}

export const PLATFORM_ASPECT_RATIOS: Record<SupportedPlatform, AspectRatioSpec[]> = {
  meta: [
    { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['feed', 'marketplace', 'search'], recommended: true },
    { ratio: '4:5', numericValue: 0.8, tolerance: 0.03, placements: ['feed', 'reels'], recommended: true },
    { ratio: '9:16', numericValue: 0.5625, tolerance: 0.03, placements: ['stories', 'reels'], recommended: true },
    { ratio: '16:9', numericValue: 1.7778, tolerance: 0.03, placements: ['in_stream', 'feed'], recommended: false },
    { ratio: '1.91:1', numericValue: 1.91, tolerance: 0.03, placements: ['right_column', 'instant_article'], recommended: false },
  ],
  tiktok: [
    { ratio: '9:16', numericValue: 0.5625, tolerance: 0.03, placements: ['feed', 'for_you'], recommended: true },
    { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['feed'], recommended: false },
    { ratio: '16:9', numericValue: 1.7778, tolerance: 0.03, placements: ['feed'], recommended: false },
  ],
  snapchat: [
    { ratio: '9:16', numericValue: 0.5625, tolerance: 0.03, placements: ['stories', 'spotlight'], recommended: true },
    { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['feed'], recommended: false },
  ],
  linkedin: [
    { ratio: '1.91:1', numericValue: 1.91, tolerance: 0.03, placements: ['feed', 'sponsored_content'], recommended: true },
    { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['feed'], recommended: true },
    { ratio: '4:5', numericValue: 0.8, tolerance: 0.03, placements: ['feed'], recommended: false },
  ],
  x: [
    { ratio: '1.91:1', numericValue: 1.91, tolerance: 0.03, placements: ['timeline', 'search'], recommended: true },
    { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['timeline'], recommended: true },
    { ratio: '9:16', numericValue: 0.5625, tolerance: 0.03, placements: ['timeline'], recommended: false },
  ],
  pinterest: [
    { ratio: '2:3', numericValue: 0.6667, tolerance: 0.03, placements: ['feed', 'search'], recommended: true },
    { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['feed'], recommended: false },
  ],
  google: [
    { ratio: '1.91:1', numericValue: 1.91, tolerance: 0.03, placements: ['display', 'discovery'], recommended: true },
    { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['display', 'discovery'], recommended: true },
    { ratio: '4:5', numericValue: 0.8, tolerance: 0.03, placements: ['display'], recommended: false },
    { ratio: '16:9', numericValue: 1.7778, tolerance: 0.03, placements: ['youtube'], recommended: true },
  ],
};

// =============================================================================
// PLATFORM VIDEO DURATION LIMITS
// =============================================================================

export interface VideoDurationSpec {
  minSeconds: number;
  maxSeconds: number;
  recommendedSeconds?: number;
  placement?: string;
}

export const PLATFORM_VIDEO_LIMITS: Record<SupportedPlatform, VideoDurationSpec[]> = {
  meta: [
    { minSeconds: 1, maxSeconds: 241, placement: 'feed' },
    { minSeconds: 1, maxSeconds: 15, placement: 'stories', recommendedSeconds: 15 },
    { minSeconds: 1, maxSeconds: 90, placement: 'reels', recommendedSeconds: 60 },
  ],
  tiktok: [
    { minSeconds: 5, maxSeconds: 60, recommendedSeconds: 15 },
  ],
  snapchat: [
    { minSeconds: 3, maxSeconds: 180, placement: 'stories', recommendedSeconds: 6 },
  ],
  linkedin: [
    { minSeconds: 3, maxSeconds: 1800, recommendedSeconds: 30 },
  ],
  x: [
    { minSeconds: 1, maxSeconds: 140, recommendedSeconds: 15 },
  ],
  pinterest: [
    { minSeconds: 4, maxSeconds: 900, recommendedSeconds: 15 },
  ],
  google: [
    { minSeconds: 6, maxSeconds: 180, placement: 'youtube', recommendedSeconds: 30 },
    { minSeconds: 6, maxSeconds: 15, placement: 'bumper', recommendedSeconds: 6 },
  ],
};
