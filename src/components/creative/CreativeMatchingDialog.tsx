// Main dialog for the creative-to-plan matching workflow
import { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FolderUp, Wand2, Check, AlertTriangle, Loader2, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCreativeMatching, UICreativeMatch } from '@/hooks/useCreativeMatching';
import { CreativeMatchCard } from './CreativeMatchCard';

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
  const [activeUploadTab, setActiveUploadTab] = useState('files');
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>(initialCampaignId);
  const [selectedCampaignName, setSelectedCampaignName] = useState<string>(initialCampaignName || '');
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);

  const { state, stats, loadCampaignStructures, processFiles, runMatching, acceptMatch, rejectMatch, clearRejection, removeAsset, clearAll, saveMatches } = useCreativeMatching(selectedCampaignId);

  // Load available campaigns when dialog opens (if no campaignId provided)
  useEffect(() => {
    if (open && !initialCampaignId && user) {
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
  }, [open, initialCampaignId, user]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      if (!initialCampaignId) {
        setSelectedCampaignId(undefined);
        setSelectedCampaignName('');
      }
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

  const handleRunMatching = useCallback(async () => {
    if (!selectedCampaignId) { toast.error('Please select an ActiPlan first'); return; }
    if (state.assets.length === 0) { toast.error('Please upload some assets first'); return; }
    if (state.structures.length === 0) { await loadCampaignStructures(selectedCampaignId); }
    runMatching();
  }, [state.assets, state.structures, runMatching, loadCampaignStructures, selectedCampaignId]);

  const stepProgress = state.currentStep === 'upload' ? 0 : state.currentStep === 'match' ? 33 : state.currentStep === 'review' ? 66 : 100;
  const needsCampaignSelection = !initialCampaignId && !selectedCampaignId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Wand2 className="h-5 w-5 text-primary" />
            Creative Matcher
            {selectedCampaignName && <Badge variant="secondary">{selectedCampaignName}</Badge>}
          </DialogTitle>
          <DialogDescription>Match creatives to your campaign structure. Hard constraints are strictly enforced.</DialogDescription>
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
            <div className="flex gap-4 text-sm border-b pb-3">
              <div><span className="text-muted-foreground">Assets:</span> <span className="font-medium">{stats.totalAssets}</span></div>
              <div><span className="text-muted-foreground">Matched:</span> <span className="font-medium text-emerald-600">{stats.matchedCount}</span></div>
              <div><span className="text-muted-foreground">Accepted:</span> <span className="font-medium text-primary">{stats.acceptedCount}</span></div>
            </div>

            <div className="flex-1 overflow-hidden">
              {(state.currentStep === 'upload' || state.currentStep === 'match') && (
                <Tabs value={activeUploadTab} onValueChange={setActiveUploadTab}>
                  <TabsList>
                    <TabsTrigger value="files" className="gap-2"><Upload className="h-4 w-4" />Files</TabsTrigger>
                    <TabsTrigger value="folder" className="gap-2"><FolderUp className="h-4 w-4" />Folder</TabsTrigger>
                  </TabsList>
                  <TabsContent value="files" className="mt-4">
                    <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                      <p className="font-medium">Click to upload files</p>
                    </div>
                    <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
                  </TabsContent>
                  <TabsContent value="folder" className="mt-4">
                    <div onClick={() => folderInputRef.current?.click()} className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                      <FolderUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                      <p className="font-medium">Click to upload a folder</p>
                    </div>
                    <input ref={folderInputRef} type="file" {...{ webkitdirectory: '', directory: '' } as any} multiple onChange={handleFolderSelect} className="hidden" />
                  </TabsContent>
                </Tabs>
              )}

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

              {state.currentStep === 'complete' && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                    <Check className="h-8 w-8 text-emerald-500" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Matches Saved!</h3>
                  <p className="text-muted-foreground text-center">{stats.acceptedCount} creatives assigned</p>
                </div>
              )}
            </div>

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
