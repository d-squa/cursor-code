// Types for Creative Text Asset Editor
// Defines the structure for editing creative copy and metadata after matching

import type { CallToAction, Platform } from './creative';

export type CreativeFormat = 'image' | 'video' | 'carousel' | 'collection' | 'dark_post' | 'existing_post';

// Ad format types based on placement and dimensions
export type AdFormat = 
  | 'feed_image' 
  | 'feed_video' 
  | 'story_image' 
  | 'story_video' 
  | 'reels_video'
  | 'carousel_image'
  | 'carousel_video'
  | 'shorts_video'
  | 'display_image'
  | 'display_video'
  | 'other';

// Character limit configuration with warning threshold
export interface CharacterLimit {
  max: number;
  recommended?: number;
  warningThreshold?: number; // Percentage at which to show warning (e.g., 80 = 80%)
}

// Text asset fields configuration per format
export interface TextAssetFieldConfig {
  id: string;
  label: string;
  required: boolean;
  maxLength?: number;
  recommendedLength?: number;
  placeholder?: string;
  multiline?: boolean;
  helpText?: string;
  warningThreshold?: number; // 0-100, percentage
}

// Platform-specific text fields with character limits
export const PLATFORM_TEXT_FIELDS: Record<Platform, TextAssetFieldConfig[]> = {
  meta: [
    { id: 'primaryText', label: 'Primary Text', required: true, maxLength: 500, recommendedLength: 125, placeholder: 'Main ad copy...', multiline: true, helpText: 'Recommended: 125 chars, Max: 500', warningThreshold: 80 },
    { id: 'headline', label: 'Headline', required: false, maxLength: 255, recommendedLength: 40, placeholder: 'Headline', helpText: 'Recommended: 40 chars, Max: 255', warningThreshold: 80 },
    { id: 'description', label: 'Description', required: false, maxLength: 125, recommendedLength: 30, placeholder: 'Link description', helpText: 'Recommended: 30 chars, Max: 125', warningThreshold: 80 },
    { id: 'callToAction', label: 'Call to Action', required: true, placeholder: 'Select CTA' },
    { id: 'destinationUrl', label: 'Destination URL', required: true, maxLength: 2000, placeholder: 'https://' },
    { id: 'displayLink', label: 'Display Link', required: false, maxLength: 30, placeholder: 'yoursite.com', helpText: 'Max: 30 chars' },
  ],
  tiktok: [
    { id: 'primaryText', label: 'Ad Text', required: true, maxLength: 100, recommendedLength: 80, placeholder: 'Ad copy...', multiline: true, helpText: 'Max: 100 chars', warningThreshold: 90 },
    { id: 'callToAction', label: 'Call to Action', required: true, placeholder: 'Select CTA' },
    { id: 'destinationUrl', label: 'Destination URL', required: true, maxLength: 2000, placeholder: 'https://' },
    { id: 'displayName', label: 'Display Name', required: false, maxLength: 40, placeholder: 'Brand name', helpText: 'Max: 40 chars' },
  ],
  google: [
    { id: 'headline', label: 'Headline 1', required: true, maxLength: 30, recommendedLength: 25, placeholder: 'Headline 1', helpText: 'Up to 15 headlines, 30 chars each', warningThreshold: 85 },
    { id: 'headline2', label: 'Headline 2', required: false, maxLength: 30, placeholder: 'Headline 2', helpText: '30 chars max' },
    { id: 'headline3', label: 'Headline 3', required: false, maxLength: 30, placeholder: 'Headline 3', helpText: '30 chars max' },
    { id: 'headline4', label: 'Headline 4', required: false, maxLength: 30, placeholder: 'Headline 4', helpText: '30 chars max' },
    { id: 'headline5', label: 'Headline 5', required: false, maxLength: 30, placeholder: 'Headline 5', helpText: '30 chars max' },
    { id: 'primaryText', label: 'Long Headline', required: false, maxLength: 90, recommendedLength: 80, placeholder: 'Long headline for Demand Gen / PMax', multiline: true, helpText: 'Max: 90 chars. Used in Demand Gen & PMax', warningThreshold: 90 },
    { id: 'description', label: 'Description 1', required: true, maxLength: 90, recommendedLength: 80, placeholder: 'Description', multiline: true, helpText: 'Up to 4 descriptions, 90 chars each', warningThreshold: 90 },
    { id: 'description2', label: 'Description 2', required: false, maxLength: 90, placeholder: 'Description 2', multiline: true, helpText: '90 chars max' },
    { id: 'description3', label: 'Description 3', required: false, maxLength: 90, placeholder: 'Description 3', multiline: true, helpText: '90 chars max' },
    { id: 'description4', label: 'Description 4', required: false, maxLength: 90, placeholder: 'Description 4', multiline: true, helpText: '90 chars max' },
    { id: 'brandName', label: 'Business Name', required: false, maxLength: 25, placeholder: 'Your Business', helpText: 'Required for PMax & Demand Gen. Max: 25 chars' },
    { id: 'callToAction', label: 'Call to Action', required: false, placeholder: 'Select CTA', helpText: 'Optional for some campaign types' },
    { id: 'destinationUrl', label: 'Final URL', required: true, maxLength: 2000, placeholder: 'https://' },
    { id: 'displayPath', label: 'Display Path', required: false, maxLength: 15, placeholder: 'path', helpText: 'Max: 15 chars per path segment' },
    { id: 'overrideLandingPageUrl', label: 'Sitelink URL', required: false, maxLength: 2000, placeholder: 'https://example.com/page', helpText: 'Sitelink extension destination' },
    { id: 'displayLink', label: 'Sitelink Title', required: false, maxLength: 25, placeholder: 'Sitelink title', helpText: 'Max: 25 chars' },
  ],
  linkedin: [
    { id: 'primaryText', label: 'Introductory Text', required: true, maxLength: 600, recommendedLength: 150, placeholder: 'Ad text...', multiline: true, helpText: 'Recommended: 150 chars, Max: 600', warningThreshold: 75 },
    { id: 'headline', label: 'Headline', required: true, maxLength: 200, recommendedLength: 70, placeholder: 'Headline', helpText: 'Recommended: 70 chars, Max: 200', warningThreshold: 80 },
    { id: 'description', label: 'Description', required: false, maxLength: 300, recommendedLength: 100, placeholder: 'Description', helpText: 'Max: 300 chars' },
    { id: 'callToAction', label: 'Call to Action', required: true, placeholder: 'Select CTA' },
    { id: 'destinationUrl', label: 'Destination URL', required: true, maxLength: 2000, placeholder: 'https://' },
  ],
  snapchat: [
    { id: 'headline', label: 'Headline', required: true, maxLength: 34, recommendedLength: 30, placeholder: 'Headline', helpText: 'Max: 34 chars', warningThreshold: 88 },
    { id: 'brandName', label: 'Brand Name', required: true, maxLength: 25, placeholder: 'Brand', helpText: 'Max: 25 chars' },
    { id: 'callToAction', label: 'Call to Action', required: true, placeholder: 'Select CTA' },
    { id: 'destinationUrl', label: 'Website URL', required: true, maxLength: 2000, placeholder: 'https://' },
  ],
  pinterest: [
    { id: 'primaryText', label: 'Pin Title', required: true, maxLength: 100, recommendedLength: 60, placeholder: 'Title', helpText: 'Max: 100 chars', warningThreshold: 80 },
    { id: 'description', label: 'Pin Description', required: false, maxLength: 500, recommendedLength: 200, placeholder: 'Description', multiline: true, helpText: 'Max: 500 chars' },
    { id: 'destinationUrl', label: 'Destination Link', required: true, maxLength: 2000, placeholder: 'https://' },
  ],
  x: [
    { id: 'primaryText', label: 'Tweet Text', required: true, maxLength: 280, recommendedLength: 250, placeholder: 'Tweet...', multiline: true, helpText: 'Max: 280 chars', warningThreshold: 89 },
    { id: 'headline', label: 'Card Title', required: false, maxLength: 70, recommendedLength: 50, placeholder: 'Title', helpText: 'Max: 70 chars' },
    { id: 'description', label: 'Card Description', required: false, maxLength: 200, recommendedLength: 100, placeholder: 'Description', helpText: 'Max: 200 chars' },
    { id: 'destinationUrl', label: 'Website URL', required: true, maxLength: 2000, placeholder: 'https://' },
  ],
};

