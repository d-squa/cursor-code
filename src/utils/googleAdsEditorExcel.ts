// Google Ads Editor-style Excel sync for Search / PMax / Lead Gen campaigns.
//
// Exports a 3-tab workbook:
//   1. Campaigns      — read-only reference of expanded campaign × ad-group structure
//   2. Keywords       — Campaign | Ad Group | Keyword | Match Type | Negative
//   3. Ads            — Campaign | Ad Group | Ad Name | Final URL | Path 1 | Path 2 |
//                       H1..H15 (+ Pin1..Pin15) | D1..D4 (+ PinD1..PinD4) |
//                       Long Headline 1..5 | Business Name
//
// Each text cell gets a paired `LEN()` formula column ("Lx" / "Lh1" / etc.) showing
// `len/max`; conditional formatting paints it red when exceeded. Limits per Google Ads:
//   Headline           = 30
//   Description        = 90
//   Path 1 / Path 2    = 15
//   Long Headline      = 90
//   Business Name      = 25
//
// Re-upload returns a structured diff (keyword adds/updates/removes + ad updates) so the
// caller can show a confirmation dialog before committing.

import * as XLSX from 'xlsx';
import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';
import { GOOGLE_CTA_OPTIONS, normalizeGoogleCta, GOOGLE_CTA_LABEL_LIST } from '@/utils/googleCtaOptions';
import { injectDropdownsIntoXlsx, type SheetDropdownSpec } from '@/utils/xlsxDataValidation';

// ---------- Types ----------

export interface GoogleKeywordLike {
  id?: string;
  name: string;
  text?: string;
  matchType?: 'exact' | 'phrase' | 'broad';
  isNegative?: boolean;
  strategy?: 'brand' | 'generic' | 'competition';
  market?: string | null;
  platform?: string | null;
}

export interface ExpandedCampaignRef {
  /** Synthetic campaign name as it will appear in the sheet & in the DSP push. */
  campaignName: string;
  /** Synthetic ad-group name. */
  adGroupName: string;
  /** Logical references back to plan model. */
  market: string;
  phaseName: string;
  /** brand/generic/competition for Search expansions; null for PMax/Lead Gen. */
  strategy: 'brand' | 'generic' | 'competition' | null;
  /** Google campaign type (Search, Performance Max, Lead Gen, ...). */
  googleCampaignType: string;
}

export interface BuildExpansionInput {
  campaignName: string;
  /** Phases on the Google platform of the plan (with optional `googleSearchSplitLevel`). */
  phases: Array<{
    id: string;
    name: string;
    googleCampaignType?: string;
    /** 'campaign' | 'adgroup' — only meaningful for Search phases. */
    googleSearchSplitLevel?: 'campaign' | 'adgroup';
    adSets?: Array<{ id: string; name: string }>;
    market?: string;
  }>;
  /** Markets that the Google platform runs in (one per market name). */
  markets: string[];
  /** Flat keyword list pulled from `campaign.generic_config.selectedKeywords`. */
  keywords: GoogleKeywordLike[];
}

export interface KeywordSheetRow {
  campaignName: string;
  adGroupName: string;
  keyword: string;
  matchType: 'exact' | 'phrase' | 'broad';
  negative: boolean;
}

export interface AdSheetRow {
  campaignName: string;
  adGroupName: string;
  adName: string;
  assignmentId: string | null; // null = newly added in sheet (ignored on apply for now)
  finalUrl: string;
  youtubeVideoUrl: string;
  path1: string;
  path2: string;
  headlines: string[]; // up to 15 (Search RSA), 5 (PMax/Demand Gen/Display), 2 (Video)
  headlinePins: (number | null)[]; // matches headlines length
  descriptions: string[]; // up to 5 (PMax/Demand Gen/Display), 4 (Search RSA/Video)
  descriptionPins: (number | null)[]; // matches descriptions length
  longHeadlines: string[]; // length 5 (PMax/Display); empty for Search RSA, Demand Gen, Video
  businessName: string; // PMax/Demand Gen/Display
  /** Canonical Google CTA enum (e.g. LEARN_MORE) — required for PMax/Demand Gen/Video. */
  callToAction: string;
}

export interface GoogleAdsShellDiff {
  keywords: {
    added: KeywordSheetRow[];
    updated: Array<{ before: KeywordSheetRow; after: KeywordSheetRow }>;
    removed: KeywordSheetRow[];
  };
  ads: {
    updated: Array<{
      assignmentId: string;
      campaignName: string;
      adGroupName: string;
      adName: string;
      changes: Partial<{
        finalUrl: string;
        youtubeVideoUrl: string;
        path1: string;
        path2: string;
        headlines: string[];
        headlinePins: (number | null)[];
        descriptions: string[];
        descriptionPins: (number | null)[];
        longHeadlines: string[];
        businessName: string;
        callToAction: string;
      }>;
    }>;
    /** New RSA rows the user added in the spreadsheet — auto-created on apply. */
    added: AdSheetRow[];
    /** Rows that couldn't be matched to a known (campaign, ad group) — surfaced as warnings. */
    skippedNew: AdSheetRow[];
  };
  /** PMax Asset Group sheet diffs (text + business name + CTA + final URL). */
  pmaxGroups: {
    updated: Array<{
      market: string;
      phaseName: string;
      assetGroupName: string;
      changes: Partial<{
        businessName: string;
        finalUrl: string;
        callToAction: string;
        headlines: string[];
        longHeadlines: string[];
        descriptions: string[];
      }>;
    }>;
    /** Uploaded PMax rows that don't match any known (market, phase, ad group). */
    skippedNew: ParsedPmaxGroupRow[];
    /** Uploaded PMax rows that matched an existing group but had no field differences. */
    unchanged: Array<{ market: string; phaseName: string; assetGroupName: string }>;
  };
}

/** Parsed row from the "PMax Asset Groups" sheet on re-upload. */
export interface ParsedPmaxGroupRow {
  market: string;
  phaseName: string;
  assetGroupName: string;
  groupName: string;
  businessName: string;
  finalUrl: string;
  callToAction: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
}

// ---------- Limits ----------

const HEADLINE_LIMIT = 30;
const DESCRIPTION_LIMIT = 90;
const PATH_LIMIT = 15;
const LONG_HEADLINE_LIMIT = 90;
const BUSINESS_NAME_LIMIT = 25;

// ---------- Per-Google-type Ads sheet specs ----------
//
// Each Google campaign type has different text-asset slot counts and limits.
// The Ads sheet is generated from this spec so the columns + LEN formulas
// always match the platform requirements (Search RSA, PMax, Demand Gen,
// Demand Gen Video / YouTube in-feed, Responsive Display).

export type GoogleAdsSheetType = 'search' | 'pmax' | 'demand_gen' | 'video' | 'display' | 'other';

export interface GoogleAdsSheetSpec {
  type: GoogleAdsSheetType;
  headlineCount: number;
  headlineLimit: number;
  descriptionCount: number;
  descriptionLimit: number;
  longHeadlineCount: number; // 0 disables the column block
  longHeadlineLimit: number;
  hasBusinessName: boolean;
  businessNameLimit: number;
}

const SEARCH_SPEC: GoogleAdsSheetSpec = {
  type: 'search',
  headlineCount: 15, headlineLimit: HEADLINE_LIMIT,
  descriptionCount: 4, descriptionLimit: DESCRIPTION_LIMIT,
  longHeadlineCount: 0, longHeadlineLimit: LONG_HEADLINE_LIMIT,
  hasBusinessName: true, businessNameLimit: BUSINESS_NAME_LIMIT,
};

