// Hook for creative-to-plan matching workflow
import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { HardConstraints, SupportedPlatform, AssetMediaType } from '@/types/creativeMatching';

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

  // Load campaign structures from an ActiPlan
  const loadCampaignStructures = useCallback(async (campaignIdToLoad: string) => {
    if (!user) return;
    setState(prev => ({ ...prev, isProcessing: true }));
    
    try {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignIdToLoad)
        .single();

      if (error) throw error;

      const structures: CampaignStructure[] = [];
      const platforms = campaign.platforms as any[] || [];

      for (const platform of platforms) {
        const platformId = platform.id?.toLowerCase() as SupportedPlatform;
        const markets = platform.markets || [];

        for (const market of markets) {
          const phases = market.phases || [];
          for (const phase of phases) {
            structures.push({
              id: `${campaignIdToLoad}-${platform.id}-${market.id}-${phase.name}`,
              campaignId: campaignIdToLoad,
              campaignName: campaign.name,
              platform: platformId,
              adSetId: market.id,
              adSetName: `${market.name} - ${phase.name}`,
              objective: campaign.objective,
              market: market.name,
              language: market.languages?.[0],
              placementConstraints: market.publisherPlatforms || [],
              formatConstraints: market.adFormats || [],
              optimizationGoal: phase.optimizationGoal,
              phases: [phase.name],
            });
          }
        }
      }

      setState(prev => ({ ...prev, structures, isProcessing: false }));
      return structures;
    } catch (error) {
      console.error('Error loading campaign structures:', error);
      toast.error('Failed to load campaign structures');
      setState(prev => ({ ...prev, isProcessing: false }));
      return [];
    }
  }, [user]);

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

  // Run the matching algorithm
  const runMatching = useCallback(() => {
    setState(prev => {
      if (prev.assets.length === 0 || prev.structures.length === 0) {
        toast.error('Please upload assets and load a campaign first');
        return prev;
      }

      const results: UIMatchingResult[] = prev.assets.map(asset => {
        const matches: UICreativeMatch[] = [];
        
        for (const structure of prev.structures) {
          // Hard constraint check
          const hardConstraintsMet = checkHardConstraints(asset.hardConstraints, structure);
          if (!hardConstraintsMet && (asset.hardConstraints.market || asset.hardConstraints.language || asset.hardConstraints.variant)) {
            continue;
          }
          
          // Soft compatibility scoring
          let score = 80;
          const reasoning: string[] = [];
          const issues: UICreativeMatch['compatibilityIssues'] = [];
          
          // Platform match
          reasoning.push(`Compatible with ${structure.platform}`);
          
          // Aspect ratio check
          if (asset.technicalAttributes.aspectRatio) {
            const isVertical = (asset.technicalAttributes.height || 0) > (asset.technicalAttributes.width || 0);
            if (structure.platform === 'tiktok' || structure.platform === 'snapchat') {
              if (isVertical) { score += 10; reasoning.push('Vertical format preferred'); }
              else { score -= 10; issues.push({ type: 'aspect_ratio', severity: 'warning', message: 'Vertical format recommended' }); }
            }
          }
          
          // Duration check for video
          if (asset.technicalAttributes.duration && structure.platform === 'tiktok') {
            if (asset.technicalAttributes.duration > 60) {
              score -= 20; issues.push({ type: 'duration', severity: 'error', message: 'Video exceeds 60s limit' });
            }
          }
          
          matches.push({ structure, confidenceScore: Math.max(0, Math.min(100, score)), reasoning, compatibilityIssues: issues, hardConstraintsMet });
        }
        
        matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
        
        return {
          assetId: asset.id,
          matches,
          bestMatch: matches[0],
          noMatchReasons: matches.length === 0 ? ['No compatible structures found'] : undefined,
        };
      });

      return { ...prev, results, currentStep: 'review' as const };
    });
  }, []);

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

        const { data: creative } = await supabase
          .from('creatives')
          .insert({
            name: asset.fileName,
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
          })
          .select().single();

        if (creative) {
          assignments.push({
            creative_id: creative.id,
            campaign_id: match.structure.campaignId,
            platform: match.structure.platform,
            market: match.structure.market || 'GLOBAL',
            phase_name: match.structure.phases?.[0] || 'default',
            assigned_by: user.id,
            status: 'pending',
          });
        }
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

  return { state, stats, loadCampaignStructures, processFiles, runMatching, acceptMatch, rejectMatch, clearRejection, removeAsset, clearAll, saveMatches };
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