// Available CTAs per platform
export const PLATFORM_CTAS: Record<Platform, CallToAction[]> = {
  meta: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW', 'CONTACT_US', 'GET_QUOTE', 'APPLY_NOW', 'SUBSCRIBE', 'ORDER_NOW', 'GET_OFFER', 'WATCH_MORE', 'SEE_MENU', 'GET_DIRECTIONS', 'SEND_MESSAGE', 'WHATSAPP_MESSAGE', 'INSTALL_APP', 'USE_APP', 'PLAY_GAME'],
  tiktok: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW', 'CONTACT_US', 'APPLY_NOW', 'SUBSCRIBE', 'ORDER_NOW', 'WATCH_MORE', 'INSTALL_APP', 'PLAY_GAME'],
  google: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW', 'CONTACT_US', 'GET_QUOTE', 'APPLY_NOW', 'SUBSCRIBE'],
  linkedin: ['LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'APPLY_NOW', 'SUBSCRIBE', 'GET_QUOTE', 'CONTACT_US'],
  snapchat: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'BOOK_NOW', 'INSTALL_APP', 'WATCH_MORE'],
  pinterest: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD'],
  x: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'DOWNLOAD', 'INSTALL_APP'],
};

// Creative text asset row for the spreadsheet editor
export interface CreativeTextAssetRow {
  id: string;
  creativeId: string;
  assignmentId: string;
  
