// Auto-Mesh Page - AI-powered creative-to-structure matching workflow
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FolderUp, Wand2, Check, AlertTriangle, Loader2, ArrowLeft, Save, Image, Video, CheckCircle2, Layers, List, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCreativeMatching, UICreativeMatch } from '@/hooks/useCreativeMatching';
import { CreativeMatchCard } from '@/components/creative/CreativeMatchCard';
import { StructureCentricView } from '@/components/creative/StructureCentricView';
import { TextAssetsStep } from '@/components/creative/TextAssetsStep';
import { FeatureGate } from '@/components/FeatureGate';

interface CampaignOption {
  id: string;
  name: string;
  status: string;
}

export default function CreativeMatching() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCampaignId = searchParams.get('campaignId') || undefined;
  const selectedAssetsParam = searchParams.get('selectedAssets');
  const preSelectedAssetIds = useMemo(
    () => selectedAssetsParam?.split(',').filter(Boolean) || [],
    [selectedAssetsParam]
  );
  const preSelectedSource = searchParams.get('source') as 'platform' | 'page' | null;
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [activeSourceTab, setActiveSourceTab] = useState<'selected' | 'upload'>(
    preSelectedAssetIds.length > 0 ? 'selected' : 'upload'
  );
  const [activeUploadTab, setActiveUploadTab] = useState('files');
  const [activeViewMode, setActiveViewMode] = useState<'structure' | 'asset'>('structure');
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>(initialCampaignId);
  const [selectedCampaignName, setSelectedCampaignName] = useState<string>('');
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  
  // Pre-selected assets from Creative Library (for auto-mesh flow)
  const [preSelectedAssets, setPreSelectedAssets] = useState<any[]>([]);
  const [isLoadingPreSelected, setIsLoadingPreSelected] = useState(preSelectedAssetIds.length > 0);

  const effectiveCampaignId = selectedCampaignId ?? initialCampaignId;

  const { state, stats, loadCampaignStructures, processFiles, addPlatformAssets, runMatching, acceptMatch, rejectMatch, clearRejection, clearAcceptedMatch, removeAsset, clearAll, saveMatches, skipTextAssets } = useCreativeMatching(effectiveCampaignId);

  // Load available campaigns
  useEffect(() => {
    if (user) {
      setIsLoadingCampaigns(true);
      supabase
        .from('campaigns')
        .select('id, name, status')
        .order('updated_at', { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            setCampaigns(data);
            // If we have an initial campaign ID, find and set its name
            if (initialCampaignId) {
              const campaign = data.find(c => c.id === initialCampaignId);
              if (campaign) {
                setSelectedCampaignName(campaign.name);
              }
            }
          }
          setIsLoadingCampaigns(false);
        });
    }
  }, [user, initialCampaignId]);

  // Load pre-selected assets from URL params (auto-mesh flow)
  useEffect(() => {
    if (preSelectedAssetIds.length > 0 && user) {
      setIsLoadingPreSelected(true);
      supabase
        .from('creative_library_assets')
        .select('*')
        .in('id', preSelectedAssetIds)
        .then(({ data, error }) => {
          if (!error && data && data.length > 0) {
            setPreSelectedAssets(data);
          }
          setIsLoadingPreSelected(false);
        });
    }
  }, [preSelectedAssetIds, user]);

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
  }, [processFiles]);

  const handleFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await processFiles(files);
    toast.success(`Processed ${files.length} files from folder`);
  }, [processFiles]);

  const handleRunMatching = async () => {
    const campaignIdToUse = effectiveCampaignId;
    if (!campaignIdToUse) { toast.error('Please select an ActiPlan first'); return; }
    if (state.assets.length === 0) { toast.error('Please add some creatives first'); return; }

    let structures = state.structures;
    if (structures.length === 0) {
      structures = await loadCampaignStructures(campaignIdToUse) || [];
    }
    runMatching(structures);
  };

  const handleClose = () => {
    navigate('/creatives');
  };

  const stepProgress = state.currentStep === 'upload' ? 0 : state.currentStep === 'match' ? 25 : state.currentStep === 'review' ? 50 : state.currentStep === 'text_assets' ? 75 : 100;
  const needsCampaignSelection = !effectiveCampaignId;

  // Text Assets step renders full-screen
  if (state.currentStep === 'text_assets') {
    return (
      <FeatureGate feature="creative_matching">
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
          <div className="flex items-center gap-3">
            <Wand2 className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Text Asset Editor</h1>
            {selectedCampaignName && <Badge variant="secondary">{selectedCampaignName}</Badge>}
          </div>
          <Button variant="ghost" onClick={handleClose}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
        
        <div className="flex-1 overflow-hidden p-6">
          <TextAssetsStep
            campaignId={effectiveCampaignId!}
            campaignName={selectedCampaignName}
            savedAssignments={state.savedAssignments}
            onComplete={() => {
              skipTextAssets();
              handleClose();
            }}
          />
        </div>
      </div>
      </FeatureGate>
    );
  }

  return (
    <FeatureGate feature="creative_matching">
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <Wand2 className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Auto-Mesh</h1>
          {selectedCampaignName && <Badge variant="secondary">{selectedCampaignName}</Badge>}
        </div>
        <Button variant="ghost" onClick={handleClose}>
          <X className="h-4 w-4 mr-2" />
          Close
        </Button>
      </div>

      {/* Progress bar */}
      {!needsCampaignSelection && <Progress value={stepProgress} className="h-1" />}

      {/* Main content */}
      <div className="flex-1 container mx-auto py-6 px-4 max-w-5xl">
        {/* Campaign Selection */}
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
                <SelectTrigger className="w-full max-w-md mx-auto">
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
            <div className="flex gap-4 text-sm border-b pb-3 mb-4">
              <div><span className="text-muted-foreground">Creatives:</span> <span className="font-medium">{stats.totalAssets}</span></div>
              <div><span className="text-muted-foreground">Matched:</span> <span className="font-medium text-primary">{stats.matchedCount}</span></div>
              <div><span className="text-muted-foreground">Accepted:</span> <span className="font-medium text-primary">{stats.acceptedCount}</span></div>
            </div>

            {/* Source Selection: Selected or Upload */}
            {(state.currentStep === 'upload' || state.currentStep === 'match') && (
              <Tabs value={activeSourceTab} onValueChange={(v) => setActiveSourceTab(v as 'selected' | 'upload')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="selected" className="gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Selected ({preSelectedAssets.length})
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Upload
                  </TabsTrigger>
                </TabsList>

                {/* Selected Tab - Pre-selected assets from Creative Library */}
                <TabsContent value="selected" className="mt-4">
                  {isLoadingPreSelected ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : preSelectedAssets.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground mb-2">No assets selected.</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        Go to Creative Library → Platform Assets or Page Assets to select assets for auto-meshing.
                      </p>
                      <Button variant="outline" onClick={() => setActiveSourceTab('upload')}>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload New Creatives
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {preSelectedAssets.length} assets ready
                          </Badge>
                          {preSelectedSource && (
                            <Badge variant="outline" className="capitalize">
                              from {preSelectedSource === 'page' ? 'Page Assets' : 'Platform Assets'}
                            </Badge>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => {
                            addPlatformAssets(preSelectedAssets);
                            toast.success(`Added ${preSelectedAssets.length} assets for matching`);
                          }}
                        >
                          <Wand2 className="h-4 w-4 mr-2" />
                          Add to Matching
                        </Button>
                      </div>
                      <ScrollArea className="h-[400px] pr-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {preSelectedAssets.map(asset => (
                            <Card key={asset.id} className="ring-2 ring-primary bg-primary/5">
                              <CardContent className="p-3">
                                <div className="flex-1 min-w-0">
                                  {asset.thumbnail_url && (
                                    <div className="aspect-video mb-2 rounded overflow-hidden bg-muted">
                                      <img 
                                        src={asset.thumbnail_url} 
                                        alt={asset.asset_name || 'Asset'} 
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1 mb-1">
                                    {asset.asset_type === 'video' ? (
                                      <Video className="h-3 w-3 text-muted-foreground" />
                                    ) : (
                                      <Image className="h-3 w-3 text-muted-foreground" />
                                    )}
                                    <span className="text-xs text-muted-foreground capitalize">
                                      {asset.asset_type}
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium truncate" title={asset.asset_name || asset.platform_asset_id}>
                                    {asset.asset_name || asset.platform_asset_id}
                                  </p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    <Badge variant="outline" className="text-xs px-1">
                                      {asset.platform}
                                    </Badge>
                                    {asset.approval_status && (
                                      <Badge 
                                        variant={asset.approval_status === 'approved' ? 'default' : 'secondary'} 
                                        className="text-xs px-1"
                                      >
                                        {asset.approval_status}
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

                {/* Upload Tab */}
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
                      <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
                    </TabsContent>
                    <TabsContent value="folder" className="mt-4">
                      <div onClick={() => folderInputRef.current?.click()} className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                        <FolderUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                        <p className="font-medium">Click to upload a folder</p>
                        <p className="text-sm text-muted-foreground">Structured by Platform/Market/Phase</p>
                      </div>
                      <input ref={folderInputRef} type="file" {...{ webkitdirectory: '', directory: '' } as any} multiple onChange={handleFolderSelect} className="hidden" />
                    </TabsContent>
                  </Tabs>
                </TabsContent>
              </Tabs>
            )}

            {/* Show added assets count */}
            {(state.currentStep === 'upload' || state.currentStep === 'match') && state.assets.length > 0 && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
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
                  <div className="text-xs text-muted-foreground">
                    {state.structureResults.filter(r => r.assignedAssets.length > 0).length} ad sets with matches
                  </div>
                </div>

                {activeViewMode === 'structure' && (
                  <StructureCentricView
                    structureResults={state.structureResults}
                    unassignedAssets={state.unassignedAssets}
                    acceptedMatches={state.acceptedMatches}
                    saveProgress={state.saveProgress}
                    onAcceptAsset={(assetId, structure) => {
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
                        const unassignedAsset = state.unassignedAssets.find(u => u.asset.id === assetId);
                        const match: UICreativeMatch = {
                          structure,
                          confidenceScore: unassignedAsset ? 50 : 40,
                          reasoning: ['Manually applied by user (platform constraint relaxed)'],
                          compatibilityIssues: [],
                          hardConstraintsMet: false,
                        };
                        acceptMatch(assetId, match);
                      }
                    }}
                    onRejectAsset={(assetId, structureId) => rejectMatch(assetId, structureId)}
                  />
                )}

                {activeViewMode === 'asset' && (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {state.results.map(result => {
                        const asset = state.assets.find(a => a.id === result.assetId);
                        if (!asset) return null;
                        
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

            {/* Complete step */}
            {state.currentStep === 'complete' && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Check className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Matches Saved!</h3>
                <p className="text-muted-foreground text-center">{stats.acceptedCount} creatives assigned to {selectedCampaignName}</p>
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-6 border-t mt-6">
              <div>{state.currentStep === 'review' && stats.unmatchedCount > 0 && (
                <div className="flex items-center gap-2 text-destructive text-sm"><AlertTriangle className="h-4 w-4" />{stats.unmatchedCount} unmatched</div>
              )}</div>
              <div className="flex gap-2">
                {state.currentStep === 'review' && <Button variant="outline" onClick={clearAll}><ArrowLeft className="h-4 w-4 mr-2" />Start Over</Button>}
                {(state.currentStep === 'upload' || state.currentStep === 'match') && state.assets.length > 0 && (
                  <Button onClick={handleRunMatching} disabled={state.isProcessing}>
                    {state.isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}Run Matching
                  </Button>
                )}
                {state.currentStep === 'review' && stats.acceptedCount > 0 && (
                  <Button onClick={saveMatches} disabled={state.isProcessing}>
                    {state.isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Matches
                  </Button>
                )}
                {state.currentStep === 'complete' && <Button onClick={handleClose}>Done</Button>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    </FeatureGate>
  );
}
