// Creative validation utilities for ActiPlan
// Platform-specific specs and validation logic

import type { 
  Creative, 
  CreativeType, 
  Platform, 
  PlatformCreativeSpecs, 
  CreativeValidationResult,
  CallToAction 
} from '@/types/creative';

// Platform-specific creative specifications
export const PLATFORM_SPECS: Record<Platform, PlatformCreativeSpecs> = {
  meta: {
    platform: 'meta',
    aspectRatios: [
      { value: '1:1', label: 'Square (1:1)', recommended: true },
      { value: '4:5', label: 'Portrait (4:5)', recommended: true },
      { value: '9:16', label: 'Story/Reel (9:16)', recommended: true },
      { value: '16:9', label: 'Landscape (16:9)', recommended: false },
      { value: '1.91:1', label: 'Link Preview (1.91:1)', recommended: false },
    ],
    imageDimensions: {
      minWidth: 600,
      minHeight: 600,
      maxWidth: 6000,
      maxHeight: 6000,
      recommended: [
        { width: 1080, height: 1080 },
        { width: 1080, height: 1350 },
        { width: 1080, height: 1920 },
      ],
    },
    videoDimensions: {
      minWidth: 120,
      minHeight: 120,
      maxWidth: 4096,
      maxHeight: 4096,
      maxDuration: 241, // 4 minutes
      minDuration: 1,
      maxFileSize: 4 * 1024 * 1024 * 1024, // 4GB
    },
    textLimits: {
      primaryText: { max: 2200, recommended: 125 },
      headline: { max: 255, recommended: 40 },
      description: { max: 255, recommended: 30 },
    },
    callToActions: [
      'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW',
      'CONTACT_US', 'GET_QUOTE', 'APPLY_NOW', 'SUBSCRIBE', 'ORDER_NOW',
      'GET_OFFER', 'WATCH_MORE', 'SEE_MENU', 'GET_DIRECTIONS', 'CALL_NOW',
      'SEND_MESSAGE', 'WHATSAPP_MESSAGE', 'INSTALL_APP', 'USE_APP', 'PLAY_GAME',
    ],
  },
  tiktok: {
    platform: 'tiktok',
    aspectRatios: [
      { value: '9:16', label: 'Vertical (9:16)', recommended: true },
      { value: '1:1', label: 'Square (1:1)', recommended: false },
      { value: '16:9', label: 'Horizontal (16:9)', recommended: false },
    ],
    imageDimensions: {
      minWidth: 720,
      minHeight: 1280,
      maxWidth: 1920,
      maxHeight: 1920,
      recommended: [
        { width: 720, height: 1280 },
        { width: 1080, height: 1920 },
      ],
    },
    videoDimensions: {
      minWidth: 540,
      minHeight: 960,
      maxWidth: 4096,
      maxHeight: 4096,
      maxDuration: 60,
      minDuration: 5,
      maxFileSize: 500 * 1024 * 1024, // 500MB
    },
    textLimits: {
      primaryText: { max: 100, recommended: 80 },
      headline: { max: 100, recommended: 50 },
      description: { max: 100, recommended: 50 },
    },
    callToActions: [
      'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW',
      'CONTACT_US', 'APPLY_NOW', 'SUBSCRIBE', 'ORDER_NOW', 'INSTALL_APP',
    ],
  },
  google: {
    platform: 'google',
    aspectRatios: [
      { value: '1.91:1', label: 'Landscape (1.91:1)', recommended: true },
      { value: '1:1', label: 'Square (1:1)', recommended: true },
      { value: '4:5', label: 'Portrait (4:5)', recommended: false },
    ],
    imageDimensions: {
      minWidth: 300,
      minHeight: 250,
      maxWidth: 5120,
      maxHeight: 5120,
      recommended: [
        { width: 1200, height: 628 },
        { width: 1200, height: 1200 },
        { width: 300, height: 250 },
      ],
    },
    videoDimensions: {
      minWidth: 426,
      minHeight: 240,
      maxWidth: 3840,
      maxHeight: 2160,
      maxDuration: 180,
      minDuration: 6,
      maxFileSize: 256 * 1024 * 1024, // 256MB
    },
    textLimits: {
      primaryText: { max: 90, recommended: 80 },
      headline: { max: 30, recommended: 25 },
      description: { max: 90, recommended: 60 },
    },
    callToActions: [
      'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW',
      'CONTACT_US', 'GET_QUOTE', 'APPLY_NOW', 'SUBSCRIBE',
    ],
  },
  linkedin: {
    platform: 'linkedin',
    aspectRatios: [
      { value: '1.91:1', label: 'Landscape (1.91:1)', recommended: true },
      { value: '1:1', label: 'Square (1:1)', recommended: true },
      { value: '4:5', label: 'Portrait (4:5)', recommended: false },
    ],
    imageDimensions: {
      minWidth: 360,
      minHeight: 360,
      maxWidth: 7680,
      maxHeight: 4320,
      recommended: [
        { width: 1200, height: 628 },
        { width: 1080, height: 1080 },
      ],
    },
    videoDimensions: {
      minWidth: 360,
      minHeight: 360,
      maxWidth: 1920,
      maxHeight: 1080,
      maxDuration: 30 * 60, // 30 minutes
      minDuration: 3,
      maxFileSize: 200 * 1024 * 1024, // 200MB
    },
    textLimits: {
      primaryText: { max: 700, recommended: 150 },
      headline: { max: 200, recommended: 70 },
      description: { max: 300, recommended: 100 },
    },
    callToActions: [
      'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'APPLY_NOW', 'SUBSCRIBE', 'CONTACT_US',
    ],
  },
  snapchat: {
    platform: 'snapchat',
    aspectRatios: [
      { value: '9:16', label: 'Vertical (9:16)', recommended: true },
      { value: '1:1', label: 'Square (1:1)', recommended: false },
    ],
    imageDimensions: {
      minWidth: 1080,
      minHeight: 1920,
      maxWidth: 1080,
      maxHeight: 1920,
      recommended: [{ width: 1080, height: 1920 }],
    },
    videoDimensions: {
      minWidth: 1080,
      minHeight: 1920,
      maxWidth: 1080,
      maxHeight: 1920,
      maxDuration: 180,
      minDuration: 3,
      maxFileSize: 1024 * 1024 * 1024, // 1GB
    },
    textLimits: {
      primaryText: { max: 150, recommended: 100 },
      headline: { max: 34, recommended: 25 },
      description: { max: 150, recommended: 80 },
    },
    callToActions: [
      'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'INSTALL_APP',
    ],
  },
  pinterest: {
    platform: 'pinterest',
    aspectRatios: [
      { value: '2:3', label: 'Pin (2:3)', recommended: true },
      { value: '1:1', label: 'Square (1:1)', recommended: false },
    ],
    imageDimensions: {
      minWidth: 600,
      minHeight: 900,
      maxWidth: 6000,
      maxHeight: 6000,
      recommended: [
        { width: 1000, height: 1500 },
        { width: 1000, height: 1000 },
      ],
    },
    videoDimensions: {
      minWidth: 240,
      minHeight: 240,
      maxWidth: 1920,
      maxHeight: 1920,
      maxDuration: 15 * 60, // 15 minutes
      minDuration: 4,
      maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
    },
    textLimits: {
      primaryText: { max: 500, recommended: 100 },
      headline: { max: 100, recommended: 40 },
      description: { max: 500, recommended: 100 },
    },
    callToActions: [
      'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD',
    ],
  },
  x: {
    platform: 'x',
    aspectRatios: [
      { value: '1.91:1', label: 'Landscape (1.91:1)', recommended: true },
      { value: '1:1', label: 'Square (1:1)', recommended: true },
      { value: '9:16', label: 'Vertical (9:16)', recommended: false },
    ],
    imageDimensions: {
      minWidth: 600,
      minHeight: 335,
      maxWidth: 4096,
      maxHeight: 4096,
      recommended: [
        { width: 1200, height: 628 },
        { width: 1080, height: 1080 },
      ],
    },
    videoDimensions: {
      minWidth: 32,
      minHeight: 32,
      maxWidth: 1920,
      maxHeight: 1200,
      maxDuration: 140,
      minDuration: 1,
      maxFileSize: 512 * 1024 * 1024, // 512MB
    },
    textLimits: {
      primaryText: { max: 280, recommended: 100 },
      headline: { max: 70, recommended: 50 },
      description: { max: 200, recommended: 70 },
    },
    callToActions: [
      'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'INSTALL_APP',
    ],
  },
};

