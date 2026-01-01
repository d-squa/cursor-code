import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, X, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MultiSelect } from "@/components/ui/multi-select";
import { DEVICE_OPTIONS, LANGUAGE_OPTIONS, GENDER_OPTIONS } from "@/utils/targetingOptions";
import { SplittableSection } from "./SplittableSection";
import { AdSetSplitDimension } from "@/types/mediaplan";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface UnifiedTargetingItem {
  id: string;
  name: string;
  description?: string;
  category: 'interest' | 'behavior' | 'demographic';
  platforms: ('meta' | 'tiktok')[];
  metaId?: string;
  tiktokId?: string;
}

import { AdSetConfig } from "@/types/mediaplan";
import { AdSetSplitManager } from "./AdSetSplitManager";

// Platform info for rendering tabs
export interface PlatformInfo {
  id: string;
  name: string;
  adAccountId?: string;
}

export interface UnifiedTargetingConfig {
  ageMin?: number;
  ageMax?: number;
  genders?: string[];
  devices?: string[];
  os?: string[];
  languages?: string[];
  selectedItems: UnifiedTargetingItem[];
  // Audience targeting mode
  useBroadTargeting?: boolean;
  // Custom/Lookalike audience selections
  retargetingAudienceIds?: string[];
  lookalikeAudienceIds?: string[];
  customAudienceIds?: string[];
  // Default ad set split - applies to all phases unless overridden
  defaultAdSetSplitDimension?: AdSetSplitDimension;
  defaultAdSetSplitUseCBO?: boolean;
  // Legacy: Default ad sets configuration (for backwards compatibility)
  defaultAdSets?: AdSetConfig[];
  // NEW: Per-platform ad sets configuration
  defaultAdSetsPerPlatform?: Record<string, AdSetConfig[]>;
}

interface UnifiedTargetingProps {
  targeting: UnifiedTargetingConfig;
  onUpdate: (targeting: UnifiedTargetingConfig) => void;
  metaAdAccountId?: string;
  tiktokAdvertiserId?: string;
  // Split functionality props
  currentSplitDimension?: AdSetSplitDimension;
  onSplitDimensionChange?: (dimension: AdSetSplitDimension, useCBO?: boolean) => void;
  // Platform info for the default split manager - legacy single platform
  platformId?: string;
  platformName?: string;
  // NEW: All selected platforms for per-platform configuration
  selectedPlatforms?: PlatformInfo[];
}

