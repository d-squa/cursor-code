import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { platformAdFormats } from "@/utils/adFormats";

interface AdFormatSelectorProps {
  platformName: string;
  selectedFormats: string[];
  onFormatsChange: (formats: string[]) => void;
}

export function AdFormatSelector({ platformName, selectedFormats, onFormatsChange }: AdFormatSelectorProps) {
  const availableFormats = platformAdFormats[platformName] || [];

  const toggleFormat = (format: string) => {
    if (selectedFormats.includes(format)) {
      onFormatsChange(selectedFormats.filter(f => f !== format));
    } else {
      onFormatsChange([...selectedFormats, format]);
    }
  };

  if (availableFormats.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ad Formats</CardTitle>
        <CardDescription className="text-sm">Select the ad formats for this market</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {availableFormats.map((format) => (
            <div key={format} className="flex items-center space-x-2">
              <Checkbox
                id={`format-${format}`}
                checked={selectedFormats.includes(format)}
                onCheckedChange={() => toggleFormat(format)}
              />
              <Label
                htmlFor={`format-${format}`}
                className="text-sm font-normal cursor-pointer"
              >
                {format}
              </Label>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