// Valid optimization goals per platform
export const VALID_OPTIMIZATION_GOALS: Record<Platform, string[]> = {
  meta: [
    'CONVERSIONS', 'OFFSITE_CONVERSIONS', 'LINK_CLICKS', 'LANDING_PAGE_VIEWS',
    'REACH', 'IMPRESSIONS', 'POST_ENGAGEMENT', 'VIDEO_VIEWS', 'THRUPLAY',
    'APP_INSTALLS', 'LEAD_GENERATION', 'MESSAGES', 'VALUE',
  ],
  tiktok: [
    'CLICK', 'CONVERSION', 'INSTALL', 'VIDEO_VIEW', 'REACH', 'TRAFFIC',
    'LEAD_GENERATION', 'VIDEO_VIEWS', 'ENGAGEMENT', 'COMPLETE_PAYMENT',
  ],
  google: [
    'CONVERSIONS', 'CLICKS', 'IMPRESSIONS', 'VIDEO_VIEWS', 'APP_INSTALLS',
  ],
  linkedin: [
    'WEBSITE_VISITS', 'ENGAGEMENT', 'VIDEO_VIEWS', 'LEAD_GENERATION', 'CONVERSIONS',
  ],
  snapchat: [
    'IMPRESSIONS', 'SWIPES', 'STORY_OPENS', 'APP_INSTALLS', 'VIDEO_VIEWS', 'CONVERSIONS',
  ],
  pinterest: [
    'AWARENESS', 'CONSIDERATION', 'CONVERSIONS', 'CATALOG_SALES',
  ],
  x: [
    'REACH', 'ENGAGEMENTS', 'VIDEO_VIEWS', 'WEBSITE_CLICKS', 'APP_INSTALLS', 'CONVERSIONS',
  ],
};

