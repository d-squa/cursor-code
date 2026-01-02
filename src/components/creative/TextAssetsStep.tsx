// Inline text assets step for the creative matching dialog
// Shows hierarchical editor for configuring copy, CTAs, and tracking

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Save, Check, AlertCircle, Loader2 } from 'lucide-react';
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

  // Track if we've attempted to load (to distinguish "loading" from "empty result")
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);

  // Load creative assignments with their structure data and taxonomy templates
  useEffect(() => {
    const loadAssignments = async () => {
      console.log('TextAssetsStep: Loading with savedAssignments:', savedAssignments);
      
      if (!savedAssignments || savedAssignments.length === 0) {
        console.log('TextAssetsStep: No saved assignments provided');
        setIsLoading(false);
        setHasAttemptedLoad(true);
        return;
      }

      try {
        // Get assignment IDs from the saved matches
        const assignmentIds = savedAssignments.map(a => a.id);
        console.log('TextAssetsStep: Fetching assignments with IDs:', assignmentIds);
        
        // Fetch assignments, campaign data, and taxonomy templates in parallel
        const [assignmentsResult, campaignResult] = await Promise.all([
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
            .in('id', assignmentIds),
          supabase
            .from('campaigns')
            .select('id, name, objective, start_date, end_date, bo_number, total_budget, platforms, budget_allocation, team_id, teams(name)')
            .eq('id', campaignId)
            .single()
        ]);

        if (assignmentsResult.error) {
          console.error('TextAssetsStep: Error fetching assignments:', assignmentsResult.error);
          throw assignmentsResult.error;
        }

        const assignments = assignmentsResult.data || [];
        const campaign = campaignResult.data;
        
        console.log('TextAssetsStep: Fetched assignments:', assignments);
        console.log('TextAssetsStep: Fetched campaign:', campaign);

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
        const transformedRows: CreativeTextAssetRow[] = assignments.map((assignment: any) => {
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
            // Taxonomy names
            taxonomyCampaignName,
            taxonomyAdSetName,
            taxonomyAdName,
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
          };
        });

        console.log('TextAssetsStep: Transformed rows:', transformedRows.length);
        setRows(transformedRows);
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

  // Handle import from Excel
  const handleImportRows = useCallback((importedRows: CreativeTextAssetRow[]) => {
    // Re-validate all imported rows
    const validatedRows = importedRows.map(row => {
      const errors = validateTextAssetRow(row);
      return { ...row, validationErrors: errors, isValid: errors.length === 0 };
    });
    setRows(validatedRows);
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

  // Only show "No Assignments Found" if we've actually attempted to load and confirmed empty
  if (hasAttemptedLoad && rows.length === 0) {
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
        <TextAssetExcelEditor
          rows={rows}
          campaignName={campaignName}
          onRowChange={handleRowChange}
          onBulkUpdate={handleBulkUpdate}
          onImportRows={handleImportRows}
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