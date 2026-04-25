// Hook for creative-to-plan matching workflow
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { HardConstraints, SupportedPlatform, AssetMediaType } from '@/types/creativeMatching';
import { generateAdTaxonomyName, AD_TAXONOMY_MAPPINGS, createShortCode, getDefaultAdSetParams, extractTaxonomyValues, generateTaxonomyString, TaxonomyContext, TaxonomyParam } from '@/utils/taxonomyUtils';
import { validateCreativeForAds, findCompatibleFormats, PLATFORM_AD_SPECS } from '@/utils/platformAdSpecs';
import { buildSearchStrategyCampaignName, getEffectiveSearchKeywords, getSearchStrategyGroups, isSearchPhaseLike } from '@/utils/searchStrategyCampaigns';

// Helper to generate taxonomy-based creative name
function generateCreativeTaxonomyName(asset: DigestedAsset, structure: CampaignStructure): string {
  // Build taxonomy name from asset and structure data
  const parts: string[] = [];
  
  // Platform shortcode
  const platformMap: Record<string, string> = { meta: 'META', tiktok: 'TT', google: 'GADS' };
  parts.push(platformMap[structure.platform] || structure.platform.toUpperCase());
  
  // Market
  if (structure.market) {
    parts.push(structure.market.toUpperCase());
  }
  
  // Phase/funnel stage
  if (structure.phases?.[0]) {
    const phaseMap: Record<string, string> = { awareness: 'TOF', consideration: 'MOF', conversion: 'BOF' };
    const phaseLower = structure.phases[0].toLowerCase();
    parts.push(phaseMap[phaseLower] || createShortCode(structure.phases[0]));
  }
  
  // Format (IMG/VID)
  parts.push(asset.mediaType === 'video' ? 'VID' : 'IMG');
  
  // Aspect ratio if available
  if (asset.technicalAttributes.aspectRatio) {
    const arMap: Record<string, string> = { '1:1': 'SQ', '16:9': 'LS', '9:16': 'PT', '4:5': '45' };
    parts.push(arMap[asset.technicalAttributes.aspectRatio] || asset.technicalAttributes.aspectRatio.replace(':', 'x'));
  }
  
  // Language if specified
  if (asset.hardConstraints?.language) {
    parts.push(asset.hardConstraints.language.toUpperCase().substring(0, 2));
  }
  
  // Variant from file path if available
  if (asset.hardConstraints?.variant) {
    parts.push(asset.hardConstraints.variant.toUpperCase());
  }
  
  // Fallback to cleaned filename if no parts
  if (parts.length < 3) {
    const cleanName = asset.fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    return cleanName.toUpperCase();
  }
  
  return parts.join('_');
}

// UI-focused types for the matching workflow
export interface DigestedAsset {
  id: string;
  originalFile: File;
  fileName: string;
  filePath: string;
  mediaType: AssetMediaType;
  technicalAttributes: {
    width?: number;
    height?: number;
    aspectRatio?: string;
    duration?: number;
    fileSize: number;
    contentHash?: string;
  };
  hardConstraints: HardConstraints;
  compatibilitySignals: any;
  digestedAt: string;
  sourceType: string;
  // Source network for organic posts (facebook vs instagram)
  sourceNetwork?: 'facebook' | 'instagram';
}

export interface CampaignStructure {
  id: string;
  campaignId: string;
  campaignName: string;
  platform: SupportedPlatform;
  adSetId?: string;
  adSetName: string;
  objective: string;
  market?: string;
  language?: string;
  variant?: string;
  placementConstraints: string[];
  formatConstraints: string[];
  optimizationGoal?: string;
  phases?: string[];
  funnelStage?: string;
  // Ad set split dimensions for precise matching
  splitDimension?: string; // The dimension being split: 'gender', 'device', 'language', 'age', etc.
  languageIsSplitDimension?: boolean; // True if language is the split dimension
  deviceConstraints?: string[];
  genderConstraint?: string;
  ageConstraints?: { min: number; max: number };
  audienceTypeConstraint?: string;
  audiences?: Array<{ id: string; name: string; type: string }>;
  // Budget info
  budgetAmount?: number;
  budgetType?: 'daily' | 'lifetime';
  // Parsed taxonomy elements from adSetName for display and matching
  taxonomyElements?: Record<string, string>;
  // TikTok-specific fields from phase/market config
  tiktokIdentityId?: string;
  // Google Ads campaign type (Search, Display, Video, Performance Max, etc.)
  googleCampaignType?: string;
  keywordStrategy?: 'brand' | 'generic' | 'competition';
}

export interface UIMatchingResult {
  assetId: string;
  matches: UICreativeMatch[];
  bestMatch?: UICreativeMatch;
  noMatchReasons?: string[];
}

export interface UICreativeMatch {
  structure: CampaignStructure;
  confidenceScore: number;
  reasoning: string[];
  compatibilityIssues: Array<{ type: string; severity: 'warning' | 'error'; message: string; platform?: string; suggestion?: string }>;
  hardConstraintsMet: boolean;
}

// Structure-centric result: for each ad set, which assets fit
export interface StructureMatchResult {
  structure: CampaignStructure;
  assignedAssets: Array<{
    asset: DigestedAsset;
    confidenceScore: number;
    reasoning: string[];
    matchedCriteria: string[];  // Which extracted criteria matched taxonomy elements
    issues: Array<{ type: string; severity: 'warning' | 'error'; message: string }>;
  }>;
}

// Unassigned asset with explanation
export interface UnassignedAsset {
  asset: DigestedAsset;
  extractedSignals: Record<string, string>;  // What we found in the filename
  reasons: string[];  // Why it couldn't be assigned
  closestMatches?: Array<{
    structure: CampaignStructure;
    score: number;
    blockingReasons: string[];
  }>;
}

// Save progress status for each creative
export type SaveStatus = 'pending' | 'uploading' | 'saving' | 'done' | 'error';
export interface SaveProgressItem {
  compositeKey: string; // assetId:structureId
  assetId: string;
  structureId: string;
  status: SaveStatus;
  error?: string;
}

export interface MatchingState {
  assets: DigestedAsset[];
  structures: CampaignStructure[];
  results: UIMatchingResult[];
  // Structure-centric results
  structureResults: StructureMatchResult[];
  unassignedAssets: UnassignedAsset[];
  acceptedMatches: Map<string, UICreativeMatch>;
  rejectedMatches: Map<string, Set<string>>;
  isProcessing: boolean;
  currentStep: 'upload' | 'digest' | 'match' | 'review' | 'text_assets' | 'complete';
  // Saved assignment IDs for text asset editing
  savedAssignments?: Array<{ id: string; creativeId: string; platform: string; market: string; phaseName: string; creativeName: string; mediaType: 'image' | 'video' }>;
  // Save progress tracking
  saveProgress: Map<string, SaveProgressItem>;
}

