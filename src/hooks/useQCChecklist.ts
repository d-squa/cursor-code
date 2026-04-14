import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { QCChecklistItem } from "@/config/qcChecklists";
import { getChecklistForEntity, normalizePlatform, normalizeEntityType } from "@/config/qcChecklists";
import type { QCState } from "@/utils/qcUtils";

export interface QCCompletionRecord {
  id: string;
  qc_tracking_id: string;
  item_key: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  notes: string | null;
}

interface UseQCChecklistOptions {
  campaignId: string | undefined;
  clientId?: string | null;
  enabled?: boolean;
}

export function useQCChecklist({ campaignId, clientId, enabled = true }: UseQCChecklistOptions) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [completions, setCompletions] = useState<QCCompletionRecord[]>([]);
  const [customChecklists, setCustomChecklists] = useState<Record<string, QCChecklistItem[]>>({});
  const [loading, setLoading] = useState(true);

  // Fetch client-specific checklists and completions
  const fetchData = useCallback(async () => {
    if (!campaignId || !enabled || !user) return;

    try {
      setLoading(true);

      // Fetch completions for all QC tracking items in this campaign
      const { data: trackingItems } = await supabase
        .from("qc_tracking")
        .select("id")
        .eq("campaign_id", campaignId);

      if (trackingItems && trackingItems.length > 0) {
        const trackingIds = trackingItems.map((t: any) => t.id);
        const { data: completionData } = await supabase
          .from("qc_checklist_completions")
          .select("*")
          .in("qc_tracking_id", trackingIds);
        
        setCompletions((completionData || []) as unknown as QCCompletionRecord[]);
      }

      // Fetch client-specific checklists if clientId provided
      if (clientId) {
        const { data: clientChecklists } = await supabase
          .from("client_qc_checklists")
          .select("*")
          .eq("client_id", clientId);

        if (clientChecklists) {
          const map: Record<string, QCChecklistItem[]> = {};
          (clientChecklists as any[]).forEach((c) => {
            const key = `${c.platform}_${c.entity_type}`;
            map[key] = c.items as QCChecklistItem[];
          });
          setCustomChecklists(map);
        }
      }
    } catch (error) {
      console.error("Error loading QC checklist data:", error);
    } finally {
      setLoading(false);
    }
  }, [campaignId, clientId, enabled, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get checklist items for a specific entity
  const getChecklist = useCallback((platform: string, entityType: string): QCChecklistItem[] => {
    const np = normalizePlatform(platform);
    const nt = normalizeEntityType(entityType);
    const customKey = `${np}_${nt}`;
    const custom = customChecklists[customKey];
    return getChecklistForEntity(platform, entityType, custom);
  }, [customChecklists]);

  // Get completion status for a tracking item
  const getCompletions = useCallback((trackingId: string): Record<string, boolean> => {
    const itemCompletions: Record<string, boolean> = {};
    completions
      .filter(c => c.qc_tracking_id === trackingId)
      .forEach(c => { itemCompletions[c.item_key] = c.is_checked; });
    return itemCompletions;
  }, [completions]);

  // Toggle a checklist item
  const toggleItem = useCallback(async (trackingId: string, itemKey: string, checked: boolean) => {
    if (!user) return;

    try {
      const existing = completions.find(c => c.qc_tracking_id === trackingId && c.item_key === itemKey);

      if (existing) {
        await supabase
          .from("qc_checklist_completions")
          .update({
            is_checked: checked,
            checked_by: checked ? user.id : null,
            checked_at: checked ? new Date().toISOString() : null,
            check_method: 'individual',
          } as any)
          .eq("id", existing.id);
      } else {
        await supabase
          .from("qc_checklist_completions")
          .insert({
            qc_tracking_id: trackingId,
            item_key: itemKey,
            is_checked: checked,
            checked_by: checked ? user.id : null,
            checked_at: checked ? new Date().toISOString() : null,
            check_method: 'individual',
          } as any);
      }

      // Update local state
      setCompletions(prev => {
        const idx = prev.findIndex(c => c.qc_tracking_id === trackingId && c.item_key === itemKey);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], is_checked: checked, checked_by: checked ? user.id : null, checked_at: checked ? new Date().toISOString() : null };
          return updated;
        }
        return [...prev, {
          id: crypto.randomUUID(),
          qc_tracking_id: trackingId,
          item_key: itemKey,
          is_checked: checked,
          checked_by: checked ? user.id : null,
          checked_at: checked ? new Date().toISOString() : null,
          notes: null,
        }];
      });
    } catch (error) {
      console.error("Error toggling checklist item:", error);
    }
  }, [user, completions]);

  // Check/uncheck all items for a tracking entity
  const toggleAll = useCallback(async (trackingId: string, items: QCChecklistItem[], checked: boolean, checkMethod: string = 'bulk') => {
    if (!user) return;

    try {
      for (const item of items) {
        const existing = completions.find(c => c.qc_tracking_id === trackingId && c.item_key === item.key);
        if (existing) {
          await supabase
            .from("qc_checklist_completions")
            .update({
              is_checked: checked,
              checked_by: checked ? user.id : null,
              checked_at: checked ? new Date().toISOString() : null,
              check_method: checkMethod,
            } as any)
            .eq("id", existing.id);
        } else {
          await supabase
            .from("qc_checklist_completions")
            .insert({
              qc_tracking_id: trackingId,
              item_key: item.key,
              is_checked: checked,
              checked_by: checked ? user.id : null,
              checked_at: checked ? new Date().toISOString() : null,
              check_method: checkMethod,
            } as any);
        }
      }

      // Update local state
      setCompletions(prev => {
        const otherCompletions = prev.filter(c => c.qc_tracking_id !== trackingId);
        const newCompletions = items.map(item => ({
          id: prev.find(c => c.qc_tracking_id === trackingId && c.item_key === item.key)?.id || crypto.randomUUID(),
          qc_tracking_id: trackingId,
          item_key: item.key,
          is_checked: checked,
          checked_by: checked ? user.id : null,
          checked_at: checked ? new Date().toISOString() : null,
          notes: null,
        }));
        return [...otherCompletions, ...newCompletions];
      });
    } catch (error) {
      console.error("Error toggling all checklist items:", error);
    }
  }, [user, completions]);

  // Check if all items are completed for a tracking entity
  const isAllChecked = useCallback((trackingId: string, items: QCChecklistItem[]): boolean => {
    if (items.length === 0) return true;
    const entityCompletions = completions.filter(c => c.qc_tracking_id === trackingId && c.is_checked);
    return entityCompletions.length >= items.length;
  }, [completions]);

  // Get completion count for a tracking entity
  const getCompletionCount = useCallback((trackingId: string, items: QCChecklistItem[]): { checked: number; total: number } => {
    const entityCompletions = completions.filter(c => c.qc_tracking_id === trackingId && c.is_checked);
    return { checked: entityCompletions.length, total: items.length };
  }, [completions]);

  return {
    completions,
    loading,
    getChecklist,
    getCompletions,
    toggleItem,
    toggleAll,
    isAllChecked,
    getCompletionCount,
    refresh: fetchData,
  };
}