const PMAX_SPEC: GoogleAdsSheetSpec = {
  type: 'pmax',
  headlineCount: 5, headlineLimit: 30,
  descriptionCount: 5, descriptionLimit: 90,
  longHeadlineCount: 5, longHeadlineLimit: 90,
  hasBusinessName: true, businessNameLimit: 25,
};

const DEMAND_GEN_SPEC: GoogleAdsSheetSpec = {
  type: 'demand_gen',
  headlineCount: 5, headlineLimit: 40,
  descriptionCount: 5, descriptionLimit: 90,
  longHeadlineCount: 0, longHeadlineLimit: 90,
  hasBusinessName: true, businessNameLimit: 25,
};

const VIDEO_SPEC: GoogleAdsSheetSpec = {
  type: 'video',
  headlineCount: 2, headlineLimit: 40,
  descriptionCount: 4, descriptionLimit: 90,
  longHeadlineCount: 0, longHeadlineLimit: 90,
  hasBusinessName: true, businessNameLimit: 25,
};

const DISPLAY_SPEC: GoogleAdsSheetSpec = {
  type: 'display',
  headlineCount: 5, headlineLimit: 30,
  descriptionCount: 5, descriptionLimit: 90,
  longHeadlineCount: 5, longHeadlineLimit: 90,
  hasBusinessName: true, businessNameLimit: 25,
};

export function getGoogleAdsSheetSpec(googleCampaignType?: string | null): GoogleAdsSheetSpec {
  const t = String(googleCampaignType || '').toLowerCase();
  if (!t) return SEARCH_SPEC;
  if (t.includes('search')) return SEARCH_SPEC;
  if (t.includes('performance') || t === 'pmax' || t.includes('pmax')) return PMAX_SPEC;
  if (t.includes('demand') && (t.includes('video') || t.includes('youtube'))) return VIDEO_SPEC;
  if (t.includes('video') || t.includes('youtube')) return VIDEO_SPEC;
  if (t.includes('demand')) return DEMAND_GEN_SPEC;
  if (t.includes('display')) return DISPLAY_SPEC;
  return SEARCH_SPEC;
}

/** Pick a single spec for a workbook by inspecting all expansion rows.
 * If they're mixed (full-shell export), default to Search RSA which is the
 * historical layout (15H/4D + Business Name, no Long Headlines). */
function pickSheetSpec(expansion: ExpandedCampaignRef[]): GoogleAdsSheetSpec {
  const types = new Set(expansion.map((e) => String(e.googleCampaignType || '').toLowerCase()));
  if (types.size === 1) return getGoogleAdsSheetSpec([...types][0]);
  return SEARCH_SPEC;
}

// ---------- Expansion ----------

const STRATEGIES: Array<'brand' | 'generic' | 'competition'> = ['brand', 'generic', 'competition'];

const isSearchCampaign = (type?: string) =>
  String(type || '').toLowerCase().includes('search');

/**
 * Expand the Google plan into discrete (campaign, ad group) pairs the way the DSP
 * push will materialise them. Search phases turn into one campaign per strategy; the
 * `googleSearchSplitLevel` toggle decides whether ad-set-splits live at campaign or
 * ad-group level.
 */
export function buildExpandedStructure(input: BuildExpansionInput): ExpandedCampaignRef[] {
  const out: ExpandedCampaignRef[] = [];

  for (const phase of input.phases) {
    const splits = phase.adSets?.length ? phase.adSets : [{ id: 'default', name: 'default' }];
    const splitOnCampaign = (phase.googleSearchSplitLevel || 'adgroup') === 'campaign';
    const isSearch = isSearchCampaign(phase.googleCampaignType);

    for (const market of input.markets) {
      if (isSearch) {
        // Strategies that have keywords for (market, platform=google). We treat keywords
        // as matching the market when their `market` is missing/blank OR equals the market.
        const usedStrategies = STRATEGIES.filter((strategy) =>
          input.keywords.some(
            (k) =>
              (k.strategy || 'generic') === strategy &&
              !k.isNegative &&
              (!k.market || normMarket(k.market) === normMarket(market)),
          ),
        );
        // Default to ALL three strategies (Brand / Generic / Competition) when no
        // keywords are configured yet — the editor must still surface a shell row for
        // each so users can plan copy before keyword research is done.
        const strategiesForPhase = usedStrategies.length ? usedStrategies : STRATEGIES;

        for (const strategy of strategiesForPhase) {
          if (splitOnCampaign && splits.length > 1) {
            // 1 campaign per (strategy × split), 1 default ad group each
            for (const split of splits) {
              out.push({
                campaignName: `${input.campaignName} | ${market} | ${phase.name} | ${capitalize(strategy)} | ${split.name}`,
                adGroupName: 'Default',
                market,
                phaseName: phase.name,
                strategy,
                googleCampaignType: phase.googleCampaignType || 'Search',
              });
            }
          } else {
            // 1 campaign per strategy, ad groups = splits (or 1 Default)
            for (const split of splits) {
              out.push({
                campaignName: `${input.campaignName} | ${market} | ${phase.name} | ${capitalize(strategy)}`,
                adGroupName: splits.length > 1 ? split.name : 'Default',
                market,
                phaseName: phase.name,
                strategy,
                googleCampaignType: phase.googleCampaignType || 'Search',
              });
            }
          }
        }
      } else {
        // PMax / Lead Gen / Display / etc. — 1 campaign per phase × market, ad groups = splits
        for (const split of splits) {
          out.push({
            campaignName: `${input.campaignName} | ${market} | ${phase.name}`,
            adGroupName: splits.length > 1 ? split.name : 'Default',
            market,
            phaseName: phase.name,
            strategy: null,
            googleCampaignType: phase.googleCampaignType || 'Performance Max',
          });
        }
      }
    }
  }

  return out;
}

// ---------- Build Ad sheet rows from existing assignments ----------

export interface AssignmentLite {
  id: string;
  platform: string;
  market: string;
  phase_name: string;
  ad_set_name: string;
  ad_strategy?: string | null;
  ad_group_name?: string | null;
  destination_url?: string | null;
  path_1?: string | null;
  path_2?: string | null;
  headline?: string | null;
  headline_2?: string | null;
  headline_3?: string | null;
  headline_4?: string | null;
  headline_5?: string | null;
  description?: string | null;
  description_2?: string | null;
  description_3?: string | null;
  description_4?: string | null;
  description_5?: string | null;
  headline_pins?: unknown;
  description_pins?: unknown;
  long_headline_1?: string | null;
  long_headline_2?: string | null;
  long_headline_3?: string | null;
  long_headline_4?: string | null;
  long_headline_5?: string | null;
  business_name?: string | null;
  creatives?: {
    name?: string | null;
    platform_metadata?: Record<string, unknown> | null;
    media_urls?: string[] | null;
  } | null;
}

