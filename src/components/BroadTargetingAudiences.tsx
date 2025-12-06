import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronDown, ChevronUp, Users, Target } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface BroadTargetingAudiencesProps {
  adAccountId: string;
  platform: string;
  retargetingAudiences?: Array<{ id: string; name: string; approximate_count?: number }>;
  lookalikeAudiences?: Array<{ id: string; name: string; approximate_count?: number }>;
  onRetargetingChange: (audiences: Array<{ id: string; name: string; approximate_count?: number }>) => void;
  onLookalikeChange: (audiences: Array<{ id: string; name: string; approximate_count?: number }>) => void;
}

interface FetchedAudience {
  id: string;
  name: string;
  subtype: string;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
}

export function BroadTargetingAudiences({
  adAccountId,
  platform,
  retargetingAudiences = [],
  lookalikeAudiences = [],
  onRetargetingChange,
  onLookalikeChange,
}: BroadTargetingAudiencesProps) {
  const [loading, setLoading] = useState(false);
  const [availableRetargeting, setAvailableRetargeting] = useState<FetchedAudience[]>([]);
  const [availableLookalike, setAvailableLookalike] = useState<FetchedAudience[]>([]);
  const [retargetingExpanded, setRetargetingExpanded] = useState(true);
  const [lookalikeExpanded, setLookalikeExpanded] = useState(true);

  const selectedRetargetingIds = new Set(retargetingAudiences.map(a => a.id));
  const selectedLookalikeIds = new Set(lookalikeAudiences.map(a => a.id));

  useEffect(() => {
    if (!adAccountId) return;
    loadAudiences();
  }, [adAccountId, platform]);

  const loadAudiences = async () => {
    setLoading(true);
    try {
      const isTikTok = platform?.toLowerCase().includes('tiktok');
      
      if (isTikTok) {
        // TikTok audience loading - would need different endpoint
        console.log('TikTok audience loading for broad targeting');
        setAvailableRetargeting([]);
        setAvailableLookalike([]);
        return;
      }
      
      // Meta audience loading - fetch custom and lookalike audiences
      const { data, error } = await supabase.functions.invoke('fetch-meta-audiences', {
        body: { 
          adAccountId, 
          sources: ['Custom Audience', 'Lookalike Audience'] 
        }
      });

      if (error) throw error;

      const audiences = Array.isArray(data) ? data : [];
      
      // Separate into retargeting (custom) and lookalike
      const retargeting = audiences.filter((a: any) => 
        a.source === 'Custom Audience' || 
        a.subtype?.toLowerCase().includes('custom') ||
        a.subtype?.toLowerCase().includes('website') ||
        a.subtype?.toLowerCase().includes('engagement') ||
        a.subtype?.toLowerCase().includes('video')
      );
      
      const lookalike = audiences.filter((a: any) => 
        a.source === 'Lookalike Audience' || 
        a.subtype?.toLowerCase().includes('lookalike')
      );

      setAvailableRetargeting(retargeting);
      setAvailableLookalike(lookalike);
    } catch (error: any) {
      console.error('Error loading audiences for broad targeting:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetargetingToggle = (audience: FetchedAudience) => {
    const exists = retargetingAudiences.find(a => a.id === audience.id);
    if (exists) {
      onRetargetingChange(retargetingAudiences.filter(a => a.id !== audience.id));
    } else {
      onRetargetingChange([...retargetingAudiences, {
        id: audience.id,
        name: audience.name,
        approximate_count: audience.approximate_count_lower_bound
      }]);
    }
  };

  const handleLookalikeToggle = (audience: FetchedAudience) => {
    const exists = lookalikeAudiences.find(a => a.id === audience.id);
    if (exists) {
      onLookalikeChange(lookalikeAudiences.filter(a => a.id !== audience.id));
    } else {
      onLookalikeChange([...lookalikeAudiences, {
        id: audience.id,
        name: audience.name,
        approximate_count: audience.approximate_count_lower_bound
      }]);
    }
  };

  const formatAudienceSize = (size?: number) => {
    if (!size) return '';
    if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    return size.toString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Loading audiences...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Retargeting Audiences Section */}
      <Collapsible open={retargetingExpanded} onOpenChange={setRetargetingExpanded}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between" size="sm">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              <span className="font-medium">Retarget Audiences</span>
              <Badge variant="secondary" className="text-xs">
                {retargetingAudiences.length} selected
              </Badge>
            </div>
            {retargetingExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-2">
          {availableRetargeting.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">No retargeting audiences available for this ad account.</p>
          ) : (
            availableRetargeting.map((audience) => (
              <div key={audience.id} className="flex items-center gap-2 p-2 border rounded bg-background">
                <Checkbox
                  checked={selectedRetargetingIds.has(audience.id)}
                  onCheckedChange={() => handleRetargetingToggle(audience)}
                />
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-sm">{audience.name}</span>
                  {audience.subtype && (
                    <Badge variant="outline" className="text-xs">{audience.subtype}</Badge>
                  )}
                  {audience.approximate_count_lower_bound && (
                    <Badge variant="secondary" className="text-xs">
                      {formatAudienceSize(audience.approximate_count_lower_bound)}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Lookalike Audiences Section */}
      <Collapsible open={lookalikeExpanded} onOpenChange={setLookalikeExpanded}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between" size="sm">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="font-medium">Expand to New but Similar Audiences</span>
              <Badge variant="secondary" className="text-xs">
                {lookalikeAudiences.length} selected
              </Badge>
            </div>
            {lookalikeExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-2">
          {availableLookalike.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">No lookalike audiences available for this ad account.</p>
          ) : (
            availableLookalike.map((audience) => (
              <div key={audience.id} className="flex items-center gap-2 p-2 border rounded bg-background">
                <Checkbox
                  checked={selectedLookalikeIds.has(audience.id)}
                  onCheckedChange={() => handleLookalikeToggle(audience)}
                />
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-sm">{audience.name}</span>
                  {audience.subtype && (
                    <Badge variant="outline" className="text-xs">{audience.subtype}</Badge>
                  )}
                  {audience.approximate_count_lower_bound && (
                    <Badge variant="secondary" className="text-xs">
                      {formatAudienceSize(audience.approximate_count_lower_bound)}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
