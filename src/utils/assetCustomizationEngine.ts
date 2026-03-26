// Asset Customization Detection & Classification Engine
// Scans assigned creatives and identifies grouping opportunities for Meta asset_feed_spec
// Supports: Placement Customization, Language Customization, Flexible Creative

import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';

// ─── Delivery Bucket Classification ──────────────────────────────────────────

export type DeliveryBucket = 'square' | 'fullscreen_vertical' | 'horizontal' | 'vertical' | 'other';

export interface BucketInfo {
  bucket: DeliveryBucket;
  label: string;
  placements: string[];
  ratioRange: string;
}

export const DELIVERY_BUCKETS: Record<DeliveryBucket, BucketInfo> = {
  square: {
    bucket: 'square',
    label: 'Square (1:1)',
    placements: ['feed', 'marketplace', 'search', 'video_feeds'],
    ratioRange: '1:1',
  },
  fullscreen_vertical: {
    bucket: 'fullscreen_vertical',
    label: 'Fullscreen Vertical (9:16)',
    placements: ['story', 'reels'],
    ratioRange: '9:16',
  },
  horizontal: {
    bucket: 'horizontal',
    label: 'Horizontal (1.91:1)',
    placements: ['feed', 'right_column', 'instant_article', 'in_stream_video', 'search'],
    ratioRange: '1.91:1',
  },
  vertical: {
    bucket: 'vertical',
    label: 'Vertical (4:5)',
    placements: ['feed', 'video_feeds'],
    ratioRange: '4:5',
  },
  other: {
    bucket: 'other',
    label: 'Other',
    placements: [],
    ratioRange: 'Non-standard',
  },
};

/**
 * Classify a creative into a delivery bucket based on its dimensions.
 */
export function classifyDeliveryBucket(width?: number, height?: number, aspectRatio?: string): DeliveryBucket {
  let ratio: number | null = null;

  if (width && height && height > 0) {
    ratio = width / height;
  } else if (aspectRatio) {
    const parts = aspectRatio.split(':').map(Number);
    if (parts.length === 2 && parts[1] > 0) {
      ratio = parts[0] / parts[1];
    }
  }

  if (ratio === null) return 'other';

  // Fullscreen Vertical: 9:16 = 0.5625, tolerance ±0.05 → ratio ≤ 0.62
  if (ratio <= 0.62) return 'fullscreen_vertical';

  // Vertical: 4:5 = 0.8, range 0.62 < ratio ≤ 0.88
  if (ratio <= 0.88) return 'vertical';

  // Square: 1:1 = 1.0, range 0.88 < ratio ≤ 1.12
  if (ratio <= 1.12) return 'square';

  // Horizontal: 1.91:1 = 1.91, ratio > 1.12
  return 'horizontal';
}

// ─── Meta Placement Mapping ──────────────────────────────────────────────────

export const META_PLACEMENT_MAP: Record<DeliveryBucket, string[]> = {
  square: [
    'facebook_feed',
    'instagram_feed',
    'instagram_explore',
    'facebook_marketplace',
    'facebook_search',
  ],
  fullscreen_vertical: [
    'instagram_stories',
    'instagram_reels',
    'facebook_stories',
    'facebook_reels',
  ],
  horizontal: [
    'facebook_feed',
    'facebook_right_column',
    'facebook_instant_article',
    'facebook_instream_video',
    'audience_network_classic',
    'audience_network_rewarded_video',
  ],
  vertical: [
    'facebook_feed',
    'instagram_feed',
    'facebook_video_feeds',
  ],
  other: [],
};

// ─── Language Detection ──────────────────────────────────────────────────────

