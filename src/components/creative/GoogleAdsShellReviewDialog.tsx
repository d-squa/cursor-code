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
  const [isApplying, setIsApplying] = useState(false);

  // Initialise selections every time the dialog opens with a fresh diff.
  useEffect(() => {
    if (!diff) return;
    setSelectedAdds(new Set(diff.keywords.added.map((_, i) => i)));
    setSelectedUpdates(new Set(diff.keywords.updated.map((_, i) => i)));
    setSelectedRemovals(new Set(diff.keywords.removed.map((_, i) => i)));
    setSelectedAdUpdates(new Set(diff.ads.updated.map((u) => u.assignmentId)));
  }, [diff]);

  if (!diff) return null;

  const totalChanges =
    diff.keywords.added.length +
    diff.keywords.updated.length +
    diff.keywords.removed.length +
    diff.ads.updated.length;

  const selectedTotal =
    selectedAdds.size + selectedUpdates.size + selectedRemovals.size + selectedAdUpdates.size;

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
          skippedNew: diff.ads.skippedNew,
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
              ? 'No changes detected vs. the current campaign.'
              : `${totalChanges} change(s) detected. Uncheck any you don't want to apply.`}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="keywords" className="flex-1 flex flex-col overflow-hidden">
          <TabsList>
            <TabsTrigger value="keywords">
              Keywords
              <Badge variant="secondary" className="ml-2">
                {diff.keywords.added.length + diff.keywords.updated.length + diff.keywords.removed.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="ads">
              Ads
              <Badge variant="secondary" className="ml-2">{diff.ads.updated.length}</Badge>
            </TabsTrigger>
            {diff.ads.skippedNew.length > 0 && (
              <TabsTrigger value="skipped">
                New rows
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
              {diff.ads.updated.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No ad updates.</p>
              )}
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
            </ScrollArea>
          </TabsContent>

          {diff.ads.skippedNew.length > 0 && (
            <TabsContent value="skipped" className="flex-1 overflow-hidden mt-2">
              <div className="flex items-start gap-2 p-2 mb-2 bg-muted border border-border rounded text-xs">
                <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  New RSA rows detected. Auto-creation isn't supported in this version — add the
                  ads inside the editor first, then re-upload to update them.
                </div>
              </div>
              <ScrollArea className="h-[42vh] pr-3">
                {diff.ads.skippedNew.map((row, i) => (
                  <div key={i} className="text-xs py-1 border-b">
                    <span className="font-medium">{row.adName}</span>
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
