// Diff-review dialog shown after a user re-uploads a Google Ads Editor shell xlsx.
// Lists keyword adds/updates/removes and per-assignment ad changes with checkboxes
// so the user can opt-in or opt-out of individual changes before committing.

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import type { GoogleAdsShellDiff } from '@/utils/googleAdsEditorExcel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: GoogleAdsShellDiff | null;
  onApply: (selected: GoogleAdsShellDiff) => Promise<void> | void;
}

export function GoogleAdsShellReviewDialog({ open, onOpenChange, diff, onApply }: Props) {
  // Selection state — id-style keys for each diff entry. Default = all selected.
  const [selectedAdds, setSelectedAdds] = useState<Set<number>>(new Set());
  const [selectedUpdates, setSelectedUpdates] = useState<Set<number>>(new Set());
  const [selectedRemovals, setSelectedRemovals] = useState<Set<number>>(new Set());
  const [selectedAdUpdates, setSelectedAdUpdates] = useState<Set<string>>(new Set());
  const [selectedNewAds, setSelectedNewAds] = useState<Set<number>>(new Set());
  const [selectedPmaxUpdates, setSelectedPmaxUpdates] = useState<Set<number>>(new Set());
  const [isApplying, setIsApplying] = useState(false);

  // Initialise selections every time the dialog opens with a fresh diff.
  useEffect(() => {
    if (!diff) return;
    setSelectedAdds(new Set(diff.keywords.added.map((_, i) => i)));
    setSelectedUpdates(new Set(diff.keywords.updated.map((_, i) => i)));
    setSelectedRemovals(new Set(diff.keywords.removed.map((_, i) => i)));
    setSelectedAdUpdates(new Set(diff.ads.updated.map((u) => u.assignmentId)));
    setSelectedNewAds(new Set(diff.ads.added.map((_, i) => i)));
    setSelectedPmaxUpdates(new Set((diff.pmaxGroups?.updated || []).map((_, i) => i)));
  }, [diff]);

  if (!diff) return null;

  const pmaxUpdated = diff.pmaxGroups?.updated || [];
  const pmaxSkipped = diff.pmaxGroups?.skippedNew || [];
  const pmaxUnchanged = diff.pmaxGroups?.unchanged || [];

  const totalChanges =
    diff.keywords.added.length +
    diff.keywords.updated.length +
    diff.keywords.removed.length +
    diff.ads.updated.length +
    diff.ads.added.length +
    pmaxUpdated.length;

  const selectedTotal =
    selectedAdds.size +
    selectedUpdates.size +
    selectedRemovals.size +
    selectedAdUpdates.size +
    selectedNewAds.size +
    selectedPmaxUpdates.size;

  const toggle = <T,>(set: Set<T>, value: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      const filtered: GoogleAdsShellDiff = {
        keywords: {
          added: diff.keywords.added.filter((_, i) => selectedAdds.has(i)),
          updated: diff.keywords.updated.filter((_, i) => selectedUpdates.has(i)),
          removed: diff.keywords.removed.filter((_, i) => selectedRemovals.has(i)),
        },
        ads: {
          updated: diff.ads.updated.filter((u) => selectedAdUpdates.has(u.assignmentId)),
          added: diff.ads.added.filter((_, i) => selectedNewAds.has(i)),
          skippedNew: diff.ads.skippedNew,
        },
        pmaxGroups: {
          updated: pmaxUpdated.filter((_, i) => selectedPmaxUpdates.has(i)),
          skippedNew: pmaxSkipped,
          unchanged: diff.pmaxGroups.unchanged,
        },
      };
      await onApply(filtered);
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review Google Ads Shell changes</DialogTitle>
          <DialogDescription>
            {totalChanges === 0
              ? pmaxUnchanged.length > 0
                ? `No changes detected. ${pmaxUnchanged.length} PMax asset group(s) match what's already saved — re-uploading the same values is a no-op. Edit a field in the Excel to see it here.`
                : 'No changes detected vs. the current campaign.'
              : `${totalChanges} change(s) detected. Uncheck any you don't want to apply.${pmaxUnchanged.length > 0 ? ` ${pmaxUnchanged.length} PMax group(s) unchanged (skipped).` : ''}`}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          defaultValue={
            pmaxUpdated.length > 0 &&
            diff.keywords.added.length + diff.keywords.updated.length + diff.keywords.removed.length === 0 &&
            diff.ads.updated.length + diff.ads.added.length === 0
              ? 'pmax'
              : 'keywords'
          }
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList>
            <TabsTrigger value="keywords">
              Keywords
              <Badge variant="secondary" className="ml-2">
                {diff.keywords.added.length + diff.keywords.updated.length + diff.keywords.removed.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="ads">
              Ads
              <Badge variant="secondary" className="ml-2">
                {diff.ads.updated.length + diff.ads.added.length}
              </Badge>
            </TabsTrigger>
            {(pmaxUpdated.length > 0 || pmaxSkipped.length > 0 || pmaxUnchanged.length > 0) && (
              <TabsTrigger value="pmax">
                PMax Asset Groups
                <Badge variant="secondary" className="ml-2">{pmaxUpdated.length}</Badge>
              </TabsTrigger>
            )}
            {diff.ads.skippedNew.length > 0 && (
              <TabsTrigger value="skipped">
                Unmatched
                <Badge variant="outline" className="ml-2">{diff.ads.skippedNew.length}</Badge>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="keywords" className="flex-1 overflow-hidden mt-2">
            <ScrollArea className="h-[50vh] pr-3">
              {diff.keywords.added.length > 0 && (
                <Section title="Added keywords" icon={<Plus className="h-4 w-4 text-primary" />}>
                  {diff.keywords.added.map((k, i) => (
                    <Row
                      key={`add-${i}`}
                      checked={selectedAdds.has(i)}
                      onToggle={() => toggle(selectedAdds, i, setSelectedAdds)}
                    >
                      <span className="font-medium">{k.keyword}</span>
                      <Badge variant="outline" className="ml-2 text-[10px]">{k.matchType}</Badge>
                      {k.negative && <Badge variant="destructive" className="ml-1 text-[10px]">negative</Badge>}
                      <span className="text-muted-foreground text-xs ml-2 truncate">→ {k.campaignName} / {k.adGroupName}</span>
                    </Row>
                  ))}
                </Section>
              )}
              {diff.keywords.updated.length > 0 && (
                <Section title="Match-type updates" icon={<Pencil className="h-4 w-4 text-muted-foreground" />}>
                  {diff.keywords.updated.map((u, i) => (
                    <Row
                      key={`upd-${i}`}
                      checked={selectedUpdates.has(i)}
                      onToggle={() => toggle(selectedUpdates, i, setSelectedUpdates)}
                    >
                      <span className="font-medium">{u.after.keyword}</span>
                      <Badge variant="outline" className="ml-2 text-[10px] line-through">{u.before.matchType}</Badge>
                      <span className="mx-1">→</span>
                      <Badge variant="outline" className="text-[10px]">{u.after.matchType}</Badge>
                    </Row>
                  ))}
                </Section>
              )}
              {diff.keywords.removed.length > 0 && (
                <Section title="Removed keywords" icon={<Trash2 className="h-4 w-4 text-destructive" />}>
                  {diff.keywords.removed.map((k, i) => (
                    <Row
                      key={`rem-${i}`}
                      checked={selectedRemovals.has(i)}
                      onToggle={() => toggle(selectedRemovals, i, setSelectedRemovals)}
                    >
                      <span className="font-medium line-through">{k.keyword}</span>
                      <Badge variant="outline" className="ml-2 text-[10px]">{k.matchType}</Badge>
                    </Row>
                  ))}
                </Section>
              )}
              {diff.keywords.added.length + diff.keywords.updated.length + diff.keywords.removed.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No keyword changes.</p>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="ads" className="flex-1 overflow-hidden mt-2">
            <ScrollArea className="h-[50vh] pr-3">
              {diff.ads.updated.length === 0 && diff.ads.added.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No ad changes.</p>
              )}
              {diff.ads.added.length > 0 && (
                <Section title="New ads (auto-created)" icon={<Plus className="h-4 w-4 text-primary" />}>
                  {diff.ads.added.map((row, i) => (
                    <div key={`new-${i}`} className="border rounded p-2 mb-2">
                      <Row
                        checked={selectedNewAds.has(i)}
                        onToggle={() => toggle(selectedNewAds, i, setSelectedNewAds)}
                      >
                        <span className="font-medium">{row.adName}</span>
                        <Badge variant="outline" className="ml-2 text-[10px]">new</Badge>
                        <span className="text-muted-foreground text-xs ml-2 truncate">
                          {row.campaignName} / {row.adGroupName}
                        </span>
                      </Row>
                    </div>
                  ))}
                </Section>
              )}
              {diff.ads.updated.length > 0 && (
                <Section title="Updated ads" icon={<Pencil className="h-4 w-4 text-muted-foreground" />}>
                  {diff.ads.updated.map((u) => (
                    <div key={u.assignmentId} className="border rounded p-2 mb-2">
                      <Row
                        checked={selectedAdUpdates.has(u.assignmentId)}
                        onToggle={() => toggle(selectedAdUpdates, u.assignmentId, setSelectedAdUpdates)}
                      >
                        <span className="font-medium">{u.adName}</span>
                        <span className="text-muted-foreground text-xs ml-2">{u.campaignName} / {u.adGroupName}</span>
                      </Row>
                      <ul className="text-xs mt-1 ml-7 space-y-0.5 text-muted-foreground">
                        {Object.keys(u.changes).map((field) => (
                          <li key={field}>• {fieldLabel(field)}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </Section>
              )}
            </ScrollArea>
          </TabsContent>

          {(pmaxUpdated.length > 0 || pmaxSkipped.length > 0 || pmaxUnchanged.length > 0) && (
            <TabsContent value="pmax" className="flex-1 overflow-hidden mt-2">
              <ScrollArea className="h-[50vh] pr-3">
                {pmaxUpdated.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">No PMax asset group changes.</p>
                )}
                {pmaxUpdated.length > 0 && (
                  <Section title="Updated PMax asset groups" icon={<Pencil className="h-4 w-4 text-muted-foreground" />}>
                    {pmaxUpdated.map((u, i) => (
                      <div key={`pmax-upd-${i}`} className="border rounded p-2 mb-2">
                        <Row
                          checked={selectedPmaxUpdates.has(i)}
                          onToggle={() => toggle(selectedPmaxUpdates, i, setSelectedPmaxUpdates)}
                        >
                          <span className="font-medium">{u.assetGroupName}</span>
                          <span className="text-muted-foreground text-xs ml-2">{u.market} / {u.phaseName}</span>
                        </Row>
                        <ul className="text-xs mt-1 ml-7 space-y-0.5 text-muted-foreground">
                          {Object.keys(u.changes).map((field) => (
                            <li key={field}>• {fieldLabel(field)}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </Section>
                )}
                {pmaxSkipped.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-start gap-2 p-2 mb-2 bg-muted border border-border rounded text-xs">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        These PMax asset group rows couldn't be matched to a known (market, phase, ad group) in this plan.
                        Check the Market / Phase / Asset Group columns and re-upload.
                      </div>
                    </div>
                    {pmaxSkipped.map((row, i) => (
                      <div key={`pmax-skip-${i}`} className="text-xs py-1 border-b">
                        <span className="font-medium">{row.assetGroupName || '(unnamed)'}</span>
                        <span className="text-muted-foreground ml-2">{row.market} / {row.phaseName}</span>
                      </div>
                    ))}
                  </div>
                )}
                {pmaxUnchanged.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-start gap-2 p-2 mb-2 bg-muted/50 border border-border rounded text-xs">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium">{pmaxUnchanged.length} PMax asset group(s) unchanged.</span>{' '}
                        The uploaded values exactly match what's already saved for these groups, so they'll be skipped. Edit a value in the Excel and re-upload to apply changes.
                      </div>
                    </div>
                    {pmaxUnchanged.map((row, i) => (
                      <div key={`pmax-unchanged-${i}`} className="text-xs py-1 border-b">
                        <span className="font-medium">{row.assetGroupName}</span>
                        <span className="text-muted-foreground ml-2">{row.market} / {row.phaseName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          )}

          {diff.ads.skippedNew.length > 0 && (
            <TabsContent value="skipped" className="flex-1 overflow-hidden mt-2">
              <div className="flex items-start gap-2 p-2 mb-2 bg-muted border border-border rounded text-xs">
                <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  These rows couldn't be matched to a known campaign / ad group in this plan.
                  Double-check the Campaign and Ad Group columns and re-upload.
                </div>
              </div>
              <ScrollArea className="h-[42vh] pr-3">
                {diff.ads.skippedNew.map((row, i) => (
                  <div key={i} className="text-xs py-1 border-b">
                    <span className="font-medium">{row.adName || '(unnamed)'}</span>
                    <span className="text-muted-foreground ml-2">{row.campaignName} / {row.adGroupName}</span>
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isApplying}>Cancel</Button>
          <Button onClick={handleApply} disabled={isApplying || selectedTotal === 0}>
            {isApplying ? 'Applying…' : `Apply ${selectedTotal} change(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
        {icon} {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <div className="flex items-center flex-1 min-w-0">{children}</div>
    </label>
  );
}

function fieldLabel(key: string): string {
  switch (key) {
    case 'finalUrl': return 'Final URL';
    case 'path1': return 'Path 1';
    case 'path2': return 'Path 2';
    case 'headlines': return 'Headlines';
    case 'headlinePins': return 'Headline pins';
    case 'descriptions': return 'Descriptions';
    case 'descriptionPins': return 'Description pins';
    case 'longHeadlines': return 'Long headlines';
    case 'businessName': return 'Business name';
    default: return key;
  }
}
