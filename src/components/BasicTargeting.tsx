import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, Search, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { MultiSelect } from "@/components/ui/multi-select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { validateCrossPlatform, type TargetingParameter } from "@/utils/platformTargetingMapper";

export interface BasicTargetingConfig {
  ageMin?: number;
  ageMax?: number;
  genders?: string[];
  devices?: string[];
  os?: string[];
  languages?: string[];
  productBrief?: string;
  
  // Separated by platform
  metaInterests?: TargetingParameter[];
  metaBehaviors?: TargetingParameter[];
  metaDemographics?: TargetingParameter[];
  
  tiktokInterests?: TargetingParameter[];
  tiktokBehaviors?: TargetingParameter[];
  tiktokDemographics?: TargetingParameter[];
}

interface BasicTargetingProps {
  targeting: BasicTargetingConfig;
  onUpdate: (targeting: BasicTargetingConfig) => void;
  metaAdAccountId?: string;
  tiktokAdvertiserId?: string;
}

interface TargetingOption {
  id?: string;
  key?: number;
  name: string;
}

export function BasicTargeting({ targeting, onUpdate, metaAdAccountId, tiktokAdvertiserId }: BasicTargetingProps) {
  const [loading, setLoading] = useState(false);
  const [genderOptions, setGenderOptions] = useState<TargetingOption[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<TargetingOption[]>([]);
  const [osOptions, setOsOptions] = useState<TargetingOption[]>([]);
  const [languageOptions, setLanguageOptions] = useState<TargetingOption[]>([]);
  const [ageOptions, setAgeOptions] = useState<TargetingOption[]>([]);
  
  // Cross-platform AI recommendations
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<{
    meta: {
      interests: (TargetingParameter & { selected: boolean })[];
      behaviors: (TargetingParameter & { selected: boolean })[];
      demographics: (TargetingParameter & { selected: boolean })[];
    };
    tiktok: {
      interests: (TargetingParameter & { selected: boolean })[];
      behaviors: (TargetingParameter & { selected: boolean })[];
      demographics: (TargetingParameter & { selected: boolean })[];
    };
    matches: Array<{ meta: TargetingParameter; tiktok: TargetingParameter; score: number }>;
  }>({
    meta: { interests: [], behaviors: [], demographics: [] },
    tiktok: { interests: [], behaviors: [], demographics: [] },
    matches: []
  });
  
  // Cross-platform search
  const [searchType, setSearchType] = useState<'interests' | 'behaviors' | 'demographics'>('interests');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    meta: TargetingParameter[];
    tiktok: TargetingParameter[];
    matches: Array<{ meta: TargetingParameter; tiktok: TargetingParameter; score: number }>;
  }>({ meta: [], tiktok: [], matches: [] });
  const [searching, setSearching] = useState(false);
  
  // Validation warnings
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  useEffect(() => {
    loadTargetingOptions();
  }, []);

  // Initialize recommendations from saved targeting data
  useEffect(() => {
    if (targeting.metaInterests || targeting.tiktokInterests) {
      setAiRecommendations(prev => ({
        ...prev,
        meta: {
          ...prev.meta,
          interests: (targeting.metaInterests || []).map(i => ({ ...i, selected: true }))
        },
        tiktok: {
          ...prev.tiktok,
          interests: (targeting.tiktokInterests || []).map(i => ({ ...i, selected: true }))
        }
      }));
    }
    
    if (targeting.metaBehaviors || targeting.tiktokBehaviors) {
      setAiRecommendations(prev => ({
        ...prev,
        meta: {
          ...prev.meta,
          behaviors: (targeting.metaBehaviors || []).map(b => ({ ...b, selected: true }))
        },
        tiktok: {
          ...prev.tiktok,
          behaviors: (targeting.tiktokBehaviors || []).map(b => ({ ...b, selected: true }))
        }
      }));
    }
    
    if (targeting.metaDemographics || targeting.tiktokDemographics) {
      setAiRecommendations(prev => ({
        ...prev,
        meta: {
          ...prev.meta,
          demographics: (targeting.metaDemographics || []).map(d => ({ ...d, selected: true }))
        },
        tiktok: {
          ...prev.tiktok,
          demographics: (targeting.tiktokDemographics || []).map(d => ({ ...d, selected: true }))
        }
      }));
    }
  }, []);

  const loadTargetingOptions = async () => {
    setLoading(true);
    try {
      const [genders, devices, os, languages, ages] = await Promise.all([
        fetchTargetingOptions('genders'),
        fetchTargetingOptions('devices'),
        fetchTargetingOptions('os'),
        fetchTargetingOptions('languages', ''),
        fetchTargetingOptions('age')
      ]);

      setGenderOptions(genders);
      setDeviceOptions(devices);
      setOsOptions(os);
      setLanguageOptions(languages);
      setAgeOptions(ages);
    } catch (error) {
      console.error('Error loading targeting options:', error);
      toast.error('Failed to load targeting options');
    } finally {
      setLoading(false);
    }
  };

  const fetchTargetingOptions = async (type: string, search: string = ''): Promise<TargetingOption[]> => {
    const { data, error } = await supabase.functions.invoke('fetch-meta-targeting-options', {
      body: { type, search }
    });

    if (error) throw error;
    return data?.data || [];
  };

  const updateField = (field: keyof BasicTargetingConfig, value: any) => {
    const updated = { ...targeting, [field]: value };
    
    // Perform cross-platform validation for basic demographics
    if (['ageMin', 'ageMax', 'genders', 'devices', 'os'].includes(field)) {
      const validation = validateCrossPlatform({
        minAge: updated.ageMin,
        maxAge: updated.ageMax,
        genders: updated.genders,
        devices: updated.devices,
        os: updated.os
      });
      
      setValidationWarnings(validation.warnings);
      
      if (validation.warnings.length > 0) {
        toast.warning(`Some values adjusted for platform compatibility`, {
          description: validation.warnings.join(', ')
        });
      }
    }
    
    onUpdate(updated);
  };

  const handleGenerateRecommendations = async () => {
    if (!targeting.productBrief?.trim()) {
      toast.error('Please enter a product brief');
      return;
    }
    
    if (!metaAdAccountId && !tiktokAdvertiserId) {
      toast.error('At least one ad account must be selected (Meta or TikTok)');
      return;
    }

    setGeneratingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('cross-platform-ai-recommendations', {
        body: { 
          brief: targeting.productBrief,
          metaAdAccountId,
          tiktokAdvertiserId
        }
      });

      if (error) throw error;

      const recommendations = {
        meta: {
          interests: (data.meta?.interests || []).map((i: TargetingParameter) => ({ ...i, selected: true })),
          behaviors: (data.meta?.behaviors || []).map((b: TargetingParameter) => ({ ...b, selected: true })),
          demographics: (data.meta?.demographics || []).map((d: TargetingParameter) => ({ ...d, selected: true }))
        },
        tiktok: {
          interests: (data.tiktok?.interests || []).map((i: TargetingParameter) => ({ ...i, selected: true })),
          behaviors: (data.tiktok?.behaviors || []).map((b: TargetingParameter) => ({ ...b, selected: true })),
          demographics: (data.tiktok?.demographics || []).map((d: TargetingParameter) => ({ ...d, selected: true }))
        },
        matches: data.matches || []
      };
      
      setAiRecommendations(recommendations);
      toast.success(`Generated ${recommendations.meta.interests.length + recommendations.meta.behaviors.length + recommendations.tiktok.interests.length + recommendations.tiktok.behaviors.length} cross-platform recommendations`);
    } catch (error: any) {
      console.error('Error generating recommendations:', error);
      toast.error(error.message || 'Failed to generate recommendations');
    } finally {
      setGeneratingAI(false);
    }
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
      const { data, error } = await supabase.functions.invoke('cross-platform-search', {
        body: { 
          query: searchQuery,
          type: searchType,
          metaAdAccountId,
          tiktokAdvertiserId
        }
      });

      if (error) throw error;

      setSearchResults({
        meta: data.meta || [],
        tiktok: data.tiktok || [],
        matches: data.matches || []
      });
      
      toast.success(`Found ${data.meta?.length || 0} Meta and ${data.tiktok?.length || 0} TikTok results`);
    } catch (error: any) {
      console.error('Error searching:', error);
      toast.error(error.message || 'Failed to search');
    } finally {
      setSearching(false);
    }
  };

  const handleToggleRecommendation = (platform: 'meta' | 'tiktok', type: 'interests' | 'behaviors' | 'demographics', id: string) => {
    setAiRecommendations(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [type]: prev[platform][type].map((item: any) => 
          item.id === id ? { ...item, selected: !item.selected } : item
        )
      }
    }));
  };

  const handleAddSearchResult = (platform: 'meta' | 'tiktok', result: TargetingParameter) => {
    setAiRecommendations(prev => {
      const currentList = prev[platform][searchType];
      if (currentList.some((item: any) => item.id === result.id)) {
        return prev;
      }
      
      return {
        ...prev,
        [platform]: {
          ...prev[platform],
          [searchType]: [...currentList, { ...result, selected: true }]
        }
      };
    });
    
    setSearchResults(prev => ({
      ...prev,
      [platform]: prev[platform].filter(r => r.id !== result.id)
    }));
    
    toast.success(`Added to ${platform} ${searchType}`);
  };

  const handleSelectAll = (platform: 'meta' | 'tiktok', type: 'interests' | 'behaviors' | 'demographics') => {
    setAiRecommendations(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [type]: prev[platform][type].map((item: any) => ({ ...item, selected: true }))
      }
    }));
  };

  const handleDeselectAll = (platform: 'meta' | 'tiktok', type: 'interests' | 'behaviors' | 'demographics') => {
    setAiRecommendations(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [type]: prev[platform][type].map((item: any) => ({ ...item, selected: false }))
      }
    }));
  };

  // Update targeting config when recommendations change
  useEffect(() => {
    const metaInterests = aiRecommendations.meta.interests.filter(i => i.selected).map(({ selected, ...rest }) => rest);
    const metaBehaviors = aiRecommendations.meta.behaviors.filter(b => b.selected).map(({ selected, ...rest }) => rest);
    const metaDemographics = aiRecommendations.meta.demographics.filter(d => d.selected).map(({ selected, ...rest }) => rest);
    
    const tiktokInterests = aiRecommendations.tiktok.interests.filter(i => i.selected).map(({ selected, ...rest }) => rest);
    const tiktokBehaviors = aiRecommendations.tiktok.behaviors.filter(b => b.selected).map(({ selected, ...rest }) => rest);
    const tiktokDemographics = aiRecommendations.tiktok.demographics.filter(d => d.selected).map(({ selected, ...rest }) => rest);
    
    onUpdate({
      ...targeting,
      metaInterests,
      metaBehaviors,
      metaDemographics,
      tiktokInterests,
      tiktokBehaviors,
      tiktokDemographics
    });
  }, [aiRecommendations]);

  const handleMultiSelectWithAll = (field: keyof BasicTargetingConfig, newValues: string[]) => {
    const previousValues = (targeting[field] as string[]) || [];
    const cleanNewValues = newValues.filter(v => v !== undefined && v !== null && v !== '');
    
    let finalValues: string[];
    
    if (cleanNewValues.length === 0) {
      finalValues = [];
    } else if (cleanNewValues.includes('all') && !previousValues.includes('all')) {
      finalValues = ['all'];
    } else if (previousValues.includes('all') && cleanNewValues.length > 1 && cleanNewValues.includes('all')) {
      finalValues = cleanNewValues.filter(v => v !== 'all');
    } else {
      finalValues = cleanNewValues;
    }
    
    updateField(field, finalValues);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading targeting options...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cross-Platform Audience Targeting</CardTitle>
        <CardDescription>
          Define demographics that will be validated and applied across Meta and TikTok platforms
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Validation Warnings */}
        {validationWarnings.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold mb-1">Platform Compatibility Adjustments:</div>
              <ul className="list-disc list-inside text-sm space-y-1">
                {validationWarnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Age Range */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ageMin">Minimum Age</Label>
            <Select
              value={targeting.ageMin?.toString()}
              onValueChange={(value) => updateField('ageMin', parseInt(value))}
            >
              <SelectTrigger id="ageMin">
                <SelectValue placeholder="Select min age" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {ageOptions.map((age) => (
                  <SelectItem key={age.id} value={age.id}>
                    {age.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ageMax">Maximum Age</Label>
            <Select
              value={targeting.ageMax?.toString()}
              onValueChange={(value) => updateField('ageMax', parseInt(value))}
            >
              <SelectTrigger id="ageMax">
                <SelectValue placeholder="Select max age" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {ageOptions.map((age) => (
                  <SelectItem key={age.id} value={age.id}>
                    {age.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Gender */}
        <div className="space-y-2">
          <Label>Gender</Label>
          <MultiSelect
            options={[
              { label: 'All', value: 'all' },
              ...genderOptions.map(g => ({ label: g.name, value: g.id }))
            ]}
            value={targeting.genders || []}
            onChange={(values) => handleMultiSelectWithAll('genders', values)}
            placeholder="Select genders"
          />
        </div>

        {/* Language */}
        <div className="space-y-2">
          <Label>Language</Label>
          <MultiSelect
            options={[
              { label: 'All', value: 'all' },
              ...languageOptions.map(l => ({ 
                label: l.name, 
                value: l.key?.toString() || l.id 
              }))
            ]}
            value={targeting.languages || []}
            onChange={(values) => handleMultiSelectWithAll('languages', values)}
            placeholder="Select languages"
          />
        </div>

        {/* Device */}
        <div className="space-y-2">
          <Label>Device</Label>
          <MultiSelect
            options={[
              { label: 'All', value: 'all' },
              ...deviceOptions.map(d => ({ label: d.name, value: d.id }))
            ]}
            value={targeting.devices || []}
            onChange={(values) => handleMultiSelectWithAll('devices', values)}
            placeholder="Select devices"
          />
        </div>

        {/* Operating System */}
        <div className="space-y-2">
          <Label>Operating System</Label>
          <MultiSelect
            options={[
              { label: 'All', value: 'all' },
              ...osOptions.map(o => ({ label: o.name, value: o.id }))
            ]}
            value={targeting.os || []}
            onChange={(values) => handleMultiSelectWithAll('os', values)}
            placeholder="Select operating systems"
          />
        </div>

        <Separator />

        {/* AI-Powered Cross-Platform Recommendations */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Cross-Platform AI Recommendations
            </CardTitle>
            <CardDescription>
              Generate audience recommendations for both Meta and TikTok based on your product brief
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="productBrief">Product/Service Description</Label>
              <Textarea
                id="productBrief"
                placeholder="E.g., Premium organic skincare products for eco-conscious millennials..."
                value={targeting.productBrief || ''}
                onChange={(e) => updateField('productBrief', e.target.value)}
                rows={3}
              />
            </div>
            <Button 
              onClick={handleGenerateRecommendations}
              disabled={generatingAI || !targeting.productBrief?.trim() || (!metaAdAccountId && !tiktokAdvertiserId)}
              className="w-full"
            >
              {generatingAI ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Cross-Platform Recommendations...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate AI Recommendations
                </>
              )}
            </Button>

            {/* Platform-Segmented Recommendations */}
            {(aiRecommendations.meta.interests.length > 0 || aiRecommendations.tiktok.interests.length > 0) && (
              <Tabs defaultValue="meta" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="meta">
                    Meta ({aiRecommendations.meta.interests.length + aiRecommendations.meta.behaviors.length + aiRecommendations.meta.demographics.length})
                  </TabsTrigger>
                  <TabsTrigger value="tiktok">
                    TikTok ({aiRecommendations.tiktok.interests.length + aiRecommendations.tiktok.behaviors.length})
                  </TabsTrigger>
                  <TabsTrigger value="matches">
                    Matches ({aiRecommendations.matches.length})
                  </TabsTrigger>
                </TabsList>
                
                {/* Meta Recommendations */}
                <TabsContent value="meta" className="space-y-4 mt-4">
                  {aiRecommendations.meta.interests.length > 0 && (
                    <RecommendationSection
                      title="Interests"
                      items={aiRecommendations.meta.interests}
                      platform="meta"
                      type="interests"
                      onToggle={handleToggleRecommendation}
                      onSelectAll={handleSelectAll}
                      onDeselectAll={handleDeselectAll}
                    />
                  )}
                  {aiRecommendations.meta.behaviors.length > 0 && (
                    <RecommendationSection
                      title="Behaviors"
                      items={aiRecommendations.meta.behaviors}
                      platform="meta"
                      type="behaviors"
                      onToggle={handleToggleRecommendation}
                      onSelectAll={handleSelectAll}
                      onDeselectAll={handleDeselectAll}
                    />
                  )}
                  {aiRecommendations.meta.demographics.length > 0 && (
                    <RecommendationSection
                      title="Demographics"
                      items={aiRecommendations.meta.demographics}
                      platform="meta"
                      type="demographics"
                      onToggle={handleToggleRecommendation}
                      onSelectAll={handleSelectAll}
                      onDeselectAll={handleDeselectAll}
                    />
                  )}
                </TabsContent>

                {/* TikTok Recommendations */}
                <TabsContent value="tiktok" className="space-y-4 mt-4">
                  {aiRecommendations.tiktok.interests.length > 0 && (
                    <RecommendationSection
                      title="Interests"
                      items={aiRecommendations.tiktok.interests}
                      platform="tiktok"
                      type="interests"
                      onToggle={handleToggleRecommendation}
                      onSelectAll={handleSelectAll}
                      onDeselectAll={handleDeselectAll}
                    />
                  )}
                  {aiRecommendations.tiktok.behaviors.length > 0 && (
                    <RecommendationSection
                      title="Actions"
                      items={aiRecommendations.tiktok.behaviors}
                      platform="tiktok"
                      type="behaviors"
                      onToggle={handleToggleRecommendation}
                      onSelectAll={handleSelectAll}
                      onDeselectAll={handleDeselectAll}
                    />
                  )}
                </TabsContent>

                {/* Cross-Platform Matches */}
                <TabsContent value="matches" className="space-y-2 mt-4">
                  {aiRecommendations.matches.length > 0 ? (
                    aiRecommendations.matches.map((match, idx) => (
                      <Card key={idx} className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium">Meta: {match.meta.name}</div>
                            <div className="text-sm text-muted-foreground">TikTok: {match.tiktok.name}</div>
                          </div>
                          <Badge variant={match.score >= 80 ? "default" : "secondary"}>
                            {match.score}% match
                          </Badge>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground py-4">
                      No cross-platform matches found
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* Cross-Platform Search */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Cross-Platform Audience Search
            </CardTitle>
            <CardDescription>
              Search for interests, behaviors, and demographics across Meta and TikTok
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Search Type</Label>
                <Select value={searchType} onValueChange={(value: any) => setSearchType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="interests">Interests</SelectItem>
                    <SelectItem value="behaviors">Behaviors/Actions</SelectItem>
                    <SelectItem value="demographics">Demographics</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Search Query</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., fitness, travel..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <Button 
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    size="icon"
                  >
                    {searching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Search Results */}
            {(searchResults.meta.length > 0 || searchResults.tiktok.length > 0) && (
              <Tabs defaultValue="meta" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="meta">Meta ({searchResults.meta.length})</TabsTrigger>
                  <TabsTrigger value="tiktok">TikTok ({searchResults.tiktok.length})</TabsTrigger>
                </TabsList>
                
                <TabsContent value="meta" className="space-y-2 mt-4">
                  {searchResults.meta.map((result) => (
                    <SearchResultItem
                      key={result.id}
                      result={result}
                      platform="meta"
                      onAdd={handleAddSearchResult}
                    />
                  ))}
                </TabsContent>

                <TabsContent value="tiktok" className="space-y-2 mt-4">
                  {searchResults.tiktok.map((result) => (
                    <SearchResultItem
                      key={result.id}
                      result={result}
                      platform="tiktok"
                      onAdd={handleAddSearchResult}
                    />
                  ))}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

// Helper Components
function RecommendationSection({
  title,
  items,
  platform,
  type,
  onToggle,
  onSelectAll,
  onDeselectAll
}: {
  title: string;
  items: (TargetingParameter & { selected: boolean })[];
  platform: 'meta' | 'tiktok';
  type: 'interests' | 'behaviors' | 'demographics';
  onToggle: (platform: 'meta' | 'tiktok', type: 'interests' | 'behaviors' | 'demographics', id: string) => void;
  onSelectAll: (platform: 'meta' | 'tiktok', type: 'interests' | 'behaviors' | 'demographics') => void;
  onDeselectAll: (platform: 'meta' | 'tiktok', type: 'interests' | 'behaviors' | 'demographics') => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{title}</Label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onSelectAll(platform, type)}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDeselectAll(platform, type)}>
            Deselect All
          </Button>
        </div>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-2 bg-background rounded">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={item.selected}
                onCheckedChange={() => onToggle(platform, type, item.id)}
              />
              <span className="text-sm">{item.name}</span>
            </div>
            {item.audienceSize && (
              <Badge variant="secondary" className="text-xs">
                {item.audienceSize.toLocaleString()} people
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchResultItem({
  result,
  platform,
  onAdd
}: {
  result: TargetingParameter;
  platform: 'meta' | 'tiktok';
  onAdd: (platform: 'meta' | 'tiktok', result: TargetingParameter) => void;
}) {
  return (
    <div className="flex items-center justify-between p-2 bg-background rounded">
      <span className="text-sm">{result.name}</span>
      <div className="flex items-center gap-2">
        {result.audienceSize && (
          <Badge variant="secondary" className="text-xs">
            {result.audienceSize.toLocaleString()} people
          </Badge>
        )}
        <Button size="sm" onClick={() => onAdd(platform, result)}>
          Add
        </Button>
      </div>
    </div>
  );
}
