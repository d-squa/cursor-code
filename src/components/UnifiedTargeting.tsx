import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, X, CheckCircle2, ChevronDown, ChevronUp, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MultiSelect } from "@/components/ui/multi-select";
import { DEVICE_OPTIONS, LANGUAGE_OPTIONS, GENDER_OPTIONS } from "@/utils/targetingOptions";
import { SplittableSection } from "./SplittableSection";
import { AdSetSplitDimension, AdSetSplitDimensionPerPlatform } from "@/types/mediaplan";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BudgetOptimizationDialog } from "./BudgetOptimizationDialog";
import { KeywordTargeting, KeywordItem, MarketInfo } from "./KeywordTargeting";
import { useSampleMode } from "@/contexts/SampleModeContext";

// Sample data prefill for demo / tour mode
const SAMPLE_INTEREST_ITEMS: any[] = [
  { id: "sample_int_1", name: "Online Shopping", category: "interest", platforms: ["meta", "tiktok"], description: "People interested in e-commerce and online retail" },
  { id: "sample_int_2", name: "Holiday Gifts", category: "interest", platforms: ["meta", "tiktok", "google"], description: "Seasonal gift shoppers (Q4 focus)" },
  { id: "sample_int_3", name: "Fashion & Apparel", category: "interest", platforms: ["meta", "tiktok"], description: "Clothing, accessories and style enthusiasts" },
  { id: "sample_int_4", name: "Beauty & Cosmetics", category: "interest", platforms: ["meta", "tiktok"], description: "Skincare, makeup and beauty product buyers" },
  { id: "sample_int_5", name: "Home & Garden", category: "interest", platforms: ["meta", "google"], description: "Home decor and lifestyle audience" },
  { id: "sample_beh_1", name: "Engaged Shoppers", category: "behavior", platforms: ["meta"], description: "Clicked 'Shop Now' in last 7 days" },
  { id: "sample_beh_2", name: "Recent Purchase Activity", category: "behavior", platforms: ["meta", "tiktok"], description: "Purchased online in last 30 days" },
  { id: "sample_demo_1", name: "Parents (Children 0-12)", category: "demographic", platforms: ["meta"], description: "Households with young children" },
];

const SAMPLE_KEYWORDS: any[] = [
  { id: "sample_kw_g_1", name: "holiday gift ideas", platform: "google", market: "AE", avgMonthlySearches: 90000, competition: "HIGH", cpcLow: 0.45, cpcHigh: 1.8, strategy: "generic", matchType: "broad", isNegative: false },
  { id: "sample_kw_g_2", name: "best christmas deals 2025", platform: "google", market: "AE", avgMonthlySearches: 33000, competition: "HIGH", cpcLow: 0.6, cpcHigh: 2.1, strategy: "generic", matchType: "phrase", isNegative: false },
  { id: "sample_kw_g_3", name: "d-squad official store", platform: "google", market: "AE", avgMonthlySearches: 4400, competition: "LOW", cpcLow: 0.12, cpcHigh: 0.4, strategy: "brand", matchType: "exact", isNegative: false },
  { id: "sample_kw_g_4", name: "competitor brand sale", platform: "google", market: "AE", avgMonthlySearches: 12000, competition: "MEDIUM", cpcLow: 0.35, cpcHigh: 1.2, strategy: "competition", matchType: "phrase", isNegative: false },
  { id: "sample_kw_t_1", name: "holiday outfit ideas", platform: "tiktok", market: "AE", avgMonthlySearches: 27000, competition: "MEDIUM", strategy: "generic", matchType: "broad", isNegative: false },
  { id: "sample_kw_t_2", name: "d-squad haul", platform: "tiktok", market: "AE", avgMonthlySearches: 5600, competition: "LOW", strategy: "brand", matchType: "broad", isNegative: false },
];

export interface UnifiedTargetingItem {
  id: string;
  name: string;
  description?: string;
  category: 'interest' | 'behavior' | 'demographic' | 'keyword' | 'location' | 'topic';
  platforms: ('meta' | 'tiktok' | 'google')[];
  metaId?: string;
  tiktokId?: string;
  googleId?: string;
}

