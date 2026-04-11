// Text Assets Tab - Page/editor for editing text assets for a specific ActiPlan
import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { TextAssetExcelEditor } from './TextAssetExcelEditor';
import type { CreativeTextAssetRow, CreativeFormat } from '@/types/creativeTextAssets';
import { validateTextAssetRow } from '@/types/creativeTextAssets';
import type { CallToAction } from '@/types/creative';
import { detectAdFormat } from '@/utils/adFormatDetection';
import type { DetectedACGroup } from '@/utils/assetCustomizationEngine';
import type { CompilationResult } from '@/utils/assetFeedSpecCompiler';

interface Campaign {
  id: string;
  name: string;
}

interface TextAssetsTabProps {
  /** If provided, the editor loads ONLY this ActiPlan (and hides the internal selector). */
  campaignId?: string;
  campaignName?: string;
  hideCampaignSelector?: boolean;
  /** External refresh trigger - increment to reload data */
  refreshNonce?: number;
}

export function TextAssetsTab({ campaignId, campaignName, hideCampaignSelector, refreshNonce: externalRefreshNonce }: TextAssetsTabProps) {
  const { user } = useAuth();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(campaignId || '');
  const [rows, setRows] = useState<CreativeTextAssetRow[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState<boolean>(!campaignId);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Track AC group compiled specs for persistence
  const acGroupSpecsRef = useRef<Map<string, { group: DetectedACGroup; compiled: CompilationResult }>>(new Map());
  const acGroupsToDeleteRef = useRef<Set<string>>(new Set());

  const isExternallyControlled = !!campaignId || !!hideCampaignSelector;
  const effectiveCampaignId = campaignId || selectedCampaignId;

  // Keep internal state in sync if campaignId is provided by parent
  useEffect(() => {
    if (campaignId !== undefined) {
      setSelectedCampaignId(campaignId);
    }
  }, [campaignId]);

  // Load campaigns only when not externally controlled
  useEffect(() => {
    const loadCampaigns = async () => {
      if (!user?.id) return;
      if (isExternallyControlled) {
        setIsLoadingCampaigns(false);
        return;
      }

      setIsLoadingCampaigns(true);
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('id, name')
          .order('updated_at', { ascending: false });

        if (error) throw error;
        setCampaigns(data || []);
      } catch (error) {
        console.error('Error loading campaigns:', error);
        toast.error('Failed to load ActiPlans');
      } finally {
        setIsLoadingCampaigns(false);
      }
    };

    loadCampaigns();
  }, [user?.id, isExternallyControlled]);

  // Load text assets for selected campaign
  useEffect(() => {
    const loadAssignments = async () => {
      if (!effectiveCampaignId) {
        setRows([]);
        return;
      }

      setIsLoadingAssets(true);

      try {
        // Fetch campaign market splits to resolve TikTok advertiser IDs and page info (stored per market)
        const { data: campaignData } = await supabase
          .from('campaigns')
          .select('market_splits')
          .eq('id', effectiveCampaignId)
          .single();

        const marketSplits = (campaignData?.market_splits as Record<string, any> | null) || {};
        const tiktokMarkets: any[] = Array.isArray((marketSplits as any).tiktok) ? (marketSplits as any).tiktok : [];
        const metaMarkets: any[] = [];
        
        // Extract Meta markets from all platform keys containing 'meta'
        for (const [key, markets] of Object.entries(marketSplits)) {
          if (key.toLowerCase().includes('meta') && Array.isArray(markets)) {
            metaMarkets.push(...markets);
          }
        }

        const defaultTikTokMarket =
          tiktokMarkets.find((m) => m?.adAccountId || m?.tiktokAdvertiserId || m?.advertiser_id) || null;

        const defaultTikTokAdvertiserId = String(
          defaultTikTokMarket?.adAccountId || defaultTikTokMarket?.tiktokAdvertiserId || defaultTikTokMarket?.advertiser_id || ''
        ).trim();

        // Paginate to fetch ALL assignments
        const buildQuery = () => supabase
          .from('creative_assignments')
          .select(`
            id,
            campaign_id,
            creative_id,
            platform,
            market,
            phase_name,
            ad_set_name,
            position,
            carousel_group_id,
            carousel_card_headline,
            carousel_card_description,
            carousel_card_website_url,
            carousel_card_cta,
            creatives (
              id,
              name,
              original_filename,
              folder_path,
              creative_type,
              primary_text,
              headline,
              description,
              call_to_action,
              destination_url,
              thumbnail_url,
              aspect_ratio,
              media_urls,
              platform_thumbnail_id,
              tiktok_asset_advertiser_id,
              external_post_id,
              external_page_id
            )
          `)
          .eq('campaign_id', effectiveCampaignId);

        const allAssignments: any[] = [];
        const pageSize = 1000;
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error: pageError } = await buildQuery().range(from, from + pageSize - 1);
          if (pageError) throw pageError;
          if (data) allAssignments.push(...data);
          hasMore = data !== null && data.length === pageSize;
          from += pageSize;
        }

        const assignments = allAssignments;


        // Transform to CreativeTextAssetRow format
        const transformedRows: CreativeTextAssetRow[] = (assignments || []).map((assignment: any) => {
          const creative = assignment.creatives;
          const isVideo =
            creative?.creative_type === 'video' ||
            creative?.media_urls?.[0]?.includes('.mp4') ||
            creative?.media_urls?.[0]?.includes('.mov');

          const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';

          // Detect ad format
          const suggestedFormat = detectAdFormat({
            aspectRatio: creative?.aspect_ratio,
            mediaType,
            platform: assignment.platform,
          });

          const resolvedTikTokAdvertiserId =
            assignment.platform === 'tiktok'
              ? (() => {
                  const marketName = String(assignment.market || '').trim();
                  const match =
                    tiktokMarkets.find((m) => String(m?.name || '').toLowerCase() === marketName.toLowerCase()) ||
                    tiktokMarkets.find((m) => String(m?.id || '').startsWith(`${marketName}-`)) ||
                    null;

                  return String(
                    match?.adAccountId || match?.tiktokAdvertiserId || match?.advertiser_id || defaultTikTokAdvertiserId || ''
                  ).trim();
                })()
              : '';
          
          // Resolve page/identity info based on platform and market
          let pageId: string | undefined;
          let pageName: string | undefined;
          
          if (assignment.platform === 'meta') {
            const marketName = String(assignment.market || '').trim();
            const metaMatch = metaMarkets.find((m) => 
              String(m?.name || '').toLowerCase() === marketName.toLowerCase() ||
              String(m?.id || '').startsWith(`${marketName}-`)
            );
            pageId = metaMatch?.pageId || metaMatch?.page;
            pageName = metaMatch?.pageName || metaMatch?.pageNameFromApi;
          } else if (assignment.platform === 'tiktok') {
            const marketName = String(assignment.market || '').trim();
            const ttMatch = tiktokMarkets.find((m) => 
              String(m?.name || '').toLowerCase() === marketName.toLowerCase() ||
              String(m?.id || '').startsWith(`${marketName}-`)
            );
            pageId = ttMatch?.tiktokIdentityId;
            pageName = ttMatch?.tiktokIdentityName;
          }

          // Detect organic posts - those with external_post_id
          const isOrganic = !!(creative?.external_post_id);
          
          return {
            id: `${assignment.id}_${assignment.creative_id}`,
            creativeId: assignment.creative_id,
            assignmentId: assignment.id,
            platform: assignment.platform || 'meta',
            market: assignment.market || 'Global',
            phase: assignment.phase_name || 'Default',
            adSet: assignment.ad_set_name || `Ad Set ${(assignment.position ?? 0) + 1}`,
            creativeName: creative?.name || 'Unknown Creative',
            originalFilename: [creative?.folder_path, creative?.original_filename]
              .filter((value): value is string => Boolean(value && String(value).trim()))
              .join('/').replace(/\/+/g, '/').replace(/([^:]\/)\/+/, '$1') || creative?.original_filename || undefined,
            folderPath: creative?.folder_path || undefined,
            creativeFormat: (creative?.creative_type || 'image') as CreativeFormat,
            adFormat: suggestedFormat,
            suggestedAdFormat: suggestedFormat,
            adFormatConfirmed: false,
            primaryText: creative?.primary_text || '',
            headline: creative?.headline || '',
            description: creative?.description || '',
            callToAction: (creative?.call_to_action || 'LEARN_MORE') as CallToAction,
            destinationUrl: creative?.destination_url || '',
            autoBuildUtm: false,
            isValid: true,
            validationErrors: [],
            thumbnailUrl: creative?.thumbnail_url,
            mediaType,
            aspectRatio: creative?.aspect_ratio,
            // TikTok-specific fields
            platformThumbnailId: creative?.platform_thumbnail_id,
            tiktokAdvertiserId: String(creative?.tiktok_asset_advertiser_id || resolvedTikTokAdvertiserId || '').trim(),
            // Page/Identity info
            pageId,
            pageName,
            // Organic post indicators
            isOrganic,
            externalPostId: creative?.external_post_id || undefined,
            externalPageId: creative?.external_page_id || undefined,
            // Carousel group info from DB
            carouselGroupId: assignment.carousel_group_id || undefined,
            carouselCardHeadline: assignment.carousel_card_headline || undefined,
            carouselCardDescription: assignment.carousel_card_description || undefined,
            carouselCardWebsiteUrl: assignment.carousel_card_website_url || undefined,
            carouselCardCta: assignment.carousel_card_cta || undefined,
          };
        });

        // Load existing AC groups from DB and restore assetCustomizationGroupId on rows
        const { data: existingACGroups, error: existingACGroupsError } = await supabase
          .from('asset_customization_groups')
          .select(`
            id, group_name, customization_type, asset_feed_spec, customization_rules,
            asset_customization_group_members(id, creative_id, assignment_id, delivery_bucket, aspect_ratio, language, position)
          `)
          .eq('campaign_id', effectiveCampaignId)
          .in('status', ['ready', 'pending', 'pushed']);

        if (existingACGroupsError) throw existingACGroupsError;

        // Build a map of assignment_id → group_id from existing AC groups
        const assignmentToGroupMap = new Map<string, string>();
        if (existingACGroups) {
          for (const group of existingACGroups) {
            const members = (group as any).asset_customization_group_members || [];
            for (const member of members) {
              if (member.assignment_id) {
                assignmentToGroupMap.set(member.assignment_id, group.id);
              }
            }
          }
        }

        // Validate all rows and restore AC group IDs
        const validatedRows = transformedRows.map((row) => {
          const assignmentId = row.assignmentId;
          const acGroupId = assignmentId ? assignmentToGroupMap.get(assignmentId) : undefined;
          const updatedRow = acGroupId
            ? { ...row, assetCustomizationGroupId: acGroupId, processingGroupId: acGroupId, processingGroupType: 'asset_customization' as const }
            : row;
          const errors = validateTextAssetRow(updatedRow);
          return { ...updatedRow, validationErrors: errors, isValid: errors.length === 0 };
        });

        setRows(validatedRows);
      } catch (error) {
        console.error('Error loading assignments:', error);
        toast.error('Failed to load creative assignments');
      } finally {
        setIsLoadingAssets(false);
      }
    };

    loadAssignments();
  }, [effectiveCampaignId, refreshNonce, externalRefreshNonce]);

  // Handle individual row changes
  const handleRowChange = useCallback((id: string, updates: Partial<CreativeTextAssetRow>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, ...updates };
        const errors = validateTextAssetRow(updated);
        return { ...updated, validationErrors: errors, isValid: errors.length === 0 };
      })
    );
  }, []);

  // Handle bulk updates
  const handleBulkUpdate = useCallback((ids: string[], updates: Partial<CreativeTextAssetRow>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (!ids.includes(row.id)) return row;
        const updated = { ...row, ...updates };
        const errors = validateTextAssetRow(updated);
        return { ...updated, validationErrors: errors, isValid: errors.length === 0 };
      })
    );
  }, []);

  // Handle import from Excel
  const handleImportRows = useCallback((importedRows: CreativeTextAssetRow[]) => {
    const validatedRows = importedRows.map((row) => {
      const errors = validateTextAssetRow(row);
      return { ...row, validationErrors: errors, isValid: errors.length === 0 };
    });
    setRows(validatedRows);
  }, []);

  // AC group creation callback
  const handleACGroupCreated = useCallback((group: DetectedACGroup, compiled: CompilationResult) => {
    acGroupSpecsRef.current.set(group.id, { group, compiled });
    acGroupsToDeleteRef.current.delete(group.id); // In case it was previously marked for deletion
  }, []);

  // AC group removal callback
  const handleACGroupRemoved = useCallback((groupId: string) => {
    acGroupSpecsRef.current.delete(groupId);
    acGroupsToDeleteRef.current.add(groupId);
  }, []);

  // Save text assets to database
  const handleSave = useCallback(async () => {
    setIsSaving(true);

    try {
      // Update creatives with text assets
      for (const row of rows) {
        const { error } = await supabase
          .from('creatives')
          .update({
            primary_text: row.primaryText,
            headline: row.headline,
            description: row.description,
            call_to_action: row.callToAction,
            destination_url: row.destinationUrl,
          })
          .eq('id', row.creativeId);

        if (error) {
          console.error('Error updating creative:', error);
          throw error;
        }
      }

      // Persist carousel group data to creative_assignments
      for (const row of rows) {
        const assignmentId = row.assignmentId;
        if (!assignmentId) continue;

        const { error: assignmentError } = await supabase
          .from('creative_assignments')
          .update({
            carousel_group_id: row.carouselGroupId || null,
            carousel_card_headline: (row as any).carouselCardHeadline || null,
            carousel_card_description: (row as any).carouselCardDescription || null,
            carousel_card_website_url: (row as any).carouselCardWebsiteUrl || null,
            carousel_card_cta: (row as any).carouselCardCta || null,
          })
          .eq('id', assignmentId);

        if (assignmentError) {
          console.error('Error updating carousel data on assignment:', assignmentError);
        }
      }

      // ========== PERSIST ASSET CUSTOMIZATION GROUPS ==========
      // Delete removed AC groups
      for (const groupId of acGroupsToDeleteRef.current) {
        // Delete members first, then the group
        const { error: deleteMembersError } = await supabase
          .from('asset_customization_group_members')
          .delete()
          .eq('group_id', groupId);
        if (deleteMembersError) throw deleteMembersError;

        const { error: deleteGroupError } = await supabase
          .from('asset_customization_groups')
          .delete()
          .eq('id', groupId);
        if (deleteGroupError) throw deleteGroupError;

        console.log(`[TextAssetsTab] Deleted AC group ${groupId}`);
      }
      acGroupsToDeleteRef.current.clear();

      // Upsert new/updated AC groups
      for (const [groupId, { group, compiled }] of acGroupSpecsRef.current) {
        if (!compiled.success || !compiled.spec) continue;

        // Get the first row to extract campaign context
        const firstRow = group.rows[0];
        if (!firstRow) continue;

        const campaignIdForGroup = effectiveCampaignId;
        if (!campaignIdForGroup) continue;

        // Map customization type
        const customizationType = group.type === 'placement' ? 'placement'
          : group.type === 'language' ? 'language'
          : 'flexible_creative';

        // Upsert the group
        const { error: groupError } = await supabase
          .from('asset_customization_groups')
          .upsert({
            id: groupId,
            campaign_id: campaignIdForGroup,
            group_name: group.label || `${customizationType} group`,
            customization_type: customizationType,
            asset_feed_spec: compiled.spec as any,
            customization_rules: (compiled.customizationRules || []) as any,
            platform: firstRow.platform || 'meta',
            market: firstRow.market || 'Global',
            phase_name: firstRow.phase || 'Default',
            ad_set_name: firstRow.adSet || null,
            user_id: user?.id || '',
            team_id: null,
            status: 'ready',
          } as any, { onConflict: 'id' });

          if (groupError) throw groupError;

        // Delete existing members for this group and re-insert
          const { error: deleteMembersError } = await supabase
            .from('asset_customization_group_members')
            .delete()
            .eq('group_id', groupId);
          if (deleteMembersError) throw deleteMembersError;

        const memberInserts = group.rows.map((row, index) => {
          // Find the assignment ID for this row
          const assignmentId = row.assignmentId || row.id.split('_')[0];
          
          // Determine delivery bucket from the row
          let deliveryBucket = 'other';
          for (const [bucket, bucketRows] of group.deliveryBuckets) {
            if (bucketRows.some(br => br.id === row.id)) {
              deliveryBucket = bucket;
              break;
            }
          }

          // Determine language
          let language: string | null = null;
          for (const [lang, langRows] of group.languages) {
            if (langRows.some(lr => lr.id === row.id)) {
              language = lang;
              break;
            }
          }

          return {
            group_id: groupId,
            creative_id: row.creativeId,
            assignment_id: assignmentId,
            delivery_bucket: deliveryBucket,
            aspect_ratio: row.aspectRatio || null,
            language: language,
            position: index,
          };
        });

        if (memberInserts.length > 0) {
          const { error: membersError } = await supabase
            .from('asset_customization_group_members')
            .insert(memberInserts as any);

            if (membersError) throw membersError;
        }

        console.log(`[TextAssetsTab] Persisted AC group "${group.label}" with ${memberInserts.length} members`);
      }

      toast.success(`Saved text assets for ${rows.length} creatives`);
    } catch (error) {
      console.error('Error saving text assets:', error);
      toast.error('Failed to save text assets');
    } finally {
      setIsSaving(false);
    }
  }, [rows, effectiveCampaignId, user?.id]);

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);
  const effectiveCampaignName = campaignName || selectedCampaign?.name;

  if (isLoadingCampaigns) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading ActiPlans...</p>
      </div>
    );
  }

  // Standalone mode: show selector when no campaign chosen
  if (!isExternallyControlled && campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No ActiPlans Found</h3>
        <p className="text-muted-foreground text-sm text-center max-w-md">
          Create an ActiPlan first, then come back here to edit text assets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Campaign Selector (only in standalone mode) */}
      {!isExternallyControlled && (
        <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1 block">Select ActiPlan</label>
            <Select value={selectedCampaignId || undefined} onValueChange={setSelectedCampaignId}>
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder="Select an ActiPlan to load it" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            {effectiveCampaignId && <Badge variant="secondary">{rows.length} creatives</Badge>}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setRefreshNonce((n) => n + 1)}
              disabled={!effectiveCampaignId || isLoadingAssets}
              aria-label="Refresh text assets"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingAssets ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      )}

      {/* When externally controlled but no campaign is selected */}
      {isExternallyControlled && !effectiveCampaignId ? (
        <div className="text-sm text-muted-foreground">Select an ActiPlan to load text assets.</div>
      ) : isLoadingAssets ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading text assets...</p>
        </div>
      ) : rows.length === 0 && effectiveCampaignId ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No Assignments</h3>
          <p className="text-muted-foreground text-sm text-center max-w-md">
            This ActiPlan doesn't have any creative assignments yet. Use the Creative Matcher to assign creatives first.
          </p>
        </div>
      ) : rows.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <TextAssetExcelEditor
            rows={rows}
            campaignName={effectiveCampaignName || 'ActiPlan'}
            onRowChange={handleRowChange}
            onBulkUpdate={handleBulkUpdate}
            onImportRows={handleImportRows}
            onSave={handleSave}
            isSaving={isSaving}
            onACGroupCreated={handleACGroupCreated}
            onACGroupRemoved={handleACGroupRemoved}
          />
        </div>
      ) : null}
    </div>
  );
}