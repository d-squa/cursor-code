// Utility functions for text asset Excel import/export
import * as XLSX from 'xlsx';
import type { CreativeTextAssetRow, AdFormat } from '@/types/creativeTextAssets';
import type { CallToAction } from '@/types/creative';
import { AD_FORMAT_LABELS, ALL_AD_FORMATS } from '@/utils/adFormatDetection';
import {
  GOOGLE_NON_SEARCH_SHEETS,
  buildSheetForGoogleType,
  validateGoogleNonSearchRow,
  googleRowMatchKey,
} from '@/utils/googleNonSearchExcel';
import { detectGoogleNonSearchType, type GoogleNonSearchType } from '@/components/creative/GoogleNonSearchTextAssetEditor';

// Column definitions for the Excel export/import
export const TEXT_ASSET_COLUMNS = [
  { key: 'platform', label: 'Platform', width: 12 },
  { key: 'market', label: 'Market', width: 15 },
  { key: 'phase', label: 'Phase', width: 15 },
  { key: 'adSet', label: 'Ad Set', width: 20 },
  { key: 'creativeName', label: 'Creative Name', width: 30 },
  { key: 'originalFilename', label: 'Upload Path', width: 55 },
  { key: 'folderPath', label: 'Folder Path', width: 35 },
  // Taxonomy names for ads manager upload
  { key: 'taxonomyCampaignName', label: 'Campaign Name (Taxonomy)', width: 50 },
  { key: 'taxonomyAdSetName', label: 'Ad Set Name (Taxonomy)', width: 50 },
  { key: 'taxonomyAdName', label: 'Ad Name (Taxonomy)', width: 50 },
  { key: 'adFormat', label: 'Ad Format', width: 15 },
  { key: 'creativeFormat', label: 'Media Type', width: 10 },
  { key: 'aspectRatio', label: 'Aspect Ratio', width: 12 },
  { key: 'primaryText', label: 'Primary Text', width: 50 },
  { key: 'primaryText2', label: 'Primary Text 2', width: 50 },
  { key: 'primaryText3', label: 'Primary Text 3', width: 50 },
  { key: 'primaryText4', label: 'Primary Text 4', width: 50 },
  { key: 'primaryText5', label: 'Primary Text 5', width: 50 },
  { key: 'headline', label: 'Headline', width: 30 },
  { key: 'headline2', label: 'Headline 2', width: 30 },
  { key: 'headline3', label: 'Headline 3', width: 30 },
  { key: 'headline4', label: 'Headline 4', width: 30 },
  { key: 'headline5', label: 'Headline 5', width: 30 },
  { key: 'description', label: 'Description', width: 30 },
  { key: 'description2', label: 'Description 2', width: 30 },
  { key: 'description3', label: 'Description 3', width: 30 },
  { key: 'description4', label: 'Description 4', width: 30 },
  { key: 'description5', label: 'Description 5', width: 30 },
  { key: 'caption', label: 'Video Caption', width: 40 },
  { key: 'brandName', label: 'Brand/Business Name', width: 20 },
  { key: 'callToAction', label: 'CTA', width: 15 },
  { key: 'destinationUrl', label: 'Destination URL', width: 50 },
  { key: 'overrideLandingPageUrl', label: 'Sitelink URL', width: 50 },
  { key: 'displayLink', label: 'Display Link', width: 20 },
  { key: 'displayName', label: 'Display Name', width: 20 },
  { key: 'displayPath', label: 'Display Path', width: 15 },
  { key: 'autoBuildUtm', label: 'Auto UTM', width: 10 },
  { key: 'utmSource', label: 'UTM Source', width: 15 },
  { key: 'utmMedium', label: 'UTM Medium', width: 15 },
  { key: 'utmCampaign', label: 'UTM Campaign', width: 20 },
  { key: 'utmContent', label: 'UTM Content', width: 15 },
  { key: 'utmTerm', label: 'UTM Term', width: 15 },
  { key: 'pageName', label: 'Page/Identity', width: 20 },
] as const;

