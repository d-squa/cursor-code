/**
 * DSP Creative Requirements
 * 
 * This file documents the required fields for creating ads on Meta and TikTok.
 * Use these specifications to validate creatives before attempting to push to DSPs.
 */

import { Creative, Platform, CreativeType, CallToAction } from '@/types/creative';

// ============= META AD CREATIVE REQUIREMENTS =============

export interface MetaAdCreativeRequirements {
  // Always required
  pageId: boolean;          // Facebook Page ID
  destinationUrl: boolean;  // Link destination
  
  // Media requirements (at least one required)
  imageHash?: boolean;      // For image ads
  videoId?: boolean;        // For video ads
  
  // Copy requirements
  primaryText: boolean;     // Main message text
  headline?: boolean;       // Title/headline
  description?: boolean;    // Additional description
  callToAction: boolean;    // CTA button type
  
  // Optional enhancements
  storyImage?: boolean;     // Separate image for Stories/Reels
  rightColumnImage?: boolean; // Separate image for Right Column
  urlParameters?: boolean;  // UTM tracking
}

// Meta ad format requirements by creative type
export const META_AD_REQUIREMENTS: Record<string, MetaAdCreativeRequirements> = {
  // Single Image Ad
  image: {
    pageId: true,
    destinationUrl: true,
    imageHash: true,
    primaryText: true,
    headline: true,
    callToAction: true,
  },
  
  // Single Video Ad
  video: {
    pageId: true,
    destinationUrl: true,
    videoId: true,
    primaryText: true,
    headline: true,
    callToAction: true,
  },
  
  // Carousel Ad
  carousel: {
    pageId: true,
    destinationUrl: true,
    primaryText: true,
    callToAction: true,
    // Each card needs: imageHash/videoId, link, headline
  },
  
  // Collection Ad
  collection: {
    pageId: true,
    destinationUrl: true,
    videoId: true, // Cover video/image required
    primaryText: true,
    headline: true,
    callToAction: true,
    // Requires instant_experience_id and catalog setup
  },
  
  // Dark Post (Unpublished Page Post)
  dark_post: {
    pageId: true,
    destinationUrl: true,
    primaryText: true,
    callToAction: true,
  },
  
  // Existing Post (Published Post)
  existing_post: {
    pageId: true,
    destinationUrl: false, // Uses post's original link
    primaryText: false,    // Uses post's original copy
    callToAction: false,   // Optional override
  },
};

// ============= TIKTOK AD CREATIVE REQUIREMENTS =============

export interface TikTokAdCreativeRequirements {
  // Always required
  advertiserId: boolean;
  adGroupId: boolean;
  adName: boolean;
  
  // Media requirements
  videoId?: boolean;        // For video ads (uploaded to TikTok)
  imageIds?: boolean;       // For image ads or thumbnails
  
  // Identity (one required)
  displayName?: boolean;    // Custom identity name
  identityId?: boolean;     // TikTok identity ID (for Spark Ads)
  
  // Copy requirements
  adText: boolean;          // Primary ad text
  callToAction?: boolean;   // CTA button
  landingPageUrl?: boolean; // Destination URL
  
  // Format
  adFormat: boolean;        // SINGLE_VIDEO, SINGLE_IMAGE, etc.
}

export const TIKTOK_AD_REQUIREMENTS: Record<string, TikTokAdCreativeRequirements> = {
  // Single Video Ad
  video: {
    advertiserId: true,
    adGroupId: true,
    adName: true,
    videoId: true,
    imageIds: true,  // Thumbnail required
    adText: true,
    adFormat: true,
    displayName: true,
    landingPageUrl: true,
  },
  
  // Single Image Ad
  image: {
    advertiserId: true,
    adGroupId: true,
    adName: true,
    imageIds: true,
    adText: true,
    adFormat: true,
    displayName: true,
    landingPageUrl: true,
  },
  
  // Carousel Ad (Image or Video cards)
  carousel: {
    advertiserId: true,
    adGroupId: true,
    adName: true,
    imageIds: true,  // Multiple images
    adText: true,
    adFormat: true,
    displayName: true,
    landingPageUrl: true,
  },
  
  // Spark Ad (Using existing TikTok post)
  spark: {
    advertiserId: true,
    adGroupId: true,
    adName: true,
    identityId: true,  // TikTok identity required
    adText: false,     // Uses post's original
    adFormat: true,
    landingPageUrl: false,
  },
};

// ============= TIKTOK AD FORMATS =============

export const TIKTOK_AD_FORMATS = {
  SINGLE_VIDEO: 'SINGLE_VIDEO',
  SINGLE_IMAGE: 'SINGLE_IMAGE',
  CAROUSEL: 'CAROUSEL',
  SPARK_AD: 'SPARK_AD',
  PLAYABLE: 'PLAYABLE',
  COLLECTION: 'COLLECTION',
} as const;

