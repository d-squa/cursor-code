import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { 
  Loader2, ChevronDown, ChevronRight, Image, Video, Trash2, 
  RefreshCw, Copy, MoreHorizontal, Upload
} from "lucide-react";
import { toast } from "sonner";
import { AssignedCreativesFilters, type CreativeFilters } from "./AssignedCreativesFilters";
import { AssignedCreativesToolbar } from "./AssignedCreativesToolbar";
import { DuplicateDestinationDialog, type DuplicateDestination } from "./DuplicateDestinationDialog";

interface CreativeAssignment {
  id: string;
  creative_id: string;
  campaign_id: string;
  platform: string;
  market: string;
  phase_name: string;
  ad_set_id: string | null;
  ad_set_name: string | null;
  position: number;
  status: string;
  dsp_creative_id: string | null;
  error_message: string | null;
  assigned_at: string;
  creative: {
    id: string;
    name: string;
    media_type: string | null;
    aspect_ratio: string | null;
    thumbnail_url: string | null;
    media_urls: string[] | null;
    width: number | null;
    height: number | null;
    duration_seconds: number | null;
    primary_text: string | null;
    headline: string | null;
    call_to_action: string | null;
    status: string;
    platform_image_hash?: string | null;
    platform_video_id?: string | null;
    platform_thumbnail_id?: string | null;
    dsp_upload_status?: string | null;
    dsp_upload_error?: string | null;
    dsp_uploaded_at?: string | null;
  } | null;
}

interface GroupedAssignments {
  [platform: string]: {
    [market: string]: {
      [phase: string]: {
        [adSet: string]: CreativeAssignment[];
      };
    };
  };
}

interface AssignedCreativesViewProps {
  campaignId: string;
  onRefresh?: () => void;
  refreshNonce?: number;
  /** Callback when assignments are deleted - provides deleted creative IDs */
  onAssignmentsDeleted?: (creativeIds: string[]) => void;
  /** Callback when assignments are duplicated - provides new row data */
  onAssignmentsDuplicated?: (newAssignments: Array<{
    creativeId: string;
    platform: string;
    market: string;
    phase: string;
    adSetId?: string;
    adSetName?: string;
  }>) => void;
}