import { AdSetConfig } from "@/types/mediaplan";
import { AdSetSplitManager } from "./AdSetSplitManager";
import { createInitialAdSets } from "@/utils/adSetSplitUtils";

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
  // Keyword targeting for Google Ads / TikTok
  selectedKeywords?: Array<{
    id: string;
    name: string;
    platform: "google" | "tiktok";
    avgMonthlySearches?: number;
    competition?: string;
    cpcLow?: number;
    cpcHigh?: number;
    strategy?: "brand" | "generic" | "competition";
    matchType?: "exact" | "phrase" | "broad";
    isNegative?: boolean;
  }>;
  // Audience targeting mode
  useBroadTargeting?: boolean;
  // Custom/Lookalike audience selections
  retargetingAudienceIds?: string[];
  lookalikeAudienceIds?: string[];
  customAudienceIds?: string[];
  // Default ad set split - applies to all phases unless overridden
  // Legacy: single dimension for all platforms
  defaultAdSetSplitDimension?: AdSetSplitDimension;
  // NEW: Per-platform split dimensions
  defaultAdSetSplitDimensionPerPlatform?: AdSetSplitDimensionPerPlatform;
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
  googleCustomerId?: string;
  // Split functionality props
  currentSplitDimension?: AdSetSplitDimension;
  onSplitDimensionChange?: (dimension: AdSetSplitDimension, useCBO?: boolean) => void;
  // Platform info for the default split manager - legacy single platform
  platformId?: string;
  platformName?: string;
  // NEW: All selected platforms for per-platform configuration
  selectedPlatforms?: PlatformInfo[];
  // When true, skip writing to localStorage (used for phase override targeting)
  skipLocalStorage?: boolean;
  // Markets for keyword targeting per-market search
  markets?: MarketInfo[];
  googleMarkets?: MarketInfo[];
  tiktokMarkets?: MarketInfo[];
}