export type TikTokAdFormat = typeof TIKTOK_AD_FORMATS[keyof typeof TIKTOK_AD_FORMATS];

// ============= META CALL TO ACTION TYPES =============

export const META_CALL_TO_ACTIONS = [
  'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW',
  'CONTACT_US', 'GET_QUOTE', 'APPLY_NOW', 'SUBSCRIBE', 'ORDER_NOW',
  'GET_OFFER', 'WATCH_MORE', 'SEE_MENU', 'GET_DIRECTIONS', 'CALL_NOW',
  'SEND_MESSAGE', 'WHATSAPP_MESSAGE', 'INSTALL_APP', 'USE_APP', 'PLAY_GAME',
  'MESSAGE_PAGE', 'OPEN_LINK', 'BUY_NOW', 'DONATE_NOW', 'GET_STARTED',
] as const;

// ============= TIKTOK CALL TO ACTION TYPES =============

export const TIKTOK_CALL_TO_ACTIONS = [
  'LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'DOWNLOAD', 'CONTACT_US',
  'APPLY_NOW', 'BOOK_NOW', 'GET_QUOTE', 'SUBSCRIBE', 'ORDER_NOW',
  'VIEW_NOW', 'WATCH_NOW', 'PLAY_NOW', 'INSTALL_NOW', 'READ_MORE',
  'LISTEN_NOW', 'GET_STARTED', 'BUY_NOW', 'DONATE_NOW',
] as const;

// ============= VALIDATION FUNCTIONS =============

export interface ValidationResult {
  isValid: boolean;
  missingRequired: string[];
  warnings: string[];
  readyForUpload: boolean;
}

/**
 * Validate a creative for Meta ad creation
 */
export function validateCreativeForMeta(creative: Partial<Creative>): ValidationResult {
  const missingRequired: string[] = [];
  const warnings: string[] = [];
  
  const creativeType = creative.creativeType || 'dark_post';
  const requirements = META_AD_REQUIREMENTS[creativeType] || META_AD_REQUIREMENTS.dark_post;
  
  // Check page ID (from external references or will be set at push time)
  if (requirements.pageId && !creative.externalPageId) {
    warnings.push('Facebook Page ID will be required at push time');
  }
  
  // Check destination URL
  if (requirements.destinationUrl && !creative.destinationUrl) {
    missingRequired.push('Destination URL');
  }
  
  // Check media based on type
  if (requirements.imageHash && (!creative.mediaUrls || creative.mediaUrls.length === 0)) {
    missingRequired.push('Image file');
  }
  
  if (requirements.videoId && (!creative.mediaUrls || creative.mediaUrls.length === 0)) {
    missingRequired.push('Video file');
  }
  
  // Check copy
  if (requirements.primaryText && !creative.primaryText) {
    missingRequired.push('Primary text');
  }
  
  if (requirements.headline && !creative.headline) {
    warnings.push('Headline is recommended for better performance');
  }
  
  if (requirements.callToAction && !creative.callToAction) {
    warnings.push('Call to action is recommended');
  }
  
  // Check if media needs to be uploaded to Meta
  const readyForUpload = !creative.platformImageHash && 
    !creative.platformVideoId && 
    creative.mediaUrls && 
    creative.mediaUrls.length > 0;
  
  if (readyForUpload) {
    warnings.push('Media assets need to be uploaded to Meta before ad creation');
  }
  
  return {
    isValid: missingRequired.length === 0,
    missingRequired,
    warnings,
    readyForUpload: creative.dspUploadStatus === 'uploaded' || !!creative.platformImageHash || !!creative.platformVideoId,
  };
}

/**
 * Validate a creative for TikTok ad creation
 */
export function validateCreativeForTikTok(creative: Partial<Creative>): ValidationResult {
  const missingRequired: string[] = [];
  const warnings: string[] = [];
  
  const creativeType = creative.creativeType === 'existing_post' ? 'spark' : 
    creative.creativeType === 'video' ? 'video' : 'image';
  const requirements = TIKTOK_AD_REQUIREMENTS[creativeType] || TIKTOK_AD_REQUIREMENTS.video;
  
  // Check media
  if (requirements.videoId && (!creative.mediaUrls || creative.mediaUrls.length === 0)) {
    missingRequired.push('Video file');
  }
  
  if (requirements.imageIds && (!creative.mediaUrls || creative.mediaUrls.length === 0) && !creative.thumbnailUrl) {
    missingRequired.push('Image file or thumbnail');
  }
  
  // Check identity
  if (requirements.displayName && !creative.tiktokDisplayName && !creative.tiktokIdentityId) {
    missingRequired.push('TikTok display name or identity ID');
  }
  
  if (requirements.identityId && !creative.tiktokIdentityId) {
    missingRequired.push('TikTok identity ID (required for Spark Ads)');
  }
  
  // Check copy
  if (requirements.adText && !creative.primaryText) {
    missingRequired.push('Ad text (primary text)');
  }
  
  // Check destination
  if (requirements.landingPageUrl && !creative.destinationUrl) {
    missingRequired.push('Landing page URL');
  }
  
  // Check if media needs to be uploaded to TikTok
  if (!creative.platformVideoId && creative.creativeType === 'video') {
    warnings.push('Video needs to be uploaded to TikTok before ad creation');
  }
  
  return {
    isValid: missingRequired.length === 0,
    missingRequired,
    warnings,
    readyForUpload: creative.dspUploadStatus === 'uploaded' || !!creative.platformVideoId,
  };
}