export function AssignedCreativesView({ 
  campaignId, 
  onRefresh, 
  refreshNonce,
  onAssignmentsDeleted,
  onAssignmentsDuplicated,
}: AssignedCreativesViewProps) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<CreativeAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [filters, setFilters] = useState<CreativeFilters>({
    platform: null,
    market: null,
    phase: null,
    adSet: null,
    status: null,
    mediaType: null,
  });

  useEffect(() => {
    loadAssignments();
  }, [campaignId, user?.id, refreshNonce]);

  const loadAssignments = async () => {
    if (!campaignId || !user?.id) return;

    try {
      setLoading(true);
      const buildQuery = () => supabase
        .from('creative_assignments')
        .select(`
          *,
          creative:creatives(
            id, name, media_type, aspect_ratio, thumbnail_url, media_urls,
            width, height, duration_seconds, primary_text, headline, call_to_action, status,
            platform_image_hash, platform_video_id, platform_thumbnail_id,
            dsp_upload_status, dsp_upload_error, dsp_uploaded_at
          )
        `)
        .eq('campaign_id', campaignId)
        .order('platform')
        .order('market')
        .order('phase_name')
        .order('position');

      const allData: any[] = [];
      const pageSize = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: page, error: pageError } = await buildQuery().range(from, from + pageSize - 1);
        if (pageError) throw pageError;
        if (page) allData.push(...page);
        hasMore = page !== null && page.length === pageSize;
        from += pageSize;
      }

      setAssignments(allData);
      
      const platforms = new Set((allData).map((a: CreativeAssignment) => a.platform));
      setExpandedPlatforms(platforms);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Error loading assignments:', error);
      toast.error('Failed to load creative assignments');
    } finally {
      setLoading(false);
    }
  };

  // Filter options computed from assignments
  const filterOptions = useMemo(() => ({
    platforms: [...new Set(assignments.map(a => a.platform))].sort(),
    markets: [...new Set(assignments.map(a => a.market))].sort(),
    phases: [...new Set(assignments.map(a => a.phase_name || 'Default'))].sort(),
    adSets: [...new Set(assignments.map(a => a.ad_set_name || a.ad_set_id || 'Unknown'))].filter(Boolean).sort(),
    statuses: [...new Set(assignments.map(a => a.status))].sort(),
    mediaTypes: [...new Set(assignments.map(a => a.creative?.media_type).filter(Boolean))].sort() as string[],
  }), [assignments]);

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      if (filters.platform && a.platform !== filters.platform) return false;
      if (filters.market && a.market !== filters.market) return false;
      if (filters.phase && (a.phase_name || 'Default') !== filters.phase) return false;
      if (filters.adSet && (a.ad_set_name || a.ad_set_id) !== filters.adSet) return false;
      if (filters.status && a.status !== filters.status) return false;
      if (filters.mediaType && a.creative?.media_type !== filters.mediaType) return false;
      return true;
    });
  }, [assignments, filters]);

  // Available structures for duplicate destination
  const availableStructures = useMemo(() => {
    const structures: Array<{ platform: string; market: string; phase: string; adSetId?: string; adSetName?: string }> = [];
    const seen = new Set<string>();
    
    assignments.forEach(a => {
      const key = `${a.platform}|${a.market}|${a.phase_name}|${a.ad_set_id || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        structures.push({
          platform: a.platform,
          market: a.market,
          phase: a.phase_name || 'Default',
          adSetId: a.ad_set_id || undefined,
          adSetName: a.ad_set_name || undefined,
        });
      }
    });
    
    return structures;
  }, [assignments]);

  // Group filtered assignments by platform > market > phase > adSet
  const groupedAssignments = useMemo(() => {
    return filteredAssignments.reduce((acc, assignment) => {
      const { platform, market, phase_name, ad_set_id, ad_set_name } = assignment;
      const phase = phase_name || 'Default';
      const adSet = ad_set_name || ad_set_id || 'Default';
      
      if (!acc[platform]) acc[platform] = {};
      if (!acc[platform][market]) acc[platform][market] = {};
      if (!acc[platform][market][phase]) acc[platform][market][phase] = {};
      if (!acc[platform][market][phase][adSet]) acc[platform][market][phase][adSet] = [];
      
      acc[platform][market][phase][adSet].push(assignment);
      return acc;
    }, {} as GroupedAssignments);
  }, [filteredAssignments]);

  // Selection handlers
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredAssignments.map(a => a.id)));
  }, [filteredAssignments]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectByLevel = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  }, []);

  // Delete handlers
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    try {
      setDeleting(true);
      const idsToDelete = Array.from(selectedIds);
      const creativesToDelete = assignments
        .filter(a => idsToDelete.includes(a.id))
        .map(a => a.creative_id);
      
      const { error } = await supabase
        .from('creative_assignments')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;

      setAssignments(prev => prev.filter(a => !selectedIds.has(a.id)));
      setSelectedIds(new Set());
      toast.success(`Deleted ${idsToDelete.length} assignment(s)`);
      
      // Notify parent to remove from text assets editor
      onAssignmentsDeleted?.(creativesToDelete);
    } catch (error) {
      console.error('Error deleting assignments:', error);
      toast.error('Failed to delete assignments');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteByLevel = async (assignmentIds: string[]) => {
    try {
      setDeleting(true);
      const creativesToDelete = assignments
        .filter(a => assignmentIds.includes(a.id))
        .map(a => a.creative_id);
      
      const { error } = await supabase
        .from('creative_assignments')
        .delete()
        .in('id', assignmentIds);

      if (error) throw error;

      setAssignments(prev => prev.filter(a => !assignmentIds.includes(a.id)));
      setSelectedIds(prev => {
        const next = new Set(prev);
        assignmentIds.forEach(id => next.delete(id));
        return next;
      });
      toast.success(`Deleted ${assignmentIds.length} assignment(s)`);
      
      onAssignmentsDeleted?.(creativesToDelete);
    } catch (error) {
      console.error('Error deleting assignments:', error);
      toast.error('Failed to delete assignments');
    } finally {
      setDeleting(false);
    }
  };

  // Duplicate handlers
  const handleDuplicateToDestination = async (destination: DuplicateDestination) => {
    if (selectedIds.size === 0) return;
    
    try {
      setDuplicating(true);
      const selectedAssignments = assignments.filter(a => selectedIds.has(a.id));
      
      const newAssignments = selectedAssignments.map(a => ({
        campaign_id: campaignId,
        creative_id: a.creative_id,
        platform: destination.platform,
        market: destination.market,
        phase_name: destination.phase,
        ad_set_id: destination.adSetId || a.ad_set_id,
        ad_set_name: destination.adSetName || a.ad_set_name,
        position: a.position,
        status: 'pending',
      }));

      const { data, error } = await supabase
        .from('creative_assignments')
        .insert(newAssignments)
        .select();

      if (error) throw error;

      toast.success(`Duplicated ${newAssignments.length} creative(s) to ${destination.platform} / ${destination.market} / ${destination.phase}`);
      
      // Notify parent to add rows to text assets editor
      onAssignmentsDuplicated?.(newAssignments.map(a => ({
        creativeId: a.creative_id,
        platform: a.platform,
        market: a.market,
        phase: a.phase_name,
        adSetId: a.ad_set_id || undefined,
        adSetName: a.ad_set_name || undefined,
      })));
      
      await loadAssignments();
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Error duplicating assignments:', error);
      toast.error('Failed to duplicate assignments');
    } finally {
      setDuplicating(false);
    }
  };

  const handleDuplicateByLevel = (assignmentIds: string[]) => {
    selectByLevel(assignmentIds);
    setShowDuplicateDialog(true);
  };

  // Calculate uploadable creatives (selected creatives missing DSP asset IDs)
  const uploadableCreatives = useMemo(() => {
    return assignments.filter(a => {
      if (!selectedIds.has(a.id)) return false;
      if (!a.creative) return false;
      // Check if creative is missing DSP asset
      const hasMetaAsset = a.creative.platform_image_hash || a.creative.platform_video_id;
      const isMeta = a.platform.toLowerCase().includes('meta');
      return isMeta && !hasMetaAsset && a.creative.media_urls?.[0];
    });
  }, [assignments, selectedIds]);

  // Upload creatives to DSP
  const handleUploadToDsp = async () => {
    if (uploadableCreatives.length === 0) return;

    try {
      setUploading(true);
      let successCount = 0;
      let failCount = 0;

      for (const assignment of uploadableCreatives) {
        const creative = assignment.creative;
        if (!creative || !creative.media_urls?.[0]) continue;

        try {
          const mediaUrl = creative.media_urls[0];
          const isVideo = creative.media_type === 'video';

          // Get ad account for this platform/market
          const { data: campaign } = await supabase
            .from('campaigns')
            .select('platforms, market_splits')
            .eq('id', assignment.campaign_id)
            .single();

          let adAccountId: string | null = null;
          
          if (campaign?.market_splits) {
            // Find the platform and market to get ad account
            for (const [platformId, markets] of Object.entries(campaign.market_splits as Record<string, any>)) {
              const platformInfo = (campaign.platforms as any[] || []).find((p: any) => p.id === platformId);
              if (platformInfo?.name?.toLowerCase().includes('meta')) {
                const marketData = (markets as Record<string, any>)[assignment.market];
                adAccountId = marketData?.adAccountId || marketData?.ad_account_id;
                break;
              }
            }
          }

          if (!adAccountId) {
            // Fallback: get from meta_ad_accounts
            const { data: metaAccounts } = await supabase
              .from('meta_ad_accounts')
              .select('account_id')
              .eq('user_id', user?.id)
              .limit(1);
            
            if (metaAccounts?.[0]) {
              adAccountId = metaAccounts[0].account_id;
            }
          }

          if (!adAccountId) {
            console.error('No Meta ad account found for upload');
            failCount++;
            continue;
          }

          // Upload to Meta
          let uploadBody: Record<string, any>;

          if (isVideo) {
            // For videos, pass the URL directly to avoid memory issues
            uploadBody = {
              adAccountId: adAccountId,
              fileName: creative.name || 'creative',
              fileUrl: mediaUrl,
              fileType: 'video',
            };
          } else {
            // For images, fetch and convert to base64
            const response = await fetch(mediaUrl);
            if (!response.ok) {
              throw new Error('Failed to fetch media file');
            }
            const blob = await response.blob();
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                const base64Data = result.split(',')[1];
                resolve(base64Data);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });

            uploadBody = {
              adAccountId: adAccountId,
              fileName: creative.name || 'creative',
              fileData: base64,
              fileType: 'image',
              mimeType: blob.type,
            };
          }

          const { data, error } = await supabase.functions.invoke('upload-creative-to-meta', {
            body: uploadBody,
          });

          if (error || !data?.success) {
            console.error('Upload failed:', data?.error || error?.message);
            failCount++;
            continue;
          }

          // Update the creative with the DSP asset ID
          const updateData: Record<string, any> = {
            dsp_upload_status: 'uploaded',
            dsp_uploaded_at: new Date().toISOString(),
          };

          if (data.imageHash) {
            updateData.platform_image_hash = data.imageHash;
          }
          if (data.videoId) {
            updateData.platform_video_id = data.videoId;
          }

          await supabase
            .from('creatives')
            .update(updateData)
            .eq('id', creative.id);

          successCount++;
        } catch (err) {
          console.error('Error uploading creative:', err);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Uploaded ${successCount} creative(s) to Meta`);
        await loadAssignments();
      }
      if (failCount > 0) {
        toast.error(`Failed to upload ${failCount} creative(s)`);
      }
    } catch (error) {
      console.error('Error in bulk upload:', error);
      toast.error('Failed to upload creatives');
    } finally {
      setUploading(false);
    }
  };

  // Toggle handlers
  const togglePlatform = (platform: string) => {
    setExpandedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const toggleMarket = (key: string) => {
    setExpandedMarkets(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const togglePhase = (key: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Get assignment IDs by level
  const getAssignmentIdsByPlatform = (platform: string) => 
    filteredAssignments.filter(a => a.platform === platform).map(a => a.id);
  
  const getAssignmentIdsByMarket = (platform: string, market: string) => 
    filteredAssignments.filter(a => a.platform === platform && a.market === market).map(a => a.id);
  
  const getAssignmentIdsByPhase = (platform: string, market: string, phase: string) => 
    filteredAssignments.filter(a => a.platform === platform && a.market === market && (a.phase_name || 'Default') === phase).map(a => a.id);
  
  const getAssignmentIdsByAdSet = (platform: string, market: string, phase: string, adSet: string) => 
    filteredAssignments.filter(a => 
      a.platform === platform && 
      a.market === market && 
      (a.phase_name || 'Default') === phase &&
      (a.ad_set_name || a.ad_set_id || 'Default') === adSet
    ).map(a => a.id);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (assignments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Meshed Creatives
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Image className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No creatives meshed to this ActiPlan yet.</p>
            <p className="text-sm mt-1">Use Creative Mesh to weave creatives into your campaign structure.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          Meshed Creatives ({filteredAssignments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters */}
        <AssignedCreativesFilters
          filters={filters}
          onFiltersChange={setFilters}
          availableOptions={filterOptions}
        />

        {/* Toolbar */}
        <AssignedCreativesToolbar
          selectedCount={selectedIds.size}
          totalCount={filteredAssignments.length}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onDelete={handleDeleteSelected}
          onDuplicate={() => setShowDuplicateDialog(true)}
          onRefresh={loadAssignments}
          onUploadToDsp={handleUploadToDsp}
          isDeleting={deleting}
          isDuplicating={duplicating}
          isUploading={uploading}
          uploadableCount={uploadableCreatives.length}
        />

        {/* Grouped view */}
        <div className="space-y-2">
          {Object.entries(groupedAssignments).map(([platform, markets]) => {
            const platformIds = getAssignmentIdsByPlatform(platform);
            const platformSelected = platformIds.every(id => selectedIds.has(id));
            
            return (
              <Collapsible
                key={platform}
                open={expandedPlatforms.has(platform)}
                onOpenChange={() => togglePlatform(platform)}
              >
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Checkbox
                    checked={platformSelected}
                    onCheckedChange={(checked) => {
                      if (checked) selectByLevel(platformIds);
                      else platformIds.forEach(id => setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; }));
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-2 flex-1 cursor-pointer">
                      {expandedPlatforms.has(platform) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-semibold">{platform}</span>
                      <Badge variant="outline" className="ml-auto">
                        {platformIds.length} creatives
                      </Badge>
                    </div>
                  </CollapsibleTrigger>
                  <LevelActionsMenu
                    onDelete={() => handleDeleteByLevel(platformIds)}
                    onDuplicate={() => handleDuplicateByLevel(platformIds)}
                    count={platformIds.length}
                  />
                </div>
                <CollapsibleContent className="pl-6 pt-2 space-y-2">
                  {Object.entries(markets).map(([market, phases]) => {
                    const marketKey = `${platform}-${market}`;
                    const marketIds = getAssignmentIdsByMarket(platform, market);
                    const marketSelected = marketIds.every(id => selectedIds.has(id));
                    
                    return (
                      <Collapsible
                        key={marketKey}
                        open={expandedMarkets.has(marketKey)}
                        onOpenChange={() => toggleMarket(marketKey)}
                      >
                        <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/30">
                          <Checkbox
                            checked={marketSelected}
                            onCheckedChange={(checked) => {
                              if (checked) selectByLevel(marketIds);
                              else marketIds.forEach(id => setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; }));
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center gap-2 flex-1 cursor-pointer">
                              {expandedMarkets.has(marketKey) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              <span className="text-sm font-medium">{market}</span>
                              <Badge variant="secondary" className="text-xs ml-auto">
                                {marketIds.length}
                              </Badge>
                            </div>
                          </CollapsibleTrigger>
                          <LevelActionsMenu
                            onDelete={() => handleDeleteByLevel(marketIds)}
                            onDuplicate={() => handleDuplicateByLevel(marketIds)}
                            count={marketIds.length}
                          />
                        </div>
                        <CollapsibleContent className="pl-6 pt-1 space-y-2">
                          {Object.entries(phases).map(([phase, adSets]) => {
                            const phaseKey = `${marketKey}-${phase}`;
                            const phaseIds = getAssignmentIdsByPhase(platform, market, phase);
                            const phaseSelected = phaseIds.every(id => selectedIds.has(id));
                            
                            return (
                              <Collapsible
                                key={phaseKey}
                                open={expandedPhases.has(phaseKey)}
                                onOpenChange={() => togglePhase(phaseKey)}
                              >
                                <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/20">
                                  <Checkbox
                                    checked={phaseSelected}
                                    onCheckedChange={(checked) => {
                                      if (checked) selectByLevel(phaseIds);
                                      else phaseIds.forEach(id => setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; }));
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <CollapsibleTrigger asChild>
                                    <div className="flex items-center gap-2 flex-1 cursor-pointer">
                                      {expandedPhases.has(phaseKey) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{phase}</span>
                                      <Badge variant="outline" className="text-[10px] ml-auto">
                                        {phaseIds.length}
                                      </Badge>
                                    </div>
                                  </CollapsibleTrigger>
                                  <LevelActionsMenu
                                    onDelete={() => handleDeleteByLevel(phaseIds)}
                                    onDuplicate={() => handleDuplicateByLevel(phaseIds)}
                                    count={phaseIds.length}
                                  />
                                </div>
                                <CollapsibleContent className="pl-6 pt-1 space-y-3">
                                  {Object.entries(adSets).map(([adSet, adSetAssignments]) => {
                                    const adSetIds = adSetAssignments.map(a => a.id);
                                    const adSetSelected = adSetIds.every(id => selectedIds.has(id));
                                    
                                    return (
                                      <div key={adSet} className="space-y-2">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground border-b pb-1">
                                          <Checkbox
                                            checked={adSetSelected}
                                            onCheckedChange={(checked) => {
                                              if (checked) selectByLevel(adSetIds);
                                              else adSetIds.forEach(id => setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; }));
                                            }}
                                          />
                                          <span className="font-medium">{adSet}</span>
                                          <Badge variant="outline" className="text-[10px] ml-auto">
                                            {adSetIds.length}
                                          </Badge>
                                          <LevelActionsMenu
                                            onDelete={() => handleDeleteByLevel(adSetIds)}
                                            onDuplicate={() => handleDuplicateByLevel(adSetIds)}
                                            count={adSetIds.length}
                                          />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                          {adSetAssignments.map((assignment) => (
                                            <CreativeCard
                                              key={assignment.id}
                                              assignment={assignment}
                                              selected={selectedIds.has(assignment.id)}
                                              onToggleSelect={() => toggleSelection(assignment.id)}
                                              onRemove={() => handleDeleteByLevel([assignment.id])}
                                              isDeleting={deleting}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </CollapsibleContent>
                              </Collapsible>
                            );
                          })}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </CardContent>

      {/* Duplicate destination dialog */}
      <DuplicateDestinationDialog
        open={showDuplicateDialog}
        onOpenChange={setShowDuplicateDialog}
        availableStructures={availableStructures}
        creativeCount={selectedIds.size}
        onConfirm={handleDuplicateToDestination}
      />
    </Card>
  );
}

// Level actions dropdown menu
function LevelActionsMenu({ 
  onDelete, 
  onDuplicate, 
  count 
}: { 
  onDelete: () => void; 
  onDuplicate: () => void; 
  count: number;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
          <Copy className="h-4 w-4 mr-2" />
          Duplicate {count} creative{count !== 1 ? 's' : ''}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {count} creative{count !== 1 ? 's' : ''}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Creative card component
interface CreativeCardProps {
  assignment: CreativeAssignment;
  selected: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
  isDeleting: boolean;
}

function CreativeCard({ assignment, selected, onToggleSelect, onRemove, isDeleting }: CreativeCardProps) {
  const creative = assignment.creative;
  
  if (!creative) {
    return (
      <div className="p-3 border rounded-lg bg-destructive/5 border-destructive/20">
        <p className="text-sm text-destructive">Creative not found</p>
        <Button variant="ghost" size="sm" onClick={onRemove} disabled={isDeleting} className="mt-2">
          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          <span className="ml-1">Remove</span>
        </Button>
      </div>
    );
  }

  const isVideo = creative.media_type === 'video';
  const thumbnailUrl = creative.thumbnail_url || (creative.media_urls?.[0]);

  return (
    <div className={`p-2 border rounded-lg transition-colors group ${selected ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}>
      <div className="flex gap-2">
        <Checkbox checked={selected} onCheckedChange={() => onToggleSelect()} />
        
        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0 relative">
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={creative.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {isVideo ? <Video className="h-5 w-5 text-muted-foreground" /> : <Image className="h-5 w-5 text-muted-foreground" />}
            </div>
          )}
          {isVideo && creative.duration_seconds && (
            <div className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[10px] px-1 rounded">
              {creative.duration_seconds}s
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate" title={creative.name}>{creative.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
            {creative.aspect_ratio && <span>{creative.aspect_ratio}</span>}
            {creative.width && creative.height && <span>{creative.width}×{creative.height}</span>}
          </div>
          <div className="mt-1">
            {assignment.status === 'pushed' ? (
              <Badge variant="default" className="text-[10px] h-4">Pushed</Badge>
            ) : assignment.status === 'error' ? (
              <Badge variant="destructive" className="text-[10px] h-4">Error</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] h-4">Pending</Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100"
          onClick={onRemove}
          disabled={isDeleting}
        >
          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 text-destructive" />}
        </Button>
      </div>

      {assignment.error_message && (
        <div className="mt-2 p-1.5 bg-destructive/10 rounded text-[10px] text-destructive">
          {assignment.error_message}
        </div>
      )}
    </div>
  );
}
