// Client-side detection engine for carousel grouping and asset customization
// No backend calls — analyzes file metadata, names, dimensions, and folder structure

export interface DetectedCarouselGroup {
  id: string;
  type: 'carousel';
  folderPath: string;
  assets: DetectableAsset[];
  reason: string;
  sharedDimensions: string; // e.g. "1080x1080"
}

export interface DetectedAssetCustomization {
  id: string;
  type: 'asset_customization';
  baseName: string;
  assets: DetectableAsset[];
  reason: string;
  aspectRatios: string[]; // e.g. ["1:1", "9:16", "4:5"]
}

export type DetectedGroup = DetectedCarouselGroup | DetectedAssetCustomization;

export interface DetectableAsset {
  id: string;
  name: string;
  filePath?: string;
  folderPath?: string;
  assetType: 'image' | 'video';
  width?: number;
  height?: number;
  aspectRatio?: string;
}

const LANGUAGE_HINTS: Record<string, string> = {
  english: 'en',
  eng: 'en',
  en: 'en',
  arabic: 'ar',
  arab: 'ar',
  ara: 'ar',
  arb: 'ar',
  ar: 'ar',
  french: 'fr',
  fra: 'fr',
  fre: 'fr',
  fr: 'fr',
  german: 'de',
  deu: 'de',
  ger: 'de',
  de: 'de',
  spanish: 'es',
  spa: 'es',
  es: 'es',
  portuguese: 'pt',
  por: 'pt',
  pt: 'pt',
};

