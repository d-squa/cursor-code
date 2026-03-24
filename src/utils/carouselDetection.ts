// Carousel Detection Algorithm
// Detects creatives that can form a carousel based on:
// 1. Format compatibility (1:1 square, 4:5 vertical, or 9:16 vertical)
// 2. Sequential naming in filenames (e.g. _1, _2, _card1, _slide2, _A, _B)
// 3. Carousel keywords in folder/file names (carousel, caro, swipe)
// 4. Matching filename prefix with only trailing number/letter differing

import { matchesAspectRatio } from './platformAdSpecs';
import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';

type CarouselAspectGroup = '1:1' | '4:5' | '9:16';

const CAROUSEL_ALLOWED_RATIOS: CarouselAspectGroup[] = ['1:1', '4:5', '9:16'];

const SEQUENCE_PATTERNS = [
  /[_\-\s](card|slide|frame|panel|caro|swipe)?[_\-\s]?(\d+)\s*$/i,
  /(\d+)\s*of\s*(\d+)/i,
  /[_\-](\d+)$/,
  /[_\-]([A-Z])$/i,
  /[_\-\s]+([A-Z])\s*$/i,
  /\b(ad|creative|asset|img|vid|image|video)\s*([A-Za-z0-9])\s*$/i,
  /\b(frame|slide|card|panel)\s*(\d+)/i,
];

const CAROUSEL_KEYWORDS = /\b(carousel|caro|swipe|slideshow|multi.?card|cards)\b/i;

interface DetectionCandidate {
  row: CreativeTextAssetRow;
  nameForMatching: string;
  prefix: string;
  sequenceToken: string | null;
  hasCarouselKeyword: boolean;
  aspectGroup: CarouselAspectGroup | null;
}

function normalizeFilename(value: string): string {
  const trimmed = value.trim();
  return trimmed.split('/').filter(Boolean).pop() || trimmed;
}

function normalizeSequenceToken(token: string | null): string | null {
  return token ? token.trim().toLowerCase() : null;
}

function getCarouselAspectGroup(row: CreativeTextAssetRow): CarouselAspectGroup | null {
  const matchKnownRatio = (width: number, height: number): CarouselAspectGroup | null => {
    for (const ratio of CAROUSEL_ALLOWED_RATIOS) {
      if (matchesAspectRatio(width, height, ratio, 0.05)) {
        return ratio;
      }
    }

    return null;
  };

  if (row.width && row.height) {
    return matchKnownRatio(row.width, row.height);
  }

  const aspectRatio = row.aspectRatio?.trim();
  if (!aspectRatio) return null;

  if (CAROUSEL_ALLOWED_RATIOS.includes(aspectRatio as CarouselAspectGroup)) {
    return aspectRatio as CarouselAspectGroup;
  }

  const [ratioWidth, ratioHeight] = aspectRatio.split(':').map(Number);
  if (Number.isFinite(ratioWidth) && Number.isFinite(ratioHeight) && ratioWidth > 0 && ratioHeight > 0) {
    return matchKnownRatio(ratioWidth, ratioHeight);
  }

  return null;
}

function extractPrefixAndSequence(name: string): { prefix: string; sequenceToken: string | null } {
  for (const pattern of SEQUENCE_PATTERNS) {
    const match = name.match(pattern);
    if (!match) continue;

    const fullMatch = match[0];
    const prefix = name.slice(0, name.length - fullMatch.length).replace(/[_\-\s]+$/, '');
    const sequenceToken = match[match.length - 1] || match[1];

    return {
      prefix: prefix.toLowerCase().trim(),
      sequenceToken: normalizeSequenceToken(sequenceToken),
    };
  }

  return { prefix: name.toLowerCase().trim(), sequenceToken: null };
}

function hasCarouselKeyword(text: string): boolean {
  return CAROUSEL_KEYWORDS.test(text);
}

export interface CarouselGroup {
  id: string;
  name: string;
  rowIds: string[];
  aspectGroup: CarouselAspectGroup;
  confidence: 'high' | 'medium';
  reason: string;
}

