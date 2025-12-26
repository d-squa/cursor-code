import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useWorkspace } from '@/hooks/useWorkspace';
import { startOfDay, endOfDay } from 'date-fns';

interface ActiplanLimitsResult {
  dailyLimit: number;
  usedToday: number;
  remaining: number;
  canCreate: boolean; // Now refers to DSP push, not creation
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useActiplanLimits(): ActiplanLimitsResult {
  const { user } = useAuth();
  const { actiplanDailyLimit, tier } = useFeatureAccess();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const [usedToday, setUsedToday] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchTodayCount = useCallback(async () => {
    if (!user?.id || workspaceLoading) {
      setLoading(false);
      return;
    }

    try {
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      // Count campaigns pushed to DSP today for the active workspace (team)
      // This ensures all team members share the same daily limit pool
      let query = supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pushed_to_dsp', 'live'])
        .gte('published_at', todayStart)
        .lte('published_at', todayEnd);

      if (activeWorkspaceId) {
        // Count by team_id when in a workspace context
        query = query.eq('team_id', activeWorkspaceId);
      } else {
        // Fallback to user_id if no workspace context (shouldn't happen normally)
        query = query.eq('user_id', user.id);
      }

      const { count, error } = await query;

      if (error) {
        console.error('Error fetching DSP push count:', error);
        return;
      }

      setUsedToday(count || 0);
    } catch (error) {
      console.error('Error in fetchTodayCount:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeWorkspaceId, workspaceLoading]);

  useEffect(() => {
    fetchTodayCount();
  }, [fetchTodayCount]);

  const remaining = Math.max(0, actiplanDailyLimit - usedToday);
  const canCreate = actiplanDailyLimit === Infinity || usedToday < actiplanDailyLimit;

  return {
    dailyLimit: actiplanDailyLimit,
    usedToday,
    remaining,
    canCreate,
    loading: loading || workspaceLoading,
    refetch: fetchTodayCount,
  };
}
