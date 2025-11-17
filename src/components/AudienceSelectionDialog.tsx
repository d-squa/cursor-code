import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Target, TrendingUp, Users, Repeat } from "lucide-react";

interface ParsedTargeting {
  market: string;
  location?: string[];
  ageMin?: number;
  ageMax?: number;
  gender?: string[];
  devices?: string[];
  languages?: string[];
  os?: string[];
  interests?: Array<{ name: string; id: string; audienceSize?: number }>;
  behaviors?: Array<{ name: string; id: string; audienceSize?: number }>;
  customAudiences?: Array<{ name: string; id: string; type: string }>;
  lookalikes?: Array<{ name: string; id: string; sourceAudienceId: string }>;
  customerLists?: Array<{ name: string; id: string }>;
}

interface AudienceSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parsedTargeting: ParsedTargeting[];
  onApply: (selectedTargeting: ParsedTargeting[]) => void;
}

export function AudienceSelectionDialog({ open, onOpenChange, parsedTargeting, onApply }: AudienceSelectionDialogProps) {
  const [selections, setSelections] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    parsedTargeting.forEach((market) => {
      initial[market.market] = {
        interests: market.interests?.map((_, idx) => idx) || [],
        behaviors: market.behaviors?.map((_, idx) => idx) || [],
        customAudiences: market.customAudiences?.map((_, idx) => idx) || [],
        lookalikes: market.lookalikes?.map((_, idx) => idx) || [],
        customerLists: market.customerLists?.map((_, idx) => idx) || [],
      };
    });
    return initial;
  });

  const toggleSelection = (market: string, type: string, index: number) => {
    setSelections((prev) => {
      const marketSelections = prev[market] || {};
      const typeSelections = marketSelections[type] || [];
      const newTypeSelections = typeSelections.includes(index)
        ? typeSelections.filter((i: number) => i !== index)
        : [...typeSelections, index];
      
      return {
        ...prev,
        [market]: {
          ...marketSelections,
          [type]: newTypeSelections,
        },
      };
    });
  };

  const handleApply = () => {
    const filtered = parsedTargeting.map((market) => {
      const marketSelections = selections[market.market] || {};
      return {
        ...market,
        interests: market.interests?.filter((_, idx) => marketSelections.interests?.includes(idx)),
        behaviors: market.behaviors?.filter((_, idx) => marketSelections.behaviors?.includes(idx)),
        customAudiences: market.customAudiences?.filter((_, idx) => marketSelections.customAudiences?.includes(idx)),
        lookalikes: market.lookalikes?.filter((_, idx) => marketSelections.lookalikes?.includes(idx)),
        customerLists: market.customerLists?.filter((_, idx) => marketSelections.customerLists?.includes(idx)),
      };
    });
    onApply(filtered);
    onOpenChange(false);
  };

  const formatAudienceSize = (size?: number) => {
    if (!size) return "";
    if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    return `${size}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Select Audiences to Apply</DialogTitle>
          <DialogDescription>
            Choose which audiences you want to apply to your campaign. Uncheck any you don't want to use.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-6">
            {parsedTargeting.map((market) => (
              <div key={market.market} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{market.market}</h3>
                  <Badge variant="outline">
                    {market.ageMin && market.ageMax ? `${market.ageMin}-${market.ageMax}` : market.ageMin ? `${market.ageMin}+` : 'All Ages'}
                    {market.gender && ` • ${market.gender.join(', ')}`}
                  </Badge>
                </div>

                {market.interests && market.interests.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-medium">Interests ({market.interests.length})</h4>
                    </div>
                    <div className="space-y-2 pl-6">
                      {market.interests.map((interest, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <Checkbox
                            id={`${market.market}-interest-${idx}`}
                            checked={selections[market.market]?.interests?.includes(idx)}
                            onCheckedChange={() => toggleSelection(market.market, 'interests', idx)}
                          />
                          <label
                            htmlFor={`${market.market}-interest-${idx}`}
                            className="text-sm flex-1 cursor-pointer flex items-center justify-between"
                          >
                            <span>{interest.name}</span>
                            {interest.audienceSize && (
                              <span className="text-xs text-muted-foreground">
                                {formatAudienceSize(interest.audienceSize)}
                              </span>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {market.behaviors && market.behaviors.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-medium">Behaviors ({market.behaviors.length})</h4>
                    </div>
                    <div className="space-y-2 pl-6">
                      {market.behaviors.map((behavior, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <Checkbox
                            id={`${market.market}-behavior-${idx}`}
                            checked={selections[market.market]?.behaviors?.includes(idx)}
                            onCheckedChange={() => toggleSelection(market.market, 'behaviors', idx)}
                          />
                          <label
                            htmlFor={`${market.market}-behavior-${idx}`}
                            className="text-sm flex-1 cursor-pointer flex items-center justify-between"
                          >
                            <span>{behavior.name}</span>
                            {behavior.audienceSize && (
                              <span className="text-xs text-muted-foreground">
                                {formatAudienceSize(behavior.audienceSize)}
                              </span>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {market.customAudiences && market.customAudiences.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Repeat className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-medium">Custom Audiences ({market.customAudiences.length})</h4>
                    </div>
                    <div className="space-y-2 pl-6">
                      {market.customAudiences.map((audience, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <Checkbox
                            id={`${market.market}-custom-${idx}`}
                            checked={selections[market.market]?.customAudiences?.includes(idx)}
                            onCheckedChange={() => toggleSelection(market.market, 'customAudiences', idx)}
                          />
                          <label
                            htmlFor={`${market.market}-custom-${idx}`}
                            className="text-sm flex-1 cursor-pointer"
                          >
                            {audience.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {market.lookalikes && market.lookalikes.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-medium">Lookalike Audiences ({market.lookalikes.length})</h4>
                    </div>
                    <div className="space-y-2 pl-6">
                      {market.lookalikes.map((audience, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <Checkbox
                            id={`${market.market}-lookalike-${idx}`}
                            checked={selections[market.market]?.lookalikes?.includes(idx)}
                            onCheckedChange={() => toggleSelection(market.market, 'lookalikes', idx)}
                          />
                          <label
                            htmlFor={`${market.market}-lookalike-${idx}`}
                            className="text-sm flex-1 cursor-pointer"
                          >
                            {audience.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {market.customerLists && market.customerLists.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-medium">Customer Lists ({market.customerLists.length})</h4>
                    </div>
                    <div className="space-y-2 pl-6">
                      {market.customerLists.map((list, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <Checkbox
                            id={`${market.market}-customerlist-${idx}`}
                            checked={selections[market.market]?.customerLists?.includes(idx)}
                            onCheckedChange={() => toggleSelection(market.market, 'customerLists', idx)}
                          />
                          <label
                            htmlFor={`${market.market}-customerlist-${idx}`}
                            className="text-sm flex-1 cursor-pointer"
                          >
                            {list.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            Apply Selected Audiences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
