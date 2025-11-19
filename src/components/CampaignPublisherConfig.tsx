import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge } from "@/components/ui/badge";
import { X, Info } from "lucide-react";
import { useEffect, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CampaignPublisherConfigProps {
  platformName: string;
  publisherPlatforms: string[];
  positions: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
    messenger?: string[];
    threads?: string[];
  };
  onPublisherPlatformsChange: (platforms: string[]) => void;
  onPositionsChange: (positions: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
    messenger?: string[];
    threads?: string[];
  }) => void;
}

// Platform-specific placement options
const placementOptions: Record<string, Record<string, string[]>> = {
  "Facebook (Meta)": {
    facebook: ["feed", "instant_article", "instream_video", "marketplace", "right_column", "search", "video_feeds", "story"],
    instagram: ["stream", "story", "explore", "explore_home", "reels"],
    audience_network: ["native_banner_interstitial", "instream_video", "rewarded_video"],
    messenger: ["messenger_home", "sponsored_messages", "story"],
    threads: ["threads"]
  },
  "Instagram (Meta)": {
    instagram: ["stream", "story", "explore", "explore_home", "reels"],
    facebook: ["feed", "story"],
    messenger: ["messenger_home", "sponsored_messages"],
    threads: ["threads"]
  }
};

export function CampaignPublisherConfig({
  platformName,
  publisherPlatforms,
  positions,
  onPublisherPlatformsChange,
  onPositionsChange,
}: CampaignPublisherConfigProps) {
  // Get available publisher platforms based on platform name
  const getAvailablePublisherPlatforms = () => {
    if (platformName.includes("Meta")) {
      return ["facebook", "instagram", "audience_network", "messenger", "threads"];
    }
    return [];
  };

  const availablePublisherPlatforms = getAvailablePublisherPlatforms();
  const availablePlacements = placementOptions[platformName] || {};
  const hasInitialized = useRef(false);

  // Set default Advantage+ audience (all publishers) on mount if nothing selected
  useEffect(() => {
    if (!hasInitialized.current && availablePublisherPlatforms.length > 0 && publisherPlatforms.length === 0) {
      hasInitialized.current = true;
      onPublisherPlatformsChange(availablePublisherPlatforms);
      // Set automatic placements for all publishers by default
      const defaultPositions: any = {};
      availablePublisherPlatforms.forEach(pub => {
        defaultPositions[pub] = ["automatic"];
      });
      onPositionsChange(defaultPositions);
    }
  }, [availablePublisherPlatforms, publisherPlatforms.length, onPublisherPlatformsChange, onPositionsChange]);

  if (availablePublisherPlatforms.length === 0) {
    return null;
  }

  const updatePositions = (publisher: string, selectedPositions: string[]) => {
    onPositionsChange({
      ...positions,
      [publisher]: selectedPositions,
    });
  };

  const removePublisherPlatform = (platform: string) => {
    const updated = publisherPlatforms.filter(p => p !== platform);
    onPublisherPlatformsChange(updated);
    
    // Also remove positions for this platform
    const updatedPositions = { ...positions };
    delete updatedPositions[platform as keyof typeof positions];
    onPositionsChange(updatedPositions);
  };

  return (
    <div className="space-y-4">
      {/* Publisher Platforms Selection */}
      <div className="space-y-2">
        <Label>Publisher Platforms (Advantage+ Audience)</Label>
        <p className="text-xs text-muted-foreground">
          All publishers selected by default for maximum reach (Advantage+ audience)
        </p>
        <MultiSelect
          options={availablePublisherPlatforms.map(p => ({ 
            value: p, 
            label: p.charAt(0).toUpperCase() + p.slice(1).replace('_', ' ') 
          }))}
          value={publisherPlatforms}
          onChange={(selected) => {
            onPublisherPlatformsChange(selected);
            // Ensure removed publishers don't have positions
            const updatedPositions = { ...positions };
            availablePublisherPlatforms.forEach(pub => {
              if (!selected.includes(pub)) {
                delete updatedPositions[pub as keyof typeof positions];
              } else if (!updatedPositions[pub as keyof typeof positions]) {
                // Add automatic placement for newly selected publishers
                (updatedPositions as any)[pub] = ["automatic"];
              }
            });
            onPositionsChange(updatedPositions);
          }}
          placeholder="Select publisher platforms"
          emptyText="No publisher platforms"
        />
        
        {publisherPlatforms.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {publisherPlatforms.map((platform) => (
              <Badge key={platform} variant="secondary" className="gap-1">
                {platform.charAt(0).toUpperCase() + platform.slice(1).replace('_', ' ')}
                <button 
                  onClick={() => removePublisherPlatform(platform)} 
                  className="ml-1 hover:bg-muted rounded-full"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Placements Section with Visual Indicator */}
      {publisherPlatforms.length === 0 && (
        <Alert className="bg-muted/50">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Select publisher platforms above to configure placement options for each platform.
          </AlertDescription>
        </Alert>
      )}

      {publisherPlatforms.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span>Placement Options by Publisher</span>
          </div>
        </div>
      )}

      {/* Positions for each selected publisher platform */}
      {publisherPlatforms.map((publisher) => {
        const publisherPlacements = availablePlacements[publisher] || [];
        if (publisherPlacements.length === 0) return null;

        return (
          <div key={publisher} className="space-y-2 pl-4 border-l-2 border-muted">
            <Label className="text-sm">
              {publisher.charAt(0).toUpperCase() + publisher.slice(1).replace('_', ' ')} Placements
            </Label>
            <MultiSelect
              options={["automatic", ...publisherPlacements].map(p => ({ 
                value: p, 
                label: p.charAt(0).toUpperCase() + p.slice(1).replace('_', ' ') 
              }))}
              value={(positions[publisher as keyof typeof positions] || ["automatic"]) as string[]}
              onChange={(vals) => {
                let next = vals;
                // If "automatic" is selected with others, remove automatic
                if (next.length > 1 && next.includes("automatic")) {
                  next = next.filter(v => v !== "automatic");
                }
                // If nothing selected, default to automatic
                if (next.length === 0) {
                  next = ["automatic"];
                }
                updatePositions(publisher, next);
              }}
              placeholder="Select placements"
              emptyText="No placements available"
            />
          </div>
        );
      })}
    </div>
  );
}
