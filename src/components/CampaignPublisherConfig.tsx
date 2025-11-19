import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Info } from "lucide-react";
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
  const getAvailablePublisherPlatforms = () => {
    if (platformName.includes("Meta")) {
      return ["facebook", "instagram", "audience_network", "messenger", "threads"];
    }
    return [];
  };

  const availablePublisherPlatforms = getAvailablePublisherPlatforms();
  
  const getPlacements = () => {
    if (platformName === "Meta" || platformName.includes("Meta")) {
      return placementOptions[platformName] || placementOptions["Facebook (Meta)"] || {};
    }
    return placementOptions[platformName] || {};
  };
  
  const availablePlacements = getPlacements();

  // Initialize all publishers and placements by default
  useEffect(() => {
    if (availablePublisherPlatforms.length > 0 && publisherPlatforms.length === 0) {
      onPublisherPlatformsChange(availablePublisherPlatforms);
      
      const defaultPositions: any = {};
      availablePublisherPlatforms.forEach(publisher => {
        if (availablePlacements[publisher]) {
          defaultPositions[publisher] = availablePlacements[publisher];
        }
      });
      onPositionsChange(defaultPositions);
    }
  }, []);

  if (availablePublisherPlatforms.length === 0) {
    return null;
  }

  const updatePositions = (publisher: string, selectedPositions: string[]) => {
    onPositionsChange({
      ...positions,
      [publisher]: selectedPositions,
    });
  };

  const togglePublisher = (publisher: string) => {
    const isSelected = publisherPlatforms.includes(publisher);
    let updated: string[];
    
    if (isSelected) {
      updated = publisherPlatforms.filter(p => p !== publisher);
      const updatedPositions = { ...positions };
      delete updatedPositions[publisher as keyof typeof positions];
      onPositionsChange(updatedPositions);
    } else {
      updated = [...publisherPlatforms, publisher];
      if (availablePlacements[publisher]) {
        onPositionsChange({
          ...positions,
          [publisher]: availablePlacements[publisher]
        });
      }
    }
    
    onPublisherPlatformsChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Label>Publisher Platforms (Advantage+ Audience)</Label>
        <p className="text-xs text-muted-foreground">
          Select publisher platforms for maximum reach
        </p>
        <div className="space-y-2 border rounded-md p-3 bg-background">
          {availablePublisherPlatforms.map((publisher) => {
            const isSelected = publisherPlatforms.includes(publisher);
            return (
              <div key={publisher} className="flex items-center space-x-2">
                <Checkbox
                  id={`publisher-${publisher}`}
                  checked={isSelected}
                  onCheckedChange={() => togglePublisher(publisher)}
                />
                <Label 
                  htmlFor={`publisher-${publisher}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {publisher.charAt(0).toUpperCase() + publisher.slice(1).replace('_', ' ')}
                </Label>
              </div>
            );
          })}
        </div>
      </div>

      {publisherPlatforms.length > 0 && (
        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Configure placements for each selected publisher platform
            </AlertDescription>
          </Alert>
          
          {publisherPlatforms.map((publisher) => {
            const publisherPlacements = availablePlacements[publisher] || [];
            const selectedPlacements = positions[publisher as keyof typeof positions] || [];
            
            if (publisherPlacements.length === 0) {
              return (
                <div key={publisher} className="space-y-2">
                  <Label className="capitalize">{publisher.replace('_', ' ')} Placements</Label>
                  <p className="text-xs text-muted-foreground">
                    All placements selected by default (automatic)
                  </p>
                </div>
              );
            }

            const hasAutomaticOption = publisherPlacements.includes("automatic");

            return (
              <div key={publisher} className="space-y-2">
                <Label className="capitalize">{publisher.replace('_', ' ')} Placements</Label>
                {hasAutomaticOption ? (
                  <p className="text-xs text-muted-foreground">
                    All placements selected by default (automatic)
                  </p>
                ) : (
                  <MultiSelect
                    options={publisherPlacements.map(p => ({ 
                      value: p, 
                      label: p.charAt(0).toUpperCase() + p.split('_').join(' ') 
                    }))}
                    value={selectedPlacements}
                    onChange={(selected) => updatePositions(publisher, selected)}
                    placeholder={`Select ${publisher} placements`}
                    emptyText="No placements available"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
