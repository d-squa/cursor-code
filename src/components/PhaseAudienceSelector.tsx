import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronDown, ChevronUp, Ban } from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";


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
  const platformLower = platform?.toLowerCase() || "";
  const isGooglePlatform = platformLower.includes("google");
  const isTikTokPlatform = platformLower.includes("tiktok");
  const isMetaPlatform = platformLower.includes("meta") || platformLower.includes("facebook") || platformLower.includes("instagram");

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
  // Collapsible sections state - all start collapsed
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  type AudienceGroupType = string;

  const getAudienceGroupType = (aud: FetchedAudience): AudienceGroupType => {
    if (isGooglePlatform) return aud.source || "Uncategorized";
    if (aud.source === "Saved Audience") return "Saved Audience";
    if (aud.subtype?.toUpperCase() === "LOOKALIKE" || aud.subtype?.toUpperCase() === "SIMILAR" || aud.source === "Lookalikes" || aud.source === "Lookalike Audience") return "Lookalike Audience";
    return "Custom Audience";
  };

  // Load ALL audiences for the connected ad account (not dependent on objective/optimization)
  useEffect(() => {
    if (!adAccountId) return;
    loadAudiences();
  }, [adAccountId, platform]);

  // Build platform-specific "Detailed Targeting" list (AI selected)
  const detailedTargetingAudiences: FetchedAudience[] = (() => {
    if (!basicTargeting || !isBrandAwareness || overrideTargeting) return [];

    const detailed: FetchedAudience[] = [];
    const isTikTok = isTikTokPlatform;
    const isMeta = isMetaPlatform;

    if (isMeta) {
      basicTargeting.metaInterests?.forEach((interest) => {
        detailed.push({
          id: interest.id,
          name: interest.name,
          subtype: "interest",
          source: "Interest",
          audienceSize: interest.audienceSize,
        });
      });
      basicTargeting.metaBehaviors?.forEach((behavior) => {
        detailed.push({
          id: behavior.id,
          name: behavior.name,
          subtype: "behavior",
          source: "Behavior",
          audienceSize: behavior.audienceSize,
        });
      });
      basicTargeting.metaDemographics?.forEach((demo) => {
        detailed.push({
          id: demo.id,
          name: demo.name,
          subtype: "demographic",
          source: "Demographic",
          audienceSize: demo.audienceSize,
        });
      });
    }

    if (isTikTok) {
      basicTargeting.tiktokInterests?.forEach((interest) => {
        detailed.push({
          id: interest.id,
          name: interest.name,
          subtype: "interest",
          source: "Interest",
          audienceSize: interest.audienceSize,
        });
      });
      basicTargeting.tiktokBehaviors?.forEach((behavior) => {
        detailed.push({
          id: behavior.id,
          name: behavior.name,
          subtype: "behavior",
          source: "Behavior",
          audienceSize: behavior.audienceSize,
        });
      });
      basicTargeting.tiktokDemographics?.forEach((demo) => {
        detailed.push({
          id: demo.id,
          name: demo.name,
          subtype: "demographic",
          source: "Demographic",
          audienceSize: demo.audienceSize,
        });
      });
    }

    return detailed;
  })();

  // Group ALL fetched audiences by bucket
  const groupedAudiences = (() => {
    const fetched = Object.values(audiencesByType).flat();

    if (isGooglePlatform) {
      const dataSegmentOrder = [
        "Website visitors",
        "Customer segments",
        "YouTube users",
        "App users",
        "Custom combination",
        "Callers",
      ];

      const groups: Record<string, FetchedAudience[]> = Object.fromEntries(
        dataSegmentOrder.map((key) => [key, [] as FetchedAudience[]])
      );

      fetched.forEach((aud) => {
        const key = dataSegmentOrder.includes(aud.source || "") ? (aud.source as string) : "Uncategorized";
        if (!groups[key]) groups[key] = [];
        groups[key].push(aud);
      });

      if (detailedTargetingAudiences.length > 0) {
        groups["Detailed Targeting"] = detailedTargetingAudiences;
      }

      return groups;
    }

    const groups: Record<AudienceGroupType, FetchedAudience[]> = {
      "Custom Audience": [],
      "Lookalike Audience": [],
      "Saved Audience": [],
      "Detailed Targeting": detailedTargetingAudiences,
    };

    fetched.forEach((aud) => {
      const key = getAudienceGroupType(aud);
      groups[key].push(aud);
    });

    return groups;
  })();

  const groupOrder: AudienceGroupType[] = isGooglePlatform
    ? [
        "Website visitors",
        "Customer segments",
        "YouTube users",
        "App users",
        "Custom combination",
        "Callers",
        ...(groupedAudiences["Uncategorized"]?.length ? ["Uncategorized"] : []),
        ...(groupedAudiences["Detailed Targeting"]?.length ? ["Detailed Targeting"] : []),
      ]
    : [
        "Custom Audience",
        "Lookalike Audience",
        "Saved Audience",
        ...(groupedAudiences["Detailed Targeting"].length > 0 ? (["Detailed Targeting"] as const) : []),
      ];


  const loadAudiences = async () => {
    setLoading(true);
    try {
      // Determine which audience endpoint to call based on platform
      const platformLower = platform.toLowerCase();
      const isTikTok = platformLower.includes('tiktok');
      const isGoogle = platformLower.includes('google');

      // TikTok audience loading not yet implemented
      if (isTikTok) {
        console.log('TikTok audience loading not yet implemented');
        setAudiencesByType({});
        return;
      }

      let audiences: any[] = [];

      if (isGoogle) {
        // Google Ads audience loading
        const { data, error } = await supabase.functions.invoke('fetch-google-audiences', {
          body: { customerId: adAccountId }
        });
        if (error) throw error;
        audiences = Array.isArray(data) ? data : [];
      } else {
        // Meta audience loading (fetch ALL audiences; no objective/goal filtering)
        const { data, error } = await supabase.functions.invoke('fetch-meta-audiences', {
          body: { adAccountId }
        });
        if (error) throw error;
        audiences = Array.isArray(data) ? data : [];
      }

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

    (Object.entries(groupedAudiences) as [string, FetchedAudience[]][]).forEach(([group, audiences]) => {
      audiences.forEach((aud) => {
        const isDetailedTargeting = group === "Detailed Targeting";
        const type: SelectedAudience["type"] = isDetailedTargeting ? "New Audience" : (group as SelectedAudience["type"]);

        const audienceData: SelectedAudience = {
          id: aud.id,
          name: aud.name,
          type,
          source: aud.source || "Unknown",
          subtype: aud.subtype,
          approximate_count: aud.approximate_count_lower_bound,
          audienceSize: aud.audienceSize,
        };

        if (selectedAudiences.has(aud.id)) {
          selected.push(audienceData);
        } else if (autoExcludeEnabled && !isDetailedTargeting) {
          // When auto-exclude is enabled, add non-selected audiences to excluded list
          excluded.push(audienceData);
        }
      });
    });

    onAudiencesSelected(selected, autoExcludeEnabled ? excluded : undefined);
  }, [selectedAudiences, groupedAudiences, autoExcludeEnabled]);


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
      
      {/*
        Stable audiences container.
        Reserves vertical space and keeps the previous list mounted (dimmed)
        while reloading, so changing the campaign objective doesn't cause the
        whole page below to jump up/down. The spinner is overlaid in-place
        instead of replacing the content.
      */}
      <div className="relative min-h-[160px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px] rounded-md animate-fade-in">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {groupOrder.length > 0 && (
          <div
            className={`space-y-3 animate-fade-in transition-opacity duration-200 ${loading ? "opacity-50 pointer-events-none" : "opacity-100"}`}
          >
            {groupOrder.map((group) => {
            const audiences = groupedAudiences[group] || [];

            // Remove duplicates based on id
            const uniqueAudiences = audiences.reduce((acc, curr) => {
              if (!acc.find((a) => a.id === curr.id)) {
                acc.push(curr);
              }
              return acc;
            }, [] as FetchedAudience[]);

            return (
              <Collapsible
                key={group}
                open={expandedSections[group] || false}
                onOpenChange={(open) => setExpandedSections((prev) => ({ ...prev, [group]: open }))}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{group} ({uniqueAudiences.length})</span>
                      <Badge
                        variant="secondary"
                        className={
                          uniqueAudiences.length > 0 && uniqueAudiences.filter((a) => selectedAudiences.has(a.id)).length === 0
                            ? "bg-destructive/10 text-destructive border-destructive"
                            : ""
                        }
                      >
                        {uniqueAudiences.filter((a) => selectedAudiences.has(a.id)).length}/{uniqueAudiences.length} selected
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {expandedSections[group] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-2">
                  {uniqueAudiences.length === 0 ? (
                    <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                      No audiences found in this account for this category.
                    </div>
                  ) : (
                    uniqueAudiences.map((audience) => (
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
                          {group === "Detailed Targeting" && (
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
                    ))
                  )}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
        )}

        {!loading && groupOrder.every((g) => (groupedAudiences[g] || []).length === 0) && (
          <div className="text-center py-8 text-muted-foreground animate-fade-in">
            <p>No audiences available in this ad account</p>
            <p className="text-sm mt-2">Create audiences in your ad account, then refresh here.</p>
          </div>
        )}
      </div>

    </div>
  );
}