export function UnifiedTargeting({ 
  targeting, 
  onUpdate, 
  metaAdAccountId, 
  tiktokAdvertiserId,
  googleCustomerId,
  currentSplitDimension,
  onSplitDimensionChange,
  platformId = 'meta',
  platformName = 'Meta',
  selectedPlatforms,
  skipLocalStorage = false,
  markets,
  googleMarkets,
  tiktokMarkets,
}: UnifiedTargetingProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UnifiedTargetingItem[]>([]);
  const [platformFilter, setPlatformFilter] = useState<'all' | 'meta' | 'tiktok' | 'google'>('all');
  
  // State for CBO/ABO dialog
  const [pendingSplitSelection, setPendingSplitSelection] = useState<{
    platformId: string;
    dimension: AdSetSplitDimension;
  } | null>(null);

  // Labels for split dimensions
  const SPLIT_DIMENSION_LABELS: Record<AdSetSplitDimension, string> = {
    none: "None",
    placement: "Placement",
    ad_format: "Ad Format",
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

  // Helper to persist to localStorage only for Step 2 basic targeting, not phase overrides
  const persistToLocalStorage = (updated: UnifiedTargetingConfig) => {
    if (!skipLocalStorage) {
      localStorage.setItem('basicTargeting', JSON.stringify(updated));
    }
  };

  const updateField = (field: keyof UnifiedTargetingConfig, value: any) => {
    const updated = { ...targeting, selectedItems, [field]: value };
    onUpdate(updated);
    persistToLocalStorage(updated);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search term');
      return;
    }

    if (!metaAdAccountId && !tiktokAdvertiserId && !googleCustomerId) {
      toast.error('At least one ad account must be selected');
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('unified-targeting-search', {
        body: {
          query: searchQuery,
          metaAdAccountId,
          tiktokAdvertiserId,
          googleCustomerId
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
    persistToLocalStorage(updated);
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
    persistToLocalStorage(updated);
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
    persistToLocalStorage(updated);
  };

  const getPlatformBadge = (platforms: ('meta' | 'tiktok' | 'google')[]) => {
    if (platforms.length >= 3) {
      return <Badge variant="secondary" className="ml-2">All</Badge>;
    }
    if (platforms.length === 2) {
      return <Badge variant="secondary" className="ml-2">{platforms.map(p => p === 'meta' ? 'Meta' : p === 'tiktok' ? 'TikTok' : 'Google').join(' + ')}</Badge>;
    }
    if (platforms.includes('meta')) {
      return <Badge variant="outline" className="ml-2 border-blue-200">Meta</Badge>;
    }
    if (platforms.includes('google')) {
      return <Badge variant="outline" className="ml-2 border-green-200">Google</Badge>;
    }
    return <Badge variant="outline" className="ml-2 border-pink-200">TikTok</Badge>;
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
          <CardTitle>Audience & Interest Targeting</CardTitle>
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
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {(() => {
                      const filtered = platformFilter === 'all' 
                        ? searchResults 
                        : searchResults.filter(r => r.platforms.includes(platformFilter));
                      return `${filtered.length} results`;
                    })()}
                  </span>
                  <div className="flex gap-1">
                    {(['all', 'meta', 'tiktok', 'google'] as const).map(f => {
                      const count = f === 'all' 
                        ? searchResults.length 
                        : searchResults.filter(r => r.platforms.includes(f)).length;
                      if (f !== 'all' && count === 0) return null;
                      return (
                        <Button
                          key={f}
                          variant={platformFilter === f ? 'default' : 'outline'}
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => setPlatformFilter(f)}
                        >
                          {f === 'all' ? 'All' : f === 'meta' ? 'Meta' : f === 'tiktok' ? 'TikTok' : 'Google'} ({count})
                        </Button>
                      );
                    })}
                  </div>
                </div>
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
                  {searchResults
                    .filter(r => platformFilter === 'all' || r.platforms.includes(platformFilter))
                    .map((result, index) => {
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
                <div className="flex items-center gap-2 mb-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      const updated = { ...targeting, selectedItems: [] };
                      onUpdate(updated);
                      persistToLocalStorage(updated);
                      toast.success('Removed all targeting');
                    }}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Remove All
                  </Button>
                  {(['meta', 'tiktok', 'google'] as const).map(platform => {
                    const count = selectedItems.filter(i => i.platforms.includes(platform)).length;
                    if (count === 0) return null;
                    const label = platform === 'meta' ? 'Meta' : platform === 'tiktok' ? 'TikTok' : 'Google';
                    return (
                      <Button
                        key={platform}
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newItems = selectedItems.filter(i => !i.platforms.includes(platform));
                          const updated = { ...targeting, selectedItems: newItems };
                          onUpdate(updated);
                          persistToLocalStorage(updated);
                          toast.success(`Removed all ${label} targeting`);
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        {label} ({count})
                      </Button>
                    );
                  })}
                </div>
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

      {/* Keyword Targeting for Search Campaigns */}
      {(googleCustomerId || tiktokAdvertiserId || selectedPlatforms?.some(p => p.id === 'google_ads' || p.id === 'google' || p.id === 'tiktok')) && (
        <KeywordTargeting
          selectedKeywords={targeting.selectedKeywords || []}
          onUpdate={(keywords) => {
            const updated = { ...targeting, selectedItems, selectedKeywords: keywords };
            onUpdate(updated);
            persistToLocalStorage(updated);
          }}
          googleCustomerId={googleCustomerId}
          tiktokAdvertiserId={tiktokAdvertiserId}
          markets={markets}
          googleMarkets={googleMarkets}
          tiktokMarkets={tiktokMarkets}
          showWithoutAccountIds={selectedPlatforms?.some(p => p.id === 'google_ads' || p.id === 'google' || p.id === 'tiktok')}
        />
      )}

      {/* Default Ad Set Split Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Default Ad Set Split
            {(() => {
              const platforms = selectedPlatforms?.length ? selectedPlatforms : [{ id: platformId, name: platformName }];
              const dimPerPlatform = targeting.defaultAdSetSplitDimensionPerPlatform || {};
              const activePlatforms = platforms.filter(p => {
                const dim = dimPerPlatform[p.id] || targeting.defaultAdSetSplitDimension;
                return dim && dim !== 'none';
              });
              if (activePlatforms.length === 0) return null;
              return activePlatforms.map(p => {
                const dim = dimPerPlatform[p.id] || targeting.defaultAdSetSplitDimension;
                return dim && dim !== 'none' ? (
                  <Badge key={p.id} variant="secondary" className="text-xs">
                    {p.name}: {SPLIT_DIMENSION_LABELS[dim]}
                  </Badge>
                ) : null;
              });
            })()}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure default ad set splits per platform. Each platform can have a different split dimension. Individual phases can override these using the "Override Targeting" toggle.
          </p>
          
          {(() => {
            const platforms = selectedPlatforms?.length ? selectedPlatforms : [{ id: platformId, name: platformName }];
            const dimPerPlatform = targeting.defaultAdSetSplitDimensionPerPlatform || {};
            const adSetsPerPlatform = targeting.defaultAdSetsPerPlatform || {};
            
            // Helper to get effective dimension for a platform
            const getEffectiveDimension = (pId: string): AdSetSplitDimension => {
              return dimPerPlatform[pId] || targeting.defaultAdSetSplitDimension || 'none';
            };
            
            // Helper to update dimension for a platform (called after CBO/ABO selection)
            const updatePlatformDimension = (pId: string, dim: AdSetSplitDimension, useCBO?: boolean) => {
              const newDimPerPlatform = { ...dimPerPlatform };
              const newAdSetsPerPlatform = { ...adSetsPerPlatform };
              
              if (dim === 'none') {
                delete newDimPerPlatform[pId];
                delete newAdSetsPerPlatform[pId];
              } else {
                newDimPerPlatform[pId] = dim;
                // Create initial ad sets for this platform with the new dimension
                newAdSetsPerPlatform[pId] = createInitialAdSets(dim, 'Default', {
                  platformId: pId,
                  currentGender: targeting.genders?.[0],
                  currentDevices: targeting.devices,
                  currentLanguages: targeting.languages,
                  currentAgeMin: targeting.ageMin,
                  currentAgeMax: targeting.ageMax,
                });
              }
              
              // Check if all platforms have same dimension for backwards compat
              const allDimensions = platforms.map(p => newDimPerPlatform[p.id] || 'none');
              const allSame = allDimensions.every(d => d === allDimensions[0]);
              
              const updated = {
                ...targeting,
                selectedItems,
                defaultAdSetSplitDimensionPerPlatform: Object.keys(newDimPerPlatform).length > 0 ? newDimPerPlatform : undefined,
                defaultAdSetsPerPlatform: Object.keys(newAdSetsPerPlatform).length > 0 ? newAdSetsPerPlatform : undefined,
                // Legacy: set if all platforms use same dimension
                defaultAdSetSplitDimension: allSame && allDimensions[0] !== 'none' ? allDimensions[0] as AdSetSplitDimension : undefined,
                defaultAdSets: newAdSetsPerPlatform[platforms[0]?.id || platformId],
                defaultAdSetSplitUseCBO: useCBO,
              };
              onUpdate(updated);
              persistToLocalStorage(updated);
            };
            
            // Handler for dimension selection - shows CBO/ABO dialog first
            const handleDimensionSelect = (pId: string, dim: AdSetSplitDimension) => {
              if (dim === 'none') {
                updatePlatformDimension(pId, 'none');
              } else {
                // Show CBO/ABO dialog
                setPendingSplitSelection({ platformId: pId, dimension: dim });
              }
            };
            
            // Check if any platform has a split configured
            const hasAnySplit = platforms.some(p => getEffectiveDimension(p.id) !== 'none');
            
            if (platforms.length === 1) {
              // Single platform - simple layout
              const p = platforms[0];
              const currentDim = getEffectiveDimension(p.id);
              const platformAdSets = adSetsPerPlatform[p.id] || [];
              
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label className="mb-2 block">Split Dimension</Label>
                      <Select
                        value={currentDim}
                        onValueChange={(value) => handleDimensionSelect(p.id, value as AdSetSplitDimension)}
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
                          <SelectItem value="ad_format">Ad Format</SelectItem>
                          <SelectItem value="optimization_goal">Optimization Goal</SelectItem>
                          <SelectItem value="audience_selection">Audience Selection</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {currentDim !== 'none' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updatePlatformDimension(p.id, 'none')}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                  
                  {currentDim !== 'none' && platformAdSets.length > 0 && (
                    <AdSetSplitManager
                      dimension={currentDim}
                      adSets={platformAdSets}
                      platformName={p.name}
                      platformId={p.id}
                      phaseName="Default"
                      useCBO={targeting.defaultAdSetSplitUseCBO}
                      onAdSetsChange={(adSets) => {
                        const newAdSetsPerPlatform = { ...adSetsPerPlatform, [p.id]: adSets };
                        const updated = {
                          ...targeting,
                          selectedItems,
                          defaultAdSetsPerPlatform: newAdSetsPerPlatform,
                          defaultAdSets: adSets,
                        };
                        onUpdate(updated);
                        persistToLocalStorage(updated);
                      }}
                      onRemoveSplit={() => updatePlatformDimension(p.id, 'none')}
                      adAccountId={p.id === 'meta' ? metaAdAccountId : p.id === 'tiktok' ? tiktokAdvertiserId : p.adAccountId}
                      currentGender={targeting.genders?.[0]}
                      currentAgeMin={targeting.ageMin}
                      currentAgeMax={targeting.ageMax}
                      currentDevices={targeting.devices}
                      currentLanguages={targeting.languages}
                    />
                  )}
                </div>
              );
            }
            
            // Multiple platforms - show tabs with per-platform dimension selectors
            return (
              <Tabs defaultValue={platforms[0]?.id} className="w-full">
                <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${platforms.length}, minmax(0, 1fr))` }}>
                  {platforms.map(p => {
                    const dim = getEffectiveDimension(p.id);
                    return (
                      <TabsTrigger key={p.id} value={p.id} className="flex items-center gap-2">
                        {p.name}
                        {dim !== 'none' && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                            {SPLIT_DIMENSION_LABELS[dim]}
                          </Badge>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {platforms.map(p => {
                  const currentDim = getEffectiveDimension(p.id);
                  const platformAdSets = adSetsPerPlatform[p.id] || [];
                  
                  return (
                    <TabsContent key={p.id} value={p.id} className="mt-4 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Label className="mb-2 block">Split Dimension for {p.name}</Label>
                          <Select
                            value={currentDim}
                            onValueChange={(value) => handleDimensionSelect(p.id, value as AdSetSplitDimension)}
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
                              <SelectItem value="ad_format">Ad Format</SelectItem>
                              <SelectItem value="optimization_goal">Optimization Goal</SelectItem>
                              <SelectItem value="audience_selection">Audience Selection</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {currentDim !== 'none' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updatePlatformDimension(p.id, 'none')}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Clear
                          </Button>
                        )}
                      </div>
                      
                      {currentDim !== 'none' && platformAdSets.length > 0 ? (
                        <AdSetSplitManager
                          dimension={currentDim}
                          adSets={platformAdSets}
                          platformName={p.name}
                          platformId={p.id}
                          phaseName="Default"
                          useCBO={targeting.defaultAdSetSplitUseCBO}
                          onAdSetsChange={(adSets) => {
                            const newAdSetsPerPlatform = { ...adSetsPerPlatform, [p.id]: adSets };
                            const updated = {
                              ...targeting,
                              selectedItems,
                              defaultAdSetsPerPlatform: newAdSetsPerPlatform,
                              defaultAdSets: newAdSetsPerPlatform[platforms[0]?.id || platformId],
                            };
                            onUpdate(updated);
                            persistToLocalStorage(updated);
                          }}
                          onRemoveSplit={() => updatePlatformDimension(p.id, 'none')}
                          adAccountId={p.id === 'meta' ? metaAdAccountId : p.id === 'tiktok' ? tiktokAdvertiserId : p.adAccountId}
                          currentGender={targeting.genders?.[0]}
                          currentAgeMin={targeting.ageMin}
                          currentAgeMax={targeting.ageMax}
                          currentDevices={targeting.devices}
                          currentLanguages={targeting.languages}
                        />
                      ) : currentDim !== 'none' ? (
                        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                          <strong>Note:</strong> Initializing ad sets for {p.name}...
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                          Select a split dimension above to configure ad sets for {p.name}.
                        </div>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            );
          })()}
        </CardContent>
      </Card>
      
      {/* CBO/ABO Selection Dialog */}
      <BudgetOptimizationDialog
        open={!!pendingSplitSelection}
        onOpenChange={(open) => {
          if (!open) setPendingSplitSelection(null);
        }}
        dimensionLabel={pendingSplitSelection ? SPLIT_DIMENSION_LABELS[pendingSplitSelection.dimension] : ''}
        onSelectCBO={() => {
          if (pendingSplitSelection) {
            const platforms = selectedPlatforms?.length ? selectedPlatforms : [{ id: platformId, name: platformName }];
            const dimPerPlatform = targeting.defaultAdSetSplitDimensionPerPlatform || {};
            const adSetsPerPlatform = targeting.defaultAdSetsPerPlatform || {};
            
            const newDimPerPlatform = { ...dimPerPlatform, [pendingSplitSelection.platformId]: pendingSplitSelection.dimension };
            const newAdSetsPerPlatform = { 
              ...adSetsPerPlatform, 
              [pendingSplitSelection.platformId]: createInitialAdSets(pendingSplitSelection.dimension, 'Default', {
                platformId: pendingSplitSelection.platformId,
                currentGender: targeting.genders?.[0],
                currentDevices: targeting.devices,
                currentLanguages: targeting.languages,
                currentAgeMin: targeting.ageMin,
                currentAgeMax: targeting.ageMax,
              })
            };
            
            const allDimensions = platforms.map(p => newDimPerPlatform[p.id] || 'none');
            const allSame = allDimensions.every(d => d === allDimensions[0]);
            
            const updated = {
              ...targeting,
              selectedItems,
              defaultAdSetSplitDimensionPerPlatform: newDimPerPlatform,
              defaultAdSetsPerPlatform: newAdSetsPerPlatform,
              defaultAdSetSplitDimension: allSame && allDimensions[0] !== 'none' ? allDimensions[0] as AdSetSplitDimension : undefined,
              defaultAdSets: newAdSetsPerPlatform[platforms[0]?.id || platformId],
              defaultAdSetSplitUseCBO: true,
            };
            onUpdate(updated);
            persistToLocalStorage(updated);
          }
          setPendingSplitSelection(null);
        }}
        onSelectABO={() => {
          if (pendingSplitSelection) {
            const platforms = selectedPlatforms?.length ? selectedPlatforms : [{ id: platformId, name: platformName }];
            const dimPerPlatform = targeting.defaultAdSetSplitDimensionPerPlatform || {};
            const adSetsPerPlatform = targeting.defaultAdSetsPerPlatform || {};
            
            const newDimPerPlatform = { ...dimPerPlatform, [pendingSplitSelection.platformId]: pendingSplitSelection.dimension };
            const newAdSetsPerPlatform = { 
              ...adSetsPerPlatform, 
              [pendingSplitSelection.platformId]: createInitialAdSets(pendingSplitSelection.dimension, 'Default', {
                platformId: pendingSplitSelection.platformId,
                currentGender: targeting.genders?.[0],
                currentDevices: targeting.devices,
                currentLanguages: targeting.languages,
                currentAgeMin: targeting.ageMin,
                currentAgeMax: targeting.ageMax,
              })
            };
            
            const allDimensions = platforms.map(p => newDimPerPlatform[p.id] || 'none');
            const allSame = allDimensions.every(d => d === allDimensions[0]);
            
            const updated = {
              ...targeting,
              selectedItems,
              defaultAdSetSplitDimensionPerPlatform: newDimPerPlatform,
              defaultAdSetsPerPlatform: newAdSetsPerPlatform,
              defaultAdSetSplitDimension: allSame && allDimensions[0] !== 'none' ? allDimensions[0] as AdSetSplitDimension : undefined,
              defaultAdSets: newAdSetsPerPlatform[platforms[0]?.id || platformId],
              defaultAdSetSplitUseCBO: false,
            };
            onUpdate(updated);
            persistToLocalStorage(updated);
          }
          setPendingSplitSelection(null);
        }}
      />
    </div>
  );
}
