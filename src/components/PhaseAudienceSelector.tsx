import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronDown, ChevronUp, Ban } from "lucide-react";
import { toast } from "sonner";
import { getAudienceTypesForPhase, AudienceTypeMatrixEntry } from "@/utils/audienceTypeMatrix";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
  platform?: string;
  onAudiencesSelected: (audiences: SelectedAudience[], excludedAudiences?: SelectedAudience[]) => void;
  initialSelection?: SelectedAudience[];
  overrideTargeting?: boolean;
  basicTargeting?: {
    metaInterests?: Array<{ id: string; name: string; audienceSize?: number }>;
    metaBehaviors?: Array<{ id: string; name: string; audienceSize?: number }>;
    metaDemographics?: Array<{ id: string; name: string; audienceSize?: number }>;
    tiktokInterests?: Array<{ id: string; name: string; audienceSize?: number }>;
    tiktokBehaviors?: Array<{ id: string; name: string; audienceSize?: number }>;
    tiktokDemographics?: Array<{ id: string; name: string; audienceSize?: number }>;
  };
  // Visibility controls from audience strategy mapping
  showRetargetingAudiences?: boolean;
  showLookalikeAudiences?: boolean;
  // Auto-exclude feature
  autoExcludeEnabled?: boolean;
  onAutoExcludeChange?: (enabled: boolean) => void;
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
  platform = "meta",
  onAudiencesSelected,
  initialSelection = [],
  basicTargeting,
  overrideTargeting = false,
  showRetargetingAudiences = true,
  showLookalikeAudiences = true,
  autoExcludeEnabled = false,
  onAutoExcludeChange,
}: PhaseAudienceSelectorProps) {
  // Determine if this is a brand awareness campaign first (needed for state initialization)
  const isBrandAwareness = phaseObjective?.toLowerCase().includes('awareness') || 
                           phaseObjective?.toLowerCase().includes('reach') ||
                           phaseOptimizationGoal?.toLowerCase().includes('awareness') ||
                           phaseOptimizationGoal?.toLowerCase().includes('reach');

  const [loading, setLoading] = useState(false);
  const [audiencesByType, setAudiencesByType] = useState<Record<string, FetchedAudience[]>>({});
  const [selectedAudiences, setSelectedAudiences] = useState<Set<string>>(() => {
    const initial = new Set(initialSelection.map(a => a.id));
    // Pre-select basicTargeting items for brand awareness
    if (basicTargeting && isBrandAwareness) {
      basicTargeting.metaInterests?.forEach(i => initial.add(i.id));
      basicTargeting.metaBehaviors?.forEach(b => initial.add(b.id));
      basicTargeting.metaDemographics?.forEach(d => initial.add(d.id));
      basicTargeting.tiktokInterests?.forEach(i => initial.add(i.id));
      basicTargeting.tiktokBehaviors?.forEach(b => initial.add(b.id));
      basicTargeting.tiktokDemographics?.forEach(d => initial.add(d.id));
    }
    return initial;
  });
  const [matrixEntries, setMatrixEntries] = useState<AudienceTypeMatrixEntry[]>([]);
  
  // Collapsible sections state - all start collapsed
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Fetch ALL audience types regardless of objective/optimization goal
  // This ensures the audience list remains persistent
  useEffect(() => {
    if (!adAccountId) return;
    
    // Get ALL audience types from all phases to ensure full list
    const allPhases = ['Awareness', 'Consideration', 'Conversion'];
    const allEntries: AudienceTypeMatrixEntry[] = [];
    const seenSources = new Set<string>();
    
    allPhases.forEach(phase => {
      const entries = getAudienceTypesForPhase(phase);
      entries.forEach(entry => {
        if (!seenSources.has(entry.source)) {
          seenSources.add(entry.source);
          allEntries.push(entry);
        }
      });
    });
    
    setMatrixEntries(allEntries);
    
    // Fetch from all sources
    const sourcesToFetch = [...seenSources];
    
    loadAudiences(sourcesToFetch);
  }, [adAccountId]);

  // Group audiences by strategy instead of type
  // Filter based on visibility props
  const audiencesByStrategy = matrixEntries.reduce((acc, entry) => {
    // Skip strategies based on visibility props
    if (entry.strategy === 'Retarget' && !showRetargetingAudiences) return acc;
    if (entry.strategy === 'Expand' && !showLookalikeAudiences) return acc;
    
    const audiences = audiencesByType[entry.source] || [];
    if (!acc[entry.strategy]) {
      acc[entry.strategy] = [];
    }
    acc[entry.strategy].push(...audiences.map(aud => ({ ...aud, source: entry.source })));
    return acc;
  }, {} as Record<string, FetchedAudience[]>);

  // Add interests, behaviors, and demographics from basicTargeting as "Detailed Targeting"
  // Only show for Brand Awareness campaigns and when override targeting is NOT active
  // FILTER BY PLATFORM: Only show platform-specific targeting
  
  if (basicTargeting && isBrandAwareness && !overrideTargeting) {
    const detailedTargetingAudiences: FetchedAudience[] = [];
    const isTikTok = platform?.toLowerCase().includes('tiktok');
    const isMeta = platform?.toLowerCase().includes('meta') || platform?.toLowerCase().includes('facebook') || platform?.toLowerCase().includes('instagram');
    
    // Only show Meta targeting for Meta platforms
    if (isMeta) {
      if (basicTargeting.metaInterests) {
        detailedTargetingAudiences.push(...basicTargeting.metaInterests.map(interest => ({
          id: interest.id,
          name: interest.name,
          subtype: 'interest',
          source: 'Interest',
          audienceSize: interest.audienceSize
        })));
      }
      
      if (basicTargeting.metaBehaviors) {
        detailedTargetingAudiences.push(...basicTargeting.metaBehaviors.map(behavior => ({
          id: behavior.id,
          name: behavior.name,
          subtype: 'behavior',
          source: 'Behavior',
          audienceSize: behavior.audienceSize
        })));
      }
      
      if (basicTargeting.metaDemographics) {
        detailedTargetingAudiences.push(...basicTargeting.metaDemographics.map(demo => ({
          id: demo.id,
          name: demo.name,
          subtype: 'demographic',
          source: 'Demographic',
          audienceSize: demo.audienceSize
        })));
      }
    }
    
    // Only show TikTok targeting for TikTok platform
    if (isTikTok) {
      if (basicTargeting.tiktokInterests) {
        detailedTargetingAudiences.push(...basicTargeting.tiktokInterests.map(interest => ({
          id: interest.id,
          name: interest.name,
          subtype: 'interest',
          source: 'Interest',
          audienceSize: interest.audienceSize
        })));
      }
      
      if (basicTargeting.tiktokBehaviors) {
        detailedTargetingAudiences.push(...basicTargeting.tiktokBehaviors.map(behavior => ({
          id: behavior.id,
          name: behavior.name,
          subtype: 'behavior',
          source: 'Behavior',
          audienceSize: behavior.audienceSize
        })));
      }
      
      if (basicTargeting.tiktokDemographics) {
        detailedTargetingAudiences.push(...basicTargeting.tiktokDemographics.map(demo => ({
          id: demo.id,
          name: demo.name,
          subtype: 'demographic',
          source: 'Demographic',
          audienceSize: demo.audienceSize
        })));
      }
    }
    
    if (detailedTargetingAudiences.length > 0) {
      audiencesByStrategy['Detailed Targeting'] = detailedTargetingAudiences;
    }
  }

  const loadAudiences = async (sources: string[]) => {
    setLoading(true);
    try {
      // Determine which audience endpoint to call based on platform
      const platformLower = platform.toLowerCase();
      const isTikTok = platformLower.includes('tiktok');
      
      // For TikTok, we would call a TikTok-specific audience endpoint
      // For now, skip audience loading for TikTok as it's not implemented yet
      if (isTikTok) {
        console.log('TikTok audience loading not yet implemented');
        setAudiencesByType({});
        return;
      }
      
      // Meta audience loading
      const { data, error } = await supabase.functions.invoke('fetch-meta-audiences', {
        body: { adAccountId, sources }
      });

      if (error) throw error;

      // data is now an array of audiences with source field
      const audiences = Array.isArray(data) ? data : [];

      // Group by source
      const grouped = audiences.reduce((acc: Record<string, FetchedAudience[]>, audience: any) => {
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
    const excluded: SelectedAudience[] = [];
    
    Object.entries(audiencesByType).forEach(([source, audiences]) => {
      audiences.forEach(aud => {
        const entry = matrixEntries.find(e => e.source === source);
        const audienceData: SelectedAudience = {
          id: aud.id,
          name: aud.name,
          type: entry?.type || 'Unknown',
          source: source,
          subtype: aud.subtype,
          approximate_count: aud.approximate_count_lower_bound,
          audienceSize: aud.audienceSize
        };
        
        if (selectedAudiences.has(aud.id)) {
          selected.push(audienceData);
        } else if (autoExcludeEnabled) {
          // When auto-exclude is enabled, add non-selected audiences to excluded list
          excluded.push(audienceData);
        }
      });
    });
    
    onAudiencesSelected(selected, autoExcludeEnabled ? excluded : undefined);
  }, [selectedAudiences, audiencesByType, matrixEntries, autoExcludeEnabled]);

  const formatAudienceSize = (size?: number) => {
    if (!size) return '';
    if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    return size.toString();
  };

  return (
    <div className="space-y-4">
      {/* Auto-Exclude Toggle */}
      {onAutoExcludeChange && (
        <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label htmlFor="auto-exclude" className="text-sm font-medium cursor-pointer">
                Auto-Exclude Unselected Audiences
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically negate audiences that aren't selected to prevent overlap
              </p>
            </div>
          </div>
          <Switch
            id="auto-exclude"
            checked={autoExcludeEnabled}
            onCheckedChange={onAutoExcludeChange}
          />
        </div>
      )}
      
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
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{strategy} ({uniqueAudiences.length})</span>
                      <Badge 
                        variant="secondary" 
                        className={
                          uniqueAudiences.length > 0 && uniqueAudiences.filter(a => selectedAudiences.has(a.id)).length === 0 
                            ? "bg-destructive/10 text-destructive border-destructive" 
                            : ""
                        }
                      >
                        {uniqueAudiences.filter(a => selectedAudiences.has(a.id)).length}/{uniqueAudiences.length} selected
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
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
                        {/* Show AI Selected badge for detailed targeting items */}
                        {strategy === 'Detailed Targeting' && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            AI Selected
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
          <p>No audiences available</p>
          <p className="text-sm mt-2">Connect an ad account to load audiences</p>
        </div>
      )}
    </div>
  );
}
