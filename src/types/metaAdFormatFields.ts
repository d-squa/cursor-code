// Meta Ads API field definitions per ad format
// Fields marked with `fromClientDefaults: true` should load from client info with user override

export interface AdFormatField {
  id: string;
  label: string;
  required: boolean;
  maxLength?: number;
  placeholder?: string;
  multiline?: boolean;
  fromClientDefaults?: boolean; // Load from client info, user can override
  defaultValue?: string;
  type?: 'text' | 'url' | 'select' | 'datetime' | 'boolean';
}

export type MetaAdFormat = 'single_image' | 'flexible' | 'carousel' | 'catalog';

// =============================================================================
// SINGLE IMAGE AD FIELDS
// Required: adset_id, ad_name, ad_status, website_url (or form_id), call_to_action
// =============================================================================
export const SINGLE_IMAGE_FIELDS: AdFormatField[] = [
  // Required fields
  { id: 'adset_id', label: 'Ad Set ID', required: true, type: 'text' },
  { id: 'ad_name', label: 'Ad Name', required: true, maxLength: 255, placeholder: 'Ad name' },
  { id: 'ad_status', label: 'Ad Status', required: true, type: 'select', defaultValue: 'PAUSED' },
  { id: 'website_url', label: 'Website URL', required: true, maxLength: 2000, placeholder: 'https://...', type: 'url', fromClientDefaults: true },
  { id: 'call_to_action', label: 'Call to Action', required: true, type: 'select', fromClientDefaults: true },
  
  // Optional media fields (populated from creative)
  { id: 'default_video_url', label: 'Default Video URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'default_thumbnail_url', label: 'Default Thumbnail URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'story_video_url', label: 'Story Video URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'story_thumbnail_url', label: 'Story Thumbnail URL', required: false, maxLength: 2000, type: 'url' },
  
  // Optional text fields - multiple variants for A/B testing
  { id: 'primary_text_1', label: 'Primary Text 1', required: false, maxLength: 500, multiline: true },
  { id: 'primary_text_2', label: 'Primary Text 2', required: false, maxLength: 500, multiline: true },
  { id: 'primary_text_3', label: 'Primary Text 3', required: false, maxLength: 500, multiline: true },
  { id: 'primary_text_4', label: 'Primary Text 4', required: false, maxLength: 500, multiline: true },
  { id: 'primary_text_5', label: 'Primary Text 5', required: false, maxLength: 500, multiline: true },
  { id: 'headline_1', label: 'Headline 1', required: false, maxLength: 255 },
  { id: 'headline_2', label: 'Headline 2', required: false, maxLength: 255 },
  { id: 'headline_3', label: 'Headline 3', required: false, maxLength: 255 },
  { id: 'headline_4', label: 'Headline 4', required: false, maxLength: 255 },
  { id: 'headline_5', label: 'Headline 5', required: false, maxLength: 255 },
  { id: 'title_1', label: 'Title 1', required: false, maxLength: 255 },
  { id: 'title_2', label: 'Title 2', required: false, maxLength: 255 },
  { id: 'title_3', label: 'Title 3', required: false, maxLength: 255 },
  { id: 'title_4', label: 'Title 4', required: false, maxLength: 255 },
  { id: 'title_5', label: 'Title 5', required: false, maxLength: 255 },
  { id: 'description', label: 'Description', required: false, maxLength: 125 },
  
  // Optional configuration
  { id: 'form_id', label: 'Lead Form ID', required: false, type: 'text' },
  { id: 'url_parameters', label: 'URL Parameters', required: false, maxLength: 2000, fromClientDefaults: true },
  { id: 'disable_creative_enhancements', label: 'Disable Creative Enhancements', required: false, type: 'boolean' },
  { id: 'disable_multi_advertiser_ads', label: 'Disable Multi-Advertiser Ads', required: false, type: 'boolean' },
  { id: 'ad_start_time', label: 'Ad Start Time', required: false, type: 'datetime' },
  { id: 'ad_end_time', label: 'Ad End Time', required: false, type: 'datetime' },
];

// =============================================================================
// FLEXIBLE AD FIELDS
// Required: adset_id, ad_name, ad_status, website_url, call_to_action
// =============================================================================
export const FLEXIBLE_AD_FIELDS: AdFormatField[] = [
  // Required fields
  { id: 'adset_id', label: 'Ad Set ID', required: true, type: 'text' },
  { id: 'ad_name', label: 'Ad Name', required: true, maxLength: 255, placeholder: 'Ad name' },
  { id: 'ad_status', label: 'Ad Status', required: true, type: 'select', defaultValue: 'PAUSED' },
  { id: 'website_url', label: 'Website URL', required: true, maxLength: 2000, placeholder: 'https://...', type: 'url', fromClientDefaults: true },
  { id: 'call_to_action', label: 'Call to Action', required: true, type: 'select', fromClientDefaults: true },
  
  // Optional media fields (up to 10 media assets)
  { id: 'media_1_url', label: 'Media 1 URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'media_2_url', label: 'Media 2 URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'media_3_url', label: 'Media 3 URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'media_4_url', label: 'Media 4 URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'media_5_url', label: 'Media 5 URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'media_6_url', label: 'Media 6 URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'media_7_url', label: 'Media 7 URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'media_8_url', label: 'Media 8 URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'media_9_url', label: 'Media 9 URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'media_10_url', label: 'Media 10 URL', required: false, maxLength: 2000, type: 'url' },
  
  // Optional text fields - multiple variants
  { id: 'primary_text_1', label: 'Primary Text 1', required: false, maxLength: 500, multiline: true },
  { id: 'primary_text_2', label: 'Primary Text 2', required: false, maxLength: 500, multiline: true },
  { id: 'primary_text_3', label: 'Primary Text 3', required: false, maxLength: 500, multiline: true },
  { id: 'primary_text_4', label: 'Primary Text 4', required: false, maxLength: 500, multiline: true },
  { id: 'primary_text_5', label: 'Primary Text 5', required: false, maxLength: 500, multiline: true },
  { id: 'headline_1', label: 'Headline 1', required: false, maxLength: 255 },
  { id: 'headline_2', label: 'Headline 2', required: false, maxLength: 255 },
  { id: 'headline_3', label: 'Headline 3', required: false, maxLength: 255 },
  { id: 'headline_4', label: 'Headline 4', required: false, maxLength: 255 },
  { id: 'headline_5', label: 'Headline 5', required: false, maxLength: 255 },
  { id: 'description_1', label: 'Description 1', required: false, maxLength: 125 },
  { id: 'description_2', label: 'Description 2', required: false, maxLength: 125 },
  { id: 'description_3', label: 'Description 3', required: false, maxLength: 125 },
  { id: 'description_4', label: 'Description 4', required: false, maxLength: 125 },
  { id: 'description_5', label: 'Description 5', required: false, maxLength: 125 },
  
  // Optional configuration
  { id: 'url_parameters', label: 'URL Parameters', required: false, maxLength: 2000, fromClientDefaults: true },
  { id: 'disable_creative_enhancements', label: 'Disable Creative Enhancements', required: false, type: 'boolean' },
  { id: 'disable_multi_advertiser_ads', label: 'Disable Multi-Advertiser Ads', required: false, type: 'boolean' },
  { id: 'ad_start_time', label: 'Ad Start Time', required: false, type: 'datetime' },
  { id: 'ad_end_time', label: 'Ad End Time', required: false, type: 'datetime' },
];

// =============================================================================
// CAROUSEL AD FIELDS
// Required: adset_id, ad_name, ad_status, primary_text, website_url
// Per-card required: card_X_website_url
// =============================================================================
export const CAROUSEL_AD_FIELDS: AdFormatField[] = [
  // Required fields
  { id: 'adset_id', label: 'Ad Set ID', required: true, type: 'text' },
  { id: 'ad_name', label: 'Ad Name', required: true, maxLength: 255, placeholder: 'Ad name' },
  { id: 'ad_status', label: 'Ad Status', required: true, type: 'select', defaultValue: 'PAUSED' },
  { id: 'primary_text', label: 'Primary Text', required: true, maxLength: 500, multiline: true },
  { id: 'website_url', label: 'Website URL', required: true, maxLength: 2000, placeholder: 'https://...', type: 'url', fromClientDefaults: true },
  
  // Optional configuration
  { id: 'form_id', label: 'Lead Form ID', required: false, type: 'text' },
  { id: 'disable_creative_enhancements', label: 'Disable Creative Enhancements', required: false, type: 'boolean' },
  { id: 'disable_multi_advertiser_ads', label: 'Disable Multi-Advertiser Ads', required: false, type: 'boolean' },
  { id: 'ad_start_time', label: 'Ad Start Time', required: false, type: 'datetime' },
  { id: 'ad_end_time', label: 'Ad End Time', required: false, type: 'datetime' },
];

// Carousel card fields (per-card, up to 10 cards)
export interface CarouselCardFieldSet {
  cardIndex: number; // 1-10
  fields: AdFormatField[];
}

export function getCarouselCardFields(cardIndex: number): AdFormatField[] {
  const prefix = `card_${cardIndex}_`;
  return [
    // Media fields (populated from creative assignment)
    { id: `${prefix}media_url`, label: `Card ${cardIndex} Media URL`, required: false, maxLength: 2000, type: 'url' },
    { id: `${prefix}story_media_url`, label: `Card ${cardIndex} Story Media URL`, required: false, maxLength: 2000, type: 'url' },
    // Text fields
    { id: `${prefix}headline`, label: `Card ${cardIndex} Headline`, required: false, maxLength: 40 },
    { id: `${prefix}description`, label: `Card ${cardIndex} Description`, required: false, maxLength: 25 },
    // Required per-card
    { id: `${prefix}website_url`, label: `Card ${cardIndex} Website URL`, required: true, maxLength: 2000, type: 'url', fromClientDefaults: true },
    { id: `${prefix}call_to_action`, label: `Card ${cardIndex} Call to Action`, required: false, type: 'select', fromClientDefaults: true },
  ];
}

// =============================================================================
// CATALOG AD FIELDS
// Required: adset_id, ad_name, ad_status, product_set_id, website_url, call_to_action
// =============================================================================
export const CATALOG_AD_FIELDS: AdFormatField[] = [
  // Required fields
  { id: 'adset_id', label: 'Ad Set ID', required: true, type: 'text' },
  { id: 'ad_name', label: 'Ad Name', required: true, maxLength: 255, placeholder: 'Ad name' },
  { id: 'ad_status', label: 'Ad Status', required: true, type: 'select', defaultValue: 'PAUSED' },
  { id: 'product_set_id', label: 'Product Set ID', required: true, type: 'text' },
  { id: 'website_url', label: 'Website URL', required: true, maxLength: 2000, placeholder: 'https://...', type: 'url', fromClientDefaults: true },
  { id: 'call_to_action', label: 'Call to Action', required: true, type: 'select', fromClientDefaults: true },
  
  // Optional catalog configuration
  { id: 'ad_type', label: 'Ad Type', required: false, type: 'select' },
  { id: 'carousel_card_type', label: 'Carousel Card Type', required: false, type: 'select' },
  { id: 'show_multiple_images', label: 'Show Multiple Images', required: false, type: 'boolean' },
  { id: 'multi_share_end_card', label: 'Multi Share End Card', required: false, type: 'boolean' },
  
  // Optional text fields
  { id: 'primary_text', label: 'Primary Text', required: false, maxLength: 500, multiline: true },
  { id: 'headline', label: 'Headline', required: false, maxLength: 255 },
  { id: 'description', label: 'Description', required: false, maxLength: 125 },
  
  // Optional static card (for hybrid carousel)
  { id: 'static_card_media_url', label: 'Static Card Media URL', required: false, maxLength: 2000, type: 'url' },
  { id: 'static_card_headline', label: 'Static Card Headline', required: false, maxLength: 40 },
  { id: 'static_card_description', label: 'Static Card Description', required: false, maxLength: 25 },
  
  // Optional configuration
  { id: 'url_parameters', label: 'URL Parameters', required: false, maxLength: 2000, fromClientDefaults: true },
  { id: 'disable_creative_enhancements', label: 'Disable Creative Enhancements', required: false, type: 'boolean' },
  { id: 'disable_multi_advertiser_ads', label: 'Disable Multi-Advertiser Ads', required: false, type: 'boolean' },
  { id: 'ad_start_time', label: 'Ad Start Time', required: false, type: 'datetime' },
  { id: 'ad_end_time', label: 'Ad End Time', required: false, type: 'datetime' },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getFieldsForAdFormat(format: MetaAdFormat): AdFormatField[] {
  switch (format) {
    case 'single_image':
      return SINGLE_IMAGE_FIELDS;
    case 'flexible':
      return FLEXIBLE_AD_FIELDS;
    case 'carousel':
      return CAROUSEL_AD_FIELDS;
    case 'catalog':
      return CATALOG_AD_FIELDS;
    default:
      return SINGLE_IMAGE_FIELDS;
  }
}

export function getRequiredFields(format: MetaAdFormat): AdFormatField[] {
  return getFieldsForAdFormat(format).filter(f => f.required);
}

export function getOptionalFields(format: MetaAdFormat): AdFormatField[] {
  return getFieldsForAdFormat(format).filter(f => !f.required);
}

export function getClientDefaultFields(format: MetaAdFormat): AdFormatField[] {
  return getFieldsForAdFormat(format).filter(f => f.fromClientDefaults);
}

// Fields that should be pre-populated from client/account defaults
export const CLIENT_DEFAULT_FIELD_IDS = [
  'website_url',
  'call_to_action', 
  'url_parameters',
  // Per-card website URLs for carousel
  'card_1_website_url',
  'card_2_website_url',
  'card_3_website_url',
  'card_4_website_url',
  'card_5_website_url',
  'card_6_website_url',
  'card_7_website_url',
  'card_8_website_url',
  'card_9_website_url',
  'card_10_website_url',
  // Per-card CTAs for carousel
  'card_1_call_to_action',
  'card_2_call_to_action',
  'card_3_call_to_action',
  'card_4_call_to_action',
  'card_5_call_to_action',
  'card_6_call_to_action',
  'card_7_call_to_action',
  'card_8_call_to_action',
  'card_9_call_to_action',
  'card_10_call_to_action',
] as const;
