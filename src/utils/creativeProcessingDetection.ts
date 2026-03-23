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
  // Group by folder + dimension key
  const groups = new Map<string, DetectableAsset[]>();

  for (const asset of assets) {
    if (asset.assetType !== 'image') continue; // Carousels are typically image-based
    const folder = getFolderPath(asset.filePath, asset.name);
    const dimKey = (asset.width && asset.height) ? `${asset.width}x${asset.height}` : 'unknown';
    const key = `${folder}||${dimKey}`;
    
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(asset);
  }

  const results: DetectedCarouselGroup[] = [];

  for (const [key, groupAssets] of groups) {
    if (groupAssets.length < 2) continue; // Need at least 2 for a carousel

    const [folder, dimKey] = key.split('||');

    // Check if assets have sequence indicators or share a common base name
    const withSequence = groupAssets.filter(a => hasSequenceIndicator(a.name));
    const baseNames = new Set(groupAssets.map(a => extractBaseName(a.name)));

    let reason = '';
    let isCarousel = false;

    if (withSequence.length >= 2) {
      isCarousel = true;
      reason = `${withSequence.length} images with sequence numbering in "${folder || 'root'}" folder (${dimKey})`;
    } else if (baseNames.size === 1 && groupAssets.length >= 2) {
      isCarousel = true;
      reason = `${groupAssets.length} images sharing base name "${[...baseNames][0]}" in same dimensions (${dimKey})`;
    }

    if (isCarousel) {
      results.push({
        id: `carousel-${results.length}-${Date.now()}`,
        type: 'carousel',
        folderPath: folder,
        assets: groupAssets,
        reason,
        sharedDimensions: dimKey,
      });
    }
  }

  return results;
}

/**
 * Detect asset customization patterns — same creative in multiple aspect ratios.
 * Groups assets that share the same base name but exist in different aspect ratios.
 */
export function detectAssetCustomization(assets: DetectableAsset[]): DetectedAssetCustomization[] {
  // Group by base name
  const groups = new Map<string, DetectableAsset[]>();

  for (const asset of assets) {
    if (!asset.width || !asset.height) continue;
    const base = extractBaseName(asset.name);
    if (!base) continue;
    
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(asset);
  }

  const results: DetectedAssetCustomization[] = [];

  for (const [baseName, groupAssets] of groups) {
    if (groupAssets.length < 2) continue;

    // Check they have different aspect ratios
    const ratios = new Set(
      groupAssets.map(a => simplifyAspectRatio(a.width!, a.height!))
    );

    if (ratios.size < 2) continue; // Same aspect ratio — not asset customization

    const ratioList = [...ratios];
    results.push({
      id: `ac-${results.length}-${Date.now()}`,
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