export function buildAdRowsFromAssignments(
  assignments: AssignmentLite[],
  expansion: ExpandedCampaignRef[],
): AdSheetRow[] {
  const expByKey = new Map<string, ExpandedCampaignRef>();
  for (const ref of expansion) {
    expByKey.set(refKey(ref.market, ref.phaseName, ref.strategy, ref.adGroupName), ref);
  }

  const rows: AdSheetRow[] = [];
  for (const a of assignments) {
    if (a.platform !== 'google') continue;
    // Best-effort match: use ad_strategy + ad_group_name if present, else fall back to any
    // expansion entry for the (market, phase). When the assignment hasn't been migrated yet
    // we just pick the first matching entry so it still appears in the sheet.
    const strategyKey = ((a.ad_strategy as any) || null) as ExpandedCampaignRef['strategy'];
    const adGroup = a.ad_group_name || a.ad_set_name || 'Default';
    const key = refKey(a.market, a.phase_name, strategyKey, adGroup);
    const ref =
      expByKey.get(key) ||
      expansion.find((e) => e.market === a.market && e.phaseName === a.phase_name);
    if (!ref) continue;

    const creativeMeta = (a.creatives?.platform_metadata as Record<string, unknown> | null) || null;
    const youtubeVideoUrl = (() => {
      const fromMeta = creativeMeta && (
        creativeMeta.youtube_video_url ||
        creativeMeta.youtubeVideoUrl ||
        creativeMeta.youtube_video_id ||
        creativeMeta.youtubeVideoId
      );
      if (fromMeta) return String(fromMeta);
      const firstMedia = a.creatives?.media_urls?.[0];
      if (firstMedia && /youtu\.?be/i.test(String(firstMedia))) return String(firstMedia);
      return '';
    })();

    rows.push({
      campaignName: ref.campaignName,
      adGroupName: ref.adGroupName,
      adName: a.creatives?.name || 'Untitled Ad',
      assignmentId: a.id,
      finalUrl: a.destination_url || '',
      youtubeVideoUrl,
      path1: a.path_1 || '',
      path2: a.path_2 || '',
      headlines: [
        a.headline,
        a.headline_2,
        a.headline_3,
        a.headline_4,
        a.headline_5,
        ...Array(10).fill(''),
      ]
        .slice(0, 15)
        .map((v) => String(v || '')),
      headlinePins: padPins(parsePins(a.headline_pins), 15),
      descriptions: [a.description, a.description_2, a.description_3, a.description_4, a.description_5]
        .map((v) => String(v || '')),
      descriptionPins: padPins(parsePins(a.description_pins), 5),
      longHeadlines: [
        a.long_headline_1,
        a.long_headline_2,
        a.long_headline_3,
        a.long_headline_4,
        a.long_headline_5,
      ].map((v) => String(v || '')),
      businessName: a.business_name || '',
      callToAction: normalizeGoogleCta((a as any).call_to_action) || '',
    });
  }
  return rows;
}

// ---------- Workbook generation ----------

export interface BuildWorkbookInput {
  campaignName: string;
  expansion: ExpandedCampaignRef[];
  keywords: GoogleKeywordLike[];
  adRows: AdSheetRow[];
  /**
   * Whether to include the Keywords tab in the workbook.
   * - Search shell: true (Brand/Generic/Competition keywords from Unified Targeting)
   * - PMax / Demand Gen / Display / etc.: false (these campaign types don't use keywords)
   * Defaults to true for backwards compatibility.
   */
  includeKeywords?: boolean;
}

