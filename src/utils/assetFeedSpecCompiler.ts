// Meta asset_feed_spec Compiler
// Compiles asset customization groups into valid Meta Marketing API payloads
// Reference: https://developers.facebook.com/docs/marketing-api/ad-creative/asset-feed-spec/asset-customization-rules/

import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';
import {
  type DeliveryBucket,
  type CustomizationType,
  type DetectedACGroup,
  classifyDeliveryBucket,
  detectLanguage,
  getLocale,
  META_PLACEMENT_MAP,
  DELIVERY_BUCKETS,
} from './assetCustomizationEngine';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssetFeedImage {
  hash?: string;
  url?: string;
  url_tags?: string;
  adlabels?: Array<{ name: string }>;
}

interface AssetFeedVideo {
  video_id?: string;
  thumbnail_hash?: string;
  thumbnail_url?: string;
  adlabels?: Array<{ name: string }>;
}

interface AssetFeedBody {
  text: string;
  adlabels?: Array<{ name: string }>;
}

interface AssetFeedTitle {
  text: string;
  adlabels?: Array<{ name: string }>;
}

interface AssetFeedDescription {
  text: string;
  adlabels?: Array<{ name: string }>;
}

interface AssetFeedLinkUrl {
  website_url: string;
  adlabels?: Array<{ name: string }>;
}

// Meta expects call_to_action_types as plain strings e.g. ["SHOP_NOW"]
type AssetFeedCallToActionType = string;

interface AssetCustomizationRule {
  customization_spec: Record<string, any>;
  image_label?: { name: string };
  video_label?: { name: string };
  body_label?: { name: string };
  title_label?: { name: string };
  description_label?: { name: string };
  link_url_label?: { name: string };
  call_to_action_type_label?: { name: string };
}

export interface CompiledAssetFeedSpec {
  images?: AssetFeedImage[];
  videos?: AssetFeedVideo[];
  bodies: AssetFeedBody[];
  titles?: AssetFeedTitle[];
  descriptions?: AssetFeedDescription[];
  link_urls?: AssetFeedLinkUrl[];
  call_to_action_types?: AssetFeedCallToActionType[];
  asset_customization_rules?: AssetCustomizationRule[];
  optimization_type?: string;
}

export interface CompilationResult {
  success: boolean;
  spec: CompiledAssetFeedSpec | null;
  customizationRules: AssetCustomizationRule[] | null;
  errors: string[];
  warnings: string[];
}

// ─── Label Helpers ───────────────────────────────────────────────────────────

function makeBucketLabel(bucket: DeliveryBucket): string {
  return `bucket_${bucket}`;
}

function makeLangLabel(langCode: string): string {
  return `lang_${langCode}`;
}

function makeVariantLabel(index: number): string {
  return `variant_${index}`;
}

// ─── Compilers ───────────────────────────────────────────────────────────────

/**
 * Compile a placement customization group into asset_feed_spec.
 */
function compilePlacement(
  group: DetectedACGroup
): CompilationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const images: AssetFeedImage[] = [];
  const videos: AssetFeedVideo[] = [];
  const bodies: AssetFeedBody[] = [];
  const titles: AssetFeedTitle[] = [];
  const descriptions: AssetFeedDescription[] = [];
  const linkUrls: AssetFeedLinkUrl[] = [];
  const ctaTypes: AssetFeedCallToActionType[] = [];
  const rules: AssetCustomizationRule[] = [];

  for (const [bucket, rows] of group.deliveryBuckets) {
    if (bucket === 'other') continue;
    if (rows.length === 0) continue;

    const row = rows[0]; // One per bucket enforced by validation
    const label = makeBucketLabel(bucket);
    const adlabels = [{ name: label }];
    const placements = META_PLACEMENT_MAP[bucket];

    // Add media asset
    if (row.mediaType === 'video') {
      videos.push({ adlabels });
      // Video will be filled by platform IDs during push
    } else {
      images.push({ adlabels });
    }

    // Add text assets
    if (row.primaryText) {
      bodies.push({ text: row.primaryText, adlabels });
    }
    if (row.headline) {
      titles.push({ text: row.headline, adlabels });
    }
    if (row.description) {
      descriptions.push({ text: row.description, adlabels });
    }
    if (row.destinationUrl) {
      linkUrls.push({ website_url: row.destinationUrl, adlabels });
    }
    if (row.callToAction) {
      ctaTypes.push({ value: String(row.callToAction), adlabels });
    }

    // Build customization rule
    const rule: AssetCustomizationRule = {
      customization_spec: {
        publisher_platforms: ['facebook', 'instagram'],
        ...(placements.length > 0 ? {
          facebook_positions: placements.filter(p => p.startsWith('facebook_')).map(p => p.replace('facebook_', '')),
          instagram_positions: placements.filter(p => p.startsWith('instagram_')).map(p => p.replace('instagram_', '')),
        } : {}),
      },
    };

    if (row.mediaType === 'video') {
      rule.video_label = { name: label };
    } else {
      rule.image_label = { name: label };
    }

    if (row.primaryText) rule.body_label = { name: label };
    if (row.headline) rule.title_label = { name: label };
    if (row.description) rule.description_label = { name: label };
    if (row.destinationUrl) rule.link_url_label = { name: label };
    if (row.callToAction) rule.call_to_action_type_label = { name: label };

    rules.push(rule);
  }

  if (rules.length < 2) {
    errors.push('Placement customization requires at least 2 different delivery buckets');
  }

  const spec: CompiledAssetFeedSpec = {
    ...(images.length > 0 ? { images } : {}),
    ...(videos.length > 0 ? { videos } : {}),
    bodies,
    ...(titles.length > 0 ? { titles } : {}),
    ...(descriptions.length > 0 ? { descriptions } : {}),
    ...(linkUrls.length > 0 ? { link_urls: linkUrls } : {}),
    ...(ctaTypes.length > 0 ? { call_to_action_types: ctaTypes } : {}),
    asset_customization_rules: rules,
  };

  return {
    success: errors.length === 0,
    spec,
    customizationRules: rules,
    errors,
    warnings,
  };
}

