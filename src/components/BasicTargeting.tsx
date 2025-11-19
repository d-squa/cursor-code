import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, Search } from "lucide-react";
import { toast } from "sonner";
import { MultiSelect } from "@/components/ui/multi-select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export interface BasicTargetingConfig {
  ageMin?: number;
  ageMax?: number;
  genders?: string[];
  devices?: string[];
  os?: string[];
  languages?: string[];
  productBrief?: string;
  aiInterests?: Array<{id: string, name: string, audienceSize?: number}>;
  aiBehaviors?: Array<{id: string, name: string, audienceSize?: number}>;
  aiDemographics?: Array<{id: string, name: string, audienceSize?: number}>;
}

interface BasicTargetingProps {
  targeting: BasicTargetingConfig;
  onUpdate: (targeting: BasicTargetingConfig) => void;
  adAccountId?: string;
}

interface TargetingOption {
  id?: string;
  key?: number;
  name: string;
}

export function BasicTargeting({ targeting, onUpdate, adAccountId }: BasicTargetingProps) {
  const [loading, setLoading] = useState(false);
  const [genderOptions, setGenderOptions] = useState<TargetingOption[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<TargetingOption[]>([]);
  const [osOptions, setOsOptions] = useState<TargetingOption[]>([]);
  const [languageOptions, setLanguageOptions] = useState<TargetingOption[]>([]);
  const [ageOptions, setAgeOptions] = useState<TargetingOption[]>([]);
  
  // AI recommendations state
  const [generatingAI, setGeneratingAI] = useState(false);
  const [recommendedInterests, setRecommendedInterests] = useState<Array<{id: string, name: string, audienceSize?: number, selected: boolean}>>([]);
  const [recommendedBehaviors, setRecommendedBehaviors] = useState<Array<{id: string, name: string, audienceSize?: number, selected: boolean}>>([]);
  const [recommendedDemographics, setRecommendedDemographics] = useState<Array<{id: string, name: string, audienceSize?: number, selected: boolean}>>([]);
  
  // Search state
  const [searchType, setSearchType] = useState<'interests' | 'behaviors' | 'demographics'>('interests');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{id: string, name: string, audienceSize?: number}>>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadTargetingOptions();
  }, []);

  // Initialize recommendations from saved targeting data
  const prevTargetingRef = useRef<BasicTargetingConfig>({});
  
  useEffect(() => {
    const prev = prevTargetingRef.current;
    
    // Only update if targeting data has changed and recommendations are empty or different
    if (targeting.aiInterests && targeting.aiInterests.length > 0 && 
        JSON.stringify(prev.aiInterests) !== JSON.stringify(targeting.aiInterests) &&
        recommendedInterests.length === 0) {
      setRecommendedInterests(targeting.aiInterests.map(item => ({ ...item, selected: true })));
    }
    
    if (targeting.aiBehaviors && targeting.aiBehaviors.length > 0 && 
        JSON.stringify(prev.aiBehaviors) !== JSON.stringify(targeting.aiBehaviors) &&
        recommendedBehaviors.length === 0) {
      setRecommendedBehaviors(targeting.aiBehaviors.map(item => ({ ...item, selected: true })));
    }
    
    if (targeting.aiDemographics && targeting.aiDemographics.length > 0 && 
        JSON.stringify(prev.aiDemographics) !== JSON.stringify(targeting.aiDemographics) &&
        recommendedDemographics.length === 0) {
      setRecommendedDemographics(targeting.aiDemographics.map(item => ({ ...item, selected: true })));
    }
    
    prevTargetingRef.current = targeting;
  }, [targeting]);

  const loadTargetingOptions = async () => {
    setLoading(true);
    try {
      // Load all targeting options in parallel
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

      console.log('✅ Basic Targeting Options Loaded:', {
        genders: genders.length,
        devices: devices.length,
        os: os.length,
        languages: languages.length,
        ages: ages.length,
        sampleLanguage: languages[0]
      });

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
    onUpdate(updated);
    
    console.log('📝 Basic Targeting Updated:', {
      field,
      value,
      fullTargeting: updated
    });
  };

  const handleGenerateRecommendations = async () => {
    if (!targeting.productBrief?.trim()) {
      toast.error('Please enter a product brief');
      return;
    }
    if (!adAccountId) {
      toast.error('Ad account not selected');
      return;
    }

    setGeneratingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-audience-recommendations', {
        body: { brief: targeting.productBrief, adAccountId }
      });

      if (error) throw error;

      const interests = data.interests?.map((item: any) => ({
        id: item.id,
        name: item.name,
        audienceSize: item.audienceSize,
        selected: true
      })) || [];

      const behaviors = data.behaviors?.map((item: any) => ({
        id: item.id,
        name: item.name,
        audienceSize: item.audienceSize,
        selected: true
      })) || [];

      setRecommendedInterests(interests);
      setRecommendedBehaviors(behaviors);
      
      toast.success('AI recommendations generated!');
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
    if (!adAccountId) {
      toast.error('Ad account not selected');
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-meta-targeting', {
        body: { query: searchQuery, type: searchType, adAccountId }
      });

      if (error) throw error;

      setSearchResults(data.results || []);
    } catch (error: any) {
      console.error('Error searching:', error);
      toast.error(error.message || 'Failed to search');
    } finally {
      setSearching(false);
    }
  };

  const handleToggleRecommendation = (type: 'interests' | 'behaviors' | 'demographics', id: string) => {
    if (type === 'interests') {
      setRecommendedInterests(prev => prev.map(item => 
        item.id === id ? { ...item, selected: !item.selected } : item
      ));
    } else if (type === 'behaviors') {
      setRecommendedBehaviors(prev => prev.map(item => 
        item.id === id ? { ...item, selected: !item.selected } : item
      ));
    } else {
      setRecommendedDemographics(prev => prev.map(item => 
        item.id === id ? { ...item, selected: !item.selected } : item
      ));
    }
  };

  const handleAddSearchResult = (result: any) => {
    if (searchType === 'interests') {
      setRecommendedInterests(prev => [...prev, { ...result, selected: true }]);
    } else if (searchType === 'behaviors') {
      setRecommendedBehaviors(prev => [...prev, { ...result, selected: true }]);
    } else {
      setRecommendedDemographics(prev => [...prev, { ...result, selected: true }]);
    }
    setSearchResults(prev => prev.filter(r => r.id !== result.id));
  };

  const handleAddAllSearchResults = () => {
    if (searchType === 'interests') {
      setRecommendedInterests(prev => [...prev, ...searchResults.map(r => ({ ...r, selected: true }))]);
    } else if (searchType === 'behaviors') {
      setRecommendedBehaviors(prev => [...prev, ...searchResults.map(r => ({ ...r, selected: true }))]);
    } else {
      setRecommendedDemographics(prev => [...prev, ...searchResults.map(r => ({ ...r, selected: true }))]);
    }
    setSearchResults([]);
    toast.success('All results added');
  };

  const handleSelectAllRecommendations = (type: 'interests' | 'behaviors' | 'demographics') => {
    if (type === 'interests') {
      setRecommendedInterests(prev => prev.map(item => ({ ...item, selected: true })));
    } else if (type === 'behaviors') {
      setRecommendedBehaviors(prev => prev.map(item => ({ ...item, selected: true })));
    } else {
      setRecommendedDemographics(prev => prev.map(item => ({ ...item, selected: true })));
    }
  };

  const handleDeselectAllRecommendations = (type: 'interests' | 'behaviors' | 'demographics') => {
    if (type === 'interests') {
      setRecommendedInterests(prev => prev.map(item => ({ ...item, selected: false })));
    } else if (type === 'behaviors') {
      setRecommendedBehaviors(prev => prev.map(item => ({ ...item, selected: false })));
    } else {
      setRecommendedDemographics(prev => prev.map(item => ({ ...item, selected: false })));
    }
  };

  // Update targeting config when recommendations change
  useEffect(() => {
    const selectedInterests = recommendedInterests.filter(i => i.selected).map(i => ({ id: i.id, name: i.name, audienceSize: i.audienceSize }));
    const selectedBehaviors = recommendedBehaviors.filter(b => b.selected).map(b => ({ id: b.id, name: b.name, audienceSize: b.audienceSize }));
    const selectedDemographics = recommendedDemographics.filter(d => d.selected).map(d => ({ id: d.id, name: d.name, audienceSize: d.audienceSize }));
    
    updateField('aiInterests', selectedInterests);
    updateField('aiBehaviors', selectedBehaviors);
    updateField('aiDemographics', selectedDemographics);
  }, [recommendedInterests, recommendedBehaviors, recommendedDemographics]);

  const handleMultiSelectWithAll = (field: keyof BasicTargetingConfig, newValues: string[]) => {
    const previousValues = (targeting[field] as string[]) || [];
    
    // Filter out any undefined/null values
    const cleanNewValues = newValues.filter(v => v !== undefined && v !== null && v !== '');
    
    console.log('🔍 Multi-select change:', {
      field,
      previousValues,
      newValues,
      cleanNewValues,
      hasAllInNew: cleanNewValues.includes('all'),
      hasAllInPrevious: previousValues.includes('all')
    });
    
    let finalValues: string[];
    
    // If no valid values after cleaning
    if (cleanNewValues.length === 0) {
      console.log('✅ All options deselected or invalid');
      finalValues = [];
    }
    // If "all" was just added (not in previous, but in new)
    else if (cleanNewValues.includes('all') && !previousValues.includes('all')) {
      console.log('✅ "All" selected - clearing other options');
      finalValues = ['all'];
    }
    // If "all" was previously selected and other options are being added
    else if (previousValues.includes('all') && cleanNewValues.length > 1 && cleanNewValues.includes('all')) {
      console.log('✅ Specific option selected - removing "All"');
      finalValues = cleanNewValues.filter(v => v !== 'all');
    }
    // Normal update
    else {
      console.log('✅ Normal multi-select update');
      finalValues = cleanNewValues;
    }
    
    console.log('📝 Final values:', finalValues);
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
        <CardTitle>Basic Targeting</CardTitle>
        <CardDescription>
          Define core demographics that will apply to all campaigns as a starting point. 
          You can override these selections per campaign phase later in the strategy configuration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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

        {/* AI-Powered Audience Recommendations */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI-Powered Audience Recommendations
            </CardTitle>
            <CardDescription>
              Describe your product or service to get AI-powered interest and behavior recommendations
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
              disabled={generatingAI || !targeting.productBrief?.trim() || !adAccountId}
              className="w-full"
            >
              {generatingAI ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Recommendations...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate AI Recommendations
                </>
              )}
            </Button>

            {/* Display Recommended Interests */}
            {recommendedInterests.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Recommended Interests</Label>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleSelectAllRecommendations('interests')}
                    >
                      Select All
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleDeselectAllRecommendations('interests')}
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recommendedInterests.map((interest) => (
                    <div key={interest.id} className="flex items-center justify-between p-2 bg-background rounded">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={interest.selected}
                          onCheckedChange={() => handleToggleRecommendation('interests', interest.id)}
                        />
                        <span className="text-sm">{interest.name}</span>
                      </div>
                      {interest.audienceSize && (
                        <Badge variant="secondary" className="text-xs">
                          {interest.audienceSize.toLocaleString()} people
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Display Recommended Behaviors */}
            {recommendedBehaviors.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Recommended Behaviors</Label>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleSelectAllRecommendations('behaviors')}
                    >
                      Select All
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleDeselectAllRecommendations('behaviors')}
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recommendedBehaviors.map((behavior) => (
                    <div key={behavior.id} className="flex items-center justify-between p-2 bg-background rounded">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={behavior.selected}
                          onCheckedChange={() => handleToggleRecommendation('behaviors', behavior.id)}
                        />
                        <span className="text-sm">{behavior.name}</span>
                      </div>
                      {behavior.audienceSize && (
                        <Badge variant="secondary" className="text-xs">
                          {behavior.audienceSize.toLocaleString()} people
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Display Recommended Demographics */}
            {recommendedDemographics.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Recommended Demographics</Label>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleSelectAllRecommendations('demographics')}
                    >
                      Select All
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleDeselectAllRecommendations('demographics')}
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recommendedDemographics.map((demographic) => (
                    <div key={demographic.id} className="flex items-center justify-between p-2 bg-background rounded">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={demographic.selected}
                          onCheckedChange={() => handleToggleRecommendation('demographics', demographic.id)}
                        />
                        <span className="text-sm">{demographic.name}</span>
                      </div>
                      {demographic.audienceSize && (
                        <Badge variant="secondary" className="text-xs">
                          {demographic.audienceSize.toLocaleString()} people
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Search Additional Audiences */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Search Additional Audiences
            </CardTitle>
            <CardDescription>
              Search for specific interests or behaviors to add to your targeting
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
                    <SelectItem value="behaviors">Behaviors</SelectItem>
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
                    disabled={searching || !searchQuery.trim() || !adAccountId}
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

            {/* Display Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Search Results</Label>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleAddAllSearchResults}
                  >
                    Add All
                  </Button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {searchResults.map((result) => (
                    <div key={result.id} className="flex items-center justify-between p-2 bg-background rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{result.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {result.audienceSize && (
                          <Badge variant="secondary" className="text-xs">
                            {result.audienceSize.toLocaleString()} people
                          </Badge>
                        )}
                        <Button size="sm" onClick={() => handleAddSearchResult(result)}>
                          Add
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
