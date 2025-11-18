import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface BasicTargetingConfig {
  ageMin?: number;
  ageMax?: number;
  gender?: string;
  device?: string;
  os?: string;
  language?: string;
}

interface BasicTargetingProps {
  targeting: BasicTargetingConfig;
  onUpdate: (targeting: BasicTargetingConfig) => void;
}

interface TargetingOption {
  id: string;
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
        ages: ages.length
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
          <Label htmlFor="gender">Gender</Label>
          <Select
            value={targeting.gender || 'all'}
            onValueChange={(value) => updateField('gender', value)}
          >
            <SelectTrigger id="gender">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">All</SelectItem>
              {genderOptions.map((gender) => (
                <SelectItem key={gender.id} value={gender.id}>
                  {gender.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Language */}
        <div className="space-y-2">
          <Label htmlFor="language">Language</Label>
          <Select
            value={targeting.language || 'all'}
            onValueChange={(value) => updateField('language', value)}
          >
            <SelectTrigger id="language">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">All</SelectItem>
              {languageOptions.map((lang) => (
                <SelectItem key={lang.id} value={lang.id}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Device */}
        <div className="space-y-2">
          <Label htmlFor="device">Device</Label>
          <Select
            value={targeting.device || 'all'}
            onValueChange={(value) => updateField('device', value)}
          >
            <SelectTrigger id="device">
              <SelectValue placeholder="Select device" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">All</SelectItem>
              {deviceOptions.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  {device.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Operating System */}
        <div className="space-y-2">
          <Label htmlFor="os">Operating System</Label>
          <Select
            value={targeting.os || 'all'}
            onValueChange={(value) => updateField('os', value)}
          >
            <SelectTrigger id="os">
              <SelectValue placeholder="Select operating system" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">All</SelectItem>
              {osOptions.map((os) => (
                <SelectItem key={os.id} value={os.id}>
                  {os.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