export async function downloadGoogleAdsShell(input: BuildWorkbookInput): Promise<void> {
  const wb = XLSX.utils.book_new();
  const includeKeywords = input.includeKeywords !== false;

  // ---- Campaigns tab (read-only reference) ----
  const campaignsAoa: (string | number)[][] = [
    ['Campaign', 'Ad Group', 'Strategy', 'Market', 'Campaign Type', 'Phase'],
    ...input.expansion.map((e) => [
      e.campaignName,
      e.adGroupName,
      e.strategy ? capitalize(e.strategy) : '—',
      e.market,
      e.googleCampaignType,
      e.phaseName,
    ]),
  ];
  const campaignsWs = XLSX.utils.aoa_to_sheet(campaignsAoa);
  campaignsWs['!cols'] = [{ wch: 60 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, campaignsWs, 'Campaigns');

  // ---- Keywords tab (Search only) ----
  if (includeKeywords) {
    const keywordsAoa: (string | number)[][] = [
      ['Campaign', 'Ad Group', 'Keyword', 'Match Type', 'Negative'],
    ];
    const expByStrategyMarket = new Map<string, ExpandedCampaignRef[]>();
    for (const ref of input.expansion) {
      if (ref.strategy === null) continue; // PMax has no keywords
      const k = `${ref.market}::${ref.strategy}`;
      if (!expByStrategyMarket.has(k)) expByStrategyMarket.set(k, []);
      expByStrategyMarket.get(k)!.push(ref);
    }
    for (const kw of input.keywords) {
      const strategy = (kw.strategy || 'generic') as 'brand' | 'generic' | 'competition';
      const market = kw.market || '';
      const refs = expByStrategyMarket.get(`${market}::${strategy}`);
      const ref = refs?.[0]; // assign keyword to first matching campaign + its first ad group
      if (!ref) continue;
      keywordsAoa.push([
        ref.campaignName,
        ref.adGroupName,
        kw.name || kw.text || '',
        (kw.matchType || 'broad').toLowerCase(),
        kw.isNegative ? 'Yes' : 'No',
      ]);
    }
    const keywordsWs = XLSX.utils.aoa_to_sheet(keywordsAoa);
    keywordsWs['!cols'] = [{ wch: 60 }, { wch: 24 }, { wch: 32 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, keywordsWs, 'Keywords');
  }

  // ---- Ads tab (per Google campaign type) ----
  // Column layout adapts to the workbook's Google campaign type so each
  // export reflects the platform's real text-asset slots/limits.
  const spec = pickSheetSpec(input.expansion);

  const adsHeader: string[] = [
    'Campaign',
    'Ad Group',
    'Ad Name',
    '__assignmentId__',
    'Final URL',
    'YouTube Video URL',
    'Path 1',
    `LEN P1 (max ${PATH_LIMIT})`,
    'Path 2',
    `LEN P2 (max ${PATH_LIMIT})`,
  ];
  for (let i = 1; i <= spec.headlineCount; i++) {
    adsHeader.push(`Headline ${i}`, `LEN H${i} (max ${spec.headlineLimit})`, `Pin H${i}`);
  }
  for (let i = 1; i <= spec.descriptionCount; i++) {
    adsHeader.push(`Description ${i}`, `LEN D${i} (max ${spec.descriptionLimit})`, `Pin D${i}`);
  }
  for (let i = 1; i <= spec.longHeadlineCount; i++) {
    adsHeader.push(`Long Headline ${i}`, `LEN LH${i} (max ${spec.longHeadlineLimit})`);
  }
  if (spec.hasBusinessName) {
    adsHeader.push('Business Name', `LEN BN (max ${spec.businessNameLimit})`);
  }
  // CTA — required for PMax / Demand Gen / Video; optional for Display.
  // Hidden on Search RSA (Google Search ads don't use a CTA button).
  const includeCta = spec.type !== 'search';
  if (includeCta) {
    adsHeader.push(`Call to Action (${GOOGLE_CTA_LABEL_LIST})`);
  }

  const adsAoa: (string | number)[][] = [adsHeader];

  // Default: only emit rows for creative assignments that were successfully
  // matched to the campaign shell (PMax / Demand Gen / Display / Video get
  // their text assets from Creative Mesh matches).
  //
  // Exception — Google Search (RSA): Search campaigns don't receive creative
  // assignments from Creative Mesh, so we must surface the campaign shell as
  // empty rows so users can author headlines / descriptions / paths / final
  // URLs directly in the Ads tab. One shell row per (campaign, ad group) that
  // doesn't already have an assignment row.
  const isSearchWorkbook = spec.type === 'search';
  let effectiveAdRows: AdSheetRow[] = input.adRows;
  if (isSearchWorkbook) {
    const existingPairs = new Set(
      input.adRows.map((r) => `${r.campaignName}::${r.adGroupName}`),
    );
    const shellRows: AdSheetRow[] = [];
    for (const ref of input.expansion) {
      const key = `${ref.campaignName}::${ref.adGroupName}`;
      if (existingPairs.has(key)) continue;
      existingPairs.add(key); // dedupe within shell as well
      shellRows.push({
        campaignName: ref.campaignName,
        adGroupName: ref.adGroupName,
        adName: '',
        assignmentId: null,
        finalUrl: '',
        youtubeVideoUrl: '',
        path1: '',
        path2: '',
        headlines: Array(15).fill(''),
        headlinePins: Array(15).fill(null),
        descriptions: Array(5).fill(''),
        descriptionPins: Array(5).fill(null),
        longHeadlines: Array(5).fill(''),
        businessName: '',
        callToAction: '',
      });
    }
    effectiveAdRows = [...input.adRows, ...shellRows];
  }

  for (const r of effectiveAdRows) {
    const row: (string | number)[] = [
      r.campaignName,
      r.adGroupName,
      r.adName,
      r.assignmentId || '',
      r.finalUrl,
      r.youtubeVideoUrl || '',
      r.path1,
      '',
      r.path2,
      '',
    ];
    for (let i = 0; i < spec.headlineCount; i++) {
      row.push(r.headlines[i] || '', '', r.headlinePins[i] ?? '');
    }
    for (let i = 0; i < spec.descriptionCount; i++) {
      row.push(r.descriptions[i] || '', '', r.descriptionPins[i] ?? '');
    }
    for (let i = 0; i < spec.longHeadlineCount; i++) {
      row.push(r.longHeadlines[i] || '', '');
    }
    if (spec.hasBusinessName) {
      row.push(r.businessName, '');
    }
    if (includeCta) {
      // Export the UI-friendly label (e.g. "Learn More") so users see/edit a
      // human-readable value. Import re-normalises to the enum.
      const opt = GOOGLE_CTA_OPTIONS.find((o) => o.value === normalizeGoogleCta(r.callToAction));
      row.push(opt ? opt.label : '');
    }
    adsAoa.push(row);
  }
  const adsWs = XLSX.utils.aoa_to_sheet(adsAoa);

  const colLetter = (idx: number) => XLSX.utils.encode_col(idx);
  for (let r = 1; r < adsAoa.length; r++) {
    const rowNum = r + 1;
    setLenFormula(adsWs, 7, rowNum, colLetter(6), PATH_LIMIT);
    setLenFormula(adsWs, 9, rowNum, colLetter(8), PATH_LIMIT);
    let cur = 10;
    for (let i = 0; i < spec.headlineCount; i++) {
      setLenFormula(adsWs, cur + 1, rowNum, colLetter(cur), spec.headlineLimit);
      cur += 3;
    }
    for (let i = 0; i < spec.descriptionCount; i++) {
      setLenFormula(adsWs, cur + 1, rowNum, colLetter(cur), spec.descriptionLimit);
      cur += 3;
    }
    for (let i = 0; i < spec.longHeadlineCount; i++) {
      setLenFormula(adsWs, cur + 1, rowNum, colLetter(cur), spec.longHeadlineLimit);
      cur += 2;
    }
    if (spec.hasBusinessName) {
      setLenFormula(adsWs, cur + 1, rowNum, colLetter(cur), spec.businessNameLimit);
    }
  }

  adsWs['!cols'] = adsHeader.map((h) => ({ wch: h.startsWith('LEN') || h.startsWith('Pin') ? 10 : Math.max(14, Math.min(40, h.length + 2)) }));

  XLSX.utils.book_append_sheet(wb, adsWs, 'Ads');

  // Trigger download — patch the workbook to add a CTA dropdown if applicable.
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const dropdownSpecs: SheetDropdownSpec[] = [];
  if (includeCta) {
    const ctaIdx = adsHeader.length - 1; // CTA is the last appended column
    dropdownSpecs.push({
      sheetName: 'Ads',
      columnIndex: ctaIdx,
      startRow: 2,
      endRow: Math.max(1000, adsAoa.length),
      options: GOOGLE_CTA_OPTIONS.map((o) => o.label),
      prompt: 'Pick a Google-supported call to action.',
    });
  }
  const finalBuf = await injectDropdownsIntoXlsx(buf, dropdownSpecs);
  const blob = new Blob([finalBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safe = input.campaignName.replace(/[^a-zA-Z0-9]/g, '_');
  link.download = `${safe}_google_ads_shell_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface PmaxAssetGroupShellRow {
  market: string;
  phaseName: string;
  assetGroupName: string;
  groupName?: string;
  businessName?: string;
  finalUrl?: string;
  callToAction?: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  marketingImages?: string[];
  squareImages?: string[];
  portraitImages?: string[];
  logos?: string[];
  videos?: string[];
}

export async function downloadGooglePmaxAssetGroupShell(input: {
  campaignName: string;
  groups: PmaxAssetGroupShellRow[];
}): Promise<void> {
  const wb = XLSX.utils.book_new();
  // PMax slot counts (per Google's spec: up to 15 headlines, 5 long headlines, 5 descriptions).
  // We expose the practical authoring set: 5 headlines, 5 long headlines, 5 descriptions.
  const HEADLINE_SLOTS = 5;
  const LONG_HEADLINE_SLOTS = 5;
  const DESCRIPTION_SLOTS = 5;
  const HEADLINE_LIMIT = 30;
  const LONG_HEADLINE_LIMIT = 90;
  const DESCRIPTION_LIMIT = 90;
  const SHORT_DESCRIPTION_LIMIT = 60; // Google PMax requires at least one description ≤60 chars
  // Per-slot description limits: slot 1 is the mandatory short description.
  const descriptionLimitForSlot = (i: number) => (i === 0 ? SHORT_DESCRIPTION_LIMIT : DESCRIPTION_LIMIT);

  const headlineHeaders: string[] = [];
  for (let i = 1; i <= HEADLINE_SLOTS; i++) {
    headlineHeaders.push(`Headline ${i} (max ${HEADLINE_LIMIT})`, `LEN H${i}`);
  }
  const longHeadlineHeaders: string[] = [];
  for (let i = 1; i <= LONG_HEADLINE_SLOTS; i++) {
    longHeadlineHeaders.push(`Long Headline ${i} (max ${LONG_HEADLINE_LIMIT})`, `LEN LH${i}`);
  }
  const descriptionHeaders: string[] = [];
  for (let i = 1; i <= DESCRIPTION_SLOTS; i++) {
    const lim = descriptionLimitForSlot(i - 1);
    const label = i === 1 ? `Short Description 1 (max ${lim}, REQUIRED)` : `Description ${i} (max ${lim})`;
    descriptionHeaders.push(label, `LEN D${i}`);
  }

  const headers = [
    'Market',
    'Phase',
    'Asset Group',
    'Group Name',
    'Business Name',
    `LEN BN (max ${BUSINESS_NAME_LIMIT})`,
    'Final URL',
    `Call to Action (${GOOGLE_CTA_LABEL_LIST})`,
    ...headlineHeaders,
    ...longHeadlineHeaders,
    ...descriptionHeaders,
    'Marketing Images',
    'Square Images',
    'Portrait Images',
    'Logos',
    'Videos',
  ];

  const expandSlots = (values: string[], slots: number): string[] => {
    const out: string[] = [];
    for (let i = 0; i < slots; i++) {
      out.push(values[i] || '', ''); // value cell + empty LEN cell (filled via formula below)
    }
    return out;
  };

  const aoa: (string | number)[][] = [
    headers,
    ...input.groups.map((g) => [
      g.market,
      g.phaseName,
      g.assetGroupName,
      g.groupName || g.assetGroupName,
      g.businessName || '',
      '',
      g.finalUrl || '',
      GOOGLE_CTA_OPTIONS.find((o) => o.value === normalizeGoogleCta(g.callToAction || ''))?.label || '',
      ...expandSlots(g.headlines.filter(Boolean), HEADLINE_SLOTS),
      ...expandSlots(g.longHeadlines.filter(Boolean), LONG_HEADLINE_SLOTS),
      ...expandSlots(g.descriptions.filter(Boolean), DESCRIPTION_SLOTS),
      (g.marketingImages || []).join('\n'),
      (g.squareImages || []).join('\n'),
      (g.portraitImages || []).join('\n'),
      (g.logos || []).join('\n'),
      (g.videos || []).join('\n'),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Column widths: meta cols + (value, LEN) pairs for each slot + 5 asset cols
  const meta = [
    { wch: 14 }, { wch: 28 }, { wch: 34 }, { wch: 34 }, { wch: 24 }, { wch: 10 },
    { wch: 50 }, { wch: 26 },
  ];
  const slotCols = (count: number, valWidth: number) => {
    const out: { wch: number }[] = [];
    for (let i = 0; i < count; i++) out.push({ wch: valWidth }, { wch: 8 });
    return out;
  };
  ws['!cols'] = [
    ...meta,
    ...slotCols(HEADLINE_SLOTS, 36),
    ...slotCols(LONG_HEADLINE_SLOTS, 50),
    ...slotCols(DESCRIPTION_SLOTS, 50),
    { wch: 50 }, { wch: 50 }, { wch: 50 }, { wch: 50 }, { wch: 50 },
  ];

  // Per-slot LEN formulas: each value cell at column index `c` is followed by a LEN cell at `c+1`.
  const slotStartIndex = 8; // after the 8 meta columns
  const totalSlots = HEADLINE_SLOTS + LONG_HEADLINE_SLOTS + DESCRIPTION_SLOTS;
  for (let r = 1; r < aoa.length; r++) {
    for (let s = 0; s < totalSlots; s++) {
      const valColIdx = slotStartIndex + s * 2;
      const lenColIdx = valColIdx + 1;
      const valColLetter = XLSX.utils.encode_col(valColIdx);
      let limit = HEADLINE_LIMIT;
      if (s >= HEADLINE_SLOTS && s < HEADLINE_SLOTS + LONG_HEADLINE_SLOTS) limit = LONG_HEADLINE_LIMIT;
      else if (s >= HEADLINE_SLOTS + LONG_HEADLINE_SLOTS) {
        const descIdx = s - HEADLINE_SLOTS - LONG_HEADLINE_SLOTS;
        limit = descriptionLimitForSlot(descIdx);
      }
      setLenFormula(ws, lenColIdx, r + 1, valColLetter, limit);
    }
  }
  const bnCol = XLSX.utils.encode_col(4);
  for (let r = 1; r < aoa.length; r++) {
    setLenFormula(ws, 5, r + 1, bnCol, BUSINESS_NAME_LIMIT);
  }
  XLSX.utils.book_append_sheet(wb, ws, 'PMax Asset Groups');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const finalBuf = await injectDropdownsIntoXlsx(buf, [{
    sheetName: 'PMax Asset Groups',
    columnIndex: 7,
    startRow: 2,
    endRow: Math.max(1000, aoa.length),
    options: GOOGLE_CTA_OPTIONS.map((o) => o.label),
    prompt: 'Pick a Google-supported call to action.',
  }]);
  const blob = new Blob([finalBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safe = input.campaignName.replace(/[^a-zA-Z0-9]/g, '_');
  link.download = `${safe}_pmax_asset_groups_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------- Parsing & diffing ----------

export interface ParsedShell {
  keywords: KeywordSheetRow[];
  ads: AdSheetRow[];
  pmaxGroups: ParsedPmaxGroupRow[];
}

export async function parseGoogleAdsShell(file: File): Promise<ParsedShell> {
  const data = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(data, { type: 'array' });

  // ---- Keywords sheet ----
  const kwSheet = wb.Sheets['Keywords'];
  const keywords: KeywordSheetRow[] = [];
  if (kwSheet) {
    const aoa = XLSX.utils.sheet_to_json(kwSheet, { header: 1 }) as any[][];
    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i];
      const kw = String(row?.[2] || '').trim();
      if (!kw) continue;
      const matchType = String(row[3] || 'broad').trim().toLowerCase() as 'exact' | 'phrase' | 'broad';
      keywords.push({
        campaignName: String(row[0] || '').trim(),
        adGroupName: String(row[1] || '').trim(),
        keyword: kw,
        matchType: ['exact', 'phrase', 'broad'].includes(matchType) ? matchType : 'broad',
        negative: /^(yes|true|y|1)$/i.test(String(row[4] || '').trim()),
      });
    }
  }

  // ---- Ads sheet ----
  // Header-driven parsing so this works for every per-type layout
  // (Search RSA, PMax, Demand Gen, Video, Display) which differ in
  // headline / description / long-headline counts.
  const adsSheet = wb.Sheets['Ads'];
  const ads: AdSheetRow[] = [];
  if (adsSheet) {
    const aoa = XLSX.utils.sheet_to_json(adsSheet, { header: 1 }) as any[][];
    const header = (aoa[0] || []).map((h) => String(h ?? '').trim());
    const indexOfHeader = (label: string) => header.findIndex((h) => h === label);

    const headlineCols: number[] = [];
    const headlinePinCols: number[] = [];
    for (let i = 1; i <= 15; i++) {
      const idx = indexOfHeader(`Headline ${i}`);
      if (idx === -1) break;
      headlineCols.push(idx);
      const pinIdx = indexOfHeader(`Pin H${i}`);
      headlinePinCols.push(pinIdx);
    }
    const descriptionCols: number[] = [];
    const descriptionPinCols: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const idx = indexOfHeader(`Description ${i}`);
      if (idx === -1) break;
      descriptionCols.push(idx);
      const pinIdx = indexOfHeader(`Pin D${i}`);
      descriptionPinCols.push(pinIdx);
    }
    const longHeadlineCols: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const idx = indexOfHeader(`Long Headline ${i}`);
      if (idx === -1) break;
      longHeadlineCols.push(idx);
    }
    const businessNameCol = indexOfHeader('Business Name');
    // CTA column header is dynamic (includes the label list hint), so match by prefix.
    const ctaCol = header.findIndex((h) => /^Call to Action/i.test(h));
    const finalUrlCol = indexOfHeader('Final URL');
    const youtubeVideoUrlCol = indexOfHeader('YouTube Video URL');
    const path1Col = indexOfHeader('Path 1');
    const path2Col = indexOfHeader('Path 2');
    const adNameCol = indexOfHeader('Ad Name');
    const assignmentIdCol = indexOfHeader('__assignmentId__');

    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i];
      const campaignName = String(row?.[0] || '').trim();
      const adGroupName = String(row?.[1] || '').trim();
      if (!campaignName) continue;

      const headlines: string[] = [];
      const headlinePins: (number | null)[] = [];
      for (let h = 0; h < headlineCols.length; h++) {
        headlines.push(String(row[headlineCols[h]] || ''));
        headlinePins.push(headlinePinCols[h] >= 0 ? toPin(row[headlinePinCols[h]]) : null);
      }
      const descriptions: string[] = [];
      const descriptionPins: (number | null)[] = [];
      for (let d = 0; d < descriptionCols.length; d++) {
        descriptions.push(String(row[descriptionCols[d]] || ''));
        descriptionPins.push(descriptionPinCols[d] >= 0 ? toPin(row[descriptionPinCols[d]]) : null);
      }
      const longHeadlines: string[] = Array(5).fill('');
      for (let l = 0; l < longHeadlineCols.length; l++) {
        longHeadlines[l] = String(row[longHeadlineCols[l]] || '');
      }
      const businessName = businessNameCol >= 0 ? String(row[businessNameCol] || '').trim() : '';

      const hasContent =
        headlines.some((h) => h.trim()) ||
        descriptions.some((d) => d.trim()) ||
        longHeadlines.some((l) => l.trim()) ||
        !!businessName;
      const explicitName = adNameCol >= 0 ? String(row[adNameCol] || '').trim() : '';
      if (!explicitName && !hasContent) continue;
      ads.push({
        campaignName,
        adGroupName,
        adName: explicitName,
        assignmentId: assignmentIdCol >= 0 ? (String(row[assignmentIdCol] || '').trim() || null) : null,
        finalUrl: finalUrlCol >= 0 ? String(row[finalUrlCol] || '').trim() : '',
        youtubeVideoUrl: youtubeVideoUrlCol >= 0 ? String(row[youtubeVideoUrlCol] || '').trim() : '',
        path1: path1Col >= 0 ? String(row[path1Col] || '').trim() : '',
        path2: path2Col >= 0 ? String(row[path2Col] || '').trim() : '',
        headlines,
        headlinePins,
        descriptions,
        descriptionPins,
        longHeadlines,
        businessName,
        callToAction: ctaCol >= 0 ? (normalizeGoogleCta(String(row[ctaCol] || '')) || '') : '',
      });
    }
  }

  // ---- PMax Asset Groups sheet (shared-asset-pool model) ----
  // Columns (must mirror downloadGooglePmaxAssetGroupShell):
  // 0 Market | 1 Phase | 2 Asset Group | 3 Group Name | 4 Business Name |
  // 5 LEN BN | 6 Final URL | 7 Call to Action |
  // 8.. value/LEN pairs for 5 Headlines, 5 Long Headlines, 5 Descriptions
  const pmaxGroups: ParsedPmaxGroupRow[] = [];
  const pmaxSheet = wb.Sheets['PMax Asset Groups'];
  if (pmaxSheet) {
    const aoa = XLSX.utils.sheet_to_json(pmaxSheet, { header: 1 }) as any[][];
    const META_COLS = 8;
    const HEADLINE_SLOTS = 5;
    const LONG_HEADLINE_SLOTS = 5;
    const DESCRIPTION_SLOTS = 5;
    const headlineStart = META_COLS;
    const longHeadlineStart = headlineStart + HEADLINE_SLOTS * 2;
    const descriptionStart = longHeadlineStart + LONG_HEADLINE_SLOTS * 2;
    const readSlots = (row: any[], start: number, count: number): string[] => {
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        out.push(String(row?.[start + i * 2] ?? '').trim());
      }
      return out;
    };
    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i];
      const market = String(row?.[0] ?? '').trim();
      const phaseName = String(row?.[1] ?? '').trim();
      const assetGroupName = String(row?.[2] ?? '').trim();
      if (!market || !phaseName || !assetGroupName) continue;
      pmaxGroups.push({
        market,
        phaseName,
        assetGroupName,
        groupName: String(row?.[3] ?? '').trim(),
        businessName: String(row?.[4] ?? '').trim(),
        finalUrl: String(row?.[6] ?? '').trim(),
        callToAction: normalizeGoogleCta(String(row?.[7] ?? '')) || '',
        headlines: readSlots(row, headlineStart, HEADLINE_SLOTS),
        longHeadlines: readSlots(row, longHeadlineStart, LONG_HEADLINE_SLOTS),
        descriptions: readSlots(row, descriptionStart, DESCRIPTION_SLOTS),
      });
    }
  }

  return { keywords, ads, pmaxGroups };
}

