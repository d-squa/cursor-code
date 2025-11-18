import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MultiSelect } from "@/components/ui/multi-select";

export interface BasicTargetingConfig {
  ageMin?: number;
  ageMax?: number;
  genders?: string[];
  devices?: string[];
  os?: string[];
  languages?: string[];
}

interface BasicTargetingProps {
  targeting: BasicTargetingConfig;
  onUpdate: (targeting: BasicTargetingConfig) => void;
}

interface TargetingOption {
  id?: string;
  key?: number;
  name: string;
}

export function BasicTargeting({ targeting, onUpdate }: BasicTargetingProps) {
  const [loading, setLoading] = useState(false);
  const [genderOptions, setGenderOptions] = useState<TargetingOption[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<TargetingOption[]>([]);
  const [osOptions, setOsOptions] = useState<TargetingOption[]>([]);
  const [languageOptions, setLanguageOptions] = useState<TargetingOption[]>([]);
  const [ageOptions, setAgeOptions] = useState<TargetingOption[]>([]);

  useEffect(() => {
    loadTargetingOptions();
  }, []);

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
      </CardContent>
    </Card>
  );
}
