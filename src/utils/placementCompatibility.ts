// Placement Compatibility Detection
// Determines which placements (Story, Feed, Carousel) a creative is compatible with
// based on dimensions, aspect ratio, and platform requirements

import { matchesAspectRatio, detectAspectRatio } from './platformAdSpecs';

export type PlacementType = 'feed' | 'story' | 'carousel';

export interface PlacementCompatibility {
  feed: boolean;
  story: boolean;
  carousel: boolean;
}

export interface PlacementCompatibilityResult {
  placements: PlacementCompatibility;
  primaryPlacement: PlacementType;
  warnings: string[];
  isCarouselCompatible: boolean;
}

// Aspect ratio requirements per placement type
const PLACEMENT_ASPECT_RATIOS: Record<PlacementType, string[]> = {
  feed: ['1:1', '4:5', '16:9', '1.91:1', '2:3'],
  story: ['9:16'],
  carousel: ['1:1', '1.91:1', '9:16'], // Platform-dependent
};

// Platform-specific carousel requirements
// Each platform can support different carousel types based on aspect ratio:
// - 1:1 / 1.91:1 = Feed carousel
// - 9:16 = Story/Reels carousel
export const CAROUSEL_PLATFORM_REQUIREMENTS: Record<string, {
  aspectRatios: string[];
  minCards: number;
  maxCards: number;
  sameAspectRatio: boolean; // Whether all cards must have same aspect ratio
  storyCarouselSupported: boolean;
}> = {
  meta: {
    aspectRatios: ['1:1', '4:5', '9:16'], // Square, vertical, and story formats
    minCards: 2,
    maxCards: 10,
    sameAspectRatio: true,
    storyCarouselSupported: true,
  },
  tiktok: {
    aspectRatios: ['1.91:1', '1:1', '9:16'],
    minCards: 2,
    maxCards: 35,
    sameAspectRatio: false,
    storyCarouselSupported: true,
  },
  linkedin: {
    aspectRatios: ['1:1', '1.91:1'],
    minCards: 2,
    maxCards: 10,
    sameAspectRatio: true,
    storyCarouselSupported: false,
  },
  pinterest: {
    aspectRatios: ['1:1', '2:3', '9:16'],
    minCards: 2,
    maxCards: 5,
    sameAspectRatio: false,
    storyCarouselSupported: true,
  },
  x: {
    aspectRatios: ['1:1', '16:9', '1.91:1'],
    minCards: 2,
    maxCards: 6,
    sameAspectRatio: false,
    storyCarouselSupported: false,
  },
  snapchat: {
    aspectRatios: ['9:16'], // Snapchat only supports vertical story carousels
    minCards: 2,
    maxCards: 10,
    sameAspectRatio: true,
    storyCarouselSupported: true,
  },
};

/**
 * Detect which placements a creative is compatible with based on its dimensions
 */
export function detectPlacementCompatibility(
  width: number | undefined,
  height: number | undefined,
  mediaType: 'image' | 'video',
  platform?: string
): PlacementCompatibilityResult {
  const result: PlacementCompatibilityResult = {
    placements: { feed: false, story: false, carousel: false },
    primaryPlacement: 'feed',
    warnings: [],
    isCarouselCompatible: false,
  };

  if (!width || !height) {
    result.warnings.push('Missing dimensions');
    return result;
  }

  const aspectRatio = detectAspectRatio(width, height);
  const platformLower = platform?.toLowerCase() || 'meta';

  // Check Feed compatibility
  // Feed accepts 1:1, 4:5, 16:9, 1.91:1
  const isFeedCompatible = PLACEMENT_ASPECT_RATIOS.feed.some(ratio =>
    matchesAspectRatio(width, height, ratio, 0.08)
  );
  result.placements.feed = isFeedCompatible;

  // Check Story compatibility
  // Stories require 9:16 vertical format
  const isStoryCompatible = matchesAspectRatio(width, height, '9:16', 0.08);
  result.placements.story = isStoryCompatible;

  // Check Carousel compatibility (platform-specific)
  const carouselReqs = CAROUSEL_PLATFORM_REQUIREMENTS[platformLower] || CAROUSEL_PLATFORM_REQUIREMENTS.meta;
  const isCarouselAspectValid = carouselReqs.aspectRatios.some(ratio =>
    matchesAspectRatio(width, height, ratio, 0.08)
  );
  result.placements.carousel = isCarouselAspectValid;
  result.isCarouselCompatible = isCarouselAspectValid;

  // Determine primary placement based on aspect ratio
  if (isStoryCompatible && (mediaType === 'video' || !isFeedCompatible)) {
    result.primaryPlacement = 'story';
  } else if (isFeedCompatible) {
    result.primaryPlacement = 'feed';
  } else if (isCarouselAspectValid) {
    result.primaryPlacement = 'carousel';
  }

  // Add warnings for suboptimal dimensions
  if (!isFeedCompatible && !isStoryCompatible && !isCarouselAspectValid) {
    result.warnings.push(`Aspect ratio ${aspectRatio} may not be optimal for any placement`);
  }

  // Minimum dimension warnings
  if (width < 600 || height < 600) {
    result.warnings.push('Dimensions below recommended minimum (600px)');
  }

  return result;
}

/**
 * Validate a set of creatives for carousel creation
 */
