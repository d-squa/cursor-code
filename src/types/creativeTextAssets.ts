// Types for Creative Text Asset Editor
// Defines the structure for editing creative copy and metadata after matching

import type { CallToAction, Platform } from './creative';

export type CreativeFormat = 'image' | 'video' | 'carousel' | 'collection' | 'dark_post' | 'existing_post';

// Text asset fields configuration per format
export interface TextAssetFieldConfig {
  id: string;
  label: string;
  required: boolean;
  maxLength?: number;
  placeholder?: string;
  multiline?: boolean;
  helpText?: string;
}

// Platform-specific text fields
export const PLATFORM_TEXT_FIELDS: Record<Platform, TextAssetFieldConfig[]> = {
  meta: [
    { id: 'primaryText', label: 'Primary Text', required: true, maxLength: 125, placeholder: 'Main ad copy...', multiline: true, helpText: 'Recommended: 125 chars' },
    { id: 'headline', label: 'Headline', required: false, maxLength: 40, placeholder: 'Headline', helpText: 'Recommended: 40 chars' },
    { id: 'description', label: 'Description', required: false, maxLength: 30, placeholder: 'Link description', helpText: 'Recommended: 30 chars' },
    { id: 'callToAction', label: 'Call to Action', required: true, placeholder: 'Select CTA' },
    { id: 'destinationUrl', label: 'Destination URL', required: true, placeholder: 'https://' },
    { id: 'displayLink', label: 'Display Link', required: false, maxLength: 30, placeholder: 'yoursite.com' },
  ],
  tiktok: [
    { id: 'primaryText', label: 'Ad Text', required: true, maxLength: 100, placeholder: 'Ad copy...', multiline: true, helpText: 'Max: 100 chars' },
    { id: 'callToAction', label: 'Call to Action', required: true, placeholder: 'Select CTA' },
    { id: 'destinationUrl', label: 'Destination URL', required: true, placeholder: 'https://' },
    { id: 'displayName', label: 'Display Name', required: false, maxLength: 40, placeholder: 'Brand name' },
  ],
  google: [
    { id: 'headline', label: 'Headlines', required: true, maxLength: 30, placeholder: 'Headline 1', helpText: 'Up to 15 headlines, 30 chars each' },
    { id: 'description', label: 'Descriptions', required: true, maxLength: 90, placeholder: 'Description', multiline: true, helpText: 'Up to 4 descriptions, 90 chars each' },
    { id: 'destinationUrl', label: 'Final URL', required: true, placeholder: 'https://' },
    { id: 'displayPath', label: 'Display Path', required: false, maxLength: 15, placeholder: 'path' },
  ],
  linkedin: [
    { id: 'primaryText', label: 'Introductory Text', required: true, maxLength: 600, placeholder: 'Ad text...', multiline: true, helpText: 'Recommended: 150 chars' },
    { id: 'headline', label: 'Headline', required: true, maxLength: 200, placeholder: 'Headline', helpText: 'Recommended: 70 chars' },
    { id: 'description', label: 'Description', required: false, maxLength: 300, placeholder: 'Description' },
    { id: 'callToAction', label: 'Call to Action', required: true, placeholder: 'Select CTA' },
    { id: 'destinationUrl', label: 'Destination URL', required: true, placeholder: 'https://' },
  ],
  snapchat: [
    { id: 'headline', label: 'Headline', required: true, maxLength: 34, placeholder: 'Headline', helpText: 'Max: 34 chars' },
    { id: 'brandName', label: 'Brand Name', required: true, maxLength: 25, placeholder: 'Brand' },
    { id: 'callToAction', label: 'Call to Action', required: true, placeholder: 'Select CTA' },
    { id: 'destinationUrl', label: 'Website URL', required: true, placeholder: 'https://' },
  ],
  pinterest: [
    { id: 'primaryText', label: 'Pin Title', required: true, maxLength: 100, placeholder: 'Title' },
    { id: 'description', label: 'Pin Description', required: false, maxLength: 500, placeholder: 'Description', multiline: true },
    { id: 'destinationUrl', label: 'Destination Link', required: true, placeholder: 'https://' },
  ],
  x: [
    { id: 'primaryText', label: 'Tweet Text', required: true, maxLength: 280, placeholder: 'Tweet...', multiline: true },
    { id: 'headline', label: 'Card Title', required: false, maxLength: 70, placeholder: 'Title' },
    { id: 'description', label: 'Card Description', required: false, maxLength: 200, placeholder: 'Description' },
    { id: 'destinationUrl', label: 'Website URL', required: true, placeholder: 'https://' },
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
  creativeFormat: CreativeFormat;
  
  // Text assets
  primaryText: string;
  primaryTextAr?: string;
  headline: string;
  headlineAr?: string;
  description: string;
  descriptionAr?: string;
  caption?: string;
  captionAr?: string;
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
  brandName?: string;
  
  // Validation
  isValid: boolean;
  validationErrors: string[];
  
  // Metadata
  thumbnailUrl?: string;
  mediaType: 'image' | 'video';
  aspectRatio?: string;
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

// Validate a text asset row based on platform requirements
export function validateTextAssetRow(row: CreativeTextAssetRow): string[] {
  const errors: string[] = [];
  const platform = row.platform.toLowerCase() as Platform;
  const fields = PLATFORM_TEXT_FIELDS[platform] || PLATFORM_TEXT_FIELDS.meta;
  
  for (const field of fields) {
    const value = (row as any)[field.id];
    
    if (field.required && !value) {
      errors.push(`${field.label} is required`);
    }
    
    if (value && field.maxLength && String(value).length > field.maxLength) {
      errors.push(`${field.label} exceeds ${field.maxLength} characters`);
    }
  }
  
  // URL validation
  if (row.destinationUrl && !row.destinationUrl.startsWith('http')) {
    errors.push('Destination URL must start with http:// or https://');
  }
  
  if (row.overrideLandingPageUrl && !row.overrideLandingPageUrl.startsWith('http')) {
    errors.push('Override URL must start with http:// or https://');
  }
  
  return errors;
}
