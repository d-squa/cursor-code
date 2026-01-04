// Dialog to select destination for duplicating creatives
import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Copy, Target } from 'lucide-react';

export interface DuplicateDestination {
  platform: string;
  market: string;
  phase: string;
  adSetId?: string;
  adSetName?: string;
}

interface CampaignStructure {
  platform: string;
  market: string;
  phase: string;
  adSetId?: string;
  adSetName?: string;
}

interface DuplicateDestinationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableStructures: CampaignStructure[];
  creativeCount: number;
  onConfirm: (destination: DuplicateDestination) => void;
}

export function DuplicateDestinationDialog({
  open,
  onOpenChange,
  availableStructures,
  creativeCount,
  onConfirm,
}: DuplicateDestinationDialogProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [selectedAdSet, setSelectedAdSet] = useState<string | null>(null);

  // Get unique values for each level based on current selections
  const platforms = useMemo(() => 
    [...new Set(availableStructures.map(s => s.platform))].sort(),
    [availableStructures]
  );

  const markets = useMemo(() => {
    if (!selectedPlatform) return [];
    return [...new Set(
      availableStructures
        .filter(s => s.platform === selectedPlatform)
        .map(s => s.market)
    )].sort();
  }, [availableStructures, selectedPlatform]);

  const phases = useMemo(() => {
    if (!selectedPlatform || !selectedMarket) return [];
    return [...new Set(
      availableStructures
        .filter(s => s.platform === selectedPlatform && s.market === selectedMarket)
        .map(s => s.phase)
    )].sort();
  }, [availableStructures, selectedPlatform, selectedMarket]);

  const adSets = useMemo(() => {
    if (!selectedPlatform || !selectedMarket || !selectedPhase) return [];
    return availableStructures
      .filter(s => 
        s.platform === selectedPlatform && 
        s.market === selectedMarket && 
        s.phase === selectedPhase &&
        s.adSetId
      )
      .map(s => ({ id: s.adSetId!, name: s.adSetName || s.adSetId! }));
  }, [availableStructures, selectedPlatform, selectedMarket, selectedPhase]);

  const handlePlatformChange = (value: string) => {
    setSelectedPlatform(value);
    setSelectedMarket(null);
    setSelectedPhase(null);
    setSelectedAdSet(null);
  };

  const handleMarketChange = (value: string) => {
    setSelectedMarket(value);
    setSelectedPhase(null);
    setSelectedAdSet(null);
  };

  const handlePhaseChange = (value: string) => {
    setSelectedPhase(value);
    setSelectedAdSet(null);
  };

  const handleConfirm = () => {
    if (!selectedPlatform || !selectedMarket || !selectedPhase) return;
    
    const adSet = adSets.find(a => a.id === selectedAdSet);
    onConfirm({
      platform: selectedPlatform,
      market: selectedMarket,
      phase: selectedPhase,
      adSetId: selectedAdSet || undefined,
      adSetName: adSet?.name,
    });
    onOpenChange(false);
  };

  const isValid = selectedPlatform && selectedMarket && selectedPhase;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Duplicate to Destination
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              Duplicating <Badge variant="secondary">{creativeCount}</Badge> creative{creativeCount !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Platform</Label>
              <Select value={selectedPlatform || ''} onValueChange={handlePlatformChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select platform..." />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Market</Label>
              <Select 
                value={selectedMarket || ''} 
                onValueChange={handleMarketChange}
                disabled={!selectedPlatform}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select market..." />
                </SelectTrigger>
                <SelectContent>
                  {markets.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Phase</Label>
              <Select 
                value={selectedPhase || ''} 
                onValueChange={handlePhaseChange}
                disabled={!selectedMarket}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select phase..." />
                </SelectTrigger>
                <SelectContent>
                  {phases.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {adSets.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Ad Set (optional)</Label>
                <Select 
                  value={selectedAdSet || ''} 
                  onValueChange={setSelectedAdSet}
                  disabled={!selectedPhase}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All ad sets in phase..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All ad sets</SelectItem>
                    {adSets.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid}>
            <Copy className="h-4 w-4 mr-1" />
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
