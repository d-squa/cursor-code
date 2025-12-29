// Creative-to-Plan Matching Engine
// GUIDING PRINCIPLE: Inference fills gaps. Intent sets boundaries. Boundaries are never crossed.

import type {
  IngestedCreative,
  ActiPlanTarget,
  CreativeMatch,
  MatchingResult,
  MatchReason,
  MatchConfidence,
  HardConstraints,
  SupportedPlatform,
  PLATFORM_ASPECT_RATIOS,
  PLATFORM_VIDEO_LIMITS,
  PLATFORM_COPY_LIMITS,
} from '@/types/creativeMatching';

// =============================================================================
// PATH/FILENAME INFERENCE (FALLBACK SIGNALS)
// =============================================================================

interface InferredSignals {
  placement?: string;
  format?: string;
  platform?: string;
  aspectRatio?: string;
  market?: string;
  language?: string;
  confidence: 'inferred' | 'explicit';
  sources: string[];
}

// Placement keywords found in filenames/paths
const PLACEMENT_KEYWORDS: Record<string, string[]> = {
  'feed': ['feed', 'newsfeed', 'home'],
  'stories': ['story', 'stories', 'str'],
  'reels': ['reel', 'reels', 'rls'],
  'explore': ['explore', 'exp', 'discovery'],
  'in-stream': ['instream', 'in-stream', 'preroll', 'midroll'],
  'shorts': ['short', 'shorts'],
  'for_you': ['foryou', 'fyp', 'for_you'],
  'carousel': ['carousel', 'car', 'swipe'],
};

// Format keywords found in filenames/paths
const FORMAT_KEYWORDS: Record<string, string[]> = {
  'single': ['single', 'static', 'img', 'image'],
  'carousel': ['carousel', 'car', 'multi'],
  'video': ['video', 'vid', 'mp4', 'mov'],
  'collection': ['collection', 'catalog'],
  'stories': ['story', 'stories', 'str'],
};

// Platform keywords
const PLATFORM_KEYWORDS: Record<string, string[]> = {
  'meta': ['meta', 'facebook', 'fb', 'instagram', 'ig', 'insta'],
  'tiktok': ['tiktok', 'tt', 'tok'],
  'snapchat': ['snap', 'snapchat', 'sc'],
  'linkedin': ['linkedin', 'li', 'lnkd'],
  'x': ['twitter', 'x', 'twt'],
  'pinterest': ['pinterest', 'pin', 'pins'],
  'google': ['google', 'youtube', 'yt', 'gdn'],
};

// Aspect ratio patterns (from dimensions in filename like 1080x1920)
const DIMENSION_PATTERNS = /(\d{3,4})x(\d{3,4})/i;
const RATIO_PATTERNS = /(\d+)[x:](\d+)/i;

/**
 * Extract signals from filename and folder path
 */
export function extractSignalsFromPath(
  filename: string,
  folderPath?: string
): InferredSignals {
  const sources: string[] = [];
  const signals: InferredSignals = { confidence: 'inferred', sources };
  
  const textToSearch = `${folderPath || ''} ${filename}`.toLowerCase();
  
  // Extract dimensions from filename (e.g., "1080x1920", "1920x1080")
  const dimMatch = textToSearch.match(DIMENSION_PATTERNS);
  if (dimMatch) {
    const width = parseInt(dimMatch[1]);
    const height = parseInt(dimMatch[2]);
    const aspectRatio = calculateAspectRatioFromDimensions(width, height);
    signals.aspectRatio = aspectRatio.ratio;
    sources.push(`dimensions from filename: ${width}x${height}`);
  }
  
  // Search for placement keywords
  for (const [placement, keywords] of Object.entries(PLACEMENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (textToSearch.includes(keyword)) {
        signals.placement = placement;
        sources.push(`placement keyword: ${keyword}`);
        break;
      }
    }
    if (signals.placement) break;
  }
  
  // Search for format keywords
  for (const [format, keywords] of Object.entries(FORMAT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (textToSearch.includes(keyword)) {
        signals.format = format;
        sources.push(`format keyword: ${keyword}`);
        break;
      }
    }
    if (signals.format) break;
  }
  
  // Search for platform keywords
  for (const [platform, keywords] of Object.entries(PLATFORM_KEYWORDS)) {
    for (const keyword of keywords) {
      if (textToSearch.includes(keyword)) {
        signals.platform = platform;
        sources.push(`platform keyword: ${keyword}`);
        break;
      }
    }
    if (signals.platform) break;
  }
  
  // Common market codes in filenames
  const marketPatterns = [
    /[_\-\/](uae|ae|sa|kw|qa|bh|om|eg|jo|lb|iq)[_\-\.\/]/i,
    /[_\-\/](us|uk|gb|de|fr|es|it|nl|au|ca|jp|kr|in|br|mx)[_\-\.\/]/i,
  ];
  for (const pattern of marketPatterns) {
    const match = textToSearch.match(pattern);
    if (match) {
      signals.market = match[1].toUpperCase();
      sources.push(`market code from path: ${match[1]}`);
      break;
    }
  }
  
  // Language codes
  const langPatterns = /[_\-\/](en|ar|es|fr|de|it|pt|nl|ja|ko|zh|hi)[_\-\.\/]/i;
  const langMatch = textToSearch.match(langPatterns);
  if (langMatch) {
    signals.language = langMatch[1].toLowerCase();
    sources.push(`language code from path: ${langMatch[1]}`);
  }
  
  return signals;
}