export const LANGUAGE_PATTERNS: Record<string, string> = {
  english: 'en', eng: 'en', en: 'en',
  arabic: 'ar', arab: 'ar', ar: 'ar',
  french: 'fr', fra: 'fr', fr: 'fr',
  german: 'de', deu: 'de', de: 'de',
  spanish: 'es', spa: 'es', es: 'es',
  portuguese: 'pt', por: 'pt', pt: 'pt',
  italian: 'it', ita: 'it', it: 'it',
  dutch: 'nl', nld: 'nl', nl: 'nl',
  turkish: 'tr', tur: 'tr', tr: 'tr',
  russian: 'ru', rus: 'ru', ru: 'ru',
  japanese: 'ja', jpn: 'ja', ja: 'ja',
  korean: 'ko', kor: 'ko', ko: 'ko',
  chinese: 'zh', zho: 'zh', zh: 'zh',
  hindi: 'hi', hin: 'hi', hi: 'hi',
};

export const LOCALE_MAP: Record<string, string> = {
  en: 'en_XX', ar: 'ar_AR', fr: 'fr_XX', de: 'de_DE',
  es: 'es_XX', pt: 'pt_XX', it: 'it_IT', nl: 'nl_NL',
  tr: 'tr_TR', ru: 'ru_RU', ja: 'ja_JP', ko: 'ko_KR',
  zh: 'zh_CN', hi: 'hi_IN',
};

/** All supported language codes for manual selection */
export const SUPPORTED_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'Arabic' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ru', label: 'Russian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'hi', label: 'Hindi' },
];

export function detectLanguage(row: CreativeTextAssetRow): string | null {
  const searchables = [
    row.folderPath || '',
    row.creativeName || '',
    row.originalFilename || '',
    (row as any).taxonomyAdName || '',
    (row as any).taxonomyAdSetName || '',
  ].join(' ').toLowerCase();

  for (const [token, code] of Object.entries(LANGUAGE_PATTERNS)) {
    const regex = new RegExp(`(^|[\\s_\\-./\\[\\]()])${token}($|[\\s_\\-./\\[\\]()])`, 'i');
    if (regex.test(searchables)) {
      return code;
    }
  }
  return null;
}

/**
 * Check if a group of rows contains indicators that suggest multi-language content.
 * 
 * IMPORTANT: Only checks taxonomy-level fields (ad set name, folder path) for
 * explicit multi-language markers like "All Languages" or "Multi Language".
 * We do NOT scan individual creative filenames because they often contain
 * format abbreviations (PT = Portrait, SQ = Square) that get falsely matched
 * as language codes.
 */
function hasMultiLanguageTaxonomyHint(rows: CreativeTextAssetRow[]): boolean {
  // Only check taxonomy-level fields — NOT individual creative filenames
  const taxonomySearchables = rows.map(r => [
    (r as any).taxonomyAdSetName || '',
    (r as any).taxonomyAdName || '',
    r.adSet || '',
  ].join(' ')).join(' ').toLowerCase();

  // Check for explicit multi-language markers in taxonomy/ad-set naming
  if (/all[\s_-]?lang/i.test(taxonomySearchables)) return true;
  if (/multi[\s_-]?lang/i.test(taxonomySearchables)) return true;
  if (/multiple[\s_-]?lang/i.test(taxonomySearchables)) return true;

  return false;
}

export function getLocale(langCode: string): string {
  return LOCALE_MAP[langCode] || `${langCode}_XX`;
}

// ─── Taxonomy Key Extraction ─────────────────────────────────────────────────

export function extractTaxonomyKey(row: CreativeTextAssetRow): string {
  return [
    row.platform,
    row.market,
    row.phase,
    row.adSet,
  ].join('|').toLowerCase();
}

// ─── Customization Type Classification ───────────────────────────────────────

export type CustomizationType = 'placement' | 'language' | 'flexible_creative';

export interface DetectedACGroup {
  id: string;
  type: CustomizationType;
  label: string;
  description: string;
  rows: CreativeTextAssetRow[];
  taxonomyKey: string;
  deliveryBuckets: Map<DeliveryBucket, CreativeTextAssetRow[]>;
  languages: Map<string, CreativeTextAssetRow[]>;
  /** For language mode: manually assigned languages per row id */
  manualLanguages?: Map<string, string>;
  validationErrors: string[];
}