export function UnifiedTargeting({ 
  targeting, 
  onUpdate, 
  metaAdAccountId, 
  tiktokAdvertiserId,
  currentSplitDimension,
  onSplitDimensionChange,
  platformId = 'meta',
  platformName = 'Meta',
  selectedPlatforms,
}: UnifiedTargetingProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UnifiedTargetingItem[]>([]);

  // Labels for split dimensions
  const SPLIT_DIMENSION_LABELS: Record<AdSetSplitDimension, string> = {
    none: "None",
    placement: "Placement",
    optimization_goal: "Optimization Goal",
    audience: "Audience",
    audience_selection: "Audience Selection",
    language: "Language",
    location: "Location",
    gender: "Gender",
    device: "Device",
    age: "Age Range",
  };

  // Ensure selectedItems is always an array
  const selectedItems = Array.isArray(targeting.selectedItems) ? targeting.selectedItems : [];

  const updateField = (field: keyof UnifiedTargetingConfig, value: any) => {
    const updated = { ...targeting, selectedItems, [field]: value };
    onUpdate(updated);
    // Persist immediately to localStorage
    localStorage.setItem('basicTargeting', JSON.stringify(updated));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search term');
      return;
    }

    if (!metaAdAccountId && !tiktokAdvertiserId) {
      toast.error('At least one ad account must be selected');
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('unified-targeting-search', {
        body: {
          query: searchQuery,
          metaAdAccountId,
          tiktokAdvertiserId
        }
      });

      if (error) throw error;

      setSearchResults(data.results || []);
      
      if (data.results?.length > 0) {
        toast.success(`Found ${data.results.length} targeting options`);
      } else {
        toast.warning('No results found');
      }
    } catch (error: any) {
      console.error('Error searching:', error);
      toast.error(error.message || 'Failed to search');
    } finally {
      setSearching(false);
    }
  };

  // Create a unique key for an item based on id, name, and category
  const getItemKey = (item: UnifiedTargetingItem) => `${item.id}_${item.name}_${item.category}`;

  const isItemSelected = (item: UnifiedTargetingItem) => {
    return selectedItems.some(selected => getItemKey(selected) === getItemKey(item));
  };

  const handleAddItem = (item: UnifiedTargetingItem) => {
    if (isItemSelected(item)) {
      toast.info('Already selected');
      return;
    }

    const newSelectedItems = [...selectedItems, item];
    const updated = {
      ...targeting,
      selectedItems: newSelectedItems
    };
    onUpdate(updated);
    localStorage.setItem('basicTargeting', JSON.stringify(updated));
    toast.success(`Added: ${item.name}`);
  };

  const handleAddAll = () => {
    const newItems = searchResults.filter(result => !isItemSelected(result));
    
    if (newItems.length === 0) {
      toast.info('All items already selected');
      return;
    }

    const newSelectedItems = [...selectedItems, ...newItems];
    const updated = {
      ...targeting,
      selectedItems: newSelectedItems
    };
    onUpdate(updated);
    localStorage.setItem('basicTargeting', JSON.stringify(updated));
    toast.success(`Added ${newItems.length} targeting options`);
  };

  const handleRemoveItem = (item: UnifiedTargetingItem) => {
    const itemKey = getItemKey(item);
    const newSelectedItems = selectedItems.filter(i => getItemKey(i) !== itemKey);
    const updated = {
      ...targeting,
      selectedItems: newSelectedItems
    };
    onUpdate(updated);
    localStorage.setItem('basicTargeting', JSON.stringify(updated));
  };

  const getPlatformBadge = (platforms: ('meta' | 'tiktok')[]) => {
    if (platforms.length === 2) {
      return <Badge variant="secondary" className="ml-2">Both</Badge>;
    }
    if (platforms.includes('meta')) {
      return <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-700 border-blue-200">Meta</Badge>;
    }
    return <Badge variant="outline" className="ml-2 bg-pink-50 text-pink-700 border-pink-200">TikTok</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Basic Demographics */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Demographics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SplittableSection
              dimension="age"
              dimensionLabel="Age"
              currentSplitDimension={currentSplitDimension}
              onSplitClick={(dim, useCBO) => onSplitDimensionChange?.(dim, useCBO)}
            >
              <div className="space-y-2">
                <Label>Age Range</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={targeting.ageMin || ''}
                    onChange={(e) => updateField('ageMin', parseInt(e.target.value) || undefined)}
                    min={13}
                    max={65}
                  />
                  <span>to</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={targeting.ageMax || ''}
                    onChange={(e) => updateField('ageMax', parseInt(e.target.value) || undefined)}
                    min={13}
                    max={65}
                  />
                </div>
              </div>
            </SplittableSection>

            <SplittableSection
              dimension="gender"
              dimensionLabel="Gender"
              currentSplitDimension={currentSplitDimension}
              onSplitClick={(dim, useCBO) => onSplitDimensionChange?.(dim, useCBO)}
            >
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select
                  value={targeting.genders?.[0] || 'all'}
                  onValueChange={(value) => updateField('genders', [value])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </SplittableSection>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SplittableSection
              dimension="device"
              dimensionLabel="Device"
              currentSplitDimension={currentSplitDimension}
              onSplitClick={(dim, useCBO) => onSplitDimensionChange?.(dim, useCBO)}
            >
              <div className="space-y-2">
                <Label>Devices</Label>
                <MultiSelect
                  options={DEVICE_OPTIONS}
                  value={targeting.devices || []}
                  onChange={(values) => updateField('devices', values)}
                  placeholder="Select devices"
                />
              </div>
            </SplittableSection>

            <SplittableSection
              dimension="language"
              dimensionLabel="Language"
              currentSplitDimension={currentSplitDimension}
              onSplitClick={(dim, useCBO) => onSplitDimensionChange?.(dim, useCBO)}
            >
              <div className="space-y-2">
                <Label>Languages</Label>
                <MultiSelect
                  options={LANGUAGE_OPTIONS}
                  value={targeting.languages || []}
                  onChange={(values) => updateField('languages', values)}
                  placeholder="Select languages"
                />
              </div>
            </SplittableSection>
          </div>
        </CardContent>
      </Card>

      {/* Unified Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Targeting Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search interests, behaviors, demographics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{searchResults.length} results found</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleAddAll}
                >
                  Add all ({searchResults.filter(r => !selectedItems.some(s => s.id === r.id)).length})
                </Button>
              </div>
              <ScrollArea className="h-[300px] rounded-md border p-4">
                <div className="space-y-2">
                  {searchResults.map((result, index) => {
                    const isSelected = isItemSelected(result);
                    const uniqueKey = `${getItemKey(result)}_${index}`;
                    return (
                      <div
                        key={uniqueKey}
                        className={`flex items-start justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors ${isSelected ? 'bg-accent/50 opacity-60' : ''}`}
                        onClick={() => !isSelected && handleAddItem(result)}
                      >
                        <div className="flex-1">
                          <div className="flex items-center">
                            <span className="font-medium">{result.name}</span>
                            {getPlatformBadge(result.platforms)}
                            <Badge variant="outline" className="ml-2 text-xs">
                              {result.category}
                            </Badge>
                          </div>
                          {result.description && (
                            <p className="text-sm text-muted-foreground mt-1">{result.description}</p>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" disabled={isSelected}>
                          {isSelected ? 'Added' : 'Add'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Items */}
      {selectedItems.length > 0 && (
        <Collapsible defaultOpen={false}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    Selected Targeting ({selectedItems.length})
                  </div>
                  <ChevronDown className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-2">
                  {selectedItems.map((item, index) => (
                    <div
                      key={`${getItemKey(item)}_${index}`}
                      className="flex items-center justify-between p-3 rounded-lg border bg-accent/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {getPlatformBadge(item.platforms)}
                        <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveItem(item);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Default Ad Set Split Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Default Ad Set Split
            {targeting.defaultAdSetSplitDimension && targeting.defaultAdSetSplitDimension !== 'none' && (
              <Badge variant="secondary">{SPLIT_DIMENSION_LABELS[targeting.defaultAdSetSplitDimension]}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure a default ad set split that will be applied to all phases. Individual phases can override this using the "Override Targeting" toggle.
          </p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="mb-2 block">Split Dimension</Label>
              <Select
                value={targeting.defaultAdSetSplitDimension || 'none'}
                onValueChange={(value) => {
                  const dim = value as AdSetSplitDimension;
                  if (dim === 'none') {
                    // Clear everything when setting to none
                    const updated = {
                      ...targeting,
                      selectedItems,
                      defaultAdSetSplitDimension: undefined,
                      defaultAdSetSplitUseCBO: undefined,
                      defaultAdSets: undefined,
                      defaultAdSetsPerPlatform: undefined,
                    };
                    onUpdate(updated);
                    localStorage.setItem('basicTargeting', JSON.stringify(updated));
                  } else {
                    // Initialize with default ad sets per platform when selecting a dimension
                    const platforms = selectedPlatforms?.length ? selectedPlatforms : [{ id: platformId, name: platformName }];
                    const newPerPlatform: Record<string, AdSetConfig[]> = {};
                    
                    platforms.forEach(p => {
                      newPerPlatform[p.id] = [
                        {
                          id: crypto.randomUUID(),
                          name: `Default_${SPLIT_DIMENSION_LABELS[dim]}_1`,
                          dimensionValue: '',
                          budgetPercentage: 50,
                        },
                        {
                          id: crypto.randomUUID(),
                          name: `Default_${SPLIT_DIMENSION_LABELS[dim]}_2`,
                          dimensionValue: '',
                          budgetPercentage: 50,
                        },
                      ];
                    });
                    
                    const updated = {
                      ...targeting,
                      selectedItems,
                      defaultAdSetSplitDimension: dim,
                      defaultAdSetsPerPlatform: newPerPlatform,
                      // Keep legacy field for backwards compatibility
                      defaultAdSets: newPerPlatform[platforms[0]?.id || platformId],
                    };
                    onUpdate(updated);
                    localStorage.setItem('basicTargeting', JSON.stringify(updated));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No split (single ad set)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No split (single ad set)</SelectItem>
                  <SelectItem value="gender">Gender</SelectItem>
                  <SelectItem value="age">Age Range</SelectItem>
                  <SelectItem value="device">Device</SelectItem>
                  <SelectItem value="language">Language</SelectItem>
                  <SelectItem value="placement">Placement</SelectItem>
                  <SelectItem value="optimization_goal">Optimization Goal</SelectItem>
                  <SelectItem value="audience_selection">Audience Selection</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {targeting.defaultAdSetSplitDimension && targeting.defaultAdSetSplitDimension !== 'none' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const updated = {
                    ...targeting,
                    selectedItems,
                    defaultAdSetSplitDimension: undefined,
                    defaultAdSetSplitUseCBO: undefined,
                    defaultAdSets: undefined,
                    defaultAdSetsPerPlatform: undefined,
                  };
                  onUpdate(updated);
                  localStorage.setItem('basicTargeting', JSON.stringify(updated));
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
          
          {/* Show per-platform AdSetSplitManager tabs when a dimension is selected */}
          {targeting.defaultAdSetSplitDimension && targeting.defaultAdSetSplitDimension !== 'none' && (() => {
            const platforms = selectedPlatforms?.length ? selectedPlatforms : [{ id: platformId, name: platformName }];
            const adSetsPerPlatform = targeting.defaultAdSetsPerPlatform || {};
            
            // Handle legacy data - if we have defaultAdSets but not defaultAdSetsPerPlatform, migrate
            const effectiveAdSetsPerPlatform = Object.keys(adSetsPerPlatform).length > 0 
              ? adSetsPerPlatform 
              : targeting.defaultAdSets 
                ? { [platformId]: targeting.defaultAdSets }
                : {};
            
            if (platforms.length === 1) {
              // Single platform - no need for tabs
              const p = platforms[0];
              const platformAdSets = effectiveAdSetsPerPlatform[p.id] || [];
              
              if (platformAdSets.length === 0) {
                return (
                  <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                    <strong>Note:</strong> Configure the ad set splits above. These settings will be inherited by all phases unless they override targeting.
                  </div>
                );
              }
              
              return (
                <div className="mt-4">
                  <AdSetSplitManager
                    dimension={targeting.defaultAdSetSplitDimension}
                    adSets={platformAdSets}
                    platformName={p.name}
                    platformId={p.id}
                    phaseName="Default"
                    useCBO={targeting.defaultAdSetSplitUseCBO}
                    onAdSetsChange={(adSets) => {
                      const newPerPlatform = { ...effectiveAdSetsPerPlatform, [p.id]: adSets };
                      const updated = {
                        ...targeting,
                        selectedItems,
                        defaultAdSetsPerPlatform: newPerPlatform,
                        defaultAdSets: adSets, // Keep legacy for backwards compat
                      };
                      onUpdate(updated);
                      localStorage.setItem('basicTargeting', JSON.stringify(updated));
                    }}
                    onRemoveSplit={() => {
                      const updated = {
                        ...targeting,
                        selectedItems,
                        defaultAdSetSplitDimension: undefined,
                        defaultAdSetSplitUseCBO: undefined,
                        defaultAdSets: undefined,
                        defaultAdSetsPerPlatform: undefined,
                      };
                      onUpdate(updated);
                      localStorage.setItem('basicTargeting', JSON.stringify(updated));
                    }}
                    adAccountId={p.id === 'meta' ? metaAdAccountId : p.id === 'tiktok' ? tiktokAdvertiserId : p.adAccountId}
                    currentGender={targeting.genders?.[0]}
                    currentAgeMin={targeting.ageMin}
                    currentAgeMax={targeting.ageMax}
                    currentDevices={targeting.devices}
                    currentLanguages={targeting.languages}
                  />
                </div>
              );
            }
            
            // Multiple platforms - show tabs
            return (
              <div className="mt-4">
                <Tabs defaultValue={platforms[0]?.id} className="w-full">
                  <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${platforms.length}, minmax(0, 1fr))` }}>
                    {platforms.map(p => (
                      <TabsTrigger key={p.id} value={p.id} className="flex items-center gap-2">
                        {p.name}
                        {effectiveAdSetsPerPlatform[p.id]?.length ? (
                          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                            {effectiveAdSetsPerPlatform[p.id].length}
                          </Badge>
                        ) : null}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {platforms.map(p => {
                    const platformAdSets = effectiveAdSetsPerPlatform[p.id] || [];
                    
                    return (
                      <TabsContent key={p.id} value={p.id} className="mt-4">
                        {platformAdSets.length === 0 ? (
                          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                            <strong>Note:</strong> No ad sets configured for {p.name} yet. Select a split dimension above to initialize.
                          </div>
                        ) : (
                          <AdSetSplitManager
                            dimension={targeting.defaultAdSetSplitDimension!}
                            adSets={platformAdSets}
                            platformName={p.name}
                            platformId={p.id}
                            phaseName="Default"
                            useCBO={targeting.defaultAdSetSplitUseCBO}
                            onAdSetsChange={(adSets) => {
                              const newPerPlatform = { ...effectiveAdSetsPerPlatform, [p.id]: adSets };
                              const updated = {
                                ...targeting,
                                selectedItems,
                                defaultAdSetsPerPlatform: newPerPlatform,
                                // Keep legacy field synced with first platform
                                defaultAdSets: newPerPlatform[platforms[0]?.id || platformId] || adSets,
                              };
                              onUpdate(updated);
                              localStorage.setItem('basicTargeting', JSON.stringify(updated));
                            }}
                            onRemoveSplit={() => {
                              // Remove just this platform's config
                              const newPerPlatform = { ...effectiveAdSetsPerPlatform };
                              delete newPerPlatform[p.id];
                              
                              // If no platforms left, clear everything
                              if (Object.keys(newPerPlatform).length === 0) {
                                const updated = {
                                  ...targeting,
                                  selectedItems,
                                  defaultAdSetSplitDimension: undefined,
                                  defaultAdSetSplitUseCBO: undefined,
                                  defaultAdSets: undefined,
                                  defaultAdSetsPerPlatform: undefined,
                                };
                                onUpdate(updated);
                                localStorage.setItem('basicTargeting', JSON.stringify(updated));
                              } else {
                                const updated = {
                                  ...targeting,
                                  selectedItems,
                                  defaultAdSetsPerPlatform: newPerPlatform,
                                  defaultAdSets: newPerPlatform[platforms[0]?.id || platformId],
                                };
                                onUpdate(updated);
                                localStorage.setItem('basicTargeting', JSON.stringify(updated));
                              }
                            }}
                            adAccountId={p.id === 'meta' ? metaAdAccountId : p.id === 'tiktok' ? tiktokAdvertiserId : p.adAccountId}
                            currentGender={targeting.genders?.[0]}
                            currentAgeMin={targeting.ageMin}
                            currentAgeMax={targeting.ageMax}
                            currentDevices={targeting.devices}
                            currentLanguages={targeting.languages}
                          />
                        )}
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