/**
 * Get placement suggestions based on aspect ratio
 */
export function getPlacementsForAspectRatio(aspectRatio: string): string[] {
  const ratio = aspectRatio.toLowerCase().replace(' ', '');
  
  const placementMap: Record<string, string[]> = {
    '9:16': ['Stories', 'Reels', 'For You', 'Shorts', 'Spotlight'],
    '1:1': ['Feed', 'Explore', 'Marketplace', 'Carousel'],
    '4:5': ['Feed', 'Reels'],
    '16:9': ['In-Stream', 'YouTube', 'Feed', 'Landscape'],
    '1.91:1': ['Link Ads', 'Display', 'Right Column'],
    '2:3': ['Pinterest Feed', 'Stories'],
  };
  
  return placementMap[ratio] || [];
}

// =============================================================================
// HARD CONSTRAINT VALIDATION (NON-NEGOTIABLE)
// =============================================================================

/**
 * Validates hard constraints - Market, Language, Variant
 * Now handles single-market/platform ActiPlans gracefully
 */
export function validateHardConstraints(
  creativeConstraints: HardConstraints,
  targetConstraints: { market: string; language?: string; variant?: string },
  options?: { 
    isSingleMarketPlan?: boolean;
    isSinglePlatformPlan?: boolean;
    inferredSignals?: InferredSignals;
  }
): { 
  passed: boolean; 
  failures: Array<{ constraint: keyof HardConstraints; expected: string; actual: string }>;
  notes: string[];
  inferenceUsed: boolean;
} {
  const failures: Array<{ constraint: keyof HardConstraints; expected: string; actual: string }> = [];
  const notes: string[] = [];
  let inferenceUsed = false;

  // Market check - with smart handling for single-market plans
  if (creativeConstraints.market && targetConstraints.market) {
    if (creativeConstraints.market.toUpperCase() !== targetConstraints.market.toUpperCase()) {
      failures.push({
        constraint: 'market',
        expected: targetConstraints.market,
        actual: creativeConstraints.market,
      });
    }
  } else if (!creativeConstraints.market && targetConstraints.market) {
    // Creative has no explicit market constraint
    if (options?.isSingleMarketPlan) {
      // Single-market plan: assume creative is for that market
      notes.push(`Market assumed to be ${targetConstraints.market} (single-market plan)`);
      inferenceUsed = true;
    } else if (options?.inferredSignals?.market) {
      // Try to use inferred market from filename
      if (options.inferredSignals.market.toUpperCase() === targetConstraints.market.toUpperCase()) {
        notes.push(`Market inferred from filename: ${options.inferredSignals.market}`);
        inferenceUsed = true;
      } else {
        failures.push({
          constraint: 'market',
          expected: targetConstraints.market,
          actual: options.inferredSignals.market,
        });
      }
    } else {
      notes.push(`Market not specified on creative (target requires: ${targetConstraints.market})`);
    }
  }

  // Language check - MANDATORY if defined on either side
  if (creativeConstraints.language && targetConstraints.language) {
    if (creativeConstraints.language.toLowerCase() !== targetConstraints.language.toLowerCase()) {
      failures.push({
        constraint: 'language',
        expected: targetConstraints.language,
        actual: creativeConstraints.language,
      });
    }
  } else if (!creativeConstraints.language && targetConstraints.language && options?.inferredSignals?.language) {
    if (options.inferredSignals.language.toLowerCase() === targetConstraints.language.toLowerCase()) {
      notes.push(`Language inferred from filename: ${options.inferredSignals.language}`);
      inferenceUsed = true;
    }
  }

  // Variant check - MANDATORY if defined on either side
  if (creativeConstraints.variant && targetConstraints.variant) {
    if (creativeConstraints.variant !== targetConstraints.variant) {
      failures.push({
        constraint: 'variant',
        expected: targetConstraints.variant,
        actual: creativeConstraints.variant,
      });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    notes,
    inferenceUsed,
  };
}

// =============================================================================
// SOFT COMPATIBILITY SCORING
// =============================================================================

interface SoftCompatibilityResult {
  score: number;  // 0-100
  issues: Array<{
    type: 'platform' | 'placement' | 'format' | 'aspect_ratio' | 'duration' | 'objective';
    severity: 'warning' | 'error';
    message: string;
    canOverride: boolean;
    deduction: number;
  }>;
  reasons: MatchReason[];
}

/**
 * Evaluates soft compatibility factors:
 * - Platform
 * - Objective
 * - Format
 * - Placement
 * - Aspect ratio
 * - Duration
 * 
 * Now enhanced with inferred signals from filename/path
 */
export function evaluateSoftCompatibility(
  creative: IngestedCreative,
  target: ActiPlanTarget,
  inferredSignals?: InferredSignals
): SoftCompatibilityResult {
  let score = 100;
  const issues: SoftCompatibilityResult['issues'] = [];
  const reasons: MatchReason[] = [];

  // 1. Platform compatibility (enhanced with inferred signals)
  const creativePlatform = creative.compatibility.supportedPlatforms.find(p => p === target.platform);
  const inferredPlatform = inferredSignals?.platform;
  
  if (creativePlatform) {
    reasons.push({
      factor: 'Platform',
      contribution: 'positive',
      weight: 20,
      explanation: `Asset is compatible with ${target.platform}`,
    });
  } else if (inferredPlatform === target.platform) {
    // Platform was inferred from filename
    reasons.push({
      factor: 'Platform (Inferred)',
      contribution: 'positive',
      weight: 15,
      explanation: `Platform inferred from filename matches ${target.platform}`,
    });
  } else {
    const unsupported = creative.compatibility.unsupportedPlatforms.find(
      p => p.platform === target.platform
    );
    issues.push({
      type: 'platform',
      severity: 'error',
      message: unsupported?.reason || `Asset is not compatible with ${target.platform}`,
      canOverride: false,
      deduction: 50,
    });
    score -= 50;
    reasons.push({
      factor: 'Platform',
      contribution: 'negative',
      weight: 20,
      explanation: unsupported?.reason || `Not compatible with ${target.platform}`,
    });
  }

  // 2. Aspect ratio compatibility (enhanced with dimension-based inference)
  if (creative.technicalAttributes.dimensions && target.aspectRatioConstraints?.length) {
    const creativeRatio = creative.technicalAttributes.dimensions.aspectRatio;
    const isCompatible = target.aspectRatioConstraints.some(constraint => 
      normalizeAspectRatio(creativeRatio) === normalizeAspectRatio(constraint)
    );
    
    if (isCompatible) {
      reasons.push({
        factor: 'Aspect Ratio',
        contribution: 'positive',
        weight: 15,
        explanation: `Aspect ratio ${creativeRatio} matches target constraints`,
      });
      
      // Add placement suggestion based on aspect ratio
      const suggestedPlacements = getPlacementsForAspectRatio(creativeRatio);
      if (suggestedPlacements.length > 0) {
        reasons.push({
          factor: 'Placement Hint',
          contribution: 'neutral',
          weight: 0,
          explanation: `${creativeRatio} is ideal for: ${suggestedPlacements.slice(0, 3).join(', ')}`,
        });
      }
    } else {
      const croppingRisk = creative.compatibility.croppingRisk;
      if (croppingRisk === 'high') {
        issues.push({
          type: 'aspect_ratio',
          severity: 'error',
          message: `Aspect ratio ${creativeRatio} requires significant cropping`,
          canOverride: true,
          deduction: 25,
        });
        score -= 25;
      } else if (croppingRisk === 'medium') {
        issues.push({
          type: 'aspect_ratio',
          severity: 'warning',
          message: `Aspect ratio ${creativeRatio} may require minor cropping`,
          canOverride: true,
          deduction: 10,
        });
        score -= 10;
      }
      reasons.push({
        factor: 'Aspect Ratio',
        contribution: 'negative',
        weight: 15,
        explanation: `Aspect ratio ${creativeRatio} doesn't match constraints: ${target.aspectRatioConstraints.join(', ')}`,
      });
    }
  } else if (inferredSignals?.aspectRatio && target.aspectRatioConstraints?.length) {
    // Use inferred aspect ratio from filename dimensions
    const isCompatible = target.aspectRatioConstraints.some(constraint =>
      normalizeAspectRatio(inferredSignals.aspectRatio!) === normalizeAspectRatio(constraint)
    );
    if (isCompatible) {
      reasons.push({
        factor: 'Aspect Ratio (Inferred)',
        contribution: 'positive',
        weight: 10,
        explanation: `Inferred aspect ratio ${inferredSignals.aspectRatio} matches target`,
      });
    }
  }

  // 3. Duration compatibility (for video)
  if (creative.technicalAttributes.durationSeconds && target.durationConstraints) {
    const duration = creative.technicalAttributes.durationSeconds;
    const { min, max } = target.durationConstraints;
    
    if ((min && duration < min) || (max && duration > max)) {
      issues.push({
        type: 'duration',
        severity: 'error',
        message: `Video duration ${duration}s is outside allowed range (${min || 0}-${max || '∞'}s)`,
        canOverride: false,
        deduction: 30,
      });
      score -= 30;
      reasons.push({
        factor: 'Duration',
        contribution: 'negative',
        weight: 15,
        explanation: `Duration ${duration}s violates constraints`,
      });
    } else {
      reasons.push({
        factor: 'Duration',
        contribution: 'positive',
        weight: 15,
        explanation: `Duration ${duration}s is within acceptable range`,
      });
    }
  }

  // 4. Placement compatibility (enhanced with inferred signals)
  if (target.placementConstraints?.length) {
    const compatiblePlacements = creative.compatibility.compatiblePlacements.filter(
      p => target.placementConstraints!.includes(p)
    );
    
    // Also check inferred placement from filename
    const inferredPlacementMatch = inferredSignals?.placement && 
      target.placementConstraints.some(p => 
        p.toLowerCase().includes(inferredSignals.placement!) ||
        inferredSignals.placement!.includes(p.toLowerCase())
      );
    
    if (compatiblePlacements.length > 0) {
      reasons.push({
        factor: 'Placement',
        contribution: 'positive',
        weight: 10,
        explanation: `Compatible with placements: ${compatiblePlacements.join(', ')}`,
      });
    } else if (inferredPlacementMatch) {
      reasons.push({
        factor: 'Placement (Inferred)',
        contribution: 'positive',
        weight: 7,
        explanation: `Placement inferred from filename: ${inferredSignals.placement}`,
      });
    } else {
      issues.push({
        type: 'placement',
        severity: 'error',
        message: `Asset doesn't support required placements: ${target.placementConstraints.join(', ')}`,
        canOverride: false,
        deduction: 20,
      });
      score -= 20;
      reasons.push({
        factor: 'Placement',
        contribution: 'negative',
        weight: 10,
        explanation: 'No compatible placements found',
      });
    }
  }

  // 5. Format compatibility (enhanced with inferred signals)
  if (target.formatConstraints?.length) {
    const inferredFormat = inferredSignals?.format;
    
    if (target.formatConstraints.includes(creative.compositeFormat)) {
      reasons.push({
        factor: 'Format',
        contribution: 'positive',
        weight: 10,
        explanation: `Format ${creative.compositeFormat} is allowed`,
      });
    } else if (inferredFormat && target.formatConstraints.some(f => f.includes(inferredFormat))) {
      reasons.push({
        factor: 'Format (Inferred)',
        contribution: 'positive',
        weight: 7,
        explanation: `Format inferred from filename: ${inferredFormat}`,
      });
    } else {
      issues.push({
        type: 'format',
        severity: 'warning',
        message: `Format ${creative.compositeFormat} may not be optimal for this placement`,
        canOverride: true,
        deduction: 10,
      });
      score -= 10;
      reasons.push({
        factor: 'Format',
        contribution: 'negative',
        weight: 10,
        explanation: `Format ${creative.compositeFormat} not in preferred: ${target.formatConstraints.join(', ')}`,
      });
    }
  }

  // 6. Objective alignment (bonus points if explicitly aligned)
  if (target.objective && creative.copy?.callToAction) {
    const ctaAligned = isCTAAlignedWithObjective(creative.copy.callToAction, target.objective);
    if (ctaAligned) {
      reasons.push({
        factor: 'Objective Alignment',
        contribution: 'positive',
        weight: 5,
        explanation: `CTA "${creative.copy.callToAction}" aligns with ${target.objective} objective`,
      });
      score = Math.min(100, score + 5);
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    reasons,
  };
}

// =============================================================================
// MAIN MATCHING ALGORITHM
// =============================================================================

/**
 * Analyze plan structure to determine if it's single-market or single-platform
 */
export function analyzePlanStructure(targets: ActiPlanTarget[]): {
  isSingleMarketPlan: boolean;
  isSinglePlatformPlan: boolean;
  uniqueMarkets: string[];
  uniquePlatforms: string[];
} {
  const uniqueMarkets = [...new Set(targets.map(t => t.market.toUpperCase()))];
  const uniquePlatforms = [...new Set(targets.map(t => t.platform))];
  
  return {
    isSingleMarketPlan: uniqueMarkets.length === 1,
    isSinglePlatformPlan: uniquePlatforms.length === 1,
    uniqueMarkets,
    uniquePlatforms,
  };
}

/**
 * Matches a single creative against all available ActiPlan targets
 * MATCHING ORDER (MANDATORY):
 * 1. Hard constraints first (Market, Language, Variant) - If mismatch → STOP
 * 2. Soft compatibility evaluation (Platform, Objective, Format, Placement, Aspect ratio, Duration)
 * 
 * NEW: Handles single-market/platform ActiPlans with filename/path inference
 */
export function matchCreativeToTargets(
  creative: IngestedCreative,
  targets: ActiPlanTarget[]
): MatchingResult {
  const validMatches: CreativeMatch[] = [];
  const noMatchReasons: string[] = [];

  // Analyze plan structure
  const planStructure = analyzePlanStructure(targets);
  
  // Extract signals from filename/path for fallback matching
  const inferredSignals = extractSignalsFromPath(
    creative.technicalAttributes.originalFilename,
    creative.sourcePath
  );

  for (const target of targets) {
    // STEP 1: Hard constraint validation (with smart handling for single-market plans)
    const hardCheck = validateHardConstraints(creative.hardConstraints, {
      market: target.market,
      language: target.language,
      variant: target.variant,
    }, {
      isSingleMarketPlan: planStructure.isSingleMarketPlan,
      isSinglePlatformPlan: planStructure.isSinglePlatformPlan,
      inferredSignals,
    });

    if (!hardCheck.passed) {
      // Hard constraint failed - skip this target entirely
      continue;
    }

    // STEP 2: Soft compatibility evaluation (enhanced with inferred signals)
    const softResult = evaluateSoftCompatibility(creative, target, inferredSignals);

    // Calculate overall confidence
    const { confidence, confidenceScore } = calculateConfidence(
      softResult.score, 
      softResult.issues,
      hardCheck.inferenceUsed
    );

    const match: CreativeMatch = {
      creative,
      target,
      confidence,
      confidenceScore,
      reasons: [
        ...softResult.reasons,
        // Add notes about inference if used
        ...hardCheck.notes.map(note => ({
          factor: 'Inference',
          contribution: 'neutral' as const,
          weight: 0,
          explanation: note,
        })),
      ],
      hardConstraintsPassed: true,
      softCompatibilityScore: softResult.score,
      compatibilityIssues: softResult.issues.map(issue => ({
        type: issue.type,
        severity: issue.severity,
        message: issue.message,
        canOverride: issue.canOverride,
      })),
    };

    validMatches.push(match);
  }

  // Sort by confidence score (highest first)
  validMatches.sort((a, b) => b.confidenceScore - a.confidenceScore);

  // Determine recommended match
  const recommendedMatch = validMatches.find(m => m.confidence !== 'none');

  // Build result
  const result: MatchingResult = {
    creative,
    validMatches,
    recommendedMatch,
    alternativeMatches: validMatches.filter(m => m !== recommendedMatch),
  };

  // If no valid matches, provide detailed reasons and suggestions
  if (validMatches.length === 0) {
    result.noMatchReasons = [];
    
    // Check if it's a constraint mismatch or missing constraint
    if (creative.hardConstraints.market) {
      result.noMatchReasons.push(`Creative specifies market: ${creative.hardConstraints.market}, but no matching target found`);
    } else if (!planStructure.isSingleMarketPlan) {
      result.noMatchReasons.push(`Market not specified on creative. Plan has ${planStructure.uniqueMarkets.length} markets: ${planStructure.uniqueMarkets.join(', ')}`);
    }
    
    if (creative.hardConstraints.language) {
      result.noMatchReasons.push(`Creative requires language: ${creative.hardConstraints.language}`);
    }
    
    if (creative.hardConstraints.variant) {
      result.noMatchReasons.push(`Creative requires variant: ${creative.hardConstraints.variant}`);
    }
    
    // Add inferred signals as helpful hints
    if (inferredSignals.sources.length > 0) {
      result.noMatchReasons.push(`Inferred from filename: ${inferredSignals.sources.join(', ')}`);
    }
    
    // Suggest placements based on dimensions
    if (creative.technicalAttributes.dimensions) {
      const suggestedPlacements = getPlacementsForAspectRatio(creative.technicalAttributes.dimensions.aspectRatio);
      if (suggestedPlacements.length > 0) {
        result.noMatchReasons.push(`Based on ${creative.technicalAttributes.dimensions.aspectRatio} aspect ratio, best for: ${suggestedPlacements.join(', ')}`);
      }
    }

    result.suggestedActions = [
      {
        action: 'create_structure',
        description: `Create a new ad set for market "${creative.hardConstraints.market || inferredSignals.market || 'unspecified'}"`,
      },
      {
        action: 'modify_asset',
        description: 'Add market/language info to filename (e.g., creative_UAE_EN.mp4)',
      },
    ];
  }

  return result;
}

/**
 * Batch matching - processes multiple creatives against targets
 */
export function matchCreativesToTargets(
  creatives: IngestedCreative[],
  targets: ActiPlanTarget[]
): MatchingResult[] {
  return creatives.map(creative => matchCreativeToTargets(creative, targets));
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function calculateConfidence(
  softScore: number,
  issues: SoftCompatibilityResult['issues'],
  inferenceUsed?: boolean
): { confidence: MatchConfidence; confidenceScore: number } {
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  let confidenceScore = softScore;
  
  // Penalize for errors and warnings
  confidenceScore -= errorCount * 10;
  confidenceScore -= warningCount * 3;
  
  // Slight penalty if inference was used (less certain)
  if (inferenceUsed) {
    confidenceScore -= 5;
  }
  
  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  let confidence: MatchConfidence;
  if (errorCount > 1 || confidenceScore < 40) {
    confidence = 'none';
  } else if (confidenceScore >= 80) {
    confidence = 'high';
  } else if (confidenceScore >= 60) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { confidence, confidenceScore };
}

function normalizeAspectRatio(ratio: string): string {
  // Handle formats like "16:9", "1.91:1", "9:16"
  const parts = ratio.split(':').map(p => parseFloat(p.trim()));
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    return ratio.toLowerCase();
  }
  
  // Normalize to lowest terms (roughly)
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(Math.round(parts[0] * 100), Math.round(parts[1] * 100));
  const a = Math.round(parts[0] * 100 / divisor);
  const b = Math.round(parts[1] * 100 / divisor);
  
  return `${a}:${b}`;
}

function isCTAAlignedWithObjective(cta: string, objective: string): boolean {
  const alignmentMap: Record<string, string[]> = {
    CONVERSIONS: ['SHOP_NOW', 'ORDER_NOW', 'GET_OFFER', 'SUBSCRIBE', 'SIGN_UP', 'APPLY_NOW'],
    TRAFFIC: ['LEARN_MORE', 'WATCH_MORE', 'SEE_MENU'],
    APP_INSTALLS: ['DOWNLOAD', 'INSTALL_APP', 'USE_APP', 'PLAY_GAME'],
    LEAD_GENERATION: ['SIGN_UP', 'APPLY_NOW', 'GET_QUOTE', 'CONTACT_US'],
    MESSAGES: ['SEND_MESSAGE', 'WHATSAPP_MESSAGE', 'CONTACT_US'],
    ENGAGEMENT: ['LEARN_MORE', 'WATCH_MORE'],
    REACH: ['LEARN_MORE', 'WATCH_MORE'],
    VIDEO_VIEWS: ['WATCH_MORE', 'LEARN_MORE'],
  };

  const objectiveKey = objective.toUpperCase().replace(/[\s-]/g, '_');
  const alignedCTAs = alignmentMap[objectiveKey] || [];
  
  return alignedCTAs.includes(cta.toUpperCase());
}

// =============================================================================
// CONFLICT RESOLUTION
// =============================================================================

/**
 * When multiple valid matches exist for a creative, rank them
 */
export function rankMatches(matches: CreativeMatch[]): CreativeMatch[] {
  return [...matches].sort((a, b) => {
    // Primary: confidence score
    if (b.confidenceScore !== a.confidenceScore) {
      return b.confidenceScore - a.confidenceScore;
    }
    
    // Secondary: fewer issues
    if (a.compatibilityIssues.length !== b.compatibilityIssues.length) {
      return a.compatibilityIssues.length - b.compatibilityIssues.length;
    }
    
    // Tertiary: prefer targets with explicit constraints that match
    const aConstraintMatch = countMatchingConstraints(a);
    const bConstraintMatch = countMatchingConstraints(b);
    
    return bConstraintMatch - aConstraintMatch;
  });
}

function countMatchingConstraints(match: CreativeMatch): number {
  let count = 0;
  const c = match.creative.hardConstraints;
  const t = match.target;
  
  if (c.market && t.market && c.market.toUpperCase() === t.market.toUpperCase()) count++;
  if (c.language && t.language && c.language.toLowerCase() === t.language.toLowerCase()) count++;
  if (c.variant && t.variant && c.variant === t.variant) count++;
  
  return count;
}

// =============================================================================
// CALCULATE ASPECT RATIO FROM DIMENSIONS
// =============================================================================

export function calculateAspectRatioFromDimensions(width: number, height: number): { 
  ratio: string; 
  numeric: number 
} {
  const numeric = width / height;
  
  // Common aspect ratios
  const commonRatios = [
    { ratio: '1:1', numeric: 1 },
    { ratio: '4:5', numeric: 0.8 },
    { ratio: '9:16', numeric: 0.5625 },
    { ratio: '16:9', numeric: 1.7778 },
    { ratio: '1.91:1', numeric: 1.91 },
    { ratio: '2:3', numeric: 0.6667 },
    { ratio: '3:2', numeric: 1.5 },
    { ratio: '4:3', numeric: 1.3333 },
    { ratio: '3:4', numeric: 0.75 },
  ];
  
  // Find closest match
  let closest = commonRatios[0];
  let minDiff = Math.abs(numeric - closest.numeric);
  
  for (const r of commonRatios) {
    const diff = Math.abs(numeric - r.numeric);
    if (diff < minDiff) {
      minDiff = diff;
      closest = r;
    }
  }
  
  // If close enough to a common ratio, use it
  if (minDiff < 0.05) {
    return { ratio: closest.ratio, numeric };
  }
  
  // Otherwise, calculate raw ratio
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(Math.round(width), Math.round(height));
  const a = Math.round(width / divisor);
  const b = Math.round(height / divisor);
  
  // Simplify further if needed
  if (a > 20 || b > 20) {
    return { ratio: `${(numeric).toFixed(2)}:1`, numeric };
  }
  
  return { ratio: `${a}:${b}`, numeric };
}
