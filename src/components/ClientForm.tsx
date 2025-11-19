import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { INDUSTRIES, BUSINESS_OBJECTIVES } from "@/utils/clientOptions";
import { PLATFORM_OPTIONS } from "@/utils/platformOptions";
import { MultiSelect } from "@/components/ui/multi-select";

interface ClientFormData {
  name: string;
  website: string;
  app_name: string;
  industry: string;
  business_objective: string;
  platforms: string[];
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

      <div className="flex gap-3 justify-end pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting || !formData.name || !formData.industry || !formData.business_objective || formData.platforms.length === 0}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
