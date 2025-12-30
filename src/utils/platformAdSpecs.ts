// Platform-specific ad specifications based on industry standards
// Used for validating creative dimensions and formats during matching

export interface AdFormatSpec {
  name: string;
  placement: string;
  format: 'image' | 'video' | 'carousel';
  aspectRatios: string[];  // e.g., ['9:16', '1:1', '4:5']
  resolutions: Array<{ width: number; height: number; label?: string }>;
  minWidth: number;
  minHeight: number;
  maxFileSize: number;  // in bytes
  fileTypes: string[];
  videoDuration?: { min: number; max: number };  // in seconds
}

export interface PlatformAdSpecs {
  platform: string;
  formats: AdFormatSpec[];
}

// META (Facebook/Instagram) Ad Specs
const META_SPECS: PlatformAdSpecs = {
  platform: 'meta',
  formats: [
    // Stories
    {
      name: 'Story Image',
      placement: 'stories',
      format: 'image',
      aspectRatios: ['9:16'],
      resolutions: [{ width: 1080, height: 1920 }, { width: 1440, height: 2560 }],
      minWidth: 500,
      minHeight: 889,
      maxFileSize: 30 * 1024 * 1024, // 30MB
      fileTypes: ['jpg', 'jpeg', 'png'],
    },
    {
      name: 'Story Video',
      placement: 'stories',
      format: 'video',
      aspectRatios: ['9:16'],
      resolutions: [{ width: 1080, height: 1920 }, { width: 1440, height: 2560 }],
      minWidth: 250,
      minHeight: 444,
      maxFileSize: 4 * 1024 * 1024 * 1024, // 4GB
      fileTypes: ['mp4', 'mov', 'gif'],
      videoDuration: { min: 1, max: 120 },
    },
    // Reels
    {
      name: 'Reels Video',
      placement: 'reels',
      format: 'video',
      aspectRatios: ['9:16'],
      resolutions: [{ width: 1080, height: 1920 }],
      minWidth: 500,
      minHeight: 889,
      maxFileSize: 4 * 1024 * 1024 * 1024,
      fileTypes: ['mp4', 'mov'],
      videoDuration: { min: 3, max: 90 },
    },
    // Feed Image
    {
      name: 'Feed Image Square',
      placement: 'feed',
      format: 'image',
      aspectRatios: ['1:1'],
      resolutions: [{ width: 1080, height: 1080 }, { width: 1440, height: 1440 }],
      minWidth: 600,
      minHeight: 600,
      maxFileSize: 30 * 1024 * 1024,
      fileTypes: ['jpg', 'jpeg', 'png'],
    },
    {
      name: 'Feed Image Portrait',
      placement: 'feed',
      format: 'image',
      aspectRatios: ['4:5'],
      resolutions: [{ width: 1080, height: 1350 }, { width: 1440, height: 1800 }],
      minWidth: 600,
      minHeight: 750,
      maxFileSize: 30 * 1024 * 1024,
      fileTypes: ['jpg', 'jpeg', 'png'],
    },
    // Feed Video
    {
      name: 'Feed Video',
      placement: 'feed',
      format: 'video',
      aspectRatios: ['4:5', '1:1', '16:9'],
      resolutions: [
        { width: 1080, height: 1350, label: '4:5' },
        { width: 1080, height: 1080, label: '1:1' },
        { width: 1920, height: 1080, label: '16:9' },
      ],
      minWidth: 120,
      minHeight: 120,
      maxFileSize: 4 * 1024 * 1024 * 1024,
      fileTypes: ['mp4', 'mov', 'gif'],
      videoDuration: { min: 1, max: 241 * 60 },
    },
    // Carousel
    {
      name: 'Carousel Image',
      placement: 'carousel',
      format: 'carousel',
      aspectRatios: ['1:1'],
      resolutions: [{ width: 1080, height: 1080 }, { width: 1440, height: 1440 }],
      minWidth: 600,
      minHeight: 600,
      maxFileSize: 30 * 1024 * 1024,
      fileTypes: ['jpg', 'jpeg', 'png'],
    },
  ],
};

