// Carousel Detection Algorithm
// Detects creatives that can form a carousel based on:
// 1. Format compatibility (1:1 square or 4:5 vertical only)
// 2. Sequential numbering in names/filenames (e.g. _1, _2, _card1, _slide2, 1of5)
// 3. Carousel keywords in folder/file names (carousel, caro, swipe)
// 4. Matching name prefix with only trailing number/letter differing

import { matchesAspectRatio } from './platformAdSpecs';
import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';

// Allowed carousel aspect ratios (hard rule)
const CAROUSEL_ALLOWED_RATIOS = ['1:1', '4:5'];

// Regex patterns for sequential evidence
const SEQUENCE_PATTERNS = [
  // _1, _2, _card1, _slide2
  /[_\-\s](card|slide|frame|panel|caro|swipe)?[_\-\s]?(\d+)\s*$/i,
  // 1of5, 2of10
  /(\d+)\s*of\s*(\d+)/i,
  // trailing number after underscore or dash: creative_name_1
  /[_\-](\d+)$/,
  // trailing letter sequence: creative_name_A, creative_name_B
  /[_\-]([A-Z])$/i,
  // "Ad A", "Ad B", "Ad 1", etc.
  /\b(ad|creative|asset|img|vid|image|video)\s*([A-Za-z0-9])\s*$/i,
  // FRAME 1, FRAME 2 (with space)
  /\b(frame|slide|card|panel)\s*(\d+)/i,
];

// Keywords that suggest carousel intent
const CAROUSEL_KEYWORDS = /\b(carousel|caro|swipe|slideshow|multi.?card|cards)\b/i;

interface DetectionCandidate {
  row: CreativeTextAssetRow;
  nameForMatching: string;
  prefix: string;
  sequenceToken: string | null;
  hasCarouselKeyword: boolean;
  aspectGroup: '1:1' | '4:5' | null;
}

/**
 * Check if a creative has a carousel-compatible aspect ratio (1:1 or 4:5 only)
 */
function getCarouselAspectGroup(row: CreativeTextAssetRow): '1:1' | '4:5' | null {
  const w = row.width;
  const h = row.height;
  if (!w || !h) {
    // Fallback to aspectRatio string
    if (row.aspectRatio === '1:1') return '1:1';
    if (row.aspectRatio === '4:5') return '4:5';
    return null;
  }
  if (matchesAspectRatio(w, h, '1:1', 0.05)) return '1:1';
  if (matchesAspectRatio(w, h, '4:5', 0.05)) return '4:5';
  return null;
}

/**
 * Extract the name prefix and sequence token from a creative name.
 * Returns { prefix, sequenceToken } where sequenceToken is the varying part.
 */
function extractPrefixAndSequence(name: string): { prefix: string; sequenceToken: string | null } {
  for (const pattern of SEQUENCE_PATTERNS) {
    const match = name.match(pattern);
    if (match) {
      const fullMatch = match[0];
      const prefix = name.slice(0, name.length - fullMatch.length).replace(/[_\-\s]+$/, '');
      const sequenceToken = match[match.length - 1] || match[1];
      return { prefix: prefix.toLowerCase().trim(), sequenceToken };
    }
  }
  return { prefix: name.toLowerCase().trim(), sequenceToken: null };
}

/**
 * Check if a string contains carousel keywords
 */
function hasCarouselKeyword(text: string): boolean {
  return CAROUSEL_KEYWORDS.test(text);
}

export interface CarouselGroup {
  id: string;
  name: string;
  rowIds: string[];
  aspectGroup: '1:1' | '4:5';
  confidence: 'high' | 'medium';
  reason: string;
}

/**
 * Detect potential carousel groups from a set of creative rows.
 * Only considers creatives with 1:1 or 4:5 aspect ratios.
 * Groups must have 2-10 cards, same format, and evidence of sequence.
 */
