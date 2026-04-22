// Google non-Search per-type Excel sheet definitions.
//
// Each Google campaign type (Performance Max, Demand Gen, Video/YouTube,
// Display) has its own asset slot count and character limits. We expose:
//
//   - GOOGLE_NON_SEARCH_SHEETS — sheet name + columns + limits per type
//   - buildSheetForGoogleType(rows, type) — { headers, data } for export
//   - validateGoogleNonSearchRow(row, type) — { errors[] } over-limit detection
//   - applyGoogleNonSearchUpdates(existing, parsed, type) — merge import rows
//
// The same row keys used by the in-app editor are reused so the import path
// can flow straight through the existing onRowChange / onImportRows handlers.

import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';
import { detectGoogleNonSearchType, type GoogleNonSearchType } from '@/components/creative/GoogleNonSearchTextAssetEditor';
import { GOOGLE_CTA_OPTIONS, normalizeGoogleCta, GOOGLE_CTA_LABEL_LIST } from '@/utils/googleCtaOptions';

export interface GoogleNonSearchFieldSpec {
  /** Underlying CreativeTextAssetRow key written on import. */
  key: keyof CreativeTextAssetRow | string;
  /** Excel column header label (limits embedded for clarity). */
  label: string;
  /** Hard character limit. Excel imports exceeding this are rejected. */
  max: number;
  /** Suggested display width. */
  width?: number;
}

export interface GoogleNonSearchSheetSpec {
  type: GoogleNonSearchType;
  /** Excel sheet/tab name. */
  sheetName: string;
  /** Friendly label for UI. */
  label: string;
  /** Always-present structural columns at the start of the sheet. */
  structuralColumns: GoogleNonSearchFieldSpec[];
  /** Type-specific text/asset columns (these enforce per-type limits). */
  textColumns: GoogleNonSearchFieldSpec[];
}

const STRUCTURAL: GoogleNonSearchFieldSpec[] = [
  { key: 'platform', label: 'Platform', max: 50, width: 12 },
  { key: 'market', label: 'Market', max: 80, width: 14 },
  { key: 'phase', label: 'Phase', max: 200, width: 22 },
  { key: 'adSet', label: 'Ad Group', max: 200, width: 22 },
  { key: 'creativeName', label: 'Creative Name', max: 200, width: 28 },
  { key: 'destinationUrl', label: 'Final URL', max: 2048, width: 40 },
  { key: 'brandName', label: 'Business Name (25)', max: 25, width: 22 },
];

function range(prefix: keyof CreativeTextAssetRow | string, n: number, max: number, label: string, width = 28): GoogleNonSearchFieldSpec[] {
  const out: GoogleNonSearchFieldSpec[] = [];
  for (let i = 0; i < n; i++) {
    // index 0 maps to the bare field; indices 1..n-1 use the numeric suffix
    const suffix = i === 0 ? '' : String(i + 1);
    const key = (typeof prefix === 'string' ? prefix : String(prefix)) + suffix;
    out.push({ key: key as keyof CreativeTextAssetRow, label: `${label} ${i + 1} (${max})`, max, width });
  }
  return out;
}

function rangeNumbered(prefix: string, n: number, max: number, label: string, width = 28): GoogleNonSearchFieldSpec[] {
  const out: GoogleNonSearchFieldSpec[] = [];
  for (let i = 1; i <= n; i++) {
    out.push({ key: `${prefix}${i}` as keyof CreativeTextAssetRow, label: `${label} ${i} (${max})`, max, width });
  }
  return out;
}

// Header label used for the CTA column. Shows the picker hint with the full
// list of accepted UI labels so the spreadsheet user knows what to type.
const CTA_HEADER = `Call to Action (${GOOGLE_CTA_LABEL_LIST})`;
const CTA_COL: GoogleNonSearchFieldSpec = { key: 'callToAction', label: CTA_HEADER, max: 80, width: 22 };

export const GOOGLE_NON_SEARCH_SHEETS: Record<GoogleNonSearchType, GoogleNonSearchSheetSpec> = {
  pmax: {
    type: 'pmax',
    sheetName: 'Performance Max',
    label: 'Performance Max',
    structuralColumns: STRUCTURAL,
    textColumns: [
      CTA_COL,
      ...range('headline', 5, 30, 'Headline', 22),
      ...rangeNumbered('long_headline_', 5, 90, 'Long Headline', 38),
      ...range('description', 5, 90, 'Description', 38),
    ],
  },
  demand_gen: {
    type: 'demand_gen',
    sheetName: 'Demand Gen',
    label: 'Demand Gen',
    structuralColumns: STRUCTURAL,
    // Demand Gen single image: 5 headlines (40), 5 descriptions (90), business name (25). No long headline.
    // YouTube Video URL is required for video Demand Gen ads (image is optional fallback).
    textColumns: [
      { key: 'youtubeVideoUrl', label: 'YouTube Video URL', max: 2048, width: 50 },
      CTA_COL,
      ...range('headline', 5, 40, 'Headline', 26),
      ...range('description', 5, 90, 'Description', 38),
    ],
  },
  video: {
    type: 'video',
    sheetName: 'Video (YouTube)',
    label: 'Video (YouTube)',
    structuralColumns: STRUCTURAL,
    // Demand Gen video (in-feed): 2 headlines (40), 4 descriptions (90). No long headline per user spec.
    textColumns: [
      { key: 'youtubeVideoUrl', label: 'YouTube Video URL', max: 2048, width: 50 },
      CTA_COL,
      ...range('headline', 2, 40, 'Headline', 26),
      ...range('description', 4, 90, 'Description', 38),
    ],
  },
  display: {
    type: 'display',
    sheetName: 'Display',
    label: 'Display',
    structuralColumns: STRUCTURAL,
    // Responsive Display: 5 headlines (30), 5 long headlines (90), 5 descriptions (90), business name (25).
    textColumns: [
      CTA_COL,
      ...range('headline', 5, 30, 'Headline', 22),
      ...rangeNumbered('long_headline_', 5, 90, 'Long Headline', 38),
      ...range('description', 5, 90, 'Description', 38),
    ],
  },
  other: {
    type: 'other',
    sheetName: 'Other Google',
    label: 'Other Google',
    structuralColumns: STRUCTURAL,
    textColumns: [
      CTA_COL,
      ...range('headline', 5, 30, 'Headline', 22),
      ...rangeNumbered('long_headline_', 5, 90, 'Long Headline', 38),
      ...range('description', 5, 90, 'Description', 38),
    ],
  },
};