/**
 * Compile a language customization group into asset_feed_spec.
 */
function compileLanguage(
  group: DetectedACGroup,
  defaultLanguage?: string,
  languageTexts?: Map<string, Record<string, string>>
): CompilationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const images: AssetFeedImage[] = [];
  const videos: AssetFeedVideo[] = [];
  const bodies: AssetFeedBody[] = [];
  const titles: AssetFeedTitle[] = [];
  const descriptions: AssetFeedDescription[] = [];
  const linkUrls: AssetFeedLinkUrl[] = [];
  const ctaTypes: AssetFeedCallToActionType[] = [];
  const rules: AssetCustomizationRule[] = [];

  const langKeys = [...group.languages.keys()].filter(l => l !== 'unknown');

  if (!defaultLanguage && langKeys.length > 0) {
    defaultLanguage = langKeys[0];
    warnings.push(`Default language auto-set to ${defaultLanguage.toUpperCase()}`);
  }

  for (const [lang, rows] of group.languages) {
    if (lang === 'unknown') continue;
    if (rows.length === 0) continue;

    const row = rows[0];
    const label = makeLangLabel(lang);
    const adlabels = [{ name: label }];
    const locale = getLocale(lang);

    // Media
    if (row.mediaType === 'video') {
      videos.push({ adlabels });
    } else {
      images.push({ adlabels });
    }

    // Use per-language text overrides if available, otherwise fall back to row data
    const langText = languageTexts?.get(lang);
    const primaryText = langText?.primaryText || row.primaryText;
    const headline = langText?.headline || row.headline;
    const description = langText?.description || row.description;
    const destinationUrl = langText?.destinationUrl || row.destinationUrl;
    const callToAction = langText?.callToAction || row.callToAction;

    if (primaryText) bodies.push({ text: primaryText, adlabels });
    if (headline) titles.push({ text: headline, adlabels });
    if (description) descriptions.push({ text: description, adlabels });
    if (destinationUrl) linkUrls.push({ website_url: destinationUrl, adlabels });
    if (callToAction) ctaTypes.push({ value: String(callToAction), adlabels });

    const rule: AssetCustomizationRule = {
      customization_spec: {
        locales: [locale],
      },
    };

    if (row.mediaType === 'video') {
      rule.video_label = { name: label };
    } else {
      rule.image_label = { name: label };
    }
    if (primaryText) rule.body_label = { name: label };
    if (headline) rule.title_label = { name: label };
    if (description) rule.description_label = { name: label };
    if (destinationUrl) rule.link_url_label = { name: label };
    if (callToAction) rule.call_to_action_type_label = { name: label };

    rules.push(rule);
  }

  if (rules.length < 2) {
    errors.push('Language customization requires at least 2 different languages');
  }

  const spec: CompiledAssetFeedSpec = {
    ...(images.length > 0 ? { images } : {}),
    ...(videos.length > 0 ? { videos } : {}),
    bodies,
    ...(titles.length > 0 ? { titles } : {}),
    ...(descriptions.length > 0 ? { descriptions } : {}),
    ...(linkUrls.length > 0 ? { link_urls: linkUrls } : {}),
    ...(ctaTypes.length > 0 ? { call_to_action_types: ctaTypes } : {}),
    asset_customization_rules: rules,
  };

  return {
    success: errors.length === 0,
    spec,
    customizationRules: rules,
    errors,
    warnings,
  };
}

