import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getAudienceTypesForPhase, getSourcesByTypeForPhase, getAudienceTypeDescription, AudienceTypeMatrixEntry } from "@/utils/audienceTypeMatrix";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
}

interface FetchedAudience {
  id: string;
  name: string;
  subtype: string;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
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

  useEffect(() => {
    // Use objective and optimization goal to determine the funnel phase
    const determinedPhase = phaseObjective && phaseOptimizationGoal 
      ? determineFunnelPhaseFromObjective(phaseObjective, phaseOptimizationGoal)
      : phaseName;
    
    const entries = getAudienceTypesForPhase(determinedPhase, "Meta");
    setMatrixEntries(entries);
    
    console.log(`🎯 Phase "${phaseName}" - Objective: ${phaseObjective}, Goal: ${phaseOptimizationGoal}`, {
      phase: phaseName,
      phaseId,
      determinedPhase,
      objective: phaseObjective,
      optimizationGoal: phaseOptimizationGoal,
      audienceTypes: entries.map(e => `${e.type} (${e.source})`)
    });

    if (entries.length > 0 && adAccountId) {
      loadAudiences(entries);
    }
  }, [phaseName, phaseId, phaseObjective, phaseOptimizationGoal, adAccountId]);

  const loadAudiences = async (entries: AudienceTypeMatrixEntry[]) => {
    setLoading(true);
    try {
      const audienceMap: Record<string, FetchedAudience[]> = {};

      // Group entries by type for efficient fetching
      const typeGroups = entries.reduce((acc, entry) => {
        if (!acc[entry.type]) {
          acc[entry.type] = [];
        }
        if (entry.source && !acc[entry.type].includes(entry.source)) {
          acc[entry.type].push(entry.source);
        }
        return acc;
      }, {} as Record<string, string[]>);

      // Fetch audiences for each type
      for (const [type, sources] of Object.entries(typeGroups)) {
        const { data, error } = await supabase.functions.invoke('fetch-meta-audiences', {
          body: {
            adAccountId,
            sources,
            type
          }
        });

        if (error) {
          console.error(`Error fetching ${type}:`, error);
          continue;
        }

        audienceMap[type] = data?.data || [];
        
        console.log(`✅ Fetched ${type} for phase "${phaseName}":`, {
          type,
          sources,
          count: data?.data?.length || 0,
          audiences: data?.data?.map((a: any) => ({ id: a.id, name: a.name, subtype: a.subtype }))
        });
      }

      setAudiencesByType(audienceMap);

    } catch (error) {
      console.error('Error loading audiences:', error);
      toast.error('Failed to load audiences');
    } finally {
      setLoading(false);
    }
  };

  const toggleAudience = (audience: FetchedAudience, type: string, source: string) => {
    const newSelected = new Set(selectedAudiences);
    
    if (newSelected.has(audience.id)) {
      newSelected.delete(audience.id);
      console.log(`❌ Deselected audience:`, { phase: phaseName, audience: audience.name, type, source });
    } else {
      newSelected.add(audience.id);
      console.log(`✅ Selected audience:`, { phase: phaseName, audience: audience.name, type, source });
    }
    
    setSelectedAudiences(newSelected);
  };

  const handleSave = () => {
    const selected: SelectedAudience[] = [];
    
    Object.entries(audiencesByType).forEach(([type, audiences]) => {
      audiences.forEach(aud => {
        if (selectedAudiences.has(aud.id)) {
          const entry = matrixEntries.find(e => e.type === type);
          selected.push({
            id: aud.id,
            name: aud.name,
            type,
            source: entry?.source || '',
            subtype: aud.subtype,
            approximate_count: aud.approximate_count_lower_bound
          });
        }
      });
    });

    console.log(`💾 Saving audiences for phase "${phaseName}":`, {
      phase: phaseName,
      phaseId,
      selectedCount: selected.length,
      audiences: selected.map(a => ({ name: a.name, type: a.type, source: a.source }))
    });

    onAudiencesSelected(selected);
    toast.success(`Saved ${selected.length} audiences for ${phaseName}`);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading audiences for {phaseName}...</span>
        </CardContent>
      </Card>
    );
  }

  const totalAudiences = Object.values(audiencesByType).reduce((sum, auds) => sum + auds.length, 0);

  if (totalAudiences === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {phaseName} - Audience Selection
          </CardTitle>
          <CardDescription>
            Select audiences that match this phase's objective
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              No audiences found for this phase. You may need to create custom audiences in your Meta Ads Manager first.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {phaseName} - Audience Selection
        </CardTitle>
        <CardDescription>
          Select audiences that match this phase's objective. {selectedAudiences.size} of {totalAudiences} selected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(audiencesByType).map(([type, audiences]) => {
          if (audiences.length === 0) return null;

          const entry = matrixEntries.find(e => e.type === type);

          return (
            <div key={type} className="space-y-3">
              <div>
                <h4 className="font-semibold flex items-center gap-2">
                  {type}
                  <Badge variant="outline">{audiences.length}</Badge>
                </h4>
                <p className="text-sm text-muted-foreground">
                  {getAudienceTypeDescription(type)}
                </p>
                {entry && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Strategy: {entry.strategy}
                  </p>
                )}
              </div>

              <div className="space-y-2 pl-4 border-l-2 border-border">
                {audiences.map((audience) => (
                  <div
                    key={audience.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedAudiences.has(audience.id)}
                      onCheckedChange={() => toggleAudience(audience, type, entry?.source || '')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{audience.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {audience.subtype && <Badge variant="secondary" className="mr-2">{audience.subtype}</Badge>}
                        {audience.approximate_count_lower_bound && (
                          <span>~{audience.approximate_count_lower_bound.toLocaleString()} people</span>
                        )}
                      </div>
                    </div>
                    {selectedAudiences.has(audience.id) && (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <Button onClick={handleSave} className="w-full">
          Save Audience Selection ({selectedAudiences.size} selected)
        </Button>
      </CardContent>
    </Card>
  );
}