/** Headers + data rows for a given Google non-Search type. */
export function buildSheetForGoogleType(
  rows: CreativeTextAssetRow[],
  type: GoogleNonSearchType,
): { headers: string[]; data: string[][]; widths: number[] } {
  const spec = GOOGLE_NON_SEARCH_SHEETS[type];
  const cols = [...spec.structuralColumns, ...spec.textColumns];
  const headers = cols.map((c) => c.label);
  const widths = cols.map((c) => c.width || 20);

  const filtered = rows.filter((r) => detectGoogleNonSearchType(r) === type);
  const data = filtered.map((row) =>
    cols.map((c) => {
      const value = (row as any)[c.key];
      if (c.key === 'callToAction') {
        // Export the UI-friendly label (e.g. "Learn More") so users see/edit a
        // human-readable value. Import re-normalises to the enum.
        const normalized = normalizeGoogleCta(value);
        const opt = GOOGLE_CTA_OPTIONS.find((o) => o.value === normalized);
        return opt ? opt.label : '';
      }
      return value == null ? '' : String(value);
    }),
  );
  return { headers, data, widths };
}

/** Char-limit validation for a single row of imported values, keyed by header label. */
export function validateGoogleNonSearchRow(
  rowByHeader: Record<string, string>,
  type: GoogleNonSearchType,
): { errors: string[]; updates: Partial<CreativeTextAssetRow> } {
  const spec = GOOGLE_NON_SEARCH_SHEETS[type];
  const errors: string[] = [];
  const updates: Record<string, unknown> = {};
  const headlineValues: string[] = [];
  const descriptionValues: string[] = [];

  for (const col of spec.textColumns) {
    const raw = rowByHeader[col.label];
    if (raw == null) continue;
    const value = String(raw);

    // CTA column: accept either UI label or enum, normalise back to enum.
    if (col.key === 'callToAction') {
      if (value.trim() === '') continue;
      const normalized = normalizeGoogleCta(value);
      if (!normalized) {
        errors.push(`"${col.label}" — "${value}" is not a recognised CTA. Use one of: ${GOOGLE_CTA_LABEL_LIST}`);
        continue;
      }
      (updates as any).callToAction = normalized;
      (updates as any).call_to_action = normalized;
      continue;
    }

    if (value.length > col.max) {
      errors.push(`"${col.label}" is ${value.length} chars (max ${col.max})`);
      continue;
    }
    if (value !== '') (updates as any)[col.key] = value;

    if (String(col.key).startsWith('headline')) {
      headlineValues.push(value);
    }
    if (String(col.key).startsWith('description')) {
      descriptionValues.push(value);
    }
  }

  if (headlineValues.length > 0) {
    updates.headline_pins = { values: headlineValues, pins: Array(headlineValues.length).fill(null) };
  }
  if (descriptionValues.length > 0) {
    updates.description_pins = { values: descriptionValues, pins: Array(descriptionValues.length).fill(null) };
  }

  // Allow updating brand/business name + final URL from structural cols.
  for (const col of spec.structuralColumns) {
    if (col.key !== 'brandName' && col.key !== 'destinationUrl') continue;
    const raw = rowByHeader[col.label];
    if (raw == null) continue;
    const value = String(raw);
    if (value.length > col.max) {
      errors.push(`"${col.label}" is ${value.length} chars (max ${col.max})`);
      continue;
    }
    if (value !== '') (updates as any)[col.key] = value;
  }
  return { errors, updates: updates as Partial<CreativeTextAssetRow> };
}

/** Match-key for locating a row in the existing dataset. */
export function googleRowMatchKey(values: { platform?: string; market?: string; phase?: string; adSet?: string; creativeName?: string }): string {
  return [
    String(values.platform || '').trim(),
    String(values.market || '').trim(),
    String(values.phase || '').trim(),
    String(values.adSet || '').trim(),
    String(values.creativeName || '').trim(),
  ].join('|');
}
