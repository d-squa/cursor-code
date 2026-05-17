// Hook for managing Creative Mesh workflow progress
// Persists state across sessions via Supabase

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSampleMode } from '@/contexts/SampleModeContext';

export type MeshStep = 'actiplan' | 'source' | 'mesh' | 'content' | 'complete';
export type CreativeSource = 'upload' | 'page_assets' | 'ad_account_assets';

export interface SelectedAsset {
  id: string;
  source: CreativeSource;
  platform: 'meta' | 'tiktok' | 'google';
  assetType: 'image' | 'video';
  thumbnailUrl?: string;
  name?: string;
  relativePath?: string;
  postId?: string; // For page assets
  platformAssetId?: string; // For ad account assets
  // File object for uploads - not persisted but needed for processFiles
  file?: File;
  // Organic post fields
  pageId?: string;
  pageName?: string;
  message?: string;
  permalink?: string;
  // Media dimensions when available from platform API
  width?: number;
  height?: number;
}

export interface MeshProgress {
  campaignId: string;
  campaignName: string;
  platform: 'meta' | 'tiktok' | 'google';
  currentStep: MeshStep;
  selectedAssets: SelectedAsset[];
  meshedCreativeIds: string[];
  completedAt?: string;
}

interface UseCreativeMeshProgressReturn {
  progress: MeshProgress | null;
  isLoading: boolean;
  currentStep: MeshStep;
  // Step 1: ActiPlan & Platform
  selectActiPlan: (campaignId: string, campaignName: string, platforms: string[]) => void;
  selectPlatform: (platform: 'meta' | 'tiktok' | 'google') => void;
  // Step 2: Creative Source
  addAsset: (asset: SelectedAsset) => void;
  removeAsset: (assetId: string) => void;
  clearAssets: () => void;
  // Step 3: Mesh
  setMeshedCreativeIds: (ids: string[]) => void;
  // Navigation
  goToStep: (step: MeshStep) => void;
  reset: () => void;
  // Persistence
  saveProgress: () => Promise<void>;
  loadProgress: (campaignId: string) => Promise<void>;
}