/** Snapshot of an existing PMax asset group (current state) for diffing against an uploaded sheet. */
export interface CurrentPmaxGroupSnapshot {
  market: string;
  phaseName: string;
  assetGroupName: string;
  businessName: string;
  finalUrl: string;
  callToAction: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
}

export interface DiffInput {
  current: {
    keywords: KeywordSheetRow[];
    ads: AdSheetRow[];
    /**
     * Optional list of (campaign, ad group) pairs that exist in the plan shell
     * even when no creative assignments have been created yet. Used to recognise
     * uploaded rows as "known shell entries" so they're treated as new ads to
     * auto-create instead of being flagged as unmatched.
     */
    shell?: Array<{ campaignName: string; adGroupName: string }>;
    /** Current PMax asset groups (from pmax_asset_groups + pmax_text_assets). */
    pmaxGroups?: CurrentPmaxGroupSnapshot[];
  };
  uploaded: ParsedShell;
}

export function diffShell(input: DiffInput): GoogleAdsShellDiff {
  // ---- Keywords diff ----
  // Key on (keyword, negative) only. The (campaign, ad group) for a keyword is
  // derived from its strategy/market in the plan model; including campaign/ad-group
  // in the key would falsely flag every row as removed+added when the user
  // restructures campaigns or when the original `current` rows were skipped due
  // to a missing market mapping.
  const kwKey = (k: KeywordSheetRow) =>
    `${k.keyword.trim().toLowerCase()}::${k.negative ? '1' : '0'}`;

  const curMap = new Map<string, KeywordSheetRow>();
  for (const k of input.current.keywords) curMap.set(kwKey(k), k);
  const upMap = new Map<string, KeywordSheetRow>();
  for (const k of input.uploaded.keywords) upMap.set(kwKey(k), k);

  const added: KeywordSheetRow[] = [];
  const updated: Array<{ before: KeywordSheetRow; after: KeywordSheetRow }> = [];
  for (const [key, after] of upMap) {
    const before = curMap.get(key);
    if (!before) added.push(after);
    else if (before.matchType !== after.matchType) updated.push({ before, after });
  }
  const removed: KeywordSheetRow[] = [];
  for (const [key, before] of curMap) if (!upMap.has(key)) removed.push(before);

  // ---- Ads diff ----
  // Existing assignmentIds → updates. New rows are split into:
  //  - `added`     : rows whose (campaign, ad group) match a known shell entry
  //                  → auto-created on apply
  //  - `skippedNew`: rows we cannot map → surfaced as warnings
  const adsUpdated: GoogleAdsShellDiff['ads']['updated'] = [];
  const adsAdded: AdSheetRow[] = [];
  const adsSkippedNew: AdSheetRow[] = [];
  const curAdsById = new Map<string, AdSheetRow>();
  const knownShellKeys = new Set<string>();
  // Fallback lookup: when an uploaded row has no __assignmentId__ (e.g. user
  // cleared the helper column or pasted from a sheet that omits it) we still
  // want to map it back to the existing assignment so edits like "Final URL"
  // actually overwrite the row instead of being dropped as an unmatched "new".
  const curAdsByTriple = new Map<string, AdSheetRow>();
  const tripleKey = (campaign: string, adGroup: string, adName: string) =>
    `${campaign.trim().toLowerCase()}::${adGroup.trim().toLowerCase()}::${(adName || '').trim().toLowerCase()}`;
  for (const a of input.current.ads) {
    if (a.assignmentId) curAdsById.set(a.assignmentId, a);
    if (a.assignmentId && a.adName) {
      curAdsByTriple.set(tripleKey(a.campaignName, a.adGroupName, a.adName), a);
    }
    knownShellKeys.add(`${a.campaignName}::${a.adGroupName}`);
  }
  // Also seed shell keys from the plan structure itself, so uploaded rows for
  // (campaign, ad group) pairs that don't yet have any creative assignments
  // are still recognised as valid targets for auto-creation.
  for (const s of input.current.shell || []) {
    knownShellKeys.add(`${s.campaignName}::${s.adGroupName}`);
  }

  // Per-shell counter so auto-generated names stay unique.
  const newRowCounter = new Map<string, number>();

  for (const after of input.uploaded.ads) {
    // Resolve to an existing assignment either by explicit __assignmentId__
    // or, when that column was cleared/missing, by matching the
    // (campaign, ad group, ad name) triple. Without this fallback the row
    // silently slipped into the "new ad" path and changes like Final URL
    // were dropped because the shell-key check usually didn't match either.
    let resolvedBefore: AdSheetRow | undefined;
    let resolvedAssignmentId: string | null = null;
    if (after.assignmentId && curAdsById.has(after.assignmentId)) {
      resolvedBefore = curAdsById.get(after.assignmentId);
      resolvedAssignmentId = after.assignmentId;
    } else if (after.adName) {
      const tk = tripleKey(after.campaignName, after.adGroupName, after.adName);
      const match = curAdsByTriple.get(tk);
      if (match?.assignmentId) {
        resolvedBefore = match;
        resolvedAssignmentId = match.assignmentId;
      }
    }

    if (resolvedBefore && resolvedAssignmentId) {
      const before = resolvedBefore;
      const changes: GoogleAdsShellDiff['ads']['updated'][number]['changes'] = {};
      if (before.finalUrl !== after.finalUrl) changes.finalUrl = after.finalUrl;
      if (before.youtubeVideoUrl !== after.youtubeVideoUrl) changes.youtubeVideoUrl = after.youtubeVideoUrl;
      if (before.path1 !== after.path1) changes.path1 = after.path1;
      if (before.path2 !== after.path2) changes.path2 = after.path2;
      if (!arrEq(before.headlines, after.headlines)) changes.headlines = after.headlines;
      if (!pinArrEq(before.headlinePins, after.headlinePins)) changes.headlinePins = after.headlinePins;
      if (!arrEq(before.descriptions, after.descriptions)) changes.descriptions = after.descriptions;
      if (!pinArrEq(before.descriptionPins, after.descriptionPins))
        changes.descriptionPins = after.descriptionPins;
      if (!arrEq(before.longHeadlines, after.longHeadlines)) changes.longHeadlines = after.longHeadlines;
      if (before.businessName !== after.businessName) changes.businessName = after.businessName;
      if ((before.callToAction || '') !== (after.callToAction || '')) changes.callToAction = after.callToAction;

      if (Object.keys(changes).length > 0) {
        adsUpdated.push({
          assignmentId: resolvedAssignmentId,
          campaignName: after.campaignName,
          adGroupName: after.adGroupName,
          adName: after.adName,
          changes,
        });
      }
      continue;
    }

    // New row — try to attach to a known shell entry
    const shellKey = `${after.campaignName}::${after.adGroupName}`;
    if (!knownShellKeys.has(shellKey)) {
      adsSkippedNew.push(after);
      continue;
    }
    // Auto-generate a friendly Ad Name from the campaign/ad-group taxonomy when
    // the user didn't provide one.
    const autoName = after.adName.trim() || generateAutoAdName(after, newRowCounter);
    adsAdded.push({ ...after, adName: autoName });
  }

  // ---- PMax Asset Groups diff ----
  const normalizePmaxKeyPart = (value: string) =>
    String(value || '')
      .normalize('NFKC')
      .replace(/\u00a0/g, ' ')
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const pmaxKey = (m: string, p: string, g: string) =>
    `${normalizePmaxKeyPart(m)}::${normalizePmaxKeyPart(p)}::${normalizePmaxKeyPart(g)}`;
  const curPmaxByKey = new Map<string, CurrentPmaxGroupSnapshot>();
  for (const g of input.current.pmaxGroups || []) {
    curPmaxByKey.set(pmaxKey(g.market, g.phaseName, g.assetGroupName), g);
  }

  const pmaxUpdated: GoogleAdsShellDiff['pmaxGroups']['updated'] = [];
  const pmaxSkipped: ParsedPmaxGroupRow[] = [];
  const pmaxUnchanged: GoogleAdsShellDiff['pmaxGroups']['unchanged'] = [];

  // Compare ordered, trimmed string arrays — empty trailing slots ignored.
  const trimList = (arr: string[]): string[] => {
    const out = arr.map((v) => String(v || '').trim());
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  };
  const eqList = (a: string[], b: string[]): boolean => {
    const ta = trimList(a);
    const tb = trimList(b);
    if (ta.length !== tb.length) return false;
    for (let i = 0; i < ta.length; i++) if (ta[i] !== tb[i]) return false;
    return true;
  };

  for (const after of input.uploaded.pmaxGroups) {
    const candidateKeys = [
      pmaxKey(after.market, after.phaseName, after.assetGroupName),
      after.groupName ? pmaxKey(after.market, after.phaseName, after.groupName) : '',
    ].filter(Boolean);
    const before = candidateKeys.map((key) => curPmaxByKey.get(key)).find(Boolean);
    const changes: GoogleAdsShellDiff['pmaxGroups']['updated'][number]['changes'] = {};
    if (!before || after.businessName.trim() !== (before.businessName || '').trim()) {
      changes.businessName = after.businessName.trim();
    }
    if (!before || after.finalUrl.trim() !== (before.finalUrl || '').trim()) {
      changes.finalUrl = after.finalUrl.trim();
    }
    const beforeCta = normalizeGoogleCta(before?.callToAction || '') || '';
    const afterCta = normalizeGoogleCta(after.callToAction || '') || '';
    if (afterCta && (!before || afterCta !== beforeCta)) changes.callToAction = afterCta;
    if (!before || !eqList(after.headlines, before.headlines || [])) {
      changes.headlines = trimList(after.headlines);
    }
    if (!before || !eqList(after.longHeadlines, before.longHeadlines || [])) {
      changes.longHeadlines = trimList(after.longHeadlines);
    }
    if (!before || !eqList(after.descriptions, before.descriptions || [])) {
      changes.descriptions = trimList(after.descriptions);
    }
    if (Object.keys(changes).length > 0) {
      pmaxUpdated.push({
        market: after.market,
        phaseName: after.phaseName,
        assetGroupName: after.assetGroupName,
        changes,
      });
    }
  }

  return {
    keywords: { added, updated, removed },
    ads: { updated: adsUpdated, added: adsAdded, skippedNew: adsSkippedNew },
    pmaxGroups: { updated: pmaxUpdated, skippedNew: pmaxSkipped },
  };
}