export function validateCarouselCreatives(
  creatives: Array<{ width?: number; height?: number; aspectRatio?: string; mediaType: 'image' | 'video' }>,
  platform: string
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  compatiblePlacements: PlacementType[];
} {
  const result = {
    isValid: true,
    errors: [] as string[],
    warnings: [] as string[],
    compatiblePlacements: [] as PlacementType[],
  };

  const platformLower = platform.toLowerCase();
  const reqs = CAROUSEL_PLATFORM_REQUIREMENTS[platformLower] || CAROUSEL_PLATFORM_REQUIREMENTS.meta;

  // Check card count
  if (creatives.length < reqs.minCards) {
    result.isValid = false;
    result.errors.push(`Minimum ${reqs.minCards} cards required (have ${creatives.length})`);
  }
  if (creatives.length > reqs.maxCards) {
    result.isValid = false;
    result.errors.push(`Maximum ${reqs.maxCards} cards allowed (have ${creatives.length})`);
  }

  // Check aspect ratios
  const aspectRatios = creatives.map(c => {
    if (c.aspectRatio) return c.aspectRatio;
    if (c.width && c.height) return detectAspectRatio(c.width, c.height);
    return null;
  });

  // Check if all have compatible aspect ratios
  const incompatibleCount = creatives.filter((c, i) => {
    if (!c.width || !c.height) return true;
    return !reqs.aspectRatios.some(ratio => 
      matchesAspectRatio(c.width!, c.height!, ratio, 0.08)
    );
  }).length;

  if (incompatibleCount > 0) {
    result.isValid = false;
    result.errors.push(`${incompatibleCount} card(s) have incompatible aspect ratios for ${platform} carousel`);
    result.warnings.push(`${platform} carousel supports: ${reqs.aspectRatios.join(', ')}`);
  }

  // HARD RULE: All carousel cards must be the same format (either story OR feed)
  // Check if mixing 9:16 (story) with non-9:16 (feed) formats
  const storyCards = creatives.filter(c => 
    c.width && c.height && matchesAspectRatio(c.width, c.height, '9:16', 0.08)
  );
  const feedCards = creatives.filter(c => 
    c.width && c.height && !matchesAspectRatio(c.width, c.height, '9:16', 0.08)
  );
  
  if (storyCards.length > 0 && feedCards.length > 0) {
    result.isValid = false;
    result.errors.push(`Cannot mix story (9:16) and feed formats in a carousel. All cards must be the same format.`);
    result.errors.push(`Found ${storyCards.length} story card(s) and ${feedCards.length} feed card(s)`);
  }

  const uniqueRatios = new Set(aspectRatios.filter((ratio): ratio is string => Boolean(ratio)));
  if (uniqueRatios.size > 1) {
    result.isValid = false;
    result.errors.push('All carousel cards must use the same aspect ratio.');
    result.errors.push(`Found mixed ratios: ${Array.from(uniqueRatios).join(', ')}`);
  }

  // Determine compatible placements for the carousel based on aspect ratios
  const has916 = creatives.every(c => 
    c.width && c.height && matchesAspectRatio(c.width, c.height, '9:16', 0.08)
  );
  const hasFeedRatio = creatives.every(c => 
    c.width && c.height && (
      matchesAspectRatio(c.width, c.height, '1:1', 0.08) ||
      matchesAspectRatio(c.width, c.height, '1.91:1', 0.08) ||
      matchesAspectRatio(c.width, c.height, '16:9', 0.08)
    )
  );

  // Add feed placement if all cards have feed-compatible ratios
  if (hasFeedRatio) {
    result.compatiblePlacements.push('feed');
  }
  
  // Check if 9:16 carousels work for stories on this platform
  if (has916 && reqs.storyCarouselSupported) {
    result.compatiblePlacements.push('story');
  }

  // If neither, default to feed (will show validation errors)
  if (result.compatiblePlacements.length === 0) {
    result.compatiblePlacements.push('feed');
  }

  return result;
}

/**
 * Get placement badges configuration for a creative
 */
export function getPlacementBadges(
  width: number | undefined,
  height: number | undefined,
  mediaType: 'image' | 'video',
  platform?: string
): Array<{
  type: PlacementType;
  label: string;
  variant: 'compatible' | 'primary' | 'incompatible';
  tooltip: string;
}> {
  const { placements, primaryPlacement } = detectPlacementCompatibility(
    width, height, mediaType, platform
  );

  const badges: Array<{
    type: PlacementType;
    label: string;
    variant: 'compatible' | 'primary' | 'incompatible';
    tooltip: string;
  }> = [];

  // Feed badge
  badges.push({
    type: 'feed',
    label: 'Feed',
    variant: placements.feed 
      ? (primaryPlacement === 'feed' ? 'primary' : 'compatible')
      : 'incompatible',
    tooltip: placements.feed 
      ? 'Compatible with feed placements (1:1, 4:5, 16:9)'
      : 'Not optimal for feed (needs 1:1, 4:5, or 16:9)',
  });

  // Story badge
  badges.push({
    type: 'story',
    label: 'Story',
    variant: placements.story 
      ? (primaryPlacement === 'story' ? 'primary' : 'compatible')
      : 'incompatible',
    tooltip: placements.story 
      ? 'Compatible with story placements (9:16)'
      : 'Not optimal for stories (needs 9:16)',
  });

  // Carousel badge
  badges.push({
    type: 'carousel',
    label: 'Carousel',
    variant: placements.carousel 
      ? 'compatible'
      : 'incompatible',
    tooltip: placements.carousel 
      ? 'Can be used in carousel ads'
      : 'Aspect ratio not supported for carousels',
  });

  return badges;
}
