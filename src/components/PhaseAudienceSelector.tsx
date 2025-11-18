import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { getAudienceTypesForPhase, AudienceTypeMatrixEntry } from "@/utils/audienceTypeMatrix";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Helper function to determine funnel phase from objective and optimization goal
function determineFunnelPhaseFromObjective(objective: string, optimizationGoal: string): string {
  const objLower = objective.toLowerCase();
  const goalLower = optimizationGoal.toLowerCase();
  
  // Conversion phase indicators
  if (objLower.includes('conversion') || objLower.includes('catalog') || 
      goalLower.includes('conversion') || goalLower.includes('purchase') || 
      goalLower.includes('value') || goalLower.includes('roas')) {
    return 'Conversion';
  }
  
  // Awareness phase indicators
  if (objLower.includes('awareness') || objLower.includes('reach') || 
      goalLower.includes('awareness') || goalLower.includes('reach') || 
      goalLower.includes('impression')) {
    return 'Awareness';
  }
  
  // Consideration phase (default for everything else)
  return 'Consideration';
}

interface PhaseAudienceSelectorProps {
  phaseName: string;
  phaseId: string;
  phaseObjective?: string;
  phaseOptimizationGoal?: string;
  adAccountId: string;
  onAudiencesSelected: (audiences: SelectedAudience[]) => void;
  initialSelection?: SelectedAudience[];
}

export interface SelectedAudience {
  id: string;
  name: string;
  type: string;
  source: string;
  subtype?: string;
  approximate_count?: number;
  audienceSize?: number;
}

interface FetchedAudience {
  id: string;
  name: string;
  subtype: string;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
  source?: string;
  audienceSize?: number;
}

export function PhaseAudienceSelector({
  phaseName,
  phaseId,
  phaseObjective,
  phaseOptimizationGoal,
  adAccountId,
  onAudiencesSelected,
  initialSelection = []
}: PhaseAudienceSelectorProps) {
  const [loading, setLoading] = useState(false);
  const [audiencesByType, setAudiencesByType] = useState<Record<string, FetchedAudience[]>>({});
  const [selectedAudiences, setSelectedAudiences] = useState<Set<string>>(
    new Set(initialSelection.map(a => a.id))
  );
  const [matrixEntries, setMatrixEntries] = useState<AudienceTypeMatrixEntry[]>([]);
  
  // Collapsible sections state - all start collapsed
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Determine phase
  const determinedPhase = phaseObjective && phaseOptimizationGoal
    ? determineFunnelPhaseFromObjective(phaseObjective, phaseOptimizationGoal)
    : 'Consideration';

  // Fetch audiences and group by strategy
  useEffect(() => {
    if (!adAccountId) return;
    
    const entries = getAudienceTypesForPhase(determinedPhase);
    setMatrixEntries(entries);
    
    // Group entries by source type to fetch
    const sourcesToFetch = [...new Set(entries.map(e => e.source))];
    
    loadAudiences(sourcesToFetch);
  }, [adAccountId, determinedPhase]);

  // Group audiences by strategy instead of type
  const audiencesByStrategy = matrixEntries.reduce((acc, entry) => {
    const audiences = audiencesByType[entry.source] || [];
    if (!acc[entry.strategy]) {
      acc[entry.strategy] = [];
    }
    acc[entry.strategy].push(...audiences.map(aud => ({ ...aud, source: entry.source })));
    return acc;
  }, {} as Record<string, FetchedAudience[]>);

  const loadAudiences = async (sources: string[]) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-meta-audiences', {
        body: { adAccountId, sources }
      });

      if (error) throw error;

      // Group by source
      const grouped = data.reduce((acc: Record<string, FetchedAudience[]>, audience: any) => {
        const source = audience.source || 'Unknown';
        if (!acc[source]) acc[source] = [];
        acc[source].push(audience);
        return acc;
      }, {});

      setAudiencesByType(grouped);
    } catch (error: any) {
      console.error('Error loading audiences:', error);
      toast.error(error.message || 'Failed to load audiences');
    } finally {
      setLoading(false);
    }
  };

  const handleAudienceToggle = (audience: FetchedAudience) => {
    setSelectedAudiences(prev => {
      const newSet = new Set(prev);
      if (newSet.has(audience.id)) {
        newSet.delete(audience.id);
      } else {
        newSet.add(audience.id);
      }
      return newSet;
    });
  };

  // Update parent when selection changes
  useEffect(() => {
    const selected: SelectedAudience[] = [];
    Object.entries(audiencesByType).forEach(([source, audiences]) => {
      audiences.forEach(aud => {
        if (selectedAudiences.has(aud.id)) {
          const entry = matrixEntries.find(e => e.source === source);
          selected.push({
            id: aud.id,
            name: aud.name,
            type: entry?.type || 'Unknown',
            source: source,
            subtype: aud.subtype,
            approximate_count: aud.approximate_count_lower_bound,
            audienceSize: aud.audienceSize
          });
        }
      });
    });
    onAudiencesSelected(selected);
  }, [selectedAudiences, audiencesByType, matrixEntries]);

  const formatAudienceSize = (size?: number) => {
    if (!size) return '';
    if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    return size.toString();
  };

  return (
    <div className="space-y-4">
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {/* Audience Selection by Strategy */}
      {!loading && Object.keys(audiencesByStrategy).length > 0 && (
        <div className="space-y-3">
          {Object.entries(audiencesByStrategy).map(([strategy, audiences]) => {
            // Remove duplicates based on id
            const uniqueAudiences = audiences.reduce((acc, curr) => {
              if (!acc.find(a => a.id === curr.id)) {
                acc.push(curr);
              }
              return acc;
            }, [] as FetchedAudience[]);

            return (
              <Collapsible
                key={strategy}
                open={expandedSections[strategy] || false}
                onOpenChange={(open) => setExpandedSections(prev => ({ ...prev, [strategy]: open }))}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="font-medium">{strategy}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{uniqueAudiences.length}</Badge>
                      {expandedSections[strategy] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-2">
                  {uniqueAudiences.map((audience) => (
                    <div key={audience.id} className="flex items-center gap-2 p-2 border rounded">
                      <Checkbox
                        checked={selectedAudiences.has(audience.id)}
                        onCheckedChange={() => handleAudienceToggle(audience)}
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium">{audience.name}</span>
                        {audience.source && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {audience.source}
                          </Badge>
                        )}
                        {audience.audienceSize && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {formatAudienceSize(audience.audienceSize)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      {!loading && Object.keys(audiencesByStrategy).length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No audiences available for this phase</p>
          <p className="text-sm mt-2">Phase: {determinedPhase}</p>
        </div>
      )}
    </div>
  );
}