// TikTok Ad Specs
const TIKTOK_SPECS: PlatformAdSpecs = {
  platform: 'tiktok',
  formats: [
    {
      name: 'Single Video',
      placement: 'feed',
      format: 'video',
      aspectRatios: ['9:16'],
      resolutions: [{ width: 1080, height: 1920 }],
      minWidth: 540,
      minHeight: 960,
      maxFileSize: 500 * 1024 * 1024, // 500MB
      fileTypes: ['mp4', 'mov', 'mpeg', 'avi'],
      videoDuration: { min: 5, max: 60 },
    },
    {
      name: 'Carousel Image',
      placement: 'carousel',
      format: 'carousel',
      aspectRatios: ['1.91:1', '1:1', '9:16'],
      resolutions: [
        { width: 1200, height: 628, label: '1.91:1' },
        { width: 640, height: 640, label: '1:1' },
        { width: 720, height: 1280, label: '9:16' },
      ],
      minWidth: 640,
      minHeight: 628,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      fileTypes: ['jpg', 'jpeg', 'png'],
    },
    {
      name: 'Smart+ Video',
      placement: 'smart_plus',
      format: 'video',
      aspectRatios: ['9:16'],
      resolutions: [{ width: 1080, height: 1920 }],
      minWidth: 540,
      minHeight: 960,
      maxFileSize: 500 * 1024 * 1024,
      fileTypes: ['mp4', 'mov', 'mpeg', 'avi'],
      videoDuration: { min: 5, max: 60 },
    },
    {
      name: 'Smart+ Image',
      placement: 'smart_plus',
      format: 'image',
      aspectRatios: ['9:16'],
      resolutions: [{ width: 1080, height: 1920 }],
      minWidth: 540,
      minHeight: 960,
      maxFileSize: 100 * 1024 * 1024,
      fileTypes: ['jpg', 'jpeg', 'png'],
    },
  ],
};

// Snapchat Ad Specs
const SNAPCHAT_SPECS: PlatformAdSpecs = {
  platform: 'snapchat',
  formats: [
    {
      name: 'Single Image',
      placement: 'stories',
      format: 'image',
      aspectRatios: ['9:16'],
      resolutions: [{ width: 1080, height: 1920 }],
      minWidth: 1080,
      minHeight: 1920,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      fileTypes: ['jpg', 'jpeg', 'png'],
    },
    {
      name: 'Single Video',
      placement: 'stories',
      format: 'video',
      aspectRatios: ['9:16'],
      resolutions: [{ width: 1080, height: 1920 }],
      minWidth: 1080,
      minHeight: 1920,
      maxFileSize: 512 * 1024 * 1024, // 512MB
      fileTypes: ['mp4', 'mov'],
      videoDuration: { min: 6, max: 120 },
    },
  ],
};

// LinkedIn Ad Specs
const LINKEDIN_SPECS: PlatformAdSpecs = {
  platform: 'linkedin',
  formats: [
    {
      name: 'Static Image Square',
      placement: 'feed',
      format: 'image',
      aspectRatios: ['1:1'],
      resolutions: [{ width: 1080, height: 1080 }, { width: 1200, height: 1200 }],
      minWidth: 360,
      minHeight: 360,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      fileTypes: ['jpg', 'png', 'gif'],
    },
    {
      name: 'Static Image Landscape',
      placement: 'feed',
      format: 'image',
      aspectRatios: ['1.91:1'],
      resolutions: [{ width: 1200, height: 628 }],
      minWidth: 640,
      minHeight: 360,
      maxFileSize: 5 * 1024 * 1024,
      fileTypes: ['jpg', 'png', 'gif'],
    },
    {
      name: 'Static Image Portrait',
      placement: 'feed',
      format: 'image',
      aspectRatios: ['4:5', '2:3'],
      resolutions: [
        { width: 720, height: 900, label: '4:5' },
        { width: 600, height: 900, label: '2:3' },
      ],
      minWidth: 360,
      minHeight: 640,
      maxFileSize: 5 * 1024 * 1024,
      fileTypes: ['jpg', 'png', 'gif'],
    },
    {
      name: 'Video',
      placement: 'feed',
      format: 'video',
      aspectRatios: ['1:1', '16:9', '9:16'],
      resolutions: [
        { width: 1080, height: 1080, label: '1:1' },
        { width: 1920, height: 1080, label: '16:9' },
        { width: 1080, height: 1920, label: '9:16' },
      ],
      minWidth: 360,
      minHeight: 360,
      maxFileSize: 200 * 1024 * 1024, // 200MB
      fileTypes: ['mp4'],
      videoDuration: { min: 3, max: 30 * 60 },
    },
    {
      name: 'Carousel',
      placement: 'carousel',
      format: 'carousel',
      aspectRatios: ['1:1'],
      resolutions: [{ width: 1080, height: 1080 }],
      minWidth: 1080,
      minHeight: 1080,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      fileTypes: ['jpg', 'png'],
    },
    {
      name: 'Message Banner',
      placement: 'message',
      format: 'image',
      aspectRatios: ['1.2:1'],
      resolutions: [{ width: 300, height: 250 }],
      minWidth: 300,
      minHeight: 250,
      maxFileSize: 5 * 1024 * 1024,
      fileTypes: ['jpg', 'png'],
    },
  ],
};

