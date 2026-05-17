// Auto-Mesh Dialog - AI-powered creative-to-structure matching
// Supports using existing library creatives OR uploading new ones
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FolderUp, Wand2, Check, AlertTriangle, Loader2, ArrowLeft, Save, LayoutGrid, Image, Video, CheckCircle2, Layers, List } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSampleMode } from '@/contexts/SampleModeContext';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { useCreativeMatching, UICreativeMatch, DigestedAsset, CampaignStructure } from '@/hooks/useCreativeMatching';
import { CreativeMatchCard } from './CreativeMatchCard';
import { StructureCentricView } from './StructureCentricView';
import { TextAssetsStep } from './TextAssetsStep';
import type { Creative } from '@/types/creative';

interface CreativeMatchingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
  campaignName?: string;
}

interface CampaignOption {
  id: string;
  name: string;
  status: string;
}

export function CreativeMatchingDialog({ open, onOpenChange, campaignId: initialCampaignId, campaignName: initialCampaignName }: CreativeMatchingDialogProps) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { isSampleMode } = useSampleMode();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [activeSourceTab, setActiveSourceTab] = useState<'library' | 'platform' | 'upload'>('library');
  const [activeUploadTab, setActiveUploadTab] = useState('files');
  const [activeViewMode, setActiveViewMode] = useState<'structure' | 'asset'>('structure');
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>(initialCampaignId);
  const [selectedCampaignName, setSelectedCampaignName] = useState<string>(initialCampaignName || '');
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  
  // Library creatives state
  const [libraryCreatives, setLibraryCreatives] = useState<Creative[]>([]);
  const [selectedCreativeIds, setSelectedCreativeIds] = useState<Set<string>>(new Set());
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  // Platform assets state (synced from DSP)
  const [platformAssets, setPlatformAssets] = useState<any[]>([]);
  const [selectedPlatformAssetIds, setSelectedPlatformAssetIds] = useState<Set<string>>(new Set());
  const [isLoadingPlatformAssets, setIsLoadingPlatformAssets] = useState(false);
  // Sync state with props when they change
  useEffect(() => {
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
      setSelectedCampaignName(initialCampaignName || '');
    }
  }, [initialCampaignId, initialCampaignName]);

  const effectiveCampaignId = selectedCampaignId ?? initialCampaignId;

  const { state, stats, loadCampaignStructures, processFiles, addLibraryCreatives, addPlatformAssets, runMatching, acceptMatch, rejectMatch, clearRejection, clearAcceptedMatch, removeAsset, clearAll, saveMatches, skipTextAssets } = useCreativeMatching(effectiveCampaignId);

  // Load available campaigns when dialog opens (if no campaignId provided)
  useEffect(() => {
    if (open && !initialCampaignId && !selectedCampaignId && user) {
      setIsLoadingCampaigns(true);
      let query = supabase
        .from('campaigns')
        .select('id, name, status')
        .eq('is_sample', isSampleMode)
        .order('updated_at', { ascending: false });
      if (activeWorkspaceId) {
        query = query.eq('team_id', activeWorkspaceId);
      }
      query.then(({ data, error }) => {
        if (!error && data) {
          setCampaigns(data);
        }
        setIsLoadingCampaigns(false);
      });
    }
  }, [open, initialCampaignId, selectedCampaignId, user, isSampleMode, activeWorkspaceId]);

  // Load library creatives when dialog opens
  useEffect(() => {
    if (open && user) {
      setIsLoadingLibrary(true);
      supabase
        .from('creatives')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            // Map DB rows to Creative type
            const creatives: Creative[] = data.map((row: any) => ({
              id: row.id,
              userId: row.user_id,
              teamId: row.team_id,
              campaignId: row.campaign_id,
              name: row.name,
              creativeType: row.creative_type,
              status: row.status,
              platform: row.platform,
              market: row.market,
              phaseName: row.phase_name,
              optimizationGoal: row.optimization_goal,
              funnelStage: row.funnel_stage,
              mediaUrls: row.media_urls || [],
              thumbnailUrl: row.thumbnail_url,
              primaryText: row.primary_text,
              headline: row.headline,
              description: row.description,
              validationErrors: row.validation_errors || [],
              isValid: row.is_valid ?? true,
              width: row.width,
              height: row.height,
              aspectRatio: row.aspect_ratio,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            }));
            setLibraryCreatives(creatives);
          }
          setIsLoadingLibrary(false);
        });
    }
  }, [open, user]);

  // Load platform assets when dialog opens
  useEffect(() => {
    if (open && user) {
      setIsLoadingPlatformAssets(true);
      supabase
        .from('creative_library_assets')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_usable', true)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            setPlatformAssets(data);
          }
          setIsLoadingPlatformAssets(false);
        });
    }
  }, [open, user]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      if (!initialCampaignId) {
        setSelectedCampaignId(undefined);
        setSelectedCampaignName('');
      }
      setSelectedCreativeIds(new Set());
      setSelectedPlatformAssetIds(new Set());
      clearAll();
    }
  }, [open, initialCampaignId, clearAll]);

  const handleCampaignSelect = useCallback((campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    setSelectedCampaignId(campaignId);
    setSelectedCampaignName(campaign?.name || '');
  }, [campaigns]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await processFiles(files);
    toast.success(`Processed ${files.length} files`);
    
    // If in review step, automatically re-run matching with new assets
    if (state.currentStep === 'review' && effectiveCampaignId) {
      const structures = await loadCampaignStructures(effectiveCampaignId) || [];
      runMatching(structures);
      toast.success('Re-meshing with new creatives...');
    }
  }, [processFiles, state.currentStep, state.structures, effectiveCampaignId, loadCampaignStructures, runMatching]);

  const handleFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await processFiles(files);
    toast.success(`Processed ${files.length} files from folder`);
    
    // If in review step, automatically re-run matching with new assets
    if (state.currentStep === 'review' && effectiveCampaignId) {
      const structures = await loadCampaignStructures(effectiveCampaignId) || [];
      runMatching(structures);
      toast.success('Re-meshing with new creatives...');
    }
  }, [processFiles, state.currentStep, state.structures, effectiveCampaignId, loadCampaignStructures, runMatching]);

  const handleCreativeToggle = useCallback((creativeId: string) => {
    setSelectedCreativeIds(prev => {
      const next = new Set(prev);
      if (next.has(creativeId)) {
        next.delete(creativeId);
      } else {
        next.add(creativeId);
      }
      return next;
    });
  }, []);

  const handlePlatformAssetToggle = useCallback((assetId: string) => {
    setSelectedPlatformAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((creativeIds: string[]) => {
    setSelectedCreativeIds(prev => {
      const allSelected = creativeIds.length > 0 && creativeIds.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(creativeIds);
    });
  }, []);

  const handleSelectAllPlatformAssets = useCallback((assetIds: string[]) => {
    setSelectedPlatformAssetIds(prev => {
      const allSelected = assetIds.length > 0 && assetIds.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(assetIds);
    });
  }, []);


  const handleUseSelectedCreatives = useCallback(async () => {
    const selected = libraryCreatives.filter(c => selectedCreativeIds.has(c.id));
    if (selected.length === 0) {
      toast.error('Please select at least one creative');
      return;
    }
    addLibraryCreatives(selected);
    toast.success(`Added ${selected.length} creatives for matching`);
  }, [libraryCreatives, selectedCreativeIds, addLibraryCreatives]);

  const handleUseSelectedPlatformAssets = useCallback(async () => {
    const selected = platformAssets.filter(a => selectedPlatformAssetIds.has(a.id));
    if (selected.length === 0) {
      toast.error('Please select at least one asset');
      return;
    }
    addPlatformAssets(selected);
    toast.success(`Added ${selected.length} platform assets for matching`);
  }, [platformAssets, selectedPlatformAssetIds, addPlatformAssets]);

  const handleRunMatchingClick = async () => {
    const campaignIdToUse = effectiveCampaignId;
    if (!campaignIdToUse) { toast.error('Please select an ActiPlan first'); return; }
    if (state.assets.length === 0) { toast.error('Please add some creatives first'); return; }
    const structures = await loadCampaignStructures(campaignIdToUse) || [];
    runMatching(structures);
  };

  const stepProgress = state.currentStep === 'upload' ? 0 : state.currentStep === 'match' ? 25 : state.currentStep === 'review' ? 50 : state.currentStep === 'text_assets' ? 75 : 100;
  const needsCampaignSelection = !effectiveCampaignId;

  const alreadyInMesh = new Set(state.assets.map((a) => a.id));

  // Library creatives available for this mesh:
  // show unassigned creatives + creatives already linked to the selected ActiPlan
  // (and hide anything already added in this session)
  const availableCreatives = libraryCreatives.filter(
    (c) =>
      (!c.campaignId || c.campaignId === effectiveCampaignId) && !alreadyInMesh.has(c.id)
  );
  const availableCreativeIds = availableCreatives.map((c) => c.id);
  const selectedAvailableCount = availableCreatives.reduce(
    (acc, c) => acc + (selectedCreativeIds.has(c.id) ? 1 : 0),
    0
  );
  const allAvailableSelected = availableCreativeIds.length > 0 && selectedAvailableCount === availableCreativeIds.length;

  // Platform assets available for this mesh (not already added)
  const availablePlatformAssets = platformAssets.filter((a) => !alreadyInMesh.has(a.id));
  const availablePlatformAssetIds = availablePlatformAssets.map((a) => a.id);
  const selectedPlatformAssetCount = availablePlatformAssets.reduce(
    (acc, a) => acc + (selectedPlatformAssetIds.has(a.id) ? 1 : 0),
    0
  );
  const allPlatformAssetsSelected = availablePlatformAssetIds.length > 0 && selectedPlatformAssetCount === availablePlatformAssetIds.length;

  // Text Assets step should render full-screen, not inside dialog
  if (state.currentStep === 'text_assets' && open) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Full-screen header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
          <div className="flex items-center gap-3">
            <Wand2 className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Creative Content Editor</h1>
            {selectedCampaignName && <Badge variant="secondary">{selectedCampaignName}</Badge>}
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
        
        {/* Full-screen content */}
        <div className="flex-1 overflow-hidden p-6">
          <TextAssetsStep
            campaignId={effectiveCampaignId!}
            campaignName={selectedCampaignName}
            savedAssignments={state.savedAssignments}
            campaignStructures={state.structures}
            onComplete={() => {
              skipTextAssets();
              onOpenChange(false);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Wand2 className="h-5 w-5 text-primary" />
            Creative Mesh
            {selectedCampaignName && <Badge variant="secondary">{selectedCampaignName}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Select creatives from your library or upload new ones, then match them to your campaign structure.
          </DialogDescription>
        </DialogHeader>

        {/* Hidden file inputs (shared across steps, incl. Review) */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: '', directory: '' } as any)}
          multiple
          onChange={handleFolderSelect}
          className="hidden"
        />

        {!needsCampaignSelection && <Progress value={stepProgress} className="h-1" />}
        {/* Campaign Selection (when no campaignId provided) */}
        {needsCampaignSelection ? (
          <div className="py-8 space-y-4">
            <div className="text-center mb-6">
              <h3 className="text-lg font-medium mb-2">Select an ActiPlan</h3>
              <p className="text-muted-foreground text-sm">Choose which campaign structure to mesh creatives against</p>
            </div>
            {isLoadingCampaigns ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No ActiPlans found. Create one first to use Auto-Mesh.
              </div>
            ) : (
              <Select value={selectedCampaignId} onValueChange={handleCampaignSelect}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an ActiPlan..." />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map(campaign => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      <div className="flex items-center gap-2">
                        <span>{campaign.name}</span>
                        <Badge variant="outline" className="text-xs">{campaign.status}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ) : (
          <>
            {/* Stats bar */}
            <div className="flex gap-4 text-sm border-b pb-3">
              <div><span className="text-muted-foreground">Creatives:</span> <span className="font-medium">{stats.totalAssets}</span></div>
              <div><span className="text-muted-foreground">Matched:</span> <span className="font-medium text-emerald-600">{stats.matchedCount}</span></div>
              <div><span className="text-muted-foreground">Accepted:</span> <span className="font-medium text-primary">{stats.acceptedCount}</span></div>
            </div>

            <div className="flex-1 overflow-hidden">
              {/* Source Selection: Library or Upload */}
              {(state.currentStep === 'upload' || state.currentStep === 'match') && (
                <Tabs value={activeSourceTab} onValueChange={(v) => setActiveSourceTab(v as 'library' | 'platform' | 'upload')}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="library" className="gap-2">
                      <LayoutGrid className="h-4 w-4" />
                      Library ({availableCreatives.length})
                    </TabsTrigger>
                    <TabsTrigger value="platform" className="gap-2">
                      <Layers className="h-4 w-4" />
                      Synced ({availablePlatformAssets.length})
                    </TabsTrigger>
                    <TabsTrigger value="upload" className="gap-2">
                      <Upload className="h-4 w-4" />
                      Upload
                    </TabsTrigger>
                  </TabsList>

                  {/* Library Tab - Use existing creatives */}
                  <TabsContent value="library" className="mt-4">
                    {isLoadingLibrary ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : availableCreatives.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground mb-4">No creatives in your library yet.</p>
                        <Button variant="outline" onClick={() => setActiveSourceTab('upload')}>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload New Creatives
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={allAvailableSelected}
                              onCheckedChange={() => handleSelectAll(availableCreativeIds)}
                            />
                            <span className="text-sm text-muted-foreground">
                              {selectedAvailableCount} selected
                            </span>
                          </div>
                          <Button
                            size="sm"
                            onClick={handleUseSelectedCreatives}
                            disabled={selectedAvailableCount === 0}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Use Selected ({selectedAvailableCount})
                          </Button>
                        </div>
                        <ScrollArea className="h-[300px] pr-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {availableCreatives.map(creative => (
                              <Card 
                                key={creative.id}
                                className={`cursor-pointer transition-all ${
                                  selectedCreativeIds.has(creative.id) 
                                    ? 'ring-2 ring-primary bg-primary/5' 
                                    : 'hover:bg-muted/50'
                                }`}
                                onClick={() => handleCreativeToggle(creative.id)}
                              >
                                <CardContent className="p-3">
                                  <div className="flex items-start gap-2">
                                    <Checkbox 
                                      checked={selectedCreativeIds.has(creative.id)}
                                      onCheckedChange={() => handleCreativeToggle(creative.id)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1 mb-1">
                                        {creative.creativeType === 'video' ? (
                                          <Video className="h-3 w-3 text-muted-foreground" />
                                        ) : (
                                          <Image className="h-3 w-3 text-muted-foreground" />
                                        )}
                                        <span className="text-xs text-muted-foreground capitalize">
                                          {creative.creativeType}
                                        </span>
                                      </div>
                                      <p className="text-sm font-medium truncate" title={creative.name}>
                                        {creative.name}
                                      </p>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        <Badge variant="outline" className="text-xs px-1">
                                          {creative.platform}
                                        </Badge>
                                        {creative.market && (
                                          <Badge variant="secondary" className="text-xs px-1">
                                            {creative.market}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </TabsContent>

                  {/* Platform Assets Tab - Synced from DSP */}
                  <TabsContent value="platform" className="mt-4">
                    {isLoadingPlatformAssets ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : availablePlatformAssets.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground mb-4">No synced platform assets found.</p>
                        <p className="text-xs text-muted-foreground">
                          Go to Creative Library → Platform Assets tab to sync assets from TikTok or Meta.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={allPlatformAssetsSelected}
                              onCheckedChange={() => handleSelectAllPlatformAssets(availablePlatformAssetIds)}
                            />
                            <span className="text-sm text-muted-foreground">
                              {selectedPlatformAssetCount} selected
                            </span>
                          </div>
                          <Button
                            size="sm"
                            onClick={handleUseSelectedPlatformAssets}
                            disabled={selectedPlatformAssetCount === 0}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Use Selected ({selectedPlatformAssetCount})
                          </Button>
                        </div>
                        <ScrollArea className="h-[300px] pr-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {availablePlatformAssets.map(asset => (
                              <Card 
                                key={asset.id}
                                className={`cursor-pointer transition-all ${
                                  selectedPlatformAssetIds.has(asset.id) 
                                    ? 'ring-2 ring-primary bg-primary/5' 
                                    : 'hover:bg-muted/50'
                                }`}
                                onClick={() => handlePlatformAssetToggle(asset.id)}
                              >
                                <CardContent className="p-2">
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-start gap-2">
                                      <Checkbox 
                                        checked={selectedPlatformAssetIds.has(asset.id)}
                                        onCheckedChange={() => handlePlatformAssetToggle(asset.id)}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1 mb-1">
                                          {asset.asset_type === 'VIDEO' ? (
                                            <Video className="h-3 w-3 text-muted-foreground" />
                                          ) : (
                                            <Image className="h-3 w-3 text-muted-foreground" />
                                          )}
                                          <span className="text-xs text-muted-foreground uppercase">
                                            {asset.asset_type}
                                          </span>
                                        </div>
                                        <p className="text-xs font-medium truncate" title={asset.asset_name || asset.platform_asset_id}>
                                          {asset.asset_name || asset.platform_asset_id?.substring(0, 12)}
                                        </p>
                                      </div>
                                    </div>
                                    {/* Thumbnail preview */}
                                    {(asset.thumbnail_url || asset.preview_url) && (
                                      <div className="aspect-video bg-muted rounded overflow-hidden">
                                        <img 
                                          src={asset.thumbnail_url || asset.preview_url} 
                                          alt="" 
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                    )}
                                    <div className="flex flex-wrap gap-1">
                                      <Badge variant="outline" className="text-xs px-1">
                                        {asset.platform}
                                      </Badge>
                                      {asset.aspect_ratio && (
                                        <Badge variant="secondary" className="text-xs px-1">
                                          {asset.aspect_ratio}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </TabsContent>

                  {/* Upload Tab - Upload new files */}
                  <TabsContent value="upload" className="mt-4">
                    <Tabs value={activeUploadTab} onValueChange={setActiveUploadTab}>
                      <TabsList>
                        <TabsTrigger value="files" className="gap-2"><Upload className="h-4 w-4" />Files</TabsTrigger>
                        <TabsTrigger value="folder" className="gap-2"><FolderUp className="h-4 w-4" />Folder</TabsTrigger>
                      </TabsList>
                      <TabsContent value="files" className="mt-4">
                        <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                          <p className="font-medium">Click to upload files</p>
                          <p className="text-sm text-muted-foreground">Images and videos</p>
                        </div>
                        {/* File input is rendered once above (shared across steps) */}
                      </TabsContent>
                      <TabsContent value="folder" className="mt-4">
                        <div onClick={() => folderInputRef.current?.click()} className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                          <FolderUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                          <p className="font-medium">Click to upload a folder</p>
                          <p className="text-sm text-muted-foreground">Structured by Platform/Market/Phase</p>
                        </div>
                        {/* Folder input is rendered once above (shared across steps) */}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                </Tabs>
              )}

              {/* Show added assets count */}
              {(state.currentStep === 'upload' || state.currentStep === 'match') && state.assets.length > 0 && (
                <div className="mt-4 p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium">{state.assets.length} creatives ready for matching</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => clearAll()}>
                    Clear
                  </Button>
                </div>
              )}

              {/* Review step */}
              {state.currentStep === 'review' && (
                <div className="space-y-3">
                  {/* View mode toggle and add more button */}
                  <div className="flex items-center justify-between">
                    <Tabs value={activeViewMode} onValueChange={(v) => setActiveViewMode(v as 'structure' | 'asset')}>
                      <TabsList className="h-8">
                        <TabsTrigger value="structure" className="gap-1.5 text-xs px-3">
                          <Layers className="h-3.5 w-3.5" />
                          By Ad Set
                        </TabsTrigger>
                        <TabsTrigger value="asset" className="gap-1.5 text-xs px-3">
                          <List className="h-3.5 w-3.5" />
                          By Creative
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-muted-foreground">
                        {state.structureResults.filter(r => r.assignedAssets.length > 0).length} ad sets with matches
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          // Reset to upload step but keep existing matches
                          setSelectedCreativeIds(new Set());
                        }}
                        className="gap-1.5"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Add More
                      </Button>
                    </div>
                  </div>

                  {/* Add more creatives panel - shown when user clicks "Add More" */}
                  {state.currentStep === 'review' && (
                    <Tabs value={activeSourceTab} onValueChange={(v) => setActiveSourceTab(v as 'library' | 'upload')} className="border rounded-lg p-3 bg-muted/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Add more creatives to mesh</span>
                        <TabsList className="h-7">
                          <TabsTrigger value="library" className="gap-1.5 text-xs px-2 h-6">
                            <LayoutGrid className="h-3 w-3" />
                            Library
                          </TabsTrigger>
                          <TabsTrigger value="upload" className="gap-1.5 text-xs px-2 h-6">
                            <Upload className="h-3 w-3" />
                            Upload
                          </TabsTrigger>
                        </TabsList>
                      </div>

                      <TabsContent value="library" className="mt-2">
                        {isLoadingLibrary ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : availableCreatives.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-2">No more creatives in library</p>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={allAvailableSelected}
                                  onCheckedChange={() => handleSelectAll(availableCreativeIds)}
                                />
                                <span className="text-xs text-muted-foreground">{selectedAvailableCount} selected</span>
                              </div>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 text-xs"
                                onClick={async () => {
                                  const selected = availableCreatives.filter(c => selectedCreativeIds.has(c.id));
                                  if (selected.length === 0) return;
                                  addLibraryCreatives(selected);
                                   // Always reload structures fresh from DB
                                   const structures = effectiveCampaignId 
                                     ? (await loadCampaignStructures(effectiveCampaignId) || [])
                                     : state.structures;
                                  runMatching(structures);
                                  setSelectedCreativeIds(new Set());
                                  toast.success(`Added ${selected.length} creatives and re-meshing`);
                                }}
                                disabled={selectedAvailableCount === 0}
                              >
                                <Wand2 className="h-3 w-3 mr-1" />
                                Add & Mesh ({selectedAvailableCount})
                              </Button>
                            </div>

                            <ScrollArea className="h-[120px]">
                              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                {availableCreatives.slice(0, 24).map(creative => (
                                  <div
                                    key={creative.id}
                                    className={`cursor-pointer rounded border p-1.5 transition-all ${
                                      selectedCreativeIds.has(creative.id)
                                        ? 'ring-2 ring-primary bg-primary/5'
                                        : 'hover:bg-muted/50'
                                    }`}
                                    onClick={() => handleCreativeToggle(creative.id)}
                                  >
                                    <div className="flex items-center gap-1">
                                      <Checkbox
                                        checked={selectedCreativeIds.has(creative.id)}
                                        onCheckedChange={() => handleCreativeToggle(creative.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-3 w-3"
                                      />
                                      {creative.creativeType === 'video' ? (
                                        <Video className="h-2.5 w-2.5 text-muted-foreground" />
                                      ) : (
                                        <Image className="h-2.5 w-2.5 text-muted-foreground" />
                                      )}
                                    </div>
                                    <p className="text-[10px] truncate mt-1" title={creative.name}>
                                      {creative.name}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>

                        )}
                      </TabsContent>

                      <TabsContent value="upload" className="mt-2">
                        <div className="flex gap-2">
                          <div 
                            onClick={() => fileInputRef.current?.click()} 
                            className="flex-1 border border-dashed rounded p-3 text-center cursor-pointer hover:border-primary/50 transition-colors"
                          >
                            <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                            <p className="text-xs">Files</p>
                          </div>
                          <div 
                            onClick={() => folderInputRef.current?.click()} 
                            className="flex-1 border border-dashed rounded p-3 text-center cursor-pointer hover:border-primary/50 transition-colors"
                          >
                            <FolderUp className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                            <p className="text-xs">Folder</p>
                          </div>
                        </div>
                        {/* Hidden inputs are shared with the upload step */}
                      </TabsContent>
                    </Tabs>
                  )}

                  {/* Structure-centric view */}
                  {activeViewMode === 'structure' && (
                    <StructureCentricView
                      structureResults={state.structureResults}
                      unassignedAssets={state.unassignedAssets}
                      acceptedMatches={state.acceptedMatches}
                      saveProgress={state.saveProgress}
                      onAcceptAsset={(assetId, structure) => {
                        // Build a UICreativeMatch from the structure result
                        const structureResult = state.structureResults.find(r => r.structure.id === structure.id);
                        const assignedAsset = structureResult?.assignedAssets.find(a => a.asset.id === assetId);
                        
                        if (assignedAsset) {
                          const match: UICreativeMatch = {
                            structure,
                            confidenceScore: assignedAsset.confidenceScore,
                            reasoning: assignedAsset.reasoning,
                            compatibilityIssues: assignedAsset.issues,
                            hardConstraintsMet: true,
                          };
                          acceptMatch(assetId, match);
                        } else {
                          // Handle suggestions - asset is unassigned but user wants to force-apply
                          const unassignedAsset = state.unassignedAssets.find(u => u.asset.id === assetId);
                          
                          const match: UICreativeMatch = {
                            structure,
                            confidenceScore: unassignedAsset ? 50 : 40, // Lower confidence for manual override
                            reasoning: ['Manually applied by user (constraints relaxed)'],
                            compatibilityIssues: [],
                            hardConstraintsMet: false,
                          };
                          acceptMatch(assetId, match);
                        }
                      }}
                      onRejectAsset={(assetId, structureId) => rejectMatch(assetId, structureId)}
                    />
                  )}

                  {/* Asset-centric view (legacy) */}
                  {activeViewMode === 'asset' && (
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-4">
                        {state.results.map(result => {
                          const asset = state.assets.find(a => a.id === result.assetId);
                          if (!asset) return null;
                          
                          // Find accepted match for this asset using composite key pattern
                          let acceptedMatch: UICreativeMatch | undefined;
                          for (const [key, match] of state.acceptedMatches.entries()) {
                            if (key.startsWith(`${result.assetId}:`)) {
                              acceptedMatch = match;
                              break;
                            }
                          }
                          
                          return (
                            <CreativeMatchCard
                              key={result.assetId}
                              result={result}
                              asset={asset}
                              acceptedMatch={acceptedMatch}
                              rejectedStructureIds={state.rejectedMatches.get(result.assetId) || new Set()}
                              onAccept={(match: UICreativeMatch) => acceptMatch(result.assetId, match)}
                              onReject={(structureId: string) => rejectMatch(result.assetId, structureId)}
                              onClearRejection={(structureId: string) => clearRejection(result.assetId, structureId)}
                              onClearAccepted={() => clearAcceptedMatch(result.assetId)}
                              onRemove={() => removeAsset(result.assetId)}
                            />
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              )}

              {/* Text Assets step is now rendered full-screen outside dialog */}


              {/* Complete step */}
              {state.currentStep === 'complete' && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                    <Check className="h-8 w-8 text-emerald-500" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Matches Saved!</h3>
                  <p className="text-muted-foreground text-center">{stats.acceptedCount} creatives assigned to {selectedCampaignName}</p>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div>{state.currentStep === 'review' && stats.unmatchedCount > 0 && (
                <div className="flex items-center gap-2 text-amber-600 text-sm"><AlertTriangle className="h-4 w-4" />{stats.unmatchedCount} unmatched</div>
              )}</div>
              <div className="flex gap-2">
                {state.currentStep === 'review' && <Button variant="outline" onClick={clearAll}><ArrowLeft className="h-4 w-4 mr-2" />Start Over</Button>}
                {(state.currentStep === 'upload' || state.currentStep === 'match') && state.assets.length > 0 && (
                  <Button onClick={handleRunMatchingClick} disabled={state.isProcessing}>
                    {state.isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}Run Matching
                  </Button>
                )}
                {state.currentStep === 'review' && stats.acceptedCount > 0 && (
                  <Button onClick={saveMatches} disabled={state.isProcessing}>
                    {state.isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Matches
                  </Button>
                )}
                {state.currentStep === 'complete' && <Button onClick={() => onOpenChange(false)}>Done</Button>}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>

    </>
  );
}