/**
 * Compile a flexible creative (multiple asset variations) group.
 * No customization_rules — Meta dynamically optimizes combinations.
 */
function compileFlexible(
  group: DetectedACGroup,
  defaultLanguage?: string,
  languageTexts?: Map<string, Record<string, string>>
): CompilationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const images: AssetFeedImage[] = [];
  const videos: AssetFeedVideo[] = [];
  const bodies: AssetFeedBody[] = [];
  const titles: AssetFeedTitle[] = [];
  const descriptions: AssetFeedDescription[] = [];
  const linkUrls: AssetFeedLinkUrl[] = [];
  const ctaTypes: AssetFeedCallToActionType[] = [];

  // Media from rows
  group.rows.forEach((row, idx) => {
    const label = makeVariantLabel(idx);
    const adlabels = [{ name: label }];
    if (row.mediaType === 'video') {
      videos.push({ adlabels });
    } else {
      images.push({ adlabels });
    }
  });

  // Text assets: prefer pasted language texts, fall back to row data
  if (languageTexts && languageTexts.size > 0) {
    const seenBodies = new Set<string>();
    const seenTitles = new Set<string>();
    const seenDescriptions = new Set<string>();
    const seenUrls = new Set<string>();
    const seenCtas = new Set<string>();

    for (const [, fields] of languageTexts) {
      const pt = fields.primary_text || fields.primaryText;
      if (pt && !seenBodies.has(pt)) { bodies.push({ text: pt }); seenBodies.add(pt); }
      const hl = fields.headline;
      if (hl && !seenTitles.has(hl)) { titles.push({ text: hl }); seenTitles.add(hl); }
      const desc = fields.description;
      if (desc && !seenDescriptions.has(desc)) { descriptions.push({ text: desc }); seenDescriptions.add(desc); }
      const url = fields.website_url || fields.destinationUrl;
      if (url && !seenUrls.has(url)) { linkUrls.push({ website_url: url }); seenUrls.add(url); }
      const cta = fields.call_to_action || fields.callToAction;
      if (cta && !seenCtas.has(cta)) { ctaTypes.push({ value: cta }); seenCtas.add(cta); }
    }
  } else {
    // Fallback: collect from row data
    const seenBodies = new Set<string>();
    const seenTitles = new Set<string>();
    const seenDescriptions = new Set<string>();
    const seenUrls = new Set<string>();
    const seenCtas = new Set<string>();

    for (const row of group.rows) {
      if (row.primaryText && !seenBodies.has(row.primaryText)) { bodies.push({ text: row.primaryText }); seenBodies.add(row.primaryText); }
      if (row.headline && !seenTitles.has(row.headline)) { titles.push({ text: row.headline }); seenTitles.add(row.headline); }
      if (row.description && !seenDescriptions.has(row.description)) { descriptions.push({ text: row.description }); seenDescriptions.add(row.description); }
      if (row.destinationUrl && !seenUrls.has(row.destinationUrl)) { linkUrls.push({ website_url: row.destinationUrl }); seenUrls.add(row.destinationUrl); }
      if (row.callToAction && !seenCtas.has(String(row.callToAction))) { ctaTypes.push({ value: String(row.callToAction) }); seenCtas.add(String(row.callToAction)); }
    }
  }

  if (bodies.length === 0) {
    errors.push('At least one primary text is required');
  }

  const spec: CompiledAssetFeedSpec = {
    ...(images.length > 0 ? { images } : {}),
    ...(videos.length > 0 ? { videos } : {}),
    bodies,
    ...(titles.length > 0 ? { titles } : {}),
    ...(descriptions.length > 0 ? { descriptions } : {}),
    ...(linkUrls.length > 0 ? { link_urls: linkUrls } : {}),
    ...(ctaTypes.length > 0 ? { call_to_action_types: ctaTypes } : {}),
    optimization_type: 'REGULAR',
  };

  return {
    success: errors.length === 0,
    spec,
    customizationRules: null,
    errors,
    warnings,
  };
}

// ─── Main Compiler ───────────────────────────────────────────────────────────

/**
 * Compile a detected group into a Meta-compatible asset_feed_spec.
 */
export function compileAssetFeedSpec(
  group: DetectedACGroup,
  options?: { defaultLanguage?: string; languageTexts?: Map<string, Record<string, string>> }
): CompilationResult {
  switch (group.type) {
    case 'placement':
      return compilePlacement(group);
    case 'language':
      return compileLanguage(group, options?.defaultLanguage, options?.languageTexts);
    case 'flexible_creative':
      return compileFlexible(group, options?.defaultLanguage, options?.languageTexts);
    default:
      return {
        success: false,
        spec: null,
        customizationRules: null,
        errors: [`Unknown customization type: ${group.type}`],
        warnings: [],
      };
  }
}
