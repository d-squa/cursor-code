import { useId, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PlacementPresetSelector } from "./PlacementPresetSelector";
import { 
  MetaPlacementPreset, 
  detectPlacementPreset, 
  applyPlacementPreset,
  getPlacementPreset 
} from "@/utils/metaPlacementPresets";

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
  advantagePlusPlacements?: boolean;
  placementPreset?: MetaPlacementPreset;
  onPublisherPlatformsChange: (platforms: string[]) => void;
  onPositionsChange: (positions: {
    facebook?: string[];
    instagram?: string[];
    audience_network?: string[];
    messenger?: string[];
    threads?: string[];
  }) => void;
  onAdvantagePlusPlacementsChange?: (enabled: boolean) => void;
  onPlacementPresetChange?: (preset: MetaPlacementPreset) => void;
  onBatchUpdate?: (updates: Record<string, any>) => void;
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
  advantagePlusPlacements = false,
  placementPreset,
  onPublisherPlatformsChange,
  onPositionsChange,
  onAdvantagePlusPlacementsChange,
  onPlacementPresetChange,
  onBatchUpdate,
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
  const radioName = useId();

  // Detect current preset from state
  const currentPreset = useMemo(() => {
    if (placementPreset) return placementPreset;
    return detectPlacementPreset(publisherPlatforms, positions, advantagePlusPlacements);
  }, [placementPreset, publisherPlatforms, positions, advantagePlusPlacements]);

  // Handle preset change
  const handlePresetChange = (preset: MetaPlacementPreset) => {
    const config = applyPlacementPreset(preset);
    
    if (onBatchUpdate) {
      onBatchUpdate({
        placementPreset: preset,
        advantagePlusPlacements: config.advantagePlusPlacements,
        publisherPlatforms: config.publisherPlatforms,
        positions: config.positions,
      });
    } else {
      onPlacementPresetChange?.(preset);
      onAdvantagePlusPlacementsChange?.(config.advantagePlusPlacements);
      onPublisherPlatformsChange(config.publisherPlatforms);
      onPositionsChange(config.positions);
    }
  };

  if (availablePublisherPlatforms.length === 0) {
    return null;
  }

  const updatePositions = (publisher: string, selectedPositions: string[]) => {
    // When manually updating, switch to custom preset
    if (currentPreset !== 'custom') {
      if (onBatchUpdate) {
        onBatchUpdate({
          placementPreset: 'custom',
          positions: {
            ...positions,
            [publisher]: selectedPositions,
          },
        });
      } else {
        onPlacementPresetChange?.('custom');
        onPositionsChange({
          ...positions,
          [publisher]: selectedPositions,
        });
      }
    } else {
      onPositionsChange({
        ...positions,
        [publisher]: selectedPositions,
      });
    }
  };

  const togglePublisher = (publisher: string) => {
    const isSelected = publisherPlatforms.includes(publisher);
    let updated: string[];
    
    if (isSelected) {
      updated = publisherPlatforms.filter(p => p !== publisher);
      const updatedPositions = { ...positions };
      delete updatedPositions[publisher as keyof typeof positions];
      
      // Switch to custom preset when manually modifying
      if (onBatchUpdate) {
        onBatchUpdate({
          placementPreset: 'custom',
          publisherPlatforms: updated,
          positions: updatedPositions,
        });
      } else {
        onPlacementPresetChange?.('custom');
        onPositionsChange(updatedPositions);
        onPublisherPlatformsChange(updated);
      }
    } else {
      updated = [...publisherPlatforms, publisher];
      const newPositions = {
        ...positions,
        [publisher]: availablePlacements[publisher] || []
      };
      
      // Switch to custom preset when manually modifying
      if (onBatchUpdate) {
        onBatchUpdate({
          placementPreset: 'custom',
          publisherPlatforms: updated,
          positions: newPositions,
        });
      } else {
        onPlacementPresetChange?.('custom');
        onPositionsChange(newPositions);
        onPublisherPlatformsChange(updated);
      }
    }
  };

  const presetInfo = getPlacementPreset(currentPreset);
  const showCarouselHint = presetInfo?.isCarousel;

  return (
    <div className="space-y-4">
      {/* Placement Preset Selector */}
      <div className="space-y-3">
        <Label>Placement Strategy</Label>
        <PlacementPresetSelector
          selectedPreset={currentPreset}
          onPresetChange={handlePresetChange}
        />
        
        {showCarouselHint && (
          <Alert className="bg-primary/5 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="text-xs">
              <strong>Carousel Mode:</strong> Creative matching will prioritize {presetInfo?.isStory ? '9:16 story' : 'feed'} carousel assets.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Manual Placement Configuration - only shown when custom mode is selected */}
      {currentPreset === 'custom' && (
        <>
          <div className="space-y-3">
            <Label>Publisher Platforms</Label>
            <p className="text-xs text-muted-foreground">
              Select publisher platforms for your ads
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
        </>
      )}
    </div>
  );
}
