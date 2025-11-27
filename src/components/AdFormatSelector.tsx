import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { platformAdFormats, platformIdToAdFormatKey } from "@/utils/adFormats";
import { MultiSelect } from "@/components/ui/multi-select";

interface AdFormatSelectorProps {
  platformName: string;
  selectedFormats: string[];
  onFormatsChange: (formats: string[]) => void;
}

export function AdFormatSelector({ platformName, selectedFormats, onFormatsChange }: AdFormatSelectorProps) {
  // Map platform name to correct ad format key
  const adFormatKey = platformIdToAdFormatKey[platformName] || platformName;
  const availableFormats = platformAdFormats[adFormatKey] || [];

  console.log('🎨 AdFormatSelector:', { 
    platformName, 
    adFormatKey, 
    availableFormatsCount: availableFormats.length,
    availableFormats 
  });

  const options = availableFormats.map((f) => ({ value: f, label: f }));

  const removeFormat = (format: string) => {
    onFormatsChange(selectedFormats.filter((f) => f !== format));
  };

  if (availableFormats.length === 0) {
    console.warn('⚠️ No ad formats available for platform:', platformName);
    return (
      <div className="space-y-2">
        <Label>Ad Formats</Label>
        <p className="text-sm text-muted-foreground">No ad formats available for this platform</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Ad Formats</Label>
      <MultiSelect
        options={options}
        value={selectedFormats}
        onChange={onFormatsChange}
        placeholder="Select ad formats"
        emptyText="No ad formats"
      />
      {selectedFormats.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedFormats.map((format) => (
            <Badge key={format} variant="secondary" className="gap-1">
              {format}
              <X
                className="h-3 w-3 cursor-pointer hover:text-destructive"
                onClick={() => removeFormat(format)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