// Build a deterministic ad name from the campaign + ad-group taxonomy. Uses the
// last two segments of the campaign name (typically Phase | Strategy) plus the
// ad-group name and a 1-based sequence within that shell.
function generateAutoAdName(row: AdSheetRow, counter: Map<string, number>): string {
  const shellKey = `${row.campaignName}::${row.adGroupName}`;
  const next = (counter.get(shellKey) || 0) + 1;
  counter.set(shellKey, next);
  const campaignParts = row.campaignName.split('|').map((p) => p.trim()).filter(Boolean);
  const tail = campaignParts.slice(-2).join(' | ');
  const adGroupSuffix =
    row.adGroupName && row.adGroupName !== 'Default' ? ` | ${row.adGroupName}` : '';
  return `${tail}${adGroupSuffix} | RSA${next}`;
}

// ---------- Build current keyword rows from plan keywords (for diff "current" side) ----------

export function buildCurrentKeywordRows(
  keywords: GoogleKeywordLike[],
  expansion: ExpandedCampaignRef[],
): KeywordSheetRow[] {
  const out: KeywordSheetRow[] = [];
  const expByKey = new Map<string, ExpandedCampaignRef[]>();
  for (const ref of expansion) {
    if (ref.strategy === null) continue;
    const k = `${ref.market}::${ref.strategy}`;
    if (!expByKey.has(k)) expByKey.set(k, []);
    expByKey.get(k)!.push(ref);
  }
  for (const kw of keywords) {
    const strategy = (kw.strategy || 'generic') as 'brand' | 'generic' | 'competition';
    const refs = expByKey.get(`${kw.market || ''}::${strategy}`);
    const ref = refs?.[0];
    if (!ref) continue;
    out.push({
      campaignName: ref.campaignName,
      adGroupName: ref.adGroupName,
      keyword: kw.name || kw.text || '',
      matchType: (kw.matchType || 'broad') as 'exact' | 'phrase' | 'broad',
      negative: !!kw.isNegative,
    });
  }
  return out;
}

