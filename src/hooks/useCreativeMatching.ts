// Hook for creative-to-plan matching workflow
import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { HardConstraints, SupportedPlatform, AssetMediaType } from '@/types/creativeMatching';
import { generateAdTaxonomyName, AD_TAXONOMY_MAPPINGS, createShortCode, getDefaultAdSetParams, extractTaxonomyValues, generateTaxonomyString, TaxonomyContext, TaxonomyParam } from '@/utils/taxonomyUtils';
import { validateCreativeForAds, findCompatibleFormats, PLATFORM_AD_SPECS } from '@/utils/platformAdSpecs';

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
  currentStep: 'upload' | 'digest' | 'match' | 'review' | 'complete';
}

export function useCreativeMatching(campaignId?: string) {
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
  });

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
      
      // Fetch taxonomy templates for all platforms
      const taxonomyTemplates: Record<string, TaxonomyParam[]> = {};
      for (const platform of platforms) {
        const platformKey = String(platform?.id ?? '').toLowerCase();
        const adAccountId = platform?.adAccountId || platform?.ad_account_id;
        
        if (adAccountId) {
          try {
            const { data: templateData } = await supabase
              .from('taxonomy_templates')
              .select('template')
              .eq('ad_account_id', adAccountId)
              .eq('entity_type', 'adset')
              .eq('platform', platformKey)
              .maybeSingle();
            
            if (templateData?.template) {
              taxonomyTemplates[platformKey] = templateData.template as unknown as TaxonomyParam[];
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
        const template = taxonomyTemplates[platformKey] || getDefaultAdSetParams(platformKey as 'meta' | 'tiktok');
        const values = extractTaxonomyValues(template, context);
        const taxonomyName = generateTaxonomyString(template, values);
        
        // Build elements for display: paramLabel -> value
        const elements: Record<string, string> = {};
        for (const param of template) {
          const value = values[param.id] || 'ALL';
          // Use the label from template or format the id
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

            const language =
              (Array.isArray(market?.languages) && market.languages[0]) ||
              (Array.isArray(phase?.languages) && phase.languages[0]) ||
              market?.language ||
              undefined;

            // Check if phase has ad set splits
            const adSets: any[] = Array.isArray(phase?.adSets) ? phase.adSets : [];
            const splitDimension = phase?.adSetSplitDimension || 'none';

            if (adSets.length > 0 && splitDimension !== 'none') {
              // Create a structure for EACH ad set configuration
              for (const adSet of adSets) {
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
                  languages: adSet.languages || phase?.languages || market?.languages,
                  targetingType: extractTargetingType(adSet.audiences),
                  phaseBudget: calculateBudgetFromPercentage(adSet.budgetPercentage, phase, market, campaign),
                };
                
                const taxonomyResult = generateAdSetTaxonomyName(platformKey, taxonomyContext);
                
                const adSetStructure: CampaignStructure = {
                  id: `${campaignIdToLoad}-${platformKey}-${market?.id ?? market?.name ?? 'market'}-${phase?.name ?? 'phase'}-${adSet.id}`,
                  ...baseStructureData,
                  adSetId: adSet.id,
                  adSetName: taxonomyResult.name,
                  taxonomyElements: taxonomyResult.elements,
                  placementConstraints: adSet.placements || adSet.tiktokPlacements || placementConstraints,
                  formatConstraints,
                  language: adSet.languages?.[0] || language,
                  optimizationGoal: adSet.optimizationGoal || phase?.optimizationGoal,
                  phases: phase?.name ? [phase.name] : undefined,
                  // Ad set split dimensions
                  deviceConstraints: adSet.devices,
                  genderConstraint: adSet.gender || (splitDimension === 'gender' ? adSet.dimensionValue : undefined),
                  ageConstraints: (adSet.ageMin !== undefined && adSet.ageMax !== undefined)
                    ? { min: adSet.ageMin, max: adSet.ageMax }
                    : (splitDimension === 'age' && typeof adSet.dimensionValue === 'object')
                      ? adSet.dimensionValue
                      : undefined,
                  audienceTypeConstraint: extractAudienceType(adSet.audiences, splitDimension, adSet.dimensionValue),
                  audiences: adSet.audiences,
                  budgetAmount: calculateBudgetFromPercentage(adSet.budgetPercentage, phase, market, campaign),
                  budgetType: phase?.budgetType,
                };
                structures.push(adSetStructure);
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
                languages: phase?.languages || market?.languages,
                targetingType: extractTargetingType(phase?.audiences),
                phaseBudget: calculateBudgetFromPercentage(phase?.budgetPercentage, phase, market, campaign),
              };
              const taxonomyResult = generateAdSetTaxonomyName(platformKey, taxonomyContext);
              
              // No splits - create single structure from phase
              structures.push({
                id: `${campaignIdToLoad}-${platformKey}-${market?.id ?? market?.name ?? 'market'}-${phase?.name ?? 'phase'}`,
                ...baseStructureData,
                adSetId: market?.id,
                adSetName: taxonomyResult.name,
                taxonomyElements: taxonomyResult.elements,
                placementConstraints,
                formatConstraints,
                language,
                optimizationGoal: phase?.optimizationGoal,
                phases: phase?.name ? [phase.name] : undefined,
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
              });
            }
          }
        }
      }

      setState(prev => ({ ...prev, structures, isProcessing: false }));
      return structures;
    } catch (error) {
      console.error('Error loading campaign structures:', error);
      toast.error('Failed to load campaign structure for this ActiPlan');
      setState(prev => ({ ...prev, isProcessing: false }));
      return [];
    }
  }, [user]);
  
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
      mediaType: creative.creativeType === 'video' ? 'video' : 'image' as AssetMediaType,
      technicalAttributes: {
        width: creative.width || 0,
        height: creative.height || 0,
        aspectRatio: creative.aspectRatio || '',
        duration: creative.durationSeconds,
        fileSize: creative.fileSizeBytes || 0,
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
          width = info.width; height = info.height; duration = info.duration;
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
          compatibilitySignals: {},
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
  }, []);

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

      // Step 2: For each structure, find fitting assets (only from valid assets)
      const structureResults: StructureMatchResult[] = [];
      const assignedAssetIds = new Set<string>();

      for (const structure of structuresToUse) {
        const assignedAssets: StructureMatchResult['assignedAssets'] = [];

        for (const asset of validAssets) {
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
            assignedAssetIds.add(asset.id);
          }
        }

        // Sort by confidence score descending
        assignedAssets.sort((a, b) => b.confidenceScore - a.confidenceScore);

        structureResults.push({
          structure,
          assignedAssets,
        });
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
          } else {
            if (inferredSignals.platform) {
              const platformExists = structuresToUse.some(s => s.platform === inferredSignals.platform);
              if (!platformExists) {
                reasons.push(`Platform "${inferredSignals.platform}" not in ActiPlan`);
              }
            }
            if (inferredSignals.market) {
              const marketExists = structuresToUse.some(s => s.market?.toUpperCase() === inferredSignals.market?.toUpperCase());
              if (!marketExists) {
                reasons.push(`Market "${inferredSignals.market}" not in ActiPlan`);
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
  }, [campaignId]);

  const acceptMatch = useCallback((assetId: string, match: UICreativeMatch) => {
    setState(prev => {
      const newAccepted = new Map(prev.acceptedMatches);
      newAccepted.set(assetId, match);
      return { ...prev, acceptedMatches: newAccepted };
    });
  }, []);

  const rejectMatch = useCallback((assetId: string, structureId: string) => {
    setState(prev => {
      const newRejected = new Map(prev.rejectedMatches);
      const existing = newRejected.get(assetId) || new Set();
      existing.add(structureId);
      newRejected.set(assetId, existing);
      return { ...prev, rejectedMatches: newRejected };
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

  const clearAcceptedMatch = useCallback((assetId: string) => {
    setState(prev => {
      const newAccepted = new Map(prev.acceptedMatches);
      newAccepted.delete(assetId);
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
    });
  }, []);

  const saveMatches = useCallback(async () => {
    if (!user || state.acceptedMatches.size === 0) { toast.error('No matches to save'); return; }
    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      const assignments: any[] = [];
      for (const [assetId, match] of state.acceptedMatches) {
        const asset = state.assets.find(a => a.id === assetId);
        if (!asset) continue;

        let creativeId: string;

        // Check if this is a library creative (already exists in DB)
        if (asset.sourceType === 'library' && (asset as any).libraryCreativeId) {
          creativeId = (asset as any).libraryCreativeId;
          
          // Update the existing creative with campaign assignment
          await supabase
            .from('creatives')
            .update({
              campaign_id: match.structure.campaignId,
              market: match.structure.market,
              phase_name: match.structure.phases?.[0],
              status: 'ready',
            })
            .eq('id', creativeId);
        } else {
          // Generate taxonomy-based name for the creative
          const taxonomyName = generateCreativeTaxonomyName(asset, match.structure);
          
          // Create new creative for uploaded files
          const { data: creative } = await supabase
            .from('creatives')
            .insert({
              name: taxonomyName,
              user_id: user.id,
              platform: match.structure.platform,
              creative_type: asset.mediaType === 'video' ? 'video' : 'image',
              status: 'ready',
              market: match.structure.market,
              phase_name: match.structure.phases?.[0],
              campaign_id: match.structure.campaignId,
              width: asset.technicalAttributes.width,
              height: asset.technicalAttributes.height,
              aspect_ratio: asset.technicalAttributes.aspectRatio,
              duration_seconds: asset.technicalAttributes.duration,
              file_size_bytes: asset.technicalAttributes.fileSize,
              original_filename: asset.fileName,
              language: asset.hardConstraints?.language,
            })
            .select().single();

          if (!creative) continue;
          creativeId = creative.id;
        }

        assignments.push({
          creative_id: creativeId,
          campaign_id: match.structure.campaignId,
          platform: match.structure.platform,
          market: match.structure.market || 'GLOBAL',
          phase_name: match.structure.phases?.[0] || 'default',
          assigned_by: user.id,
          status: 'pending',
        });
      }

      if (assignments.length > 0) {
        await supabase.from('creative_assignments').insert(assignments);
      }

      toast.success(`Saved ${assignments.length} creative assignments`);
      setState(prev => ({ ...prev, isProcessing: false, currentStep: 'complete' }));
    } catch (error) {
      console.error('Error saving matches:', error);
      toast.error('Failed to save matches');
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [user, state.acceptedMatches, state.assets]);

  const stats = useMemo(() => ({
    totalAssets: state.assets.length,
    matchedCount: state.results.filter(r => r.matches.length > 0).length,
    unmatchedCount: state.results.filter(r => r.matches.length === 0).length,
    acceptedCount: state.acceptedMatches.size,
    avgConfidence: state.results.length > 0 ? state.results.reduce((sum, r) => sum + (r.bestMatch?.confidenceScore || 0), 0) / state.results.length : 0,
    structureCount: state.structures.length,
  }), [state.assets, state.results, state.acceptedMatches, state.structures]);

  return { state, stats, loadCampaignStructures, processFiles, addLibraryCreatives, runMatching, acceptMatch, rejectMatch, clearRejection, clearAcceptedMatch, removeAsset, clearAll, saveMatches };
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
    if (/^(EN|ES|DE|FR|IT|JA|KO|PT|ZH|NL|PL|SV|NO|DA|FI)$/i.test(part)) constraints.language = part.toLowerCase();
    if (/^(A|B|C|CONTROL|TEST|VARIANT)/i.test(part)) constraints.variant = part;
  }
  return constraints;
}

function checkHardConstraints(assetConstraints: HardConstraints, structure: CampaignStructure): boolean {
  if (assetConstraints.market && structure.market && assetConstraints.market.toUpperCase() !== structure.market.toUpperCase()) return false;
  if (assetConstraints.language && structure.language && assetConstraints.language.toLowerCase() !== structure.language.toLowerCase()) return false;
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
    return { valid: false, reason: 'No dimensions detected in metadata' };
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
  const dimensionCheck = isValidAdDimensions(width, height, asset.mediaType, structure.platform);
  
  if (!dimensionCheck.valid) {
    blockingReasons.push(`Invalid ad dimensions: ${dimensionCheck.reason}`);
    return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
  }
  
  // Check if dimensions are compatible with this specific platform's ad formats
  const platformFormats = findCompatibleFormats(
    width || 0, 
    height || 0, 
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
    reason: `${exactMatch ? 'Exact' : 'Compatible'} format for ${structure.platform}: ${formatNames} (${width}x${height})` 
  });
  
  // Bonus score for exact dimension match
  if (exactMatch) {
    score += 10;
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
  
  // STRICT: Language must match if specified in structure
  // If ad set has a language requirement, asset MUST have matching language - no exceptions
  if (structure.language) {
    const structureLang = structure.language.toLowerCase();
    const assetLang = signals.language?.toLowerCase();
    
    if (!assetLang) {
      // Ad set requires a language but asset has no language signal - BLOCK
      blockingReasons.push(`Language required: ad set requires "${structureLang.toUpperCase()}" but asset has no language specified in filename`);
      return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
    }
    
    if (assetLang !== structureLang) {
      // Language mismatch - BLOCK
      blockingReasons.push(`Language mismatch: asset is "${assetLang.toUpperCase()}" but ad set requires "${structureLang.toUpperCase()}"`);
      return { isMatch: false, score: 0, matchedCriteria, blockingReasons, issues };
    }
    
    // Languages match
    matchedCriteria.push({ criterion: 'Language', reason: `"${assetLang.toUpperCase()}" matches (${signals.sources.language})` });
    score += 10;
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

  // Device match
  if (signals.device && structure.deviceConstraints?.length) {
    if (structure.deviceConstraints.includes(signals.device)) {
      matchedCriteria.push({ criterion: 'Device', reason: `"${signals.device}" matches targeting (${signals.sources.device})` });
      score += 8;
    } else {
      issues.push({ type: 'device', severity: 'warning', message: `Device "${signals.device}" not in ad set targeting` });
      score -= 10;
    }
  }

  // Gender match
  if (signals.gender && structure.genderConstraint && structure.genderConstraint !== 'all') {
    if (signals.gender === structure.genderConstraint || signals.gender === 'all') {
      matchedCriteria.push({ criterion: 'Gender', reason: `"${signals.gender}" matches (${signals.sources.gender})` });
      score += 8;
    } else {
      issues.push({ type: 'gender', severity: 'error', message: `Gender "${signals.gender}" ≠ "${structure.genderConstraint}"` });
      score -= 15;
    }
  }

  // Audience type match
  if (signals.audienceType && structure.audienceTypeConstraint) {
    if (signals.audienceType === structure.audienceTypeConstraint) {
      matchedCriteria.push({ criterion: 'Audience', reason: `"${signals.audienceType}" matches (${signals.sources.audienceType})` });
      score += 10;
    } else {
      issues.push({ type: 'audience', severity: 'warning', message: `Audience "${signals.audienceType}" ≠ "${structure.audienceTypeConstraint}"` });
      score -= 8;
    }
  }

  // Aspect ratio check for video platforms
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

  // Consider it a match if score is above threshold and no blocking reasons
  const isMatch = blockingReasons.length === 0 && score >= 50;
  
  return { isMatch, score: Math.max(0, Math.min(100, score)), matchedCriteria, blockingReasons, issues };
}
