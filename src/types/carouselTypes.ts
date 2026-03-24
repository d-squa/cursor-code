// Carousel linking types for Text Asset Editor
// Allows linking multiple creatives as carousel cards within an ad set

export interface CarouselLink {
  id: string;
  carouselName: string;
  adSetId: string;  // Must be within same ad set
  adSetName: string;
  platform: string;
  market: string;
  phase: string;
  cardIds: string[];  // Ordered list of creative assignment IDs
  cardData?: Record<string, CarouselCardData>;  // Keyed by card ID
}

export interface CarouselCard {
  assignmentId: string;
  creativeId: string;
  creativeName: string;
  thumbnailUrl?: string;
  mediaType: 'image' | 'video';
  position: number;
  // Card-level text assets
  cardHeadline?: string;
  cardDescription?: string;
  cardWebsiteUrl?: string;
  cardCallToAction?: string;
}

// Extended carousel link with card-level data
export interface CarouselCardData {
  cardHeadline?: string;
  cardDescription?: string;
  cardWebsiteUrl?: string;
  cardCallToAction?: string;
}

// Format-specific field configurations
export type FormatFieldSet = 'static' | 'video' | 'carousel_card';

export interface FormatFieldConfig {
  id: string;
  label: string;
  required: boolean;
  maxLength?: number;
  placeholder?: string;
  multiline?: boolean;
}

// Static image/video format fields
export const STATIC_FORMAT_FIELDS: FormatFieldConfig[] = [
  { id: 'primaryText', label: 'Primary Text', required: true, maxLength: 500, placeholder: 'Main ad copy...', multiline: true },
  { id: 'headline', label: 'Headline', required: false, maxLength: 255, placeholder: 'Headline' },
  { id: 'description', label: 'Description', required: false, maxLength: 125, placeholder: 'Description' },
];

// Video-specific fields (includes caption for overlay)
export const VIDEO_FORMAT_FIELDS: FormatFieldConfig[] = [
  { id: 'primaryText', label: 'Primary Text', required: true, maxLength: 500, placeholder: 'Main ad copy...', multiline: true },
  { id: 'headline', label: 'Headline', required: false, maxLength: 255, placeholder: 'Headline' },
  { id: 'description', label: 'Description', required: false, maxLength: 125, placeholder: 'Description' },
  { id: 'caption', label: 'Video Caption', required: false, maxLength: 150, placeholder: 'Optional overlay text...' },
];

// Carousel card fields (per-card within carousel)
export const CAROUSEL_CARD_FIELDS: FormatFieldConfig[] = [
  { id: 'cardHeadline', label: 'Card Headline', required: false, maxLength: 45, placeholder: 'Card headline (40-45 chars)' },
  { id: 'cardDescription', label: 'Card Description', required: false, maxLength: 18, placeholder: 'Card description (18 chars, Facebook only)' },
  { id: 'cardWebsiteUrl', label: 'Card Website URL', required: true, maxLength: 2000, placeholder: 'https://...' },
  { id: 'cardCallToAction', label: 'Card Call to Action', required: false, maxLength: 50, placeholder: 'LEARN_MORE' },
];

// Get fields based on format
export function getFieldsForFormat(mediaType: 'image' | 'video', isCarouselCard: boolean): FormatFieldConfig[] {
  if (isCarouselCard) {
    return CAROUSEL_CARD_FIELDS;
  }
  if (mediaType === 'video') {
    return VIDEO_FORMAT_FIELDS;
  }
  return STATIC_FORMAT_FIELDS;
}
