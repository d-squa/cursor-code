// Performance Max asset-group validation rules.
//
// Single source of truth for the PMax minimums enforced in:
//   - GoogleNonSearchTextAssetEditor (UI hard-block)
//   - googleNonSearchExcel (import validation)
//   - validate-ad-config edge function (server-side enforcement)
//
// Google's atomic AssetGroup mutation requires ALL of the following per
// asset group (one asset group = one (market, phase, ad_group) tuple):
//
//   Text:
//     • 3 Headlines (≤30 chars each)
//     • 1 Long Headline (≤90 chars)
//     • 2 Descriptions (≤90 chars; AT LEAST ONE must be ≤60 chars)
//     • 1 Business Name (≤25 chars)
//     • 1 Final URL
//     • 1 Call-to-Action (Google enum)
//
//   Images (from creative library / assignments):
//     • ≥1 Marketing Image    — 1.91:1 aspect, ≥600×314
//     • ≥1 Square Marketing   — 1:1 aspect, ≥300×300
//     • ≥1 Logo               — 1:1 aspect, ≥128×128
//     • Video is OPTIONAL — Google auto-generates one from images if omitted.

import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';

export const PMAX_LIMITS = {
  HEADLINE_MAX: 30,
  LONG_HEADLINE_MAX: 90,
  DESCRIPTION_MAX: 90,
  DESCRIPTION_SHORT_MAX: 60,
  BUSINESS_NAME_MAX: 25,
  MIN_HEADLINES: 3,
  MIN_LONG_HEADLINES: 1,
  MIN_DESCRIPTIONS: 2,
  MIN_SHORT_DESCRIPTIONS: 1,
  MARKETING_IMAGE_MIN_W: 600,
  MARKETING_IMAGE_MIN_H: 314,
  SQUARE_IMAGE_MIN_W: 300,
  SQUARE_IMAGE_MIN_H: 300,
  PORTRAIT_IMAGE_MIN_W: 480,
  PORTRAIT_IMAGE_MIN_H: 600,
  LOGO_MIN_W: 128,
  LOGO_MIN_H: 128,
  // Google PMax per-asset-group maximums (official API caps).
  MAX_MARKETING_IMAGES: 20,
  MAX_SQUARE_IMAGES: 20,
  MAX_PORTRAIT_IMAGES: 20,
  MAX_LOGOS: 5,
  MAX_VIDEOS: 5,
} as const;

const ASPECT_TOLERANCE = 0.05;

function aspect(width?: number, height?: number): number | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  return width / height;
}

function isLandscape191(width?: number, height?: number): boolean {
  const a = aspect(width, height);
  if (a == null) return false;
  return Math.abs(a - 1.91) <= ASPECT_TOLERANCE * 1.91;
}

function isSquare(width?: number, height?: number): boolean {
  const a = aspect(width, height);
  if (a == null) return false;
  return Math.abs(a - 1.0) <= ASPECT_TOLERANCE;
}

/** Portrait 4:5 (0.8) aspect for PMax portrait marketing images. */
function isPortrait45(width?: number, height?: number): boolean {
  const a = aspect(width, height);
  if (a == null) return false;
  return Math.abs(a - 0.8) <= ASPECT_TOLERANCE;
}

/** Heuristic: a creative is a "logo" if its name/folder hints at logo OR it's
 *  square and ≤512px on its longest side. Asset library uploads typically tag
 *  these explicitly via folder name. */
function looksLikeLogo(row: CreativeTextAssetRow): boolean {
  const hay = `${row.creativeName || ''} ${row.originalFilename || ''} ${row.folderPath || ''}`.toLowerCase();
  if (/\blogo\b/.test(hay)) return true;
  // Small square images are usable as logos by Google but should not double as
  // marketing squares. We treat anything ≤512px max-side AND square as logo.
  const w = row.width || 0;
  const h = row.height || 0;
  if (isSquare(w, h) && Math.max(w, h) <= 512) return true;
  return false;
}

export interface PmaxImageBuckets {
  marketingImages: CreativeTextAssetRow[];   // 1.91:1 ≥600×314
  squareImages: CreativeTextAssetRow[];      // 1:1 ≥300×300 (non-logo)
  portraitImages: CreativeTextAssetRow[];    // 4:5 ≥480×600
  logos: CreativeTextAssetRow[];             // 1:1 ≥128×128 (logo-tagged or small square)
  videos: CreativeTextAssetRow[];
  unclassified: CreativeTextAssetRow[];
}

