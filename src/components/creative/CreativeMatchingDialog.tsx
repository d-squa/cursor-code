// Main dialog for the creative-to-plan matching workflow
// Now supports using existing library creatives OR uploading new ones
import { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FolderUp, Wand2, Check, AlertTriangle, Loader2, ArrowLeft, Save, LayoutGrid, Image, Video, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCreativeMatching, UICreativeMatch, DigestedAsset } from '@/hooks/useCreativeMatching';
import { CreativeMatchCard } from './CreativeMatchCard';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [activeSourceTab, setActiveSourceTab] = useState<'library' | 'upload'>('library');
  const [activeUploadTab, setActiveUploadTab] = useState('files');
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>(initialCampaignId);
  const [selectedCampaignName, setSelectedCampaignName] = useState<string>(initialCampaignName || '');
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  
  // Library creatives state
  const [libraryCreatives, setLibraryCreatives] = useState<Creative[]>([]);
  const [selectedCreativeIds, setSelectedCreativeIds] = useState<Set<string>>(new Set());
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  // Sync state with props when they change
  useEffect(() => {
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
      setSelectedCampaignName(initialCampaignName || '');
    }
  }, [initialCampaignId, initialCampaignName]);

  const { state, stats, loadCampaignStructures, processFiles, addLibraryCreatives, runMatching, acceptMatch, rejectMatch, clearRejection, removeAsset, clearAll, saveMatches } = useCreativeMatching(selectedCampaignId);

  // Load available campaigns when dialog opens (if no campaignId provided)
  useEffect(() => {
    if (open && !initialCampaignId && !selectedCampaignId && user) {
      setIsLoadingCampaigns(true);
      supabase
        .from('campaigns')
        .select('id, name, status')
        .order('updated_at', { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            setCampaigns(data);
          }
          setIsLoadingCampaigns(false);
        });
    }
  }, [open, initialCampaignId, selectedCampaignId, user]);

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

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      if (!initialCampaignId) {
        setSelectedCampaignId(undefined);
        setSelectedCampaignName('');
      }
      setSelectedCreativeIds(new Set());
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
  }, [processFiles]);

  const handleFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await processFiles(files);
    toast.success(`Processed ${files.length} files from folder`);
  }, [processFiles]);

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

  const handleSelectAll = useCallback(() => {
    if (selectedCreativeIds.size === libraryCreatives.length) {
      setSelectedCreativeIds(new Set());
    } else {
      setSelectedCreativeIds(new Set(libraryCreatives.map(c => c.id)));
    }
  }, [libraryCreatives, selectedCreativeIds.size]);

  const handleUseSelectedCreatives = useCallback(async () => {
    const selected = libraryCreatives.filter(c => selectedCreativeIds.has(c.id));
    if (selected.length === 0) {
      toast.error('Please select at least one creative');
      return;
    }
    addLibraryCreatives(selected);
    toast.success(`Added ${selected.length} creatives for matching`);
  }, [libraryCreatives, selectedCreativeIds, addLibraryCreatives]);

  const handleRunMatching = useCallback(async () => {
    if (!selectedCampaignId) { toast.error('Please select an ActiPlan first'); return; }
    if (state.assets.length === 0) { toast.error('Please add some creatives first'); return; }
    if (state.structures.length === 0) { await loadCampaignStructures(selectedCampaignId); }
    runMatching();
  }, [state.assets, state.structures, runMatching, loadCampaignStructures, selectedCampaignId]);

  const stepProgress = state.currentStep === 'upload' ? 0 : state.currentStep === 'match' ? 33 : state.currentStep === 'review' ? 66 : 100;
  const needsCampaignSelection = !initialCampaignId && !selectedCampaignId;

  // Filter library creatives that are not already assigned to a campaign
  const availableCreatives = libraryCreatives.filter(c => !c.campaignId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Wand2 className="h-5 w-5 text-primary" />
            Creative Matcher
            {selectedCampaignName && <Badge variant="secondary">{selectedCampaignName}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Select creatives from your library or upload new ones, then match them to your campaign structure.
          </DialogDescription>
        </DialogHeader>

        {!needsCampaignSelection && <Progress value={stepProgress} className="h-1" />}

        {/* Campaign Selection (when no campaignId provided) */}
        {needsCampaignSelection ? (
          <div className="py-8 space-y-4">
            <div className="text-center mb-6">
              <h3 className="text-lg font-medium mb-2">Select an ActiPlan</h3>
              <p className="text-muted-foreground text-sm">Choose which campaign structure to match creatives against</p>
            </div>
            {isLoadingCampaigns ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No ActiPlans found. Create one first to use the Creative Matcher.
              </div>
            ) : (
              <Select onValueChange={handleCampaignSelect}>
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
                <Tabs value={activeSourceTab} onValueChange={(v) => setActiveSourceTab(v as 'library' | 'upload')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="library" className="gap-2">
                      <LayoutGrid className="h-4 w-4" />
                      From Library ({availableCreatives.length})
                    </TabsTrigger>
                    <TabsTrigger value="upload" className="gap-2">
                      <Upload className="h-4 w-4" />
                      Upload New
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
                              checked={selectedCreativeIds.size === availableCreatives.length}
                              onCheckedChange={handleSelectAll}
                            />
                            <span className="text-sm text-muted-foreground">
                              {selectedCreativeIds.size} selected
                            </span>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={handleUseSelectedCreatives}
                            disabled={selectedCreativeIds.size === 0}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Use Selected ({selectedCreativeIds.size})
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
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    {state.results.map(result => {
                      const asset = state.assets.find(a => a.id === result.assetId);
                      if (!asset) return null;
                      return (
                        <CreativeMatchCard
                          key={result.assetId}
                          result={result}
                          asset={asset}
                          acceptedMatch={state.acceptedMatches.get(result.assetId)}
                          rejectedStructureIds={state.rejectedMatches.get(result.assetId) || new Set()}
                          onAccept={(match: UICreativeMatch) => acceptMatch(result.assetId, match)}
                          onReject={(structureId: string) => rejectMatch(result.assetId, structureId)}
                          onClearRejection={(structureId: string) => clearRejection(result.assetId, structureId)}
                          onRemove={() => removeAsset(result.assetId)}
                        />
                      );
                    })}
                  </div>
                </ScrollArea>
              )}

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
                  <Button onClick={handleRunMatching} disabled={state.isProcessing}>
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
  );
}
