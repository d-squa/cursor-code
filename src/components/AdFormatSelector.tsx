import { Badge } from "@/components/ui/badge";
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

  const options = availableFormats.map((f) => ({ value: f, label: f }));

  const removeFormat = (format: string) => {
    onFormatsChange(selectedFormats.filter((f) => f !== format));
  };

  if (availableFormats.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <MultiSelect
        options={options}
        value={selectedFormats}
        onChange={onFormatsChange}
        placeholder="Select ad formats"
        emptyText="No ad formats"
      />
    </div>
  );
}

