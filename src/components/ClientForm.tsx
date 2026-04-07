import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { INDUSTRIES, BUSINESS_OBJECTIVES } from "@/utils/clientOptions";
import { PLATFORM_OPTIONS } from "@/utils/platformOptions";
import { MARKET_OPTIONS } from "@/utils/markets";
import { MultiSelect } from "@/components/ui/multi-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEVICE_OPTIONS, LANGUAGE_OPTIONS, GENDER_OPTIONS, AGE_OPTIONS } from "@/utils/targetingOptions";

interface ClientFormData {
  name: string;
  website: string;
  app_name: string;
  industry: string;
  business_objective: string;
  platforms: string[];
  markets: string[];
  default_age_min?: number;
  default_age_max?: number;
  default_gender?: string;
  default_devices?: string[];
  default_languages?: string[];
  client_logo_url?: string | null;
  agency_logo_url?: string | null;
  brand_font_color?: string | null;
  brand_background_color?: string | null;
  brand_foreground_color?: string | null;
}

interface Props {
  initialData?: Partial<ClientFormData>;
  onSubmit: (data: ClientFormData) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export default function ClientForm({ initialData, onSubmit, onCancel, submitLabel = "Save Client" }: Props) {
  const [formData, setFormData] = useState<ClientFormData>({
    name: initialData?.name || "",
    website: initialData?.website || "",
    app_name: initialData?.app_name || "",
    industry: initialData?.industry || "",
    business_objective: initialData?.business_objective || "",
    platforms: (initialData as any)?.platforms || [],
    markets: (initialData as any)?.markets || [],
    default_age_min: (initialData as any)?.default_age_min ?? 18,
    default_age_max: (initialData as any)?.default_age_max ?? 65,
    default_gender: (initialData as any)?.default_gender || "all",
    default_devices: (initialData as any)?.default_devices || [],
    default_languages: (initialData as any)?.default_languages || [],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        website: initialData.website || "",
        app_name: initialData.app_name || "",
        industry: initialData.industry || "",
        business_objective: initialData.business_objective || "",
        platforms: (initialData as any)?.platforms || [],
        markets: (initialData as any)?.markets || [],
        default_age_min: (initialData as any)?.default_age_min ?? 18,
        default_age_max: (initialData as any)?.default_age_max ?? 65,
        default_gender: (initialData as any)?.default_gender || "all",
        default_devices: (initialData as any)?.default_devices || [],
        default_languages: (initialData as any)?.default_languages || [],
      });
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.industry || !formData.business_objective) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">
          Client Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter client name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="website">Website</Label>
        <Input
          id="website"
          type="url"
          value={formData.website}
          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
          placeholder="https://example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="app_name">App Name</Label>
        <Input
          id="app_name"
          value={formData.app_name}
          onChange={(e) => setFormData({ ...formData, app_name: e.target.value })}
          placeholder="Enter app name (if applicable)"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="industry">
          Industry <span className="text-destructive">*</span>
        </Label>
        <Select value={formData.industry} onValueChange={(value) => setFormData({ ...formData, industry: value })}>
          <SelectTrigger id="industry">
            <SelectValue placeholder="Select industry" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((industry) => (
              <SelectItem key={industry} value={industry}>
                {industry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="business_objective">
          Business Objective <span className="text-destructive">*</span>
        </Label>
        <Select
          value={formData.business_objective}
          onValueChange={(value) => setFormData({ ...formData, business_objective: value })}
        >
          <SelectTrigger id="business_objective">
            <SelectValue placeholder="Select business objective" />
          </SelectTrigger>
          <SelectContent>
            {BUSINESS_OBJECTIVES.map((objective) => (
              <SelectItem key={objective} value={objective}>
                {objective}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="platforms">
          Platforms <span className="text-destructive">*</span>
        </Label>
        <MultiSelect
          options={PLATFORM_OPTIONS.map(p => ({ value: p.value, label: p.label }))}
          value={formData.platforms}
          onChange={(values) => setFormData({ ...formData, platforms: values })}
          placeholder="Select platforms"
          emptyText="No platforms found"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="markets">
          Markets <span className="text-destructive">*</span>
        </Label>
        <MultiSelect
          options={MARKET_OPTIONS.map(m => ({ value: m.value, label: m.label }))}
          value={formData.markets}
          onChange={(values) => setFormData({ ...formData, markets: values })}
          placeholder="Select markets"
          emptyText="No markets found"
        />
        <p className="text-xs text-muted-foreground">
          Markets where this client operates
        </p>
      </div>

      {/* Default Targeting Section */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Default Targeting</CardTitle>
          <p className="text-xs text-muted-foreground">
            These targeting defaults will apply to all campaigns for this client
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Age Min</Label>
              <Select
                value={String(formData.default_age_min || 18)}
                onValueChange={(value) => setFormData({ ...formData, default_age_min: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Min age" />
                </SelectTrigger>
                <SelectContent>
                  {AGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Age Max</Label>
              <Select
                value={String(formData.default_age_max || 65)}
                onValueChange={(value) => setFormData({ ...formData, default_age_max: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Max age" />
                </SelectTrigger>
                <SelectContent>
                  {AGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Gender</Label>
            <Select
              value={formData.default_gender || "all"}
              onValueChange={(value) => setFormData({ ...formData, default_gender: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Devices</Label>
            <MultiSelect
              options={DEVICE_OPTIONS}
              value={formData.default_devices || []}
              onChange={(values) => setFormData({ ...formData, default_devices: values })}
              placeholder="Select devices"
            />
          </div>

          <div className="space-y-2">
            <Label>Languages</Label>
            <MultiSelect
              options={LANGUAGE_OPTIONS}
              value={formData.default_languages || []}
              onChange={(values) => setFormData({ ...formData, default_languages: values })}
              placeholder="Select languages"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting || !formData.name || !formData.industry || !formData.business_objective || formData.platforms.length === 0 || formData.markets.length === 0}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