// ---------- Apply helpers (DB updates) ----------

/** Convert applied keyword diff back into a flat `selectedKeywords` array for the campaign. */
export function applyKeywordDiff(
  current: GoogleKeywordLike[],
  diff: GoogleAdsShellDiff['keywords'],
  expansion: ExpandedCampaignRef[],
): GoogleKeywordLike[] {
  // Map campaignName -> {market, strategy} for reverse lookup
  const refByCampaign = new Map<string, { market: string; strategy: 'brand' | 'generic' | 'competition' }>();
  for (const ref of expansion) {
    if (ref.strategy === null) continue;
    refByCampaign.set(ref.campaignName, { market: ref.market, strategy: ref.strategy });
  }

  const next = [...current];

  // Removals
  for (const r of diff.removed) {
    const idx = next.findIndex(
      (k) =>
        (k.name || k.text || '').toLowerCase() === r.keyword.toLowerCase() &&
        !!k.isNegative === r.negative,
    );
    if (idx !== -1) next.splice(idx, 1);
  }

  // Updates (match-type changes)
  for (const u of diff.updated) {
    const idx = next.findIndex(
      (k) =>
        (k.name || k.text || '').toLowerCase() === u.before.keyword.toLowerCase() &&
        !!k.isNegative === u.before.negative,
    );
    if (idx !== -1) next[idx] = { ...next[idx], matchType: u.after.matchType };
  }

  // Additions
  for (const a of diff.added) {
    const ref = refByCampaign.get(a.campaignName);
    next.push({
      id: `kw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: a.keyword,
      matchType: a.matchType,
      isNegative: a.negative,
      strategy: ref?.strategy || 'generic',
      market: ref?.market || null,
      platform: 'google',
    });
  }

  return next;
}

/** Build a Supabase update payload for one ad assignment from a diff entry. */
export function adChangesToAssignmentUpdate(
  changes: GoogleAdsShellDiff['ads']['updated'][number]['changes'],
): Record<string, unknown> {
  const upd: Record<string, unknown> = {};
  if (changes.finalUrl !== undefined) upd.destination_url = changes.finalUrl;
  if (changes.path1 !== undefined) upd.path_1 = changes.path1;
  if (changes.path2 !== undefined) upd.path_2 = changes.path2;
  if (changes.headlines) {
    upd.headline = changes.headlines[0] || null;
    upd.headline_2 = changes.headlines[1] || null;
    upd.headline_3 = changes.headlines[2] || null;
    upd.headline_4 = changes.headlines[3] || null;
    upd.headline_5 = changes.headlines[4] || null;
    // Headlines 6..15 not stored as columns yet — hold them on headline_pins jsonb under `extra`
    // Keep additional headlines in a structured payload to avoid data loss.
    if (changes.headlines.length > 5) {
      upd.headline_pins = upd.headline_pins || {};
    }
  }
  if (changes.headlinePins) upd.headline_pins = changes.headlinePins;
  if (changes.descriptions) {
    upd.description = changes.descriptions[0] || null;
    upd.description_2 = changes.descriptions[1] || null;
    upd.description_3 = changes.descriptions[2] || null;
    upd.description_4 = changes.descriptions[3] || null;
    upd.description_5 = changes.descriptions[4] || null;
  }
  if (changes.descriptionPins) upd.description_pins = changes.descriptionPins;
  if (changes.longHeadlines) {
    upd.long_headline_1 = changes.longHeadlines[0] || null;
    upd.long_headline_2 = changes.longHeadlines[1] || null;
    upd.long_headline_3 = changes.longHeadlines[2] || null;
    upd.long_headline_4 = changes.longHeadlines[3] || null;
    upd.long_headline_5 = changes.longHeadlines[4] || null;
  }
  if (changes.businessName !== undefined) upd.business_name = changes.businessName;
  if (changes.callToAction !== undefined) upd.call_to_action = changes.callToAction || null;
  return upd;
}

// ---------- Internals ----------

function setLenFormula(ws: XLSX.WorkSheet, colIdx: number, rowNum: number, srcColLetter: string, max: number) {
  const cellRef = `${XLSX.utils.encode_col(colIdx)}${rowNum}`;
  const formula = `LEN(${srcColLetter}${rowNum})&"/"&${max}`;
  ws[cellRef] = { t: 's', f: formula };
}

function refKey(market: string, phase: string, strategy: ExpandedCampaignRef['strategy'], adGroup: string) {
  return `${market}|${phase}|${strategy || 'none'}|${adGroup}`;
}

function normMarket(m?: string | null) {
  return String(m || '')
    .trim()
    .toLowerCase();
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parsePins(v: unknown): (number | null)[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? x : null));
  try {
    const parsed = JSON.parse(String(v));
    return Array.isArray(parsed) ? parsed.map((x) => (typeof x === 'number' ? x : null)) : [];
  } catch {
    return [];
  }
}

function padPins(pins: (number | null)[], length: number): (number | null)[] {
  const out = pins.slice(0, length);
  while (out.length < length) out.push(null);
  return out;
}

function toPin(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 15) return null;
  return Math.floor(n);
}

function arrEq(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if ((a[i] || '') !== (b[i] || '')) return false;
  return true;
}

function pinArrEq(a: (number | null)[], b: (number | null)[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if ((a[i] ?? null) !== (b[i] ?? null)) return false;
  return true;
}