export function useCreativeMatching(campaignId?: string, selectedPlatform?: SupportedPlatform) {
  const { user } = useAuth();
  const [state, setState] = useState<MatchingState>({
    assets: [],
    structures: [],
    results: [],
    structureResults: [],
    unassignedAssets: [],
    acceptedMatches: new Map(),
    rejectedMatches: new Map(),
    isProcessing: false,
    currentStep: 'upload',
    saveProgress: new Map(),
  });
  
  // Use a ref to always access the latest state in callbacks (avoids stale closure issues)
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Load campaign structures from an ActiPlan - extracts ALL ad set configurations
  const loadCampaignStructures = useCallback(async (campaignIdToLoad: string): Promise<CampaignStructure[]> => {
    if (!user) return [];
    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignIdToLoad)
        .single();

      if (error) throw error;

      const structures: CampaignStructure[] = [];

      const platformsRaw = (campaign as any)?.platforms;
      const platforms: any[] = Array.isArray(platformsRaw) ? platformsRaw : [];

      const marketSplitsRaw = (campaign as any)?.market_splits;
      const marketSplits: Record<string, any> = marketSplitsRaw && typeof marketSplitsRaw === 'object' ? marketSplitsRaw : {};
      
      // Extract targeting config from generic_config for inherited ad set splits
      const genericConfig = (campaign as any)?.generic_config || {};
      const basicTargeting = genericConfig?.targetingPreset || genericConfig?.basicTargeting || {};
      const selectedKeywords = Array.isArray(basicTargeting?.selectedKeywords)
        ? basicTargeting.selectedKeywords
        : (Array.isArray(genericConfig?.selectedKeywords) ? genericConfig.selectedKeywords : []);
      
      // Fetch taxonomy templates for all platforms
      const taxonomyTemplates: Record<string, TaxonomyParam[]> = {};
      for (const platform of platforms) {
        const platformKey = String(platform?.id ?? '').toLowerCase();
        const externalAdAccountId = platform?.adAccountId || platform?.ad_account_id;
        
        if (externalAdAccountId) {
          try {
            // First, look up the internal UUID from the appropriate ad accounts table
            // TikTok uses numeric advertiser_id, Meta uses act_xxx format
            let internalAdAccountId: string | null = null;
            
            if (platformKey === 'tiktok') {
              const { data: tiktokAccount } = await supabase
                .from('tiktok_ad_accounts')
                .select('id')
                .eq('advertiser_id', externalAdAccountId)
                .maybeSingle();
              internalAdAccountId = tiktokAccount?.id || null;
            } else {
              // Meta - account_id can be with or without 'act_' prefix
              const normalizedAccountId = String(externalAdAccountId).replace(/^act_/, '');
              const { data: metaAccount } = await supabase
                .from('meta_ad_accounts')
                .select('id')
                .or(`account_id.eq.${normalizedAccountId},account_id.eq.act_${normalizedAccountId}`)
                .maybeSingle();
              internalAdAccountId = metaAccount?.id || null;
            }
            
            if (internalAdAccountId) {
              const { data: templateData } = await supabase
                .from('taxonomy_templates')
                .select('template')
                .eq('ad_account_id', internalAdAccountId)
                .eq('entity_type', 'adset')
                .eq('platform', platformKey)
                .maybeSingle();
              
              if (templateData?.template) {
                taxonomyTemplates[platformKey] = templateData.template as unknown as TaxonomyParam[];
              }
            }
          } catch (e) {
            console.warn(`Could not fetch taxonomy template for ${platformKey}:`, e);
          }
        }
      }
      
      // Helper to generate taxonomy-based adset name and extract elements for matching
      const generateAdSetTaxonomyName = (
        platformKey: string,
        context: TaxonomyContext
      ): { name: string; elements: Record<string, string> } => {
        // Always use default params as base (they have proper labels), merge with any custom template
        const defaultTemplate = getDefaultAdSetParams(platformKey as 'meta' | 'tiktok');
        const customTemplate = taxonomyTemplates[platformKey];
        
        // Ensure essential split-related params are always included
        const essentialParamIds = ['gender', 'devices', 'ageRange', 'languages', 'location'];
        
        // If custom template exists, use it but ensure labels are populated from defaults
        // AND ensure essential params are included even if missing from custom template
        let template: TaxonomyParam[];
        if (customTemplate) {
          template = customTemplate.map(param => {
            const defaultParam = defaultTemplate.find(d => d.id === param.id);
            return {
              ...param,
              label: param.label || defaultParam?.label || param.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            };
          });
          // Add any missing essential params from defaults
          for (const essentialId of essentialParamIds) {
            if (!template.find(p => p.id === essentialId)) {
              const defaultParam = defaultTemplate.find(d => d.id === essentialId);
              if (defaultParam) {
                template.push(defaultParam);
              }
            }
          }
        } else {
          template = defaultTemplate;
        }
        
        const values = extractTaxonomyValues(template, context);
        const taxonomyName = generateTaxonomyString(template, values);
        
        // Build elements for display: paramLabel -> value
        // Include all params with meaningful values, but keep split-related fields even if 'ALL'
        const splitRelatedParams = ['gender', 'devices', 'ageRange', 'languages', 'location'];
        const elements: Record<string, string> = {};
        for (const param of template) {
          const value = values[param.id];
          if (!value || value === '') continue; // Skip empty values
          // For split-related params, always include (even if ALL)
          // For others, skip 'ALL' values
          if (value === 'ALL' && !splitRelatedParams.includes(param.id)) continue;
          
          // Use the label from template
          const label = param.label || param.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          elements[label] = value;
        }
        
        return {
          name: taxonomyName || `${context.market}_${context.funnelStage}_${context.optimizationGoal}`.toUpperCase(),
          elements
        };
      };

      for (const platform of platforms) {
        const platformKey = String(platform?.id ?? '').toLowerCase();
        const platformId = platformKey as SupportedPlatform;

        const marketsRaw = Array.isArray(platform?.markets)
          ? platform.markets
          : (Array.isArray((marketSplits as any)[platformKey]) ? (marketSplits as any)[platformKey] : []);

        const markets: any[] = Array.isArray(marketsRaw) ? marketsRaw : [];

        for (const market of markets) {
          const phases: any[] = Array.isArray(market?.phases) ? market.phases : [];

          for (const phase of phases) {
            // Base structure data from phase/market level
            const baseStructureData = {
              campaignId: campaignIdToLoad,
              campaignName: (campaign as any).name,
              platform: platformId,
              objective: (campaign as any).objective,
              market: market?.name,
              funnelStage: phase?.funnelStage,
              // Google Ads: carry campaign type for media-format filtering
              googleCampaignType: platformKey === 'google' ? (phase?.googleCampaignType || market?.googleCampaignType) : undefined,
            };

            // Get placement constraints from multiple sources
            const placementConstraints =
              (Array.isArray(phase?.publisherPlatforms) && phase.publisherPlatforms) ||
              (Array.isArray(market?.publisherPlatforms) && market.publisherPlatforms) ||
              (Array.isArray(market?.metaPublisherPlatforms) && market.metaPublisherPlatforms) ||
              (Array.isArray(phase?.tiktokPlacements) && phase.tiktokPlacements) ||
              [];

            const formatConstraints =
              (Array.isArray(market?.adFormats) && market.adFormats) ||
              (Array.isArray(phase?.adFormats) && phase.adFormats) ||
              [];

            // When overrideTargeting is enabled, use phase.targeting values
            const phaseLanguages = phase?.overrideTargeting 
              ? phase?.targeting?.languages 
              : phase?.languages;

            const effectiveSearchKeywords = getEffectiveSearchKeywords({
              keywords: selectedKeywords,
              platformId: platformKey,
              market,
              phase,
            });

            const isSearchPhase = isSearchPhaseLike({ platformId: platformKey, phase });
            const strategyGroups = isSearchPhase
              ? getSearchStrategyGroups({
                  keywords: effectiveSearchKeywords,
                  platformId: platformKey,
                  market: { id: market?.id, name: market?.name },
                })
              : [];

            // For Search phases, ALWAYS emit one structure per strategy (Brand / Generic /
            // Competition) — even when no keywords have been added yet. This guarantees the
            // creative matcher (and the Text Asset Editor downstream) surface a row for
            // every Search campaign the DSP push will materialise.
            let effectiveStrategyGroups: any[] = strategyGroups;
            if (isSearchPhase) {
              const present = new Set(strategyGroups.map((g: any) => g.strategy));
              const allStrategies: Array<{ strategy: 'brand' | 'generic' | 'competition'; label: string }> = [
                { strategy: 'brand', label: 'Brand' },
                { strategy: 'generic', label: 'Generic' },
                { strategy: 'competition', label: 'Competition' },
              ];
              const synthetic = allStrategies
                .filter((s) => !present.has(s.strategy))
                .map((s) => ({
                  strategy: s.strategy,
                  label: s.label,
                  positives: [] as any[],
                  negatives: [] as any[],
                  totalVolume: 0,
                  budgetShare: 0,
                  budgetPercentage: 0,
                }));
              effectiveStrategyGroups = [...strategyGroups, ...synthetic];
            }

            const structureVariants = effectiveStrategyGroups.length > 0 ? effectiveStrategyGroups : [null];

            const language = normalizeLanguageCode(
              (Array.isArray(phaseLanguages) && phaseLanguages[0]) ||
              (Array.isArray(market?.languages) && market.languages[0]) ||
              (Array.isArray(phase?.languages) && phase.languages[0]) ||
              market?.language ||
              undefined
            );

            // Check if phase has ad set splits - align with Launch validation logic
            const phaseAdSets = Array.isArray(phase?.adSets) ? phase.adSets : undefined;
            const marketAdSets = Array.isArray(market?.adSets) ? market.adSets : undefined;

            const perPlatformConfig = basicTargeting?.defaultAdSetSplitDimensionPerPlatform;
            const hasPerPlatformConfig = perPlatformConfig && Object.keys(perPlatformConfig).length > 0;
            const platformDefaultDimension = hasPerPlatformConfig
              ? perPlatformConfig[platformKey]
              : basicTargeting?.defaultAdSetSplitDimension;

            const perPlatformAdSets = basicTargeting?.defaultAdSetsPerPlatform;
            const hasPerPlatformAdSets = perPlatformAdSets && Object.keys(perPlatformAdSets).length > 0;
            const platformDefaultAdSets = hasPerPlatformAdSets
              ? perPlatformAdSets[platformKey]
              : basicTargeting?.defaultAdSets;

            let effectiveAdSets: any[] = phaseAdSets || marketAdSets || [];
            let effectiveSplitDimension = phase?.adSetSplitDimension || market?.adSetSplitDimension || 'none';

            if (effectiveAdSets.length === 0 && !phase?.overrideTargeting) {
              if (platformDefaultDimension && platformDefaultDimension !== 'none' && Array.isArray(platformDefaultAdSets) && platformDefaultAdSets.length > 0) {
                effectiveAdSets = platformDefaultAdSets;
                effectiveSplitDimension = platformDefaultDimension;
                console.log(`Phase ${phase?.name} inheriting ${platformDefaultAdSets.length} ad sets from targeting config for ${platformKey}`);
              }
            }

            if (effectiveAdSets.length > 0 && effectiveSplitDimension === 'none') {
              effectiveSplitDimension = platformDefaultDimension || 'custom';
            }

            // Search phases combine strategy splits (Brand/Generic/Competition) with ad set
            // splits. When `googleSearchSplitLevel === 'campaign'`, each ad set becomes its
            // own campaign-per-strategy and we still want the cross product. When set to
            // 'adgroup' (default), each strategy campaign holds the ad sets as ad groups —
            // the cross product is again the desired output. So we no longer skip ad set
            // splitting just because strategies exist.
            const isSearchWithStrategies = false;

            if (effectiveAdSets.length > 0 && effectiveSplitDimension !== 'none' && !isSearchWithStrategies) {
              // Create a structure for EACH ad set configuration
              for (const adSet of effectiveAdSets) {
                for (const strategyGroup of structureVariants) {
                  // Build taxonomy context for this adset
                  const taxonomyContext: TaxonomyContext = {
                    platform: platformKey,
                    country: market?.name,
                    market: market?.name,
                    funnelStage: phase?.funnelStage,
                    optimizationGoal: adSet.optimizationGoal || phase?.optimizationGoal,
                    optimizationLocation: phase?.optimizationLocation,
                    budgetType: phase?.budgetType,
                    ageMin: adSet.ageMin ?? phase?.ageMin ?? market?.ageMin,
                    ageMax: adSet.ageMax ?? phase?.ageMax ?? market?.ageMax,
                    gender: adSet.gender || phase?.gender || market?.gender,
                    devices: adSet.devices || phase?.targeting?.devices,
                    placementType: phase?.advantagePlusPlacements ? 'automatic' : 'manual',
                    publisherPlatforms: adSet.placements || placementConstraints,
                    languages: adSet.languages || phaseLanguages || market?.languages,
                    targetingType: extractTargetingType(adSet.audiences),
                    phaseBudget: calculateBudgetFromPercentage(adSet.budgetPercentage, phase, market, campaign),
                  };
                  
                  const taxonomyResult = generateAdSetTaxonomyName(platformKey, taxonomyContext);
                  const strategyLabel = strategyGroup?.label;
                  const phaseLabel = strategyLabel ? buildSearchStrategyCampaignName(phase?.name ?? 'Search', strategyLabel) : phase?.name;
                  
                  const adSetStructure: CampaignStructure = {
                    id: `${campaignIdToLoad}-${platformKey}-${market?.id ?? market?.name ?? 'market'}-${phase?.name ?? 'phase'}${strategyGroup ? `-${strategyGroup.strategy}` : ''}-${adSet.id}`,
                    ...baseStructureData,
                    adSetId: adSet.id,
                    adSetName: strategyLabel ? `${taxonomyResult.name} · ${strategyLabel}` : taxonomyResult.name,
                    taxonomyElements: strategyLabel
                      ? { ...taxonomyResult.elements, Strategy: strategyLabel }
                      : taxonomyResult.elements,
                    placementConstraints: adSet.placements || adSet.tiktokPlacements || placementConstraints,
                    formatConstraints,
                    language: normalizeLanguageCode(adSet.languages?.[0] || phaseLanguages?.[0] || language),
                    // Track if this is a language split - language becomes a hard constraint
                    languageIsSplitDimension: effectiveSplitDimension === 'language',
                    optimizationGoal: adSet.optimizationGoal || phase?.optimizationGoal,
                    phases: phaseLabel ? [phaseLabel] : undefined,
                    keywordStrategy: strategyGroup?.strategy,
                    // Ad set split dimensions - track which dimension is being split for blocking logic
                    splitDimension: effectiveSplitDimension,
                    deviceConstraints: adSet.devices,
                    genderConstraint: adSet.gender || (effectiveSplitDimension === 'gender' ? adSet.dimensionValue : undefined),
                    ageConstraints: (adSet.ageMin !== undefined && adSet.ageMax !== undefined)
                      ? { min: adSet.ageMin, max: adSet.ageMax }
                      : (effectiveSplitDimension === 'age' && typeof adSet.dimensionValue === 'object')
                        ? adSet.dimensionValue
                        : undefined,
                    audienceTypeConstraint: extractAudienceType(adSet.audiences, effectiveSplitDimension, adSet.dimensionValue),
                    audiences: adSet.audiences,
                    budgetAmount: calculateBudgetFromPercentage(adSet.budgetPercentage, phase, market, campaign),
                    budgetType: phase?.budgetType,
                    // TikTok identity from phase > market config (field name can be tiktokIdentityId or tiktokIdentity)
                    tiktokIdentityId: phase?.tiktokIdentityId || phase?.tiktokIdentity || market?.tiktokIdentityId || market?.tiktokIdentity,
                  };
                  structures.push(adSetStructure);
                }
              }
            } else {
              // Build taxonomy context for phase-level adset
              const taxonomyContext: TaxonomyContext = {
                platform: platformKey,
                country: market?.name,
                market: market?.name,
                funnelStage: phase?.funnelStage,
                optimizationGoal: phase?.optimizationGoal,
                optimizationLocation: phase?.optimizationLocation,
                budgetType: phase?.budgetType,
                ageMin: phase?.ageMin ?? market?.ageMin,
                ageMax: phase?.ageMax ?? market?.ageMax,
                gender: phase?.gender || market?.gender,
                devices: phase?.targeting?.devices,
                placementType: phase?.advantagePlusPlacements ? 'automatic' : 'manual',
                publisherPlatforms: placementConstraints,
                languages: phaseLanguages || market?.languages,
                targetingType: extractTargetingType(phase?.audiences),
                phaseBudget: calculateBudgetFromPercentage(phase?.budgetPercentage, phase, market, campaign),
              };
              const taxonomyResult = generateAdSetTaxonomyName(platformKey, taxonomyContext);
              
              // No splits - create single structure from phase
              for (const strategyGroup of structureVariants) {
                const strategyLabel = strategyGroup?.label;
                const phaseLabel = strategyLabel ? buildSearchStrategyCampaignName(phase?.name ?? 'Search', strategyLabel) : phase?.name;

                structures.push({
                  id: `${campaignIdToLoad}-${platformKey}-${market?.id ?? market?.name ?? 'market'}-${phase?.name ?? 'phase'}${strategyGroup ? `-${strategyGroup.strategy}` : ''}`,
                  ...baseStructureData,
                  adSetId: market?.id,
                  adSetName: strategyLabel ? `${taxonomyResult.name} · ${strategyLabel}` : taxonomyResult.name,
                  taxonomyElements: strategyLabel
                    ? { ...taxonomyResult.elements, Strategy: strategyLabel }
                    : taxonomyResult.elements,
                  placementConstraints,
                  formatConstraints,
                  language,
                  optimizationGoal: phase?.optimizationGoal,
                  phases: phaseLabel ? [phaseLabel] : undefined,
                  keywordStrategy: strategyGroup?.strategy,
                  // Phase-level targeting
                  deviceConstraints: phase?.targeting?.devices,
                  genderConstraint: phase?.gender || market?.gender,
                  ageConstraints: (phase?.ageMin !== undefined && phase?.ageMax !== undefined)
                    ? { min: phase.ageMin, max: phase.ageMax }
                    : (market?.ageMin !== undefined && market?.ageMax !== undefined)
                      ? { min: market.ageMin, max: market.ageMax }
                      : undefined,
                  audienceTypeConstraint: extractAudienceType(phase?.audiences, 'none', undefined),
                  audiences: phase?.audiences,
                  budgetAmount: calculateBudgetFromPercentage(phase?.budgetPercentage, phase, market, campaign),
                  budgetType: phase?.budgetType,
                  // TikTok identity from phase > market config (field name can be tiktokIdentityId or tiktokIdentity)
                  tiktokIdentityId: phase?.tiktokIdentityId || phase?.tiktokIdentity || market?.tiktokIdentityId || market?.tiktokIdentity,
                });
              }
            }
          }
        }
      }

      const scopedStructures = selectedPlatform
        ? structures.filter((structure) => structure.platform === selectedPlatform)
        : structures;

      setState(prev => ({ ...prev, structures: scopedStructures, isProcessing: false }));
      return scopedStructures;
    } catch (error) {
      console.error('Error loading campaign structures:', error);
      toast.error('Failed to load campaign structure for this ActiPlan');
      setState(prev => ({ ...prev, isProcessing: false }));
      return [];
    }
  }, [user, selectedPlatform]);
  
  // Helper to extract targeting type from audiences
  function extractTargetingType(audiences: any[] | undefined): string | undefined {
    if (!audiences || audiences.length === 0) return 'broad';
    const types = new Set(audiences.map((a: any) => a?.type?.toLowerCase()));
    if (types.has('custom') && types.has('lookalike')) return 'mix';
    if (types.has('custom')) return 'retargeting';
    if (types.has('lookalike')) return 'lookalike';
    if (types.has('saved') || types.has('interest')) return 'native';
    return 'broad';
  }

  // Add creatives from the library (already in database)
  const addLibraryCreatives = useCallback((creatives: any[]) => {
    const digestedAssets: DigestedAsset[] = creatives.map(creative => ({
      id: creative.id, // Use the actual creative ID from database
      originalFile: null as any, // No file for library creatives
      fileName: creative.name,
      filePath: creative.folderPath || creative.name,
      mediaType: (creative.creativeType === 'video' ? 'video' : 'image') as AssetMediaType,
      technicalAttributes: {
        width: typeof creative.width === 'number' ? creative.width : undefined,
        height: typeof creative.height === 'number' ? creative.height : undefined,
        aspectRatio: typeof creative.aspectRatio === 'string' ? creative.aspectRatio : undefined,
        duration: typeof creative.durationSeconds === 'number' ? creative.durationSeconds : undefined,
        fileSize: typeof creative.fileSizeBytes === 'number' ? creative.fileSizeBytes : 0,
      },
      hardConstraints: {
        market: creative.market,
        language: creative.platformMetadata?.language,
      },
      compatibilitySignals: {
        platform: creative.platform,
        phaseName: creative.phaseName,
        optimizationGoal: creative.optimizationGoal,
      },
      digestedAt: new Date().toISOString(),
      sourceType: 'library', // Mark as coming from library
      libraryCreativeId: creative.id, // Store reference to library creative
    }));

    setState(prev => ({
      ...prev,
      assets: [...prev.assets, ...digestedAssets],
      currentStep: 'match',
    }));

    return digestedAssets;
  }, []);

  // Add platform assets from creative_library_assets table (synced from DSP)
  // Also handles organic page assets (with _source: 'page')
  const addPlatformAssets = useCallback((assets: any[]) => {
    const digestedAssets: DigestedAsset[] = assets.map(asset => {
      // Check if this is an organic page asset
      // Some callers historically used snake_case (post_id). Be tolerant.
      const inferredPostId = asset.postId || asset.post_id || asset.external_post_id;
      const inferredPageId = asset.pageId || asset.page_id || asset.external_page_id;
      const isOrganicPost = asset._source === 'page' || !!inferredPostId || asset.creative_type === 'existing_post';
      
      // Track creative_origin for TikTok delivery eligibility validation
      // TikTok requires UI_SYNC (manual upload in Ads Manager) - API_UPLOAD is not delivery-eligible
      const creativeOrigin = asset.creative_origin || asset.creativeOrigin;
      
      // Capture source network for organic posts (facebook vs instagram)
      const sourceNetwork = asset.sourceNetwork as 'facebook' | 'instagram' | undefined;
      
      return {
        id: asset.id,
        originalFile: null as any,
        fileName: asset.asset_name || asset.platform_asset_id || inferredPostId || 'Organic Post',
        filePath: asset.asset_name || asset.platform_asset_id || inferredPostId || '',
        mediaType: (asset.asset_type === 'VIDEO' || asset.asset_type === 'video' || asset.mediaType === 'video' ? 'video' : 'image') as AssetMediaType,
        technicalAttributes: {
          width: typeof asset.width === 'number' ? asset.width : undefined,
          height: typeof asset.height === 'number' ? asset.height : undefined,
          aspectRatio: typeof asset.aspect_ratio === 'string' ? asset.aspect_ratio : undefined,
          duration: typeof asset.duration_seconds === 'number' ? asset.duration_seconds : undefined,
          fileSize: typeof asset.file_size_bytes === 'number' ? asset.file_size_bytes : 0,
        },
        hardConstraints: {
          market: undefined,
          language: undefined,
        },
        compatibilitySignals: {
          platform: asset.platform,
          creativeOrigin, // Track origin for TikTok validation
          sourceNetwork, // Track source network for organic posts
        },
        digestedAt: new Date().toISOString(),
        // Mark source type based on whether it's organic or platform asset
        sourceType: isOrganicPost ? 'organic' : 'platform_asset',
        // Source network for organic posts
        sourceNetwork,
        platformAssetId: asset.platform_asset_id,
        advertiserId: asset.advertiser_id,
        previewUrl: asset.preview_url || asset.thumbnail_url || asset.thumbnailUrl,
        // Organic post-specific fields
        postId: isOrganicPost ? inferredPostId : undefined,
        pageId: isOrganicPost ? inferredPageId : undefined,
        pageName: asset.pageName,
        organicMessage: asset.message || asset.caption,
        organicPermalink: asset.permalink,
        // TikTok-specific: track origin for delivery eligibility
        creativeOrigin,
      };
    });

    setState(prev => ({
      ...prev,
      assets: [...prev.assets, ...digestedAssets],
      currentStep: 'match',
    }));

    return digestedAssets;
  }, []);

  // Process uploaded files - only accept image and video files
  const processFiles = useCallback(async (files: File[]) => {
    setState(prev => ({ ...prev, isProcessing: true, currentStep: 'digest' }));
    const digestedAssets: DigestedAsset[] = [];
    
    // Allowed media MIME types
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/quicktime', 'video/webm', 'video/avi', 'video/mov', 'video/mpeg'
    ];
    
    // Allowed file extensions as fallback
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.mov', '.webm', '.avi', '.mpeg'];

    for (const file of files) {
      try {
        // Skip non-media files (documents, spreadsheets, etc.)
        const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
        const isAllowedType = allowedTypes.includes(file.type) || allowedExtensions.includes(fileExtension);
        
        if (!isAllowedType) {
          console.warn(`Skipping non-media file: ${file.name} (type: ${file.type})`);
          continue;
        }
        
        const filePath = (file as any).webkitRelativePath || file.name;
        const mediaType: AssetMediaType = file.type.startsWith('video/') ? 'video' : 'image';
        
        // Extract dimensions
        let width = 0, height = 0, duration: number | undefined, aspectRatio = '';
        
        if (mediaType === 'image') {
          const dims = await getImageDimensions(file);
          width = dims.width; height = dims.height;
          aspectRatio = calculateAspectRatio(width, height);
        } else if (mediaType === 'video') {
          const info = await getVideoInfo(file);
          width = info.width; height = info.height; 
          duration = typeof info.duration === 'number' ? Math.round(info.duration) : undefined;
          aspectRatio = calculateAspectRatio(width, height);
        }

        // Infer hard constraints from path
        const hardConstraints = inferConstraintsFromPath(filePath);

        digestedAssets.push({
          id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          originalFile: file,
          fileName: file.name,
          filePath,
          mediaType,
          technicalAttributes: { width, height, aspectRatio, duration, fileSize: file.size },
          hardConstraints,
          compatibilitySignals: selectedPlatform ? { platform: selectedPlatform } : {},
          digestedAt: new Date().toISOString(),
          sourceType: 'upload',
        });
      } catch (error) {
        console.error(`Error digesting file ${file.name}:`, error);
      }
    }

    setState(prev => ({
      ...prev,
      assets: [...prev.assets, ...digestedAssets],
      isProcessing: false,
      currentStep: 'match',
    }));
    return digestedAssets;
  }, [selectedPlatform]);

  // Run the matching algorithm - STRUCTURE-CENTRIC approach
  // For each campaign/adset, find assets that fit based on taxonomy matching
  const runMatching = useCallback((structuresOverride?: CampaignStructure[]) => {
    setState(prev => {
      const structuresToUse = structuresOverride || prev.structures;

      if (prev.assets.length === 0) {
        toast.error('Please add some creatives first');
        return prev;
      }

      if (structuresToUse.length === 0) {
        toast.error(campaignId ? 'No campaign structure found for this ActiPlan' : 'Please select an ActiPlan first');
        return prev;
      }

      // Determine if this is a single-market or single-platform plan
      const uniqueMarkets = new Set(structuresToUse.map(s => s.market).filter(Boolean));
      const uniquePlatforms = new Set(structuresToUse.map(s => s.platform).filter(Boolean));
      const isSingleMarketPlan = uniqueMarkets.size === 1;
      const isSinglePlatformPlan = uniquePlatforms.size === 1;

      // Step 1: Extract signals from ALL assets and pre-validate dimensions
      const assetSignalsMap = new Map<string, InferredSignals>();
      const invalidDimensionAssets = new Map<string, string>(); // assetId -> reason
      
      for (const asset of prev.assets) {
        const signals = extractInferredSignals(asset.filePath, asset.fileName);
        assetSignalsMap.set(asset.id, signals);
        
        // PRIORITY 1: Pre-filter assets with invalid dimensions BEFORE any matching
        // Use platform ad specs to validate if creative fits ANY standard ad format
        const { width, height } = asset.technicalAttributes;
        const dimensionCheck = isValidAdDimensions(width, height, asset.mediaType);
        if (!dimensionCheck.valid) {
          invalidDimensionAssets.set(asset.id, dimensionCheck.reason || 'Invalid dimensions');
        }
      }
      
      // Only include valid assets for matching
      const validAssets = prev.assets.filter(a => !invalidDimensionAssets.has(a.id));

      // Google Ads campaign type → allowed media types (for filtering at match time)
      const GOOGLE_ALLOWED_MEDIA: Record<string, { image: boolean; video: boolean }> = {
        'Search': { image: false, video: false },
        'Shopping': { image: false, video: false },
        'Display': { image: true, video: false },
        'Video': { image: false, video: true },
        'Performance Max': { image: true, video: true },
        'Demand Gen': { image: true, video: true },
        'App Promotion': { image: true, video: true },
      };

      // Step 2: For each structure, find fitting assets (only from valid assets)
      const structureResults: StructureMatchResult[] = [];
      const assignedAssetIds = new Set<string>();

      for (const structure of structuresToUse) {
        const assignedAssets: StructureMatchResult['assignedAssets'] = [];

        // Determine allowed media types for this structure (Google campaign type filtering)
        const googleCT = structure.googleCampaignType;
        const googleMediaRules = googleCT ? GOOGLE_ALLOWED_MEDIA[googleCT] : null;

        for (const asset of validAssets) {
          // Google Ads: skip assets whose media type is disallowed by the campaign type
          if (structure.platform === 'google' && googleMediaRules) {
            const isImage = asset.mediaType === 'image';
            const isVideo = asset.mediaType === 'video';
            if ((isImage && !googleMediaRules.image) || (isVideo && !googleMediaRules.video)) {
              continue; // Skip — incompatible format for this Google campaign type
            }
          }

          const inferredSignals = assetSignalsMap.get(asset.id)!;
          
          // Match asset signals against structure taxonomy elements
          const matchResult = matchAssetToStructure(
            asset,
            inferredSignals,
            structure,
            { isSingleMarketPlan, isSinglePlatformPlan }
          );

          if (matchResult.isMatch) {
            assignedAssets.push({
              asset,
              confidenceScore: matchResult.score,
              reasoning: matchResult.matchedCriteria.map(c => `${c.criterion}: ${c.reason}`),
              matchedCriteria: matchResult.matchedCriteria.map(c => c.criterion),
              issues: matchResult.issues,
            });
          }
        }

        // Sort by confidence score descending
        assignedAssets.sort((a, b) => b.confidenceScore - a.confidenceScore);

        // Trim to platform ad set limit (50 ads max per ad set)
        // Keep only the top-scoring assets within the limit
        const trimmedAssets = assignedAssets.slice(0, ADS_PER_AD_SET_LIMIT);
        if (assignedAssets.length > ADS_PER_AD_SET_LIMIT) {
          // Mark overflow assets as unassigned (they'll appear in unassigned panel)
          for (let i = ADS_PER_AD_SET_LIMIT; i < assignedAssets.length; i++) {
            // Don't add to assignedAssetIds so they show as unassigned
          }
        }

        structureResults.push({
          structure,
          assignedAssets: trimmedAssets,
        });

        // Track assigned asset IDs (only from trimmed set within limit)
        for (const a of trimmedAssets) {
          assignedAssetIds.add(a.asset.id);
        }
      }

      // Step 3: Identify unassigned assets with reasons
      const unassignedAssets: UnassignedAsset[] = [];
      
      for (const asset of prev.assets) {
        if (!assignedAssetIds.has(asset.id)) {
          const inferredSignals = assetSignalsMap.get(asset.id)!;
          
          // Build extracted signals summary for display using helper function
          const extractedSignals = formatExtractedSignalsForDisplay(inferredSignals);
          
          // Add technical attributes
          if (asset.technicalAttributes.aspectRatio) {
            extractedSignals['Detected AR'] = asset.technicalAttributes.aspectRatio;
          }
          if (asset.technicalAttributes.width && asset.technicalAttributes.height) {
            extractedSignals['Resolution'] = `${asset.technicalAttributes.width}×${asset.technicalAttributes.height}`;
          }

          const reasons: string[] = [];

          // Check if asset was excluded from ALL Google structures due to campaign type
          const googleStructures = structuresToUse.filter(s => s.platform === 'google' && s.googleCampaignType);
          if (googleStructures.length > 0) {
            const excludedFromAll = googleStructures.every(s => {
              const rules = GOOGLE_ALLOWED_MEDIA[s.googleCampaignType!];
              if (!rules) return false;
              const isImage = asset.mediaType === 'image';
              const isVideo = asset.mediaType === 'video';
              return (isImage && !rules.image) || (isVideo && !rules.video);
            });
            if (excludedFromAll) {
              const types = [...new Set(googleStructures.map(s => s.googleCampaignType))].join(', ');
              reasons.push(`⛔ ${asset.mediaType === 'image' ? 'Images' : 'Videos'} are not supported by ${types} campaigns`);
            }
          }
          
          // PRIORITY CHECK: Was this asset filtered out due to invalid dimensions?
          if (invalidDimensionAssets.has(asset.id)) {
            const dimensionReason = invalidDimensionAssets.get(asset.id)!;
            reasons.push(`⛔ ${dimensionReason}`);
            
            // No need to find closest matches for dimension-invalid assets
            unassignedAssets.push({
              asset,
              extractedSignals,
              reasons,
              closestMatches: [], // No matches attempted due to dimension filter
            });
            continue;
          }

          // Find closest matches with blocking reasons (for dimension-valid but unmatched assets)
          const closestMatches: UnassignedAsset['closestMatches'] = [];
          for (const structure of structuresToUse) {
            const matchResult = matchAssetToStructure(
              asset,
              inferredSignals,
              structure,
              { isSingleMarketPlan, isSinglePlatformPlan }
            );
            
            if (matchResult.blockingReasons.length > 0 || matchResult.score > 0) {
              closestMatches.push({
                structure,
                score: matchResult.score,
                blockingReasons: matchResult.blockingReasons,
              });
            }
          }

          // Sort by score descending
          closestMatches.sort((a, b) => b.score - a.score);

          // Build reasons list from closest match blocking reasons
          if (closestMatches.length > 0) {
            const topMatch = closestMatches[0];
            reasons.push(...topMatch.blockingReasons);
            
            // Add helpful context about market/platform availability
            if (inferredSignals.market && inferredSignals.platform) {
              const marketUpper = inferredSignals.market.toUpperCase();
              const marketOnPlatform = structuresToUse.some(
                s => s.market?.toUpperCase() === marketUpper && s.platform === inferredSignals.platform
              );
              if (!marketOnPlatform) {
                const platformsWithMarket = [...new Set(
                  structuresToUse
                    .filter(s => s.market?.toUpperCase() === marketUpper)
                    .map(s => s.platform.toUpperCase())
                )];
                if (platformsWithMarket.length > 0) {
                  reasons.push(`💡 Market "${inferredSignals.market}" is only configured for ${platformsWithMarket.join(', ')}, not ${inferredSignals.platform.toUpperCase()}`);
                } else {
                  const availableMarkets = [...new Set(
                    structuresToUse
                      .filter(s => s.platform === inferredSignals.platform)
                      .map(s => s.market)
                      .filter(Boolean)
                  )].join(', ');
                  if (availableMarkets) {
                    reasons.push(`💡 Available markets for ${inferredSignals.platform.toUpperCase()}: ${availableMarkets}`);
                  }
                }
              }
            }
          } else {
            if (inferredSignals.platform) {
              const platformExists = structuresToUse.some(s => s.platform === inferredSignals.platform);
              if (!platformExists) {
                reasons.push(`Platform "${inferredSignals.platform}" not in ActiPlan`);
              }
            }
            if (inferredSignals.market) {
              const marketUpper = inferredSignals.market.toUpperCase();
              const marketExists = structuresToUse.some(s => s.market?.toUpperCase() === marketUpper);
              if (!marketExists) {
                // Check if market exists on a different platform
                const platformsWithMarket = structuresToUse
                  .filter(s => s.market?.toUpperCase() === marketUpper)
                  .map(s => s.platform.toUpperCase());
                const uniquePlatformsWithMarket = [...new Set(platformsWithMarket)];
                
                if (uniquePlatformsWithMarket.length > 0 && inferredSignals.platform) {
                  reasons.push(`Market "${inferredSignals.market}" exists for ${uniquePlatformsWithMarket.join(', ')} but not for ${inferredSignals.platform.toUpperCase()}`);
                } else {
                  // Market doesn't exist anywhere in the plan
                  const availableMarkets = [...new Set(structuresToUse.map(s => s.market).filter(Boolean))].join(', ');
                  reasons.push(`Market "${inferredSignals.market}" not in ActiPlan (available: ${availableMarkets})`);
                }
              } else if (inferredSignals.platform) {
                // Market exists but not for this specific platform
                const marketOnPlatform = structuresToUse.some(
                  s => s.market?.toUpperCase() === marketUpper && s.platform === inferredSignals.platform
                );
                if (!marketOnPlatform) {
                  const platformsWithMarket = [...new Set(
                    structuresToUse
                      .filter(s => s.market?.toUpperCase() === marketUpper)
                      .map(s => s.platform.toUpperCase())
                  )];
                  reasons.push(`Market "${inferredSignals.market}" only configured for ${platformsWithMarket.join(', ')}, not ${inferredSignals.platform.toUpperCase()}`);
                }
              }
            }
            if (reasons.length === 0) {
              reasons.push('Could not match any taxonomy elements');
            }
          }

          unassignedAssets.push({
            asset,
            extractedSignals,
            reasons,
            closestMatches: closestMatches.slice(0, 3), // Top 3 closest
          });
        }
      }

      // Step 4: Also build legacy results format for backward compatibility
      const results: UIMatchingResult[] = prev.assets.map(asset => {
        const inferredSignals = assetSignalsMap.get(asset.id)!;
        const matches: UICreativeMatch[] = [];
        
        for (const structure of structuresToUse) {
          const matchResult = matchAssetToStructure(
            asset,
            inferredSignals,
            structure,
            { isSingleMarketPlan, isSinglePlatformPlan }
          );
          
          if (matchResult.isMatch) {
            matches.push({
              structure,
              confidenceScore: matchResult.score,
              reasoning: matchResult.matchedCriteria.map(c => `${c.criterion}: ${c.reason}`),
              compatibilityIssues: matchResult.issues,
              hardConstraintsMet: matchResult.blockingReasons.length === 0,
            });
          }
        }
        
        // Sort by confidence
        matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
        
        const noMatchReasons = matches.length === 0 
          ? unassignedAssets.find(u => u.asset.id === asset.id)?.reasons || ['No match found']
          : undefined;
        
        return {
          assetId: asset.id,
          matches,
          bestMatch: matches[0],
          noMatchReasons,
        };
      });

      return { 
        ...prev, 
        structures: structuresToUse,
        results,
        structureResults,
        unassignedAssets,
        currentStep: 'review' as const 
      };
    });
  }, [campaignId, selectedPlatform]);

  // Platform ad limits per ad set (Meta API confirmed: 50 non-archived ads per ad set)
  // TikTok has similar limits; Google varies but we use 50 as a safe default
  const ADS_PER_AD_SET_LIMIT = 50;

  // Helper: count accepted ads for a specific structure (ad set)
  const countAcceptedForStructure = useCallback((structureId: string, acceptedMap?: Map<string, UICreativeMatch>): number => {
    const map = acceptedMap || stateRef.current.acceptedMatches;
    let count = 0;
    for (const key of map.keys()) {
      if (key.endsWith(`:${structureId}`)) count++;
    }
    return count;
  }, []);

  // Use composite key: assetId:structureId so each asset-structure pair is independent
  const acceptMatch = useCallback((assetId: string, match: UICreativeMatch) => {
    const compositeKey = `${assetId}:${match.structure.id}`;
    setState(prev => {
      // Check if already accepted
      if (prev.acceptedMatches.has(compositeKey)) return prev;

      // Enforce 50 ads per ad set limit
      const currentCount = countAcceptedForStructure(match.structure.id, prev.acceptedMatches);
      if (currentCount >= ADS_PER_AD_SET_LIMIT) {
        toast.error(`Ad set limit reached (${ADS_PER_AD_SET_LIMIT} ads max). Remove a creative before adding another.`);
        return prev;
      }

      const newAccepted = new Map(prev.acceptedMatches);
      newAccepted.set(compositeKey, match);
      return { ...prev, acceptedMatches: newAccepted };
    });
  }, [countAcceptedForStructure]);

  const rejectMatch = useCallback((assetId: string, structureId: string) => {
    setState(prev => {
      const newRejected = new Map(prev.rejectedMatches);
      const existing = newRejected.get(assetId) || new Set();
      existing.add(structureId);
      newRejected.set(assetId, existing);

      // Also remove from accepted matches if it was accepted
      const compositeKey = `${assetId}:${structureId}`;
      const newAccepted = new Map(prev.acceptedMatches);
      newAccepted.delete(compositeKey);

      return { ...prev, rejectedMatches: newRejected, acceptedMatches: newAccepted };
    });
  }, []);

  const clearRejection = useCallback((assetId: string, structureId: string) => {
    setState(prev => {
      const newRejected = new Map(prev.rejectedMatches);
      const existing = newRejected.get(assetId);
      if (existing) { existing.delete(structureId); if (existing.size === 0) newRejected.delete(assetId); }
      return { ...prev, rejectedMatches: newRejected };
    });
  }, []);

  // Clear accepted match using composite key: assetId:structureId
  const clearAcceptedMatch = useCallback((assetId: string, structureId?: string) => {
    setState(prev => {
      const newAccepted = new Map(prev.acceptedMatches);
      if (structureId) {
        // Clear specific asset-structure pair
        newAccepted.delete(`${assetId}:${structureId}`);
      } else {
        // Clear all matches for this asset (backward compatibility)
        for (const key of newAccepted.keys()) {
          if (key.startsWith(`${assetId}:`)) {
            newAccepted.delete(key);
          }
        }
      }
      return { ...prev, acceptedMatches: newAccepted };
    });
  }, []);

  const removeAsset = useCallback((assetId: string) => {
    setState(prev => ({
      ...prev,
      assets: prev.assets.filter(a => a.id !== assetId),
      results: prev.results.filter(r => r.assetId !== assetId),
    }));
  }, []);

  const clearAll = useCallback(() => {
    setState({
      assets: [], structures: [], results: [],
      structureResults: [], unassignedAssets: [],
      acceptedMatches: new Map(), rejectedMatches: new Map(),
      isProcessing: false, currentStep: 'upload',
      saveProgress: new Map(),
    });
  }, []);

  // Helper to update progress for a specific item
  const updateSaveProgress = useCallback((compositeKey: string, status: SaveStatus, error?: string) => {
    setState(prev => {
      const newProgress = new Map(prev.saveProgress);
      const [assetId, structureId] = compositeKey.split(':');
      newProgress.set(compositeKey, { compositeKey, assetId, structureId, status, error });
      return { ...prev, saveProgress: newProgress };
    });
  }, []);

  const saveMatches = useCallback(async (): Promise<boolean> => {
    // Use stateRef to always get the latest state (avoids stale closure issues)
    const currentState = stateRef.current;

    if (!user || currentState.acceptedMatches.size === 0) {
      toast.error('No matches to save');
      return false;
    }

    // Initialize progress for all accepted matches
    const initialProgress = new Map<string, SaveProgressItem>();
    for (const compositeKey of currentState.acceptedMatches.keys()) {
      // Parse compositeKey: last segment is structureId, everything before is assetId
      const lastColonIdx = compositeKey.lastIndexOf(':');
      const assetId = compositeKey.slice(0, lastColonIdx);
      const structureId = compositeKey.slice(lastColonIdx + 1);
      initialProgress.set(compositeKey, { compositeKey, assetId, structureId, status: 'pending' });
    }
    setState(prev => ({ ...prev, isProcessing: true, saveProgress: initialProgress }));
    toast.info(`Saving ${currentState.acceptedMatches.size} matches…`);

    const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB
    const PER_CALL_TIMEOUT_MS = 180_000; // 3 minutes

    // Cache uploads per asset so a single file matched to multiple structures
    // doesn't get uploaded multiple times.
    const uploadedUrlByAssetId = new Map<string, string>();
    
    // Cache created creative IDs per asset - when the same asset is matched to
    // multiple ad sets, we create ONE creative record and reuse it for all assignments.
    // This dramatically speeds up saves and prevents duplicate uploads.
    const createdCreativeByAssetId = new Map<string, string>();

    const uploadAssetToStorage = async (assetId: string, file: File): Promise<string> => {
      const cached = uploadedUrlByAssetId.get(assetId);
      if (cached) return cached;

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}${fileExt ? `.${fileExt}` : ''}`;

      const { error: uploadError } = await supabase.storage
        .from('creative-assets')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('creative-assets')
        .getPublicUrl(fileName);

      uploadedUrlByAssetId.set(assetId, publicUrl);
      return publicUrl;
    };

    try {
      const assignments: any[] = [];
      const compositeKeyToAssignmentIndex = new Map<string, number>();
      let errorCount = 0;
      let firstErrorMessage: string | undefined;

      const formatSaveError = (err: any): string => {
        if (!err) return 'Unknown error';
        if (typeof err === 'string') return err;
        const parts: string[] = [];
        if (typeof err.code === 'string') parts.push(`[${err.code}]`);
        if (typeof err.message === 'string') parts.push(err.message);
        if (typeof err.details === 'string') parts.push(err.details);
        if (typeof err.hint === 'string') parts.push(err.hint);
        return parts.join(' • ') || 'Unknown error';
      };

      for (const [compositeKey, match] of currentState.acceptedMatches.entries()) {
      // Parse compositeKey: last segment is structureId, everything before is assetId
      const lastColonIdx = compositeKey.lastIndexOf(':');
      const assetId = compositeKey.slice(0, lastColonIdx);
        const asset = currentState.assets.find(a => a.id === assetId);
        if (!asset) {
          const msg = 'Asset not found';
          updateSaveProgress(compositeKey, 'error', msg);
          errorCount++;
          firstErrorMessage = firstErrorMessage || msg;
          continue;
        }

        let creativeId: string;

        try {
          // Check if this is a library creative (already exists in DB)
          if (asset.sourceType === 'library' && (asset as any).libraryCreativeId) {
            creativeId = (asset as any).libraryCreativeId;
            updateSaveProgress(compositeKey, 'saving');

            // Update the existing creative with campaign assignment (only once)
            if (!createdCreativeByAssetId.has(assetId)) {
              const { error: updateError } = await supabase
                .from('creatives')
                .update({
                  campaign_id: match.structure.campaignId,
                  market: match.structure.market,
                  phase_name: match.structure.phases?.[0],
                  status: 'ready',
                })
                .eq('id', creativeId);

              if (updateError) throw updateError;
              createdCreativeByAssetId.set(assetId, creativeId);
            }
          } else if (asset.sourceType === 'organic' && (asset as any).postId) {
            // Handle organic page assets (spark ads / existing posts)
            updateSaveProgress(compositeKey, 'saving');
            
            const cachedCreativeId = createdCreativeByAssetId.get(assetId);
            if (cachedCreativeId) {
              creativeId = cachedCreativeId;
            } else {
              const taxonomyName = generateCreativeTaxonomyName(asset, match.structure);
              
              // Capture source network for organic posts (facebook vs instagram)
              const assetSourceNetwork = (asset as any).sourceNetwork as 'facebook' | 'instagram' | undefined;
              
              const { data: creative, error: insertCreativeError } = await supabase
                .from('creatives')
                .insert({
                  name: taxonomyName,
                  user_id: user.id,
                  team_id: null,
                  platform: match.structure.platform,
                  creative_type: 'existing_post', // Mark as organic/existing post
                  media_type: asset.mediaType,
                  status: 'ready',
                  market: match.structure.market,
                  phase_name: match.structure.phases?.[0],
                  campaign_id: match.structure.campaignId,
                  width: asset.technicalAttributes.width,
                  height: asset.technicalAttributes.height,
                  aspect_ratio: asset.technicalAttributes.aspectRatio,
                  duration_seconds: typeof asset.technicalAttributes.duration === 'number' ? Math.round(asset.technicalAttributes.duration) : null,
                  file_size_bytes: asset.technicalAttributes.fileSize,
                  original_filename: asset.fileName,
                  folder_path: getFolderPath(asset.filePath),
                  media_urls: (asset as any).previewUrl ? [(asset as any).previewUrl] : [],
                  thumbnail_url: (asset as any).previewUrl,
                  language: asset.hardConstraints?.language,
                  // Organic post-specific fields
                  external_post_id: (asset as any).postId,
                  external_page_id: (asset as any).pageId,
                  external_account_name: (asset as any).pageName,
                  caption: (asset as any).organicMessage,
                  tiktok_identity_id: match.structure.platform === 'tiktok' ? match.structure.tiktokIdentityId : null,
                  tiktok_ad_format: match.structure.platform === 'tiktok' ? 'SPARK_ADS' : null,
                  // Store source network in platform_metadata for Instagram vs Facebook detection
                  platform_metadata: assetSourceNetwork ? { sourceNetwork: assetSourceNetwork } : null,
                })
                .select()
                .single();

              if (insertCreativeError) throw insertCreativeError;
              if (!creative) {
                throw new Error('No creative returned from insert');
              }

              creativeId = creative.id;
              createdCreativeByAssetId.set(assetId, creativeId);
            }
          } else if (asset.sourceType === 'platform_asset' && (asset as any).platformAssetId) {
            // Handle platform assets (synced from DSP) - create a new creative record linked to the platform asset
            updateSaveProgress(compositeKey, 'saving');
            
            const cachedCreativeId = createdCreativeByAssetId.get(assetId);
            if (cachedCreativeId) {
              creativeId = cachedCreativeId;
            } else {
              const taxonomyName = generateCreativeTaxonomyName(asset, match.structure);
              
              const { data: creative, error: insertCreativeError } = await supabase
                .from('creatives')
                .insert({
                  name: taxonomyName,
                  user_id: user.id,
                  team_id: null,
                  platform: match.structure.platform,
                  creative_type: asset.mediaType === 'video' ? 'video' : 'image',
                  media_type: asset.mediaType,
                  status: 'ready',
                  market: match.structure.market,
                  phase_name: match.structure.phases?.[0],
                  campaign_id: match.structure.campaignId,
                  width: asset.technicalAttributes.width,
                  height: asset.technicalAttributes.height,
                  aspect_ratio: asset.technicalAttributes.aspectRatio,
                  duration_seconds: typeof asset.technicalAttributes.duration === 'number' ? Math.round(asset.technicalAttributes.duration) : null,
                  file_size_bytes: asset.technicalAttributes.fileSize,
                  original_filename: asset.fileName,
                  folder_path: getFolderPath(asset.filePath),
                  media_urls: (asset as any).previewUrl ? [(asset as any).previewUrl] : [],
                  thumbnail_url: (asset as any).previewUrl,
                  language: asset.hardConstraints?.language,
                  tiktok_identity_id: match.structure.platform === 'tiktok' ? match.structure.tiktokIdentityId : null,
                  // If this came from a TikTok platform asset, store the material ID directly (avoids re-upload)
                  platform_video_id:
                    match.structure.platform === 'tiktok' && asset.mediaType === 'video'
                      ? String((asset as any).platformAssetId)
                      : null,
                  platform_image_hash:
                    match.structure.platform === 'tiktok' && asset.mediaType !== 'video'
                      ? String((asset as any).platformAssetId)
                      : null,
                  tiktok_asset_advertiser_id:
                    match.structure.platform === 'tiktok' && (asset as any).advertiserId
                      ? String((asset as any).advertiserId)
                      : null,
                  dsp_upload_status: match.structure.platform === 'tiktok' ? 'uploaded' : null,
                  dsp_uploaded_at: match.structure.platform === 'tiktok' ? new Date().toISOString() : null,
                  // Store platform asset reference
                  platform_metadata: {
                    platform_asset_id: (asset as any).platformAssetId,
                    advertiser_id: (asset as any).advertiserId,
                  },
                })
                .select()
                .single();

              if (insertCreativeError) throw insertCreativeError;
              if (!creative) {
                throw new Error('No creative returned from insert');
              }

              creativeId = creative.id;
              createdCreativeByAssetId.set(assetId, creativeId);
            }
          } else {
            // Check if we already created a creative for this asset
            const cachedCreativeId = createdCreativeByAssetId.get(assetId);
            if (cachedCreativeId) {
              // Reuse existing creative - skip upload and creation
              creativeId = cachedCreativeId;
              updateSaveProgress(compositeKey, 'saving');
            } else {
              // For uploaded files, we must persist the file itself (otherwise refresh loses it).
              updateSaveProgress(compositeKey, 'uploading');
              const mediaUrl = await uploadAssetToStorage(assetId, asset.originalFile);

              updateSaveProgress(compositeKey, 'saving');
              // Generate taxonomy-based name for the creative
              const taxonomyName = generateCreativeTaxonomyName(asset, match.structure);

              // Create new creative for uploaded files - only once per asset
              const { data: creative, error: insertCreativeError } = await supabase
                .from('creatives')
                .insert({
                  name: taxonomyName,
                  user_id: user.id,
                  team_id: null,
                  platform: match.structure.platform,
                  creative_type: asset.mediaType === 'video' ? 'video' : 'image',
                  media_type: asset.mediaType,
                  status: 'ready',
                  market: match.structure.market,
                  phase_name: match.structure.phases?.[0],
                  campaign_id: match.structure.campaignId,
                  width: asset.technicalAttributes.width,
                  height: asset.technicalAttributes.height,
                  aspect_ratio: asset.technicalAttributes.aspectRatio,
                  duration_seconds: typeof asset.technicalAttributes.duration === 'number' ? Math.round(asset.technicalAttributes.duration) : null,
                  file_size_bytes: asset.technicalAttributes.fileSize,
                  original_filename: asset.fileName,
                  folder_path: getFolderPath(asset.filePath),
                  media_urls: [mediaUrl],
                  thumbnail_url: mediaUrl,
                  language: asset.hardConstraints?.language,
                  // TikTok identity from activation details config
                  tiktok_identity_id: match.structure.platform === 'tiktok' ? match.structure.tiktokIdentityId : null,
                })
                .select()
                .single();

              if (insertCreativeError) throw insertCreativeError;
              if (!creative) {
                throw new Error('No creative returned from insert');
              }

              creativeId = creative.id;
              // Cache the creative ID for reuse by other assignments of the same asset
              createdCreativeByAssetId.set(assetId, creativeId);
            }
          }

          compositeKeyToAssignmentIndex.set(compositeKey, assignments.length);
          assignments.push({
            creative_id: creativeId,
            campaign_id: match.structure.campaignId,
            platform: match.structure.platform,
            market: match.structure.market || 'GLOBAL',
            phase_name: match.structure.phases?.[0] || 'default',
            ad_set_id: match.structure.adSetId || null,
            // ad_set_name is now NOT NULL in the database; use a stable default.
            ad_set_name: match.structure.adSetName || 'default',
            assigned_by: user.id,
            position: 0,
            status: 'pending',
          });
        } catch (itemError: any) {
          console.error(`Error processing ${compositeKey}:`, itemError);
          const msg = formatSaveError(itemError);
          updateSaveProgress(compositeKey, 'error', msg);
          errorCount++;
          firstErrorMessage = firstErrorMessage || msg;
        }
      }

      if (assignments.length > 0) {
        // Deduplicate assignments by the conflict key to avoid "ON CONFLICT DO UPDATE command cannot affect row a second time" error
        // The unique key now includes ad_set_name to allow same creative in different ad sets within the same phase
        const assignmentMap = new Map<string, typeof assignments[0]>();
        for (const assignment of assignments) {
          // Include ad_set_name in the key - use 'default' for null to match the DB constraint
          const adSetKey = assignment.ad_set_name || 'default';
          const key = `${assignment.creative_id}|${assignment.campaign_id}|${assignment.platform}|${assignment.market}|${assignment.phase_name}|${adSetKey}`;
          // For exact duplicates (same ad set), keep the one with more complete data
          const existing = assignmentMap.get(key);
          if (!existing || (assignment.ad_set_id && !existing.ad_set_id)) {
            assignmentMap.set(key, assignment);
          }
        }
        const deduplicatedAssignments = Array.from(assignmentMap.values());
        
        // Insert assignments - the unique index on (creative_id, campaign_id, platform, market, phase_name, COALESCE(ad_set_name, 'default'))
        // handles conflicts. We use insert with onConflict to do an upsert.
        // Note: Supabase upsert with functional index needs special handling
        const { data: upsertedAssignments, error: upsertError } = await supabase
          .from('creative_assignments')
          .upsert(deduplicatedAssignments, {
            // The unique index uses COALESCE, so we specify the raw columns and let Postgres handle it
            onConflict: 'creative_id,campaign_id,platform,market,phase_name,ad_set_name',
            ignoreDuplicates: false,
          })
          .select();

        if (upsertError) {
          console.error('Error upserting assignments:', upsertError);
          throw upsertError;
        }

        // Mark all successful ones as done
        for (const compositeKey of compositeKeyToAssignmentIndex.keys()) {
          updateSaveProgress(compositeKey, 'done');
        }

        console.log('Upserted assignments:', upsertedAssignments);

        // Build saved assignments for text asset editor
        // Map upserted assignment IDs back to original structures by creative_id
        const savedAssignments = dedupeSavedAssignments((upsertedAssignments || []).map((a: any) => {
          let matchedAsset: DigestedAsset | undefined;
          let matchedStructure: CampaignStructure | undefined;
          
          // Find the accepted match that produced this assignment
          // Match by creative_id since we now have the real DB id
          for (const [key, m] of currentState.acceptedMatches.entries()) {
            const lastColonIdx = key.lastIndexOf(':');
            const assetId = key.slice(0, lastColonIdx);
            const asset = currentState.assets.find(as => as.id === assetId);
            
            // For existing creatives, check if the creative_id matches
            // For uploaded assets, check if the structure matches the assignment
            const structureMatches = 
              m.structure.campaignId === a.campaign_id && 
              m.structure.platform === a.platform && 
              m.structure.market === a.market &&
              m.structure.phases?.[0] === a.phase_name &&
              (m.structure.adSetName || 'default') === (a.ad_set_name || 'default');
            
            if (asset && structureMatches) {
              // Also try to match on adSetId if present for precision
              const adSetMatches = !m.structure.adSetId || 
                m.structure.adSetId === (a.ad_set_id ?? m.structure.adSetId);
              
              if (adSetMatches) {
                matchedAsset = asset;
                matchedStructure = m.structure;
                break;
              }
            }
          }

          return {
            id: a.id,
            creativeId: a.creative_id,
            platform: a.platform,
            market: a.market,
            phaseName: a.phase_name,
            // Prefer the value we just saved to DB, then fall back to matched structure
            adSetName: a.ad_set_name || matchedStructure?.adSetName || 'Ad Set 1',
            adSetId: a.ad_set_id || matchedStructure?.adSetId,
            creativeName: matchedAsset?.fileName || 'Creative',
            mediaType: (matchedAsset?.mediaType || 'image') as 'image' | 'video',
          };
        }));

        console.log('Built savedAssignments:', savedAssignments);

        const successCount = assignments.length;
        if (errorCount > 0) {
          toast.warning(`Saved ${successCount} assignments, ${errorCount} failed`);
        } else {
          toast.success(`Saved ${successCount} creative assignment(s)`);
        }
        setState(prev => ({
          ...prev,
          isProcessing: false,
          currentStep: 'text_assets',
          savedAssignments,
        }));

        return true;
      } else {
        if (errorCount > 0) {
          toast.error(`All ${errorCount} assignments failed${firstErrorMessage ? `: ${firstErrorMessage}` : ''}`);
        } else {
          toast.info('No assignments to save');
        }
        setState(prev => ({ ...prev, isProcessing: false, currentStep: errorCount > 0 ? 'review' : 'complete' }));

        return false;
      }
    } catch (error) {
      console.error('Error saving matches:', error);
      toast.error('Failed to save matches');
      // Mark all pending as error
      setState(prev => {
        const newProgress = new Map(prev.saveProgress);
        for (const [key, item] of newProgress) {
          if (item.status === 'pending' || item.status === 'uploading' || item.status === 'saving') {
            newProgress.set(key, { ...item, status: 'error', error: 'Batch save failed' });
          }
        }
        return { ...prev, isProcessing: false, saveProgress: newProgress };
      });

      return false;
    }
  }, [user, updateSaveProgress]); // Only depend on user - we use stateRef for state access

  const stats = useMemo(() => ({
    totalAssets: state.assets.length,
    matchedCount: state.results.filter(r => r.matches.length > 0).length,
    unmatchedCount: state.results.filter(r => r.matches.length === 0).length,
    acceptedCount: state.acceptedMatches.size,
    avgConfidence: state.results.length > 0 ? state.results.reduce((sum, r) => sum + (r.bestMatch?.confidenceScore || 0), 0) / state.results.length : 0,
    structureCount: state.structures.length,
  }), [state.assets, state.results, state.acceptedMatches, state.structures]);

  const skipTextAssets = useCallback(() => {
    setState(prev => ({ ...prev, currentStep: 'complete' }));
  }, []);

  // Load existing assignments from database (for duplicated ActiPlans or returning to workflow)
  const loadExistingAssignments = useCallback(async (targetCampaignId: string) => {
    if (!user) return;

    try {
      // Paginate to fetch ALL assignments (Supabase defaults to 1000 max)
      const assignmentQuery = () => supabase
        .from('creative_assignments')
        .select(`
          id,
          creative_id,
          platform,
          market,
          phase_name,
          ad_set_name,
          ad_set_id,
          assigned_at,
          creatives (
            id,
            name,
            creative_type,
            media_urls
          )
        `)
        .eq('campaign_id', targetCampaignId);

      const allAssignments: any[] = [];
      const pageSize = 1000;
      let from = 0;
      let hasMore = true;
      let fetchError: any = null;

      while (hasMore) {
        const { data, error: pageError } = await assignmentQuery().range(from, from + pageSize - 1);
        if (pageError) { fetchError = pageError; break; }
        if (data) allAssignments.push(...data);
        hasMore = data !== null && data.length === pageSize;
        from += pageSize;
      }

      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('updated_at')
        .eq('id', targetCampaignId)
        .single();

      const assignments = allAssignments;
      const error = fetchError;

      if (error) {
        console.error('Error loading existing assignments:', error);
        return;
      }

      if (campaignError) {
        console.error('Error loading campaign timestamp for assignments:', campaignError);
        return;
      }

      if (assignments && assignments.length > 0) {
        const savedAssignments = dedupeSavedAssignments(assignments.map((a: any) => {
          const creative = a.creatives;
          const isVideo = creative?.creative_type === 'video' || 
            creative?.media_urls?.[0]?.includes('.mp4') || 
            creative?.media_urls?.[0]?.includes('.mov');

          return {
            id: a.id,
            creativeId: a.creative_id,
            platform: a.platform,
            market: a.market,
            phaseName: a.phase_name,
            adSetName: a.ad_set_name || 'Ad Set 1',
            adSetId: a.ad_set_id,
            creativeName: creative?.name || 'Creative',
            mediaType: (isVideo ? 'video' : 'image') as 'image' | 'video',
          };
        }));

        setState(prev => ({
          ...prev,
          savedAssignments,
        }));

        console.log(`Loaded ${savedAssignments.length} existing assignments for campaign ${targetCampaignId}`);
      }
    } catch (error) {
      console.error('Error loading existing assignments:', error);
    }
  }, [user]);

  return { state, stats, loadCampaignStructures, processFiles, addLibraryCreatives, addPlatformAssets, runMatching, acceptMatch, rejectMatch, clearRejection, clearAcceptedMatch, removeAsset, clearAll, saveMatches, skipTextAssets, loadExistingAssignments, ADS_PER_AD_SET_LIMIT, countAcceptedForStructure };
}

// Helper functions
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(img.src); resolve({ width: img.width, height: img.height }); };
    img.onerror = () => { URL.revokeObjectURL(img.src); resolve({ width: 0, height: 0 }); };
    img.src = URL.createObjectURL(file);
  });
}

function getVideoInfo(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration }); };
    video.onerror = () => { URL.revokeObjectURL(video.src); resolve({ width: 0, height: 0, duration: 0 }); };
    video.src = URL.createObjectURL(file);
  });
}

function calculateAspectRatio(w: number, h: number): string {
  if (!w || !h) return '';
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const d = gcd(w, h);
  return `${w/d}:${h/d}`;
}

function dedupeSavedAssignments<
  T extends {
    id?: string;
    creativeId: string;
    platform?: string;
    market?: string;
    phaseName?: string;
    adSetId?: string;
    adSetName?: string;
  }
>(assignments: T[]): T[] {
  const uniqueAssignments = new Map<string, T>();

  for (const assignment of assignments) {
    const key = assignment.id || [
      assignment.creativeId,
      assignment.platform || '',
      assignment.market || '',
      assignment.phaseName || '',
      assignment.adSetId || '',
      assignment.adSetName || '',
    ].join('|');

    if (!uniqueAssignments.has(key)) {
      uniqueAssignments.set(key, assignment);
    }
  }

  return Array.from(uniqueAssignments.values());
}

function getFolderPath(filePath?: string): string | null {
  if (!filePath) return null;

  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash < 0) return '/';

  return normalized.slice(0, lastSlash) || '/';
}

function normalizeLanguageCode(value?: string | null): string | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  const map: Record<string, string> = {
    english: 'en', eng: 'en', en: 'en',
    arabic: 'ar', arab: 'ar', ara: 'ar', arb: 'ar', ar: 'ar',
    french: 'fr', fra: 'fr', fre: 'fr', fr: 'fr',
    german: 'de', deu: 'de', ger: 'de', de: 'de',
    spanish: 'es', spa: 'es', es: 'es',
    portuguese: 'pt', por: 'pt', pt: 'pt',
    italian: 'it', ita: 'it', it: 'it',
  };

  return map[normalized] || (normalized.length >= 2 ? normalized.slice(0, 2) : undefined);
}

// Extract audience type from audiences array or split dimension
function extractAudienceType(
  audiences: Array<{ id: string; name: string; type: string }> | undefined,
  splitDimension: string,
  dimensionValue: any
): string | undefined {
  if (splitDimension === 'audience' || splitDimension === 'audience_selection') {
    // Determine type from first audience or dimension value
    if (audiences && audiences.length > 0) {
      const firstType = audiences[0].type?.toLowerCase();
      if (firstType?.includes('lookalike') || firstType?.includes('lal')) return 'lookalike';
      if (firstType?.includes('custom') || firstType?.includes('retarget')) return 'retargeting';
      if (firstType?.includes('interest')) return 'interest';
      if (firstType?.includes('broad')) return 'broad';
      return firstType;
    }
    if (typeof dimensionValue === 'string') return dimensionValue;
  }
  
  if (audiences && audiences.length > 0) {
    // Infer from audience names/types
    const types = audiences.map(a => a.type?.toLowerCase()).filter(Boolean);
    if (types.some(t => t.includes('lookalike'))) return 'lookalike';
    if (types.some(t => t.includes('retarget') || t.includes('custom'))) return 'retargeting';
    if (types.some(t => t.includes('interest'))) return 'interest';
  }
  
  return undefined;
}

// Calculate budget from percentage cascade
function calculateBudgetFromPercentage(
  percentage: number | undefined,
  phase: any,
  market: any,
  campaign: any
): number | undefined {
  if (!percentage) return undefined;
  
  const totalBudget = (campaign as any)?.total_budget || 0;
  if (!totalBudget) return undefined;
  
  const marketPct = market?.budgetPercentage || 100;
  const phasePct = phase?.budgetPercentage || 100;
  
  // Calculate: total * market% * phase% * adSet%
  return totalBudget * (marketPct / 100) * (phasePct / 100) * (percentage / 100);
}

function inferConstraintsFromPath(path: string): HardConstraints {
  const parts = path.split(/[\/\\]/);
  const constraints: HardConstraints = {};
  const marketCodes = ['US', 'UK', 'DE', 'FR', 'ES', 'IT', 'JP', 'KR', 'BR', 'MX', 'CA', 'AU', 'IN', 'NL', 'BE', 'CH', 'AT', 'PL', 'SE', 'NO', 'DK', 'FI'];
  for (const part of parts) {
    const upper = part.toUpperCase();
    if (marketCodes.includes(upper)) constraints.market = upper;
    const language = normalizeLanguageCode(part);
    if (language && /^(en|ar|es|fr|de|it|ja|ko|pt|zh|nl|pl|sv|no|da|fi|he|ru|tr|hi)$/i.test(language)) {
      constraints.language = language;
    }
    if (/^(A|B|C|CONTROL|TEST|VARIANT)/i.test(part)) constraints.variant = part;
  }
  return constraints;
}

function checkHardConstraints(assetConstraints: HardConstraints, structure: CampaignStructure): boolean {
  if (assetConstraints.market && structure.market && assetConstraints.market.toUpperCase() !== structure.market.toUpperCase()) return false;
  if (
    assetConstraints.language &&
    structure.language &&
    normalizeLanguageCode(assetConstraints.language) !== normalizeLanguageCode(structure.language)
  ) return false;
  if (assetConstraints.variant && structure.variant && assetConstraints.variant !== structure.variant) return false;
  return true;
}

// Inferred signals interface for enhanced matching with source tracking
interface InferredSignals {
  platform?: string;
  market?: string;
  language?: string;
  device?: string;
  gender?: string;
  ageMin?: number;
  ageMax?: number;
  audienceType?: string;
  optimizationGoal?: string;
  placement?: string;
  format?: string;
  // Extended criteria
  publisher?: string;         // Facebook, Instagram, TikTok, etc.
  funnelStage?: string;       // awareness, consideration, conversion
  campaignType?: string;      // e.g. UAC, PMax, Demand Gen
  productName?: string;       // Extracted product/campaign name
  contentPillar?: string;     // Brand, Product, Promo, etc.
  variant?: string;           // A, B, Control, etc.
  fileType?: string;          // jpg, mp4, etc.
  dimensions?: string;        // 1080x1920, etc.
  aspectRatio?: string;       // 9:16, 1:1, etc.
  // Source tracking for reasoning display
  sources: Record<string, string>;
}

// Helper to format extracted signals for display with parameter names
function formatExtractedSignalsForDisplay(signals: InferredSignals): Record<string, string> {
  const display: Record<string, string> = {};
  
  // Map signal keys to human-readable parameter names
  const parameterNames: Record<string, string> = {
    platform: 'Platform',
    market: 'Market',
    language: 'Language',
    device: 'Device',
    gender: 'Gender',
    audienceType: 'Audience Type',
    optimizationGoal: 'Optimization Goal',
    placement: 'Placement',
    format: 'Format',
    publisher: 'Publisher',
    funnelStage: 'Funnel Stage',
    campaignType: 'Campaign Type',
    productName: 'Product',
    contentPillar: 'Content Pillar',
    variant: 'Variant',
    fileType: 'File Type',
    dimensions: 'Dimensions',
    aspectRatio: 'Aspect Ratio',
  };
  
  // Build display object with parameter names as keys
  for (const [key, value] of Object.entries(signals)) {
    if (key === 'sources' || key === 'ageMin' || key === 'ageMax') continue;
    if (value !== undefined && value !== null && value !== '') {
      const displayName = parameterNames[key] || key;
      display[displayName] = String(value).toUpperCase();
    }
  }
  
  // Handle age range specially
  if (signals.ageMin !== undefined || signals.ageMax !== undefined) {
    display['Age Range'] = `${signals.ageMin || '?'}-${signals.ageMax || '?'}`;
  }
  
  return display;
}

// Helper to check for whole word match (not part of another word)
// This prevents "card" from matching "car" (carousel) or "carousel" from matching "rouse"
function matchesWholeWord(text: string, word: string): boolean {
  // Match word surrounded by word boundaries: start/end of string, whitespace, or common separators
  const regex = new RegExp(`(^|[\\s_\\-\\.\\/\\[\\]\\(\\)])${word}($|[\\s_\\-\\.\\/\\[\\]\\(\\)])`, 'i');
  return regex.test(text);
}

// Extract inferred signals from filename/path with source tracking
function extractInferredSignals(filePath: string, fileName: string): InferredSignals {
  const text = ` ${filePath} ${fileName} `.toLowerCase();
  const signals: InferredSignals = { sources: {} };
  
  // Extract file type from extension
  const extMatch = fileName.match(/\.(\w+)$/i);
  if (extMatch) {
    signals.fileType = extMatch[1].toLowerCase();
    signals.sources.fileType = `file extension ".${extMatch[1]}"`;
  }
  
  // Extract dimensions from filename (e.g., 1080x1920, 1920x1080)
  const dimMatch = text.match(/(\d{3,4})x(\d{3,4})/i);
  if (dimMatch) {
    signals.dimensions = `${dimMatch[1]}x${dimMatch[2]}`;
    const w = parseInt(dimMatch[1]), h = parseInt(dimMatch[2]);
    signals.aspectRatio = calculateAspectRatioFromDims(w, h);
    signals.sources.dimensions = `filename contains "${dimMatch[0]}"`;
  }
  
  // Platform detection - ONLY use full words or very explicit abbreviations
  const platformPatterns: Record<string, string> = {
    'meta': 'meta', 'facebook': 'meta', 'instagram': 'meta',
    'tiktok': 'tiktok',
    // Google (include common product/campaign-type shorthands)
    'google': 'google', 'googleads': 'google', 'gads': 'google',
    'youtube': 'google', 'gdn': 'google',
    'pmax': 'google', 'performance_max': 'google',
    'uac': 'google', 'universal_app': 'google', 'app_campaign': 'google', 'google_app': 'google',
    'demand_gen': 'google', 'demandgen': 'google',
    'dv360': 'dv360', 'programmatic': 'dv360',
    'snapchat': 'snapchat', 'snap': 'snapchat',
    'linkedin': 'linkedin',
    'pinterest': 'pinterest'
  };
  for (const [kw, plat] of Object.entries(platformPatterns)) {
    if (matchesWholeWord(text, kw)) { 
      signals.platform = plat; 
      signals.sources.platform = `filename contains "${kw}"`;
      break; 
    }
  }

  // Campaign type detection (used as a hard boundary when ad sets specify it)
  if (matchesWholeWord(text, 'uac') || matchesWholeWord(text, 'universal_app') || matchesWholeWord(text, 'app_campaign') || matchesWholeWord(text, 'google_app')) {
    signals.campaignType = 'uac';
    signals.sources.campaignType = 'filename contains "uac" campaign type keyword';
    if (!signals.platform) {
      signals.platform = 'google';
      signals.sources.platform = 'inferred from campaign type (UAC)';
    }
  } else if (matchesWholeWord(text, 'pmax') || matchesWholeWord(text, 'performance_max') || text.includes('performance max')) {
    signals.campaignType = 'pmax';
    signals.sources.campaignType = 'filename contains "pmax" campaign type keyword';
    if (!signals.platform) {
      signals.platform = 'google';
      signals.sources.platform = 'inferred from campaign type (PMax)';
    }
  } else if (matchesWholeWord(text, 'demand_gen') || matchesWholeWord(text, 'demandgen') || text.includes('demand gen')) {
    signals.campaignType = 'demand_gen';
    signals.sources.campaignType = 'filename contains "demand gen" campaign type keyword';
    if (!signals.platform) {
      signals.platform = 'google';
      signals.sources.platform = 'inferred from campaign type (Demand Gen)';
    }
  }
  
  // Publisher platforms (within Meta/TikTok ecosystem)
  const publisherPatterns: Record<string, string> = {
    'facebook': 'facebook', 'fb': 'facebook',
    'instagram': 'instagram', 'ig': 'instagram', 'insta': 'instagram',
    'audience_network': 'audience_network', 'an': 'audience_network',
    'messenger': 'messenger', 'msg': 'messenger',
    'whatsapp': 'whatsapp', 'wa': 'whatsapp',
    'pangle': 'pangle', 'global_app': 'global_app_bundle'
  };
  for (const [kw, pub] of Object.entries(publisherPatterns)) {
    if (matchesWholeWord(text, kw)) {
      signals.publisher = pub;
      signals.sources.publisher = `filename contains "${kw}"`;
      break;
    }
  }
  
  // Market codes (expanded list including MENA)
  const marketMatch = text.match(/[_\-\/\s\[](uae|ae|sa|kw|qa|bh|om|eg|jo|lb|us|uk|gb|de|fr|es|it|nl|au|ca|jp|kr|in|br|mx|tr|id|my|sg|ph|vn|th|za|ng|ke|pl|cz|hu|ro|gr|pt|se|no|dk|fi|be|ch|at|ie|nz)[_\-\.\s\/\]]/i);
  if (marketMatch) {
    signals.market = marketMatch[1].toUpperCase();
    signals.sources.market = `filename contains "${marketMatch[1]}"`;
  }
  
  // Language detection - expanded with full names and common variations
  const languagePatterns: Record<string, string> = {
    // Full names
    'english': 'en', 'arabic': 'ar', 'spanish': 'es', 'french': 'fr', 'german': 'de',
    'portuguese': 'pt', 'italian': 'it', 'dutch': 'nl', 'turkish': 'tr', 'russian': 'ru',
    'japanese': 'ja', 'korean': 'ko', 'chinese': 'zh', 'hindi': 'hi', 'thai': 'th',
    'vietnamese': 'vi', 'indonesian': 'id', 'malay': 'ms', 'tagalog': 'tl', 'polish': 'pl',
    'czech': 'cs', 'hungarian': 'hu', 'romanian': 'ro', 'greek': 'el', 'swedish': 'sv',
    'norwegian': 'no', 'danish': 'da', 'finnish': 'fi', 'hebrew': 'he',
    // ISO codes as words
    'eng': 'en', 'ara': 'ar', 'arb': 'ar', 'spa': 'es', 'fra': 'fr', 'deu': 'de',
    'por': 'pt', 'ita': 'it', 'nld': 'nl', 'tur': 'tr', 'rus': 'ru', 'jpn': 'ja',
    'kor': 'ko', 'zho': 'zh', 'hin': 'hi', 'tha': 'th', 'vie': 'vi', 'ind': 'id',
    'msa': 'ms', 'tgl': 'tl', 'pol': 'pl', 'ces': 'cs', 'hun': 'hu', 'ron': 'ro',
    'ell': 'el', 'swe': 'sv', 'nor': 'no', 'dan': 'da', 'fin': 'fi', 'heb': 'he',
  };
  
  // First try to match full language names using whole word matching
  for (const [name, code] of Object.entries(languagePatterns)) {
    if (matchesWholeWord(text, name)) {
      signals.language = code;
      signals.sources.language = `filename contains "${name}"`;
      break;
    }
  }
  
  // If no full name match, try ISO 2-letter codes with strict boundary matching
  if (!signals.language) {
    const langMatch = text.match(/[_\-\s\/\[\(](en|ar|es|fr|de|pt|it|nl|tr|ru|ja|ko|zh|hi|th|vi|id|ms|tl|pl|cs|hu|ro|el|sv|no|da|fi|he)[_\-\.\s\/\]\)]/i);
    if (langMatch) {
      signals.language = langMatch[1].toLowerCase();
      signals.sources.language = `filename contains "${langMatch[1]}"`;
    }
  }
  
  // Funnel stage / campaign type
  const funnelPatterns: Record<string, string> = {
    'awareness': 'awareness', 'awr': 'awareness', 'awrns': 'awareness', 'tof': 'awareness', 'top_funnel': 'awareness', 'brand': 'awareness',
    'consideration': 'consideration', 'cons': 'consideration', 'mof': 'consideration', 'mid_funnel': 'consideration', 'traffic': 'consideration', 'engagement': 'consideration',
    'conversion': 'conversion', 'conv': 'conversion', 'bof': 'conversion', 'bottom_funnel': 'conversion', 'purchase': 'conversion', 'sales': 'conversion'
  };
  for (const [kw, stage] of Object.entries(funnelPatterns)) {
    if (matchesWholeWord(text, kw)) {
      signals.funnelStage = stage;
      signals.sources.funnelStage = `filename contains "${kw}"`;
      break;
    }
  }
  
  // Content pillar
  const pillarPatterns: Record<string, string> = {
    'brand': 'brand', 'branding': 'brand', 'brand_story': 'brand',
    'product': 'product', 'prod': 'product', 'pdp': 'product',
    'promo': 'promo', 'promotion': 'promo', 'offer': 'promo', 'sale': 'promo', 'discount': 'promo',
    'ugc': 'ugc', 'user_generated': 'ugc', 'creator': 'ugc', 'influencer': 'ugc',
    'testimonial': 'testimonial', 'review': 'testimonial',
    'tutorial': 'tutorial', 'how_to': 'tutorial', 'demo': 'tutorial',
    'lifestyle': 'lifestyle', 'lf': 'lifestyle'
  };
  for (const [kw, pillar] of Object.entries(pillarPatterns)) {
    if (matchesWholeWord(text, kw)) {
      signals.contentPillar = pillar;
      signals.sources.contentPillar = `filename contains "${kw}"`;
      break;
    }
  }
  
  // Variant detection
  const variantMatch = text.match(/[_\-\s\/\[](v[0-9]+|var[_\-]?[a-z0-9]+|variant[_\-]?[a-z0-9]+|a|b|c|control|test|challenger)[_\-\.\s\/\]]/i);
  if (variantMatch) {
    signals.variant = variantMatch[1].toUpperCase();
    signals.sources.variant = `filename contains "${variantMatch[1]}"`;
  }
  
  // Product name extraction (look for product_ or prod_ prefix)
  const productMatch = text.match(/(?:product|prod)[_\-]([a-z0-9_]+)/i);
  if (productMatch) {
    signals.productName = productMatch[1].replace(/_/g, ' ');
    signals.sources.productName = `filename contains "product_${productMatch[1]}"`;
  }
  
  // Device - use whole word matching
  const devicePatterns: Record<string, string> = {
    'mobile': 'mobile', 'mob': 'mobile', 'phone': 'mobile', 'ios': 'mobile', 'android': 'mobile',
    'desktop': 'desktop', 'dsk': 'desktop', 'desk': 'desktop', 'pc': 'desktop',
    'tablet': 'tablet', 'tab': 'tablet', 'ipad': 'tablet',
    'ctv': 'ctv', 'tv': 'ctv', 'ott': 'ctv'
  };
  for (const [kw, dev] of Object.entries(devicePatterns)) {
    if (matchesWholeWord(text, kw)) { 
      signals.device = dev; 
      signals.sources.device = `filename contains "${kw}"`;
      break; 
    }
  }
  
  // Gender - use whole word matching
  const genderKeywords = ['female', 'women', 'woman', 'f_only', 'male', 'men', 'man', 'm_only', 'all_gender', 'unisex'];
  for (const gkw of genderKeywords) {
    if (matchesWholeWord(text, gkw)) {
      if (['female', 'women', 'woman', 'f_only'].includes(gkw)) {
        signals.gender = 'female';
      } else if (['male', 'men', 'man', 'm_only'].includes(gkw)) {
        signals.gender = 'male';
      } else {
        signals.gender = 'all';
      }
      signals.sources.gender = `filename contains "${gkw}"`;
      break;
    }
  }
  
  // Age brackets
  const ageBrackets = [
    { pattern: /(18[\-_]24|1824|gen_?z|youth)/i, min: 18, max: 24 },
    { pattern: /(25[\-_]34|2534|millennials?)/i, min: 25, max: 34 },
    { pattern: /(35[\-_]44|3544)/i, min: 35, max: 44 },
    { pattern: /(45[\-_]54|4554)/i, min: 45, max: 54 },
    { pattern: /(55[\-_]64|5564|seniors?)/i, min: 55, max: 64 },
    { pattern: /(65\+|65plus)/i, min: 65, max: 99 },
    { pattern: /(18[\-_]34|1834)/i, min: 18, max: 34 },
    { pattern: /(25[\-_]54|2554|core)/i, min: 25, max: 54 },
  ];
  for (const ab of ageBrackets) {
    if (ab.pattern.test(text)) {
      signals.ageMin = ab.min;
      signals.ageMax = ab.max;
      signals.sources.age = `filename contains age pattern "${signals.ageMin}-${signals.ageMax}"`;
      break;
    }
  }
  // Generic age pattern
  const genericAge = text.match(/age[_\-]?(\d{2})[_\-](\d{2})/i);
  if (genericAge && !signals.ageMin) {
    signals.ageMin = parseInt(genericAge[1]);
    signals.ageMax = parseInt(genericAge[2]);
    signals.sources.age = `filename contains "age_${signals.ageMin}-${signals.ageMax}"`;
  }
  
  // Audience type - use whole word matching
  const audPatterns: Record<string, string> = {
    'broad': 'broad', 'brd': 'broad', 'open': 'broad', 'prospecting': 'broad', 'cold': 'broad',
    'lookalike': 'lookalike', 'lal': 'lookalike', 'lkl': 'lookalike', 'similar': 'lookalike',
    'retargeting': 'retargeting', 'ret': 'retargeting', 'rtg': 'retargeting', 'remarketing': 'retargeting', 'warm': 'retargeting',
    'custom': 'custom', 'ca': 'custom', 'first_party': 'custom', '1p': 'custom',
    'interest': 'interest', 'int': 'interest'
  };
  for (const [kw, aud] of Object.entries(audPatterns)) {
    if (matchesWholeWord(text, kw)) { 
      signals.audienceType = aud; 
      signals.sources.audienceType = `filename contains "${kw}"`;
      break; 
    }
  }
  
  // Optimization goal - use whole word matching
  const goalPatterns: Record<string, string> = {
    'uac': 'app_installs', 'app_install': 'app_installs', 'install': 'app_installs', 'download': 'app_installs',
    'conversion': 'conversions', 'purchase': 'conversions', 'sale': 'conversions', 'checkout': 'conversions',
    'lead': 'leads', 'signup': 'leads', 'register': 'leads', 'form': 'leads',
    'traffic': 'traffic', 'click': 'traffic', 'landing': 'traffic',
    'video_view': 'video_views', 'watch': 'video_views', 'thruplay': 'video_views',
    'engagement': 'engagement', 'engage': 'engagement',
    'reach': 'reach', 'awareness': 'reach',
    'message': 'messages', 'msg': 'messages', 'whatsapp': 'messages', 'messenger': 'messages'
  };
  for (const [kw, goal] of Object.entries(goalPatterns)) {
    if (matchesWholeWord(text, kw)) { 
      signals.optimizationGoal = goal; 
      signals.sources.optimizationGoal = `filename contains "${kw}"`;
      break; 
    }
  }
  
  // Placement - use whole word matching
  const placementPatterns: Record<string, string> = {
    'feed': 'feed', 'newsfeed': 'feed', 'home': 'feed',
    'stories': 'stories', 'story': 'stories', 'str': 'stories',
    'reels': 'reels', 'reel': 'reels', 'rls': 'reels',
    'explore': 'explore', 'exp': 'explore', 'discovery': 'explore',
    'shorts': 'shorts', 'short': 'shorts',
    'fyp': 'for_you', 'foryou': 'for_you',
    'instream': 'in_stream', 'preroll': 'in_stream', 'midroll': 'in_stream',
    'right_column': 'right_column', 'right_hand': 'right_column',
    'marketplace': 'marketplace', 'mktplace': 'marketplace',
    'search': 'search', 'search_results': 'search'
  };
  for (const [kw, pl] of Object.entries(placementPatterns)) {
    if (matchesWholeWord(text, kw)) { 
      signals.placement = pl; 
      signals.sources.placement = `filename contains "${kw}"`;
      break; 
    }
  }
  
  // Format - use whole word matching
  const formatPatterns: Record<string, string> = {
    'carousel': 'carousel', 'swipe': 'carousel', 'multi': 'carousel',
    'single': 'single', 'static': 'single',
    'video': 'video', 'vid': 'video', 'mp4': 'video', 'mov': 'video',
    'collection': 'collection', 'catalog': 'collection',
    'slideshow': 'slideshow', 'gif': 'gif'
  };
  for (const [kw, fmt] of Object.entries(formatPatterns)) {
    if (matchesWholeWord(text, kw)) { 
      signals.format = fmt; 
      signals.sources.format = `filename contains "${kw}"`;
      break; 
    }
  }
  
  return signals;
}

// Helper to calculate aspect ratio from dimensions
function calculateAspectRatioFromDims(w: number, h: number): string {
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const d = gcd(w, h);
  const ratioW = w / d, ratioH = h / d;
  // Map common ratios to standard names
  if (ratioW === 16 && ratioH === 9) return '16:9';
  if (ratioW === 9 && ratioH === 16) return '9:16';
  if (ratioW === 1 && ratioH === 1) return '1:1';
  if (ratioW === 4 && ratioH === 5) return '4:5';
  if (ratioW === 5 && ratioH === 4) return '5:4';
  // For non-standard, return simplified
  return `${ratioW}:${ratioH}`;
}

// Enhanced hard constraints check with inference support
function checkHardConstraintsEnhanced(
  assetConstraints: HardConstraints,
  structure: CampaignStructure,
  options: { isSingleMarketPlan: boolean; isSinglePlatformPlan: boolean; inferredSignals: InferredSignals }
): { passed: boolean; failures: Array<{ constraint: string; expected: string; actual: string }>; notes: string[]; inferenceUsed: boolean } {
  const failures: Array<{ constraint: string; expected: string; actual: string }> = [];
  const notes: string[] = [];
  let inferenceUsed = false;

  // Market check
  if (assetConstraints.market && structure.market) {
    if (assetConstraints.market.toUpperCase() !== structure.market.toUpperCase()) {
      failures.push({ constraint: 'market', expected: structure.market, actual: assetConstraints.market });
    }
  } else if (!assetConstraints.market && structure.market) {
    if (options.isSingleMarketPlan) {
      notes.push(`Market assumed: ${structure.market} (single-market plan)`);
      inferenceUsed = true;
    } else if (options.inferredSignals.market?.toUpperCase() === structure.market.toUpperCase()) {
      notes.push(`Market inferred from filename: ${options.inferredSignals.market}`);
      inferenceUsed = true;
    }
  }

  // Language check
  if (assetConstraints.language && structure.language) {
    if (assetConstraints.language.toLowerCase() !== structure.language.toLowerCase()) {
      failures.push({ constraint: 'language', expected: structure.language, actual: assetConstraints.language });
    }
  } else if (!assetConstraints.language && structure.language && options.inferredSignals.language) {
    if (options.inferredSignals.language.toLowerCase() === structure.language.toLowerCase()) {
      notes.push(`Language inferred: ${options.inferredSignals.language}`);
      inferenceUsed = true;
    }
  }

  // Variant check
  if (assetConstraints.variant && structure.variant && assetConstraints.variant !== structure.variant) {
    failures.push({ constraint: 'variant', expected: structure.variant, actual: assetConstraints.variant });
  }

  return { passed: failures.length === 0, failures, notes, inferenceUsed };
}

// Check if age ranges overlap
function checkAgeOverlap(a: { min: number; max: number }, b: { min: number; max: number }): boolean {
  return a.min <= b.max && b.min <= a.max;
}

// Check if dimensions are valid for social media ad formats using platform specs
function isValidAdDimensions(
  width?: number, 
  height?: number,
  mediaType?: AssetMediaType,
  targetPlatform?: string
): { 
  valid: boolean; 
  reason?: string;
  compatibleFormats?: Array<{ platform: string; format: string; placement: string }>;
} {
  if (!width || !height) {
    // Missing metadata shouldn't block meshing (common for existing library creatives).
    // We skip strict format validation and let other signals (platform/market/etc.) drive matching.
    return { valid: true, compatibleFormats: [] };
  }

  // Use the comprehensive platform ad specs validation
  const validation = validateCreativeForAds(
    width, 
    height, 
    mediaType === 'video' ? 'video' : 'image'
  );
  
  if (!validation.isValid) {
    return { 
      valid: false, 
      reason: validation.reason || `Dimensions ${width}x${height} don't fit any standard ad format`
    };
  }
  
  // If target platform specified, check if compatible with that platform
  if (targetPlatform) {
    const platformCompatible = validation.compatibleFormats.some(
      f => f.platform === targetPlatform.toLowerCase()
    );
    
    if (!platformCompatible) {
      const compatiblePlatforms = [...new Set(validation.compatibleFormats.map(f => f.platform))];
      return {
        valid: false,
        reason: `Dimensions ${width}x${height} not compatible with ${targetPlatform}. Compatible: ${compatiblePlatforms.join(', ')}`,
        compatibleFormats: validation.compatibleFormats,
      };
    }
  }
  
  return { 
    valid: true, 
    compatibleFormats: validation.compatibleFormats 
  };
}

