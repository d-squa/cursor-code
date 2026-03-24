// Inline text assets step for the creative matching dialog
// Shows hierarchical editor for configuring copy, CTAs, and tracking

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, Check, AlertCircle, Loader2, Plus, Image, Video, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { TextAssetExcelEditor } from './TextAssetExcelEditor';
import type { CreativeTextAssetRow, CreativeFormat, AdFormat } from '@/types/creativeTextAssets';
import { validateTextAssetRow } from '@/types/creativeTextAssets';
import type { CallToAction } from '@/types/creative';
import { detectAdFormat } from '@/utils/adFormatDetection';
import { 
  TaxonomyParam,
  TaxonomyContext,
  extractTaxonomyValues,
  generateTaxonomyString,
  generateAdTaxonomyName
} from '@/utils/taxonomyUtils';

interface SavedAssignment {
  id: string;
  creativeId: string;
  platform: string;
  market: string;
  phaseName: string;
  adSetName?: string;
  adSetId?: string;
  creativeName: string;
  mediaType: 'image' | 'video';
}

interface TextAssetsStepProps {
  campaignId: string;
  campaignName: string;
  /**
   * When provided, we load only these newly-saved assignments.
   * When omitted/empty, we load all assignments for the campaign.
   */
  savedAssignments?: SavedAssignment[];
  onComplete: () => void;
  /** Called when user wants to save and select more creatives (goes back to step 1) */
  onSaveAndSelectMore?: () => void;
}

// Local extension used by the grid for TikTok thumbnail actions.
// (We keep the persisted shape in the DB; this is just UI convenience data.)
type CreativeTextAssetRowWithTikTok = CreativeTextAssetRow & {
  platformThumbnailId?: string | null;
  tiktokAdvertiserId?: string;
  originalFilename?: string;
  folderPath?: string;
};

// Processing groups are now preserved (carousel groupings persist across loads)