/**
 * Validate a creative for any platform
 */
export function validateCreativeForPlatform(
  creative: Partial<Creative>, 
  platform: Platform
): ValidationResult {
  switch (platform) {
    case 'meta':
      return validateCreativeForMeta(creative);
    case 'tiktok':
      return validateCreativeForTikTok(creative);
    default:
      return {
        isValid: true,
        missingRequired: [],
        warnings: [`Validation not implemented for ${platform}`],
        readyForUpload: false,
      };
  }
}

/**
 * Get required fields for a creative type and platform
 */
export function getRequiredFields(
  platform: Platform, 
  creativeType: CreativeType
): string[] {
  const fields: string[] = [];
  
  if (platform === 'meta') {
    const requirements = META_AD_REQUIREMENTS[creativeType] || META_AD_REQUIREMENTS.dark_post;
    if (requirements.destinationUrl) fields.push('destinationUrl');
    if (requirements.primaryText) fields.push('primaryText');
    if (requirements.headline) fields.push('headline');
    if (requirements.callToAction) fields.push('callToAction');
    if (requirements.imageHash || requirements.videoId) fields.push('mediaUrls');
  } else if (platform === 'tiktok') {
    const type = creativeType === 'existing_post' ? 'spark' : 
      creativeType === 'video' ? 'video' : 'image';
    const requirements = TIKTOK_AD_REQUIREMENTS[type] || TIKTOK_AD_REQUIREMENTS.video;
    if (requirements.adText) fields.push('primaryText');
    if (requirements.landingPageUrl) fields.push('destinationUrl');
    if (requirements.displayName) fields.push('tiktokDisplayName');
    if (requirements.videoId || requirements.imageIds) fields.push('mediaUrls');
  }
  
  return fields;
}

/**
 * Build Meta object_story_spec from creative data
 */
export function buildMetaObjectStorySpec(
  creative: Partial<Creative>,
  pageId: string,
  instagramUserId?: string
): Record<string, unknown> {
  const isVideo = creative.creativeType === 'video' || 
    (creative.mediaUrls?.[0]?.includes('.mp4') || creative.mediaUrls?.[0]?.includes('.mov'));
  
  const baseSpec: Record<string, unknown> = {
    page_id: pageId,
  };
  
  if (instagramUserId) {
    baseSpec.instagram_user_id = instagramUserId;
  }
  
  if (isVideo) {
    // Video data
    baseSpec.video_data = {
      video_id: creative.platformVideoId,
      title: creative.headline,
      message: creative.primaryText,
      call_to_action: {
        type: creative.callToAction || 'LEARN_MORE',
        value: {
          link: creative.destinationUrl,
        },
      },
      image_url: creative.thumbnailUrl,
    };
  } else {
    // Link data (for images)
    const linkData: Record<string, unknown> = {
      link: creative.destinationUrl,
      message: creative.primaryText,
    };
    
    if (creative.platformImageHash) {
      linkData.image_hash = creative.platformImageHash;
    } else if (creative.mediaUrls?.[0]) {
      linkData.picture = creative.mediaUrls[0];
    }
    
    if (creative.headline) {
      linkData.name = creative.headline;
    }
    
    if (creative.description) {
      linkData.description = creative.description;
    }
    
    if (creative.callToAction) {
      linkData.call_to_action = {
        type: creative.callToAction,
      };
    }
    
    baseSpec.link_data = linkData;
  }
  
  return baseSpec;
}

/**
 * Build TikTok ad creative payload
 */
export function buildTikTokAdPayload(
  creative: Partial<Creative>,
  adGroupId: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    adgroup_id: adGroupId,
    ad_name: creative.name,
    ad_text: creative.primaryText,
    ad_format: creative.tiktokAdFormat || TIKTOK_AD_FORMATS.SINGLE_VIDEO,
    landing_page_url: creative.destinationUrl,
  };
  
  if (creative.platformVideoId) {
    payload.video_id = creative.platformVideoId;
  }
  
  if (creative.platformThumbnailId) {
    payload.image_ids = [creative.platformThumbnailId];
  }
  
  // Identity
  if (creative.tiktokIdentityId) {
    payload.identity_id = creative.tiktokIdentityId;
  } else if (creative.tiktokDisplayName) {
    payload.display_name = creative.tiktokDisplayName;
  }
  
  if (creative.callToAction) {
    payload.call_to_action = creative.callToAction;
  }
  
  return payload;
}