  // Structure hierarchy
  platform: string;
  market: string;
  phase: string;
  adSet: string;
  creativeName: string;
  originalFilename?: string;
  folderPath?: string;
  creativeFormat: CreativeFormat;
  
  // Taxonomy names for ads manager upload
  taxonomyCampaignName?: string;
  taxonomyAdSetName?: string;
  taxonomyAdName?: string;
  
  // Ad format (suggested based on dimensions)
  adFormat: AdFormat;
  suggestedAdFormat?: AdFormat;
  adFormatConfirmed?: boolean;
  
  // Text assets
  primaryText: string;
  primaryText2?: string;
  primaryText3?: string;
  primaryText4?: string;
  primaryText5?: string;
  primaryTextAr?: string;
  headline: string;
  headline2?: string;
  headline3?: string;
  headline4?: string;
  headline5?: string;
  headlineAr?: string;
  description: string;
  description2?: string;
  description3?: string;
  description4?: string;
  description5?: string;
  descriptionAr?: string;
  caption?: string;
  captionAr?: string;
  brandName?: string;
  callToAction: CallToAction | string;
  
  // URLs and tracking
  destinationUrl: string;
  overrideLandingPageUrl?: string;
  autoBuildUtm: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  clickTracker?: string;
  impressionTracker?: string;
  
  // Display options
  displayLink?: string;
  displayPath?: string;
  displayName?: string;
  
  // Validation
  isValid: boolean;
  validationErrors: string[];
  
  // Metadata
  thumbnailUrl?: string;
  mediaType: 'image' | 'video';
  aspectRatio?: string;
  width?: number;
  height?: number;
  
  // TikTok-specific
  platformThumbnailId?: string;
  tiktokAdvertiserId?: string;
  
  // Page/Identity info for publishing
  pageId?: string;
  pageName?: string;
  
  // Organic post indicators
  isOrganic?: boolean;
  externalPostId?: string;
  externalPageId?: string;
  organicMessage?: string;
  organicPermalink?: string;
  
  // Creative processing groups
  // A row can belong to both a carousel group and an asset customization group.
  carouselGroupId?: string;
  assetCustomizationGroupId?: string;
  // Legacy single-group fields kept for backward compatibility with older editor flows.
  processingGroupId?: string;
  processingGroupType?: 'carousel' | 'asset_customization';
}

// UTM Builder config
export interface UtmConfig {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
}

