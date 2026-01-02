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
}

export interface CarouselCard {
  assignmentId: string;
  creativeId: string;
  creativeName: string;
  thumbnailUrl?: string;
  mediaType: 'image' | 'video';
  position: number;
  // Card-level text assets
  headline?: string;
  description?: string;
  link?: string;
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
  { id: 'headline', label: 'Card Headline', required: false, maxLength: 40, placeholder: 'Card headline' },
  { id: 'description', label: 'Card Description', required: false, maxLength: 25, placeholder: 'Card description' },
  { id: 'destinationUrl', label: 'Card Link', required: true, maxLength: 2000, placeholder: 'https://...' },
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
