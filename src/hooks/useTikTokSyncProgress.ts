import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TikTokSyncProgress {
  status: 'pending' | 'syncing' | 'completed' | 'error';
  totalAdvertisers: number;
  processedAdvertisers: number;
  currentAdvertiserName?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export function useTikTokSyncProgress(platformId: string | null) {
  const [progress, setProgress] = useState<TikTokSyncProgress | null>(null);
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

    return metadata.sync_progress as TikTokSyncProgress;
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