export function bucketPmaxImages(rows: CreativeTextAssetRow[]): PmaxImageBuckets {
  const buckets: PmaxImageBuckets = {
    marketingImages: [],
    squareImages: [],
    portraitImages: [],
    logos: [],
    videos: [],
    unclassified: [],
  };
  for (const r of rows) {
    if (r.mediaType === 'video') {
      buckets.videos.push(r);
      continue;
    }
    const w = r.width || 0;
    const h = r.height || 0;
    // Logo first — covers logo-tagged AND small-square assets.
    if (looksLikeLogo(r) && w >= PMAX_LIMITS.LOGO_MIN_W && h >= PMAX_LIMITS.LOGO_MIN_H && isSquare(w, h)) {
      buckets.logos.push(r);
      continue;
    }
    if (isLandscape191(w, h) && w >= PMAX_LIMITS.MARKETING_IMAGE_MIN_W && h >= PMAX_LIMITS.MARKETING_IMAGE_MIN_H) {
      buckets.marketingImages.push(r);
      continue;
    }
    if (isSquare(w, h) && w >= PMAX_LIMITS.SQUARE_IMAGE_MIN_W && h >= PMAX_LIMITS.SQUARE_IMAGE_MIN_H) {
      buckets.squareImages.push(r);
      continue;
    }
    if (isPortrait45(w, h) && w >= PMAX_LIMITS.PORTRAIT_IMAGE_MIN_W && h >= PMAX_LIMITS.PORTRAIT_IMAGE_MIN_H) {
      buckets.portraitImages.push(r);
      continue;
    }
    buckets.unclassified.push(r);
  }
  return buckets;
}

/** Classify a single creative-like input into a PMax bucket, or null if it does
 *  not fit any of the 5 PMax buckets (marketing / square / portrait / logo / video).
 *  Used by the matching engine to pre-filter assets for PMax ad sets. */
export type PmaxBucketName = 'marketing' | 'square' | 'portrait' | 'logo' | 'video';

export interface PmaxClassifyInput {
  width?: number;
  height?: number;
  mediaType?: string;
  filename?: string;
  folderPath?: string;
  name?: string;
  /** YouTube/platform video id (Google requires uploaded videos for PMax). */
  platformVideoId?: string;
}

export function classifyPmaxAsset(input: PmaxClassifyInput): PmaxBucketName | null {
  const w = Number(input.width || 0);
  const h = Number(input.height || 0);
  const mediaType = (input.mediaType || '').toLowerCase();
  const isVideo = mediaType === 'video' || !!input.platformVideoId;
  if (isVideo) {
    // Google PMax only accepts YouTube-hosted videos (platform_video_id).
    return input.platformVideoId ? 'video' : null;
  }
  if (!w || !h) return null;
  const hay = `${input.filename || ''} ${input.name || ''} ${input.folderPath || ''}`.toLowerCase();
  const logoHint = /\blogo\b/.test(hay);
  if (isSquare(w, h)) {
    if ((logoHint || Math.max(w, h) <= 512) && w >= PMAX_LIMITS.LOGO_MIN_W && h >= PMAX_LIMITS.LOGO_MIN_H) {
      return 'logo';
    }
    if (w >= PMAX_LIMITS.SQUARE_IMAGE_MIN_W && h >= PMAX_LIMITS.SQUARE_IMAGE_MIN_H) {
      return 'square';
    }
    return null;
  }
  if (isLandscape191(w, h) && w >= PMAX_LIMITS.MARKETING_IMAGE_MIN_W && h >= PMAX_LIMITS.MARKETING_IMAGE_MIN_H) {
    return 'marketing';
  }
  if (isPortrait45(w, h) && w >= PMAX_LIMITS.PORTRAIT_IMAGE_MIN_W && h >= PMAX_LIMITS.PORTRAIT_IMAGE_MIN_H) {
    return 'portrait';
  }
  return null;
}

/** True if an asset can attach to a PMax asset group (any of the 5 buckets). */
export function isPmaxEligibleAsset(input: PmaxClassifyInput): boolean {
  return classifyPmaxAsset(input) !== null;
}

export interface PmaxTextValues {
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  businessName: string;
  finalUrl: string;
  callToAction: string;
}

/** Pull the canonical text values from a single PMax row (any row in the group
 *  carries the same group-level text in our model). */
export function readPmaxText(row: CreativeTextAssetRow): PmaxTextValues {
  const r = row as any;
  return {
    headlines: [r.headline, r.headline2, r.headline3, r.headline4, r.headline5]
      .map((v) => String(v || '').trim())
      .filter(Boolean),
    longHeadlines: [r.long_headline_1, r.long_headline_2, r.long_headline_3, r.long_headline_4, r.long_headline_5]
      .map((v) => String(v || '').trim())
      .filter(Boolean),
    descriptions: [r.description, r.description2, r.description3, r.description4, r.description5]
      .map((v) => String(v || '').trim())
      .filter(Boolean),
    businessName: String(r.business_name || r.brandName || '').trim(),
    finalUrl: String(r.destinationUrl || '').trim(),
    callToAction: String(r.callToAction || r.call_to_action || '').trim(),
  };
}

