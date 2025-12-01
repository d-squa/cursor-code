import { useState, useEffect, useRef } from "react";
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
  
  // Track if we've initialized recommendations from saved targeting
  const hasInitialized = useRef(false);
  
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
  
  // Cross-platform search (all categories)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    meta: {
      interests: TargetingParameter[];
      behaviors: TargetingParameter[];
      demographics: TargetingParameter[];
    };
    tiktok: {
      interests: TargetingParameter[];
      behaviors: TargetingParameter[];
      purchaseIntention: TargetingParameter[];
      videoInteractions: TargetingParameter[];
    };
    matches: Array<{ meta: TargetingParameter; tiktok: TargetingParameter; score: number }>;
  }>({ 
    meta: { interests: [], behaviors: [], demographics: [] },
    tiktok: { interests: [], behaviors: [], purchaseIntention: [], videoInteractions: [] },
    matches: [] 
  });
  const [searching, setSearching] = useState(false);
  
  // Validation warnings
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  useEffect(() => {
    loadTargetingOptions();
  }, []);

  // Track if we're currently in initialization phase
  const isInitializing = useRef(false);
  
  // Initialize recommendations from saved targeting data
  useEffect(() => {
    // Check if we have saved data
    const hasSavedData = (
      (targeting.metaInterests?.length || 0) > 0 ||
      (targeting.tiktokInterests?.length || 0) > 0 ||
      (targeting.metaBehaviors?.length || 0) > 0 ||
      (targeting.tiktokBehaviors?.length || 0) > 0 ||
      (targeting.metaDemographics?.length || 0) > 0 ||
      (targeting.tiktokDemographics?.length || 0) > 0
    );
    
    if (!hasSavedData) {
      // Reset if no data and we were previously initialized
      if (hasInitialized.current) {
        hasInitialized.current = false;
        setAiRecommendations({
          meta: { interests: [], behaviors: [], demographics: [] },
          tiktok: { interests: [], behaviors: [], demographics: [] },
          matches: []
        });
      }
      return;
    }
    
    // Skip if already initialized to prevent flickering
    if (hasInitialized.current) return;
    
    // Mark as initializing
    isInitializing.current = true;
    hasInitialized.current = true;
    
    // Restore saved selections only once
    setAiRecommendations({
      meta: {
        interests: (targeting.metaInterests || []).map(i => ({ ...i, selected: true })),
        behaviors: (targeting.metaBehaviors || []).map(b => ({ ...b, selected: true })),
        demographics: (targeting.metaDemographics || []).map(d => ({ ...d, selected: true }))
      },
      tiktok: {
        interests: (targeting.tiktokInterests || []).map(i => ({ ...i, selected: true })),
        behaviors: (targeting.tiktokBehaviors || []).map(b => ({ ...b, selected: true })),
        demographics: (targeting.tiktokDemographics || []).map(d => ({ ...d, selected: true }))
      },
      matches: []
    });
    
    // Clear initializing flag after state update
    setTimeout(() => {
      isInitializing.current = false;
    }, 0);
  }, [
    targeting.metaInterests, 
    targeting.tiktokInterests, 
    targeting.metaBehaviors, 
    targeting.tiktokBehaviors,
    targeting.metaDemographics,
    targeting.tiktokDemographics
  ]);

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
          metaAdAccountId,
          tiktokAdvertiserId
        }
      });

      if (error) throw error;

      setSearchResults({
        meta: data.meta || { interests: [], behaviors: [], demographics: [] },
        tiktok: data.tiktok || { interests: [], behaviors: [], purchaseIntention: [], videoInteractions: [] },
        matches: data.matches || []
      });
      
      const totalMeta = (data.meta?.interests?.length || 0) + (data.meta?.behaviors?.length || 0) + (data.meta?.demographics?.length || 0);
      const totalTiktok = (data.tiktok?.interests?.length || 0) + (data.tiktok?.behaviors?.length || 0) + (data.tiktok?.purchaseIntention?.length || 0) + (data.tiktok?.videoInteractions?.length || 0);
      
      toast.success(`Found ${totalMeta} Meta and ${totalTiktok} TikTok results across all categories`);
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

  const handleAddSearchResult = (platform: 'meta' | 'tiktok', category: string, result: TargetingParameter) => {
    // Map search categories to targeting types
    const categoryMap: Record<string, 'interests' | 'behaviors' | 'demographics'> = {
      'interests': 'interests',
      'behaviors': 'behaviors',
      'demographics': 'demographics',
      'purchase_intention': 'behaviors',
      'video_interactions': 'interests'
    };
    
    const targetType = categoryMap[category] || 'interests';
    
    setAiRecommendations(prev => {
      const currentList = prev[platform][targetType];
      if (currentList.some((item: any) => item.id === result.id)) {
        toast.info(`Already added to ${platform} ${targetType}`);
        return prev;
      }
      
      return {
        ...prev,
        [platform]: {
          ...prev[platform],
          [targetType]: [...currentList, { ...result, selected: true }]
        }
      };
    });
    
    toast.success(`Added to ${platform} ${targetType}`);
  };

  const handleRemoveSearchResult = (platform: 'meta' | 'tiktok', category: string, result: TargetingParameter) => {
    const categoryMap: Record<string, 'interests' | 'behaviors' | 'demographics'> = {
      'interests': 'interests',
      'behaviors': 'behaviors',
      'demographics': 'demographics',
      'purchase_intention': 'behaviors',
      'video_interactions': 'interests'
    };
    
    const targetType = categoryMap[category] || 'interests';
    
    setAiRecommendations(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [targetType]: prev[platform][targetType].filter((item: any) => item.id !== result.id)
      }
    }));
    
    toast.success(`Removed from ${platform} ${targetType}`);
  };

  const handleSelectAllSearch = (platform: 'meta' | 'tiktok') => {
    if (platform === 'meta') {
      const allResults = [
        ...searchResults.meta.interests,
        ...searchResults.meta.behaviors,
        ...searchResults.meta.demographics
      ];
      
      allResults.forEach(result => {
        const category = searchResults.meta.interests.includes(result) ? 'interests' :
                        searchResults.meta.behaviors.includes(result) ? 'behaviors' : 'demographics';
        handleAddSearchResult(platform, category, result);
      });
    } else {
      const allResults = [
        ...searchResults.tiktok.interests,
        ...searchResults.tiktok.behaviors,
        ...searchResults.tiktok.purchaseIntention,
        ...searchResults.tiktok.videoInteractions
      ];
      
      allResults.forEach(result => {
        const category = searchResults.tiktok.interests.includes(result) ? 'interests' :
                        searchResults.tiktok.behaviors.includes(result) ? 'behaviors' :
                        searchResults.tiktok.purchaseIntention.includes(result) ? 'purchase_intention' : 'video_interactions';
        handleAddSearchResult(platform, category, result);
      });
    }
  };

  const handleDeselectAllSearch = (platform: 'meta' | 'tiktok') => {
    if (platform === 'meta') {
      const allResults = [
        ...searchResults.meta.interests,
        ...searchResults.meta.behaviors,
        ...searchResults.meta.demographics
      ];
      
      allResults.forEach(result => {
        const category = searchResults.meta.interests.includes(result) ? 'interests' :
                        searchResults.meta.behaviors.includes(result) ? 'behaviors' : 'demographics';
        handleRemoveSearchResult(platform, category, result);
      });
    } else {
      const allResults = [
        ...searchResults.tiktok.interests,
        ...searchResults.tiktok.behaviors,
        ...searchResults.tiktok.purchaseIntention,
        ...searchResults.tiktok.videoInteractions
      ];
      
      allResults.forEach(result => {
        const category = searchResults.tiktok.interests.includes(result) ? 'interests' :
                        searchResults.tiktok.behaviors.includes(result) ? 'behaviors' :
                        searchResults.tiktok.purchaseIntention.includes(result) ? 'purchase_intention' : 'video_interactions';
        handleRemoveSearchResult(platform, category, result);
      });
    }
  };

  const isResultAdded = (platform: 'meta' | 'tiktok', category: string, resultId: string): boolean => {
    const categoryMap: Record<string, 'interests' | 'behaviors' | 'demographics'> = {
      'interests': 'interests',
      'behaviors': 'behaviors',
      'demographics': 'demographics',
      'purchase_intention': 'behaviors',
      'video_interactions': 'interests'
    };
    
    const targetType = categoryMap[category] || 'interests';
    return aiRecommendations[platform][targetType].some((item: any) => item.id === resultId);
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

  // Update targeting config when recommendations change (but skip during initialization)
  useEffect(() => {
    // Skip update if we're in the middle of initializing from saved data
    if (isInitializing.current) return;
    
    const metaInterests = aiRecommendations.meta.interests.filter(i => i.selected).map(({ selected, ...rest }) => rest);
    const metaBehaviors = aiRecommendations.meta.behaviors.filter(b => b.selected).map(({ selected, ...rest }) => rest);
    const metaDemographics = aiRecommendations.meta.demographics.filter(d => d.selected).map(({ selected, ...rest }) => rest);
    
    const tiktokInterests = aiRecommendations.tiktok.interests.filter(i => i.selected).map(({ selected, ...rest }) => rest);
    const tiktokBehaviors = aiRecommendations.tiktok.behaviors.filter(b => b.selected).map(({ selected, ...rest }) => rest);
    const tiktokDemographics = aiRecommendations.tiktok.demographics.filter(d => d.selected).map(({ selected, ...rest }) => rest);
    
    // Only update if something actually changed
    const hasChanges = (
      JSON.stringify(metaInterests) !== JSON.stringify(targeting.metaInterests || []) ||
      JSON.stringify(metaBehaviors) !== JSON.stringify(targeting.metaBehaviors || []) ||
      JSON.stringify(metaDemographics) !== JSON.stringify(targeting.metaDemographics || []) ||
      JSON.stringify(tiktokInterests) !== JSON.stringify(targeting.tiktokInterests || []) ||
      JSON.stringify(tiktokBehaviors) !== JSON.stringify(targeting.tiktokBehaviors || []) ||
      JSON.stringify(tiktokDemographics) !== JSON.stringify(targeting.tiktokDemographics || [])
    );
    
    if (hasChanges) {
      onUpdate({
        ...targeting,
        metaInterests,
        metaBehaviors,
        metaDemographics,
        tiktokInterests,
        tiktokBehaviors,
        tiktokDemographics
      });
    }
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
              <Tabs 
                value={tiktokAdvertiserId && !metaAdAccountId ? "tiktok" : metaAdAccountId && !tiktokAdvertiserId ? "meta" : "meta"} 
                className="w-full"
              >
                {metaAdAccountId && tiktokAdvertiserId ? (
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="meta">
                      Meta ({aiRecommendations.meta.interests.filter(i => i.selected).length + aiRecommendations.meta.behaviors.filter(b => b.selected).length + aiRecommendations.meta.demographics.filter(d => d.selected).length}/{aiRecommendations.meta.interests.length + aiRecommendations.meta.behaviors.length + aiRecommendations.meta.demographics.length})
                    </TabsTrigger>
                    <TabsTrigger value="tiktok">
                      TikTok ({aiRecommendations.tiktok.interests.filter(i => i.selected).length + aiRecommendations.tiktok.behaviors.filter(b => b.selected).length}/{aiRecommendations.tiktok.interests.length + aiRecommendations.tiktok.behaviors.length})
                    </TabsTrigger>
                    <TabsTrigger value="matches">
                      Matches ({aiRecommendations.matches.length})
                    </TabsTrigger>
                  </TabsList>
                ) : metaAdAccountId ? (
                  <TabsList className="w-full">
                    <TabsTrigger value="meta" className="flex-1">
                      Meta Recommendations ({aiRecommendations.meta.interests.filter(i => i.selected).length + aiRecommendations.meta.behaviors.filter(b => b.selected).length + aiRecommendations.meta.demographics.filter(d => d.selected).length}/{aiRecommendations.meta.interests.length + aiRecommendations.meta.behaviors.length + aiRecommendations.meta.demographics.length})
                    </TabsTrigger>
                  </TabsList>
                ) : tiktokAdvertiserId ? (
                  <TabsList className="w-full">
                    <TabsTrigger value="tiktok" className="flex-1">
                      TikTok Recommendations ({aiRecommendations.tiktok.interests.filter(i => i.selected).length + aiRecommendations.tiktok.behaviors.filter(b => b.selected).length}/{aiRecommendations.tiktok.interests.length + aiRecommendations.tiktok.behaviors.length})
                    </TabsTrigger>
                  </TabsList>
                ) : null}
                
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

                {/* Cross-Platform Matches - only show when both platforms are available */}
                {metaAdAccountId && tiktokAdvertiserId && (
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
                )}
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
              Search across all categories (interests, behaviors, demographics, purchase intention, video interactions) on Meta and TikTok
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Search Query</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., fitness, digital marketing, pets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
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

            {/* Search Results - Grouped by Category */}
            {(Object.values(searchResults.meta).some(arr => arr.length > 0) || Object.values(searchResults.tiktok).some(arr => arr.length > 0)) && (
              <Tabs defaultValue={metaAdAccountId ? "meta" : "tiktok"} className="w-full">
                {metaAdAccountId && tiktokAdvertiserId ? (
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="meta">
                      Meta ({(searchResults.meta.interests.length + searchResults.meta.behaviors.length + searchResults.meta.demographics.length)})
                    </TabsTrigger>
                    <TabsTrigger value="tiktok">
                      TikTok ({(searchResults.tiktok.interests.length + searchResults.tiktok.behaviors.length + searchResults.tiktok.purchaseIntention.length + searchResults.tiktok.videoInteractions.length)})
                    </TabsTrigger>
                  </TabsList>
                ) : metaAdAccountId ? (
                  <TabsList className="w-full">
                    <TabsTrigger value="meta" className="flex-1">
                      Meta Results ({(searchResults.meta.interests.length + searchResults.meta.behaviors.length + searchResults.meta.demographics.length)})
                    </TabsTrigger>
                  </TabsList>
                ) : (
                  <TabsList className="w-full">
                    <TabsTrigger value="tiktok" className="flex-1">
                      TikTok Results ({(searchResults.tiktok.interests.length + searchResults.tiktok.behaviors.length + searchResults.tiktok.purchaseIntention.length + searchResults.tiktok.videoInteractions.length)})
                    </TabsTrigger>
                  </TabsList>
                )}
                
                <TabsContent value="meta" className="space-y-4 mt-4">
                  <div className="flex justify-end gap-2 mb-4">
                    <Button variant="outline" size="sm" onClick={() => handleSelectAllSearch('meta')}>
                      Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeselectAllSearch('meta')}>
                      Deselect All
                    </Button>
                  </div>
                  {searchResults.meta.interests.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Interests</Label>
                      <div className="space-y-2">
                        {searchResults.meta.interests.map((result) => (
                          <SearchResultItem
                            key={result.id}
                            result={result}
                            platform="meta"
                            category="interests"
                            isAdded={isResultAdded('meta', 'interests', result.id)}
                            onAdd={handleAddSearchResult}
                            onRemove={handleRemoveSearchResult}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {searchResults.meta.behaviors.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Behaviors</Label>
                      <div className="space-y-2">
                        {searchResults.meta.behaviors.map((result) => (
                          <SearchResultItem
                            key={result.id}
                            result={result}
                            platform="meta"
                            category="behaviors"
                            isAdded={isResultAdded('meta', 'behaviors', result.id)}
                            onAdd={handleAddSearchResult}
                            onRemove={handleRemoveSearchResult}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {searchResults.meta.demographics.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Demographics</Label>
                      <div className="space-y-2">
                        {searchResults.meta.demographics.map((result) => (
                          <SearchResultItem
                            key={result.id}
                            result={result}
                            platform="meta"
                            category="demographics"
                            isAdded={isResultAdded('meta', 'demographics', result.id)}
                            onAdd={handleAddSearchResult}
                            onRemove={handleRemoveSearchResult}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="tiktok" className="space-y-4 mt-4">
                  <div className="flex justify-end gap-2 mb-4">
                    <Button variant="outline" size="sm" onClick={() => handleSelectAllSearch('tiktok')}>
                      Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeselectAllSearch('tiktok')}>
                      Deselect All
                    </Button>
                  </div>
                  {searchResults.tiktok.interests.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Interests</Label>
                      <div className="space-y-2">
                        {searchResults.tiktok.interests.map((result) => (
                          <SearchResultItem
                            key={result.id}
                            result={result}
                            platform="tiktok"
                            category="interests"
                            isAdded={isResultAdded('tiktok', 'interests', result.id)}
                            onAdd={handleAddSearchResult}
                            onRemove={handleRemoveSearchResult}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {searchResults.tiktok.behaviors.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Behaviors</Label>
                      <div className="space-y-2">
                        {searchResults.tiktok.behaviors.map((result) => (
                          <SearchResultItem
                            key={result.id}
                            result={result}
                            platform="tiktok"
                            category="behaviors"
                            isAdded={isResultAdded('tiktok', 'behaviors', result.id)}
                            onAdd={handleAddSearchResult}
                            onRemove={handleRemoveSearchResult}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {searchResults.tiktok.purchaseIntention.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Purchase Intention</Label>
                      <div className="space-y-2">
                        {searchResults.tiktok.purchaseIntention.map((result) => (
                          <SearchResultItem
                            key={result.id}
                            result={result}
                            platform="tiktok"
                            category="purchase_intention"
                            isAdded={isResultAdded('tiktok', 'purchase_intention', result.id)}
                            onAdd={handleAddSearchResult}
                            onRemove={handleRemoveSearchResult}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {searchResults.tiktok.videoInteractions.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Video Interactions</Label>
                      <div className="space-y-2">
                        {searchResults.tiktok.videoInteractions.map((result) => (
                          <SearchResultItem
                            key={result.id}
                            result={result}
                            platform="tiktok"
                            category="video_interactions"
                            isAdded={isResultAdded('tiktok', 'video_interactions', result.id)}
                            onAdd={handleAddSearchResult}
                            onRemove={handleRemoveSearchResult}
                          />
                        ))}
                      </div>
                    </div>
                  )}
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
  category,
  isAdded,
  onAdd,
  onRemove
}: {
  result: TargetingParameter;
  platform: 'meta' | 'tiktok';
  category: string;
  isAdded: boolean;
  onAdd: (platform: 'meta' | 'tiktok', category: string, result: TargetingParameter) => void;
  onRemove: (platform: 'meta' | 'tiktok', category: string, result: TargetingParameter) => void;
}) {
  return (
    <div className="flex items-center justify-between p-2 bg-background rounded">
      <div className="flex items-center gap-2 flex-1">
        <Badge 
          variant="outline" 
          className={platform === 'meta' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-black text-white border-black'}
        >
          {platform === 'meta' ? 'Meta' : 'TikTok'}
        </Badge>
        <span className="text-sm">{result.name}</span>
      </div>
      <div className="flex items-center gap-2">
        {result.audienceSize && (
          <Badge variant="secondary" className="text-xs">
            {result.audienceSize.toLocaleString()} people
          </Badge>
        )}
        {isAdded ? (
          <Button 
            size="sm" 
            variant="destructive"
            onClick={() => onRemove(platform, category, result)}
          >
            Remove
          </Button>
        ) : (
          <Button size="sm" onClick={() => onAdd(platform, category, result)}>
            Add
          </Button>
        )}
      </div>
    </div>
  );
}
