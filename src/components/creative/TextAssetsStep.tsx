// Inline text assets step for the creative matching dialog
// Shows hierarchical editor for configuring copy, CTAs, and tracking

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { DetectedACGroup } from '@/utils/assetCustomizationEngine';
import type { CompilationResult } from '@/utils/assetFeedSpecCompiler';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, Check, AlertCircle, Loader2, Plus, Image, Video, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { TextAssetExcelEditor } from './TextAssetExcelEditor';
import { GoogleAdsShellReviewDialog } from './GoogleAdsShellReviewDialog';
import { ADVANTAGE_PLUS_ASSIGNMENT_FIELDS, type CreativeTextAssetRow, type CreativeFormat, type AdFormat } from '@/types/creativeTextAssets';
import { validateTextAssetRow } from '@/types/creativeTextAssets';
import type { CallToAction } from '@/types/creative';
import { detectAdFormat } from '@/utils/adFormatDetection';
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
type GoogleShellContext = {
  campaignName: string;
  generic: any;
  keywords: GoogleKeywordLike[];
  expansion: ReturnType<typeof buildExpandedStructure>;
  adRows: ReturnType<typeof buildAdRowsFromAssignments>;
};
import { 
  TaxonomyParam,
  TaxonomyContext,
  extractTaxonomyValues,
  generateTaxonomyString,
  generateAdTaxonomyName
} from '@/utils/taxonomyUtils';
import {
  ASSET_CUSTOMIZATION_VISIBLE_STATUSES,
  toAssetCustomizationMemberBucket,
} from '@/utils/assetCustomizationPersistence';
import { isAssignmentPushedLive, normalizeAssignmentPushStatus } from '@/utils/creativeAssignmentStatus';
import type { CampaignStructure } from '@/hooks/useCreativeMatching';

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
   * Optional snapshot from the matching flow.
   * The editor still loads the full assignment set for the campaign.
   */
  savedAssignments?: SavedAssignment[];
  /**
   * Optional list of all campaign structures (ad sets) detected by the
   * matching engine. Used to render placeholder rows for ad sets that have
   * no creative assignments yet, so the user can still configure copy for them.
   */
  campaignStructures?: CampaignStructure[];
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
  campaignStructures,
  onComplete,
  onSaveAndSelectMore
}: TextAssetsStepProps) {
  const [rows, setRows] = useState<CreativeTextAssetRow[]>([]);
  const [googlePlaceholderRows, setGooglePlaceholderRows] = useState<CreativeTextAssetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasGoogleConfigured, setHasGoogleConfigured] = useState(false);
  const [shellDiff, setShellDiff] = useState<GoogleAdsShellDiff | null>(null);
  const [shellOpen, setShellOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [availableCreatives, setAvailableCreatives] = useState<any[]>([]);
  const [selectedNewCreatives, setSelectedNewCreatives] = useState<Set<string>>(new Set());
  const [isLoadingCreatives, setIsLoadingCreatives] = useState(false);

  // Track if we've attempted to load (to distinguish "loading" from "empty result")
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);

  // Track AC group compiled specs for persistence
  const acGroupSpecsRef = useRef<Map<string, { group: DetectedACGroup; compiled: CompilationResult }>>(new Map());
  const acGroupsToDeleteRef = useRef<Set<string>>(new Set());
  const shellContextRef = useRef<GoogleShellContext | null>(null);

  useEffect(() => {
    const detectGoogle = async () => {
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('name, generic_config, market_splits, platforms')
          .eq('id', campaignId)
          .single();

        if (error) throw error;

        const generic = (data?.generic_config as any) || {};
        const basicTargeting = generic?.targetingPreset || generic?.basicTargeting || {};
        // Resolve per-platform default ad sets so that Google phases without their own
        // `adSets` array still inherit the campaign-level split (e.g. Age dimension with
        // 2 groups). Without this fallback the editor would show a single "Default" ad
        // group regardless of the configured split.
        const perPlatformDim = basicTargeting?.defaultAdSetSplitDimensionPerPlatform || {};
        const perPlatformAdSets = basicTargeting?.defaultAdSetsPerPlatform || {};
        const googleDimension =
          perPlatformDim?.google || perPlatformDim?.google_ads || basicTargeting?.defaultAdSetSplitDimension;
        const googleDefaultAdSets =
          perPlatformAdSets?.google ||
          perPlatformAdSets?.google_ads ||
          (Object.keys(perPlatformAdSets).length === 0 ? basicTargeting?.defaultAdSets : undefined);
        const inheritAdSets = (phase: any): any[] | undefined => {
          if (Array.isArray(phase?.adSets) && phase.adSets.length > 0) return phase.adSets;
          if (phase?.overrideTargeting) return undefined;
          if (googleDimension && googleDimension !== 'none' && Array.isArray(googleDefaultAdSets) && googleDefaultAdSets.length > 0) {
            return googleDefaultAdSets;
          }
          return undefined;
        };
        const phases: any[] = Array.isArray(generic?.phases) ? generic.phases : [];
        const phaseHasGoogle = phases.some((phase) => {
          const platforms = Array.isArray(phase?.platforms) ? phase.platforms : [];
          return platforms.some((platform: string) => String(platform).toLowerCase().includes('google'));
        });
        const splits = (data?.market_splits as Record<string, any>) || {};
        const splitsHasGoogle = Object.keys(splits).some((key) => key.toLowerCase().includes('google'));
        const platforms = Array.isArray(data?.platforms) ? (data.platforms as any[]) : [];
        const platformsHasGoogle = platforms.some((platform) =>
          String(platform?.id || platform?.name || platform || '').toLowerCase().includes('google'),
        );

        setHasGoogleConfigured(phaseHasGoogle || splitsHasGoogle || platformsHasGoogle);

        // Build placeholder rows for every Google phase × market × ad-group expansion,
        // so Search / PMax / Demand Gen / Lead Gen all appear in the editor even
        // when no creatives have been matched yet.
        const googlePhases: any[] = phases.filter((p: any) => {
          const ps = Array.isArray(p?.platforms) ? p.platforms : [];
          return ps.some((x: string) => String(x).toLowerCase().includes('google'));
        });
        const googleMarketSet = new Set<string>();
        for (const [key, list] of Object.entries(splits)) {
          if (key.toLowerCase().includes('google') && Array.isArray(list)) {
            for (const m of list as any[]) {
              if (m?.name) googleMarketSet.add(String(m.name));
              else if (typeof m === 'string') googleMarketSet.add(m);
              // Also mine phases from market_splits since some campaigns store
              // their Google phase configuration here rather than in generic_config.
              const marketName = m?.name || (typeof m === 'string' ? m : undefined);
              const phasesFromMarket = Array.isArray(m?.phases) ? m.phases : [];
              for (const phase of phasesFromMarket) {
                googlePhases.push({
                  ...phase,
                  market: phase?.market || marketName,
                });
              }
            }
          }
        }
        if (googleMarketSet.size === 0) {
          for (const p of googlePhases) {
            if (p?.market) googleMarketSet.add(String(p.market));
          }
        }
        const markets = Array.from(googleMarketSet);
        // Collect keywords from generic_config and any per-phase keyword arrays so that
        // strategy detection (Brand / Generic / Competition) can find them wherever they live.
        const keywordSources: any[] = [];
        if (Array.isArray(generic?.selectedKeywords)) keywordSources.push(...generic.selectedKeywords);
        if (Array.isArray(generic?.keywords)) keywordSources.push(...generic.keywords);
        for (const p of googlePhases) {
          if (Array.isArray(p?.selectedKeywords)) keywordSources.push(...p.selectedKeywords);
          if (Array.isArray(p?.keywords)) keywordSources.push(...p.keywords);
          if (Array.isArray(p?.searchKeywords)) keywordSources.push(...p.searchKeywords);
        }
        const keywords: GoogleKeywordLike[] = keywordSources.filter(
          (k) => !k?.platform || String(k.platform).toLowerCase().includes('google'),
        );

        if (googlePhases.length > 0 && markets.length > 0) {
          const expansion = buildExpandedStructure({
            campaignName: data?.name || campaignName || 'Campaign',
            phases: googlePhases.map((p: any) => ({
              id: p.id,
              name: p.name,
              googleCampaignType: p.googleCampaignType,
              googleSearchSplitLevel: p.googleSearchSplitLevel,
              // Inherit per-platform default ad sets when the phase doesn't define its
              // own, so Search / PMax / Demand Gen reflect the configured split (e.g.
              // Age × 2 groups) instead of collapsing into a single "Default" group.
              adSets: inheritAdSets(p),
              market: p.market,
            })),
            markets,
            keywords,
          });

          const placeholders: CreativeTextAssetRow[] = expansion.map((ref, idx) => {
            // For Search phases we keep the strategy decoration so each campaign
            // (Brand / Generic / Competition) renders as its own group. For non-search
            // phases we use the bare phase name so placeholders dedup against any real
            // assignments — which store `phase_name` without decoration.
            const phaseLabel = ref.strategy
              ? `${ref.phaseName} • ${ref.strategy.charAt(0).toUpperCase()}${ref.strategy.slice(1)}`
              : ref.phaseName;
            return {
              id: `google_shell_${ref.market}_${ref.phaseName}_${ref.strategy || 'na'}_${ref.adGroupName}_${idx}`,
              creativeId: '',
              assignmentId: '',
              platform: 'google',
              market: ref.market,
              phase: phaseLabel,
              adSet: ref.adGroupName,
              creativeName: '— Shell placeholder —',
              creativeFormat: 'image',
              taxonomyCampaignName: ref.campaignName,
              taxonomyAdSetName: ref.adGroupName,
              taxonomyAdName: '',
              adFormat: 'other',
              suggestedAdFormat: 'other',
              adFormatConfirmed: false,
              primaryText: '',
              headline: '',
              description: '',
              callToAction: 'LEARN_MORE',
              destinationUrl: '',
              autoBuildUtm: false,
              isValid: true,
              validationErrors: [],
              mediaType: 'image',
              pushStatus: 'draft',
            } as CreativeTextAssetRow;
          });
          setGooglePlaceholderRows(placeholders);
        } else {
          setGooglePlaceholderRows([]);
        }
      } catch (error) {
        console.warn('[TextAssetsStep] failed to detect Google config', error);
        setHasGoogleConfigured(false);
        setGooglePlaceholderRows([]);
      }
    };

    detectGoogle();
  }, [campaignId]);

  // Load creative assignments with their structure data and taxonomy templates
  useEffect(() => {
    const loadAssignments = async () => {
      console.log('TextAssetsStep: Loading all campaign assignments', {
        campaignId,
        savedAssignmentCount: savedAssignments?.length || 0,
      });

      try {
        // Always fetch the full campaign assignment set.
        // The matching-flow snapshot can be incomplete when the same creative is reused
        // across multiple phases/ad sets, which would hide valid rows in the editor.
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
               status,
               dsp_creative_id,
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

        const assignments = (assignmentsResult.data || []).filter((assignment: any) => (
          !isAssignmentPushedLive(assignment.status, assignment.dsp_creative_id)
        ));
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
          const savedAssignment = (savedAssignments || []).find((sa: SavedAssignment) =>
            sa.id === assignment.id || (
              sa.creativeId === assignment.creative_id &&
              sa.platform === assignment.platform &&
              sa.market === assignment.market &&
              sa.phaseName === assignment.phase_name &&
              (sa.adSetName || '') === (assignment.ad_set_name || '')
            )
          );
          
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
            pushStatus: normalizeAssignmentPushStatus(assignment.status, assignment.dsp_creative_id),
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
          };
        });

        const { data: existingACGroups, error: existingACGroupsError } = await supabase
          .from('asset_customization_groups')
          .select(`
            id,
            asset_customization_group_members(assignment_id)
          `)
          .eq('campaign_id', campaignId)
          .in('status', ASSET_CUSTOMIZATION_VISIBLE_STATUSES);

        if (existingACGroupsError) {
          console.error('TextAssetsStep: Error fetching asset customization groups:', existingACGroupsError);
          throw existingACGroupsError;
        }

        const assignmentToGroupMap = new Map<string, string>();
        for (const group of existingACGroups || []) {
          const members = (group as any).asset_customization_group_members || [];
          for (const member of members) {
            if (member.assignment_id) {
              assignmentToGroupMap.set(member.assignment_id, group.id);
            }
          }
        }

        // Keep one row per assignment, not per creative.
        // The same creative can legitimately be reused across multiple phases/ad sets,
        // and collapsing by creativeId hides valid assignments in the editor.
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

  // AC group creation callback
  const handleACGroupCreated = useCallback((group: DetectedACGroup, compiled: CompilationResult) => {
    acGroupSpecsRef.current.set(group.id, { group, compiled });
    acGroupsToDeleteRef.current.delete(group.id);
  }, []);

  // AC group removal callback
  const handleACGroupRemoved = useCallback((groupId: string) => {
    acGroupSpecsRef.current.delete(groupId);
    acGroupsToDeleteRef.current.add(groupId);
  }, []);

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

      // Persist carousel group data to creative_assignments
      for (const row of rows) {
        const assignmentId = row.assignmentId;
        if (!assignmentId) continue;

        const advantagePlusUpdates = ADVANTAGE_PLUS_ASSIGNMENT_FIELDS.reduce<Record<string, boolean | undefined>>((acc, field) => {
          acc[field] = row[field];
          return acc;
        }, {});

        await supabase
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
      }

      // ========== PERSIST ASSET CUSTOMIZATION GROUPS ==========
      for (const groupId of acGroupsToDeleteRef.current) {
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
      }
      acGroupsToDeleteRef.current.clear();

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session?.user?.id) throw new Error('User session not found while saving asset customization groups');

      for (const [groupId, { group, compiled }] of acGroupSpecsRef.current) {
        if (!compiled.success || !compiled.spec) continue;
        const firstRow = group.rows[0];
        if (!firstRow) continue;

        const customizationType = group.type === 'placement' ? 'placement'
          : group.type === 'language' ? 'language' : 'flexible_creative';

        const { error: groupError } = await supabase
          .from('asset_customization_groups')
          .upsert({
            id: groupId,
            campaign_id: campaignId,
            group_name: group.label || `${customizationType} group`,
            customization_type: customizationType,
            asset_feed_spec: compiled.spec as any,
            customization_rules: (compiled.customizationRules || []) as any,
            platform: firstRow.platform || 'meta',
            market: firstRow.market || 'Global',
            phase_name: firstRow.phase || 'Default',
            ad_set_name: firstRow.adSet || null,
            user_id: sessionData.session.user.id,
            status: 'compiled',
          } as any, { onConflict: 'id' });
        if (groupError) throw groupError;

        const { error: deleteMembersError } = await supabase
          .from('asset_customization_group_members')
          .delete()
          .eq('group_id', groupId);
        if (deleteMembersError) throw deleteMembersError;

        const memberInserts = group.rows.map((row, index) => {
          const assignmentId = row.assignmentId || row.id.split('_')[0];
          let deliveryBucket = 'other';
          for (const [bucket, bucketRows] of group.deliveryBuckets) {
            if (bucketRows.some(br => br.id === row.id)) { deliveryBucket = bucket; break; }
          }
          let language: string | null = null;
          for (const [lang, langRows] of group.languages) {
            if (langRows.some(lr => lr.id === row.id)) { language = lang; break; }
          }
          return {
            group_id: groupId, creative_id: row.creativeId, assignment_id: assignmentId,
            delivery_bucket: toAssetCustomizationMemberBucket(deliveryBucket), aspect_ratio: row.aspectRatio || null,
            language, position: index,
          };
        });

        if (memberInserts.length > 0) {
          const { error: membersError } = await supabase
            .from('asset_customization_group_members')
            .insert(memberInserts as any);
          if (membersError) throw membersError;
        }
        console.log(`[TextAssetsStep] Persisted AC group "${group.label}" with ${memberInserts.length} members`);
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
  }, [rows, campaignId]);

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

  // Build placeholder rows for Meta/TikTok ad sets that have no creative
  // assignments yet, so the user can still author copy for them.
  // (Google has its own shell-driven placeholders above.)
  const structurePlaceholderRows = useMemo<CreativeTextAssetRow[]>(() => {
    if (!campaignStructures || campaignStructures.length === 0) return [];
    const placeholders: CreativeTextAssetRow[] = [];
    campaignStructures.forEach((s, idx) => {
      const platform = String(s.platform || '').toLowerCase();
      // Skip Google — handled by googlePlaceholderRows.
      if (platform === 'google' || platform.includes('google')) return;
      const market = s.market || 'Global';
      const phase = (s.phases && s.phases[0]) || s.funnelStage || 'Default';
      const adSet = s.adSetName || 'Ad Set';
      placeholders.push({
        id: `structure_shell_${platform}_${market}_${phase}_${adSet}_${idx}`,
        creativeId: '',
        assignmentId: '',
        platform,
        market,
        phase,
        adSet,
        creativeName: '— No creative assigned —',
        creativeFormat: 'image',
        taxonomyCampaignName: s.campaignName || campaignName,
        taxonomyAdSetName: adSet,
        taxonomyAdName: '',
        adFormat: 'other',
        suggestedAdFormat: 'other',
        adFormatConfirmed: false,
        primaryText: '',
        headline: '',
        description: '',
        callToAction: 'LEARN_MORE',
        destinationUrl: '',
        autoBuildUtm: false,
        isValid: true,
        validationErrors: [],
        mediaType: 'image',
        pushStatus: 'draft',
      } as CreativeTextAssetRow);
    });
    return placeholders;
  }, [campaignStructures, campaignName]);

  // ============= Google Ads Shell (Search / PMax / Demand Gen / Lead Gen) =============
  // Merge real Google assignments with synthesized "shell" placeholder rows so that
  // every Google campaign type (Search strategies, PMax, Demand Gen, etc.) shows up
  // in the editor — even before any creatives are matched.
  const mergedRows = useMemo(() => {
    const out = [...rows];

    // Add Meta/TikTok placeholders for ad sets without any assignment.
    if (structurePlaceholderRows.length > 0) {
      const realKeys = new Set(
        rows.map((r) => `${(r.platform || '').toLowerCase()}|${r.market}|${r.phase}|${r.adSet}`),
      );
      for (const p of structurePlaceholderRows) {
        const key = `${(p.platform || '').toLowerCase()}|${p.market}|${p.phase}|${p.adSet}`;
        if (!realKeys.has(key)) out.push(p);
      }
    }

    // Add Google shell placeholders — but suppress them whenever a real assignment
    // already exists for the same (market, base phase, strategy). Real assignments
    // carry the full DSP taxonomy ad-set name (e.g. MXM_ONAD_..._DE_WF) which the
    // push will use, while placeholders use simple split labels (Default_LANG_ENG).
    // Comparing on `adSet` would treat them as different rows and produce duplicates,
    // so we group by (market, phaseBase, strategy) instead and let the real rows win.
    if (googlePlaceholderRows.length > 0) {
      // Split a phase label like "Search — Conversion • Brand" into base + strategy.
      const splitPhaseLabel = (label: string): { base: string; strategy: string } => {
        const idx = label.lastIndexOf(' • ');
        if (idx === -1) return { base: label.trim(), strategy: '' };
        return {
          base: label.slice(0, idx).trim(),
          strategy: label.slice(idx + 3).trim().toLowerCase(),
        };
      };

      // Build the set of (market, phaseBase, strategy) groups that already have at
      // least one real Google assignment. For real rows the phase has no strategy
      // decoration, so we derive the strategy from the placeholder side instead and
      // match by the base phase only.
      const realGoogleGroups = new Set<string>();
      for (const r of out) {
        if (r.platform !== 'google') continue;
        const { base } = splitPhaseLabel(r.phase || '');
        // We don't know the real row's strategy from the row itself; mark every
        // strategy bucket for that (market, phase) as occupied. This is correct
        // because the placeholder's strategy split only matters when no real
        // assignment exists yet for that base phase.
        realGoogleGroups.add(`${r.market}|${base}|*`);
      }

      for (const p of googlePlaceholderRows) {
        const { base } = splitPhaseLabel(p.phase || '');
        if (realGoogleGroups.has(`${p.market}|${base}|*`)) continue;
        out.push(p);
      }
    }

    return out;
  }, [rows, googlePlaceholderRows, structurePlaceholderRows]);

  const hasGoogleRows = useMemo(
    () => hasGoogleConfigured || mergedRows.some((r) => r.platform === 'google'),
    [hasGoogleConfigured, mergedRows],
  );

  const loadGoogleShellContext = useCallback(async (): Promise<GoogleShellContext> => {
    const { data: camp, error: campErr } = await supabase
      .from('campaigns')
      .select('name, generic_config, market_splits')
      .eq('id', campaignId)
      .single();
    if (campErr) throw campErr;

    const generic = (camp?.generic_config as any) || {};
    const phases = (generic.phases || []).filter((p: any) =>
      Array.isArray(p?.platforms) ? p.platforms.includes('google') : true,
    );
    const keywords: GoogleKeywordLike[] = Array.isArray(generic.selectedKeywords)
      ? generic.selectedKeywords
      : [];

    const splits = (camp?.market_splits as Record<string, any>) || {};
    const googleMarketSet = new Set<string>();
    for (const [key, list] of Object.entries(splits)) {
      if (key.toLowerCase().includes('google') && Array.isArray(list)) {
        for (const m of list as any[]) if (m?.name) googleMarketSet.add(String(m.name));
      }
    }
    if (googleMarketSet.size === 0) {
      for (const r of rows) if (r.platform === 'google' && r.market) googleMarketSet.add(r.market);
    }
    const markets = Array.from(googleMarketSet);

    const expansion = buildExpandedStructure({
      campaignName: camp?.name || campaignName || 'Campaign',
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
         creatives ( name )`,
      )
      .eq('campaign_id', campaignId)
      .eq('platform', 'google');
    if (aErr) throw aErr;

    const adRows = buildAdRowsFromAssignments(
      (assignments || []) as unknown as AssignmentLite[],
      expansion,
    );

    return {
      campaignName: camp?.name || campaignName || 'Campaign',
      generic,
      keywords,
      expansion,
      adRows,
    };
  }, [campaignId, campaignName, rows]);

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

  const handleUploadGoogleAdsShell = useCallback(async (file: File) => {
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
  }, [loadGoogleShellContext]);

  // Filter the campaign-wide shell context down to a single (market, phase). The
  // phase label coming from the editor may include strategy decoration (e.g.
  // "Search — Conversion • Brand"), so we strip it before matching the phase
  // names stored on `expansion` entries.
  const scopeShellContext = useCallback(
    (ctx: GoogleShellContext, market: string, phaseLabel: string): GoogleShellContext => {
      const stripStrategy = (label: string) => {
        const idx = label.lastIndexOf(' • ');
        return idx === -1 ? label.trim() : label.slice(0, idx).trim();
      };
      const basePhase = stripStrategy(phaseLabel);
      const expansion = ctx.expansion.filter(
        (ref) => ref.market === market && ref.phaseName === basePhase,
      );
      const allowedCampaignNames = new Set(expansion.map((e) => e.campaignName));
      const adRows = ctx.adRows.filter((row) => allowedCampaignNames.has(row.campaignName));
      const keywords = ctx.keywords.filter((k) => {
        const kMarket = k.market ? String(k.market) : '';
        return !kMarket || kMarket === market;
      });
      return { ...ctx, expansion, adRows, keywords };
    },
    [],
  );

  const handleDownloadGoogleAdsShellForPhase = useCallback(
    async (market: string, phaseLabel: string) => {
      try {
        const ctx = await loadGoogleShellContext();
        const scoped = scopeShellContext(ctx, market, phaseLabel);
        if (scoped.expansion.length === 0) {
          toast.error('No Google Ads structure found for this phase');
          return;
        }
        downloadGoogleAdsShell({
          campaignName: `${scoped.campaignName} - ${market} - ${phaseLabel}`,
          expansion: scoped.expansion,
          keywords: scoped.keywords,
          adRows: scoped.adRows,
        });
        toast.success(`Shell downloaded for ${phaseLabel}`);
      } catch (err) {
        console.error('[GoogleAdsShell] phase download failed', err);
        toast.error('Failed to download Google Ads shell');
      }
    },
    [loadGoogleShellContext, scopeShellContext],
  );

  const handleUploadGoogleAdsShellForPhase = useCallback(
    async (market: string, phaseLabel: string, file: File) => {
      try {
        const ctx = await loadGoogleShellContext();
        const scoped = scopeShellContext(ctx, market, phaseLabel);
        if (scoped.expansion.length === 0) {
          toast.error('No Google Ads structure found for this phase');
          return;
        }
        // We keep the full context so the diff apply step can update keywords
        // on the campaign's `generic_config` correctly.
        shellContextRef.current = ctx;
        const parsed = await parseGoogleAdsShell(file);
        const currentKeywordRows = buildCurrentKeywordRows(scoped.keywords, scoped.expansion);
        const diff = diffShell({
          current: { keywords: currentKeywordRows, ads: scoped.adRows },
          uploaded: parsed,
        });
        setShellDiff(diff);
        setShellOpen(true);
      } catch (err) {
        console.error('[GoogleAdsShell] phase upload parse failed', err);
        toast.error('Could not read the Google Ads shell file');
      }
    },
    [loadGoogleShellContext, scopeShellContext],
  );

  const applyShellDiff = useCallback(async (selected: GoogleAdsShellDiff) => {
    const ctx = shellContextRef.current;
    if (!ctx) return;
    try {
      const hasKwChange =
        selected.keywords.added.length +
          selected.keywords.updated.length +
          selected.keywords.removed.length > 0;
      if (hasKwChange) {
        const nextKeywords = applyKeywordDiff(ctx.keywords, selected.keywords, ctx.expansion);
        const nextGeneric = { ...(ctx.generic || {}), selectedKeywords: nextKeywords };
        const { error } = await supabase
          .from('campaigns')
          .update({ generic_config: nextGeneric })
          .eq('id', campaignId);
        if (error) throw error;
      }
      for (const u of selected.ads.updated) {
        const payload = adChangesToAssignmentUpdate(u.changes);
        if (Object.keys(payload).length === 0) continue;
        const { error } = await supabase
          .from('creative_assignments')
          .update(payload as any)
          .eq('id', u.assignmentId);
        if (error) throw error;
      }
      const total =
        selected.keywords.added.length +
        selected.keywords.updated.length +
        selected.keywords.removed.length +
        selected.ads.updated.length;
      toast.success(`Applied ${total} change(s) from the Google Ads shell`);
    } catch (err) {
      console.error('[GoogleAdsShell] apply failed', err);
      toast.error('Failed to apply Google Ads shell changes');
    }
  }, [campaignId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading creative assignments...</p>
      </div>
    );
  }

  // Only show "No Assignments Found" if we've actually attempted to load and confirmed empty
  // For Google-configured campaigns, still allow access so users can use the shell tools.
  if (hasAttemptedLoad && mergedRows.length === 0 && !hasGoogleRows) {
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
          rows={mergedRows}
          campaignName={campaignName}
          onRowChange={handleRowChange}
          onBulkUpdate={handleBulkUpdate}
          onImportRows={handleImportRows}
          onSave={handleSaveOnly}
          isSaving={isSaving}
          onDeleteAssignment={handleDeleteAssignment}
          onDeleteAssignments={handleDeleteAssignments}
          onACGroupCreated={handleACGroupCreated}
          onACGroupRemoved={handleACGroupRemoved}
          hasGoogleRows={hasGoogleRows}
          onDownloadGoogleAdsShell={handleDownloadGoogleAdsShell}
          onUploadGoogleAdsShell={handleUploadGoogleAdsShell}
        />
      </div>

      <GoogleAdsShellReviewDialog
        open={shellOpen}
        onOpenChange={setShellOpen}
        diff={shellDiff}
        onApply={applyShellDiff}
      />

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