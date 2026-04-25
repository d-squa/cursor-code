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
import { GoogleSearchTextAssetEditor } from './GoogleSearchTextAssetEditor';
import { GoogleNonSearchTextAssetEditor } from './GoogleNonSearchTextAssetEditor';
import { ADVANTAGE_PLUS_ASSIGNMENT_FIELDS, type CreativeTextAssetRow, type CreativeFormat, type AdFormat } from '@/types/creativeTextAssets';
import { validateTextAssetRow } from '@/types/creativeTextAssets';
import type { CallToAction } from '@/types/creative';
import { detectAdFormat } from '@/utils/adFormatDetection';
import {
  buildExpandedStructure,
  buildAdRowsFromAssignments,
  buildCurrentKeywordRows,
  downloadGoogleAdsShell,
  downloadGooglePmaxAssetGroupShell,
  parseGoogleAdsShell,
  diffShell,
  applyKeywordDiff,
  adChangesToAssignmentUpdate,
  getGoogleAdsSheetSpec,
  type GoogleAdsShellDiff,
  type GoogleKeywordLike,
  type AssignmentLite,
  type PmaxAssetGroupShellRow,
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
  const [googleSearchEditorOpen, setGoogleSearchEditorOpen] = useState(false);
  const [googleNonSearchEditor, setGoogleNonSearchEditor] = useState<{ open: boolean; market?: string; phase?: string }>({ open: false });
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

  const deriveGoogleShellData = useCallback(
    (
      campaignData: {
        generic_config?: unknown;
        market_splits?: Record<string, any> | null;
        platforms?: any[] | null;
      } | null | undefined,
      fallbackMarkets: string[] = [],
    ) => {
      const generic = (campaignData?.generic_config as any) || {};
      const basicTargeting = generic?.targetingPreset || generic?.basicTargeting || {};
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
        if (
          googleDimension &&
          googleDimension !== 'none' &&
          Array.isArray(googleDefaultAdSets) &&
          googleDefaultAdSets.length > 0
        ) {
          return googleDefaultAdSets;
        }
        return undefined;
      };

      const genericPhases: any[] = Array.isArray(generic?.phases) ? generic.phases : [];
      const genericGooglePhases = genericPhases.filter((phase) => {
        const platforms = Array.isArray(phase?.platforms) ? phase.platforms : [];
        return platforms.some((platform: string) => String(platform).toLowerCase().includes('google'));
      });

      const basePhaseKey = (phase: any) =>
        `${String(phase?.name || '').trim().toLowerCase()}::${String(phase?.googleCampaignType || '').trim().toLowerCase()}`;
      const fullPhaseKey = (phase: any, market?: string) =>
        `${basePhaseKey(phase)}::${String(phase?.market || market || '').trim().toLowerCase()}`;

      const genericPhaseKeys = new Set<string>();
      const seenPhaseKeys = new Set<string>();
      const googlePhases: any[] = [];
      const pushPhase = (phase: any, market?: string, allowGenericDuplicate = true) => {
        const phaseName = String(phase?.name || '').trim();
        if (!phaseName) return;
        if (!allowGenericDuplicate && genericPhaseKeys.has(basePhaseKey(phase))) return;

        const phaseKey = fullPhaseKey(phase, market);
        if (seenPhaseKeys.has(phaseKey)) return;
        seenPhaseKeys.add(phaseKey);

        googlePhases.push({
          ...phase,
          market: phase?.market || market,
          adSets: inheritAdSets(phase),
        });
      };

      genericGooglePhases.forEach((phase) => {
        genericPhaseKeys.add(basePhaseKey(phase));
        pushPhase(phase, phase?.market, true);
      });

      const splits = (campaignData?.market_splits as Record<string, any>) || {};
      const googleMarketSet = new Set<string>();
      for (const [key, list] of Object.entries(splits)) {
        if (!key.toLowerCase().includes('google') || !Array.isArray(list)) continue;

        for (const marketEntry of list as any[]) {
          const marketName = marketEntry?.name || (typeof marketEntry === 'string' ? marketEntry : undefined);
          if (marketName) googleMarketSet.add(String(marketName));

          const phasesFromMarket = Array.isArray(marketEntry?.phases) ? marketEntry.phases : [];
          for (const phase of phasesFromMarket) {
            pushPhase(phase, marketName, false);
          }
        }
      }

      if (googleMarketSet.size === 0) {
        fallbackMarkets.forEach((market) => {
          if (market) googleMarketSet.add(String(market));
        });
        googlePhases.forEach((phase) => {
          if (phase?.market) googleMarketSet.add(String(phase.market));
        });
      }

      const keywordSources: any[] = [];
      const pushKeywords = (arr: unknown) => {
        if (Array.isArray(arr)) keywordSources.push(...arr);
      };
      // Top-level generic_config keywords (legacy)
      pushKeywords(generic?.selectedKeywords);
      pushKeywords(generic?.keywords);
      // Targeting blocks (where UnifiedTargeting persists keywords)
      pushKeywords(generic?.basicTargeting?.selectedKeywords);
      pushKeywords(generic?.basicTargeting?.keywords);
      pushKeywords(generic?.targeting?.selectedKeywords);
      pushKeywords(generic?.targeting?.keywords);
      pushKeywords(basicTargeting?.selectedKeywords);
      pushKeywords(basicTargeting?.keywords);
      // Per-phase keywords
      for (const phase of googlePhases) {
        pushKeywords(phase?.selectedKeywords);
        pushKeywords(phase?.keywords);
        pushKeywords(phase?.searchKeywords);
        pushKeywords(phase?.targeting?.selectedKeywords);
        pushKeywords(phase?.basicTargeting?.selectedKeywords);
      }
      // Per-market keywords inside market_splits
      for (const [key, list] of Object.entries(splits)) {
        if (!key.toLowerCase().includes('google') || !Array.isArray(list)) continue;
        for (const marketEntry of list as any[]) {
          pushKeywords(marketEntry?.selectedKeywords);
          pushKeywords(marketEntry?.keywords);
          pushKeywords(marketEntry?.targeting?.selectedKeywords);
          const mp = Array.isArray(marketEntry?.phases) ? marketEntry.phases : [];
          for (const ph of mp) {
            pushKeywords(ph?.selectedKeywords);
            pushKeywords(ph?.keywords);
            pushKeywords(ph?.searchKeywords);
            pushKeywords(ph?.targeting?.selectedKeywords);
          }
        }
      }

      const keywords: GoogleKeywordLike[] = keywordSources.filter(
        (keyword) => !keyword?.platform || String(keyword.platform).toLowerCase().includes('google'),
      );

      const platforms = Array.isArray(campaignData?.platforms) ? (campaignData.platforms as any[]) : [];
      const hasGoogleConfigured =
        genericGooglePhases.length > 0 ||
        Object.keys(splits).some((key) => key.toLowerCase().includes('google')) ||
        platforms.some((platform) =>
          String(platform?.id || platform?.name || platform || '').toLowerCase().includes('google'),
        );

      return {
        generic,
        googlePhases,
        markets: Array.from(googleMarketSet),
        keywords,
        hasGoogleConfigured,
      };
    },
    [],
  );

  // Detect whether the campaign has any Google configuration so we can show the
  // Google Search shell tools (Download / Upload / Edit) even before any creatives
  // are matched. We intentionally do NOT seed visual placeholder rows in the main
  // grid — Google Search ad authoring happens inside the dedicated Google Search
  // editor popup. Placeholder rows are only created later when a user uploads a
  // shell that contains brand-new RSA rows (handled in `applyShellDiff`).
  useEffect(() => {
    const detectGoogle = async () => {
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('name, generic_config, market_splits, platforms')
          .eq('id', campaignId)
          .single();

        if (error) throw error;

        const derived = deriveGoogleShellData(data as any);
        setHasGoogleConfigured(derived.hasGoogleConfigured);
      } catch (error) {
        console.warn('[TextAssetsStep] failed to detect Google config', error);
        setHasGoogleConfigured(false);
      }
    };

    detectGoogle();
  }, [campaignId, deriveGoogleShellData]);

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
              ad_group_name,
               status,
               dsp_creative_id,
              ad_strategy,
              call_to_action,
              destination_url,
              path_1,
              path_2,
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
              headline_pins,
              description_pins,
              primary_text,
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
                platform_metadata,
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
          .select('id, name, objective, start_date, end_date, bo_number, total_budget, platforms, budget_allocation, market_splits, generic_config, team_id, teams(name)')
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

        // Build a (platform, market, phase) → googleCampaignType lookup so we can
        // restore the campaign type on saved Google assignments. Without this,
        // PMax / Demand Gen / Video / Display rows lose their type on reload and
        // the non-Search editor can't detect them. See Issue #132.
        const googleTypeByKey = new Map<string, string>();
        const normalizePhase = (p: string) => String(p || '').trim().toLowerCase();
        const structureKey = (market: string, phase: string) =>
          `${String(market || '').trim().toLowerCase()}::${normalizePhase(phase)}`;
        const registerGooglePhaseType = (phase: any, fallbackMarket?: string) => {
          if (!phase?.googleCampaignType) return;
          const market = phase?.market || fallbackMarket || 'Global';
          const phaseName = String(phase?.name || '').trim();
          if (!phaseName) return;
          googleTypeByKey.set(structureKey(market, phaseName), phase.googleCampaignType);
        };

        (campaignStructures || []).forEach((s) => {
          if (String(s.platform || '').toLowerCase() !== 'google') return;
          const market = s.market || 'Global';
          const phases = (s.phases && s.phases.length > 0)
            ? s.phases
            : (s.funnelStage ? [s.funnelStage] : []);
          for (const phase of phases) {
            registerGooglePhaseType({ name: phase, market, googleCampaignType: s.googleCampaignType }, market);
          }
        });

        const derivedGoogleConfig = deriveGoogleShellData(campaign as any);
        derivedGoogleConfig.googlePhases.forEach((phase: any) => registerGooglePhaseType(phase, phase?.market));

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
          let adSetName = assignment.ad_group_name || assignment.ad_set_name || savedAssignment?.adSetName;
          
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
            googleCampaignType: assignment.platform === 'google'
              ? (assignment.ad_strategy
                  ? 'Search'
                  : googleTypeByKey.get(structureKey(assignment.market || 'Global', assignment.phase_name || 'Default')))
              : undefined,
            googleStrategy: assignment.ad_strategy || null,
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
            // Prefer the saved assignment-level copy over the creative library defaults.
            // The non-Search Google editor stores all extended assets (multiple
            // headlines/descriptions, long headlines, business name, pins JSON) on
            // creative_assignments — without copying them here they appear empty
            // when the editor reopens.
            headline: assignment.headline || creative?.headline || '',
            headline2: assignment.headline_2 || undefined,
            headline3: assignment.headline_3 || undefined,
            headline4: assignment.headline_4 || undefined,
            headline5: assignment.headline_5 || undefined,
            description: assignment.description || creative?.description || '',
            description2: assignment.description_2 || undefined,
            description3: assignment.description_3 || undefined,
            description4: assignment.description_4 || undefined,
            description5: assignment.description_5 || undefined,
            // Long headlines + business name + pin payloads (Google PMax/Demand Gen/Display).
            long_headline_1: assignment.long_headline_1 || undefined,
            long_headline_2: assignment.long_headline_2 || undefined,
            long_headline_3: assignment.long_headline_3 || undefined,
            long_headline_4: assignment.long_headline_4 || undefined,
            long_headline_5: assignment.long_headline_5 || undefined,
            business_name: assignment.business_name || undefined,
            brandName: assignment.business_name || assignment.brand_name || undefined,
            headline_pins: assignment.headline_pins || undefined,
            description_pins: assignment.description_pins || undefined,
            path_1: assignment.path_1 || undefined,
            path_2: assignment.path_2 || undefined,
            caption: creative?.caption || '',
            // Prefer the assignment-level CTA (which the editor / Excel import writes)
            // over the creative-library default. Falls back to LEARN_MORE only when
            // neither layer has a value.
            callToAction: (assignment.call_to_action || creative?.call_to_action || 'LEARN_MORE') as CallToAction,
            destinationUrl: assignment.destination_url || creative?.destination_url || '',
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
  }, [savedAssignments, campaignId, campaignName, campaignStructures]);

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
    // Also patch uploaded Google Search RSA placeholders so edits persist —
    // these rows live in a separate state slice and are merged into mergedRows.
    setGooglePlaceholderRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, ...updates } as CreativeTextAssetRow;
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
    setGooglePlaceholderRows(prev => prev.map(row => {
      if (!ids.includes(row.id)) return row;
      const updated = { ...row, ...updates } as CreativeTextAssetRow;
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
    // The editor receives `mergedRows` (real assignments + Google Search RSA
    // placeholders), so importedRows contains both. Split them back into the
    // correct state slice — otherwise placeholder rows leak into `rows` and
    // duplicate after the next merge, while real edits get dropped.
    const importedById = new Map(validatedRows.map(r => [r.id, r] as const));
    setRows(prev => prev.map(row => (importedById.get(row.id) as CreativeTextAssetRowWithTikTok | undefined) ?? row));
    setGooglePlaceholderRows(prev => prev.map(row => {
      const imported = importedById.get(row.id);
      return imported ? ({ ...row, ...imported } as CreativeTextAssetRow) : row;
    }));
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
  const persistTextAssets = useCallback(async (
    rowsToSave: CreativeTextAssetRow[],
    placeholderRowsToSave: CreativeTextAssetRow[],
    options?: { successMessage?: string; skipSuccessToast?: boolean },
  ): Promise<boolean> => {
    setIsSaving(true);

    try {
      // Update creatives with text assets. Structural shell rows have no
      // creativeId, so they are intentionally excluded from persistence.
      const updates = rowsToSave.filter(row => row.creativeId).map(row => ({
        id: row.creativeId,
        primary_text: row.primaryText,
        headline: row.headline,
        description: row.description,
        call_to_action: row.callToAction,
        destination_url: row.destinationUrl,
        youtubeVideoUrl: row.youtubeVideoUrl,
      }));

      // Batch update creatives
      for (const update of updates) {
        // For Demand Gen / Video Google ads, persist the YouTube URL +
        // extracted ID into platform_metadata so the DSP push can attach the
        // video asset to the creative.
        let platformMetadataPatch: Record<string, unknown> | null = null;
        if (update.youtubeVideoUrl && String(update.youtubeVideoUrl).trim()) {
          const url = String(update.youtubeVideoUrl).trim();
          const idMatch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/)
            || url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)
            || url.match(/\/(?:shorts|embed|v)\/([A-Za-z0-9_-]{11})/)
            || url.match(/^([A-Za-z0-9_-]{11})$/);
          const youtubeId = idMatch ? idMatch[1] : undefined;
          platformMetadataPatch = {
            youtube_video_url: url,
            ...(youtubeId ? { youtube_video_id: youtubeId } : {}),
          };
        }

        // Read existing metadata so we merge instead of overwriting other keys.
        let mergedMetadata: Record<string, unknown> | undefined;
        if (platformMetadataPatch) {
          const { data: existing } = await supabase
            .from('creatives')
            .select('platform_metadata')
            .eq('id', update.id)
            .maybeSingle();
          mergedMetadata = {
            ...((existing?.platform_metadata as Record<string, unknown> | null) || {}),
            ...platformMetadataPatch,
          };
        }

        const { error } = await supabase
          .from('creatives')
          .update({
            primary_text: update.primary_text,
            headline: update.headline,
            description: update.description,
            call_to_action: update.call_to_action,
            destination_url: update.destination_url,
            ...(mergedMetadata ? { platform_metadata: mergedMetadata as any } : {}),
          })
          .eq('id', update.id);

        if (error) {
          console.error('Error updating creative:', error);
          throw error;
        }
      }

      // Persist carousel group data to creative_assignments
      for (const row of rowsToSave) {
        const assignmentId = row.assignmentId;
        if (!assignmentId) continue;

        const advantagePlusUpdates = ADVANTAGE_PLUS_ASSIGNMENT_FIELDS.reduce<Record<string, boolean | undefined>>((acc, field) => {
          acc[field] = row[field];
          return acc;
        }, {});

        await supabase
          .from('creative_assignments')
          .update({
            ad_group_name: row.adSet || null,
            ad_strategy: (row as any).googleStrategy || null,
            primary_text: row.primaryText || null,
            headline: row.headline || null,
            headline_2: (row as any).headline2 || null,
            headline_3: (row as any).headline3 || null,
            headline_4: (row as any).headline4 || null,
            headline_5: (row as any).headline5 || null,
            description: row.description || null,
            description_2: (row as any).description2 || null,
            description_3: (row as any).description3 || null,
            description_4: (row as any).description4 || null,
            description_5: (row as any).description5 || null,
            long_headline_1: (row as any).long_headline_1 || null,
            long_headline_2: (row as any).long_headline_2 || null,
            long_headline_3: (row as any).long_headline_3 || null,
            long_headline_4: (row as any).long_headline_4 || null,
            long_headline_5: (row as any).long_headline_5 || null,
            business_name: (row as any).business_name || row.brandName || null,
            brand_name: row.brandName || null,
            headline_pins: (row as any).headline_pins || null,
            description_pins: (row as any).description_pins || null,
            path_1: (row as any).path_1 || null,
            path_2: (row as any).path_2 || null,
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

      // ========== PERSIST GOOGLE SEARCH RSA PLACEHOLDERS ==========
      // Uploaded Google Search RSAs live in `googlePlaceholderRows` with no
      // creativeId / assignmentId. Without persistence, they never appear on
      // the Launch Status page (Meshed Creatives) and cannot be pushed to DSP.
      // For each placeholder, we create a lightweight text-only creative row
      // and a matching creative_assignment carrying the headlines/descriptions.
      const rsaPlaceholders = placeholderRowsToSave.filter(
        (p) => (p.platform || '').toLowerCase() === 'google' && !p.assignmentId,
      );
      if (rsaPlaceholders.length > 0) {
        const { data: sd } = await supabase.auth.getSession();
        const userId = sd.session?.user?.id;
        if (!userId) throw new Error('User session not found while saving Google Search RSAs');

        const newAssignmentIds = new Map<string, string>(); // row.id -> assignmentId

        for (const p of rsaPlaceholders) {
          // 1. Create a text-only creative shell so the FK is satisfied.
          const { data: createdCreative, error: creativeErr } = await supabase
            .from('creatives')
            .insert({
              user_id: userId,
              campaign_id: campaignId,
              name: p.creativeName || p.taxonomyAdName || 'Google Search RSA',
              platform: 'google',
              market: p.market,
              phase_name: p.phase || null,
              creative_type: 'image',
              status: 'draft',
              media_urls: [],
            } as any)
            .select('id')
            .single();
          if (creativeErr) throw creativeErr;

          // 2. Create the creative_assignment carrying the RSA copy.
          const { data: createdAssignment, error: assignErr } = await supabase
            .from('creative_assignments')
            .insert({
              campaign_id: campaignId,
              creative_id: createdCreative.id,
              platform: 'google',
              market: p.market,
              phase_name: p.phase || 'Default',
              ad_set_name: p.adSet || 'Default',
              ad_group_name: p.adSet || 'Default',
              ad_strategy: (p as any).googleStrategy || 'brand',
              display_name: p.creativeName || p.taxonomyAdName || null,
              assigned_by: userId,
              status: 'pending',
              primary_text: p.primaryText || null,
              headline: p.headline || null,
              headline_2: (p as any).headline2 || null,
              headline_3: (p as any).headline3 || null,
              headline_4: (p as any).headline4 || null,
              headline_5: (p as any).headline5 || null,
              description: p.description || null,
              description_2: (p as any).description2 || null,
              description_3: (p as any).description3 || null,
              description_4: (p as any).description4 || null,
              description_5: (p as any).description5 || null,
              headline_pins: (p as any).headline_pins || null,
              description_pins: (p as any).description_pins || null,
              path_1: (p as any).path_1 || null,
              path_2: (p as any).path_2 || null,
              brand_name: p.brandName || null,
              call_to_action: p.callToAction || null,
              destination_url: p.destinationUrl || null,
            } as any)
            .select('id')
            .single();
          if (assignErr) throw assignErr;

          newAssignmentIds.set(p.id, createdAssignment.id);
        }

        if (newAssignmentIds.size > 0) {
          setGooglePlaceholderRows((prev) =>
            prev.map((r) => {
              const newId = newAssignmentIds.get(r.id);
              return newId ? ({ ...r, assignmentId: newId } as CreativeTextAssetRow) : r;
            }),
          );
        }
      }

      // Also push updates to RSAs that already have an assignmentId (subsequent edits).
      const rsaWithAssignment = placeholderRowsToSave.filter(
        (p) => (p.platform || '').toLowerCase() === 'google' && p.assignmentId,
      );
      for (const p of rsaWithAssignment) {
        await supabase
          .from('creative_assignments')
          .update({
            ad_strategy: (p as any).googleStrategy || 'brand',
            ad_group_name: p.adSet || 'Default',
            primary_text: p.primaryText || null,
            headline: p.headline || null,
            headline_2: (p as any).headline2 || null,
            headline_3: (p as any).headline3 || null,
            headline_4: (p as any).headline4 || null,
            headline_5: (p as any).headline5 || null,
            description: p.description || null,
            description_2: (p as any).description2 || null,
            description_3: (p as any).description3 || null,
            description_4: (p as any).description4 || null,
            description_5: (p as any).description5 || null,
            headline_pins: (p as any).headline_pins || null,
            description_pins: (p as any).description_pins || null,
            path_1: (p as any).path_1 || null,
            path_2: (p as any).path_2 || null,
            brand_name: p.brandName || null,
            call_to_action: p.callToAction || null,
            destination_url: p.destinationUrl || null,
          } as any)
          .eq('id', p.assignmentId);
      }

      const totalSaved = rowsToSave.length + rsaPlaceholders.length + rsaWithAssignment.length;
      if (!options?.skipSuccessToast && totalSaved > 0) {
        toast.success(options?.successMessage || `Saved text assets for ${totalSaved} creatives`);
      }
      return true;
    } catch (error) {
      console.error('Error saving text assets:', error);
      toast.error('Failed to save text assets');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [campaignId]);

  const saveTextAssets = useCallback(async (): Promise<boolean> => {
    return persistTextAssets(rows, googlePlaceholderRows);
  }, [persistTextAssets, rows, googlePlaceholderRows]);

  const saveGoogleSearchTextAssets = useCallback(async (): Promise<boolean> => {
    const isGoogleSearchRow = (row: CreativeTextAssetRow) => {
      if ((row.platform || '').toLowerCase() !== 'google') return false;
      const type = String(row.googleCampaignType || '').toLowerCase();
      if (type.includes('search')) return true;
      if (!type && !!row.googleStrategy) return true;
      return false;
    };

    const googleSearchRows = rows.filter(isGoogleSearchRow);
    const googleSearchPlaceholders = googlePlaceholderRows.filter(isGoogleSearchRow);

    return persistTextAssets(googleSearchRows, googleSearchPlaceholders);
  }, [persistTextAssets, rows, googlePlaceholderRows]);

  const handleSaveAndProceed = useCallback(async () => {
    // PMax hard-block: every PMax asset group must satisfy the minimums
    // (3H/1LH/2D w/ short ≤60, business name, 1.91:1 image, 1:1 image, logo).
    const { arePmaxGroupsValid, validatePmaxAssetGroups } = await import(
      '@/utils/pmaxAssetGroupValidation'
    );
    const { valid, failingGroups } = arePmaxGroupsValid(rows);
    if (!valid) {
      const summary = failingGroups
        .slice(0, 3)
        .map((g) => `• ${g.market} · ${g.phase} · ${g.adGroup}: ${g.errors[0]?.message || 'incomplete'}`)
        .join('\n');
      const more = failingGroups.length > 3 ? `\n…and ${failingGroups.length - 3} more` : '';
      toast.error('Performance Max requirements not met', {
        description: `${failingGroups.length} asset group${failingGroups.length === 1 ? '' : 's'} cannot be saved:\n${summary}${more}`,
      });
      return;
    }
    const ok = await saveTextAssets();
    if (!ok) return;

    // Mirror PMax rows into the new shared-asset-pool tables (pmax_asset_groups
    // + pmax_text_assets + pmax_creative_assets). push-pmax-asset-groups reads
    // EXCLUSIVELY from these tables — must run before the auto-push below.
    try {
      const { syncPmaxGroupsFromRows } = await import('@/utils/pmaxAssetGroupRepo');
      const { isPmaxRow } = await import('@/utils/pmaxAssetGroupValidation');
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const result = await syncPmaxGroupsFromRows(campaignId, user.id, rows, isPmaxRow);
        if (result.errors.length > 0) {
          console.warn('[pmax-sync] partial failures:', result.errors);
        }
      }
    } catch (err) {
      console.warn('[pmax-sync] failed before auto-push:', err);
    }

    // Auto-trigger PMax asset-group push for any (market, phase) that has
    // validated PMax groups. Fire-and-forget — the user will see results on
    // /status (real-time), and they can also retry via the per-PMax button.
    try {
      const validGroups = validatePmaxAssetGroups(rows).filter((g) => g.errors.length === 0);
      const pairs = new Set<string>();
      for (const g of validGroups) {
        pairs.add(`${g.market}||${g.phase}`);
      }
      if (pairs.size > 0) {
        toast.info(`Pushing ${pairs.size} PMax asset group target${pairs.size === 1 ? '' : 's'} to DSP…`);
        // Fire all in parallel, don't await — onComplete navigates away.
        Promise.allSettled(
          Array.from(pairs).map((pair) => {
            const [market, phaseName] = pair.split('||');
            return supabase.functions.invoke('push-pmax-asset-groups', {
              body: { campaignId, market, phaseName, retryFailed: true },
            });
          }),
        ).then((results) => {
          const failed = results.filter((r) => r.status === 'rejected').length;
          if (failed > 0) {
            console.warn(`[auto-push-pmax] ${failed} invocation(s) rejected`);
          }
        });
      }
    } catch (err) {
      console.warn('[auto-push-pmax] failed to schedule:', err);
    }

    onComplete();
  }, [saveTextAssets, onComplete, rows, campaignId]);

  // TextAssetExcelEditor expects onSave to return Promise<void>
  const handleSaveOnly = useCallback(async (): Promise<void> => {
    await saveTextAssets();
  }, [saveTextAssets]);

  const validCount = useMemo(() => 
    rows.filter(r => validateTextAssetRow(r).length === 0).length
  , [rows]);

  // Apply the source PMax asset group's images (Marketing 1.91:1, Square 1:1,
  // Logo) to every other PMax (market, phase, adGroup) group in this campaign.
  // Creates new creative_assignments rows referencing the same creative_id, so
  // each asset group independently satisfies Google's image minimums.
  const handleApplyImagesToAllPmaxGroups = useCallback(async (sourceGroupKey: string) => {
    try {
      const { validatePmaxAssetGroups, pmaxGroupKey } = await import('@/utils/pmaxAssetGroupValidation');
      const groups = validatePmaxAssetGroups(rows);
      const source = groups.find((g) => g.groupKey === sourceGroupKey);
      if (!source) {
        toast.error('Source asset group not found');
        return;
      }
      const targets = groups.filter((g) => g.groupKey !== sourceGroupKey);
      if (targets.length === 0) {
        toast.info('No other PMax asset groups to apply to');
        return;
      }
      // Source images = marketing + square + logo rows, dedup by creativeId.
      const sourceImageRows = [
        ...source.buckets.marketingImages,
        ...source.buckets.squareImages,
        ...source.buckets.logos,
      ];
      const seen = new Set<string>();
      const dedupedSource = sourceImageRows.filter((r) => {
        if (!r.creativeId || seen.has(r.creativeId)) return false;
        seen.add(r.creativeId);
        return true;
      });
      if (dedupedSource.length === 0) {
        toast.info('Source group has no qualifying images to apply');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      let inserted = 0;
      let skipped = 0;
      const newAssignments: any[] = [];

      for (const target of targets) {
        const targetCreativeIds = new Set(target.rows.map((r) => r.creativeId).filter(Boolean));
        for (const srcRow of dedupedSource) {
          if (targetCreativeIds.has(srcRow.creativeId)) {
            skipped++;
            continue;
          }
          const { data: created, error } = await supabase
            .from('creative_assignments')
            .insert({
              campaign_id: campaignId,
              creative_id: srcRow.creativeId,
              platform: 'google',
              market: target.market,
              phase_name: target.phase || 'Default',
              ad_set_name: target.adGroup || 'Default',
              ad_group_name: target.adGroup || 'Default',
              ad_strategy: (srcRow as any).googleStrategy || 'pmax',
              display_name: srcRow.creativeName || null,
              assigned_by: userId,
              status: 'pending',
            } as any)
            .select('id')
            .single();
          if (error) {
            console.error('[applyImagesToAllPmax] insert failed', error);
            continue;
          }
          newAssignments.push({ assignmentId: created.id, target, srcRow });
          inserted++;
        }
      }

      if (inserted === 0) {
        toast.info(`No new assignments created (${skipped} already present).`);
        return;
      }

      // Optimistically add new rows so the validation panel reflects them
      // immediately — they'll be re-fetched on next reload.
      setRows((prev) => {
        const additions: CreativeTextAssetRow[] = newAssignments.map(({ assignmentId, target, srcRow }) => ({
          ...srcRow,
          id: `pmax-applied-${assignmentId}`,
          assignmentId,
          market: target.market,
          phase: target.phase,
          adSet: target.adGroup,
        } as CreativeTextAssetRow));
        return [...prev, ...additions];
      });

      toast.success(
        `Applied ${dedupedSource.length} image${dedupedSource.length === 1 ? '' : 's'} to ${targets.length} other PMax asset group${targets.length === 1 ? '' : 's'} (${inserted} new, ${skipped} already present).`,
      );
    } catch (err) {
      console.error('[applyImagesToAllPmax] failed', err);
      toast.error('Failed to apply images to other PMax asset groups');
    }
  }, [rows, campaignId]);

  const handleDeleteAssignments = useCallback(async (assignmentIds: string[]) => {
    const uniqueIds = Array.from(new Set(assignmentIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    try {
      const { error } = await supabase
        .from('creative_assignments')
        .delete()
        .in('id', uniqueIds);
      
      if (error) throw error;
      
      // Remove from local state (both regular rows and Google Search RSA placeholders)
      setRows(prev => prev.filter(r => !uniqueIds.includes((r as any).assignmentId)));
      setGooglePlaceholderRows(prev => prev.filter(r => !uniqueIds.includes((r as any).assignmentId)));
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

  // Build shell rows for ad sets that have no creative assignments yet so the
  // hierarchy still shows the full campaign shell (including Google Search and
  // Video structures). These rows are structural only and are not saved as ads.
  const structurePlaceholderRows = useMemo<CreativeTextAssetRow[]>(() => {
    if (!campaignStructures || campaignStructures.length === 0) return [];
    const placeholders: CreativeTextAssetRow[] = [];
    campaignStructures.forEach((s, idx) => {
      const platform = String(s.platform || '').toLowerCase();
      const market = s.market || 'Global';
      const phase = (s.phases && s.phases[0]) || s.funnelStage || 'Default';
      const adSet = s.adSetName || 'Ad Set';
      const googleCampaignType = platform.includes('google') ? s.googleCampaignType : undefined;
      const isGoogleVideo = String(googleCampaignType || '').toLowerCase().includes('video');
      const mediaType: 'image' | 'video' = isGoogleVideo ? 'video' : 'image';
      placeholders.push({
        id: `structure_shell_${platform}_${market}_${phase}_${adSet}_${idx}`,
        creativeId: '',
        assignmentId: '',
        platform,
        market,
        phase,
        adSet,
        googleCampaignType,
        googleStrategy: platform.includes('google') ? s.keywordStrategy || null : null,
        creativeName: platform.includes('google') ? '— Campaign shell —' : '— No creative assigned —',
        creativeFormat: mediaType,
        taxonomyCampaignName: s.campaignName || campaignName,
        taxonomyAdSetName: adSet,
        taxonomyAdName: '',
        adFormat: isGoogleVideo ? 'display_video' : 'other',
        suggestedAdFormat: isGoogleVideo ? 'display_video' : 'other',
        adFormatConfirmed: false,
        primaryText: '',
        headline: '',
        description: '',
        callToAction: 'LEARN_MORE',
        destinationUrl: '',
        autoBuildUtm: false,
        isValid: true,
        validationErrors: [],
        mediaType,
        pushStatus: 'draft',
        isShellPlaceholder: true,
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

    // Split a phase label like "Search — Conversion • Brand" or
    // "Search — Conversion - Brand" into base + strategy so we can compare
    // placeholders against real rows regardless of which separator was used.
    const splitPhaseLabel = (label: string): { base: string; strategy: string } => {
      const text = (label || '').trim();
      // Try bullet first (used by Google placeholders), then trailing " - Strategy".
      const bulletIdx = text.lastIndexOf(' • ');
      if (bulletIdx !== -1) {
        return {
          base: text.slice(0, bulletIdx).trim(),
          strategy: text.slice(bulletIdx + 3).trim().toLowerCase(),
        };
      }
      const m = text.match(/^(.*?)\s*[-–—]\s*(brand|generic|competition)\s*$/i);
      if (m) return { base: m[1].trim(), strategy: m[2].toLowerCase() };
      return { base: text, strategy: '' };
    };

    // Collect (platform, market, basePhase, adSet) tuples that already have a
    // real or uploaded Google placeholder row, so we can suppress the empty
    // "— Campaign shell —" structural placeholders for the *same ad set*. We
    // intentionally keep the ad-set in the key so that an empty ad group in a
    // phase that has another populated ad group still surfaces as a shell row.
    const occupiedSlots = new Set<string>();
    // Google Search shells have an extra dimension (Brand/Generic/Competition).
    // Uploaded RSA placeholders use ref.adGroupName="Default", while structural
    // placeholders carry a taxonomy-decorated adSetName like "MyTaxo · Brand".
    // To dedupe, track Google Search occupancy by (market, basePhase, strategy)
    // independently of the ad-set label.
    const occupiedGoogleSearchStrategies = new Set<string>();
    const addOccupied = (platform: string, market: string, phase: string, adSet: string) => {
      const { base } = splitPhaseLabel(phase);
      occupiedSlots.add(`${platform}|${market}|${base}|${adSet || ''}`);
    };
    const addOccupiedGoogleStrategy = (
      market: string,
      phase: string,
      strategy: string | null | undefined,
    ) => {
      if (!strategy) return;
      const { base } = splitPhaseLabel(phase);
      occupiedGoogleSearchStrategies.add(
        `${market}|${base}|${String(strategy).toLowerCase()}`,
      );
    };
    for (const r of out) {
      addOccupied((r.platform || '').toLowerCase(), r.market, r.phase || '', r.adSet || '');
      if ((r.platform || '').toLowerCase() === 'google') {
        const { strategy } = splitPhaseLabel(r.phase || '');
        addOccupiedGoogleStrategy(r.market, r.phase || '', strategy || (r as any).googleStrategy);
      }
    }
    for (const p of googlePlaceholderRows) {
      addOccupied((p.platform || '').toLowerCase(), p.market, p.phase || '', p.adSet || '');
      const { strategy } = splitPhaseLabel(p.phase || '');
      addOccupiedGoogleStrategy(p.market, p.phase || '', strategy || (p as any).googleStrategy);
    }

    // Add Meta/TikTok/Google structural placeholders for ad sets without any
    // assignment, but suppress them only when a real or uploaded row already
    // covers the same (platform, market, base phase, ad set) slot.
    if (structurePlaceholderRows.length > 0) {
      const realKeys = new Set(
        rows.map((r) => `${(r.platform || '').toLowerCase()}|${r.market}|${r.phase}|${r.adSet}`),
      );
      for (const p of structurePlaceholderRows) {
        const key = `${(p.platform || '').toLowerCase()}|${p.market}|${p.phase}|${p.adSet}`;
        if (realKeys.has(key)) continue;
        const platform = (p.platform || '').toLowerCase();
        const { base } = splitPhaseLabel(p.phase || '');
        if (occupiedSlots.has(`${platform}|${p.market}|${base}|${p.adSet || ''}`)) continue;
        // Google Search: also suppress when an uploaded/real row covers the
        // same (market, basePhase, strategy) regardless of ad-set label, so
        // that a "MyTaxo · Brand" structural placeholder collapses with the
        // uploaded "Default" ad group from the RSA shell.
        const strat = (p as any).googleStrategy;
        if (
          platform === 'google' &&
          strat &&
          occupiedGoogleSearchStrategies.has(
            `${p.market}|${base}|${String(strat).toLowerCase()}`,
          )
        ) {
          continue;
        }
        out.push(p);
      }
    }

    // Add Google shell placeholders — suppress only when a real assignment
    // already exists for the same (market, base phase, ad set). Real
    // assignments may decorate adSet with full DSP taxonomy, but the ad-set
    // identity itself is still what distinguishes one ad group from another.
    if (googlePlaceholderRows.length > 0) {
      const realGoogleSlots = new Set<string>();
      for (const r of rows) {
        if ((r.platform || '').toLowerCase() !== 'google') continue;
        const { base } = splitPhaseLabel(r.phase || '');
        realGoogleSlots.add(`${r.market}|${base}|${r.adSet || ''}`);
      }

      for (const p of googlePlaceholderRows) {
        const { base } = splitPhaseLabel(p.phase || '');
        if (realGoogleSlots.has(`${p.market}|${base}|${p.adSet || ''}`)) continue;
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
      .select('name, generic_config, market_splits, platforms')
      .eq('id', campaignId)
      .single();
    if (campErr) throw campErr;

    const derived = deriveGoogleShellData(
      camp as any,
      rows.filter((row) => row.platform === 'google' && row.market).map((row) => row.market),
    );

    const expansion = buildExpandedStructure({
      campaignName: camp?.name || campaignName || 'Campaign',
      phases: derived.googlePhases.map((p: any) => ({
        id: p.id,
        name: p.name,
        googleCampaignType: p.googleCampaignType,
        googleSearchSplitLevel: p.googleSearchSplitLevel,
        adSets: p.adSets,
        market: p.market,
      })),
      markets: derived.markets,
      keywords: derived.keywords,
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
         creatives ( name, platform_metadata, media_urls )`,
      )
      .eq('campaign_id', campaignId)
      .eq('platform', 'google');
    if (aErr) throw aErr;

    const liveRowsByAssignmentId = new Map(
      mergedRows
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
      campaignName: camp?.name || campaignName || 'Campaign',
      generic: derived.generic,
      keywords: derived.keywords,
      expansion,
      adRows,
    };
  }, [campaignId, campaignName, deriveGoogleShellData, rows]);

  const buildPmaxAssetGroupShellRows = useCallback((sourceRows: CreativeTextAssetRow[]): PmaxAssetGroupShellRow[] => {
    const pmaxRows = sourceRows.filter((row) => {
      if ((row.platform || '').toLowerCase() !== 'google') return false;
      return getGoogleAdsSheetSpec(row.googleCampaignType).type === 'pmax';
    });
    // Group by the RESOLVED asset-group name (same value used downstream as
    // `assetGroupName`). Grouping by raw `adSet` here would create two buckets
    // for rows that share a taxonomy name but differ in raw ad-set / strategy
    // split, producing visually-identical duplicate rows in the shell.
    const grouped = new Map<string, CreativeTextAssetRow[]>();
    for (const row of pmaxRows) {
      const resolvedName = String((row as any).taxonomyAdSetName || row.adSet || '').trim();
      const key = `${row.market}||${row.phase}||${resolvedName}`;
      const bucket = grouped.get(key) || [];
      bucket.push(row);
      grouped.set(key, bucket);
    }
    return Array.from(grouped.values()).map((groupRows) => {
      const anchor = groupRows.reduce((best, cur) => {
        const score = (r: any) => [
          r.headline, r.headline2, r.headline3, r.headline4, r.headline5,
          r.primaryText, r.description, r.description2, r.description3, r.description4, r.description5,
          r.brandName, r.destinationUrl, r.callToAction,
        ].filter((v) => String(v || '').trim()).length;
        return score(cur) > score(best) ? cur : best;
      }, groupRows[0]);
      const byKind = { marketingImages: [] as string[], squareImages: [] as string[], portraitImages: [] as string[], logos: [] as string[], videos: [] as string[] };
      const seen = new Set<string>();
      for (const row of groupRows) {
        if (!row.creativeName || seen.has(row.creativeId || row.creativeName)) continue;
        seen.add(row.creativeId || row.creativeName);
        const label = row.creativeName;
        if (row.mediaType === 'video') byKind.videos.push(label);
        else if (/logo/i.test(`${row.creativeName} ${row.originalFilename || ''} ${row.folderPath || ''}`)) byKind.logos.push(label);
        else if (row.aspectRatio?.includes('1:1')) byKind.squareImages.push(label);
        else if (row.aspectRatio?.includes('4:5')) byKind.portraitImages.push(label);
        else byKind.marketingImages.push(label);
      }
      const a = anchor as any;
      const resolvedAssetGroupName = String(a.taxonomyAdSetName || anchor.adSet || '').trim();
      return {
        market: anchor.market,
        phaseName: anchor.phase,
        // Use the fully-resolved taxonomy ad-group name so the Excel matches
        // what's registered in campaign_launch_status.entity_name (which is
        // what push-pmax-asset-groups looks up by).
        assetGroupName: resolvedAssetGroupName,
        groupName: anchor.taxonomyAdSetName || anchor.adSet,
        businessName: anchor.brandName || a.business_name || '',
        finalUrl: anchor.destinationUrl || '',
        callToAction: String(anchor.callToAction || ''),
        headlines: [anchor.headline, anchor.headline2, anchor.headline3, anchor.headline4, anchor.headline5].map((v) => String(v || '')),
        longHeadlines: [anchor.primaryText, a.long_headline_2, a.long_headline_3, a.long_headline_4, a.long_headline_5].map((v) => String(v || '')),
        descriptions: [anchor.description, anchor.description2, anchor.description3, anchor.description4, anchor.description5].map((v) => String(v || '')),
        ...byKind,
      };
    });
  }, []);

  const handleDownloadGoogleAdsShell = useCallback(async () => {
    try {
      const ctx = await loadGoogleShellContext();
      const allPmax = ctx.expansion.length > 0 && ctx.expansion.every((ref) => getGoogleAdsSheetSpec(ref.googleCampaignType).type === 'pmax');
      if (allPmax) {
        const groups = buildPmaxAssetGroupShellRows(rows);
        await downloadGooglePmaxAssetGroupShell({ campaignName: ctx.campaignName, groups });
      } else {
        downloadGoogleAdsShell({
          campaignName: ctx.campaignName,
          expansion: ctx.expansion,
          keywords: ctx.keywords,
          adRows: ctx.adRows,
        });
      }
      toast.success('Google Ads shell downloaded');
    } catch (err) {
      console.error('[GoogleAdsShell] download failed', err);
      toast.error('Failed to download Google Ads shell');
    }
  }, [buildPmaxAssetGroupShellRows, loadGoogleShellContext, rows]);

  // Snapshot current PMax asset groups so the diff can compare uploaded values
  // against what is already saved in pmax_asset_groups + pmax_text_assets.
  const loadCurrentPmaxSnapshots = useCallback(async () => {
    // Always derive a baseline from the current editor `rows` so the diff has a
    // key to match against even when a PMax group has not yet been persisted to
    // pmax_asset_groups (first upload, before "Save & Proceed"). The DB
    // snapshot then overrides per-key, so already-persisted groups still diff
    // against their authoritative stored values.
    const rowDerivedShell = buildPmaxAssetGroupShellRows(rows);
    const rowDerived = rowDerivedShell.map((g) => ({
      market: g.market,
      phaseName: g.phaseName,
      assetGroupName: g.assetGroupName,
      businessName: g.businessName || '',
      finalUrl: g.finalUrl || '',
      callToAction: g.callToAction || '',
      headlines: g.headlines || [],
      longHeadlines: g.longHeadlines || [],
      descriptions: g.descriptions || [],
    }));
    const byKey = new Map<string, typeof rowDerived[number]>();
    for (const r of rowDerived) {
      byKey.set(`${r.market}||${r.phaseName}||${r.assetGroupName}`, r);
    }
    try {
      const { fetchPmaxAssetGroups } = await import('@/utils/pmaxAssetGroupRepo');
      const groups = await fetchPmaxAssetGroups(campaignId);
      for (const g of groups) {
        const key = `${g.group.market}||${g.group.phase_name}||${g.group.ad_group_name}`;
        byKey.set(key, {
          market: g.group.market,
          phaseName: g.group.phase_name,
          assetGroupName: g.group.ad_group_name,
          businessName: g.group.business_name || '',
          finalUrl: g.group.final_url || '',
          callToAction: g.group.call_to_action || '',
          headlines: g.headlines,
          longHeadlines: g.longHeadlines,
          descriptions: g.descriptions,
        });
      }
    } catch (err) {
      console.warn('[GoogleAdsShell] failed to load PMax snapshots from DB; using row-derived baseline only', err);
    }
    return Array.from(byKey.values());
  }, [campaignId, buildPmaxAssetGroupShellRows, rows]);

  const handleUploadGoogleAdsShell = useCallback(async (file: File) => {
    try {
      const ctx = await loadGoogleShellContext();
      shellContextRef.current = ctx;
      const parsed = await parseGoogleAdsShell(file);
      const currentKeywordRows = buildCurrentKeywordRows(ctx.keywords, ctx.expansion);
      const pmaxSnaps = await loadCurrentPmaxSnapshots();
      const diff = diffShell({
        current: {
          keywords: currentKeywordRows,
          ads: ctx.adRows,
          shell: ctx.expansion.map((e) => ({ campaignName: e.campaignName, adGroupName: e.adGroupName })),
          pmaxGroups: pmaxSnaps,
        },
        uploaded: parsed,
      });
      setShellDiff(diff);
      setShellOpen(true);
    } catch (err) {
      console.error('[GoogleAdsShell] upload parse failed', err);
      toast.error('Could not read the Google Ads shell file');
    }
  }, [loadGoogleShellContext, loadCurrentPmaxSnapshots]);

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
        const normalizeSearchPhase = (label: string) => {
          const idx = String(label || '').lastIndexOf(' • ');
          return (idx === -1 ? String(label || '') : String(label || '').slice(0, idx)).trim().toLowerCase();
        };

        let scoped = scopeShellContext(ctx, market, phaseLabel);

        if (scoped.expansion.length === 0) {
          const normalizedPhase = normalizeSearchPhase(phaseLabel);
          const requestedSearchFamily = rows.some(
            (row) =>
              (row.platform || '').toLowerCase() === 'google' &&
              row.market === market &&
              normalizeSearchPhase(row.phase) === normalizedPhase &&
              (String(row.googleCampaignType || '').toLowerCase().includes('search') || !!row.googleStrategy),
          );

          if (requestedSearchFamily) {
            const searchExpansion = ctx.expansion.filter((ref) =>
              String(ref.googleCampaignType || '').toLowerCase().includes('search'),
            );
            const allowedCampaignNames = new Set(searchExpansion.map((entry) => entry.campaignName));
            const searchScoped = {
              ...ctx,
              expansion: searchExpansion,
              adRows: ctx.adRows.filter((row) => allowedCampaignNames.has(row.campaignName)),
            };

            if (searchScoped.expansion.length > 0) {
              downloadGoogleAdsShell({
                campaignName: `${searchScoped.campaignName} - Google Search`,
                expansion: searchScoped.expansion,
                keywords: searchScoped.keywords,
                adRows: searchScoped.adRows,
                includeKeywords: true,
              });
              toast.success('Google Search shell downloaded');
              return;
            }
          }

          toast.error('No Google Ads structure found for this phase');
          return;
        }
        const isPmaxPhase = scoped.expansion.every((ref) => getGoogleAdsSheetSpec(ref.googleCampaignType).type === 'pmax');
        if (isPmaxPhase) {
          const normalizedPhase = normalizeSearchPhase(phaseLabel);
          const groups = buildPmaxAssetGroupShellRows(
            rows.filter((row) =>
              (row.platform || '').toLowerCase() === 'google' &&
              row.market === market &&
              normalizeSearchPhase(row.phase) === normalizedPhase,
            ),
          );
          await downloadGooglePmaxAssetGroupShell({
            campaignName: `${scoped.campaignName} - ${market} - ${phaseLabel}`,
            groups,
          });
        } else {
          downloadGoogleAdsShell({
            campaignName: `${scoped.campaignName} - ${market} - ${phaseLabel}`,
            expansion: scoped.expansion,
            keywords: scoped.keywords,
            adRows: scoped.adRows,
            // Non-Search phases (Demand Gen, Display, ...) don't use keywords.
            includeKeywords: false,
          });
        }
        toast.success(`Shell downloaded for ${phaseLabel}`);
      } catch (err) {
        console.error('[GoogleAdsShell] phase download failed', err);
        toast.error('Failed to download Google Ads shell');
      }
    },
    [buildPmaxAssetGroupShellRows, loadGoogleShellContext, rows, scopeShellContext],
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
        const pmaxSnaps = await loadCurrentPmaxSnapshots();
        const diff = diffShell({
          current: {
            keywords: currentKeywordRows,
            ads: scoped.adRows,
            shell: scoped.expansion.map((e) => ({ campaignName: e.campaignName, adGroupName: e.adGroupName })),
            pmaxGroups: pmaxSnaps,
          },
          uploaded: parsed,
        });
        setShellDiff(diff);
        setShellOpen(true);
      } catch (err) {
        console.error('[GoogleAdsShell] phase upload parse failed', err);
        toast.error('Could not read the Google Ads shell file');
      }
    },
    [loadGoogleShellContext, scopeShellContext, loadCurrentPmaxSnapshots],
  );

  // Search-only scoping: include every Google Search expansion (Brand/Generic/
  // Competition × all markets) in a single shell file. Non-Search Google phases
  // (PMax, Demand Gen, …) are excluded — they keep their own per-phase buttons.
  const scopeShellToSearch = useCallback((ctx: GoogleShellContext): GoogleShellContext => {
    const expansion = ctx.expansion.filter((ref) =>
      String(ref.googleCampaignType || '').toLowerCase().includes('search'),
    );
    const allowedCampaignNames = new Set(expansion.map((e) => e.campaignName));
    const adRows = ctx.adRows.filter((row) => allowedCampaignNames.has(row.campaignName));
    return { ...ctx, expansion, adRows };
  }, []);

  const handleDownloadGoogleSearchShell = useCallback(async () => {
    try {
      const ctx = await loadGoogleShellContext();
      const scoped = scopeShellToSearch(ctx);
      if (scoped.expansion.length === 0) {
        toast.error('No Google Search campaigns found');
        return;
      }
      downloadGoogleAdsShell({
        campaignName: `${scoped.campaignName} - Google Search`,
        expansion: scoped.expansion,
        keywords: scoped.keywords,
        adRows: scoped.adRows,
        // Search shell always includes per-strategy keywords from Unified Targeting.
        includeKeywords: true,
      });
      toast.success('Google Search shell downloaded');
    } catch (err) {
      console.error('[GoogleAdsShell] search download failed', err);
      toast.error('Failed to download Google Search shell');
    }
  }, [loadGoogleShellContext, scopeShellToSearch]);

  const handleUploadGoogleSearchShell = useCallback(async (file: File) => {
    try {
      const ctx = await loadGoogleShellContext();
      const scoped = scopeShellToSearch(ctx);
      if (scoped.expansion.length === 0) {
        toast.error('No Google Search campaigns found');
        return;
      }
      shellContextRef.current = ctx;
      const parsed = await parseGoogleAdsShell(file);
      const currentKeywordRows = buildCurrentKeywordRows(scoped.keywords, scoped.expansion);
      const pmaxSnaps = await loadCurrentPmaxSnapshots();
      const diff = diffShell({
        current: {
          keywords: currentKeywordRows,
          ads: scoped.adRows,
          shell: scoped.expansion.map((e) => ({ campaignName: e.campaignName, adGroupName: e.adGroupName })),
          pmaxGroups: pmaxSnaps,
        },
        uploaded: parsed,
      });
      setShellDiff(diff);
      setShellOpen(true);
    } catch (err) {
      console.error('[GoogleAdsShell] search upload parse failed', err);
      toast.error('Could not read the Google Search shell file');
    }
  }, [loadGoogleShellContext, scopeShellToSearch, loadCurrentPmaxSnapshots]);

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
      // Map DB column names to in-memory CreativeTextAssetRow keys so we can
      // mirror DB writes into local state. The editor reads from local `rows`
      // state, so without this the user would see the toast but the cells
      // would stay blank until a full reload.
      const DB_TO_ROW: Record<string, string> = {
        destination_url: 'destinationUrl',
        path_1: 'path_1',
        path_2: 'path_2',
        headline: 'headline',
        headline_2: 'headline2',
        headline_3: 'headline3',
        headline_4: 'headline4',
        headline_5: 'headline5',
        headline_pins: 'headline_pins',
        description: 'description',
        description_2: 'description2',
        description_3: 'description3',
        description_4: 'description4',
        description_5: 'description5',
        description_pins: 'description_pins',
        long_headline_1: 'long_headline_1',
        long_headline_2: 'long_headline_2',
        long_headline_3: 'long_headline_3',
        long_headline_4: 'long_headline_4',
        long_headline_5: 'long_headline_5',
        business_name: 'business_name',
      };

      const rowByAssignmentId = new Map(
        mergedRows
          .filter((row) => row.assignmentId)
          .map((row) => [row.assignmentId, row] as const),
      );
      const localUpdatesByAssignmentId = new Map<string, Record<string, unknown>>();
      for (const u of selected.ads.updated) {
        const payload = adChangesToAssignmentUpdate(u.changes);
        if (Object.keys(payload).length > 0) {
          const { error } = await supabase
            .from('creative_assignments')
            .update(payload as any)
            .eq('id', u.assignmentId);
          if (error) throw error;
        }

        const rowPatch: Record<string, unknown> = {};
        for (const [dbKey, value] of Object.entries(payload)) {
          const rowKey = DB_TO_ROW[dbKey];
          if (rowKey) rowPatch[rowKey] = value;
        }
        if ('business_name' in payload) {
          rowPatch.brandName = (payload as any).business_name ?? '';
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
          rowPatch.youtubeVideoUrl = u.changes.youtubeVideoUrl || '';
        }

        if (Object.keys(rowPatch).length > 0) {
          localUpdatesByAssignmentId.set(u.assignmentId, rowPatch);
        }
      }

      if (localUpdatesByAssignmentId.size > 0) {
        setRows((prev) =>
          prev.map((r) => {
            const patch = localUpdatesByAssignmentId.get((r as any).assignmentId);
            return patch ? ({ ...r, ...patch } as CreativeTextAssetRow) : r;
          }),
        );
      }

      // New RSA rows from the spreadsheet — appended as additional Google shell
      // placeholders so they appear in the editor with their copy already filled.
      // The user can then save them through the normal flow.
      if (selected.ads.added.length > 0) {
        const expansionByShellKey = new Map(
          ctx.expansion.map((e) => [`${e.campaignName}::${e.adGroupName}`, e] as const),
        );
        setGooglePlaceholderRows((prev) => {
          const next = [...prev];
          selected.ads.added.forEach((a, i) => {
            const ref = expansionByShellKey.get(`${a.campaignName}::${a.adGroupName}`);
            if (!ref) return;
            const phaseLabel = ref.strategy
              ? `${ref.phaseName} • ${ref.strategy.charAt(0).toUpperCase()}${ref.strategy.slice(1)}`
              : ref.phaseName;
            // Preserve the *full* RSA payload from the uploaded sheet so the
            // Google Search editor can render every headline / description /
            // pin / path / business name. Slots 1..5 are mirrored into the
            // flat columns; the complete 15/6 lists + pins live in the JSON
            // *_pins fields (read by GoogleSearchTextAssetEditor.rowToDraft).
            const headlines = (a.headlines || []).slice(0, 15);
            while (headlines.length < 15) headlines.push('');
            const headlinePins = (a.headlinePins || []).slice(0, 15);
            while (headlinePins.length < 15) headlinePins.push(null);
            const descriptions = (a.descriptions || []).slice(0, 6);
            while (descriptions.length < 6) descriptions.push('');
            const descriptionPins = (a.descriptionPins || []).slice(0, 6);
            while (descriptionPins.length < 6) descriptionPins.push(null);
            next.push({
              id: `google_shell_uploaded_${Date.now()}_${i}`,
              creativeId: '',
              assignmentId: '',
              platform: 'google',
              market: ref.market,
              phase: phaseLabel,
              adSet: ref.adGroupName,
              googleCampaignType: ref.googleCampaignType,
              googleStrategy: ref.strategy,
              googleAdSubtype: 'rsa',
              creativeName: a.adName,
              creativeFormat: 'image',
              taxonomyCampaignName: ref.campaignName,
              taxonomyAdSetName: ref.adGroupName,
              taxonomyAdName: a.adName,
              adFormat: 'other',
              suggestedAdFormat: 'other',
              adFormatConfirmed: false,
              primaryText: '',
              // Mirror slots 1..5 into the flat columns the rest of the app reads.
              headline: headlines[0] || '',
              headline2: headlines[1] || '',
              headline3: headlines[2] || '',
              headline4: headlines[3] || '',
              headline5: headlines[4] || '',
              description: descriptions[0] || '',
              description2: descriptions[1] || '',
              description3: descriptions[2] || '',
              description4: descriptions[3] || '',
              description5: descriptions[4] || '',
              // Full lists + pins (overflow H6..H15, D5..D6) live here.
              headline_pins: { values: headlines, pins: headlinePins },
              description_pins: { values: descriptions, pins: descriptionPins },
              path_1: a.path1 || '',
              path_2: a.path2 || '',
              business_name: a.businessName || '',
              brandName: a.businessName || '',
              callToAction: 'LEARN_MORE',
              destinationUrl: a.finalUrl || '',
              youtubeVideoUrl: a.youtubeVideoUrl || '',
              autoBuildUtm: false,
              isValid: true,
              validationErrors: [],
              mediaType: 'image',
              pushStatus: 'draft',
            } as CreativeTextAssetRow);
          });
          return next;
        });
      }

      // ---- Apply PMax asset group updates (text + business name + final URL + CTA) ----
      const pmaxUpdates = selected.pmaxGroups?.updated || [];
      if (pmaxUpdates.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { upsertPmaxAssetGroup, replacePmaxTextAssets, fetchPmaxAssetGroups } = await import('@/utils/pmaxAssetGroupRepo');
          const existing = await fetchPmaxAssetGroups(campaignId);
          const padTo5 = (arr: string[] | undefined): string[] => {
            const out = (arr || []).slice(0, 5).map((v) => String(v || ''));
            while (out.length < 5) out.push('');
            return out;
          };
          for (const u of pmaxUpdates) {
            const cur = existing.find(
              (g) =>
                g.group.market === u.market &&
                g.group.phase_name === u.phaseName &&
                g.group.ad_group_name === u.assetGroupName,
            );
            const baseGroupName = cur?.group.group_name || u.assetGroupName;
            const upserted = await upsertPmaxAssetGroup({
              campaignId,
              userId: user.id,
              teamId: cur?.group.team_id || null,
              market: u.market,
              phaseName: u.phaseName,
              adGroupName: u.assetGroupName,
              groupName: baseGroupName,
              businessName: u.changes.businessName ?? cur?.group.business_name ?? null,
              finalUrl: u.changes.finalUrl ?? cur?.group.final_url ?? null,
              callToAction: u.changes.callToAction ?? cur?.group.call_to_action ?? null,
            });
            // Replace the entire text pool — only fields the user changed are
            // overwritten; untouched pools keep their current values.
            const nextHeadlines = u.changes.headlines ?? cur?.headlines ?? [];
            const nextLong = u.changes.longHeadlines ?? cur?.longHeadlines ?? [];
            const nextDesc = u.changes.descriptions ?? cur?.descriptions ?? [];
            await replacePmaxTextAssets({
              groupId: upserted.id,
              headlines: nextHeadlines,
              longHeadlines: nextLong,
              descriptions: nextDesc,
            });

            // Mirror into local rows so the editor reflects changes immediately.
            const h = padTo5(nextHeadlines);
            const lh = padTo5(nextLong);
            const d = padTo5(nextDesc);
            setRows((prev) =>
              prev.map((r) => {
                const rowAdGroup = String((r as any).taxonomyAdSetName || r.adSet || '').trim();
                if (
                  r.market !== u.market ||
                  r.phase !== u.phaseName ||
                  rowAdGroup !== u.assetGroupName
                ) return r;
                const patch: any = {
                  headline: h[0], headline2: h[1], headline3: h[2], headline4: h[3], headline5: h[4],
                  long_headline_1: lh[0], long_headline_2: lh[1], long_headline_3: lh[2], long_headline_4: lh[3], long_headline_5: lh[4],
                  description: d[0], description2: d[1], description3: d[2], description4: d[3], description5: d[4],
                };
                if (u.changes.businessName !== undefined) {
                  patch.business_name = u.changes.businessName;
                  patch.brandName = u.changes.businessName;
                }
                if (u.changes.finalUrl !== undefined) patch.destinationUrl = u.changes.finalUrl;
                if (u.changes.callToAction !== undefined) patch.callToAction = u.changes.callToAction;
                return { ...r, ...patch } as CreativeTextAssetRow;
              }),
            );
          }
        }
      }

      const total =
        selected.keywords.added.length +
        selected.keywords.updated.length +
        selected.keywords.removed.length +
        selected.ads.updated.length +
        selected.ads.added.length +
        pmaxUpdates.length;
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
          onDownloadGoogleAdsShellForPhase={handleDownloadGoogleAdsShellForPhase}
          onUploadGoogleAdsShellForPhase={handleUploadGoogleAdsShellForPhase}
          onDownloadGoogleSearchShell={handleDownloadGoogleSearchShell}
          onUploadGoogleSearchShell={handleUploadGoogleSearchShell}
          onOpenGoogleSearchEditor={() => setGoogleSearchEditorOpen(true)}
          onOpenGoogleNonSearchEditor={(market, phase) => setGoogleNonSearchEditor({ open: true, market, phase })}
        />
      </div>

      <GoogleSearchTextAssetEditor
        open={googleSearchEditorOpen}
        onOpenChange={setGoogleSearchEditorOpen}
        onBeforeClose={saveGoogleSearchTextAssets}
        rows={mergedRows}
        onRowChange={handleRowChange}
        onBulkUpdate={handleBulkUpdate}
        onDeleteAssignments={handleDeleteAssignments}
      />

      <GoogleNonSearchTextAssetEditor
        open={googleNonSearchEditor.open}
        onOpenChange={(open) => setGoogleNonSearchEditor((prev) => ({ ...prev, open }))}
        rows={mergedRows}
        scopeMarket={googleNonSearchEditor.market}
        scopePhase={googleNonSearchEditor.phase}
        campaignId={campaignId}
        onRowChange={handleRowChange}
        onBulkUpdate={handleBulkUpdate}
        onDeleteAssignments={handleDeleteAssignments}
        onApplyImagesToAllPmaxGroups={handleApplyImagesToAllPmaxGroups}
      />

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