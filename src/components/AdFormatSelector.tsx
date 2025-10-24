import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { platformAdFormats } from "@/utils/adFormats";
import { MultiSelect } from "@/components/ui/multi-select";

interface AdFormatSelectorProps {
  platformName: string;
  selectedFormats: string[];
  onFormatsChange: (formats: string[]) => void;
}

export function AdFormatSelector({ platformName, selectedFormats, onFormatsChange }: AdFormatSelectorProps) {
  const availableFormats = platformAdFormats[platformName] || [];

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

      {selectedFormats.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedFormats.map((format) => (
            <Badge key={format} variant="secondary" className="gap-1">
              {format}
              <button onClick={() => removeFormat(format)} className="ml-1 hover:bg-muted rounded-full">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

