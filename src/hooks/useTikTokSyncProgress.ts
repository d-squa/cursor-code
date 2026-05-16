import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PlatformSyncProgress {
  status: 'pending' | 'syncing' | 'completed' | 'error';
  platform: 'tiktok' | 'meta';
  totalSteps: number;
  currentStep: number;
  currentAssetType?: string;
  currentAssetName?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  lastProgressAt?: string;
  // Detailed counts
  processedCounts?: {
    adAccounts?: number;
    pixels?: number;
    pages?: number;
    instagramAccounts?: number;
    catalogs?: number;
    productSets?: number;
    conversionEvents?: number;
    identities?: number;
  };
}

// For backwards compatibility
export type TikTokSyncProgress = PlatformSyncProgress;

export function usePlatformSyncProgress(platformId: string | null) {
  const [progress, setProgress] = useState<PlatformSyncProgress | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const fetchProgress = useCallback(async () => {
    if (!platformId) return null;

    const { data, error } = await supabase
      .from('connected_platforms_safe')
      .select('metadata')
      .eq('id', platformId)
      .single();

    if (error || !data) return null;

    const metadata = data.metadata as any;
    if (!metadata?.sync_progress) return null;

    return metadata.sync_progress as PlatformSyncProgress;
  }, [platformId]);

  // Start polling when platformId is set
  useEffect(() => {
    if (!platformId) {
      setProgress(null);
      setIsPolling(false);
      return;
    }

    let intervalId: ReturnType<typeof setInterval>;
    let mounted = true;
    let consecutiveNulls = 0;
    const MAX_CONSECUTIVE_NULLS = 3;

    const poll = async () => {
      const newProgress = await fetchProgress();
      if (!mounted) return;

      if (newProgress === null) {
        consecutiveNulls++;
        // If we get multiple nulls in a row, the sync might not have started yet
        if (consecutiveNulls >= MAX_CONSECUTIVE_NULLS) {
          console.log('[usePlatformSyncProgress] No sync progress found after multiple attempts');
        }
        return; // Don't update state with null, keep previous progress
      }

      consecutiveNulls = 0;
      setProgress(newProgress);

      // Stop polling if completed or error
      if (newProgress.status === 'completed' || newProgress.status === 'error') {
        console.log('[usePlatformSyncProgress] Sync finished with status:', newProgress.status);
        setIsPolling(false);
        if (intervalId) clearInterval(intervalId);
      }
    };

    // Initial fetch
    poll();
    setIsPolling(true);

    // Poll every 1 second for faster updates
    intervalId = setInterval(poll, 1000);

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [platformId, fetchProgress]);

  return { progress, isPolling, refetch: fetchProgress };
}

// Backwards compatibility alias
export const useTikTokSyncProgress = usePlatformSyncProgress;