export interface PmaxValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  field?: string;
}

export interface PmaxAssetGroupValidation {
  groupKey: string;
  market: string;
  phase: string;
  adGroup: string;
  text: PmaxTextValues;
  buckets: PmaxImageBuckets;
  errors: PmaxValidationIssue[];
  warnings: PmaxValidationIssue[];
  isValid: boolean;
  rows: CreativeTextAssetRow[];
}

export function pmaxGroupKey(market: string, phase: string, adGroup: string): string {
  return [market || '', phase || '', adGroup || ''].map((s) => s.trim()).join('||');
}

/** Validate the PMax text minimums for a single set of values. */
export function validatePmaxText(text: PmaxTextValues): PmaxValidationIssue[] {
  const issues: PmaxValidationIssue[] = [];
  const longH = text.headlines.filter((h) => h.length > PMAX_LIMITS.HEADLINE_MAX);
  longH.forEach((h) => issues.push({
    code: 'HEADLINE_TOO_LONG',
    message: `Headline "${h.slice(0, 30)}…" exceeds ${PMAX_LIMITS.HEADLINE_MAX} chars (${h.length})`,
    severity: 'error',
    field: 'headline',
  }));
  if (text.headlines.length < PMAX_LIMITS.MIN_HEADLINES) {
    issues.push({
      code: 'MIN_HEADLINES',
      message: `PMax requires ${PMAX_LIMITS.MIN_HEADLINES} headlines (≤${PMAX_LIMITS.HEADLINE_MAX} chars). Found ${text.headlines.length}.`,
      severity: 'error',
      field: 'headline',
    });
  }
  if (text.longHeadlines.length < PMAX_LIMITS.MIN_LONG_HEADLINES) {
    issues.push({
      code: 'MIN_LONG_HEADLINES',
      message: `PMax requires 1 long headline (≤${PMAX_LIMITS.LONG_HEADLINE_MAX} chars).`,
      severity: 'error',
      field: 'long_headline_1',
    });
  }
  text.longHeadlines.filter((l) => l.length > PMAX_LIMITS.LONG_HEADLINE_MAX).forEach((l) => issues.push({
    code: 'LONG_HEADLINE_TOO_LONG',
    message: `Long headline exceeds ${PMAX_LIMITS.LONG_HEADLINE_MAX} chars (${l.length}).`,
    severity: 'error',
    field: 'long_headline_1',
  }));
  if (text.descriptions.length < PMAX_LIMITS.MIN_DESCRIPTIONS) {
    issues.push({
      code: 'MIN_DESCRIPTIONS',
      message: `PMax requires ${PMAX_LIMITS.MIN_DESCRIPTIONS} descriptions (≤${PMAX_LIMITS.DESCRIPTION_MAX} chars; at least one ≤${PMAX_LIMITS.DESCRIPTION_SHORT_MAX}).`,
      severity: 'error',
      field: 'description',
    });
  }
  text.descriptions.filter((d) => d.length > PMAX_LIMITS.DESCRIPTION_MAX).forEach((d) => issues.push({
    code: 'DESCRIPTION_TOO_LONG',
    message: `Description exceeds ${PMAX_LIMITS.DESCRIPTION_MAX} chars (${d.length}).`,
    severity: 'error',
    field: 'description',
  }));
  // At least one description ≤60 chars (Google's "short description" requirement).
  if (text.descriptions.length >= PMAX_LIMITS.MIN_DESCRIPTIONS) {
    const hasShort = text.descriptions.some((d) => d.length > 0 && d.length <= PMAX_LIMITS.DESCRIPTION_SHORT_MAX);
    if (!hasShort) {
      issues.push({
        code: 'SHORT_DESCRIPTION_REQUIRED',
        message: `At least one description must be ≤${PMAX_LIMITS.DESCRIPTION_SHORT_MAX} characters (currently shortest is ${Math.min(...text.descriptions.map((d) => d.length))}).`,
        severity: 'error',
        field: 'description',
      });
    }
  }
  if (!text.businessName) {
    issues.push({ code: 'BUSINESS_NAME_REQUIRED', message: 'Business name is required (≤25 chars).', severity: 'error', field: 'businessName' });
  } else if (text.businessName.length > PMAX_LIMITS.BUSINESS_NAME_MAX) {
    issues.push({ code: 'BUSINESS_NAME_TOO_LONG', message: `Business name exceeds ${PMAX_LIMITS.BUSINESS_NAME_MAX} chars (${text.businessName.length}).`, severity: 'error', field: 'businessName' });
  }
  if (!text.finalUrl) {
    issues.push({ code: 'FINAL_URL_REQUIRED', message: 'Final URL is required.', severity: 'error', field: 'finalUrl' });
  }
  if (!text.callToAction) {
    issues.push({ code: 'CALL_TO_ACTION_REQUIRED', message: 'A Google-supported Call to Action is required.', severity: 'error', field: 'callToAction' });
  }
  return issues;
}

