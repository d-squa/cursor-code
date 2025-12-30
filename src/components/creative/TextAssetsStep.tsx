// Inline text assets step for the creative matching dialog
// Shows hierarchical editor for configuring copy, CTAs, and tracking

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Save, Check, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CreativeTextAssetEditor } from './CreativeTextAssetEditor';
import type { CreativeTextAssetRow, CreativeFormat } from '@/types/creativeTextAssets';
import { validateTextAssetRow } from '@/types/creativeTextAssets';
import type { CallToAction } from '@/types/creative';

interface SavedAssignment {
  id: string;
  creativeId: string;
  platform: string;
  market: string;
  phaseName: string;
  creativeName: string;
  mediaType: 'image' | 'video';
}

interface TextAssetsStepProps {
  campaignId: string;
  campaignName: string;
  savedAssignments: SavedAssignment[];
  onComplete: () => void;
}

export function TextAssetsStep({ 
  campaignId, 
  campaignName, 
  savedAssignments, 
  onComplete 
}: TextAssetsStepProps) {
  const [rows, setRows] = useState<CreativeTextAssetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load creative assignments with their structure data
  useEffect(() => {
    const loadAssignments = async () => {
      console.log('TextAssetsStep: Loading with savedAssignments:', savedAssignments);
      
      if (!savedAssignments || savedAssignments.length === 0) {
        console.log('TextAssetsStep: No saved assignments provided');
        setIsLoading(false);
        return;
      }

      try {
        // Get assignment IDs from the saved matches
        const assignmentIds = savedAssignments.map(a => a.id);
        console.log('TextAssetsStep: Fetching assignments with IDs:', assignmentIds);
        
        // Fetch assignments with creative data
        const { data: assignments, error } = await supabase
          .from('creative_assignments')
          .select(`
            id,
            campaign_id,
            creative_id,
            platform,
            market,
            phase_name,
            position,
            creatives (
              id,
              name,
              creative_type,
              primary_text,
              headline,
              description,
              call_to_action,
              destination_url,
              thumbnail_url,
              aspect_ratio,
              media_urls
            )
          `)
          .in('id', assignmentIds);

        if (error) {
          console.error('TextAssetsStep: Error fetching assignments:', error);
          throw error;
        }

        console.log('TextAssetsStep: Fetched assignments:', assignments);

        // Transform to CreativeTextAssetRow format
        const transformedRows: CreativeTextAssetRow[] = (assignments || []).map((assignment: any) => {
          const creative = assignment.creatives;
          const isVideo = creative?.creative_type === 'video' || 
                         (creative?.media_urls?.[0]?.includes('.mp4') || creative?.media_urls?.[0]?.includes('.mov'));
          
          return {
            id: `${assignment.id}_${assignment.creative_id}`,
            creativeId: assignment.creative_id,
            assignmentId: assignment.id,
            platform: assignment.platform || 'meta',
            market: assignment.market || 'Global',
            phase: assignment.phase_name || 'Default',
            adSet: `Ad Set ${assignment.position || 1}`,
            creativeName: creative?.name || 'Unknown Creative',
            creativeFormat: (creative?.creative_type || 'image') as CreativeFormat,
            primaryText: creative?.primary_text || '',
            headline: creative?.headline || '',
            description: creative?.description || '',
            callToAction: (creative?.call_to_action || 'LEARN_MORE') as CallToAction,
            destinationUrl: creative?.destination_url || '',
            autoBuildUtm: false,
            isValid: true,
            validationErrors: [],
            thumbnailUrl: creative?.thumbnail_url,
            mediaType: isVideo ? 'video' : 'image',
            aspectRatio: creative?.aspect_ratio,
          };
        });

        console.log('TextAssetsStep: Transformed rows:', transformedRows.length);
        setRows(transformedRows);
      } catch (error) {
        console.error('Error loading assignments:', error);
        toast.error('Failed to load creative assignments');
      } finally {
        setIsLoading(false);
      }
    };

    loadAssignments();
  }, [savedAssignments]);

  // Handle individual row changes
  const handleRowChange = useCallback((id: string, updates: Partial<CreativeTextAssetRow>) => {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, ...updates };
      // Re-validate after update
      const errors = validateTextAssetRow(updated);
      return { ...updated, validationErrors: errors, isValid: errors.length === 0 };
    }));
  }, []);

  // Handle bulk updates
  const handleBulkUpdate = useCallback((ids: string[], updates: Partial<CreativeTextAssetRow>) => {
    setRows(prev => prev.map(row => {
      if (!ids.includes(row.id)) return row;
      const updated = { ...row, ...updates };
      const errors = validateTextAssetRow(updated);
      return { ...updated, validationErrors: errors, isValid: errors.length === 0 };
    }));
  }, []);

  // Save text assets to database
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    
    try {
      // Update creatives with text assets
      const updates = rows.map(row => ({
        id: row.creativeId,
        primary_text: row.primaryText,
        headline: row.headline,
        description: row.description,
        call_to_action: row.callToAction,
        destination_url: row.destinationUrl,
      }));

      // Batch update creatives
      for (const update of updates) {
        const { error } = await supabase
          .from('creatives')
          .update({
            primary_text: update.primary_text,
            headline: update.headline,
            description: update.description,
            call_to_action: update.call_to_action,
            destination_url: update.destination_url,
          })
          .eq('id', update.id);

        if (error) {
          console.error('Error updating creative:', error);
          throw error;
        }
      }

      toast.success(`Saved text assets for ${rows.length} creatives`);
      onComplete();
    } catch (error) {
      console.error('Error saving text assets:', error);
      toast.error('Failed to save text assets');
    } finally {
      setIsSaving(false);
    }
  }, [rows, onComplete]);

  const validCount = useMemo(() => 
    rows.filter(r => validateTextAssetRow(r).length === 0).length
  , [rows]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading creative assignments...</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No Assignments Found</h3>
        <p className="text-muted-foreground text-sm mb-4">
          No creative assignments were saved. Please go back and save some matches.
        </p>
        <Button variant="outline" onClick={onComplete}>
          Skip & Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden">
        <CreativeTextAssetEditor
          rows={rows}
          campaignName={campaignName}
          onRowChange={handleRowChange}
          onBulkUpdate={handleBulkUpdate}
          onSave={handleSave}
          isSaving={isSaving}
        />
      </div>
      
      {/* Skip option */}
      <div className="flex items-center justify-between pt-4 border-t mt-4">
        <p className="text-sm text-muted-foreground">
          You can also configure text assets later in the Creative Library
        </p>
        <Button variant="ghost" onClick={onComplete}>
          Skip for Now
        </Button>
      </div>
    </div>
  );
}