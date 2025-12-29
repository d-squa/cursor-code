// Asset Digestion Layer
// Extracts technical attributes and compatibility signals from creative assets

import type {
  IngestedCreative,
  AssetTechnicalAttributes,
  AssetCompatibility,
  AssetDimensions,
  CompatibilitySignal,
  SupportedPlatform,
  AssetMediaType,
  CompositeFormat,
  HardConstraints,
  CreativeValidationResult,
  PLATFORM_ASPECT_RATIOS,
  PLATFORM_VIDEO_LIMITS,
  PLATFORM_COPY_LIMITS,
} from '@/types/creativeMatching';
import { calculateAspectRatioFromDimensions } from './creativeMatchingEngine';

// =============================================================================
// TECHNICAL ATTRIBUTE EXTRACTION
// =============================================================================

/**
 * Extracts technical attributes from a file
 */
export async function extractTechnicalAttributes(
  file: File,
  options?: { extractOCR?: boolean; detectLanguage?: boolean }
): Promise<AssetTechnicalAttributes> {
  const attributes: AssetTechnicalAttributes = {
    fileType: file.type,
    fileSizeBytes: file.size,
    originalFilename: file.name,
  };

  // Extract dimensions based on file type
  if (file.type.startsWith('image/')) {
    const dimensions = await extractImageDimensions(file);
    if (dimensions) {
      attributes.dimensions = dimensions;
    }
  } else if (file.type.startsWith('video/')) {
    const videoInfo = await extractVideoInfo(file);
    if (videoInfo) {
      attributes.dimensions = videoInfo.dimensions;
      attributes.durationSeconds = videoInfo.duration;
      attributes.hasAudio = videoInfo.hasAudio;
    }
  }

  // Generate content hash for deduplication
  attributes.contentHash = await generateContentHash(file);

  return attributes;
}

/**
 * Extracts image dimensions
 */
async function extractImageDimensions(file: File): Promise<AssetDimensions | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { ratio, numeric } = calculateAspectRatioFromDimensions(img.width, img.height);
      resolve({
        width: img.width,
        height: img.height,
        aspectRatio: ratio,
        aspectRatioNumeric: numeric,
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    
    img.src = url;
  });
}

/**
 * Extracts video information
 */
async function extractVideoInfo(file: File): Promise<{
  dimensions: AssetDimensions;
  duration: number;
  hasAudio: boolean;
} | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const { ratio, numeric } = calculateAspectRatioFromDimensions(video.videoWidth, video.videoHeight);
      
      // Check for audio tracks
      // Note: This is a simplified check - full audio detection requires more complex analysis
      const hasAudio = true; // Assume video has audio by default
      
      resolve({
        dimensions: {
          width: video.videoWidth,
          height: video.videoHeight,
          aspectRatio: ratio,
          aspectRatioNumeric: numeric,
        },
        duration: video.duration,
        hasAudio,
      });
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    
    video.src = url;
  });
}

/**
 * Generates a content hash for deduplication
 */
async function generateContentHash(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback to simple hash
    return `${file.name}-${file.size}-${file.lastModified}`;
  }
}

// =============================================================================
// COMPATIBILITY ANALYSIS
// =============================================================================

/**
 * Analyzes asset compatibility across platforms
 */
