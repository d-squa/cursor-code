import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';

const GOOGLE_AD_FORMAT_TOKENS = new Set([
  'feed_image',
  'feed_video',
  'story_image',
  'story_video',
  'reels_video',
  'carousel_image',
  'carousel_video',
  'display_image',
  'display_video',
  'shorts_video',
]);

const normalizeNameToken = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const containsGoogleAdFormatToken = (value: string) => {
  const normalized = `_${normalizeNameToken(value)}_`;
  return Array.from(GOOGLE_AD_FORMAT_TOKENS).some((token) => normalized.includes(`_${token}_`));
};

/**
 * PMax asset groups are shared pools. Prefer the non-format candidate so image
 * and video bucket rows collapse into the real asset group (e.g. EN / AR).
 */
export function resolvePmaxAssetGroupName(row: CreativeTextAssetRow): string {
  const taxonomyName = String((row as any).taxonomyAdSetName || '').trim();
  const assignedName = String(row.adSet || '').trim();

  if (taxonomyName && assignedName) {
    const taxonomyLooksLikeFormat = containsGoogleAdFormatToken(taxonomyName);
    const assignedLooksLikeFormat = containsGoogleAdFormatToken(assignedName);

    if (taxonomyLooksLikeFormat && !assignedLooksLikeFormat) return assignedName;
    if (assignedLooksLikeFormat && !taxonomyLooksLikeFormat) return taxonomyName;
  }

  return taxonomyName || assignedName;
}