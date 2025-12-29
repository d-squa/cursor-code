// Hook for creative-to-plan matching workflow
import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { HardConstraints, SupportedPlatform, AssetMediaType } from '@/types/creativeMatching';
import { generateAdTaxonomyName, AD_TAXONOMY_MAPPINGS, createShortCode } from '@/utils/taxonomyUtils';

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

export interface MatchingState {
  assets: DigestedAsset[];
  structures: CampaignStructure[];
  results: UIMatchingResult[];
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
                const adSetStructure: CampaignStructure = {
                  id: `${campaignIdToLoad}-${platformKey}-${market?.id ?? market?.name ?? 'market'}-${phase?.name ?? 'phase'}-${adSet.id}`,
                  ...baseStructureData,
                  adSetId: adSet.id,
                  adSetName: `${market?.name ?? 'Market'} - ${phase?.name ?? 'Phase'} - ${adSet.name}`,
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
              // No splits - create single structure from phase
              structures.push({
                id: `${campaignIdToLoad}-${platformKey}-${market?.id ?? market?.name ?? 'market'}-${phase?.name ?? 'phase'}`,
                ...baseStructureData,
                adSetId: market?.id,
                adSetName: `${market?.name ?? 'Market'} - ${phase?.name ?? 'Phase'}`,
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

  // Process uploaded files
  const processFiles = useCallback(async (files: File[]) => {
    setState(prev => ({ ...prev, isProcessing: true, currentStep: 'digest' }));
    const digestedAssets: DigestedAsset[] = [];

    for (const file of files) {
      try {
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

  // Run the matching algorithm - compares creatives against ALL ad set configurations
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

      const results: UIMatchingResult[] = prev.assets.map(asset => {
        const matches: UICreativeMatch[] = [];
        
        // Extract signals from filename/path for inference
        const inferredSignals = extractInferredSignals(asset.filePath, asset.fileName);
        
        for (const structure of structuresToUse) {
          // Hard constraint check with inference support
          const hardCheckResult = checkHardConstraintsEnhanced(
            asset.hardConstraints,
            structure,
            { isSingleMarketPlan, isSinglePlatformPlan, inferredSignals }
          );
          
          if (!hardCheckResult.passed && hardCheckResult.failures.length > 0) {
            continue; // Skip this structure - hard constraint failed
          }
          
          // Soft compatibility scoring with all ad set dimensions
          let score = 80;
          const reasoning: string[] = [];
          const issues: UICreativeMatch['compatibilityIssues'] = [];
          
          // Add any hard constraint notes
          hardCheckResult.notes.forEach(note => reasoning.push(note));
          
          // Apply inference penalty if used
          if (hardCheckResult.inferenceUsed) {
            score -= 5;
            reasoning.push('Some constraints inferred from filename');
          }
          
          // 1. Platform match (check inferred platform too)
          const platformMatch = inferredSignals.platform === structure.platform;
          if (platformMatch) {
            score += 10;
            reasoning.push(`Platform ${structure.platform} matches filename signal`);
          } else if (asset.compatibilitySignals?.platform === structure.platform) {
            score += 10;
            reasoning.push(`Compatible with ${structure.platform}`);
          } else {
            reasoning.push(`Assumed compatible with ${structure.platform}`);
          }
          
          // 2. Aspect ratio check
          if (asset.technicalAttributes.aspectRatio) {
            const isVertical = (asset.technicalAttributes.height || 0) > (asset.technicalAttributes.width || 0);
            if (structure.platform === 'tiktok' || structure.platform === 'snapchat') {
              if (isVertical) { score += 10; reasoning.push('Vertical format preferred'); }
              else { score -= 10; issues.push({ type: 'aspect_ratio', severity: 'warning', message: 'Vertical format recommended', platform: structure.platform }); }
            }
          }
          
          // 3. Duration check for video
          if (asset.technicalAttributes.duration) {
            if (structure.platform === 'tiktok' && asset.technicalAttributes.duration > 60) {
              score -= 20; issues.push({ type: 'duration', severity: 'error', message: 'Video exceeds 60s limit', platform: 'tiktok' });
            }
          }
          
          // 4. Device constraint check
          if (structure.deviceConstraints && structure.deviceConstraints.length > 0) {
            if (inferredSignals.device) {
              if (structure.deviceConstraints.includes(inferredSignals.device)) {
                score += 8;
                reasoning.push(`Device ${inferredSignals.device} matches ad set target`);
              } else {
                score -= 15;
                issues.push({ type: 'device' as any, severity: 'warning', message: `Creative for ${inferredSignals.device}, ad set targets ${structure.deviceConstraints.join(', ')}` });
              }
            }
          }
          
          // 5. Gender constraint check
          if (structure.genderConstraint && structure.genderConstraint !== 'all') {
            if (inferredSignals.gender) {
              if (inferredSignals.gender === structure.genderConstraint || inferredSignals.gender === 'all') {
                score += 8;
                reasoning.push(`Gender targeting matches: ${structure.genderConstraint}`);
              } else {
                score -= 20;
                issues.push({ type: 'gender' as any, severity: 'error', message: `Creative for ${inferredSignals.gender}, ad set targets ${structure.genderConstraint}` });
              }
            }
          }
          
          // 6. Age constraint check
          if (structure.ageConstraints && inferredSignals.ageMin !== undefined) {
            const ageOverlap = checkAgeOverlap(
              { min: inferredSignals.ageMin, max: inferredSignals.ageMax || 65 },
              structure.ageConstraints
            );
            if (ageOverlap) {
              score += 8;
              reasoning.push(`Age bracket overlaps with ad set: ${structure.ageConstraints.min}-${structure.ageConstraints.max}`);
            } else {
              score -= 15;
              issues.push({ type: 'age' as any, severity: 'warning', message: `Creative age ${inferredSignals.ageMin}-${inferredSignals.ageMax} doesn't match ${structure.ageConstraints.min}-${structure.ageConstraints.max}` });
            }
          }
          
          // 7. Audience type check
          if (structure.audienceTypeConstraint) {
            if (inferredSignals.audienceType) {
              if (inferredSignals.audienceType === structure.audienceTypeConstraint) {
                score += 10;
                reasoning.push(`Audience type matches: ${structure.audienceTypeConstraint}`);
              } else {
                score -= 12;
                issues.push({ type: 'audience' as any, severity: 'warning', message: `Creative for ${inferredSignals.audienceType}, ad set uses ${structure.audienceTypeConstraint}` });
              }
            }
          }
          
          // 8. Optimization goal check
          if (structure.optimizationGoal) {
            if (inferredSignals.optimizationGoal) {
              if (inferredSignals.optimizationGoal === structure.optimizationGoal) {
                score += 10;
                reasoning.push(`Optimization goal matches: ${structure.optimizationGoal}`);
              } else {
                score -= 10;
                issues.push({ type: 'objective', severity: 'warning', message: `Creative for ${inferredSignals.optimizationGoal}, ad set optimizes for ${structure.optimizationGoal}`, suggestion: 'Consider if creative messaging aligns with goal' });
              }
            }
          }
          
          // 9. Placement check (from inferred signals)
          if (structure.placementConstraints && structure.placementConstraints.length > 0) {
            if (inferredSignals.placement) {
              const placementMatch = structure.placementConstraints.some(p => 
                p.toLowerCase().includes(inferredSignals.placement!) || 
                inferredSignals.placement!.includes(p.toLowerCase())
              );
              if (placementMatch) {
                score += 8;
                reasoning.push(`Placement ${inferredSignals.placement} matches ad set`);
              }
            }
          }
          
          matches.push({ 
            structure, 
            confidenceScore: Math.max(0, Math.min(100, score)), 
            reasoning, 
            compatibilityIssues: issues, 
            hardConstraintsMet: hardCheckResult.passed 
          });
        }
        
        // Sort by confidence score descending
        matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
        
        // Generate no-match reasons if empty
        const noMatchReasons: string[] = [];
        if (matches.length === 0) {
          if (asset.hardConstraints.market) {
            noMatchReasons.push(`No structures found for market: ${asset.hardConstraints.market}`);
          }
          if (asset.hardConstraints.language) {
            noMatchReasons.push(`No structures found for language: ${asset.hardConstraints.language}`);
          }
          if (inferredSignals.platform && !structuresToUse.some(s => s.platform === inferredSignals.platform)) {
            noMatchReasons.push(`Platform ${inferredSignals.platform} inferred from filename not in ActiPlan`);
          }
          if (noMatchReasons.length === 0) {
            noMatchReasons.push('No compatible structures found');
          }
        }
        
        return {
          assetId: asset.id,
          matches,
          bestMatch: matches[0],
          noMatchReasons: matches.length === 0 ? noMatchReasons : undefined,
        };
      });

      // Also update structures if override was provided
      return { 
        ...prev, 
        structures: structuresToUse,
        results, 
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

  return { state, stats, loadCampaignStructures, processFiles, addLibraryCreatives, runMatching, acceptMatch, rejectMatch, clearRejection, removeAsset, clearAll, saveMatches };
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
