import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
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
  const [usedToday, setUsedToday] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchTodayCount = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      // Count campaigns pushed to DSP today (status pushed_to_dsp, live, or partially_pushed)
      // We check published_at for when the campaign was actually pushed
      const { count, error } = await supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['pushed_to_dsp', 'live', 'partially_pushed'])
        .gte('published_at', todayStart)
        .lte('published_at', todayEnd);

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
  }, [user?.id]);

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
    loading,
    refetch: fetchTodayCount,
  };
}