export function detectCarouselGroups(rows: CreativeTextAssetRow[]): CarouselGroup[] {
  const groups: CarouselGroup[] = [];

  const candidates: DetectionCandidate[] = rows
    .filter((row) => !row.carouselGroupId && !row.processingGroupId)
    .map((row) => {
      const aspectGroup = getCarouselAspectGroup(row);
      if (!aspectGroup) return null;

      const rawNameSource = row.originalFilename || row.creativeName || '';
      const fileName = normalizeFilename(rawNameSource);
      const folderPath = row.folderPath || '';
      const fullContext = `${folderPath}/${rawNameSource}`;
      const nameWithoutExt = fileName.replace(/\.[a-zA-Z0-9]{2,5}$/, '');
      const { prefix, sequenceToken } = extractPrefixAndSequence(nameWithoutExt);

      return {
        row,
        nameForMatching: fileName,
        prefix,
        sequenceToken,
        hasCarouselKeyword: hasCarouselKeyword(fullContext),
        aspectGroup,
      } satisfies DetectionCandidate;
    })
    .filter((candidate): candidate is DetectionCandidate => candidate !== null);

  const contextGroups = new Map<string, DetectionCandidate[]>();
  for (const candidate of candidates) {
    const contextKey = `${candidate.row.platform}|${candidate.row.market}|${candidate.row.phase}|${candidate.row.adSet}|${candidate.aspectGroup}`;
    if (!contextGroups.has(contextKey)) {
      contextGroups.set(contextKey, []);
    }
    contextGroups.get(contextKey)!.push(candidate);
  }

  for (const contextCandidates of contextGroups.values()) {
    if (contextCandidates.length < 2) continue;

    const prefixMap = new Map<string, DetectionCandidate[]>();
    for (const candidate of contextCandidates) {
      if (!prefixMap.has(candidate.prefix)) {
        prefixMap.set(candidate.prefix, []);
      }
      prefixMap.get(candidate.prefix)!.push(candidate);
    }

    for (const [prefix, prefixGroup] of prefixMap) {
      if (prefixGroup.length < 2 || prefixGroup.length > 10) continue;

      const hasSequence = prefixGroup.some((candidate) => candidate.sequenceToken !== null);
      const hasKeyword = prefixGroup.some((candidate) => candidate.hasCarouselKeyword);
      const allHaveSequence = prefixGroup.every((candidate) => candidate.sequenceToken !== null);
      const uniqueSequenceTokens = new Set(
        prefixGroup
          .map((candidate) => candidate.sequenceToken)
          .filter((token): token is string => Boolean(token))
      );

      if (!hasSequence && !hasKeyword) continue;
      if (hasSequence && uniqueSequenceTokens.size < 2) continue;

      const sorted = [...prefixGroup].sort((a, b) => {
        if (a.sequenceToken && b.sequenceToken) {
          const numA = parseInt(a.sequenceToken, 10);
          const numB = parseInt(b.sequenceToken, 10);

          if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
            return numA - numB;
          }

          return a.sequenceToken.localeCompare(b.sequenceToken, undefined, { numeric: true, sensitivity: 'base' });
        }

        return a.nameForMatching.localeCompare(b.nameForMatching, undefined, { numeric: true, sensitivity: 'base' });
      });

      groups.push({
        id: `carousel-detect-${groups.length}-${prefix || sorted[0].row.creativeId}`,
        name: `${prefix || sorted[0].row.creativeName} Carousel`,
        rowIds: sorted.map((candidate) => candidate.row.id),
        aspectGroup: sorted[0].aspectGroup!,
        confidence: allHaveSequence && uniqueSequenceTokens.size === prefixGroup.length ? 'high' : hasKeyword ? 'high' : 'medium',
        reason: [
          hasSequence ? 'sequential naming' : null,
          hasKeyword ? 'carousel keyword' : null,
          `matching prefix "${prefix || normalizeFilename(sorted[0].row.creativeName)}"`,
        ].filter(Boolean).join(', '),
      });
    }

    const keywordOnly = contextCandidates.filter(
      (candidate) => candidate.hasCarouselKeyword && !groups.some((group) => group.rowIds.includes(candidate.row.id))
    );

    if (keywordOnly.length >= 2 && keywordOnly.length <= 10) {
      const allSamePrefix = new Set(keywordOnly.map((candidate) => candidate.prefix)).size === 1;
      if (!allSamePrefix) {
        groups.push({
          id: `carousel-keyword-${groups.length}-${keywordOnly[0].row.creativeId}`,
          name: 'Carousel (keyword match)',
          rowIds: keywordOnly.map((candidate) => candidate.row.id),
          aspectGroup: keywordOnly[0].aspectGroup!,
          confidence: 'medium',
          reason: 'carousel keyword in folder/filename',
        });
      }
    }
  }

  return groups;
}

export function validateCarouselSelection(rows: CreativeTextAssetRow[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (rows.length < 2) errors.push('Minimum 2 cards required');
  if (rows.length > 10) errors.push('Maximum 10 cards allowed');

  const adSets = new Set(rows.map((row) => `${row.platform}|${row.market}|${row.phase}|${row.adSet}`));
  if (adSets.size > 1) errors.push('All cards must be from the same ad set');

  const aspectGroups = rows.map((row) => getCarouselAspectGroup(row));
  const incompatible = aspectGroups.filter((group) => group === null);
  if (incompatible.length > 0) {
    errors.push(`${incompatible.length} card(s) don't have a carousel-compatible format (${CAROUSEL_ALLOWED_RATIOS.join(', ')} only)`);
  }

  const validGroups = new Set(aspectGroups.filter((group): group is CarouselAspectGroup => group !== null));
  if (validGroups.size > 1) {
    errors.push('All carousel cards must use the same aspect ratio');
  }

  if (rows.some((row) => !!row.carouselGroupId)) {
    errors.push('Some selected creatives are already in a carousel');
  }

  return { isValid: errors.length === 0, errors };
}