/** Validate the image minimums for a bucketed asset group. */
export function validatePmaxImages(buckets: PmaxImageBuckets): PmaxValidationIssue[] {
  const issues: PmaxValidationIssue[] = [];
  if (buckets.marketingImages.length < 1) {
    issues.push({
      code: 'MISSING_MARKETING_IMAGE',
      message: `Need at least 1 Marketing Image (1.91:1, ≥${PMAX_LIMITS.MARKETING_IMAGE_MIN_W}×${PMAX_LIMITS.MARKETING_IMAGE_MIN_H}).`,
      severity: 'error',
      field: 'images',
    });
  }
  if (buckets.squareImages.length < 1) {
    issues.push({
      code: 'MISSING_SQUARE_MARKETING_IMAGE',
      message: `Need at least 1 Square Marketing Image (1:1, ≥${PMAX_LIMITS.SQUARE_IMAGE_MIN_W}×${PMAX_LIMITS.SQUARE_IMAGE_MIN_H}).`,
      severity: 'error',
      field: 'images',
    });
  }
  if (buckets.logos.length < 1) {
    issues.push({
      code: 'MISSING_LOGO',
      message: `Need at least 1 Logo (1:1, ≥${PMAX_LIMITS.LOGO_MIN_W}×${PMAX_LIMITS.LOGO_MIN_H}). Tag a logo asset by including "logo" in its filename or folder.`,
      severity: 'error',
      field: 'images',
    });
  }
  if (buckets.videos.length < 1) {
    issues.push({
      code: 'NO_VIDEO_INFO',
      message: 'No video provided — Google will auto-generate one from your images.',
      severity: 'warning',
      field: 'videos',
    });
  }
  return issues;
}

/** Detect whether a row belongs to a Performance Max campaign. Mirrors
 *  detectGoogleNonSearchType but inlined here to avoid the React import. */
export function isPmaxRow(row: CreativeTextAssetRow): boolean {
  if ((row.platform || '').toLowerCase() !== 'google') return false;
  const t = `${String(row.googleCampaignType || '')} ${String(row.phase || '')}`.toLowerCase();
  return t.includes('performance') || t.includes('pmax') || t.includes('p-max');
}

/** Group all PMax rows by (market, phase, ad_group) and validate each group. */
export function validatePmaxAssetGroups(rows: CreativeTextAssetRow[]): PmaxAssetGroupValidation[] {
  const groups = new Map<string, CreativeTextAssetRow[]>();
  for (const r of rows) {
    if (!isPmaxRow(r)) continue;
    const key = pmaxGroupKey(r.market, r.phase, r.adSet);
    const arr = groups.get(key) || [];
    arr.push(r);
    groups.set(key, arr);
  }
  const out: PmaxAssetGroupValidation[] = [];
  for (const [key, groupRows] of groups.entries()) {
    // Pick the row with the most-populated text values to sample from. Falls
    // back to the first row when none are populated.
    const sample = groupRows.reduce((best, cur) => {
      const bt = readPmaxText(best);
      const ct = readPmaxText(cur);
      const score = (t: PmaxTextValues) => t.headlines.length + t.longHeadlines.length + t.descriptions.length + (t.businessName ? 1 : 0);
      return score(ct) > score(bt) ? cur : best;
    }, groupRows[0]);
    const text = readPmaxText(sample);
    const buckets = bucketPmaxImages(groupRows);
    const errors: PmaxValidationIssue[] = [];
    const warnings: PmaxValidationIssue[] = [];
    [...validatePmaxText(text), ...validatePmaxImages(buckets)].forEach((i) =>
      (i.severity === 'error' ? errors : warnings).push(i),
    );
    out.push({
      groupKey: key,
      market: sample.market,
      phase: sample.phase,
      adGroup: sample.adSet,
      text,
      buckets,
      errors,
      warnings,
      isValid: errors.length === 0,
      rows: groupRows,
    });
  }
  return out;
}

/** Quick boolean for the editor — true if every PMax group passes. */
export function arePmaxGroupsValid(rows: CreativeTextAssetRow[]): { valid: boolean; failingGroups: PmaxAssetGroupValidation[] } {
  const groups = validatePmaxAssetGroups(rows);
  const failing = groups.filter((g) => !g.isValid);
  return { valid: failing.length === 0, failingGroups: failing };
}
