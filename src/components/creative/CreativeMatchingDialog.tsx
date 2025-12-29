// Main dialog for the creative-to-plan matching workflow
import { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FolderUp, Wand2, Check, AlertTriangle, Loader2, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useCreativeMatching, UICreativeMatch } from '@/hooks/useCreativeMatching';
import { CreativeMatchCard } from './CreativeMatchCard';

interface CreativeMatchingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
}

export function CreativeMatchingDialog({ open, onOpenChange, campaignId, campaignName }: CreativeMatchingDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadTab, setActiveUploadTab] = useState('files');

  const { state, stats, loadCampaignStructures, processFiles, runMatching, acceptMatch, rejectMatch, clearRejection, removeAsset, clearAll, saveMatches } = useCreativeMatching(campaignId);

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
    if (state.assets.length === 0) { toast.error('Please upload some assets first'); return; }
    if (state.structures.length === 0) { await loadCampaignStructures(campaignId); }
    runMatching();
  }, [state.assets, state.structures, runMatching, loadCampaignStructures, campaignId]);

  const stepProgress = state.currentStep === 'upload' ? 0 : state.currentStep === 'match' ? 33 : state.currentStep === 'review' ? 66 : 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Wand2 className="h-5 w-5 text-primary" />Creative Matcher<Badge variant="secondary">{campaignName}</Badge>
          </DialogTitle>
          <DialogDescription>Match creatives to your campaign structure. Hard constraints are strictly enforced.</DialogDescription>
        </DialogHeader>

        <Progress value={stepProgress} className="h-1" />

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
      </DialogContent>
    </Dialog>
  );
}