// Google Ads (PMax, UAC, Demand Gen)
const GOOGLE_SPECS: PlatformAdSpecs = {
  platform: 'google',
  formats: [
    // PMax / Demand Gen Static Images
    {
      name: 'Static Image Square',
      placement: 'display',
      format: 'image',
      aspectRatios: ['1:1'],
      resolutions: [{ width: 1200, height: 1200 }],
      minWidth: 300,
      minHeight: 300,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      fileTypes: ['jpg', 'png'],
    },
    {
      name: 'Static Image Portrait',
      placement: 'display',
      format: 'image',
      aspectRatios: ['4:5'],
      resolutions: [{ width: 960, height: 1200 }],
      minWidth: 480,
      minHeight: 600,
      maxFileSize: 5 * 1024 * 1024,
      fileTypes: ['jpg', 'png'],
    },
    {
      name: 'Static Image Landscape',
      placement: 'display',
      format: 'image',
      aspectRatios: ['1.91:1'],
      resolutions: [{ width: 1200, height: 628 }],
      minWidth: 600,
      minHeight: 314,
      maxFileSize: 5 * 1024 * 1024,
      fileTypes: ['jpg', 'png'],
    },
    // YouTube Videos
    {
      name: 'Video Landscape',
      placement: 'youtube',
      format: 'video',
      aspectRatios: ['16:9'],
      resolutions: [
        { width: 1920, height: 1080, label: '1080p' },
        { width: 3840, height: 2160, label: '4K' },
      ],
      minWidth: 1280,
      minHeight: 720,
      maxFileSize: 256 * 1024 * 1024 * 1024, // 256GB (YouTube limit)
      fileTypes: ['mp4', 'mov', 'avi', 'wmv'],
      videoDuration: { min: 6, max: 180 },
    },
    {
      name: 'Video Shorts',
      placement: 'shorts',
      format: 'video',
      aspectRatios: ['9:16'],
      resolutions: [{ width: 1080, height: 1920 }],
      minWidth: 720,
      minHeight: 1280,
      maxFileSize: 256 * 1024 * 1024 * 1024,
      fileTypes: ['mp4', 'mov'],
      videoDuration: { min: 15, max: 60 },
    },
    // Logo requirements for Demand Gen
    {
      name: 'Logo',
      placement: 'logo',
      format: 'image',
      aspectRatios: ['1:1'],
      resolutions: [{ width: 1200, height: 1200 }],
      minWidth: 128,
      minHeight: 128,
      maxFileSize: 5 * 1024, // 5KB for logos
      fileTypes: ['jpg', 'png'],
    },
  ],
};

// All platform specs
export const PLATFORM_AD_SPECS: Record<string, PlatformAdSpecs> = {
  meta: META_SPECS,
  tiktok: TIKTOK_SPECS,
  snapchat: SNAPCHAT_SPECS,
  linkedin: LINKEDIN_SPECS,
  google: GOOGLE_SPECS,
};

// Common social media ad format dimensions (union of all platforms)
export const COMMON_AD_DIMENSIONS = {
  // Minimum dimensions that are valid for at least one platform
  absoluteMinWidth: 120,
  absoluteMinHeight: 120,
  
  // Standard aspect ratios with their typical min dimensions
  aspectRatios: {
    '1:1': { minWidth: 300, minHeight: 300, examples: ['1080x1080', '1200x1200'] },
    '4:5': { minWidth: 480, minHeight: 600, examples: ['1080x1350', '960x1200'] },
    '9:16': { minWidth: 540, minHeight: 960, examples: ['1080x1920', '1440x2560'] },
    '16:9': { minWidth: 960, minHeight: 540, examples: ['1920x1080', '1280x720'] },
    '1.91:1': { minWidth: 600, minHeight: 314, examples: ['1200x628'] },
    '2:3': { minWidth: 400, minHeight: 600, examples: ['600x900'] },
  } as Record<string, { minWidth: number; minHeight: number; examples: string[] }>,
};

/**
 * Check if dimensions match a specific aspect ratio with tolerance
 */
export function matchesAspectRatio(
  width: number, 
  height: number, 
  targetRatio: string, 
  tolerance: number = 0.05
): boolean {
  const [rw, rh] = targetRatio.split(':').map(Number);
  if (!rw || !rh) return false;
  
  const targetDecimal = rw / rh;
  const actualDecimal = width / height;
  
  return Math.abs(actualDecimal - targetDecimal) / targetDecimal <= tolerance;
}

/**
 * Determine which aspect ratio a creative matches
 */
export function detectAspectRatio(width: number, height: number): string | null {
  const ratios = Object.keys(COMMON_AD_DIMENSIONS.aspectRatios);
  
  for (const ratio of ratios) {
    if (matchesAspectRatio(width, height, ratio)) {
      return ratio;
    }
  }
  
  // Calculate and return the actual ratio if no standard match
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const d = gcd(width, height);
  return `${width/d}:${height/d}`;
}

