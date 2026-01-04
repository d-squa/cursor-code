// Hook for managing creatives in the Creative Library
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { 
  Creative, 
  CreativeFilters, 
  CreativeAssignment,
  BulkCreativeAction,
  Platform 
} from '@/types/creative';
import { dbRowToCreative, creativeToDbInsert } from '@/types/creative';

export function useCreatives(
  filters?: CreativeFilters,
  options?: {
    enabled?: boolean;
  }
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const enabled = options?.enabled ?? true;

  // Fetch creatives with filters
  const { data: creatives = [], isLoading, error, refetch } = useQuery({
    queryKey: ['creatives', filters, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      let query = supabase
        .from('creatives')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.platforms?.length) {
        query = query.in('platform', filters.platforms);
      }
      if (filters?.markets?.length) {
        query = query.in('market', filters.markets);
      }
      if (filters?.phases?.length) {
        query = query.in('phase_name', filters.phases);
      }
      if (filters?.statuses?.length) {
        query = query.in('status', filters.statuses);
      }
      if (filters?.types?.length) {
        query = query.in('creative_type', filters.types);
      }
      if (filters?.campaignId) {
        query = query.eq('campaign_id', filters.campaignId);
      }
      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((row) => dbRowToCreative(row as Record<string, unknown>));
    },
    enabled: enabled && !!user?.id,
  });

  // Create creative mutation
  const createCreativeMutation = useMutation({
    mutationFn: async (creative: Partial<Creative> & { name: string; platform: Platform }) => {
      if (!user?.id) throw new Error('Not authenticated');
      
      const insertData = creativeToDbInsert({ ...creative, userId: user.id });
      const { data, error } = await supabase
        .from('creatives')
        .insert(insertData as any)
        .select()
        .single();
      
      if (error) throw error;
      return dbRowToCreative(data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
    },
  });

  // Update creative mutation
  const updateCreativeMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Creative> }) => {
      const updateData: Record<string, unknown> = {};
      
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.market !== undefined) updateData.market = updates.market;
      if (updates.phaseName !== undefined) updateData.phase_name = updates.phaseName;
      if (updates.optimizationGoal !== undefined) updateData.optimization_goal = updates.optimizationGoal;
      if (updates.primaryText !== undefined) updateData.primary_text = updates.primaryText;
      if (updates.headline !== undefined) updateData.headline = updates.headline;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.caption !== undefined) updateData.caption = updates.caption;
      if (updates.callToAction !== undefined) updateData.call_to_action = updates.callToAction;
      if (updates.destinationUrl !== undefined) updateData.destination_url = updates.destinationUrl;
      if (updates.mediaUrls !== undefined) updateData.media_urls = updates.mediaUrls;
      if (updates.validationErrors !== undefined) updateData.validation_errors = updates.validationErrors;

      const { data, error } = await supabase
        .from('creatives')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return dbRowToCreative(data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
    },
  });

  // Delete creative mutation
  const deleteCreativeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('creatives')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
      toast.success('Creative deleted');
    },
  });

  // Bulk action mutation
  const bulkActionMutation = useMutation({
    mutationFn: async (action: BulkCreativeAction) => {
      if (!user?.id) throw new Error('Not authenticated');

      switch (action.type) {
        case 'delete':
          const { error: deleteError } = await supabase
            .from('creatives')
            .delete()
            .in('id', action.creativeIds);
          if (deleteError) throw deleteError;
          break;

        case 'update_status':
          if (!action.newStatus) throw new Error('Status required');
          const { error: statusError } = await supabase
            .from('creatives')
            .update({ status: action.newStatus })
            .in('id', action.creativeIds);
          if (statusError) throw statusError;
          break;

        case 'update_mapping':
          const mappingUpdates: Record<string, unknown> = {};
          if (action.targetPlatform) mappingUpdates.platform = action.targetPlatform;
          if (action.targetMarket) mappingUpdates.market = action.targetMarket;
          if (action.targetPhase) mappingUpdates.phase_name = action.targetPhase;
          
          const { error: mappingError } = await supabase
            .from('creatives')
            .update(mappingUpdates)
            .in('id', action.creativeIds);
          if (mappingError) throw mappingError;
          break;

        case 'duplicate':
          // Fetch originals and duplicate
          const { data: originals, error: fetchError } = await supabase
            .from('creatives')
            .select('*')
            .in('id', action.creativeIds);
          if (fetchError) throw fetchError;

          const duplicates = (originals || []).map(orig => ({
            ...orig,
            id: undefined,
            name: `${orig.name} (Copy)`,
            status: 'draft' as const,
            platform: action.targetPlatform || orig.platform,
            market: action.targetMarket || orig.market,
            phase_name: action.targetPhase || orig.phase_name,
            created_at: undefined,
            updated_at: undefined as any,
          }));

          const { error: insertError } = await supabase
            .from('creatives')
            .insert(duplicates);
          if (insertError) throw insertError;
          break;

        case 'move':
          const moveUpdates: Record<string, unknown> = {};
          if (action.targetPlatform) moveUpdates.platform = action.targetPlatform;
          if (action.targetMarket) moveUpdates.market = action.targetMarket;
          if (action.targetPhase) moveUpdates.phase_name = action.targetPhase;
          
          const { error: moveError } = await supabase
            .from('creatives')
            .update(moveUpdates)
            .in('id', action.creativeIds);
          if (moveError) throw moveError;
          break;
      }
    },
    onSuccess: (_, action) => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
      toast.success(`${action.type} completed for ${action.creativeIds.length} creative(s)`);
    },
    onError: (error) => {
      toast.error(`Bulk action failed: ${error.message}`);
    },
  });

  // Upload file to storage
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    if (!user?.id) throw new Error('Not authenticated');

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('creative-assets')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('creative-assets')
      .getPublicUrl(fileName);

    return publicUrl;
  }, [user?.id]);

  return {
    creatives,
    isLoading,
    error,
    refetch,
    createCreative: createCreativeMutation.mutateAsync,
    updateCreative: updateCreativeMutation.mutateAsync,
    deleteCreative: deleteCreativeMutation.mutateAsync,
    bulkAction: bulkActionMutation.mutateAsync,
    uploadFile,
    isCreating: createCreativeMutation.isPending,
    isUpdating: updateCreativeMutation.isPending,
    isDeleting: deleteCreativeMutation.isPending,
  };
}

// Hook for creative assignments
export function useCreativeAssignments(campaignId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['creative-assignments', campaignId, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      let query = supabase
        .from('creative_assignments')
        .select(`
          *,
          creative:creatives(*)
        `);

      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const assignCreativeMutation = useMutation({
    mutationFn: async (assignment: Omit<CreativeAssignment, 'id' | 'assignedAt'>) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('creative_assignments')
        .upsert({
          creative_id: assignment.creativeId,
          campaign_id: assignment.campaignId,
          platform: assignment.platform,
          market: assignment.market,
          phase_name: assignment.phaseName,
          assigned_by: user.id,
          position: assignment.position,
          status: assignment.status || 'pending',
        }, {
          onConflict: 'creative_id,campaign_id,platform,market,phase_name',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-assignments'] });
      toast.success('Creative assigned');
    },
  });

  const unassignCreativeMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('creative_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-assignments'] });
    },
  });

  return {
    assignments,
    isLoading,
    assignCreative: assignCreativeMutation.mutateAsync,
    unassignCreative: unassignCreativeMutation.mutateAsync,
  };
}
