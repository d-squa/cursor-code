import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MultiSelect } from "@/components/ui/multi-select";
import { DEVICE_OPTIONS, LANGUAGE_OPTIONS, GENDER_OPTIONS } from "@/utils/targetingOptions";

export interface UnifiedTargetingItem {
  id: string;
  name: string;
  description?: string;
  category: 'interest' | 'behavior' | 'demographic';
  platforms: ('meta' | 'tiktok')[];
  metaId?: string;
  tiktokId?: string;
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
}

interface UnifiedTargetingProps {
  targeting: UnifiedTargetingConfig;
  onUpdate: (targeting: UnifiedTargetingConfig) => void;
  metaAdAccountId?: string;
  tiktokAdvertiserId?: string;
}

export function UnifiedTargeting({ targeting, onUpdate, metaAdAccountId, tiktokAdvertiserId }: UnifiedTargetingProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UnifiedTargetingItem[]>([]);

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

  const handleAddItem = (item: UnifiedTargetingItem) => {
    const alreadySelected = selectedItems.some(i => i.id === item.id);
    if (alreadySelected) {
      toast.info('Already selected');
      return;
    }

    const newSelectedItems = [...selectedItems, item];
    const updated = {
      ...targeting,
      selectedItems: newSelectedItems
    };
    onUpdate(updated);
    // Persist immediately to localStorage
    localStorage.setItem('basicTargeting', JSON.stringify(updated));
    toast.success(`Added: ${item.name}`);
  };

  const handleAddAll = () => {
    // Filter out items that are already selected
    const newItems = searchResults.filter(
      result => !selectedItems.some(selected => selected.id === result.id)
    );
    
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
    // Persist immediately to localStorage
    localStorage.setItem('basicTargeting', JSON.stringify(updated));
    toast.success(`Added ${newItems.length} targeting options`);
  };

  const handleRemoveItem = (itemId: string) => {
    const newSelectedItems = selectedItems.filter(i => i.id !== itemId);
    const updated = {
      ...targeting,
      selectedItems: newSelectedItems
    };
    onUpdate(updated);
    // Persist immediately to localStorage
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Devices</Label>
              <MultiSelect
                options={DEVICE_OPTIONS}
                value={targeting.devices || []}
                onChange={(values) => updateField('devices', values)}
                placeholder="Select devices"
              />
            </div>

            <div className="space-y-2">
              <Label>Languages</Label>
              <MultiSelect
                options={LANGUAGE_OPTIONS}
                value={targeting.languages || []}
                onChange={(values) => updateField('languages', values)}
                placeholder="Select languages"
              />
            </div>
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
                  {searchResults.map((result) => {
                    const isSelected = selectedItems.some(s => s.id === result.id);
                    return (
                      <div
                        key={result.id}
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Selected Targeting ({selectedItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {selectedItems.map((item) => (
                <div
                  key={item.id}
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
                    onClick={() => handleRemoveItem(item.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