export function TextAssetsStep({ 
  campaignId, 
  campaignName, 
  savedAssignments,
  onComplete,
  onSaveAndSelectMore
}: TextAssetsStepProps) {
  const [rows, setRows] = useState<CreativeTextAssetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [availableCreatives, setAvailableCreatives] = useState<any[]>([]);
  const [selectedNewCreatives, setSelectedNewCreatives] = useState<Set<string>>(new Set());
  const [isLoadingCreatives, setIsLoadingCreatives] = useState(false);

  // Track if we've attempted to load (to distinguish "loading" from "empty result")
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);

  // Load creative assignments with their structure data and taxonomy templates
  useEffect(() => {
    const loadAssignments = async () => {
      const hasSavedAssignments = Array.isArray(savedAssignments) && savedAssignments.length > 0;
      console.log('TextAssetsStep: Loading. hasSavedAssignments=', hasSavedAssignments, 'savedAssignments:', savedAssignments);

      try {
        // Fetch assignments (either specific IDs from the just-saved flow, or all for the campaign)
        const buildAssignmentsQuery = () =>
          supabase
            .from('creative_assignments')
            .select(`
              id,
              campaign_id,
              creative_id,
              platform,
              market,
              phase_name,
              position,
              ad_set_id,
              ad_set_name,
              creatives (
                id,
                name,
                  original_filename,
                  folder_path,
                creative_type,
                primary_text,
                headline,
                description,
                caption,
                call_to_action,
                destination_url,
                thumbnail_url,
                platform_thumbnail_id,
                aspect_ratio,
                media_urls,
                width,
                height,
                tiktok_asset_advertiser_id,
                external_post_id,
                external_page_id
              )
            `)
            .order('platform')
            .order('market')
            .order('phase_name')
            .order('ad_set_name', { nullsFirst: false })
            .order('position');

        let assignmentsResult: { data: any[] | null; error: any | null } = { data: null, error: null };

        if (hasSavedAssignments) {
          // Avoid huge query strings when many IDs were saved (e.g. hundreds).
          const ids = (savedAssignments || []).map(a => a.id).filter(Boolean);
          const chunkSize = 100;
          const allRows: any[] = [];

          for (let i = 0; i < ids.length; i += chunkSize) {
            const chunk = ids.slice(i, i + chunkSize);
            const { data, error } = await buildAssignmentsQuery().in('id', chunk);
            if (error) {
              assignmentsResult = { data: null, error };
              break;
            }
            if (data) allRows.push(...data);
          }

          if (!assignmentsResult.error) {
            const unique = Array.from(new Map(allRows.map((r: any) => [r.id, r])).values());
            unique.sort((a: any, b: any) => {
              const p = String(a.platform || '').localeCompare(String(b.platform || ''));
              if (p) return p;
              const m = String(a.market || '').localeCompare(String(b.market || ''));
              if (m) return m;
              const ph = String(a.phase_name || '').localeCompare(String(b.phase_name || ''));
              if (ph) return ph;
              return (Number(a.position) || 0) - (Number(b.position) || 0);
            });
            assignmentsResult = { data: unique, error: null };
          }
        } else {
          // Fetch ALL assignments for this campaign (no limit - paginate if needed)
          const allRows: any[] = [];
          const pageSize = 1000;
          let from = 0;
          let hasMore = true;

          while (hasMore) {
            const { data, error } = await buildAssignmentsQuery()
              .eq('campaign_id', campaignId)
              .range(from, from + pageSize - 1);

            if (error) {
              assignmentsResult = { data: null, error };
              hasMore = false;
              break;
            }

            if (data) allRows.push(...data);
            hasMore = data !== null && data.length === pageSize;
            from += pageSize;
          }

          if (!assignmentsResult.error) {
            assignmentsResult = { data: allRows, error: null };
          }
        }

        // Campaign metadata (needed for taxonomy)
        const campaignResult = await supabase
          .from('campaigns')
          .select('id, name, objective, start_date, end_date, bo_number, total_budget, platforms, budget_allocation, market_splits, team_id, teams(name)')
          .eq('id', campaignId)
          .single();

        if (assignmentsResult.error) {
          console.error('TextAssetsStep: Error fetching assignments:', assignmentsResult.error);
          throw assignmentsResult.error;
        }

        if (campaignResult.error) {
          console.error('TextAssetsStep: Error fetching campaign:', campaignResult.error);
          throw campaignResult.error;
        }

        const assignments = assignmentsResult.data || [];
        const campaign = campaignResult.data;

        console.log('TextAssetsStep: Fetched assignments:', assignments);
        console.log('TextAssetsStep: Fetched campaign:', campaign);

        // If there are no assignments, we can stop here.
        if (assignments.length === 0) {
          setRows([]);
          return;
        }

        // Fetch taxonomy templates for all platforms used
        // First, we need to resolve internal ad account IDs from external account IDs
        const uniquePlatforms = [...new Set(assignments.map((a: any) => a.platform).filter(Boolean))];
        const taxonomyTemplates: Record<string, { campaign: TaxonomyParam[], adset: TaxonomyParam[], ad: TaxonomyParam[] }> = {};

        // Get market-level ad account mapping from budget_allocation
        const budgetAllocation = (campaign?.budget_allocation as any) || {};
        
        // Collect all unique ad account IDs from market configurations across phases
        const adAccountsPerPlatform: Record<string, Set<string>> = {};
        
        for (const [phaseName, phaseData] of Object.entries(budgetAllocation)) {
          const phaseConfig = phaseData as any;
          const platformSplits = phaseConfig?.platformSplits || {};
          
          for (const [platform, platformData] of Object.entries(platformSplits)) {
            const marketSplits = (platformData as any)?.marketSplits || {};
            
            for (const [market, marketConfig] of Object.entries(marketSplits)) {
              const externalAdAccountId = (marketConfig as any)?.adAccountId;
              if (externalAdAccountId) {
                if (!adAccountsPerPlatform[platform]) {
                  adAccountsPerPlatform[platform] = new Set();
                }
                adAccountsPerPlatform[platform].add(externalAdAccountId);
              }
            }
          }
        }

        // For each platform, resolve external account IDs to internal UUIDs and fetch templates
        for (const platform of uniquePlatforms) {
          const externalIds = adAccountsPerPlatform[platform] ? [...adAccountsPerPlatform[platform]] : [];
          
          if (externalIds.length === 0) continue;
          
          // Resolve external account ID to internal UUID
          let internalAdAccountId: string | null = null;
          
          if (platform === 'meta') {
            const { data: metaAccount } = await supabase
              .from('meta_ad_accounts')
              .select('id')
              .in('account_id', externalIds)
              .limit(1)
              .maybeSingle();
            internalAdAccountId = metaAccount?.id || null;
          } else if (platform === 'tiktok') {
            const { data: tiktokAccount } = await supabase
              .from('tiktok_ad_accounts')
              .select('id')
              .in('advertiser_id', externalIds)
              .limit(1)
              .maybeSingle();
            internalAdAccountId = tiktokAccount?.id || null;
          }
          
          if (internalAdAccountId) {
            // Fetch taxonomy templates for this ad account
            const { data: templates } = await supabase
              .from('taxonomy_templates')
              .select('entity_type, template')
              .eq('ad_account_id', internalAdAccountId)
              .eq('platform', platform);
            
            if (templates && templates.length > 0) {
              taxonomyTemplates[platform] = {
                campaign: (templates.find((t: any) => t.entity_type === 'campaign')?.template as unknown as TaxonomyParam[]) || [],
                adset: (templates.find((t: any) => t.entity_type === 'adset')?.template as unknown as TaxonomyParam[]) || [],
                ad: (templates.find((t: any) => t.entity_type === 'ad')?.template as unknown as TaxonomyParam[]) || [],
              };
            }
          }
        }

        // Transform to CreativeTextAssetRow format with taxonomy names
        const transformedRows: CreativeTextAssetRowWithTikTok[] = assignments.map((assignment: any) => {
          const creative = assignment.creatives;
          const isVideo = creative?.creative_type === 'video' || 
                         (creative?.media_urls?.[0]?.includes('.mp4') || creative?.media_urls?.[0]?.includes('.mov'));
          
          const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';
          
          // Detect ad format based on dimensions and media type
          const suggestedFormat = detectAdFormat({
            aspectRatio: creative?.aspect_ratio,
            mediaType,
            platform: assignment.platform,
          });

          // Get phase budget from campaign budget allocation
          const budgetAllocation = campaign?.budget_allocation as any || {};
          const phaseBudget = budgetAllocation[assignment.phase_name]?.budget || 0;

          // Build taxonomy context for this row
          const taxonomyContext: TaxonomyContext = {
            platform: assignment.platform,
            activationName: campaign?.name || campaignName,
            campaignName: campaign?.name || campaignName,
            objective: campaign?.objective,
            boNumber: campaign?.bo_number,
            teamName: (campaign?.teams as any)?.name,
            totalBudget: campaign?.total_budget,
            country: assignment.market,
            market: assignment.market,
            phaseBudget,
            startDate: campaign?.start_date,
            endDate: campaign?.end_date,
            adFormat: suggestedFormat,
            funnelStage: assignment.phase_name,
          };

          // Generate taxonomy names using templates
          const platformTemplates = taxonomyTemplates[assignment.platform];
          let taxonomyCampaignName = '';
          let taxonomyAdSetName = '';
          let taxonomyAdName = '';

          if (platformTemplates) {
            // Generate campaign name
            if (platformTemplates.campaign.length > 0) {
              const campaignValues = extractTaxonomyValues(platformTemplates.campaign, taxonomyContext);
              taxonomyCampaignName = generateTaxonomyString(platformTemplates.campaign, campaignValues);
            }

            // Generate ad set name
            if (platformTemplates.adset.length > 0) {
              const adsetValues = extractTaxonomyValues(platformTemplates.adset, taxonomyContext);
              taxonomyAdSetName = generateTaxonomyString(platformTemplates.adset, adsetValues);
            }

            // Generate ad name
            if (platformTemplates.ad.length > 0) {
              taxonomyAdName = generateAdTaxonomyName({
                name: creative?.name,
                format: mediaType,
                creativeVariant: 'A',
                copyVariant: 'V1',
              }, platformTemplates.ad);
            }
          }

          // Fallback to descriptive names if no taxonomy template
          if (!taxonomyCampaignName) {
            taxonomyCampaignName = `${campaignName}_${assignment.platform?.toUpperCase() || 'META'}_${assignment.market || 'Global'}`;
          }
          if (!taxonomyAdSetName) {
            taxonomyAdSetName = `${assignment.phase_name || 'Default'}_${suggestedFormat}`;
          }
          if (!taxonomyAdName) {
            taxonomyAdName = creative?.name || 'Creative';
          }
          
          // Get adSetName from multiple sources (in order of preference):
          // 1. Database column (persisted from matching flow)
          // 2. savedAssignments prop (passed during matching flow)
          // 3. Generated taxonomy name if available
          // 4. Fallback to unique identifier based on ad_set_id or position
          const savedAssignment = hasSavedAssignments 
            ? (savedAssignments || []).find((sa: SavedAssignment) => 
                sa.id === assignment.id || sa.creativeId === assignment.creative_id)
            : undefined;
          
          // Determine the ad set name - prioritize stored values, then taxonomy
          let adSetName = assignment.ad_set_name || savedAssignment?.adSetName;
          
          // If no stored ad set name, use the generated taxonomy name
          if (!adSetName && taxonomyAdSetName) {
            adSetName = taxonomyAdSetName;
          }
          
          // If still no name, generate a unique one based on ad_set_id or position
          if (!adSetName) {
            const adSetId = assignment.ad_set_id || savedAssignment?.adSetId;
            adSetName = adSetId ? `Ad Set ${adSetId}` : `Ad Set ${assignment.position || 1}`;
          }
          
          // Detect organic posts - those with external_post_id
          const isOrganic = !!(creative?.external_post_id);

          // Resolve advertiser ID for TikTok thumbnail uploads.
          // Prefer the creative's stored advertiser ID; fallback to ActiPlan (campaign) market settings.
          const resolveAdvertiserIdFromCampaign = () => {
            try {
              const ba = (campaign?.budget_allocation as any) || {};
              const phaseCfg = ba?.[assignment.phase_name] || {};
              const platformCfg = phaseCfg?.platformSplits?.[assignment.platform] || {};
              const marketCfg = platformCfg?.marketSplits?.[assignment.market] || {};
              const direct = marketCfg?.adAccountId;
              if (direct) return String(direct);

              // Fallback: if keys don't match exactly, use the first configured account for this platform.
              const marketSplits = platformCfg?.marketSplits || {};
              const first = Object.values(marketSplits)[0] as any;
              if (first?.adAccountId) return String(first.adAccountId);

              // Secondary fallback: some flows store publishing IDs in campaign.market_splits.
              const ms = (campaign?.market_splits as any) || {};
              const fromMs1 = ms?.[assignment.platform]?.[assignment.market]?.adAccountId;
              const fromMs2 = ms?.[assignment.market]?.adAccountId;
              if (fromMs1) return String(fromMs1);
              if (fromMs2) return String(fromMs2);
              if (Array.isArray(ms)) {
                const match = ms.find((m: any) => m?.name === assignment.market || m?.id === assignment.market);
                if (match?.adAccountId) return String(match.adAccountId);
              }

              return '';
            } catch {
              return '';
            }
          };

          const tiktokAdvertiserId = String(
            creative?.tiktok_asset_advertiser_id || resolveAdvertiserIdFromCampaign() || ''
          ).trim();
          
          return {
            id: `${assignment.id}_${assignment.creative_id}`,
            creativeId: assignment.creative_id,
            assignmentId: assignment.id,
            platform: assignment.platform || 'meta',
            market: assignment.market || 'Global',
            phase: assignment.phase_name || 'Default',
            adSet: adSetName,
            creativeName: creative?.name || 'Unknown Creative',
            creativeFormat: (creative?.creative_type || 'image') as CreativeFormat,
            // Taxonomy names
            taxonomyCampaignName,
            taxonomyAdSetName,
            taxonomyAdName,
            adFormat: suggestedFormat,
            suggestedAdFormat: suggestedFormat,
            adFormatConfirmed: false,
            // For organic posts, use caption as primary text (read-only, populated from platform)
            primaryText: isOrganic 
              ? (creative?.caption || creative?.primary_text || '') 
              : (creative?.primary_text || ''),
            headline: creative?.headline || '',
            description: creative?.description || '',
            caption: creative?.caption || '',
            callToAction: (creative?.call_to_action || 'LEARN_MORE') as CallToAction,
            destinationUrl: creative?.destination_url || '',
            autoBuildUtm: false,
            // Organic posts are always valid (skip validation)
            isValid: isOrganic ? true : true,
            validationErrors: [],
            thumbnailUrl: creative?.thumbnail_url,
            // Non-schema convenience fields consumed by TextAssetExcelEditor (safe to attach)
            platformThumbnailId: creative?.platform_thumbnail_id,
            tiktokAdvertiserId,
            originalFilename: creative?.original_filename || savedAssignment?.creativeName,
            folderPath: creative?.folder_path,
            mediaType,
            aspectRatio: creative?.aspect_ratio,
            width: creative?.width,
            height: creative?.height,
            // Organic post indicators
            isOrganic,
            externalPostId: creative?.external_post_id || undefined,
            externalPageId: creative?.external_page_id || undefined,
            organicMessage: creative?.caption || undefined,
          };
        });

        const dedupedRowsMap = new Map<string, CreativeTextAssetRowWithTikTok>();
        for (const row of transformedRows) {
          if (!dedupedRowsMap.has(row.creativeId)) {
            dedupedRowsMap.set(row.creativeId, row);
          }
        }

        setRows(Array.from(dedupedRowsMap.values()));
      } catch (error) {
        console.error('Error loading assignments:', error);
        toast.error('Failed to load creative assignments');
      } finally {
        setIsLoading(false);
        setHasAttemptedLoad(true);
      }
    };

    loadAssignments();
  }, [savedAssignments, campaignId, campaignName]);

  // Handle individual row changes
  // Organic posts are read-only EXCEPT for destinationUrl (required for traffic objectives)
  const handleRowChange = useCallback((id: string, updates: Partial<CreativeTextAssetRow>) => {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      // For organic posts, only allow destinationUrl updates
      if (row.isOrganic || row.externalPostId) {
        const allowedKeys = ['destinationUrl'] as const;
        const filteredUpdates: Partial<CreativeTextAssetRow> = {};
        for (const key of allowedKeys) {
          if (key in updates) {
            (filteredUpdates as any)[key] = (updates as any)[key];
          }
        }
        if (Object.keys(filteredUpdates).length === 0) return row;
        const updated = { ...row, ...filteredUpdates };
        return updated;
      }
      const updated = { ...row, ...updates };
      // Re-validate after update
      const errors = validateTextAssetRow(updated);
      return { ...updated, validationErrors: errors, isValid: errors.length === 0 };
    }));
  }, []);

  // Handle bulk updates
  // Organic posts are read-only EXCEPT for destinationUrl (required for traffic objectives)
  const handleBulkUpdate = useCallback((ids: string[], updates: Partial<CreativeTextAssetRow>) => {
    setRows(prev => prev.map(row => {
      if (!ids.includes(row.id)) return row;
      // For organic posts, only allow destinationUrl updates
      if (row.isOrganic || row.externalPostId) {
        const allowedKeys = ['destinationUrl'] as const;
        const filteredUpdates: Partial<CreativeTextAssetRow> = {};
        for (const key of allowedKeys) {
          if (key in updates) {
            (filteredUpdates as any)[key] = (updates as any)[key];
          }
        }
        if (Object.keys(filteredUpdates).length === 0) return row;
        const updated = { ...row, ...filteredUpdates };
        return updated;
      }
      const updated = { ...row, ...updates };
      const errors = validateTextAssetRow(updated);
      return { ...updated, validationErrors: errors, isValid: errors.length === 0 };
    }));
  }, []);

  // Handle import from Excel
  const handleImportRows = useCallback((importedRows: CreativeTextAssetRow[]) => {
    // Re-validate all imported rows
    const validatedRows = importedRows.map(row => {
      const errors = validateTextAssetRow(row);
      return { ...row, validationErrors: errors, isValid: errors.length === 0 } as CreativeTextAssetRowWithTikTok;
    });
    setRows(validatedRows as CreativeTextAssetRowWithTikTok[]);
  }, []);

  // Existing creative IDs to exclude from add dialog
  const existingCreativeIds = useMemo(() => new Set(rows.map(r => r.creativeId)), [rows]);

  // Open add creatives dialog
  const handleOpenAddDialog = useCallback(async () => {
    setShowAddDialog(true);
    setIsLoadingCreatives(true);
    setSelectedNewCreatives(new Set());
    
    try {
      // Fetch all creatives for this campaign that are not already in the editor
      const { data: creatives, error } = await supabase
        .from('creatives')
        .select('id, name, creative_type, thumbnail_url, media_urls, aspect_ratio, width, height, platform, market, phase_name')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Filter out already-added creatives
      const available = (creatives || []).filter(c => !existingCreativeIds.has(c.id));
      setAvailableCreatives(available);
    } catch (error) {
      console.error('Error loading available creatives:', error);
      toast.error('Failed to load available creatives');
    } finally {
      setIsLoadingCreatives(false);
    }
  }, [campaignId, existingCreativeIds]);

  // Toggle creative selection in add dialog
  const toggleCreativeSelection = useCallback((creativeId: string) => {
    setSelectedNewCreatives(prev => {
      const next = new Set(prev);
      if (next.has(creativeId)) {
        next.delete(creativeId);
      } else {
        next.add(creativeId);
      }
      return next;
    });
  }, []);

  // Add selected creatives to the editor
  const handleAddSelectedCreatives = useCallback(() => {
    const newRows: CreativeTextAssetRow[] = availableCreatives
      .filter(c => selectedNewCreatives.has(c.id))
      .map(creative => {
        const isVideo = creative.creative_type === 'video' || 
                       (creative.media_urls?.[0]?.includes('.mp4') || creative.media_urls?.[0]?.includes('.mov'));
        const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';
        
        return {
          id: `new_${creative.id}`,
          creativeId: creative.id,
          assignmentId: '',
          platform: creative.platform || 'meta',
          market: creative.market || 'Global',
          phase: creative.phase_name || 'Default',
          adSet: 'New Ad Set',
          creativeName: creative.name || 'Unknown Creative',
          creativeFormat: (creative.creative_type || 'image') as CreativeFormat,
          taxonomyCampaignName: '',
          taxonomyAdSetName: '',
          taxonomyAdName: creative.name || 'Creative',
          adFormat: 'single_image' as AdFormat,
          suggestedAdFormat: 'single_image' as AdFormat,
          adFormatConfirmed: false,
          primaryText: '',
          headline: '',
          description: '',
          callToAction: 'LEARN_MORE' as any,
          destinationUrl: '',
          autoBuildUtm: false,
          isValid: false,
          validationErrors: ['Missing required fields'],
          thumbnailUrl: creative.thumbnail_url,
          mediaType,
          aspectRatio: creative.aspect_ratio,
          width: creative.width,
          height: creative.height,
        };
      });
    
    // Add new rows while preserving existing ones with their edits
    setRows(prev => [...prev, ...newRows]);
    setShowAddDialog(false);
    toast.success(`Added ${newRows.length} creative(s) to the editor`);
  }, [availableCreatives, selectedNewCreatives]);

  // Save text assets to database (no navigation)
  const saveTextAssets = useCallback(async (): Promise<boolean> => {
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
      return true;
    } catch (error) {
      console.error('Error saving text assets:', error);
      toast.error('Failed to save text assets');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [rows]);

  const handleSaveAndProceed = useCallback(async () => {
    const ok = await saveTextAssets();
    if (ok) onComplete();
  }, [saveTextAssets, onComplete]);

  // TextAssetExcelEditor expects onSave to return Promise<void>
  const handleSaveOnly = useCallback(async (): Promise<void> => {
    await saveTextAssets();
  }, [saveTextAssets]);

  const validCount = useMemo(() => 
    rows.filter(r => validateTextAssetRow(r).length === 0).length
  , [rows]);

  const handleDeleteAssignments = useCallback(async (assignmentIds: string[]) => {
    const uniqueIds = Array.from(new Set(assignmentIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    try {
      const { error } = await supabase
        .from('creative_assignments')
        .delete()
        .in('id', uniqueIds);
      
      if (error) throw error;
      
      // Remove from local state
      setRows(prev => prev.filter(r => !uniqueIds.includes((r as any).assignmentId)));
      toast.success(uniqueIds.length === 1 ? 'Assignment deleted' : `${uniqueIds.length} creatives deleted`);
    } catch (error) {
      console.error('Error deleting assignments:', error);
      toast.error(uniqueIds.length === 1 ? 'Failed to delete assignment' : 'Failed to delete selected creatives');
      throw error;
    }
  }, []);

  // Handle delete assignment - must be before any early returns
  const handleDeleteAssignment = useCallback(async (assignmentId: string) => {
    await handleDeleteAssignments([assignmentId]);
  }, [handleDeleteAssignments]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading creative assignments...</p>
      </div>
    );
  }

  // Only show "No Assignments Found" if we've actually attempted to load and confirmed empty
  if (hasAttemptedLoad && rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No Assignments Found</h3>
        <p className="text-muted-foreground text-sm mb-4">
          This ActiPlan doesn	t have any creative assignments yet.
        </p>
        <Button variant="outline" onClick={onComplete}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden">
        <TextAssetExcelEditor
          rows={rows}
          campaignName={campaignName}
          onRowChange={handleRowChange}
          onBulkUpdate={handleBulkUpdate}
          onImportRows={handleImportRows}
          onSave={handleSaveOnly}
          isSaving={isSaving}
          onDeleteAssignment={handleDeleteAssignment}
          onDeleteAssignments={handleDeleteAssignments}
        />
      </div>
      
      {/* Action buttons */}
      <div className="flex items-center justify-between pt-4 border-t mt-4">
        <p className="text-sm text-muted-foreground">
          You can also configure text assets later in the Creative Library
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onComplete}>
            Skip for Now
          </Button>
          {onSaveAndSelectMore && (
            <Button 
              variant="outline" 
              onClick={async () => {
                const ok = await saveTextAssets();
                if (ok) onSaveAndSelectMore();
              }}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save & Select More Creatives
            </Button>
          )}
          <Button 
            onClick={handleSaveAndProceed}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save & Proceed to Launch
          </Button>
        </div>
      </div>

      {/* Add Creatives Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add More Creatives
            </DialogTitle>
            <DialogDescription>
              Select creatives to add to the text asset editor. Your existing edits will be preserved.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden">
            {isLoadingCreatives ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : availableCreatives.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No additional creatives available for this campaign.</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {availableCreatives.map(creative => {
                    const isVideo = creative.creative_type === 'video';
                    const isSelected = selectedNewCreatives.has(creative.id);
                    
                    return (
                      <div
                        key={creative.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => toggleCreativeSelection(creative.id)}
                      >
                        <Checkbox checked={isSelected} />
                        
                        {/* Thumbnail */}
                        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {creative.thumbnail_url ? (
                            <img src={creative.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : isVideo ? (
                            <Video className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <Image className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{creative.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-[10px] px-1 h-4">
                              {isVideo ? 'Video' : 'Image'}
                            </Badge>
                            {creative.aspect_ratio && (
                              <span>{creative.aspect_ratio}</span>
                            )}
                            {creative.platform && (
                              <span className="capitalize">{creative.platform}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
          
          <DialogFooter className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedNewCreatives.size > 0 && `${selectedNewCreatives.size} selected`}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddSelectedCreatives} 
                disabled={selectedNewCreatives.size === 0}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add {selectedNewCreatives.size > 0 ? selectedNewCreatives.size : ''} Creative{selectedNewCreatives.size !== 1 ? 's' : ''}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}