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

    let intervalId: NodeJS.Timeout;
    let mounted = true;

    const poll = async () => {
      const newProgress = await fetchProgress();
      if (!mounted) return;

      setProgress(newProgress);

      // Stop polling if completed or error
      if (newProgress?.status === 'completed' || newProgress?.status === 'error') {
        setIsPolling(false);
        if (intervalId) clearInterval(intervalId);
      }
    };

    // Initial fetch
    poll();
    setIsPolling(true);

    // Poll every 1.5 seconds
    intervalId = setInterval(poll, 1500);

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [platformId, fetchProgress]);

  return { progress, isPolling, refetch: fetchProgress };
}

// Backwards compatibility alias
export const useTikTokSyncProgress = usePlatformSyncProgress;
