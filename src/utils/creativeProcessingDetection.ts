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

/** Compute aspect ratio string from dimensions */
function computeAspectRatio(w: number, h: number): string {
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

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
  return computeAspectRatio(w, h);
}

/** Extract the base name by stripping sequence numbers, aspect ratio tags, and extensions */
function extractBaseName(fileName: string): string {
  return fileName
    .replace(/\.[^/.]+$/, '') // remove extension
    .replace(/[-_]?\d{2,4}x\d{2,4}/gi, '') // remove dimension tags like 1080x1080
    .replace(/[-_]?(1x1|1_1|4x5|4_5|9x16|9_16|16x9|16_9|square|portrait|landscape|vertical|horizontal)/gi, '') // aspect ratio labels
    .replace(/[-_]?(card|slide|frame)?[-_]?\d{1,3}$/i, '') // trailing sequence numbers
    .replace(/[-_]+$/, '') // trailing separators
    .trim()
    .toLowerCase();
}

/** Extract folder path from file name/path */
function getFolderPath(filePath?: string, fileName?: string): string {
  if (filePath) {
    const parts = filePath.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
  }
  return '/';
}

function extractSequenceNumber(fileName: string): number | null {
  const cleaned = fileName.replace(/\.[^/.]+$/, '');

  const explicitLabelMatch = cleaned.match(/(?:card|slide|frame|img|image|pic|photo)\s*[-_#]?(\d{1,3})/i);
  if (explicitLabelMatch) {
    return Number(explicitLabelMatch[1]);
  }

  const trailingMatch = cleaned.match(/[-_#](\d{1,3})(?:\D*)$/);
  if (trailingMatch) {
    return Number(trailingMatch[1]);
  }

  return null;
}

function toStableIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'group';
}

/** Detect sequence indicators in file names */
function hasSequenceIndicator(fileName: string): boolean {
  const cleaned = fileName.replace(/\.[^/.]+$/, '');
  // Patterns: card_1, slide-2, frame03, _01, -1, #1
  return /[-_]?(card|slide|frame|img|image|pic|photo)?[-_#]?\d{1,3}$/i.test(cleaned)
    || /\b(card|slide|frame)\s*\d/i.test(cleaned);
}

/**
 * Detect carousel groups from a set of assets.
 * Groups assets from the same folder with the same dimensions that appear to be a sequence.
 */
export function detectCarouselGroups(assets: DetectableAsset[]): DetectedCarouselGroup[] {
  // Group by folder + exact dimensions + shared series key
  const groups = new Map<string, { folder: string; dimKey: string; baseName: string; assets: DetectableAsset[] }>();

  for (const asset of assets) {
    if (asset.assetType !== 'image') continue; // Carousels are typically image-based
    if (!asset.width || !asset.height) continue; // Skip unknown dimensions to avoid false positives

    const folder = getFolderPath(asset.filePath, asset.name);
    const dimKey = `${asset.width}x${asset.height}`;
    const baseName = extractBaseName(asset.name);

    if (!baseName || !hasSequenceIndicator(asset.name)) continue;

    const key = `${folder}||${dimKey}||${baseName}`;
    
    if (!groups.has(key)) {
      groups.set(key, { folder, dimKey, baseName, assets: [] });
    }
    groups.get(key)!.assets.push(asset);
  }

  const results: DetectedCarouselGroup[] = [];

  for (const { folder, dimKey, baseName, assets: groupAssets } of groups.values()) {
    if (groupAssets.length < 2) continue;

    const sequencedAssets = groupAssets
      .map((asset) => ({ asset, sequence: extractSequenceNumber(asset.name) }))
      .filter((item): item is { asset: DetectableAsset; sequence: number } => item.sequence !== null);

    const uniqueSequences = new Set(sequencedAssets.map((item) => item.sequence));
    if (uniqueSequences.size < 2) continue;

    const orderedAssets = sequencedAssets
      .sort((a, b) => a.sequence - b.sequence || a.asset.name.localeCompare(b.asset.name))
      .map((item) => item.asset);

      results.push({
        id: `carousel-${toStableIdPart(folder)}-${toStableIdPart(dimKey)}-${toStableIdPart(baseName)}`,
        type: 'carousel',
        folderPath: folder,
        assets: orderedAssets,
        reason: `${orderedAssets.length} images with sequence numbering in "${folder || '/'}" folder (${dimKey})`,
        sharedDimensions: dimKey,
      });
  }

  return results;
}

/**
 * Detect asset customization patterns — same creative in multiple aspect ratios.
 * Groups assets that share the same base name but exist in different aspect ratios.
 */
export function detectAssetCustomization(assets: DetectableAsset[]): DetectedAssetCustomization[] {
  // Group by folder + base name to avoid cross-folder false positives
  const groups = new Map<string, { baseName: string; assets: DetectableAsset[] }>();

  for (const asset of assets) {
    if (!asset.width || !asset.height) continue;
    const folder = getFolderPath(asset.filePath, asset.name);
    const base = extractBaseName(asset.name);
    if (!base) continue;

    const key = `${folder}||${base}`;
    
    if (!groups.has(key)) groups.set(key, { baseName: base, assets: [] });
    groups.get(key)!.assets.push(asset);
  }

  const results: DetectedAssetCustomization[] = [];

  for (const { baseName, assets: groupAssets } of groups.values()) {
    if (groupAssets.length < 2) continue;

    // Check they have different aspect ratios
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

  // Google: only Demand Gen and Performance Max support carousel-like formats
  if (p === 'google') {
    const ct = googleCampaignType?.toLowerCase() || '';
    return ct.includes('demand gen') || ct.includes('performance max');
  }

  // Meta: most objectives support carousel
  if (p === 'meta') return true;

  // TikTok: carousel ads supported for Traffic, App Install, Conversion objectives
  if (p === 'tiktok') return true;

  return true;
}

/** Check if the campaign objective supports asset customization (multi-placement) */
export function isAssetCustomizationCompatible(platform: string, objective?: string, googleCampaignType?: string): boolean {
  const p = platform.toLowerCase();

  // Google: Performance Max and Demand Gen support asset groups with multiple formats
  if (p === 'google') {
    const ct = googleCampaignType?.toLowerCase() || '';
    return ct.includes('performance max') || ct.includes('demand gen') || ct.includes('display');
  }

  // Meta: supports asset customization via placement asset customization
  if (p === 'meta') return true;

  // TikTok: limited support
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

  const carouselGroups = (options.enableCarousel && carouselCompatible)
    ? detectCarouselGroups(assets)
    : [];

  const assetCustomizations = (options.enableAssetCustomization && assetCustomizationCompatible)
    ? detectAssetCustomization(assets)
    : [];

  return {
    carouselGroups,
    assetCustomizations,
    carouselCompatible,
    assetCustomizationCompatible,
  };
}