// Build final URL with UTM params
export function buildUrlWithUtm(baseUrl: string, utm: UtmConfig): string {
  if (!baseUrl) return '';
  try {
    const url = new URL(baseUrl);
    if (utm.source) url.searchParams.set('utm_source', utm.source);
    if (utm.medium) url.searchParams.set('utm_medium', utm.medium);
    if (utm.campaign) url.searchParams.set('utm_campaign', utm.campaign);
    if (utm.content) url.searchParams.set('utm_content', utm.content);
    if (utm.term) url.searchParams.set('utm_term', utm.term);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

// Auto-generate UTM values from row context
export function generateAutoUtm(row: CreativeTextAssetRow): UtmConfig {
  return {
    source: row.platform.toLowerCase(),
    medium: 'paid_social',
    campaign: `${row.market}_${row.phase}`.toLowerCase().replace(/\s+/g, '_'),
    content: row.adSet.toLowerCase().replace(/\s+/g, '_'),
    term: row.creativeName.toLowerCase().replace(/\s+/g, '_'),
  };
}

// Get character count status for visual feedback
export function getCharacterStatus(value: string, field: TextAssetFieldConfig): 'ok' | 'warning' | 'error' | 'over' {
  if (!field.maxLength) return 'ok';
  
  const length = value?.length || 0;
  const max = field.maxLength;
  const threshold = field.warningThreshold || 80;
  
  if (length > max) return 'over';
  if (field.recommendedLength && length > field.recommendedLength) return 'warning';
  if (length >= (max * threshold / 100)) return 'warning';
  return 'ok';
}

// Carousel card-level required fields per platform
// Carousel cards only need card-level metadata; ad-level fields like primary text
// are set once on the carousel wrapper, not per card.
const CAROUSEL_CARD_FIELDS: Record<Platform, TextAssetFieldConfig[]> = {
  meta: [
    { id: 'headline', label: 'Card Headline', required: false, maxLength: 255, recommendedLength: 40, placeholder: 'Headline' },
    { id: 'description', label: 'Card Description', required: false, maxLength: 125, placeholder: 'Description' },
    { id: 'destinationUrl', label: 'Card Website URL', required: false, maxLength: 2000, placeholder: 'https://' },
    { id: 'callToAction', label: 'Card CTA', required: false, placeholder: 'Select CTA' },
  ],
  tiktok: [
    { id: 'destinationUrl', label: 'Card URL', required: false, maxLength: 2000, placeholder: 'https://' },
  ],
  google: [
    { id: 'headline', label: 'Card Headline', required: false, maxLength: 30, placeholder: 'Headline' },
    { id: 'destinationUrl', label: 'Card URL', required: false, maxLength: 2000, placeholder: 'https://' },
  ],
  linkedin: [
    { id: 'headline', label: 'Card Headline', required: false, maxLength: 200, placeholder: 'Headline' },
    { id: 'destinationUrl', label: 'Card URL', required: true, maxLength: 2000, placeholder: 'https://' },
  ],
  snapchat: [
    { id: 'headline', label: 'Card Headline', required: false, maxLength: 34, placeholder: 'Headline' },
    { id: 'destinationUrl', label: 'Card URL', required: false, maxLength: 2000, placeholder: 'https://' },
  ],
  pinterest: [
    { id: 'destinationUrl', label: 'Card URL', required: false, maxLength: 2000, placeholder: 'https://' },
  ],
  x: [
    { id: 'headline', label: 'Card Title', required: false, maxLength: 70, placeholder: 'Title' },
    { id: 'destinationUrl', label: 'Card URL', required: false, maxLength: 2000, placeholder: 'https://' },
  ],
};

// Validate a text asset row based on platform requirements
// Organic posts bypass validation since their content comes from the platform
// Carousel cards use a reduced set of card-level requirements
export function validateTextAssetRow(row: CreativeTextAssetRow): string[] {
  // Skip validation for organic posts - they are read-only and use platform content
  if (row.isOrganic || row.externalPostId) {
    return [];
  }

  const errors: string[] = [];
  const platform = row.platform.toLowerCase() as Platform;

  // Carousel cards have different requirements — only card-level fields matter.
  // Ad-level fields (primary text, etc.) are set on the carousel wrapper.
  const isCarouselCard = !!row.carouselGroupId;
  // Asset customization group members are validated at the group level
  const isAssetCustomizationMember = !!row.assetCustomizationGroupId;

  // Asset customization members and carousel cards skip ad-level validation —
  // their text assets are managed inside the group editor.
  const fields = (isCarouselCard || isAssetCustomizationMember)
    ? (CAROUSEL_CARD_FIELDS[platform] || CAROUSEL_CARD_FIELDS.meta)
    : (PLATFORM_TEXT_FIELDS[platform] || PLATFORM_TEXT_FIELDS.meta);

  for (const field of fields) {
    const value = (row as any)[field.id];
    
    if (field.required && !value) {
      errors.push(`${field.label} is required`);
    }
    
    if (value && field.maxLength && String(value).length > field.maxLength) {
      errors.push(`${field.label} exceeds ${field.maxLength} characters (${String(value).length}/${field.maxLength})`);
    }
  }
  
  // URL validation (only when URLs are provided)
  if (row.destinationUrl && !row.destinationUrl.startsWith('http')) {
    errors.push('Destination URL must start with http:// or https://');
  }
  
  if (row.overrideLandingPageUrl && !row.overrideLandingPageUrl.startsWith('http')) {
    errors.push('Override URL must start with http:// or https://');
  }
  
  return errors;
}
