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
// HARD CONSTRAINT VALIDATION (NON-NEGOTIABLE)
// =============================================================================

/**
 * Validates hard constraints - Market, Language, Variant
 * If ANY mismatch → STOP matching immediately
 * 🚫 No inference, 🚫 No confidence override, 🚫 No "near match" suggestions
 */
export function validateHardConstraints(
  creativeConstraints: HardConstraints,
  targetConstraints: { market: string; language?: string; variant?: string }
): { passed: boolean; failures: Array<{ constraint: keyof HardConstraints; expected: string; actual: string }> } {
  const failures: Array<{ constraint: keyof HardConstraints; expected: string; actual: string }> = [];

  // Market check - MANDATORY if defined on either side
  if (creativeConstraints.market && targetConstraints.market) {
    if (creativeConstraints.market.toUpperCase() !== targetConstraints.market.toUpperCase()) {
      failures.push({
        constraint: 'market',
        expected: targetConstraints.market,
        actual: creativeConstraints.market,
      });
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
 */
export function evaluateSoftCompatibility(
  creative: IngestedCreative,
  target: ActiPlanTarget
): SoftCompatibilityResult {
  let score = 100;
  const issues: SoftCompatibilityResult['issues'] = [];
  const reasons: MatchReason[] = [];

  // 1. Platform compatibility
  if (creative.compatibility.supportedPlatforms.includes(target.platform)) {
    reasons.push({
      factor: 'Platform',
      contribution: 'positive',
      weight: 20,
      explanation: `Asset is compatible with ${target.platform}`,
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

  // 2. Aspect ratio compatibility
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

  // 4. Placement compatibility
  if (target.placementConstraints?.length) {
    const compatiblePlacements = creative.compatibility.compatiblePlacements.filter(
      p => target.placementConstraints!.includes(p)
    );
    
    if (compatiblePlacements.length === 0) {
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
    } else {
      reasons.push({
        factor: 'Placement',
        contribution: 'positive',
        weight: 10,
        explanation: `Compatible with placements: ${compatiblePlacements.join(', ')}`,
      });
    }
  }

  // 5. Format compatibility
  if (target.formatConstraints?.length) {
    if (target.formatConstraints.includes(creative.compositeFormat)) {
      reasons.push({
        factor: 'Format',
        contribution: 'positive',
        weight: 10,
        explanation: `Format ${creative.compositeFormat} is allowed`,
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
 * Matches a single creative against all available ActiPlan targets
 * MATCHING ORDER (MANDATORY):
 * 1. Hard constraints first (Market, Language, Variant) - If mismatch → STOP
 * 2. Soft compatibility evaluation (Platform, Objective, Format, Placement, Aspect ratio, Duration)
 */
export function matchCreativeToTargets(
  creative: IngestedCreative,
  targets: ActiPlanTarget[]
): MatchingResult {
  const validMatches: CreativeMatch[] = [];
  const noMatchReasons: string[] = [];

  for (const target of targets) {
    // STEP 1: Hard constraint validation (NON-NEGOTIABLE)
    const hardCheck = validateHardConstraints(creative.hardConstraints, {
      market: target.market,
      language: target.language,
      variant: target.variant,
    });

    if (!hardCheck.passed) {
      // Hard constraint failed - skip this target entirely
      continue;
    }

    // STEP 2: Soft compatibility evaluation
    const softResult = evaluateSoftCompatibility(creative, target);

    // Calculate overall confidence
    const { confidence, confidenceScore } = calculateConfidence(softResult.score, softResult.issues);

    const match: CreativeMatch = {
      creative,
      target,
      confidence,
      confidenceScore,
      reasons: softResult.reasons,
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

  // If no valid matches, provide reasons and suggestions
  if (validMatches.length === 0) {
    result.noMatchReasons = [
      'No targets matched the creative\'s hard constraints (Market, Language, Variant)',
    ];
    
    if (creative.hardConstraints.market) {
      result.noMatchReasons.push(`Creative requires market: ${creative.hardConstraints.market}`);
    }
    if (creative.hardConstraints.language) {
      result.noMatchReasons.push(`Creative requires language: ${creative.hardConstraints.language}`);
    }
    if (creative.hardConstraints.variant) {
      result.noMatchReasons.push(`Creative requires variant: ${creative.hardConstraints.variant}`);
    }

    result.suggestedActions = [
      {
        action: 'create_structure',
        description: `Create a new ad set for market "${creative.hardConstraints.market || 'unspecified'}"`,
      },
      {
        action: 'modify_asset',
        description: 'Remove or update market/language constraints on the creative',
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
  issues: SoftCompatibilityResult['issues']
): { confidence: MatchConfidence; confidenceScore: number } {
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  let confidenceScore = softScore;
  
  // Penalize for errors and warnings
  confidenceScore -= errorCount * 10;
  confidenceScore -= warningCount * 3;
  
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
