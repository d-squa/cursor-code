// Asset Customization Detection & Classification Engine
// Scans assigned creatives and identifies grouping opportunities for Meta asset_feed_spec
// Supports: Placement Customization, Language Customization, Flexible Creative

import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';

// ─── Delivery Bucket Classification ──────────────────────────────────────────

export type DeliveryBucket = 'vertical' | 'square' | 'landscape' | 'other';

export interface BucketInfo {
  bucket: DeliveryBucket;
  label: string;
  placements: string[];
  ratioRange: string;
}

export const DELIVERY_BUCKETS: Record<DeliveryBucket, BucketInfo> = {
  vertical: {
    bucket: 'vertical',
    label: 'Vertical (9:16)',
    placements: ['story', 'reels', 'tiktok_feed'],
    ratioRange: '9:16',
  },
  square: {
    bucket: 'square',
    label: 'Square / Portrait (1:1, 4:5)',
    placements: ['feed', 'marketplace', 'search', 'video_feeds'],
    ratioRange: '1:1 – 4:5',
  },
  landscape: {
    bucket: 'landscape',
    label: 'Landscape (1.91:1, 16:9)',
    placements: ['feed', 'right_column', 'instant_article', 'in_stream_video', 'search'],
    ratioRange: '16:9 – 1.91:1',
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

  // Vertical: ratio ≤ 0.65 (covers 9:16 = 0.5625)
  if (ratio <= 0.65) return 'vertical';

  // Square/Portrait: 0.65 < ratio ≤ 1.1 (covers 4:5 = 0.8, 1:1 = 1.0)
  if (ratio <= 1.1) return 'square';

  // Landscape: ratio > 1.1 (covers 16:9 = 1.78, 1.91:1)
  return 'landscape';
}

// ─── Meta Placement Mapping ──────────────────────────────────────────────────

export const META_PLACEMENT_MAP: Record<DeliveryBucket, string[]> = {
  vertical: [
    'instagram_stories',
    'instagram_reels',
    'facebook_stories',
    'facebook_reels',
  ],
  square: [
    'facebook_feed',
    'instagram_feed',
    'instagram_explore',
    'facebook_marketplace',
    'facebook_video_feeds',
    'facebook_search',
  ],
  landscape: [
    'facebook_feed',
    'facebook_right_column',
    'facebook_instant_article',
    'facebook_instream_video',
    'audience_network_classic',
    'audience_network_rewarded_video',
  ],
  other: [],
};

// ─── Language Detection ──────────────────────────────────────────────────────

const LANGUAGE_PATTERNS: Record<string, string> = {
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

const LOCALE_MAP: Record<string, string> = {
  en: 'en_XX', ar: 'ar_AR', fr: 'fr_XX', de: 'de_DE',
  es: 'es_XX', pt: 'pt_XX', it: 'it_IT', nl: 'nl_NL',
  tr: 'tr_TR', ru: 'ru_RU', ja: 'ja_JP', ko: 'ko_KR',
  zh: 'zh_CN', hi: 'hi_IN',
};

export function detectLanguage(row: CreativeTextAssetRow): string | null {
  // Check taxonomy fields, folder path, creative name for language hints
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

export function getLocale(langCode: string): string {
  return LOCALE_MAP[langCode] || `${langCode}_XX`;
}

// ─── Taxonomy Key Extraction ─────────────────────────────────────────────────

/**
 * Extract a taxonomy key that represents the "same campaign/message" grouping.
 * Used to identify creatives that are variations of the same concept.
 */
export function extractTaxonomyKey(row: CreativeTextAssetRow): string {
  return [
    row.platform,
    row.market,
    row.phase,
    row.adSet,
  ].join('|').toLowerCase();
}

/**
 * Extract a "base creative name" by stripping format/language/dimension suffixes.
 */
function extractBaseCreativeName(name: string): string {
  return name
    .replace(/\.[^/.]+$/, '') // extension
    .replace(/[-_]?\d{2,4}x\d{2,4}/gi, '') // dimensions
    .replace(/[-_]?(1x1|4x5|9x16|16x9|1_1|4_5|9_16|16_9|square|portrait|landscape|vertical|horizontal)/gi, '')
    .replace(/[-_]?(en|ar|fr|de|es|pt|it|nl|tr|ru|ja|ko|zh|hi|english|arabic|french|german|spanish)(\b|[-_])/gi, '')
    .replace(/[-_\s]+$/g, '')
    .trim()
    .toLowerCase();
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
  validationErrors: string[];
}

/**
 * Core detection engine — scans assigned creatives and identifies grouping opportunities.
 * Returns detected groups with classified customization types.
 */
export function detectAssetCustomizationGroups(
  rows: CreativeTextAssetRow[],
  platform: string = 'meta'
): DetectedACGroup[] {
  if (platform.toLowerCase() !== 'meta') return []; // Only Meta for now

  // Group by taxonomy key (same campaign structure)
  const taxonomyGroups = new Map<string, CreativeTextAssetRow[]>();
  for (const row of rows) {
    // Skip organic posts and already-grouped carousels
    if ((row as any).isOrganic || (row as any).externalPostId) continue;
    if (row.carouselGroupId) continue;

    const key = extractTaxonomyKey(row);
    if (!taxonomyGroups.has(key)) taxonomyGroups.set(key, []);
    taxonomyGroups.get(key)!.push(row);
  }

  const detected: DetectedACGroup[] = [];

  for (const [taxKey, groupRows] of taxonomyGroups) {
    if (groupRows.length < 2) continue;

    // Classify each row into delivery bucket and language
    const bucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
    const languageMap = new Map<string, CreativeTextAssetRow[]>();
    const baseNameMap = new Map<string, CreativeTextAssetRow[]>();

    for (const row of groupRows) {
      const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
      if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
      bucketMap.get(bucket)!.push(row);

      const lang = detectLanguage(row) || 'unknown';
      if (!languageMap.has(lang)) languageMap.set(lang, []);
      languageMap.get(lang)!.push(row);

      const baseName = extractBaseCreativeName(row.creativeName);
      if (!baseNameMap.has(baseName)) baseNameMap.set(baseName, []);
      baseNameMap.get(baseName)!.push(row);
    }

    const uniqueBuckets = new Set([...bucketMap.keys()].filter(b => b !== 'other'));
    const uniqueLanguages = new Set([...languageMap.keys()].filter(l => l !== 'unknown'));
    const hasDifferentBuckets = uniqueBuckets.size >= 2;
    const hasDifferentLanguages = uniqueLanguages.size >= 2;

    // Classify: ONE type only per the spec
    if (hasDifferentBuckets && !hasDifferentLanguages) {
      // PLACEMENT CUSTOMIZATION
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
    } else if (hasDifferentLanguages && !hasDifferentBuckets) {
      // LANGUAGE CUSTOMIZATION
      const errors = validateLanguageGroup(languageMap);
      detected.push({
        id: `ac-language-${taxKey.replace(/[^a-z0-9]/gi, '-')}`,
        type: 'language',
        label: `Language Customization`,
        description: `${uniqueLanguages.size} languages: ${[...uniqueLanguages].join(', ').toUpperCase()}`,
        rows: groupRows,
        taxonomyKey: taxKey,
        deliveryBuckets: bucketMap,
        languages: languageMap,
        validationErrors: errors,
      });
    } else if (!hasDifferentBuckets && !hasDifferentLanguages && groupRows.length >= 2) {
      // Check for FLEXIBLE CREATIVE — same bucket, same language, multiple assets
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
    // If both different buckets AND languages — skip (conflicting, per spec rule)
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
 * Validate a manual selection for asset customization grouping.
 */
export function validateACSelection(
  rows: CreativeTextAssetRow[]
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

  // Classify
  const bucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
  const languageMap = new Map<string, CreativeTextAssetRow[]>();

  for (const row of rows) {
    const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
    if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
    bucketMap.get(bucket)!.push(row);

    const lang = detectLanguage(row) || 'unknown';
    if (!languageMap.has(lang)) languageMap.set(lang, []);
    languageMap.get(lang)!.push(row);
  }

  const uniqueBuckets = new Set([...bucketMap.keys()].filter(b => b !== 'other'));
  const uniqueLanguages = new Set([...languageMap.keys()].filter(l => l !== 'unknown'));

  if (uniqueBuckets.size >= 2 && uniqueLanguages.size >= 2) {
    return { valid: false, type: null, errors: ['Cannot combine placement and language customization in one group'] };
  }

  if (uniqueBuckets.size >= 2) {
    const errors = validatePlacementGroup(bucketMap);
    return { valid: errors.length === 0, type: 'placement', errors };
  }

  if (uniqueLanguages.size >= 2) {
    const errors = validateLanguageGroup(languageMap);
    return { valid: errors.length === 0, type: 'language', errors };
  }

  // Same bucket, same language → flexible creative
  return { valid: true, type: 'flexible_creative', errors: [] };
}