export type TextAssetColumnKey = typeof TEXT_ASSET_COLUMNS[number]['key'];

// Editable columns (columns that users can modify)
export const EDITABLE_COLUMNS: TextAssetColumnKey[] = [
  'adFormat',
  'primaryText',
  'primaryText2',
  'primaryText3',
  'primaryText4',
  'primaryText5',
  'headline',
  'headline2',
  'headline3',
  'headline4',
  'headline5',
  'description',
  'description2',
  'description3',
  'description4',
  'description5',
  'caption',
  'brandName',
  'callToAction',
  'destinationUrl',
  'overrideLandingPageUrl',
  'displayLink',
  'displayName',
  'displayPath',
  'autoBuildUtm',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'utmTerm',
];


// Generate Excel file from text asset rows
export function generateTextAssetExcel(
  rows: CreativeTextAssetRow[],
  campaignName: string
): Blob {
  const workbook = XLSX.utils.book_new();
  
  // Create header row
  const headers = TEXT_ASSET_COLUMNS.map(col => col.label);
  
  // Create data rows
  const data = rows.map(row => TEXT_ASSET_COLUMNS.map(col => {
    const value = (row as any)[col.key];
    if (col.key === 'autoBuildUtm') {
      return value ? 'Yes' : 'No';
    }
    if (col.key === 'callToAction' && value) {
      return String(value).replace(/_/g, ' ');
    }
    if (col.key === 'adFormat' && value) {
      return AD_FORMAT_LABELS[value as AdFormat] || value;
    }
    return value ?? '';
  }));
  
  // Combine headers and data
  const sheetData = [headers, ...data];
  
  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  
  // Set column widths
  worksheet['!cols'] = TEXT_ASSET_COLUMNS.map(col => ({ wch: col.width }));
  
  // Add ad format validation (data validation for dropdown)
  // Note: XLSX doesn't fully support data validation in all cases
  
  // Add the main "Creative Content" worksheet first.
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Creative Content');

  // For Google: add one dedicated sheet per non-Search campaign type, with
  // type-specific columns and character limits embedded into each header.
  // Each sheet is filtered to rows whose detected Google type matches.
  (Object.keys(GOOGLE_NON_SEARCH_SHEETS) as GoogleNonSearchType[]).forEach((type) => {
    const { headers: gHeaders, data: gData, widths: gWidths } = buildSheetForGoogleType(rows, type);
    if (gData.length === 0) return; // skip empty types
    const gSheet = XLSX.utils.aoa_to_sheet([gHeaders, ...gData]);
    gSheet['!cols'] = gWidths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(workbook, gSheet, GOOGLE_NON_SEARCH_SHEETS[type].sheetName);
  });

  // Generate blob
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Download text asset Excel file
export function downloadTextAssetExcel(
  rows: CreativeTextAssetRow[],
  campaignName: string
): void {
  const blob = generateTextAssetExcel(rows, campaignName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeName = campaignName.replace(/[^a-zA-Z0-9]/g, '_');
  link.download = `${safeName}_text_assets_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Parse Excel file and merge with existing rows.
//
// Iterates over every sheet:
//  - "Creative Content" (default unified sheet) → existing column-based parsing
//  - One of the Google per-type sheets (Performance Max, Demand Gen, Video,
//    Display, Other Google) → per-type validator that HARD-REJECTS rows whose
//    values exceed the campaign-type character limits.
export async function parseTextAssetExcel(
  file: File,
  existingRows: CreativeTextAssetRow[]
): Promise<{
  updatedRows: CreativeTextAssetRow[];
  matchCount: number;
  errorCount: number;
  rejectedRows?: { sheet: string; key: string; errors: string[] }[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames.length) {
          reject(new Error('Excel file has no sheets'));
          return;
        }

        let updatedRows = [...existingRows];
        let matchCount = 0;
        let errorCount = 0;
        const rejectedRows: { sheet: string; key: string; errors: string[] }[] = [];

        // Build lookup once; rebuild from updatedRows for each sheet so that
        // edits from earlier sheets are visible to later ones.
        const buildLookup = () => {
          const map = new Map<string, CreativeTextAssetRow>();
          updatedRows.forEach((row) => {
            map.set(googleRowMatchKey(row), row);
          });
          return map;
        };

        // Map sheetName -> google type
        const googleSheetLookup = new Map<string, GoogleNonSearchType>();
        (Object.keys(GOOGLE_NON_SEARCH_SHEETS) as GoogleNonSearchType[]).forEach((t) => {
          googleSheetLookup.set(GOOGLE_NON_SEARCH_SHEETS[t].sheetName.toLowerCase(), t);
        });

        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          if (jsonData.length < 2) continue;

          const headers = (jsonData[0] as string[]).map((h) => String(h ?? ''));
          const dataRows = jsonData.slice(1);

          const googleType = googleSheetLookup.get(sheetName.trim().toLowerCase());

          if (googleType) {
            // ----- Google per-type sheet path: enforce character limits -----
            const lookup = buildLookup();
            for (const dataRow of dataRows) {
              const rowByHeader: Record<string, string> = {};
              headers.forEach((h, i) => { rowByHeader[h] = String(dataRow[i] ?? ''); });

              const key = googleRowMatchKey({
                platform: rowByHeader['Platform'],
                market: rowByHeader['Market'],
                phase: rowByHeader['Phase'],
                adSet: rowByHeader['Ad Group'],
                creativeName: rowByHeader['Creative Name'],
              });
              if (!rowByHeader['Creative Name']) { errorCount++; continue; }

              const existing = lookup.get(key);
              if (!existing) { errorCount++; continue; }

              const { errors, updates } = validateGoogleNonSearchRow(rowByHeader, googleType);
              if (errors.length > 0) {
                rejectedRows.push({ sheet: sheetName, key, errors });
                errorCount++;
                continue;
              }
              const idx = updatedRows.findIndex((r) => r.id === existing.id);
              if (idx !== -1 && Object.keys(updates).length > 0) {
                updatedRows[idx] = { ...updatedRows[idx], ...updates };
                matchCount++;
              }
            }
            continue;
          }

          // ----- Default "Creative Content" path (unchanged behaviour) -----
          // Create header to column key mapping
          const headerToKey: Record<string, TextAssetColumnKey> = {};
          TEXT_ASSET_COLUMNS.forEach(col => {
            headerToKey[col.label.toLowerCase()] = col.key;
          });
          const columnIndices: Record<TextAssetColumnKey, number> = {} as any;
          headers.forEach((h, idx) => {
            const key = headerToKey[h?.toLowerCase?.() || ''];
            if (key) columnIndices[key] = idx;
          });

          const lookup = buildLookup();
          for (const dataRow of dataRows) {
            const platform = String(dataRow[columnIndices.platform] || '').trim();
            const market = String(dataRow[columnIndices.market] || '').trim();
            const phase = String(dataRow[columnIndices.phase] || '').trim();
            const adSet = String(dataRow[columnIndices.adSet] || '').trim();
            const creativeName = String(dataRow[columnIndices.creativeName] || '').trim();

            if (!platform || !creativeName) { errorCount++; continue; }
            const key = googleRowMatchKey({ platform, market, phase, adSet, creativeName });
            const existingRow = lookup.get(key);
            if (!existingRow) { errorCount++; continue; }

            matchCount++;
            const rowIndex = updatedRows.findIndex((r) => r.id === existingRow.id);
            if (rowIndex === -1) continue;

            const updates: Partial<CreativeTextAssetRow> = {};
            if (columnIndices.adFormat !== undefined) {
              const formatValue = String(dataRow[columnIndices.adFormat] || '').toLowerCase().replace(/ /g, '_');
              if (ALL_AD_FORMATS.includes(formatValue as AdFormat)) {
                updates.adFormat = formatValue as AdFormat;
                updates.adFormatConfirmed = true;
              }
            }
            if (columnIndices.primaryText !== undefined) updates.primaryText = String(dataRow[columnIndices.primaryText] || '');
            if (columnIndices.headline !== undefined) updates.headline = String(dataRow[columnIndices.headline] || '');
            if (columnIndices.description !== undefined) updates.description = String(dataRow[columnIndices.description] || '');
            if (columnIndices.caption !== undefined) updates.caption = String(dataRow[columnIndices.caption] || '');
            if (columnIndices.destinationUrl !== undefined) updates.destinationUrl = String(dataRow[columnIndices.destinationUrl] || '');
            if (columnIndices.displayLink !== undefined) updates.displayLink = String(dataRow[columnIndices.displayLink] || '');
            if (columnIndices.callToAction !== undefined) {
              const ctaValue = String(dataRow[columnIndices.callToAction] || '').toUpperCase().replace(/ /g, '_');
              if (ctaValue) updates.callToAction = ctaValue as CallToAction;
            }
            if (columnIndices.autoBuildUtm !== undefined) {
              const utmValue = String(dataRow[columnIndices.autoBuildUtm] || '').toLowerCase();
              updates.autoBuildUtm = utmValue === 'yes' || utmValue === 'true' || utmValue === '1';
            }
            if (columnIndices.utmSource !== undefined) updates.utmSource = String(dataRow[columnIndices.utmSource] || '');
            if (columnIndices.utmMedium !== undefined) updates.utmMedium = String(dataRow[columnIndices.utmMedium] || '');
            if (columnIndices.utmCampaign !== undefined) updates.utmCampaign = String(dataRow[columnIndices.utmCampaign] || '');
            if (columnIndices.utmContent !== undefined) updates.utmContent = String(dataRow[columnIndices.utmContent] || '');

            updatedRows[rowIndex] = { ...updatedRows[rowIndex], ...updates };
          }
        }

        resolve({ updatedRows, matchCount, errorCount, rejectedRows });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// Parse clipboard text (tab-separated values from Excel)
// Returns data mapped to column indices based on selected cell
export function parseClipboardForGrid(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map(line => line.split('\t'));
}

// Convert grid data to clipboard format (for copying)
export function gridDataToClipboard(data: string[][]): string {
  return data.map(row => row.join('\t')).join('\n');
}

// Header mapping for Excel-like paste with column recognition
const HEADER_ALIASES: Record<string, TextAssetColumnKey> = {
  // Primary Text aliases
  'primary text': 'primaryText',
  'primarytext': 'primaryText',
  'primary_text': 'primaryText',
  'ad text': 'primaryText',
  'text': 'primaryText',
  'copy': 'primaryText',
  'ad copy': 'primaryText',
  
  // Headline aliases
  'headline': 'headline',
  'title': 'headline',
  'header': 'headline',
  
  // Description aliases
  'description': 'description',
  'desc': 'description',
  'link description': 'description',
  
  // Caption aliases (video)
  'caption': 'caption',
  'video caption': 'caption',
  'videocaption': 'caption',
  'video_caption': 'caption',
  
  // CTA aliases
  'cta': 'callToAction',
  'call to action': 'callToAction',
  'calltoaction': 'callToAction',
  'call_to_action': 'callToAction',
  'button': 'callToAction',
  
  // URL aliases
  'destination url': 'destinationUrl',
  'destinationurl': 'destinationUrl',
  'destination_url': 'destinationUrl',
  'url': 'destinationUrl',
  'link': 'destinationUrl',
  'final url': 'destinationUrl',
  'landing page': 'destinationUrl',
  
  // Display Link aliases
  'display link': 'displayLink',
  'displaylink': 'displayLink',
  'display_link': 'displayLink',
  
  // Platform / Market / Phase / Ad Set (for matching)
  'platform': 'platform',
  'market': 'market',
  'phase': 'phase',
  'ad set': 'adSet',
  'adset': 'adSet',
  'ad_set': 'adSet',
  'creative name': 'creativeName',
  'creativename': 'creativeName',
  'creative_name': 'creativeName',
  'name': 'creativeName',
  
  // Ad Format
  'ad format': 'adFormat',
  'adformat': 'adFormat',
  'format': 'adFormat',
  
  // UTM params
  'auto utm': 'autoBuildUtm',
  'autoutm': 'autoBuildUtm',
  'auto_utm': 'autoBuildUtm',
  'utm source': 'utmSource',
  'utm_source': 'utmSource',
  'utm medium': 'utmMedium',
  'utm_medium': 'utmMedium',
  'utm campaign': 'utmCampaign',
  'utm_campaign': 'utmCampaign',
  'utm content': 'utmContent',
  'utm_content': 'utmContent',
};

// Check if the clipboard data has a header row that matches our expected columns
function detectHeaderRow(firstRow: string[]): Map<number, TextAssetColumnKey> | null {
  const headerMap = new Map<number, TextAssetColumnKey>();
  let matchCount = 0;
  
  firstRow.forEach((cell, idx) => {
    const normalized = cell.toLowerCase().trim();
    const key = HEADER_ALIASES[normalized];
    if (key) {
      headerMap.set(idx, key);
      matchCount++;
    }
  });
  
  // Consider it a header row if at least 2 columns match
  return matchCount >= 2 ? headerMap : null;
}

export interface ParsedClipboardData {
  hasHeaders: boolean;
  headerMap: Map<number, TextAssetColumnKey> | null;
  dataRows: string[][];
  matchKey: (row: string[]) => string | null; // Returns match key if platform/market/phase/adSet/name cols exist
}

// Parse clipboard with header detection
export function parseClipboardWithHeaders(text: string): ParsedClipboardData {
  const lines = text.trim().split(/\r?\n/);
  const allRows = lines.map(line => line.split('\t'));
  
  if (allRows.length === 0) {
    return { hasHeaders: false, headerMap: null, dataRows: [], matchKey: () => null };
  }
  
  const firstRow = allRows[0];
  const headerMap = detectHeaderRow(firstRow);
  
  if (headerMap) {
    // Has headers - data starts from row 1
    const dataRows = allRows.slice(1);
    
    // Build match key function if we have structure columns
    const platformIdx = Array.from(headerMap.entries()).find(([_, v]) => v === 'platform')?.[0];
    const marketIdx = Array.from(headerMap.entries()).find(([_, v]) => v === 'market')?.[0];
    const phaseIdx = Array.from(headerMap.entries()).find(([_, v]) => v === 'phase')?.[0];
    const adSetIdx = Array.from(headerMap.entries()).find(([_, v]) => v === 'adSet')?.[0];
    const nameIdx = Array.from(headerMap.entries()).find(([_, v]) => v === 'creativeName')?.[0];
    
    const hasMatchColumns = platformIdx !== undefined && nameIdx !== undefined;
    
    const matchKey = hasMatchColumns 
      ? (row: string[]) => {
          const platform = row[platformIdx!] || '';
          const market = marketIdx !== undefined ? row[marketIdx] || '' : '';
          const phase = phaseIdx !== undefined ? row[phaseIdx] || '' : '';
          const adSet = adSetIdx !== undefined ? row[adSetIdx] || '' : '';
          const name = row[nameIdx!] || '';
          return `${platform}|${market}|${phase}|${adSet}|${name}`;
        }
      : () => null;
    
    return { hasHeaders: true, headerMap, dataRows, matchKey };
  }
  
  // No headers detected - treat all rows as data
  return { hasHeaders: false, headerMap: null, dataRows: allRows, matchKey: () => null };
}