// Core matching function: match asset signals against structure taxonomy
// Enforces STRICT platform and language checks - no cross-platform or cross-language matches
// PRIORITY 1: Check metadata (dimensions) FIRST to filter unsuitable creatives early
function matchAssetToStructure(
  asset: DigestedAsset,
  signals: InferredSignals,
  structure: CampaignStructure,
  options: { isSingleMarketPlan: boolean; isSinglePlatformPlan: boolean }
): {
  isMatch: boolean;
  score: number;
  matchedCriteria: Array<{ criterion: string; reason: string }>;
  blockingReasons: string[];
  issues: Array<{ type: string; severity: 'warning' | 'error'; message: string }>;
} {
  const matchedCriteria: Array<{ criterion: string; reason: string }> = [];
  const blockingReasons: string[] = [];
  const issues: Array<{ type: string; severity: 'warning' | 'error'; message: string }> = [];
  let score = 50; // Base score

  // === PRIORITY 1: METADATA VALIDATION (check first!) ===
  // Validate dimensions from metadata BEFORE any other matching logic
  // Also check platform-specific format compatibility
  const { width, height } = asset.technicalAttributes;

  // If we don't have dimensions (common for older library creatives), don't hard-block.
  // Continue matching using taxonomy/metadata signals and surface a warning instead.
  if (!width || !height) {
    issues.push({
      type: 'dimensions_missing',
      severity: 'warning',
      message: 'No dimensions detected for this creative; skipping format validation.',
    });
    matchedCriteria.push({
      criterion: 'Dimensions',
      reason: 'Skipped (no metadata)',
    });
  } else {
    const dimensionCheck = isValidAdDimensions(width, height, asset.mediaType, structure.platform);

    if (!dimensionCheck.valid) {
      blockingReasons.push(`Invalid ad dimensions: ${dimensionCheck.reason}`);
      return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
    }

    // Check if dimensions are compatible with this specific platform's ad formats
    const platformFormats = findCompatibleFormats(
      width,
      height,
      asset.mediaType === 'video' ? 'video' : 'image',
      structure.platform
    );

    if (platformFormats.length === 0) {
      blockingReasons.push(`Dimensions ${width}x${height} not compatible with ${structure.platform.toUpperCase()} ad formats`);
      return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
    }

    // Dimensions are valid for this platform, add to matched criteria with format details
    const formatNames = platformFormats.map(f => f.format.name).slice(0, 2).join(', ');
    const exactMatch = platformFormats.some(f => f.compatibility === 'exact');
    matchedCriteria.push({
      criterion: 'Dimensions',
      reason: `${exactMatch ? 'Exact' : 'Compatible'} format for ${structure.platform}: ${formatNames} (${width}x${height})`,
    });

    // Bonus score for exact dimension match
    if (exactMatch) {
      score += 10;
    }
  }

  // === HARD CONSTRAINTS (blocking) ===
  
  // STRICT: Platform is a HARD boundary.
  // - If the plan has multiple platforms, the asset must state a platform (via filename OR existing creative metadata).
  // - For single-platform plans, we can safely assume the platform.
  const assetPlatformRaw =
    (typeof (asset as any).compatibilitySignals?.platform === 'string'
      ? String((asset as any).compatibilitySignals.platform)
      : undefined) ||
    signals.platform;

  const assetPlatform = assetPlatformRaw?.toLowerCase();

  if (!assetPlatform) {
    if (!options.isSinglePlatformPlan) {
      blockingReasons.push(
        `Platform required: ActiPlan contains multiple platforms, but asset has no platform keyword (add "meta", "tiktok", "google", etc. to filename)`
      );
      return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
    }

    matchedCriteria.push({
      criterion: 'Platform',
      reason: `Assumed "${structure.platform.toUpperCase()}" (single-platform plan)`,
    });
  } else {
    if (assetPlatform !== structure.platform) {
      blockingReasons.push(
        `Platform mismatch: asset is "${assetPlatform.toUpperCase()}" but ad set is "${structure.platform.toUpperCase()}"`
      );
      return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
    }

    matchedCriteria.push({
      criterion: 'Platform',
      reason: `"${assetPlatform}" matches (${signals.sources.platform || 'creative metadata'})`,
    });
    score += 15;
  }

  // STRICT: TikTok Delivery Eligibility - Block manual uploads and API-uploaded creatives
  // TikTok only allows creatives uploaded through Ads Manager (UI_SYNC) for ad delivery
  // Manual file uploads (sourceType: 'upload') and API uploads (creative_origin: 'API_UPLOAD') are NOT delivery-eligible
  if (structure.platform === 'tiktok') {
    const sourceType = (asset as any).sourceType;
    const creativeOrigin = (asset as any).creativeOrigin || (asset as any).compatibilitySignals?.creativeOrigin;
    
    // Block manual file uploads (user dragged/dropped files)
    if (sourceType === 'upload') {
      blockingReasons.push(
        'TikTok requires creatives to be uploaded in TikTok Ads Manager. Manual file uploads cannot be used for TikTok ad delivery. Please upload to TikTok Ads Manager first, then sync.'
      );
      return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
    }
    
    // Block API-uploaded platform assets (these are not delivery-eligible per TikTok limitations)
    if (sourceType === 'platform_asset' && creativeOrigin === 'API_UPLOAD') {
      blockingReasons.push(
        'This TikTok creative was uploaded via API and is not eligible for ad delivery. Only creatives uploaded through TikTok Ads Manager can be used. Please re-upload in TikTok Ads Manager, then sync.'
      );
      return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
    }
  }

  // STRICT: Campaign Type must match if the ad set taxonomy specifies it (e.g., UAC, PMAX)
  const taxonomyCampaignType = Object.entries(structure.taxonomyElements ?? {}).find(([k]) =>
    /campaign\s*type/i.test(k)
  )?.[1];

  const normalizeCampaignType = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

  const requiredCampaignType = taxonomyCampaignType ? normalizeCampaignType(taxonomyCampaignType) : undefined;
  if (requiredCampaignType && requiredCampaignType !== 'all') {
    const assetCampaignType = signals.campaignType ? normalizeCampaignType(signals.campaignType) : undefined;

    if (!assetCampaignType) {
      blockingReasons.push(
        `Campaign type required: ad set requires "${taxonomyCampaignType}" but asset has no campaign type keyword (e.g., "uac", "pmax")`
      );
      return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
    }

    if (assetCampaignType !== requiredCampaignType) {
      blockingReasons.push(
        `Campaign type mismatch: asset is "${signals.campaignType}" but ad set requires "${taxonomyCampaignType}"`
      );
      return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
    }

    matchedCriteria.push({
      criterion: 'Campaign Type',
      reason: `"${taxonomyCampaignType}" matches (${signals.sources.campaignType || 'filename'})`,
    });
    score += 10;
  }

  // STRICT: PMax eligibility — block any asset that doesn't fit one of the 5
  // PMax buckets (marketing 1.91:1, square 1:1, portrait 4:5, logo, video).
  // This prevents Google-eligible-but-PMax-ineligible assets (e.g. 9:16 reels,
  // Discovery sizes, undersized images) from ever reaching the PMax editor.
  const isPmaxAdSet =
    structure.platform === 'google' &&
    (requiredCampaignType === 'pmax' ||
      requiredCampaignType === 'performancemax' ||
      /performance.?max|\bpmax\b/i.test(`${structure.phaseName || ''} ${structure.adSetName || ''}`));
  if (isPmaxAdSet) {
    const { classifyPmaxAsset } = await import('@/utils/pmaxAssetGroupValidation');
    const bucket = classifyPmaxAsset({
      width: asset.technicalAttributes.width,
      height: asset.technicalAttributes.height,
      mediaType: asset.mediaType,
      filename: (asset as any).fileName,
      folderPath: (asset as any).filePath,
      name: (asset as any).fileName,
      platformVideoId:
        (asset as any).platformVideoId ||
        (asset as any).platform_video_id ||
        (asset as any).compatibilitySignals?.platformVideoId,
    });
    if (!bucket) {
      blockingReasons.push(
        `PMax ineligible: asset ${asset.technicalAttributes.width || '?'}×${asset.technicalAttributes.height || '?'} (${asset.mediaType}) does not fit any Performance Max bucket (Marketing 1.91:1 ≥600×314, Square 1:1 ≥300×300, Portrait 4:5 ≥480×600, Logo 1:1 ≥128×128, Video must be a YouTube link).`,
      );
      return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
    }
    matchedCriteria.push({
      criterion: 'PMax bucket',
      reason: `Fits Google PMax "${bucket}" slot`,
    });
    score += 5;
  }

  // STRICT: Video-only optimization goals cannot match image assets
  // ThruPlay, Video Views, 6s Video View, 15s Video View, Focused View are video-exclusive
  const VIDEO_ONLY_GOALS = [
    'tpl', 'thruplay',
    'vv', 'video_view', 'video_views', 'videoview', 'videoviews',
    '6sv', '6s_video_view', '6s_video_views',
    '15sv', '15s_video_view', '15s_video_views',
    'fcv', 'focused_view', 'focusedview',
    'cpv', 'cost_per_view',
  ];
  
  const taxonomyOptGoal = Object.entries(structure.taxonomyElements ?? {}).find(([k]) =>
    /optimization\s*goal/i.test(k)
  )?.[1];
  
  const normalizedGoal = (taxonomyOptGoal || structure.optimizationGoal || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const isVideoOnlyGoal = VIDEO_ONLY_GOALS.some(g => normalizedGoal.includes(g));
  
  if (isVideoOnlyGoal && asset.mediaType !== 'video') {
    blockingReasons.push(
      `Media type mismatch: optimization goal "${taxonomyOptGoal || structure.optimizationGoal}" requires VIDEO but asset is IMAGE`
    );
    return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
  }
  
  if (isVideoOnlyGoal && asset.mediaType === 'video') {
    matchedCriteria.push({
      criterion: 'Media Type',
      reason: `Video asset matches video-only goal "${taxonomyOptGoal || structure.optimizationGoal}"`,
    });
    score += 5;
  }

  // STRICT: Language must match if language is a split dimension
  // If language is the split dimension, it becomes a HARD constraint - must match exactly
  // Otherwise it's a soft constraint that adds score
  if (structure.language) {
    const structureLang = normalizeLanguageCode(structure.language)?.toLowerCase();
    const assetLang = signals.language?.toLowerCase();

    if (!structureLang) {
      // Ignore unparseable language labels on the structure.
    } else
    
    if (structure.languageIsSplitDimension || structure.splitDimension === 'language') {
      // Language is a split dimension - BLOCKING
      if (!assetLang) {
        // Asset has no language signal - for split dimensions, don't block (let it match all)
        // but reduce score since we can't verify match
        issues.push({ type: 'language', severity: 'warning', message: `Language split active but asset has no language in filename` });
      } else if (assetLang !== structureLang) {
        // Language mismatch on a split dimension - BLOCK
        blockingReasons.push(`Language mismatch: asset is "${assetLang.toUpperCase()}" but ad set targets "${structureLang.toUpperCase()}" (language split)`);
        return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
      } else {
        // Languages match
        matchedCriteria.push({ criterion: 'Language', reason: `"${assetLang.toUpperCase()}" matches split (${signals.sources.language})` });
        score += 15;
      }
    } else {
      // Language is NOT a split dimension - softer matching
      if (assetLang && assetLang !== structureLang) {
        // Mismatch but not blocking, just warn
        issues.push({ type: 'language', severity: 'warning', message: `Asset language "${assetLang}" ≠ "${structureLang}"` });
        score -= 5;
      } else if (assetLang && assetLang === structureLang) {
        matchedCriteria.push({ criterion: 'Language', reason: `"${assetLang.toUpperCase()}" matches (${signals.sources.language})` });
        score += 10;
      }
    }
  } else if (signals.language) {
    // Asset has language but structure doesn't require one - just note it
    matchedCriteria.push({ criterion: 'Language', reason: `Asset language: "${signals.language.toUpperCase()}" (${signals.sources.language})` });
  }
  
  // STRICT: Market must match if specified (unless single market plan)
  if (signals.market && structure.market) {
    if (signals.market.toUpperCase() !== structure.market.toUpperCase()) {
      blockingReasons.push(`Market mismatch: asset is "${signals.market}" but ad set is "${structure.market}"`);
      return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
    }
    matchedCriteria.push({ criterion: 'Market', reason: `"${signals.market}" matches (${signals.sources.market})` });
    score += 10;
  } else if (options.isSingleMarketPlan && structure.market) {
    matchedCriteria.push({ criterion: 'Market', reason: `Assumed "${structure.market}" (single-market plan)` });
  }

  // === SOFT CRITERIA (scoring) ===
  
  // Funnel stage match
  if (signals.funnelStage && structure.funnelStage) {
    if (signals.funnelStage === structure.funnelStage.toLowerCase()) {
      matchedCriteria.push({ criterion: 'Funnel', reason: `"${signals.funnelStage}" matches phase (${signals.sources.funnelStage})` });
      score += 12;
    } else {
      issues.push({ type: 'funnel', severity: 'warning', message: `Funnel stage "${signals.funnelStage}" ≠ "${structure.funnelStage}"` });
      score -= 5;
    }
  }

  // Optimization goal match
  if (signals.optimizationGoal && structure.optimizationGoal) {
    const goalMatch = signals.optimizationGoal === structure.optimizationGoal.toLowerCase() ||
      structure.optimizationGoal.toLowerCase().includes(signals.optimizationGoal);
    if (goalMatch) {
      matchedCriteria.push({ criterion: 'Goal', reason: `"${signals.optimizationGoal}" → ${structure.optimizationGoal} (${signals.sources.optimizationGoal})` });
      score += 10;
    } else {
      // Goal mismatch is a soft warning but reduces score
      issues.push({ type: 'optimization', severity: 'warning', message: `Optimization "${signals.optimizationGoal}" ≠ "${structure.optimizationGoal}"` });
      score -= 8;
    }
  }

  // Device match - BLOCKING if ad set has device constraint and asset specifies a different device
  if (structure.deviceConstraints?.length && structure.deviceConstraints.length > 0) {
    const hasDeviceConstraint = !structure.deviceConstraints.includes('all') && structure.deviceConstraints.length < 3;
    if (hasDeviceConstraint) {
      if (signals.device) {
        if (structure.deviceConstraints.includes(signals.device)) {
          matchedCriteria.push({ criterion: 'Device', reason: `"${signals.device}" matches targeting (${signals.sources.device})` });
          score += 8;
        } else {
          // Device mismatch is BLOCKING for split dimensions
          blockingReasons.push(`Device mismatch: asset is "${signals.device}" but ad set targets "${structure.deviceConstraints.join(', ')}"`);
          return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
        }
      }
      // If asset has no device signal but ad set has device constraint, don't block - let it match all
    }
  }

  // Gender match - BLOCKING if ad set has gender constraint and asset specifies a different gender
  if (structure.genderConstraint && structure.genderConstraint !== 'all') {
    if (signals.gender) {
      if (signals.gender === structure.genderConstraint || signals.gender === 'all') {
        matchedCriteria.push({ criterion: 'Gender', reason: `"${signals.gender}" matches (${signals.sources.gender})` });
        score += 8;
      } else {
        // Gender mismatch is BLOCKING for split dimensions
        blockingReasons.push(`Gender mismatch: asset is "${signals.gender}" but ad set targets "${structure.genderConstraint}"`);
        return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
      }
    }
    // If asset has no gender signal but ad set has gender constraint, don't block - let it match all
  }

  // Audience type match - BLOCKING if ad set has audience type constraint and asset specifies a different type
  if (structure.audienceTypeConstraint && structure.audienceTypeConstraint !== 'broad') {
    if (signals.audienceType) {
      if (signals.audienceType === structure.audienceTypeConstraint) {
        matchedCriteria.push({ criterion: 'Audience', reason: `"${signals.audienceType}" matches (${signals.sources.audienceType})` });
        score += 10;
      } else {
        // Audience type mismatch is BLOCKING for split dimensions
        blockingReasons.push(`Audience type mismatch: asset is "${signals.audienceType}" but ad set targets "${structure.audienceTypeConstraint}"`);
        return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
      }
    }
    // If asset has no audience type signal but ad set has audience constraint, don't block
  }

  // Age range match - BLOCKING if ad set has age constraint and asset specifies a different age
  if (structure.ageConstraints && structure.splitDimension === 'age') {
    if (signals.ageMin !== undefined && signals.ageMax !== undefined) {
      const hasOverlap = signals.ageMin <= structure.ageConstraints.max && 
                         signals.ageMax >= structure.ageConstraints.min;
      if (!hasOverlap) {
        blockingReasons.push(`Age mismatch: asset is ${signals.ageMin}-${signals.ageMax} but ad set targets ${structure.ageConstraints.min}-${structure.ageConstraints.max}`);
        return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
      }
      matchedCriteria.push({ criterion: 'Age', reason: `${signals.ageMin}-${signals.ageMax} overlaps with target (${signals.sources.age})` });
      score += 10;
    }
  }

  if (asset.technicalAttributes.aspectRatio) {
    const isVertical = (asset.technicalAttributes.height || 0) > (asset.technicalAttributes.width || 0);
    if ((structure.platform === 'tiktok' || structure.platform === 'snapchat') && !isVertical) {
      issues.push({ type: 'aspect_ratio', severity: 'warning', message: 'Horizontal format, vertical recommended' });
      score -= 5;
    } else if (isVertical && (structure.platform === 'tiktok' || structure.platform === 'snapchat')) {
      matchedCriteria.push({ criterion: 'Aspect Ratio', reason: `Vertical format preferred for ${structure.platform}` });
      score += 5;
    }
  }

  // Placement match
  if (signals.placement && structure.placementConstraints?.length) {
    const placementMatch = structure.placementConstraints.some(p => 
      p.toLowerCase().includes(signals.placement!) || signals.placement!.includes(p.toLowerCase())
    );
    if (placementMatch) {
      matchedCriteria.push({ criterion: 'Placement', reason: `"${signals.placement}" (${signals.sources.placement})` });
      score += 8;
    }
  }
  
  // Publisher match (within platform ecosystem)
  if (signals.publisher && structure.placementConstraints?.length) {
    const publisherMatch = structure.placementConstraints.some(p => 
      p.toLowerCase().includes(signals.publisher!) || signals.publisher === p.toLowerCase()
    );
    if (publisherMatch) {
      matchedCriteria.push({ criterion: 'Publisher', reason: `"${signals.publisher}" matches placements (${signals.sources.publisher})` });
      score += 6;
    }
  }

  // Source network matching for organic posts (Meta only: Facebook vs Instagram)
  // If the asset is from a specific source (FB or IG), prefer matching with ad sets configured for that publisher
  const assetSourceNetwork = (asset as any).sourceNetwork as 'facebook' | 'instagram' | undefined;
  if (assetSourceNetwork && structure.platform === 'meta' && structure.placementConstraints?.length) {
    const placements = structure.placementConstraints.map(p => p.toLowerCase());
    const hasInstagram = placements.some(p => p.includes('instagram') || p === 'ig');
    const hasFacebook = placements.some(p => p.includes('facebook') || p === 'fb');
    const isInstagramOnly = hasInstagram && !hasFacebook;
    const isFacebookOnly = hasFacebook && !hasInstagram;
    
    if (assetSourceNetwork === 'instagram') {
      if (isInstagramOnly) {
        // Perfect match: Instagram post with Instagram-only ad set
        matchedCriteria.push({ 
          criterion: 'Source Network', 
          reason: 'Instagram organic post matches Instagram-only ad set' 
        });
        score += 15;
      } else if (isFacebookOnly) {
        // Mismatch: Instagram post cannot be promoted on Facebook-only ad set
        issues.push({ 
          type: 'source_network', 
          severity: 'warning', 
          message: 'Instagram organic post may not be optimal for Facebook-only ad set' 
        });
        score -= 10;
      } else if (hasInstagram) {
        // Ad set targets both, but Instagram post gives a small boost for IG placements
        matchedCriteria.push({ 
          criterion: 'Source Network', 
          reason: 'Instagram organic post (ad set includes Instagram placements)' 
        });
        score += 8;
      }
    } else if (assetSourceNetwork === 'facebook') {
      if (isFacebookOnly) {
        // Perfect match: Facebook post with Facebook-only ad set
        matchedCriteria.push({ 
          criterion: 'Source Network', 
          reason: 'Facebook organic post matches Facebook-only ad set' 
        });
        score += 12;
      } else if (isInstagramOnly) {
        // Mismatch: Facebook post with Instagram-only ad set
        issues.push({ 
          type: 'source_network', 
          severity: 'warning', 
          message: 'Facebook organic post may not be optimal for Instagram-only ad set' 
        });
        score -= 10;
      } else if (hasFacebook) {
        // Ad set targets both, Facebook post gets a small boost
        matchedCriteria.push({ 
          criterion: 'Source Network', 
          reason: 'Facebook organic post (ad set includes Facebook placements)' 
        });
        score += 6;
      }
    }
  }

  // Consider it a match if score is above threshold and no blocking reasons
  const isMatch = blockingReasons.length === 0 && score >= 50;
  
  return { isMatch, score: Math.max(0, Math.min(100, score)), matchedCriteria, blockingReasons, issues };
}
