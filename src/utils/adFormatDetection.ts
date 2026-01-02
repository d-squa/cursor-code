// Ad Format Detection Utility
// Detects and suggests ad formats based on creative dimensions and media type

import type { AdFormat } from '@/types/creativeTextAssets';

interface DimensionInfo {
  width?: number;
  height?: number;
  aspectRatio?: string;
  mediaType: 'image' | 'video';
  platform?: string;
}

// Ad format display labels
export const AD_FORMAT_LABELS: Record<AdFormat, string> = {
  feed_image: 'Feed Image',
  feed_video: 'Feed Video',
  story_image: 'Story Image',
  story_video: 'Story Video',
  reels_video: 'Reels Video',
  carousel_image: 'Carousel Image',
  carousel_video: 'Carousel Video',
  shorts_video: 'Shorts Video',
  display_image: 'Display Image',
  display_video: 'Display Video',
  other: 'Other',
};

// All available ad formats
export const ALL_AD_FORMATS: AdFormat[] = [
  'feed_image',
  'feed_video',
  'story_image',
  'story_video',
  'reels_video',
  'carousel_image',
  'carousel_video',
  'shorts_video',
  'display_image',
  'display_video',
  'other',
];

// Platform-specific available formats
export const PLATFORM_AD_FORMATS: Record<string, AdFormat[]> = {
  meta: ['feed_image', 'feed_video', 'story_image', 'story_video', 'reels_video', 'carousel_image', 'carousel_video', 'other'],
  tiktok: ['feed_video', 'carousel_image', 'other'],
  google: ['display_image', 'display_video', 'shorts_video', 'other'],
  snapchat: ['story_image', 'story_video', 'other'],
  linkedin: ['feed_image', 'feed_video', 'carousel_image', 'other'],
  pinterest: ['feed_image', 'carousel_image', 'other'],
  x: ['feed_image', 'feed_video', 'carousel_image', 'other'],
};

/**
 * Parse aspect ratio string to decimal
 */
function parseAspectRatio(ratio: string): number | null {
  if (!ratio) return null;
  
  // Handle "16:9" format
  if (ratio.includes(':')) {
    const [w, h] = ratio.split(':').map(Number);
    if (w && h) return w / h;
  }
  
  // Handle "1.91:1" format
  if (ratio.includes(':1')) {
    const w = parseFloat(ratio.replace(':1', ''));
    if (!isNaN(w)) return w;
  }
  
  return null;
}

/**
 * Calculate aspect ratio from dimensions
 */
function calculateAspectRatio(width: number, height: number): number {
  return width / height;
}

/**
 * Check if aspect ratio is vertical (9:16, 4:5, etc.)
 */
function isVertical(ratio: number): boolean {
  return ratio < 0.8; // Less than roughly 4:5
}

/**
 * Check if aspect ratio is square (1:1)
 */
function isSquare(ratio: number, tolerance: number = 0.05): boolean {
  return Math.abs(ratio - 1) <= tolerance;
}

/**
 * Check if aspect ratio matches 9:16 (vertical story/reels)
 */
function is916(ratio: number, tolerance: number = 0.05): boolean {
  const target = 9 / 16; // 0.5625
  return Math.abs(ratio - target) / target <= tolerance;
}

/**
 * Detect ad format based on dimensions, aspect ratio, and media type
 */
export function detectAdFormat(info: DimensionInfo): AdFormat {
  const { width, height, aspectRatio, mediaType, platform } = info;
  
  // Calculate ratio from dimensions or parse from string
  let ratio: number | null = null;
  
  if (width && height) {
    ratio = calculateAspectRatio(width, height);
  } else if (aspectRatio) {
    ratio = parseAspectRatio(aspectRatio);
  }
  
  // Default fallback based on media type
  if (!ratio) {
    return mediaType === 'video' ? 'feed_video' : 'feed_image';
  }
  
  // Platform-specific detection
  const platformLower = platform?.toLowerCase() || '';
  
  // TikTok - mostly vertical video
  if (platformLower === 'tiktok') {
    if (mediaType === 'video') {
      return 'feed_video';
    }
    return 'carousel_image';
  }
  
  // Google/YouTube
  if (platformLower === 'google' || platformLower === 'youtube') {
    if (mediaType === 'video') {
      if (is916(ratio)) {
        return 'shorts_video';
      }
      return 'display_video';
    }
    return 'display_image';
  }
  
  // Snapchat - all stories
  if (platformLower === 'snapchat') {
    return mediaType === 'video' ? 'story_video' : 'story_image';
  }
  
  // Meta/Facebook/Instagram
  if (mediaType === 'video') {
    // 9:16 vertical videos
    if (is916(ratio)) {
      // Could be story or reels - default to reels for videos
      return 'reels_video';
    }
    // Other aspect ratios
    return 'feed_video';
  }
  
  // Images
  if (is916(ratio)) {
    return 'story_image';
  }
  
  if (isSquare(ratio) || (ratio > 0.8 && ratio < 1.2)) {
    return 'feed_image';
  }
  
  if (isVertical(ratio)) {
    return 'story_image';
  }
  
  // Default to feed for landscape/other
  return 'feed_image';
}

/**
 * Get available ad formats for a platform
 */
export function getAvailableFormats(platform: string, mediaType: 'image' | 'video'): AdFormat[] {
  const platformLower = platform.toLowerCase();
  const formats = PLATFORM_AD_FORMATS[platformLower] || ALL_AD_FORMATS;
  
  return formats.filter(format => {
    if (mediaType === 'video') {
      return format.includes('video') || format === 'other';
    }
    return format.includes('image') || format.includes('carousel') || format === 'other';
  });
}

/**
 * Get format label for display
 */
export function getFormatLabel(format: AdFormat): string {
  return AD_FORMAT_LABELS[format] || format;
}