export function analyzeCompatibility(
  attributes: AssetTechnicalAttributes,
  mediaType: AssetMediaType
): AssetCompatibility {
  const supportedPlatforms: SupportedPlatform[] = [];
  const unsupportedPlatforms: Array<{ platform: SupportedPlatform; reason: string }> = [];
  const compatiblePlacements: string[] = [];
  const incompatiblePlacements: Array<{ placement: string; reason: string }> = [];
  const signals: CompatibilitySignal[] = [];

  const allPlatforms: SupportedPlatform[] = ['meta', 'tiktok', 'snapchat', 'linkedin', 'x', 'pinterest', 'google'];

  for (const platform of allPlatforms) {
    const platformCheck = checkPlatformCompatibility(attributes, mediaType, platform);
    
    if (platformCheck.compatible) {
      supportedPlatforms.push(platform);
      compatiblePlacements.push(...platformCheck.compatiblePlacements);
    } else {
      unsupportedPlatforms.push({ platform, reason: platformCheck.reason || 'Not compatible' });
    }
    
    signals.push(...platformCheck.signals);
  }

  // Assess cropping risk
  const croppingRisk = assessCroppingRisk(attributes.dimensions);

  // Check duration violations
  const durationViolations = checkDurationViolations(attributes.durationSeconds, allPlatforms);

  // Assess text density risk (placeholder - would need OCR)
  const textDensityRisk = 'none' as const;

  // Policy risk flags (placeholder - would need content analysis)
  const policyRiskFlags: string[] = [];

  return {
    supportedPlatforms,
    unsupportedPlatforms,
    compatiblePlacements: [...new Set(compatiblePlacements)],
    incompatiblePlacements,
    signals,
    croppingRisk,
    durationViolations,
    textDensityRisk,
    policyRiskFlags,
  };
}

/**
 * Checks compatibility for a specific platform
 */