// Valid funnel stages
export const VALID_FUNNEL_STAGES = ['Awareness', 'Consideration', 'Conversion', 'Retention', 'Loyalty'];

// Validate a single creative
export function validateCreative(creative: Partial<Creative>): CreativeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Required fields
  if (!creative.name?.trim()) {
    errors.push('Creative name is required');
  }
  
  if (!creative.platform) {
    errors.push('Platform is required');
  }

  // Platform-specific validation
  if (creative.platform && PLATFORM_SPECS[creative.platform]) {
    const specs = PLATFORM_SPECS[creative.platform];
    
    // Validate text limits
    if (creative.primaryText && creative.primaryText.length > specs.textLimits.primaryText.max) {
      errors.push(`Primary text exceeds ${specs.textLimits.primaryText.max} characters`);
    } else if (creative.primaryText && creative.primaryText.length > specs.textLimits.primaryText.recommended) {
      warnings.push(`Primary text exceeds recommended ${specs.textLimits.primaryText.recommended} characters`);
    }

    if (creative.headline && creative.headline.length > specs.textLimits.headline.max) {
      errors.push(`Headline exceeds ${specs.textLimits.headline.max} characters`);
    } else if (creative.headline && creative.headline.length > specs.textLimits.headline.recommended) {
      warnings.push(`Headline exceeds recommended ${specs.textLimits.headline.recommended} characters`);
    }

    // Validate CTA
    if (creative.callToAction && !specs.callToActions.includes(creative.callToAction)) {
      warnings.push(`CTA \"${creative.callToAction}\" may not be supported on ${creative.platform}`);
    }

    // Validate dimensions
    if (creative.width && creative.height) {
      if (creative.creativeType === 'video' || creative.durationSeconds) {
        if (creative.width < specs.videoDimensions.minWidth) {
          errors.push(`Video width ${creative.width}px is below minimum ${specs.videoDimensions.minWidth}px`);
        }
        if (creative.height < specs.videoDimensions.minHeight) {
          errors.push(`Video height ${creative.height}px is below minimum ${specs.videoDimensions.minHeight}px`);
        }
      } else {
        if (creative.width < specs.imageDimensions.minWidth) {
          errors.push(`Image width ${creative.width}px is below minimum ${specs.imageDimensions.minWidth}px`);
        }
        if (creative.height < specs.imageDimensions.minHeight) {
          errors.push(`Image height ${creative.height}px is below minimum ${specs.imageDimensions.minHeight}px`);
        }
      }
    }

    // Validate video duration
    if (creative.durationSeconds) {
      if (creative.durationSeconds > specs.videoDimensions.maxDuration) {
        errors.push(`Video duration ${creative.durationSeconds}s exceeds maximum ${specs.videoDimensions.maxDuration}s`);
      }
      if (creative.durationSeconds < specs.videoDimensions.minDuration) {
        errors.push(`Video duration ${creative.durationSeconds}s is below minimum ${specs.videoDimensions.minDuration}s`);
      }
    }

    // Validate file size
    if (creative.fileSizeBytes) {
      const maxSize = creative.durationSeconds 
        ? specs.videoDimensions.maxFileSize 
        : specs.imageDimensions.maxWidth * specs.imageDimensions.maxHeight * 4; // Rough estimate
      if (creative.fileSizeBytes > maxSize) {
        errors.push(`File size exceeds platform limit`);
      }
    }
  }

  // Validate optimization goal
  if (creative.platform && creative.optimizationGoal) {
    const validGoals = VALID_OPTIMIZATION_GOALS[creative.platform];
    if (!validGoals.includes(creative.optimizationGoal.toUpperCase())) {
      warnings.push(`Optimization goal \"${creative.optimizationGoal}\" may not be valid for ${creative.platform}`);
    }
  }

  // Dark post requires media
  if (creative.creativeType === 'dark_post') {
    if (!creative.mediaUrls?.length && !creative.externalPostId) {
      errors.push('Dark post requires at least one media asset');
    }
    if (!creative.destinationUrl) {
      warnings.push('Dark post should have a destination URL');
    }
  }

  // Existing post requires external ID
  if (creative.creativeType === 'existing_post') {
    if (!creative.externalPostId) {
      errors.push('Existing post requires a post ID');
    }
  }

  // Suggestions
  if (!creative.headline) {
    suggestions.push('Add a headline for better ad performance');
  }
  if (!creative.callToAction) {
    suggestions.push('Add a call-to-action button');
  }
  if (creative.mediaUrls?.length === 1 && creative.creativeType !== 'carousel') {
    suggestions.push('Consider adding multiple creatives for A/B testing');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

// Validate folder structure against ActiPlan taxonomy
export function validateFolderPath(path: string): { 
  isValid: boolean; 
  parsed: Partial<CreativeTaxonomy>; 
  errors: string[];
} {
  const errors: string[] = [];
  const parts = path.split('/').filter(p => p.trim());
  
  // Expected structure: Platform/Market/Phase/OptimizationGoal/CreativeType
  const parsed: Partial<CreativeTaxonomy> = {};
  
  if (parts.length < 2) {
    errors.push('Folder structure must have at least Platform/Market levels');
    return { isValid: false, parsed, errors };
  }

  // Parse platform
  const platformRaw = parts[0]?.toLowerCase();
  const platformMap: Record<string, Platform> = {
    meta: 'meta', facebook: 'meta', fb: 'meta',
    tiktok: 'tiktok', tt: 'tiktok',
    google: 'google', 'google ads': 'google', gads: 'google',
    linkedin: 'linkedin', li: 'linkedin',
    snapchat: 'snapchat', snap: 'snapchat',
    pinterest: 'pinterest', pin: 'pinterest',
    x: 'x', twitter: 'x',
  };
  
  if (platformMap[platformRaw]) {
    parsed.platform = platformMap[platformRaw];
  } else {
    errors.push(`Unknown platform: \"${parts[0]}\". Valid: Meta, TikTok, Google, LinkedIn, Snapchat, Pinterest, X`);
  }

  // Parse market (country code)
  if (parts[1]) {
    const market = parts[1].toUpperCase();
    // Simple validation - 2-letter country code
    if (/^[A-Z]{2}$/.test(market)) {
      parsed.market = market;
    } else {
      errors.push(`Invalid market code: \"${parts[1]}\". Use 2-letter country code (e.g., US, UK, DE)`);
    }
  }

  // Parse phase (optional)
  if (parts[2]) {
    const phaseRaw = parts[2].toLowerCase();
    const phaseMap: Record<string, string> = {
      awareness: 'Awareness', awa: 'Awareness', top: 'Awareness',
      consideration: 'Consideration', con: 'Consideration', mid: 'Consideration',
      conversion: 'Conversion', conv: 'Conversion', bot: 'Conversion', bottom: 'Conversion',
      retention: 'Retention', ret: 'Retention',
      loyalty: 'Loyalty', loy: 'Loyalty',
    };
    
    if (phaseMap[phaseRaw]) {
      parsed.phase = phaseMap[phaseRaw];
    } else if (VALID_FUNNEL_STAGES.map(s => s.toLowerCase()).includes(phaseRaw)) {
      parsed.phase = phaseRaw.charAt(0).toUpperCase() + phaseRaw.slice(1);
    } else {
      errors.push(`Unknown phase: \"${parts[2]}\". Valid: Awareness, Consideration, Conversion, Retention, Loyalty`);
    }
  }

  // Parse optimization goal (optional)
  if (parts[3] && parsed.platform) {
    const goalRaw = parts[3].toUpperCase().replace(/[_\\s-]/g, '_');
    const validGoals = VALID_OPTIMIZATION_GOALS[parsed.platform];
    if (validGoals?.includes(goalRaw)) {
      parsed.optimizationGoal = goalRaw;
    } else {
      errors.push(`Invalid optimization goal \"${parts[3]}\" for ${parsed.platform}`);
    }
  }

  // Parse creative type (optional)
  if (parts[4]) {
    const typeRaw = parts[4].toLowerCase().replace(/[_\\s-]/g, '_');
    const typeMap: Record<string, CreativeType> = {
      dark_post: 'dark_post', darkpost: 'dark_post', dark: 'dark_post',
      existing_post: 'existing_post', existing: 'existing_post', post: 'existing_post',
      image: 'image', img: 'image', static: 'image',
      video: 'video', vid: 'video',
      carousel: 'carousel', car: 'carousel',
      collection: 'collection', col: 'collection',
      instant_experience: 'instant_experience', ix: 'instant_experience', canvas: 'instant_experience',
    };
    
    if (typeMap[typeRaw]) {
      parsed.creativeType = typeMap[typeRaw];
    } else {
      errors.push(`Unknown creative type: \"${parts[4]}\"`);
    }
  }

  return {
    isValid: errors.length === 0,
    parsed,
    errors,
  };
}

// Calculate aspect ratio from dimensions
export function calculateAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  const w = width / divisor;
  const h = height / divisor;
  
  // Simplify common ratios
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.01) return '1:1';
  if (Math.abs(ratio - 1.91) < 0.05) return '1.91:1';
  if (Math.abs(ratio - 16/9) < 0.05) return '16:9';
  if (Math.abs(ratio - 9/16) < 0.05) return '9:16';
  if (Math.abs(ratio - 4/5) < 0.05) return '4:5';
  if (Math.abs(ratio - 2/3) < 0.05) return '2:3';
  
  return `${w}:${h}`;
}

// Infer creative type from file
export function inferCreativeTypeFromFile(file: File): CreativeType {
  const mimeType = file.type.toLowerCase();
  
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  
  // Fallback based on extension
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext || '')) {
    return 'video';
  }
  
  return 'image';
}

// Generate sample taxonomy folders for testing
export function generateSampleTaxonomyStructure(): string[] {
  return [
    'Meta/US/Awareness/REACH/image/',
    'Meta/US/Consideration/LINK_CLICKS/video/',
    'Meta/US/Conversion/CONVERSIONS/carousel/',
    'Meta/UK/Awareness/VIDEO_VIEWS/video/',
    'Meta/DE/Conversion/CONVERSIONS/image/',
    'TikTok/US/Awareness/VIDEO_VIEW/video/',
    'TikTok/UK/Conversion/CONVERSION/video/',
    'Google/US/Consideration/CLICKS/image/',
  ];
}

interface CreativeTaxonomy {
  platform: Platform;
  market: string;
  phase: string;
  optimizationGoal: string;
  creativeType: CreativeType;
}