/**
 * Core detection engine — scans assigned creatives and identifies grouping opportunities.
 * 
 * Auto-detection rules:
 * - Placement: Different delivery buckets in same ad set → auto-detected
 * - Language: Only if taxonomy/naming hints at multiple languages (e.g. "All Languages" or distinct lang tokens)
 * - Flexible: Same bucket, same language, 2+ assets → auto-detected
 * 
 * Language customization without taxonomy hints must be created manually.
 */
export function detectAssetCustomizationGroups(
  rows: CreativeTextAssetRow[],
  platform: string = 'meta'
): DetectedACGroup[] {
  if (platform.toLowerCase() !== 'meta') return [];

  const taxonomyGroups = new Map<string, CreativeTextAssetRow[]>();
  for (const row of rows) {
    if ((row as any).isOrganic || (row as any).externalPostId) continue;
    if (row.carouselGroupId) continue;

    const key = extractTaxonomyKey(row);
    if (!taxonomyGroups.has(key)) taxonomyGroups.set(key, []);
    taxonomyGroups.get(key)!.push(row);
  }

  const detected: DetectedACGroup[] = [];

  for (const [taxKey, groupRows] of taxonomyGroups) {
    if (groupRows.length < 2) continue;

    const bucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
    const languageMap = new Map<string, CreativeTextAssetRow[]>();

    for (const row of groupRows) {
      const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
      if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
      bucketMap.get(bucket)!.push(row);

      const lang = detectLanguage(row) || 'unknown';
      if (!languageMap.has(lang)) languageMap.set(lang, []);
      languageMap.get(lang)!.push(row);
    }

    const uniqueBuckets = new Set([...bucketMap.keys()].filter(b => b !== 'other'));
    const uniqueLanguages = new Set([...languageMap.keys()].filter(l => l !== 'unknown'));
    const hasDifferentBuckets = uniqueBuckets.size >= 2;
    const hasMultiLangHint = hasMultiLanguageTaxonomyHint(groupRows);

    // Priority 1: Different formats + multi-language hints = Flexible (both creative and text are dynamic)
    if (hasDifferentBuckets && hasMultiLangHint) {
      detected.push({
        id: `ac-flexible-${taxKey.replace(/[^a-z0-9]/gi, '-')}`,
        type: 'flexible_creative',
        label: `Flexible Creative`,
        description: `${groupRows.length} assets across ${uniqueBuckets.size} formats${uniqueLanguages.size >= 2 ? ` and ${uniqueLanguages.size} languages` : ''} — full AI optimization`,
        rows: groupRows,
        taxonomyKey: taxKey,
        deliveryBuckets: bucketMap,
        languages: languageMap,
        validationErrors: [],
      });
    }
    // Priority 2: Different formats, no language hint = Placement (same message, different creative sizes)
    else if (hasDifferentBuckets) {
      const errors = validatePlacementGroup(bucketMap);
      detected.push({
        id: `ac-placement-${taxKey.replace(/[^a-z0-9]/gi, '-')}`,
        type: 'placement',
        label: `Placement Customization`,
        description: `${uniqueBuckets.size} delivery buckets: ${[...uniqueBuckets].map(b => DELIVERY_BUCKETS[b].label).join(', ')}`,
        rows: groupRows,
        taxonomyKey: taxKey,
        deliveryBuckets: bucketMap,
        languages: languageMap,
        validationErrors: errors,
      });
    }
    // Priority 3: Same format + multi-language hint = Language (same creative, different text per locale)
    else if (hasMultiLangHint && !hasDifferentBuckets) {
      const errors = validateLanguageGroup(languageMap);
      detected.push({
        id: `ac-language-${taxKey.replace(/[^a-z0-9]/gi, '-')}`,
        type: 'language',
        label: `Language Customization`,
        description: `${uniqueLanguages.size || '?'} languages detected`,
        rows: groupRows,
        taxonomyKey: taxKey,
        deliveryBuckets: bucketMap,
        languages: languageMap,
        validationErrors: errors,
      });
    }
    // Priority 4: Same format, no language hint, 2+ variations = Flexible
    else if (groupRows.length >= 2) {
      const sameBucketRows = groupRows.filter(r => {
        const b = classifyDeliveryBucket(r.width, r.height, r.aspectRatio);
        return b !== 'other';
      });
      if (sameBucketRows.length >= 2) {
        detected.push({
          id: `ac-flexible-${taxKey.replace(/[^a-z0-9]/gi, '-')}`,
          type: 'flexible_creative',
          label: `Flexible Creative`,
          description: `${sameBucketRows.length} creative variations for dynamic optimization`,
          rows: sameBucketRows,
          taxonomyKey: taxKey,
          deliveryBuckets: bucketMap,
          languages: languageMap,
          validationErrors: [],
        });
      }
    }
  }

  return detected;
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validatePlacementGroup(bucketMap: Map<DeliveryBucket, CreativeTextAssetRow[]>): string[] {
  const errors: string[] = [];
  for (const [bucket, rows] of bucketMap) {
    if (bucket === 'other') continue;
    if (rows.length > 1) {
      errors.push(`${DELIVERY_BUCKETS[bucket].label}: ${rows.length} creatives found, only 1 allowed per delivery bucket`);
    }
  }
  return errors;
}

function validateLanguageGroup(languageMap: Map<string, CreativeTextAssetRow[]>): string[] {
  const errors: string[] = [];
  for (const [lang, rows] of languageMap) {
    if (lang === 'unknown') continue;
    if (rows.length > 1) {
      errors.push(`Language "${lang.toUpperCase()}": ${rows.length} creatives found, only 1 per language allowed`);
    }
  }
  return errors;
}

/**
 * Validate a manual selection for a specific customization type.
 * Unlike auto-detect, manual mode lets the user pick the type.
 */
export function validateACSelection(
  rows: CreativeTextAssetRow[],
  forcedType?: CustomizationType
): { valid: boolean; type: CustomizationType | null; errors: string[] } {
  if (rows.length < 2) return { valid: false, type: null, errors: ['At least 2 creatives required'] };

  // Must be same ad set
  const adSets = new Set(rows.map(r => `${r.platform}|${r.market}|${r.phase}|${r.adSet}`));
  if (adSets.size !== 1) return { valid: false, type: null, errors: ['All creatives must be in the same ad set'] };

  // Must be meta platform
  if (rows[0].platform.toLowerCase() !== 'meta') {
    return { valid: false, type: null, errors: ['Asset customization is currently only supported for Meta'] };
  }

  // Already in AC group?
  if (rows.some(r => r.assetCustomizationGroupId)) {
    return { valid: false, type: null, errors: ['One or more creatives already belong to an asset customization group'] };
  }

  if (forcedType === 'placement') {
    const bucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
    for (const row of rows) {
      const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
      if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
      bucketMap.get(bucket)!.push(row);
    }
    const uniqueBuckets = new Set([...bucketMap.keys()].filter(b => b !== 'other'));
    if (uniqueBuckets.size < 2) {
      return { valid: false, type: 'placement', errors: ['Placement customization requires at least 2 different delivery buckets (aspect ratios)'] };
    }
    const errors = validatePlacementGroup(bucketMap);
    return { valid: errors.length === 0, type: 'placement', errors };
  }

  if (forcedType === 'language') {
    // Language mode: always valid for manual — user will assign languages in the dialog
    return { valid: true, type: 'language', errors: [] };
  }

  if (forcedType === 'flexible_creative') {
    // Flexible: valid as long as 2+ creatives
    if (rows.length > 10) {
      return { valid: false, type: 'flexible_creative', errors: ['Flexible creative supports up to 10 media assets'] };
    }
    return { valid: true, type: 'flexible_creative', errors: [] };
  }

  // Auto-classify (legacy fallback)
  const bucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
  for (const row of rows) {
    const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
    if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
    bucketMap.get(bucket)!.push(row);
  }
  const uniqueBuckets = new Set([...bucketMap.keys()].filter(b => b !== 'other'));

  if (uniqueBuckets.size >= 2) {
    const errors = validatePlacementGroup(bucketMap);
    return { valid: errors.length === 0, type: 'placement', errors };
  }

  return { valid: true, type: 'flexible_creative', errors: [] };
}
