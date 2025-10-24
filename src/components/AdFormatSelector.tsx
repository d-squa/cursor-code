import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { platformAdFormats } from "@/utils/adFormats";
import { useState } from "react";

interface AdFormatSelectorProps {
  platformName: string;
  selectedFormats: string[];
  onFormatsChange: (formats: string[]) => void;
}

export function AdFormatSelector({ platformName, selectedFormats, onFormatsChange }: AdFormatSelectorProps) {
  const [open, setOpen] = useState(false);
  const availableFormats = platformAdFormats[platformName] || [];

  const addFormat = (format: string) => {
    if (!selectedFormats.includes(format)) {
      onFormatsChange([...selectedFormats, format]);
    }
    setOpen(false);
  };

  const removeFormat = (format: string) => {
    onFormatsChange(selectedFormats.filter(f => f !== format));
  };

  if (availableFormats.length === 0) {
    return null;
  }

  const availableToSelect = availableFormats.filter(f => !selectedFormats.includes(f));

  return (
    <div className="space-y-2">
      <Label>Ad Formats</Label>
      <Select open={open} onOpenChange={setOpen} onValueChange={addFormat}>
        <SelectTrigger>
          <SelectValue placeholder="Select ad formats" />
        </SelectTrigger>
        <SelectContent>
          {availableToSelect.length > 0 ? (
            availableToSelect.map((format) => (
              <SelectItem key={format} value={format}>
                {format}
              </SelectItem>
            ))
          ) : (
            <div className="py-2 px-2 text-sm text-muted-foreground">
              All formats selected
            </div>
          )}
        </SelectContent>
      </Select>
      
      {selectedFormats.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedFormats.map((format) => (
            <Badge key={format} variant="secondary" className="gap-1">
              {format}
              <button
                onClick={() => removeFormat(format)}
                className="ml-1 hover:bg-muted rounded-full"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
