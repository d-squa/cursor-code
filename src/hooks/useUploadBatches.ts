// Hook for managing upload batches with resume capability
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface UploadBatch {
  id: string;
  userId: string;
  importType: string;
  sourceFilename: string | null;
  status: 'in_progress' | 'completed' | 'failed' | 'paused';
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  errorLog: Array<{ filename: string; error: string }>;
  pendingFiles: Array<{
    path: string;
    platform: string;
    market?: string;
    phase?: string;
  }>;
  createdAt: string;
  completedAt: string | null;
}

export function useUploadBatches() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch incomplete batches
  const { data: incompleteBatches = [], isLoading, refetch } = useQuery({
    queryKey: ['upload-batches', 'incomplete', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('creative_import_batches')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['in_progress', 'paused'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((row): UploadBatch => ({
        id: row.id,
        userId: row.user_id,
        importType: row.import_type,
        sourceFilename: row.source_filename,
        status: row.status as UploadBatch['status'],
        totalItems: row.total_items || 0,
        successfulItems: row.successful_items || 0,
        failedItems: row.failed_items || 0,
        errorLog: (row.error_log as any)?.errors || [],
        pendingFiles: (row.error_log as any)?.pendingFiles || [],
        createdAt: row.created_at,
        completedAt: row.completed_at,
      }));
    },
    enabled: !!user?.id,
  });

  // Create a new batch
  const createBatchMutation = useMutation({
    mutationFn: async (params: {
      sourceFilename: string;
      totalItems: number;
      pendingFiles: Array<{ path: string; platform: string; market?: string; phase?: string }>;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('creative_import_batches')
        .insert({
          user_id: user.id,
          import_type: 'folder_upload',
          source_filename: params.sourceFilename,
          status: 'in_progress',
          total_items: params.totalItems,
          successful_items: 0,
          failed_items: 0,
          error_log: { errors: [], pendingFiles: params.pendingFiles },
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upload-batches'] });
    },
  });

  // Update batch progress
  const updateBatchMutation = useMutation({
    mutationFn: async (params: {
      batchId: string;
      successfulItems?: number;
      failedItems?: number;
      errorLog?: Array<{ filename: string; error: string }>;
      pendingFiles?: Array<{ path: string; platform: string; market?: string; phase?: string }>;
      status?: 'in_progress' | 'completed' | 'failed' | 'paused';
    }) => {
      const updates: Record<string, any> = {};

      if (params.successfulItems !== undefined) updates.successful_items = params.successfulItems;
      if (params.failedItems !== undefined) updates.failed_items = params.failedItems;
      if (params.status) updates.status = params.status;
      if (params.status === 'completed' || params.status === 'failed') {
        updates.completed_at = new Date().toISOString();
      }

      // Update error_log with both errors and pending files
      if (params.errorLog !== undefined || params.pendingFiles !== undefined) {
        // First get current state
        const { data: current } = await supabase
          .from('creative_import_batches')
          .select('error_log')
          .eq('id', params.batchId)
          .single();

        const currentLog = (current?.error_log as any) || { errors: [], pendingFiles: [] };
        updates.error_log = {
          errors: params.errorLog ?? currentLog.errors,
          pendingFiles: params.pendingFiles ?? currentLog.pendingFiles,
        };
      }

      const { error } = await supabase
        .from('creative_import_batches')
        .update(updates)
        .eq('id', params.batchId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upload-batches'] });
    },
  });

  // Delete/cancel a batch
  const deleteBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await supabase
        .from('creative_import_batches')
        .delete()
        .eq('id', batchId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upload-batches'] });
      toast.success('Upload batch cancelled');
    },
  });

  return {
    incompleteBatches,
    isLoading,
    refetch,
    createBatch: createBatchMutation.mutateAsync,
    updateBatch: updateBatchMutation.mutateAsync,
    deleteBatch: deleteBatchMutation.mutateAsync,
    isCreating: createBatchMutation.isPending,
  };
}