/**
 * Find all compatible ad formats for given creative dimensions
 */
export function findCompatibleFormats(
  width: number,
  height: number,
  mediaType: 'image' | 'video',
  platform?: string
): Array<{ platform: string; format: AdFormatSpec; compatibility: 'exact' | 'acceptable' | 'suboptimal' }> {
  const compatible: Array<{ platform: string; format: AdFormatSpec; compatibility: 'exact' | 'acceptable' | 'suboptimal' }> = [];
  
  const platformsToCheck = platform 
    ? [PLATFORM_AD_SPECS[platform]].filter(Boolean)
    : Object.values(PLATFORM_AD_SPECS);
  
  for (const platformSpec of platformsToCheck) {
    for (const format of platformSpec.formats) {
      // Skip if format type doesn't match
      if (format.format === 'carousel') {
        // Carousel can accept both images and videos depending on platform
        if (mediaType !== 'image' && mediaType !== 'video') continue;
      } else if (format.format !== mediaType) {
        continue;
      }
      
      // Check if dimensions meet minimum requirements
      if (width < format.minWidth || height < format.minHeight) {
        continue;
      }
      
      // Check aspect ratio compatibility
      let compatibility: 'exact' | 'acceptable' | 'suboptimal' = 'suboptimal';
      
      for (const ratio of format.aspectRatios) {
        if (matchesAspectRatio(width, height, ratio, 0.01)) {
          // Check if resolution matches recommended
          const exactMatch = format.resolutions.some(
            res => res.width === width && res.height === height
          );
          compatibility = exactMatch ? 'exact' : 'acceptable';
          break;
        } else if (matchesAspectRatio(width, height, ratio, 0.05)) {
          compatibility = 'acceptable';
          break;
        }
      }
      
      if (compatibility !== 'suboptimal') {
        compatible.push({
          platform: platformSpec.platform,
          format,
          compatibility,
        });
      }
    }
  }
  
  return compatible;
}

/**
 * Validate if a creative meets requirements for ANY ad format on ANY platform
 * Returns detailed validation result
 */
export function validateCreativeForAds(
  width: number,
  height: number,
  mediaType: 'image' | 'video',
  fileSize?: number,
  duration?: number
): {
  isValid: boolean;
  reason?: string;
  compatibleFormats: Array<{ platform: string; format: string; placement: string }>;
  suggestions?: string[];
} {
  const suggestions: string[] = [];
  
  // Check absolute minimums
  if (!width || !height) {
    return {
      isValid: false,
      reason: 'No dimensions detected - cannot validate for ad formats',
      compatibleFormats: [],
    };
  }
  
  if (width < COMMON_AD_DIMENSIONS.absoluteMinWidth || height < COMMON_AD_DIMENSIONS.absoluteMinHeight) {
    return {
      isValid: false,
      reason: `Dimensions ${width}x${height} too small for any ad format. Minimum: ${COMMON_AD_DIMENSIONS.absoluteMinWidth}x${COMMON_AD_DIMENSIONS.absoluteMinHeight}`,
      compatibleFormats: [],
      suggestions: ['This appears to be a logo or icon, not an ad creative'],
    };
  }
  
  // Find compatible formats
  const compatible = findCompatibleFormats(width, height, mediaType);
  
  if (compatible.length === 0) {
    // Detect what the aspect ratio is
    const detectedRatio = detectAspectRatio(width, height);
    const standardRatios = Object.keys(COMMON_AD_DIMENSIONS.aspectRatios).join(', ');
    
    return {
      isValid: false,
      reason: `Aspect ratio ${detectedRatio} (${width}x${height}) doesn't match any standard ad format`,
      compatibleFormats: [],
      suggestions: [
        `Standard ad aspect ratios: ${standardRatios}`,
        'Consider resizing to a standard format',
      ],
    };
  }
  
  // Check for exact matches (best quality)
  const exactMatches = compatible.filter(c => c.compatibility === 'exact');
  const acceptableMatches = compatible.filter(c => c.compatibility === 'acceptable');
  
  if (exactMatches.length === 0 && acceptableMatches.length > 0) {
    suggestions.push('Dimensions are acceptable but not optimal for any platform');
  }
  
  return {
    isValid: true,
    compatibleFormats: compatible.map(c => ({
      platform: c.platform,
      format: c.format.name,
      placement: c.format.placement,
    })),
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Get recommended formats for a specific platform
 */
export function getRecommendedFormats(platform: string): AdFormatSpec[] {
  return PLATFORM_AD_SPECS[platform]?.formats || [];
}