export function detectCarouselGroups(rows: CreativeTextAssetRow[]): CarouselGroup[] {
  const groups: CarouselGroup[] = [];

  // 1. Filter to carousel-compatible rows only
  const candidates: DetectionCandidate[] = rows
    .filter(r => !r.carouselGroupId && !r.processingGroupId) // Skip already-grouped
    .map(row => {
      const aspectGroup = getCarouselAspectGroup(row);
      if (!aspectGroup) return null;

      const nameSource = (row as any).originalFilename || row.creativeName || '';
      const folderPath = (row as any).folderPath || row.folderPath || '';
      const fullContext = `${folderPath}/${nameSource}`;
      // Strip file extension before sequence matching (e.g. Reels_A.jpg → Reels_A)
      const nameWithoutExt = nameSource.replace(/\.[a-zA-Z0-9]{2,5}$/, '');
      const { prefix, sequenceToken } = extractPrefixAndSequence(nameWithoutExt);
      const keyword = hasCarouselKeyword(fullContext);

      return {
        row,
        nameForMatching: nameSource,
        prefix,
        sequenceToken,
        hasCarouselKeyword: keyword,
        aspectGroup,
      } as DetectionCandidate;
    })
    .filter((c): c is DetectionCandidate => c !== null);

  // 2. Group by ad set context + aspect ratio
  const contextGroups = new Map<string, DetectionCandidate[]>();
  for (const c of candidates) {
    const contextKey = `${c.row.platform}|${c.row.market}|${c.row.phase}|${c.row.adSet}|${c.aspectGroup}`;
    if (!contextGroups.has(contextKey)) contextGroups.set(contextKey, []);
    contextGroups.get(contextKey)!.push(c);
  }

  // 3. Within each context group, find clusters by prefix similarity
  for (const [contextKey, contextCandidates] of contextGroups) {
    if (contextCandidates.length < 2) continue;

    // Sub-group by name prefix (rows with the same prefix are likely a carousel)
    const prefixMap = new Map<string, DetectionCandidate[]>();
    for (const c of contextCandidates) {
      if (!prefixMap.has(c.prefix)) prefixMap.set(c.prefix, []);
      prefixMap.get(c.prefix)!.push(c);
    }

    for (const [prefix, prefixGroup] of prefixMap) {
      if (prefixGroup.length < 2 || prefixGroup.length > 10) continue;

      // Check evidence strength
      const hasSequence = prefixGroup.some(c => c.sequenceToken !== null);
      const hasKeyword = prefixGroup.some(c => c.hasCarouselKeyword);
      const allHaveSequence = prefixGroup.every(c => c.sequenceToken !== null);
      const uniqueSequenceTokens = new Set(prefixGroup.filter(c => c.sequenceToken).map(c => c.sequenceToken));

      // Require at minimum: matching prefix + at least one more signal
      if (!hasSequence && !hasKeyword) continue;

      // If we have sequence tokens, they should be unique (different cards)
      if (hasSequence && uniqueSequenceTokens.size < 2) continue;

      const confidence: 'high' | 'medium' = (allHaveSequence && uniqueSequenceTokens.size === prefixGroup.length) || hasKeyword
        ? 'high'
        : 'medium';

      const reasons: string[] = [];
      if (hasSequence) reasons.push('sequential naming');
      if (hasKeyword) reasons.push('carousel keyword');
      reasons.push(`matching prefix "${prefix}"`);

      // Sort by sequence token for natural card ordering
      const sorted = [...prefixGroup].sort((a, b) => {
        if (a.sequenceToken && b.sequenceToken) {
          const numA = parseInt(a.sequenceToken);
          const numB = parseInt(b.sequenceToken);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.sequenceToken.localeCompare(b.sequenceToken);
        }
        return a.nameForMatching.localeCompare(b.nameForMatching);
      });

      const aspectGroup = prefixGroup[0].aspectGroup;
      const groupId = `carousel-detect-${Date.now()}-${groups.length}`;
      const displayName = prefix || sorted[0].row.creativeName;

      groups.push({
        id: groupId,
        name: `${displayName} Carousel`,
        rowIds: sorted.map(c => c.row.id),
        aspectGroup,
        confidence,
        reason: reasons.join(', '),
      });
    }

    // Also check for keyword-only groups (all creatives in a "carousel" folder)
    // Only if they weren't already captured by prefix matching
    const keywordOnly = contextCandidates.filter(c =>
      c.hasCarouselKeyword && !groups.some(g => g.rowIds.includes(c.row.id))
    );
    if (keywordOnly.length >= 2 && keywordOnly.length <= 10) {
      const allSamePrefix = new Set(keywordOnly.map(c => c.prefix)).size === 1;
      if (!allSamePrefix) {
        // Group all keyword-tagged assets together
        const groupId = `carousel-keyword-${Date.now()}-${groups.length}`;
        groups.push({
          id: groupId,
          name: 'Carousel (keyword match)',
          rowIds: keywordOnly.map(c => c.row.id),
          aspectGroup: keywordOnly[0].aspectGroup,
          confidence: 'medium',
          reason: 'carousel keyword in folder/filename',
        });
      }
    }
  }

  return groups;
}

/**
 * Validate that a set of rows can form a carousel.
 * Used for manual "Create Carousel" from selected rows.
 */
export function validateCarouselSelection(rows: CreativeTextAssetRow[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (rows.length < 2) errors.push('Minimum 2 cards required');
  if (rows.length > 10) errors.push('Maximum 10 cards allowed');

  // Same ad set check
  const adSets = new Set(rows.map(r => `${r.platform}|${r.market}|${r.phase}|${r.adSet}`));
  if (adSets.size > 1) errors.push('All cards must be from the same ad set');

  // Aspect ratio check - only 1:1 or 4:5 allowed
  const aspectGroups = rows.map(r => getCarouselAspectGroup(r));
  const incompatible = aspectGroups.filter(g => g === null);
  if (incompatible.length > 0) {
    errors.push(`${incompatible.length} card(s) don't have a carousel-compatible format (only 1:1 or 4:5 allowed)`);
  }

  // All must be same aspect group
  const validGroups = new Set(aspectGroups.filter((g): g is '1:1' | '4:5' => g !== null));
  if (validGroups.size > 1) {
    errors.push('All carousel cards must use the same aspect ratio');
  }

  // Already grouped check
  if (rows.some(r => !!r.carouselGroupId)) {
    errors.push('Some selected creatives are already in a carousel');
  }

  return { isValid: errors.length === 0, errors };
}