export function useCreativeMeshProgress(initialCampaignId?: string): UseCreativeMeshProgressReturn {
  const { user } = useAuth();
  const { isSampleMode } = useSampleMode();
  const [progress, setProgress] = useState<MeshProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get current step
  const currentStep: MeshStep = progress?.currentStep || 'actiplan';

  // Auto-save on progress changes (debounced)
  useEffect(() => {
    if (!progress || !user) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveProgress();
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [progress, user]);

  // Load initial progress if campaign ID provided
  useEffect(() => {
    if (initialCampaignId && user) {
      loadProgress(initialCampaignId);
    }
  }, [initialCampaignId, user, isSampleMode]);

  const selectActiPlan = useCallback((campaignId: string, campaignName: string, platforms: string[]) => {
    const normalizedPlatforms = platforms.map(p => {
      const lower = p.toLowerCase();
      if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) return 'meta';
      if (lower.includes('tiktok')) return 'tiktok';
      if (lower.includes('google')) return 'google';
      return lower;
    }).filter((p): p is 'meta' | 'tiktok' | 'google' => p === 'meta' || p === 'tiktok' || p === 'google');

    const uniquePlatforms = [...new Set(normalizedPlatforms)];

    setProgress(prev => ({
      campaignId,
      campaignName,
      platform: uniquePlatforms.length === 1 ? uniquePlatforms[0] : (prev?.platform || 'meta'),
      currentStep: uniquePlatforms.length === 1 ? 'source' : 'actiplan',
      selectedAssets: [],
      meshedCreativeIds: [],
    }));

    // If only one platform, auto-select and move to source step
    if (uniquePlatforms.length === 1) {
      setProgress(prev => prev ? { ...prev, currentStep: 'source' } : null);
    }
  }, []);

  const selectPlatform = useCallback((platform: 'meta' | 'tiktok' | 'google') => {
    setProgress(prev => prev ? {
      ...prev,
      platform,
      currentStep: 'source',
      selectedAssets: prev.selectedAssets.filter(a => a.platform === platform),
    } : null);
  }, []);

  const addAsset = useCallback((asset: SelectedAsset) => {
    setProgress(prev => {
      if (!prev) return null;
      // Avoid duplicates
      const exists = prev.selectedAssets.some(a => a.id === asset.id);
      if (exists) return prev;
      return {
        ...prev,
        selectedAssets: [...prev.selectedAssets, asset],
      };
    });
  }, []);

  const removeAsset = useCallback((assetId: string) => {
    setProgress(prev => prev ? {
      ...prev,
      selectedAssets: prev.selectedAssets.filter(a => a.id !== assetId),
    } : null);
  }, []);

  const clearAssets = useCallback(() => {
    setProgress(prev => prev ? {
      ...prev,
      selectedAssets: [],
    } : null);
  }, []);

  const setMeshedCreativeIds = useCallback((ids: string[]) => {
    setProgress(prev => prev ? {
      ...prev,
      meshedCreativeIds: ids,
      currentStep: 'content',
    } : null);
  }, []);

  const goToStep = useCallback((step: MeshStep) => {
    setProgress(prev => prev ? { ...prev, currentStep: step } : null);
  }, []);

  const reset = useCallback(() => {
    setProgress(null);
  }, []);

  const saveProgress = useCallback(async () => {
    if (!progress || !user) return;

    try {
      // Store progress in campaign's generic_config or a dedicated field
      const { data: existingCampaign, error: fetchError } = await supabase
        .from('campaigns')
        .select('generic_config')
        .eq('id', progress.campaignId)
        .single();

      if (fetchError) {
        console.error('Failed to fetch existing mesh progress config:', fetchError);
        return;
      }

      const existingConfig = (existingCampaign?.generic_config as Record<string, any> | null) || {};

      const { error } = await supabase
        .from('campaigns')
        .update({
          generic_config: {
            ...existingConfig,
            meshProgress: {
              currentStep: progress.currentStep,
              platform: progress.platform,
              selectedAssetIds: progress.selectedAssets.map(a => `${a.source}:${a.id}`),
              meshedCreativeIds: progress.meshedCreativeIds,
              lastUpdated: new Date().toISOString(),
            },
          },
        })
        .eq('id', progress.campaignId);

      if (error) {
        console.error('Failed to save mesh progress:', error);
      }
    } catch (error) {
      console.error('Error saving mesh progress:', error);
    }
  }, [progress, user]);

  const loadProgress = useCallback(async (campaignId: string) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, platforms, generic_config, is_sample')
        .eq('id', campaignId)
        .single();

      if (error) {
        console.error('Failed to load mesh progress:', error);
        setIsLoading(false);
        return;
      }

      if (!!data.is_sample !== isSampleMode) {
        setProgress(null);
        setIsLoading(false);
        return;
      }

      const platforms = Array.isArray(data.platforms) 
        ? data.platforms.map((p: any) => typeof p === 'string' ? p : p.id || p.name || 'unknown')
        : [];

      const genericConfig = data.generic_config as any;
      const savedMeshProgress = genericConfig?.meshProgress;

      // Restore progress if exists
      if (savedMeshProgress) {
        setProgress({
          campaignId: data.id,
          campaignName: data.name,
          platform: savedMeshProgress.platform || 'meta',
          currentStep: savedMeshProgress.currentStep || 'source',
          selectedAssets: [], // Assets will need to be re-fetched from IDs
          meshedCreativeIds: savedMeshProgress.meshedCreativeIds || [],
        });
      } else {
        // Initialize fresh progress
        selectActiPlan(data.id, data.name, platforms);
      }
    } catch (error) {
      console.error('Error loading mesh progress:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, selectActiPlan, isSampleMode]);

  return {
    progress,
    isLoading,
    currentStep,
    selectActiPlan,
    selectPlatform,
    addAsset,
    removeAsset,
    clearAssets,
    setMeshedCreativeIds,
    goToStep,
    reset,
    saveProgress,
    loadProgress,
  };
}
