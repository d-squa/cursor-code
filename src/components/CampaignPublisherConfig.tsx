import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface CampaignPublisherConfigProps {
  platformName: string;
  publisherPlatforms: string[];
  positions: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
  };
  onPublisherPlatformsChange: (platforms: string[]) => void;
  onPositionsChange: (positions: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
  }) => void;
}

// Platform-specific placement options
const placementOptions: Record<string, Record<string, string[]>> = {
  "Facebook (Meta)": {
    facebook: ["feed", "instant_article", "instream_video", "marketplace", "right_column", "search", "video_feeds", "story"],
    instagram: ["stream", "story", "explore", "explore_home", "reels"],
    audience_network: ["native_banner_interstitial", "instream_video", "rewarded_video"]
  },
  "Instagram (Meta)": {
    instagram: ["stream", "story", "explore", "explore_home", "reels"],
    facebook: ["feed", "story"],
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
      return ["facebook", "instagram", "audience_network", "messenger"];
    }
    return [];
  };

  const availablePublisherPlatforms = getAvailablePublisherPlatforms();
  const availablePlacements = placementOptions[platformName] || {};

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
        <Label>Publisher Platforms</Label>
        <MultiSelect
          options={availablePublisherPlatforms.map(p => ({ 
            value: p, 
            label: p.charAt(0).toUpperCase() + p.slice(1).replace('_', ' ') 
          }))}
          value={publisherPlatforms}
          onChange={onPublisherPlatformsChange}
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