/** Simplify aspect ratio to common names */
function simplifyAspectRatio(w: number, h: number): string {
  const ratio = w / h;
  if (Math.abs(ratio - 1) < 0.05) return '1:1';
  if (Math.abs(ratio - 16 / 9) < 0.05) return '16:9';
  if (Math.abs(ratio - 9 / 16) < 0.05) return '9:16';
  if (Math.abs(ratio - 4 / 5) < 0.05) return '4:5';
  if (Math.abs(ratio - 4 / 3) < 0.05) return '4:3';
  if (Math.abs(ratio - 3 / 4) < 0.05) return '3:4';
  if (Math.abs(ratio - 2 / 3) < 0.05) return '2:3';
  if (Math.abs(ratio - 3 / 2) < 0.05) return '3:2';
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

function matchesToken(text: string, token: string): boolean {
  return new RegExp(`(^|[\\s_\\-./\\[\\]()])${token}($|[\\s_\\-./\\[\\]()])`, 'i').test(text);
}

function extractLanguageHint(value?: string): string | null {
  if (!value) return null;

  const normalized = value.toLowerCase().replace(/\\/g, '/');
  for (const [token, code] of Object.entries(LANGUAGE_HINTS)) {
    if (matchesToken(normalized, token)) {
      return code;
    }
  }

  return null;
}

function sortCarouselAssets(a: DetectableAsset, b: DetectableAsset) {
  const aSeq = extractSeriesInfo(a.name)?.sequence;
  const bSeq = extractSeriesInfo(b.name)?.sequence;

  if (typeof aSeq === 'number' && typeof bSeq === 'number' && aSeq !== bSeq) {
    return aSeq - bSeq;
  }

  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Extract a "series key" and sequence number from a filename.
 * Returns null if no sequence pattern is found.
 *
 * Supported patterns (case-insensitive):
 *   - Explicit labels: "FRAME 1", "Card_2", "Slide-03", "Frame03"
 *   - Mid-name sequences with aspect ratio after: "base_1_4x5_RGB" / "base_2_4x5_RGB"
 *   - Trailing numbers: "creative_01", "creative-3"
 */
function extractSeriesInfo(fileName: string): { seriesKey: string; sequence: number } | null {
  const cleaned = fileName.replace(/\.[^/.]+$/, ''); // remove extension

  // 1a) Label-first patterns: "FRAME 1", "Card_2", "Slide-03", "Frame03"
  //     The filename STARTS with the label word (no prefix)
  const labelFirstMatch = cleaned.match(
    /^(card|slide|frame|img|image|pic|photo)\s*[-_#]?(\d{1,3})\b(.*)/i
  );
  if (labelFirstMatch) {
    const label = labelFirstMatch[1].toLowerCase();
    const seq = Number(labelFirstMatch[2]);
    const suffix = labelFirstMatch[3].trim();
    const seriesKey = `|${label}|${suffix}`.toLowerCase()
      .replace(/[-_\s]+/g, '_').replace(/^_|_$/g, '');
    return { seriesKey, sequence: seq };
  }

  // 1b) Explicit label patterns with prefix: "Hero FRAME 1", "Ad_Card_2"
  //     Capture everything before the label as the series key
  const labelMatch = cleaned.match(
    /^(.+?)[\s_-]+(card|slide|frame|img|image|pic|photo)\s*[-_#]?(\d{1,3})\b(.*)/i
  );
  if (labelMatch) {
    const prefix = labelMatch[1].trim();
    const label = labelMatch[2].toLowerCase();
    const seq = Number(labelMatch[3]);
    const suffix = labelMatch[4].trim();
    // Series key = prefix + label word + suffix (everything except the number)
    const seriesKey = `${prefix}|${label}|${suffix}`.toLowerCase()
      .replace(/[-_\s]+/g, '_').replace(/^_|_$/g, '');
    return { seriesKey, sequence: seq };
  }

  // 2) Mid-name sequence: "base_1_4x5_RGB" vs "base_2_4x5_RGB"
  //    Pattern: (base)_(digit)_(aspect-ratio-or-dimension-tag)_(suffix)
  const midMatch = cleaned.match(
    /^(.+?)[-_](\d{1,3})[-_]((?:\d{1,2}x\d{1,2}|1x1|4x5|9x16|16x9|1_1|4_5|9_16|16_9|square|portrait|landscape|vertical|horizontal).*)$/i
  );
  if (midMatch) {
    const prefix = midMatch[1].trim();
    const seq = Number(midMatch[2]);
    const suffix = midMatch[3].trim();
    const seriesKey = `${prefix}|mid|${suffix}`.toLowerCase()
      .replace(/[-_\s]+/g, '_').replace(/^_|_$/g, '');
    return { seriesKey, sequence: seq };
  }

  // 3) Trailing number: "creative_01", "creative-3", "img#5"
  const trailMatch = cleaned.match(/^(.+?)[-_#](\d{1,3})$/);
  if (trailMatch) {
    const prefix = trailMatch[1].trim();
    const seq = Number(trailMatch[2]);
    // Exclude pure numeric prefixes like dates/IDs (e.g. "000047560004_1")
    // Only use trailing match if the prefix contains at least one letter
    if (/[a-zA-Z]/.test(prefix)) {
      const seriesKey = `${prefix}|trail`.toLowerCase()
        .replace(/[-_\s]+/g, '_').replace(/^_|_$/g, '');
      return { seriesKey, sequence: seq };
    }
  }

  return null;
}

/**
 * Extract the base name for asset customization grouping.
 * Strips sequence numbers, aspect ratio tags, dimension tags, and extensions.
 */
function extractBaseName(fileName: string): string {
  return fileName
    .replace(/\.[^/.]+$/, '') // remove extension
    .replace(/[-_]?\d{2,4}x\d{2,4}/gi, '') // remove dimension tags like 1080x1080
    .replace(/[-_]?(1x1|1_1|4x5|4_5|9x16|9_16|16x9|16_9|square|portrait|landscape|vertical|horizontal)/gi, '') // aspect ratio labels
    .replace(/[-_]?(card|slide|frame|img|image|pic|photo)?\s*[-_#]?\d{1,3}$/i, '') // trailing sequence numbers (with spaces)
    .replace(/[-_\s]+$/g, '') // trailing separators and spaces
    .trim()
    .toLowerCase();
}

/** Extract folder path from file name/path */
function getFolderPath(filePath?: string): string {
  if (filePath) {
    const parts = filePath.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
  }
  return '/';
}

function toStableIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'group';
}

/**
 * Detect carousel groups from a set of assets.
 * Groups assets from the same folder with the same dimensions that form a sequence.
 */
export function detectCarouselGroups(assets: DetectableAsset[]): DetectedCarouselGroup[] {
  // Group by folder + exact dimensions + series key
  const groups = new Map<string, { folder: string; dimKey: string; seriesKey: string; items: { asset: DetectableAsset; sequence: number }[] }>();
  const folderDimensionGroups = new Map<string, { folder: string; dimKey: string; language: string | null; items: DetectableAsset[] }>();

  console.log(`[CarouselDetection] Analyzing ${assets.length} assets for carousel patterns`);

  for (const asset of assets) {
    // Allow both images and videos for carousel (Meta/TikTok support video carousels)
    if (asset.assetType !== 'image' && asset.assetType !== 'video') {
      console.log(`[CarouselDetection] Skipping "${asset.name}" — unsupported type (${asset.assetType})`);
      continue;
    }
    if (!asset.width || !asset.height) {
      console.log(`[CarouselDetection] Skipping "${asset.name}" — missing dimensions (w=${asset.width}, h=${asset.height})`);
      continue;
    }

    const seriesInfo = extractSeriesInfo(asset.name);
    if (!seriesInfo) {
      console.log(`[CarouselDetection] No sequence pattern in "${asset.name}"`);
      continue;
    }

    console.log(`[CarouselDetection] ✓ "${asset.name}" → series="${seriesInfo.seriesKey}", seq=${seriesInfo.sequence}, folder="${asset.filePath}"`);

    const folder = getFolderPath(asset.filePath);
    const dimKey = `${asset.width}x${asset.height}`;
    const language = extractLanguageHint(`${asset.filePath || ''} ${asset.name}`);
    const folderDimensionKey = `${folder}||${dimKey}||${language || 'unknown'}`;

    if (!folderDimensionGroups.has(folderDimensionKey)) {
      folderDimensionGroups.set(folderDimensionKey, { folder, dimKey, language, items: [] });
    }
    folderDimensionGroups.get(folderDimensionKey)!.items.push(asset);

    const key = `${folder}||${dimKey}||${seriesInfo.seriesKey}`;

    if (!groups.has(key)) {
      groups.set(key, { folder, dimKey, seriesKey: seriesInfo.seriesKey, items: [] });
    }
    groups.get(key)!.items.push({ asset, sequence: seriesInfo.sequence });
  }

  console.log(`[CarouselDetection] Found ${groups.size} potential groups`);

  const results: DetectedCarouselGroup[] = [];
  const claimedAssetIds = new Set<string>();

  for (const { folder, dimKey, seriesKey, items } of groups.values()) {
    if (items.length < 2) continue;

    const uniqueSequences = new Set(items.map(i => i.sequence));
    if (uniqueSequences.size < 2) continue;

    const orderedAssets = items
      .sort((a, b) => a.sequence - b.sequence || a.asset.name.localeCompare(b.asset.name))
      .map(i => i.asset);

    results.push({
      id: `carousel-${toStableIdPart(folder)}-${toStableIdPart(dimKey)}-${toStableIdPart(seriesKey)}`,
      type: 'carousel',
      folderPath: folder,
      assets: orderedAssets,
      reason: `${orderedAssets.length} images with sequence numbering in "${folder || '/'}" folder (${dimKey})`,
      sharedDimensions: dimKey,
    });

    orderedAssets.forEach((asset) => claimedAssetIds.add(asset.id));
  }

  for (const { folder, dimKey, language, items } of folderDimensionGroups.values()) {
    const unclaimedAssets = items.filter((asset) => !claimedAssetIds.has(asset.id));

    if (unclaimedAssets.length < 2 || unclaimedAssets.length > 10) continue;

    const orderedAssets = [...unclaimedAssets].sort(sortCarouselAssets);
    results.push({
      id: `carousel-fallback-${toStableIdPart(folder)}-${toStableIdPart(dimKey)}-${toStableIdPart(language || 'unknown')}`,
      type: 'carousel',
      folderPath: folder,
      assets: orderedAssets,
      reason: `${orderedAssets.length} assets in "${folder || '/'}" folder share dimensions (${dimKey})${language ? ` and language ${language.toUpperCase()}` : ''}`,
      sharedDimensions: dimKey,
    });

    orderedAssets.forEach((asset) => claimedAssetIds.add(asset.id));
  }

  return results;
}

/**
 * Detect asset customization patterns — same creative in multiple aspect ratios.
 * Groups assets that share the same base name but exist in different aspect ratios.
 */
export function detectAssetCustomization(assets: DetectableAsset[]): DetectedAssetCustomization[] {
  const groups = new Map<string, { baseName: string; assets: DetectableAsset[] }>();

  for (const asset of assets) {
    if (!asset.width || !asset.height) continue;
    const folder = getFolderPath(asset.filePath);
    const language = extractLanguageHint(`${asset.filePath || ''} ${asset.name}`) || 'unknown';
    const base = extractBaseName(asset.name);
    if (!base) continue;

    const key = `${folder}||${language}||${base}`;

    if (!groups.has(key)) groups.set(key, { baseName: base, assets: [] });
    groups.get(key)!.assets.push(asset);
  }

  const results: DetectedAssetCustomization[] = [];

  for (const { baseName, assets: groupAssets } of groups.values()) {
    if (groupAssets.length < 2) continue;

    const ratios = new Set(groupAssets.map(a => simplifyAspectRatio(a.width!, a.height!)));
    if (ratios.size < 2) continue; // Same aspect ratio — not asset customization

    const ratioList = [...ratios].sort();
    results.push({
      id: `ac-${toStableIdPart(baseName)}-${ratioList.map(toStableIdPart).join('-')}`,
      type: 'asset_customization',
      baseName,
      assets: groupAssets,
      reason: `"${baseName}" found in ${ratioList.length} aspect ratios: ${ratioList.join(', ')}`,
      aspectRatios: ratioList,
    });
  }

  return results;
}

/** Check if the campaign objective supports carousel format */
export function isCarouselCompatible(platform: string, objective?: string, googleCampaignType?: string): boolean {
  const p = platform.toLowerCase();
  if (p === 'google') {
    const ct = googleCampaignType?.toLowerCase() || '';
    return ct.includes('demand gen') || ct.includes('performance max');
  }
  if (p === 'meta') return true;
  if (p === 'tiktok') return true;
  return true;
}

/** Check if the campaign objective supports asset customization (multi-placement) */
export function isAssetCustomizationCompatible(platform: string, objective?: string, googleCampaignType?: string): boolean {
  const p = platform.toLowerCase();
  if (p === 'google') {
    const ct = googleCampaignType?.toLowerCase() || '';
    return ct.includes('performance max') || ct.includes('demand gen') || ct.includes('display');
  }
  if (p === 'meta') return true;
  if (p === 'tiktok') return false;
  return false;
}

/**
 * Run all detections on a set of assets.
 */
export function runCreativeDetection(
  assets: DetectableAsset[],
  options: {
    enableCarousel: boolean;
    enableAssetCustomization: boolean;
    platform: string;
    objective?: string;
    googleCampaignType?: string;
  }
): {
  carouselGroups: DetectedCarouselGroup[];
  assetCustomizations: DetectedAssetCustomization[];
  carouselCompatible: boolean;
  assetCustomizationCompatible: boolean;
} {
  const carouselCompatible = isCarouselCompatible(options.platform, options.objective, options.googleCampaignType);
  const assetCustomizationCompatible = isAssetCustomizationCompatible(options.platform, options.objective, options.googleCampaignType);

  // Exclude assets already claimed by carousel groups from asset customization
  const carouselGroups = (options.enableCarousel && carouselCompatible)
    ? detectCarouselGroups(assets)
    : [];

  const carouselAssetIds = new Set(carouselGroups.flatMap(g => g.assets.map(a => a.id)));
  const remainingAssets = assets.filter(a => !carouselAssetIds.has(a.id));

  const assetCustomizations = (options.enableAssetCustomization && assetCustomizationCompatible)
    ? detectAssetCustomization(remainingAssets)
    : [];

  return {
    carouselGroups,
    assetCustomizations,
    carouselCompatible,
    assetCustomizationCompatible,
  };
}
