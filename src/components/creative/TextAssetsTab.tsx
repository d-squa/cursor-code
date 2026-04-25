// Text Assets Tab - Page/editor for editing text assets for a specific ActiPlan
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { TextAssetExcelEditor } from './TextAssetExcelEditor';
import { GoogleAdsShellReviewDialog } from './GoogleAdsShellReviewDialog';
import {
  buildExpandedStructure,
  buildAdRowsFromAssignments,
  buildCurrentKeywordRows,
  downloadGoogleAdsShell,
  parseGoogleAdsShell,
  diffShell,
  applyKeywordDiff,
  adChangesToAssignmentUpdate,
  type GoogleAdsShellDiff,
  type GoogleKeywordLike,
  type AssignmentLite,
} from '@/utils/googleAdsEditorExcel';
import { ADVANTAGE_PLUS_ASSIGNMENT_FIELDS, type CreativeTextAssetRow, type CreativeFormat } from '@/types/creativeTextAssets';
import { validateTextAssetRow } from '@/types/creativeTextAssets';
import type { CallToAction } from '@/types/creative';
import { detectAdFormat } from '@/utils/adFormatDetection';
import type { DetectedACGroup } from '@/utils/assetCustomizationEngine';
import type { CompilationResult } from '@/utils/assetFeedSpecCompiler';
import {
  ASSET_CUSTOMIZATION_VISIBLE_STATUSES,
  toAssetCustomizationMemberBucket,
} from '@/utils/assetCustomizationPersistence';
import { isAssignmentPushedLive, normalizeAssignmentPushStatus } from '@/utils/creativeAssignmentStatus';

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
  const { user, loading: authLoading } = useAuth();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(campaignId || '');
  const [rows, setRows] = useState<CreativeTextAssetRow[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState<boolean>(!campaignId);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [hasGoogleConfigured, setHasGoogleConfigured] = useState(false);

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
            status,
              dsp_creative_id,
            carousel_group_id,
            carousel_card_headline,
            carousel_card_description,
            carousel_card_website_url,
            carousel_card_cta,
            primary_text,
            primary_text_2,
            primary_text_3,
            primary_text_4,
            primary_text_5,
            headline,
            headline_2,
            headline_3,
            headline_4,
            headline_5,
            description,
            description_2,
            description_3,
            description_4,
            description_5,
            long_headline_1,
            long_headline_2,
            long_headline_3,
            long_headline_4,
            long_headline_5,
            business_name,
            brand_name,
            call_to_action,
            destination_url,
            display_name,
            headline_pins,
            description_pins,
            advantage_plus_video_touchups,
            advantage_plus_text_improvements,
            advantage_plus_product_tags,
            advantage_plus_video_effects,
            advantage_plus_relevant_comments,
            advantage_plus_enhance_cta,
            advantage_plus_reveal_details,
            advantage_plus_show_spotlights,
            advantage_plus_optimize_text_per_person,
            advantage_plus_sitelinks,
            advantage_plus_products,
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
              external_page_id,
              platform_metadata
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

        const assignments = allAssignments.filter((a: any) => {
          return !isAssignmentPushedLive(a.status, a.dsp_creative_id);
        });


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
            primaryText: assignment.primary_text ?? creative?.primary_text ?? '',
            primaryText2: assignment.primary_text_2 ?? undefined,
            primaryText3: assignment.primary_text_3 ?? undefined,
            primaryText4: assignment.primary_text_4 ?? undefined,
            primaryText5: assignment.primary_text_5 ?? undefined,
            headline: assignment.headline ?? creative?.headline ?? '',
            headline2: assignment.headline_2 ?? undefined,
            headline3: assignment.headline_3 ?? undefined,
            headline4: assignment.headline_4 ?? undefined,
            headline5: assignment.headline_5 ?? undefined,
            description: assignment.description ?? creative?.description ?? '',
            description2: assignment.description_2 ?? undefined,
            description3: assignment.description_3 ?? undefined,
            description4: assignment.description_4 ?? undefined,
            description5: assignment.description_5 ?? undefined,
            long_headline_1: assignment.long_headline_1 ?? undefined,
            long_headline_2: assignment.long_headline_2 ?? undefined,
            long_headline_3: assignment.long_headline_3 ?? undefined,
            long_headline_4: assignment.long_headline_4 ?? undefined,
            long_headline_5: assignment.long_headline_5 ?? undefined,
            brandName: assignment.business_name ?? assignment.brand_name ?? undefined,
            business_name: assignment.business_name ?? undefined,
            displayName: assignment.display_name ?? undefined,
            headline_pins: assignment.headline_pins ?? undefined,
            description_pins: assignment.description_pins ?? undefined,
            // Prefer the assignment-level CTA (set by the editor and Excel import)
            // over the creative-library default. Falls back to LEARN_MORE only when
            // neither layer has a value.
            callToAction: (assignment.call_to_action || creative?.call_to_action || 'LEARN_MORE') as CallToAction,
            destinationUrl: assignment.destination_url || creative?.destination_url || '',
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
            // Push status
            pushStatus: normalizeAssignmentPushStatus(assignment.status, assignment.dsp_creative_id),
            // Carousel group info from DB
            carouselGroupId: assignment.carousel_group_id || undefined,
            carouselCardHeadline: assignment.carousel_card_headline || undefined,
            carouselCardDescription: assignment.carousel_card_description || undefined,
            carouselCardWebsiteUrl: assignment.carousel_card_website_url || undefined,
            carouselCardCta: assignment.carousel_card_cta || undefined,
            advantage_plus_video_touchups: assignment.advantage_plus_video_touchups ?? undefined,
            advantage_plus_text_improvements: assignment.advantage_plus_text_improvements ?? undefined,
            advantage_plus_product_tags: assignment.advantage_plus_product_tags ?? undefined,
            advantage_plus_video_effects: assignment.advantage_plus_video_effects ?? undefined,
            advantage_plus_relevant_comments: assignment.advantage_plus_relevant_comments ?? undefined,
            advantage_plus_enhance_cta: assignment.advantage_plus_enhance_cta ?? undefined,
            advantage_plus_reveal_details: assignment.advantage_plus_reveal_details ?? undefined,
            advantage_plus_show_spotlights: assignment.advantage_plus_show_spotlights ?? undefined,
            advantage_plus_optimize_text_per_person: assignment.advantage_plus_optimize_text_per_person ?? undefined,
            advantage_plus_sitelinks: assignment.advantage_plus_sitelinks ?? undefined,
            advantage_plus_products: assignment.advantage_plus_products ?? undefined,
            youtubeVideoUrl: (() => {
              const meta = (creative?.platform_metadata as Record<string, any> | null) || {};
              const fromMeta = meta.youtube_video_url || meta.youtubeVideoUrl || meta.youtube_video_id || meta.youtubeVideoId;
              if (fromMeta) return String(fromMeta);
              const firstMedia = creative?.media_urls?.[0];
              if (firstMedia && /youtu\.?be/i.test(String(firstMedia))) return String(firstMedia);
              return undefined;
            })(),
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
          .in('status', ASSET_CUSTOMIZATION_VISIBLE_STATUSES);

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

  // Detect whether the campaign has any Google phase configured (even with no creatives yet).
  // This makes the Google Ads Shell tools available for Search/PMax/Lead-gen phases that
  // typically don't have creative_assignments rows.
  useEffect(() => {
    const detectGoogle = async () => {
      if (!effectiveCampaignId) {
        setHasGoogleConfigured(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('campaigns')
          .select('generic_config, market_splits, platforms')
          .eq('id', effectiveCampaignId)
          .single();
        const generic = (data?.generic_config as any) || {};
        const phases: any[] = Array.isArray(generic?.phases) ? generic.phases : [];
        const phaseHasGoogle = phases.some(
          (p) => Array.isArray(p?.platforms) && p.platforms.includes('google'),
        );
        const splits = (data?.market_splits as Record<string, any>) || {};
        const splitsHasGoogle = Object.keys(splits).some((k) => k.toLowerCase().includes('google'));
        const platforms = Array.isArray(data?.platforms) ? (data!.platforms as any[]) : [];
        const platformsHasGoogle = platforms.some((p: any) =>
          String(p?.id || p?.name || p || '').toLowerCase().includes('google'),
        );
        setHasGoogleConfigured(phaseHasGoogle || splitsHasGoogle || platformsHasGoogle);
      } catch (err) {
        console.warn('[TextAssetsTab] failed to detect Google config', err);
        setHasGoogleConfigured(false);
      }
    };
    detectGoogle();
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
      if (authLoading) throw new Error('Auth is still loading');
      if (!user?.id) throw new Error('User session not found while saving text assets');
      // Update creatives with text assets
      for (const row of rows) {
        if (!row.creativeId) continue;

        // For Google Demand Gen / Video ads, persist the YouTube URL +
        // extracted ID into platform_metadata so the DSP push can attach the
        // video asset to the creative. Mirror the logic in TextAssetsStep so
        // the editor's YouTube field round-trips on Save.
        let mergedMetadata: Record<string, unknown> | undefined;
        if (row.youtubeVideoUrl !== undefined) {
          const url = String(row.youtubeVideoUrl || '').trim();
          const { data: existing } = await supabase
            .from('creatives')
            .select('platform_metadata')
            .eq('id', row.creativeId)
            .maybeSingle();
          const baseMeta = (existing?.platform_metadata as Record<string, unknown> | null) || {};
          mergedMetadata = { ...baseMeta };
          if (url) {
            const idMatch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/)
              || url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)
              || url.match(/\/(?:shorts|embed|v)\/([A-Za-z0-9_-]{11})/)
              || url.match(/^([A-Za-z0-9_-]{11})$/);
            mergedMetadata.youtube_video_url = url;
            if (idMatch?.[1]) mergedMetadata.youtube_video_id = idMatch[1];
          } else {
            delete mergedMetadata.youtube_video_url;
            delete mergedMetadata.youtube_video_id;
          }
        }

        const { error } = await supabase
          .from('creatives')
          .update({
            primary_text: row.primaryText,
            headline: row.headline,
            description: row.description,
            call_to_action: row.callToAction,
            destination_url: row.destinationUrl,
            ...(mergedMetadata ? { platform_metadata: mergedMetadata as any } : {}),
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

        const advantagePlusUpdates = ADVANTAGE_PLUS_ASSIGNMENT_FIELDS.reduce<Record<string, boolean | undefined>>((acc, field) => {
          acc[field] = row[field];
          return acc;
        }, {});

        const { error: assignmentError } = await supabase
          .from('creative_assignments')
          .update({
            primary_text: row.primaryText || null,
            headline: row.headline || null,
            description: row.description || null,
            call_to_action: row.callToAction || null,
            destination_url: row.destinationUrl || null,
            carousel_group_id: row.carouselGroupId || null,
            carousel_card_headline: (row as any).carouselCardHeadline || null,
            carousel_card_description: (row as any).carouselCardDescription || null,
            carousel_card_website_url: (row as any).carouselCardWebsiteUrl || null,
            carousel_card_cta: (row as any).carouselCardCta || null,
            ...advantagePlusUpdates,
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
            status: 'compiled',
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
            delivery_bucket: toAssetCustomizationMemberBucket(deliveryBucket),
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
  }, [rows, effectiveCampaignId, user?.id, authLoading]);

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);
  const effectiveCampaignName = campaignName || selectedCampaign?.name;

  // ============= Google Ads Shell (Search / PMax / Lead Gen) =============
  const hasGoogleRows = useMemo(
    () => hasGoogleConfigured || rows.some((r) => r.platform === 'google'),
    [hasGoogleConfigured, rows],
  );
  const [shellDiff, setShellDiff] = useState<GoogleAdsShellDiff | null>(null);
  const [shellOpen, setShellOpen] = useState(false);

  /** Build the (expansion, keywords, ad rows) tuple for the current campaign. */
  const loadGoogleShellContext = useCallback(async () => {
    if (!effectiveCampaignId) throw new Error('No ActiPlan selected');

    const { data: camp, error: campErr } = await supabase
      .from('campaigns')
      .select('name, generic_config, market_splits')
      .eq('id', effectiveCampaignId)
      .single();
    if (campErr) throw campErr;

    const generic = (camp?.generic_config as any) || {};
    const phases = (generic.phases || []).filter((p: any) =>
      Array.isArray(p?.platforms) ? p.platforms.includes('google') : true,
    );
    const keywords: GoogleKeywordLike[] = Array.isArray(generic.selectedKeywords)
      ? generic.selectedKeywords
      : [];

    // Markets that have Google enabled
    const splits = (camp?.market_splits as Record<string, any>) || {};
    const googleMarketSet = new Set<string>();
    for (const [key, list] of Object.entries(splits)) {
      if (key.toLowerCase().includes('google') && Array.isArray(list)) {
        for (const m of list) if (m?.name) googleMarketSet.add(String(m.name));
      }
    }
    // Fallback: derive from current rows
    if (googleMarketSet.size === 0) {
      for (const r of rows) if (r.platform === 'google' && r.market) googleMarketSet.add(r.market);
    }
    const markets = Array.from(googleMarketSet);

    const expansion = buildExpandedStructure({
      campaignName: camp?.name || effectiveCampaignName || 'Campaign',
      phases: phases.map((p: any) => ({
        id: p.id,
        name: p.name,
        googleCampaignType: p.googleCampaignType,
        googleSearchSplitLevel: p.googleSearchSplitLevel,
        adSets: p.adSets,
        market: p.market,
      })),
      markets,
      keywords,
    });

    // Pull full Google assignments with the new RSA / PMax columns
    const { data: assignments, error: aErr } = await supabase
      .from('creative_assignments')
      .select(
        `id, platform, market, phase_name, ad_set_name, ad_strategy, ad_group_name,
         destination_url, path_1, path_2,
         headline, headline_2, headline_3, headline_4, headline_5,
         description, description_2, description_3, description_4, description_5,
         headline_pins, description_pins,
         long_headline_1, long_headline_2, long_headline_3, long_headline_4, long_headline_5,
         business_name,
         creatives ( name, platform_metadata, media_urls )`,
      )
      .eq('campaign_id', effectiveCampaignId)
      .eq('platform', 'google');
    if (aErr) throw aErr;

    const liveRowsByAssignmentId = new Map(
      rows
        .filter((row) => row.platform === 'google' && row.assignmentId)
        .map((row) => [row.assignmentId, row] as const),
    );

    const adRows = buildAdRowsFromAssignments(
      (assignments || []) as unknown as AssignmentLite[],
      expansion,
    ).map((adRow) => {
      const liveRow = adRow.assignmentId ? liveRowsByAssignmentId.get(adRow.assignmentId) : undefined;
      if (!liveRow) return adRow;
      const r = liveRow as any;
      return {
        ...adRow,
        finalUrl: liveRow.destinationUrl || adRow.finalUrl,
        youtubeVideoUrl: liveRow.youtubeVideoUrl || adRow.youtubeVideoUrl || '',
        path1: r.path_1 || adRow.path1,
        path2: r.path_2 || adRow.path2,
        headlines: [r.headline, r.headline2, r.headline3, r.headline4, r.headline5, ...adRow.headlines.slice(5)].map((v) => String(v || '')),
        descriptions: [r.description, r.description2, r.description3, r.description4, r.description5].map((v) => String(v || '')),
        longHeadlines: [r.long_headline_1, r.long_headline_2, r.long_headline_3, r.long_headline_4, r.long_headline_5].map((v) => String(v || '')),
        businessName: String(r.business_name || liveRow.brandName || adRow.businessName || ''),
      };
    });

    return {
      campaignName: camp?.name || effectiveCampaignName || 'Campaign',
      generic,
      keywords,
      expansion,
      adRows,
    };
  }, [effectiveCampaignId, effectiveCampaignName, rows]);

  const handleDownloadGoogleAdsShell = useCallback(async () => {
    try {
      const ctx = await loadGoogleShellContext();
      downloadGoogleAdsShell({
        campaignName: ctx.campaignName,
        expansion: ctx.expansion,
        keywords: ctx.keywords,
        adRows: ctx.adRows,
      });
      toast.success('Google Ads shell downloaded');
    } catch (err) {
      console.error('[GoogleAdsShell] download failed', err);
      toast.error('Failed to download Google Ads shell');
    }
  }, [loadGoogleShellContext]);

  const shellContextRef = useRef<Awaited<ReturnType<typeof loadGoogleShellContext>> | null>(null);

  const handleUploadGoogleAdsShell = useCallback(
    async (file: File) => {
      try {
        const ctx = await loadGoogleShellContext();
        shellContextRef.current = ctx;
        const parsed = await parseGoogleAdsShell(file);
        const currentKeywordRows = buildCurrentKeywordRows(ctx.keywords, ctx.expansion);
        const diff = diffShell({
          current: { keywords: currentKeywordRows, ads: ctx.adRows },
          uploaded: parsed,
        });
        setShellDiff(diff);
        setShellOpen(true);
      } catch (err) {
        console.error('[GoogleAdsShell] upload parse failed', err);
        toast.error('Could not read the Google Ads shell file');
      }
    },
    [loadGoogleShellContext],
  );

  const applyShellDiff = useCallback(async (selected: GoogleAdsShellDiff) => {
    const ctx = shellContextRef.current;
    if (!ctx || !effectiveCampaignId) return;
    try {
      // 1) Apply keyword changes -> rewrite generic_config.selectedKeywords
      const hasKwChange =
        selected.keywords.added.length +
          selected.keywords.updated.length +
          selected.keywords.removed.length >
        0;
      if (hasKwChange) {
        const nextKeywords = applyKeywordDiff(ctx.keywords, selected.keywords, ctx.expansion);
        const nextGeneric = { ...(ctx.generic || {}), selectedKeywords: nextKeywords };
        const { error } = await supabase
          .from('campaigns')
          .update({ generic_config: nextGeneric })
          .eq('id', effectiveCampaignId);
        if (error) throw error;
      }

      const rowByAssignmentId = new Map(
        rows
          .filter((row) => row.assignmentId)
          .map((row) => [row.assignmentId, row] as const),
      );
      for (const u of selected.ads.updated) {
        const payload = adChangesToAssignmentUpdate(u.changes);
        if (Object.keys(payload).length > 0) {
          const { error } = await supabase
            .from('creative_assignments')
            .update(payload as any)
            .eq('id', u.assignmentId);
          if (error) throw error;
        }

        if (u.changes.youtubeVideoUrl !== undefined) {
          const targetRow = rowByAssignmentId.get(u.assignmentId);
          if (targetRow?.creativeId) {
            const { data: creativeData, error: creativeReadError } = await supabase
              .from('creatives')
              .select('platform_metadata')
              .eq('id', targetRow.creativeId)
              .single();
            if (creativeReadError) throw creativeReadError;

            const nextUrl = String(u.changes.youtubeVideoUrl || '').trim();
            const nextMetadata = { ...(((creativeData?.platform_metadata as Record<string, unknown> | null) || {})) };
            if (nextUrl) {
              const idMatch = nextUrl.match(/[?&]v=([A-Za-z0-9_-]{11})/) || nextUrl.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) || nextUrl.match(/embed\/([A-Za-z0-9_-]{11})/);
              nextMetadata.youtube_video_url = nextUrl;
              if (idMatch?.[1]) nextMetadata.youtube_video_id = idMatch[1];
            } else {
              delete nextMetadata.youtube_video_url;
              delete nextMetadata.youtube_video_id;
            }

            const { error: creativeUpdateError } = await supabase
              .from('creatives')
              .update({ platform_metadata: nextMetadata as any })
              .eq('id', targetRow.creativeId);
            if (creativeUpdateError) throw creativeUpdateError;
          }
        }
      }

      const total =
        selected.keywords.added.length +
        selected.keywords.updated.length +
        selected.keywords.removed.length +
        selected.ads.updated.length;
      toast.success(`Applied ${total} change(s) from the Google Ads shell`);
      setRefreshNonce((n) => n + 1);
    } catch (err) {
      console.error('[GoogleAdsShell] apply failed', err);
      toast.error('Failed to apply Google Ads shell changes');
    }
  }, [effectiveCampaignId]);


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
      ) : rows.length === 0 && effectiveCampaignId && !hasGoogleRows ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No Assignments</h3>
          <p className="text-muted-foreground text-sm text-center max-w-md">
            This ActiPlan doesn't have any creative assignments yet. Use the Creative Matcher to assign creatives first.
          </p>
        </div>
      ) : rows.length > 0 || hasGoogleRows ? (
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
            hasGoogleRows={hasGoogleRows}
            onDownloadGoogleAdsShell={handleDownloadGoogleAdsShell}
            onUploadGoogleAdsShell={handleUploadGoogleAdsShell}
          />
        </div>
      ) : null}
      <GoogleAdsShellReviewDialog
        open={shellOpen}
        onOpenChange={setShellOpen}
        diff={shellDiff}
        onApply={applyShellDiff}
      />
    </div>
  );
}