function checkPlatformCompatibility(
  attributes: AssetTechnicalAttributes,
  mediaType: AssetMediaType,
  platform: SupportedPlatform
): {
  compatible: boolean;
  reason?: string;
  compatiblePlacements: string[];
  signals: CompatibilitySignal[];
} {
  const signals: CompatibilitySignal[] = [];
  const compatiblePlacements: string[] = [];
  let compatible = true;
  let reason: string | undefined;

  // Platform-specific dimension requirements
  const dimensionSpecs = getPlatformDimensionSpecs(platform, mediaType);
  
  if (attributes.dimensions && dimensionSpecs) {
    const { width, height } = attributes.dimensions;
    
    // Check minimum dimensions
    if (width < dimensionSpecs.minWidth || height < dimensionSpecs.minHeight) {
      compatible = false;
      reason = `Dimensions ${width}x${height} below minimum ${dimensionSpecs.minWidth}x${dimensionSpecs.minHeight}`;
      signals.push({
        signal: 'dimensions_too_small',
        status: 'fail',
        message: reason,
        severity: 'high',
      });
    } else if (width > dimensionSpecs.maxWidth || height > dimensionSpecs.maxHeight) {
      // Most platforms allow downscaling, so this is usually a warning
      signals.push({
        signal: 'dimensions_large',
        status: 'warning',
        message: `Dimensions ${width}x${height} exceed ${dimensionSpecs.maxWidth}x${dimensionSpecs.maxHeight}, will be resized`,
        severity: 'low',
      });
    } else {
      signals.push({
        signal: 'dimensions_ok',
        status: 'pass',
        message: `Dimensions ${width}x${height} are acceptable`,
        severity: 'low',
      });
    }

    // Check aspect ratio for compatible placements
    const aspectRatioSpecs = getAspectRatioSpecs(platform);
    for (const spec of aspectRatioSpecs) {
      const numericRatio = attributes.dimensions.aspectRatioNumeric;
      if (Math.abs(numericRatio - spec.numericValue) <= spec.tolerance) {
        compatiblePlacements.push(...spec.placements);
      }
    }
  }

  // Check file size limits
  const fileSizeLimit = getFileSizeLimit(platform, mediaType);
  if (fileSizeLimit && attributes.fileSizeBytes > fileSizeLimit) {
    signals.push({
      signal: 'file_size_exceeded',
      status: 'fail',
      message: `File size ${formatFileSize(attributes.fileSizeBytes)} exceeds ${formatFileSize(fileSizeLimit)} limit`,
      severity: 'high',
    });
    compatible = false;
    reason = reason || 'File size exceeds platform limit';
  }

  // Check video duration
  if (mediaType === 'video' && attributes.durationSeconds) {
    const durationSpec = getVideoDurationSpec(platform);
    if (durationSpec) {
      if (attributes.durationSeconds < durationSpec.min) {
        signals.push({
          signal: 'duration_too_short',
          status: 'fail',
          message: `Duration ${attributes.durationSeconds}s below minimum ${durationSpec.min}s`,
          severity: 'high',
        });
        compatible = false;
        reason = reason || 'Video duration too short';
      } else if (attributes.durationSeconds > durationSpec.max) {
        signals.push({
          signal: 'duration_too_long',
          status: 'fail',
          message: `Duration ${attributes.durationSeconds}s exceeds maximum ${durationSpec.max}s`,
          severity: 'high',
        });
        compatible = false;
        reason = reason || 'Video duration too long';
      }
    }
  }

  return {
    compatible,
    reason,
    compatiblePlacements: [...new Set(compatiblePlacements)],
    signals,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface DimensionSpec {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

function getPlatformDimensionSpecs(platform: SupportedPlatform, mediaType: AssetMediaType): DimensionSpec | null {
  const specs: Record<SupportedPlatform, { image: DimensionSpec; video: DimensionSpec }> = {
    meta: {
      image: { minWidth: 600, minHeight: 600, maxWidth: 6000, maxHeight: 6000 },
      video: { minWidth: 120, minHeight: 120, maxWidth: 4096, maxHeight: 4096 },
    },
    tiktok: {
      image: { minWidth: 720, minHeight: 1280, maxWidth: 1920, maxHeight: 1920 },
      video: { minWidth: 540, minHeight: 960, maxWidth: 4096, maxHeight: 4096 },
    },
    snapchat: {
      image: { minWidth: 1080, minHeight: 1920, maxWidth: 1080, maxHeight: 1920 },
      video: { minWidth: 1080, minHeight: 1920, maxWidth: 1080, maxHeight: 1920 },
    },
    linkedin: {
      image: { minWidth: 360, minHeight: 360, maxWidth: 7680, maxHeight: 4320 },
      video: { minWidth: 360, minHeight: 360, maxWidth: 1920, maxHeight: 1080 },
    },
    x: {
      image: { minWidth: 600, minHeight: 335, maxWidth: 4096, maxHeight: 4096 },
      video: { minWidth: 32, minHeight: 32, maxWidth: 1920, maxHeight: 1200 },
    },
    pinterest: {
      image: { minWidth: 600, minHeight: 900, maxWidth: 6000, maxHeight: 6000 },
      video: { minWidth: 240, minHeight: 240, maxWidth: 1920, maxHeight: 1920 },
    },
    google: {
      image: { minWidth: 300, minHeight: 250, maxWidth: 5120, maxHeight: 5120 },
      video: { minWidth: 426, minHeight: 240, maxWidth: 3840, maxHeight: 2160 },
    },
  };

  const platformSpecs = specs[platform];
  if (!platformSpecs) return null;
  
  return mediaType === 'video' ? platformSpecs.video : platformSpecs.image;
}

interface AspectRatioSpec {
  ratio: string;
  numericValue: number;
  tolerance: number;
  placements: string[];
}

function getAspectRatioSpecs(platform: SupportedPlatform): AspectRatioSpec[] {
  const specs: Record<SupportedPlatform, AspectRatioSpec[]> = {
    meta: [
      { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['feed', 'marketplace', 'search'] },
      { ratio: '4:5', numericValue: 0.8, tolerance: 0.03, placements: ['feed', 'reels'] },
      { ratio: '9:16', numericValue: 0.5625, tolerance: 0.03, placements: ['stories', 'reels'] },
      { ratio: '16:9', numericValue: 1.7778, tolerance: 0.03, placements: ['in_stream', 'feed'] },
    ],
    tiktok: [
      { ratio: '9:16', numericValue: 0.5625, tolerance: 0.03, placements: ['feed', 'for_you'] },
      { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['feed'] },
    ],
    snapchat: [
      { ratio: '9:16', numericValue: 0.5625, tolerance: 0.03, placements: ['stories', 'spotlight'] },
    ],
    linkedin: [
      { ratio: '1.91:1', numericValue: 1.91, tolerance: 0.03, placements: ['feed', 'sponsored_content'] },
      { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['feed'] },
    ],
    x: [
      { ratio: '1.91:1', numericValue: 1.91, tolerance: 0.03, placements: ['timeline'] },
      { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['timeline'] },
    ],
    pinterest: [
      { ratio: '2:3', numericValue: 0.6667, tolerance: 0.03, placements: ['feed', 'search'] },
      { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['feed'] },
    ],
    google: [
      { ratio: '1.91:1', numericValue: 1.91, tolerance: 0.03, placements: ['display', 'discovery'] },
      { ratio: '1:1', numericValue: 1, tolerance: 0.03, placements: ['display'] },
      { ratio: '16:9', numericValue: 1.7778, tolerance: 0.03, placements: ['youtube'] },
    ],
  };

  return specs[platform] || [];
}

function getFileSizeLimit(platform: SupportedPlatform, mediaType: AssetMediaType): number | null {
  const limits: Record<SupportedPlatform, { image: number; video: number }> = {
    meta: { image: 30 * 1024 * 1024, video: 4 * 1024 * 1024 * 1024 },
    tiktok: { image: 20 * 1024 * 1024, video: 500 * 1024 * 1024 },
    snapchat: { image: 5 * 1024 * 1024, video: 1024 * 1024 * 1024 },
    linkedin: { image: 8 * 1024 * 1024, video: 200 * 1024 * 1024 },
    x: { image: 5 * 1024 * 1024, video: 512 * 1024 * 1024 },
    pinterest: { image: 20 * 1024 * 1024, video: 2 * 1024 * 1024 * 1024 },
    google: { image: 5 * 1024 * 1024, video: 256 * 1024 * 1024 },
  };

  const platformLimits = limits[platform];
  if (!platformLimits) return null;
  
  return mediaType === 'video' ? platformLimits.video : platformLimits.image;
}

function getVideoDurationSpec(platform: SupportedPlatform): { min: number; max: number } | null {
  const specs: Record<SupportedPlatform, { min: number; max: number }> = {
    meta: { min: 1, max: 241 },
    tiktok: { min: 5, max: 60 },
    snapchat: { min: 3, max: 180 },
    linkedin: { min: 3, max: 1800 },
    x: { min: 1, max: 140 },
    pinterest: { min: 4, max: 900 },
    google: { min: 6, max: 180 },
  };

  return specs[platform] || null;
}

function assessCroppingRisk(dimensions?: AssetDimensions): 'none' | 'low' | 'medium' | 'high' {
  if (!dimensions) return 'none';
  
  const { aspectRatioNumeric } = dimensions;
  
  // Very wide or very tall assets have high cropping risk
  if (aspectRatioNumeric > 2.5 || aspectRatioNumeric < 0.4) {
    return 'high';
  }
  
  // Moderately unusual ratios
  if (aspectRatioNumeric > 2 || aspectRatioNumeric < 0.5) {
    return 'medium';
  }
  
  // Common ratios that might need minor adjustment
  if (aspectRatioNumeric > 1.8 || aspectRatioNumeric < 0.6) {
    return 'low';
  }
  
  return 'none';
}

function checkDurationViolations(duration: number | undefined, platforms: SupportedPlatform[]): string[] {
  if (!duration) return [];
  
  const violations: string[] = [];
  
  for (const platform of platforms) {
    const spec = getVideoDurationSpec(platform);
    if (spec) {
      if (duration < spec.min) {
        violations.push(`${platform}: minimum ${spec.min}s required`);
      } else if (duration > spec.max) {
        violations.push(`${platform}: maximum ${spec.max}s exceeded`);
      }
    }
  }
  
  return violations;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// =============================================================================
// CREATIVE INGESTION
// =============================================================================

/**
 * Ingests a file and creates an IngestedCreative object
 */
export async function ingestFile(
  file: File,
  options?: {
    sourcePath?: string;
    hardConstraints?: Partial<HardConstraints>;
  }
): Promise<IngestedCreative> {
  // Extract technical attributes
  const technicalAttributes = await extractTechnicalAttributes(file);
  
  // Determine media type
  const mediaType = inferMediaType(file.type);
  
  // Analyze compatibility
  const compatibility = analyzeCompatibility(technicalAttributes, mediaType);
  
  // Build hard constraints from source path if not provided
  const hardConstraints: HardConstraints = options?.hardConstraints || {};
  if (options?.sourcePath) {
    const parsedConstraints = parseConstraintsFromPath(options.sourcePath);
    Object.assign(hardConstraints, parsedConstraints);
  }
  
  // Create preview URL
  const thumbnailUrl = file.type.startsWith('image/') || file.type.startsWith('video/')
    ? URL.createObjectURL(file)
    : undefined;
  
  // Validate
  const validationResult = validateIngestedCreative({
    technicalAttributes,
    compatibility,
    mediaType,
  });

  return {
    id: crypto.randomUUID(),
    sourceType: 'file',
    sourcePath: options?.sourcePath || file.name,
    technicalAttributes,
    compatibility,
    hardConstraints,
    mediaType,
    compositeFormat: 'single',
    mediaUrls: [thumbnailUrl || ''],
    thumbnailUrl,
    validationResult,
    ingestedAt: new Date().toISOString(),
  };
}

/**
 * Infers media type from MIME type
 */
function inferMediaType(mimeType: string): AssetMediaType {
  if (mimeType.startsWith('image/gif')) return 'gif';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('html')) return 'html5';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'image'; // Default
}

/**
 * Parses hard constraints from a folder path
 * Expected format: Platform/Market/Phase/...
 */
function parseConstraintsFromPath(path: string): Partial<HardConstraints> {
  const constraints: Partial<HardConstraints> = {};
  const parts = path.split('/').filter(p => p.trim());
  
  // Market is usually the second component (after platform)
  if (parts.length >= 2) {
    const potentialMarket = parts[1].toUpperCase();
    // Check if it looks like a country code
    if (/^[A-Z]{2}$/.test(potentialMarket)) {
      constraints.market = potentialMarket;
    }
  }
  
  // Look for language indicators in the path
  const languagePatterns = ['_en', '_es', '_de', '_fr', '_pt', '_it', '_ja', '_ko', '_zh'];
  for (const pattern of languagePatterns) {
    if (path.toLowerCase().includes(pattern)) {
      constraints.language = pattern.replace('_', '');
      break;
    }
  }
  
  // Look for variant indicators
  const variantPatterns = ['_v1', '_v2', '_a', '_b', '_control', '_test'];
  for (const pattern of variantPatterns) {
    if (path.toLowerCase().includes(pattern)) {
      constraints.variant = pattern.replace('_', '').toUpperCase();
      break;
    }
  }
  
  return constraints;
}

/**
 * Validates an ingested creative
 */
function validateIngestedCreative(params: {
  technicalAttributes: AssetTechnicalAttributes;
  compatibility: AssetCompatibility;
  mediaType: AssetMediaType;
}): CreativeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const { technicalAttributes, compatibility, mediaType } = params;

  // Check if any platform supports this asset
  if (compatibility.supportedPlatforms.length === 0) {
    errors.push('Asset is not compatible with any supported platform');
  }

  // Add platform-specific issues as warnings
  for (const unsupported of compatibility.unsupportedPlatforms) {
    warnings.push(`Not compatible with ${unsupported.platform}: ${unsupported.reason}`);
  }

  // Check for critical signals
  for (const signal of compatibility.signals) {
    if (signal.status === 'fail' && signal.severity === 'high') {
      errors.push(signal.message);
    } else if (signal.status === 'fail' || signal.status === 'warning') {
      warnings.push(signal.message);
    }
  }

  // Suggestions
  if (compatibility.croppingRisk !== 'none') {
    suggestions.push(`Consider adjusting aspect ratio to reduce cropping risk (current: ${compatibility.croppingRisk})`);
  }

  if (compatibility.durationViolations.length > 0) {
    suggestions.push(`Video duration may need adjustment for: ${compatibility.durationViolations.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}
