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
 * Detect whether a single creative should become a Language Customization opportunity.
 *
 * Rules:
 * - explicit multi-language markers (folder/path/naming) can qualify a row
 * - BUT explicit single-language creatives (EN / AR / FR...) must NOT be hijacked by
 *   language mode, even if they live inside a multi-language folder hierarchy
 */
function isExplicitMultiLanguageAsset(row: CreativeTextAssetRow): boolean {
  const rowSearchable = [
    row.folderPath || '',
    row.creativeName || '',
    row.originalFilename || '',
    (row as any).taxonomyAdName || '',
    (row as any).taxonomyAdSetName || '',
    row.adSet || '',
  ].join(' ').toLowerCase();

  const hasMultiLanguageMarker =
    /all[\s_-]*languages?/i.test(rowSearchable) ||
    /multiple[\s_-]*languages?/i.test(rowSearchable) ||
    /multi[\s_-]*languages?/i.test(rowSearchable);

  if (!hasMultiLanguageMarker) return false;

  // Explicit single-language assets should remain eligible for placement grouping.
  return detectLanguage(row) === null;
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

/**
 * Extract a "base key" from a creative's name/filename by stripping dimension and
 * format tokens (e.g. 1x1, 4x5, 9x16, SQ, PT, 1080x1080). Creatives that share
 * the same base key but differ in delivery bucket form a placement customization group.
 */
function extractCreativeBaseKey(row: CreativeTextAssetRow): string {
  const name = (row.originalFilename || row.creativeName || '').toLowerCase();
  return name
    .replace(/\.[^/.]+$/, '') // remove extension
    .replace(/[-_]?\d{2,4}x\d{2,4}/gi, '') // e.g. 1080x1080
    .replace(/[-_]?(1x1|1_1|4x5|4_5|9x16|9_16|16x9|16_9|1\.91x1|191x1)/gi, '') // ratio tags
    .replace(/[-_]?(sq|square|pt|portrait|vt|vertical|hz|horizontal|fullscreen)/gi, '') // format labels
    .replace(/[-_\s]+$/g, '') // trailing separators
    .trim() || 'base';
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
 * - Language: explicit multi-language taxonomy/path markers win, even if formats differ
 * - Placement: different delivery buckets without multi-language markers
 * - Flexible: fallback for 2+ same-ad-set variations without explicit language intent
 *
 * Language customization without explicit multi-language markers should be created manually.
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
    const autoLanguageRows = groupRows.filter(isExplicitMultiLanguageAsset);
    const nonLanguageRows = groupRows.filter((row) => !isExplicitMultiLanguageAsset(row));

    // Priority 1: Check if multi-language assets ALSO satisfy placement conditions (2+ buckets,
    // 1 per bucket) → Flexible Creative. Group by base key first.
    const flexFromLangBaseKeyMap = new Map<string, CreativeTextAssetRow[]>();
    for (const row of autoLanguageRows) {
      const baseKey = extractCreativeBaseKey(row);
      if (!flexFromLangBaseKeyMap.has(baseKey)) flexFromLangBaseKeyMap.set(baseKey, []);
      flexFromLangBaseKeyMap.get(baseKey)!.push(row);
    }

    const claimedByFlexible = new Set<string>();

    for (const [baseKey, baseRows] of flexFromLangBaseKeyMap) {
      if (baseRows.length < 2) continue;

      const bucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
      for (const row of baseRows) {
        const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
        if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
        bucketMap.get(bucket)!.push(row);
      }

      const uniqueBuckets = [...bucketMap.keys()].filter((b) => b !== 'other');
      if (uniqueBuckets.length < 2) continue;

      // Pair creatives across buckets: create one flexible group per "slot" index.
      // e.g. 2× square + 2× vertical → 2 flexible groups, each with 1 square + 1 vertical.
      const maxPerBucket = Math.max(...uniqueBuckets.map((b) => bucketMap.get(b)!.length));
      for (let slotIdx = 0; slotIdx < maxPerBucket; slotIdx++) {
        const slotRows: CreativeTextAssetRow[] = [];
        const slotBucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
        for (const b of uniqueBuckets) {
          const arr = bucketMap.get(b)!;
          if (slotIdx < arr.length) {
            slotRows.push(arr[slotIdx]);
            slotBucketMap.set(b, [arr[slotIdx]]);
          }
        }
        // Need at least 2 different buckets in this slot
        if (slotBucketMap.size < 2) continue;

        const languageMap = new Map<string, CreativeTextAssetRow[]>();
        for (const row of slotRows) {
          const lang = detectLanguage(row) || 'unknown';
          if (!languageMap.has(lang)) languageMap.set(lang, []);
          languageMap.get(lang)!.push(row);
        }

        detected.push({
          id: `ac-flexible-${taxKey.replace(/[^a-z0-9]/gi, '-')}-${baseKey.replace(/[^a-z0-9]/gi, '-')}-${slotIdx}`,
          type: 'flexible_creative',
          label: `Flexible Creative`,
          description: `${slotBucketMap.size} delivery buckets + multi-language — dynamic optimization per user`,
          rows: slotRows,
          taxonomyKey: taxKey,
          deliveryBuckets: slotBucketMap,
          languages: languageMap,
          validationErrors: [],
        });

        slotRows.forEach((r) => claimedByFlexible.add(r.id));
      }
    }

    // Remaining multi-language assets that didn't form flexible groups → individual Language entries
    const remainingLanguageRows = autoLanguageRows.filter((r) => !claimedByFlexible.has(r.id));
    for (const row of remainingLanguageRows) {
      const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
      const singleBucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
      singleBucketMap.set(bucket, [row]);
      const lang = detectLanguage(row) || 'unknown';
      const singleLangMap = new Map<string, CreativeTextAssetRow[]>();
      singleLangMap.set(lang, [row]);

      const creativeName = row.creativeName || row.originalFilename || 'Creative';
      const bucketLabel = bucket !== 'other' ? DELIVERY_BUCKETS[bucket].label : '';

      detected.push({
        id: `ac-language-${taxKey.replace(/[^a-z0-9]/gi, '-')}-${row.id}`,
        type: 'language',
        label: `Language Customization`,
        description: `${creativeName}${bucketLabel ? ` (${bucketLabel})` : ''} — set text per language`,
        rows: [row],
        taxonomyKey: taxKey,
        deliveryBuckets: singleBucketMap,
        languages: singleLangMap,
        validationErrors: [],
      });
    }

    // Remaining rows: find placement groups by matching creatives that share a common
    // base name (taxonomy minus format/dimension tokens) but differ in delivery bucket.
    // Each placement group must have exactly 1 creative per bucket.

    // Step 1: Extract a "creative base key" by stripping dimension/format tokens from the name
    const baseKeyMap = new Map<string, CreativeTextAssetRow[]>();
    for (const row of nonLanguageRows) {
      const baseKey = extractCreativeBaseKey(row);
      if (!baseKeyMap.has(baseKey)) baseKeyMap.set(baseKey, []);
      baseKeyMap.get(baseKey)!.push(row);
    }

    const claimedRowIds = new Set<string>();

    // Step 2: For each base key, check if creatives span 2+ different buckets
    for (const [baseKey, baseRows] of baseKeyMap) {
      if (baseRows.length < 2) continue;

      const bucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
      for (const row of baseRows) {
        const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
        if (!bucketMap.has(bucket)) bucketMap.set(bucket, []);
        bucketMap.get(bucket)!.push(row);
      }

      const uniqueBuckets = new Set([...bucketMap.keys()].filter((b) => b !== 'other'));
      if (uniqueBuckets.size < 2) continue;

      // Check if each bucket has exactly 1 creative → Placement group
      const allSinglePerBucket = [...uniqueBuckets].every((b) => (bucketMap.get(b)?.length || 0) === 1);

      if (!allSinglePerBucket) {
        // Multiple creatives per bucket with 2+ different buckets → Flexible Creative
        // Create flexible groups by pairing one creative per bucket per slot
        const maxPerBucket = Math.max(...[...uniqueBuckets].map((b) => bucketMap.get(b)!.length));
        for (let slotIdx = 0; slotIdx < maxPerBucket; slotIdx++) {
          const slotRows: CreativeTextAssetRow[] = [];
          const slotBucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
          for (const b of uniqueBuckets) {
            const arr = bucketMap.get(b)!;
            if (slotIdx < arr.length) {
              slotRows.push(arr[slotIdx]);
              slotBucketMap.set(b, [arr[slotIdx]]);
            }
          }
          if (slotBucketMap.size < 2) continue;

          const languageMap = new Map<string, CreativeTextAssetRow[]>();
          for (const row of slotRows) {
            const lang = detectLanguage(row) || 'unknown';
            if (!languageMap.has(lang)) languageMap.set(lang, []);
            languageMap.get(lang)!.push(row);
          }

          detected.push({
            id: `ac-flexible-${taxKey.replace(/[^a-z0-9]/gi, '-')}-${baseKey.replace(/[^a-z0-9]/gi, '-')}-${slotIdx}`,
            type: 'flexible_creative',
            label: `Flexible Creative`,
            description: `${slotBucketMap.size} delivery buckets — dynamic optimization per user (same creative, different sizes)`,
            rows: slotRows,
            taxonomyKey: taxKey,
            deliveryBuckets: slotBucketMap,
            languages: languageMap,
            validationErrors: [],
          });

          slotRows.forEach((r) => claimedRowIds.add(r.id));
        }
        continue;
      }

      const placementRows = [...uniqueBuckets].map((b) => bucketMap.get(b)![0]);
      const languageMap = new Map<string, CreativeTextAssetRow[]>();
      for (const row of placementRows) {
        const lang = detectLanguage(row) || 'unknown';
        if (!languageMap.has(lang)) languageMap.set(lang, []);
        languageMap.get(lang)!.push(row);
      }

      const newBucketMap = new Map<DeliveryBucket, CreativeTextAssetRow[]>();
      for (const row of placementRows) {
        const bucket = classifyDeliveryBucket(row.width, row.height, row.aspectRatio);
        newBucketMap.set(bucket, [row]);
      }

      detected.push({
        id: `ac-placement-${taxKey.replace(/[^a-z0-9]/gi, '-')}-${baseKey.replace(/[^a-z0-9]/gi, '-')}`,
        type: 'placement',
        label: `Placement Customization`,
        description: `${uniqueBuckets.size} delivery buckets: ${[...uniqueBuckets].map((b) => DELIVERY_BUCKETS[b].label).join(', ')}`,
        rows: placementRows,
        taxonomyKey: taxKey,
        deliveryBuckets: newBucketMap,
        languages: languageMap,
        validationErrors: [],
      });

      placementRows.forEach((r) => claimedRowIds.add(r.id));
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
