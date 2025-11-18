import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, CheckCircle2, Sparkles, Search, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { getAudienceTypesForPhase, getSourcesByTypeForPhase, getAudienceTypeDescription, AudienceTypeMatrixEntry } from "@/utils/audienceTypeMatrix";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { BasicTargeting } from "./BasicTargeting";

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
  initialBasicTargeting?: any;
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

interface RecommendedItem {
  id: string;
  name: string;
  audienceSize?: number;
}

export function PhaseAudienceSelector({
  phaseName,
  phaseId,
  phaseObjective,
  phaseOptimizationGoal,
  adAccountId,
  onAudiencesSelected,
  initialSelection = [],
  initialBasicTargeting = {}
}: PhaseAudienceSelectorProps) {
  const [loading, setLoading] = useState(false);
  const [audiencesByType, setAudiencesByType] = useState<Record<string, FetchedAudience[]>>({});
  const [selectedAudiences, setSelectedAudiences] = useState<Set<string>>(
    new Set(initialSelection.map(a => a.id))
  );
  const [matrixEntries, setMatrixEntries] = useState<AudienceTypeMatrixEntry[]>([]);
  
  // New state for AI recommendations
  const [productBrief, setProductBrief] = useState("");
  const [generatingRecommendations, setGeneratingRecommendations] = useState(false);
  const [recommendedInterests, setRecommendedInterests] = useState<RecommendedItem[]>([]);
  const [recommendedBehaviors, setRecommendedBehaviors] = useState<RecommendedItem[]>([]);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"interests" | "behaviors">("interests");
  const [searchResults, setSearchResults] = useState<RecommendedItem[]>([]);
  const [searching, setSearching] = useState(false);
  
  // Basic targeting for awareness
  const [basicTargeting, setBasicTargeting] = useState<any>(initialBasicTargeting);
  
  // Collapsible sections state - all start collapsed
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const determinedPhase = phaseObjective && phaseOptimizationGoal 
    ? determineFunnelPhaseFromObjective(phaseObjective, phaseOptimizationGoal)
    : phaseName;
  const isAwarenessPhase = determinedPhase === "Awareness";

  useEffect(() => {
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

  const generateRecommendations = async () => {
    if (!productBrief.trim()) {
      toast.error("Please enter a product brief");
      return;
    }

    setGeneratingRecommendations(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-audience-recommendations', {
        body: { brief: productBrief, adAccountId }
      });

      if (error) throw error;

      setRecommendedInterests(data.interests || []);
      setRecommendedBehaviors(data.behaviors || []);
      
      // Auto-select recommended items
      const newSelected = new Set(selectedAudiences);
      [...data.interests, ...data.behaviors].forEach((item: RecommendedItem) => {
        newSelected.add(item.id);
      });
      setSelectedAudiences(newSelected);

      toast.success("AI recommendations generated!");
    } catch (error: any) {
      console.error("Error generating recommendations:", error);
      toast.error("Failed to generate recommendations");
    } finally {
      setGeneratingRecommendations(false);
    }
  };

  const searchTargeting = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-meta-targeting', {
        body: { query: searchQuery, type: searchType, adAccountId }
      });

      if (error) throw error;
      setSearchResults(data.results || []);
    } catch (error: any) {
      console.error("Error searching:", error);
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const toggleAudience = (id: string) => {
    const newSelected = new Set(selectedAudiences);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedAudiences(newSelected);
  };

  const handleSave = () => {
    const selected: SelectedAudience[] = [];
    
    // Add recommended interests and behaviors
    [...recommendedInterests, ...recommendedBehaviors].forEach((item) => {
      if (selectedAudiences.has(item.id)) {
        selected.push({
          id: item.id,
          name: item.name,
          type: recommendedInterests.includes(item) ? "Interest" : "Behavior",
          source: "Recommended",
          subtype: "recommended",
          approximate_count: item.audienceSize || 0,
        });
      }
    });

    // Add search results
    searchResults.forEach((item) => {
      if (selectedAudiences.has(item.id) && !selected.find(s => s.id === item.id)) {
        selected.push({
          id: item.id,
          name: item.name,
          type: searchType === "interests" ? "Interest" : "Behavior",
          source: "Search",
          subtype: "searched",
          approximate_count: item.audienceSize || 0,
        });
      }
    });

    // Add other audiences
    Object.entries(audiencesByType).forEach(([type, audienceList]) => {
      audienceList.forEach((aud) => {
        if (selectedAudiences.has(aud.id) && !selected.find(s => s.id === aud.id)) {
          selected.push({
            id: aud.id,
            name: aud.name,
            type: type,
            source: aud.subtype || "Unknown",
            subtype: aud.subtype,
            approximate_count: aud.approximate_count_lower_bound || 0,
          });
        }
      });
    });
    
    console.log("Saving selected audiences:", selected);
    onAudiencesSelected(selected);
    toast.success(`${selected.length} audience(s) selected for ${phaseName}`);
  };

  const formatAudienceSize = (size?: number) => {
    if (!size) return "";
    if (size >= 1000000) return `~${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `~${(size / 1000).toFixed(0)}K`;
    return `~${size}`;
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {phaseName} - Audience Selection
        </CardTitle>
        <CardDescription>
          {isAwarenessPhase 
            ? "Configure targeting and get AI-powered audience recommendations for awareness campaigns"
            : `Choose custom audiences and lookalikes for ${determinedPhase} phase`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Awareness Phase: Show basic targeting and AI recommendations */}
        {isAwarenessPhase && (
          <>
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Basic Targeting</h3>
              <BasicTargeting 
                targeting={basicTargeting}
                onUpdate={setBasicTargeting}
              />
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI-Powered Audience Recommendations
              </h3>
              <Textarea
                placeholder="Describe your product and target audience (e.g., 'Eco-friendly yoga mats for health-conscious millennials interested in sustainable living')"
                value={productBrief}
                onChange={(e) => setProductBrief(e.target.value)}
                rows={3}
              />
              <Button 
                onClick={generateRecommendations}
                disabled={generatingRecommendations || !productBrief.trim()}
              >
                {generatingRecommendations ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Recommendations
                  </>
                )}
              </Button>
            </div>

            {/* Recommended Interests */}
            {recommendedInterests.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium">Recommended Interests</h4>
                <div className="space-y-2 pl-4">
                  {recommendedInterests.map((item) => (
                    <div key={item.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`interest-${item.id}`}
                        checked={selectedAudiences.has(item.id)}
                        onCheckedChange={() => toggleAudience(item.id)}
                      />
                      <label htmlFor={`interest-${item.id}`} className="text-sm cursor-pointer flex-1">
                        {item.name}
                        {item.audienceSize && (
                          <span className="text-muted-foreground ml-2">
                            {formatAudienceSize(item.audienceSize)}
                          </span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Behaviors */}
            {recommendedBehaviors.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium">Recommended Behaviors</h4>
                <div className="space-y-2 pl-4">
                  {recommendedBehaviors.map((item) => (
                    <div key={item.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`behavior-${item.id}`}
                        checked={selectedAudiences.has(item.id)}
                        onCheckedChange={() => toggleAudience(item.id)}
                      />
                      <label htmlFor={`behavior-${item.id}`} className="text-sm cursor-pointer flex-1">
                        {item.name}
                        {item.audienceSize && (
                          <span className="text-muted-foreground ml-2">
                            {formatAudienceSize(item.audienceSize)}
                          </span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search Function */}
            <div className="space-y-3">
              <h4 className="font-medium">Search Additional Audiences</h4>
              <div className="flex gap-2">
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value as "interests" | "behaviors")}
                  className="px-3 py-2 border rounded-md bg-background"
                >
                  <option value="interests">Interests</option>
                  <option value="behaviors">Behaviors</option>
                </select>
                <Input
                  placeholder="Search for interests or behaviors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchTargeting()}
                />
                <Button onClick={searchTargeting} disabled={searching || !searchQuery.trim()}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-2 pl-4 max-h-60 overflow-y-auto">
                  {searchResults.map((item) => (
                    <div key={item.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`search-${item.id}`}
                        checked={selectedAudiences.has(item.id)}
                        onCheckedChange={() => toggleAudience(item.id)}
                      />
                      <label htmlFor={`search-${item.id}`} className="text-sm cursor-pointer flex-1">
                        {item.name}
                        {item.audienceSize && (
                          <span className="text-muted-foreground ml-2">
                            {formatAudienceSize(item.audienceSize)}
                          </span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Other Audience Types (collapsed by default) */}
        {Object.keys(audiencesByType).length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">
              {isAwarenessPhase ? "Additional Audience Types" : "Available Audiences"}
            </h3>
            {Object.entries(audiencesByType).map(([type, audienceList]) => (
              <div key={type} className="border rounded-md">
                <button
                  onClick={() => setExpandedSections(prev => ({ ...prev, [type]: !prev[type] }))}
                  className="flex items-center justify-between w-full p-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium flex items-center gap-2">
                    {expandedSections[type] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {type} ({audienceList.length})
                  </span>
                </button>
                {expandedSections[type] && (
                  <div className="space-y-2 px-6 pb-3">
                    {audienceList.map((aud) => (
                      <div key={aud.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={aud.id}
                          checked={selectedAudiences.has(aud.id)}
                          onCheckedChange={() => toggleAudience(aud.id)}
                        />
                        <label htmlFor={aud.id} className="text-sm cursor-pointer flex-1">
                          {aud.name}
                          {aud.approximate_count_lower_bound && (
                            <span className="text-muted-foreground ml-2">
                              (~{aud.approximate_count_lower_bound.toLocaleString()} - {aud.approximate_count_upper_bound?.toLocaleString()})
                            </span>
                          )}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!isAwarenessPhase && Object.keys(audiencesByType).length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No audiences found for this phase.</p>
            <p className="text-sm mt-2">You may need to create custom audiences in your Meta Ads Manager first.</p>
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave}>
            Save Selected Audiences ({selectedAudiences.size})
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
