import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Phase } from "@/types/mediaplan";
import {
  getGoogleAdsCampaignTypes,
  getGoogleAdsSubtypes,
  getGoogleAdsCampaignConfig,
  type GoogleAdsCampaignType,
} from "@/utils/googleAdsCampaignMatrix";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface GoogleAdsPhaseConfigProps {
  phase: Phase;
  onUpdate: (field: string, value: any) => void;
  googleCustomerId?: string;
}

export function GoogleAdsPhaseConfig({ phase, onUpdate }: GoogleAdsPhaseConfigProps) {
  const campaignTypes = getGoogleAdsCampaignTypes();
  const selectedType = phase.googleCampaignType || "";
  const subtypes = useMemo(() => selectedType ? getGoogleAdsSubtypes(selectedType) : [], [selectedType]);
  const selectedSubtype = phase.googleCampaignSubtype || "";

  const config = useMemo(
    () => getGoogleAdsCampaignConfig(selectedType, selectedSubtype || undefined),
    [selectedType, selectedSubtype]
  );

  const handleCampaignTypeChange = (value: string) => {
    onUpdate("googleCampaignType", value);
    onUpdate("googleCampaignSubtype", "");
    // Auto-set bid strategy to first available
    const newConfig = getGoogleAdsCampaignConfig(value);
    if (newConfig?.bidStrategies?.length) {
      onUpdate("googleBidStrategy", newConfig.bidStrategies[0]);
    }
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-200">
          Google Ads
        </Badge>
      </div>

      {/* Campaign Type */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs">Campaign Type</Label>
          <Select value={selectedType} onValueChange={handleCampaignTypeChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select campaign type" />
            </SelectTrigger>
            <SelectContent>
              {campaignTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Subtype */}
        {subtypes.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Subtype</Label>
            <Select value={selectedSubtype} onValueChange={(v) => onUpdate("googleCampaignSubtype", v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select subtype" />
              </SelectTrigger>
              <SelectContent>
                {subtypes.map((st) => (
                  <SelectItem key={st} value={st}>{st}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {config && (
        <>
          {/* Bid Strategy */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Bid Strategy</Label>
              <Select
                value={phase.googleBidStrategy || config.bidStrategies[0] || ""}
                onValueChange={(v) => onUpdate("googleBidStrategy", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.bidStrategies.map((bs) => (
                    <SelectItem key={bs} value={bs}>{bs}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target CPA / ROAS / Max CPC based on bid strategy */}
            {(phase.googleBidStrategy === "Target CPA" || phase.googleBidStrategy === "TARGET_CPA") && (
              <div className="space-y-2">
                <Label className="text-xs">Target CPA ($)</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  value={phase.googleTargetCpa || ""}
                  onChange={(e) => onUpdate("googleTargetCpa", parseFloat(e.target.value) || undefined)}
                  placeholder="10.00"
                />
              </div>
            )}
            {(phase.googleBidStrategy === "Target ROAS" || phase.googleBidStrategy === "TARGET_ROAS") && (
              <div className="space-y-2">
                <Label className="text-xs">Target ROAS (%)</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  value={phase.googleTargetRoas || ""}
                  onChange={(e) => onUpdate("googleTargetRoas", parseFloat(e.target.value) || undefined)}
                  placeholder="200"
                />
              </div>
            )}
            {(phase.googleBidStrategy === "Manual CPC" || phase.googleBidStrategy === "Maximum CPC") && (
              <div className="space-y-2">
                <Label className="text-xs">Max CPC ($)</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  value={phase.googleMaxCpcBid || ""}
                  onChange={(e) => onUpdate("googleMaxCpcBid", parseFloat(e.target.value) || undefined)}
                  placeholder="2.00"
                />
              </div>
            )}
          </div>

          {/* Network Settings */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Networks</Label>
            <div className="flex flex-wrap gap-3">
              {config.networks.searchPartner === "optional" && (
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id={`gads-search-partner-${phase.id}`}
                    checked={phase.googleSearchPartner ?? false}
                    onCheckedChange={(v) => onUpdate("googleSearchPartner", !!v)}
                    className="h-3.5 w-3.5"
                  />
                  <label htmlFor={`gads-search-partner-${phase.id}`} className="text-xs">Search Partners</label>
                </div>
              )}
              {config.networks.displayNetwork === "optional" && (
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id={`gads-display-${phase.id}`}
                    checked={phase.googleDisplayNetwork ?? false}
                    onCheckedChange={(v) => onUpdate("googleDisplayNetwork", !!v)}
                    className="h-3.5 w-3.5"
                  />
                  <label htmlFor={`gads-display-${phase.id}`} className="text-xs">Display Network</label>
                </div>
              )}
              {/* Show enabled networks as badges */}
              {config.networks.searchNetwork && (
                <Badge variant="secondary" className="text-[10px]">Search</Badge>
              )}
              {config.networks.youtube && (
                <Badge variant="secondary" className="text-[10px]">YouTube</Badge>
              )}
              {config.networks.gmail && (
                <Badge variant="secondary" className="text-[10px]">Gmail</Badge>
              )}
              {config.networks.discover && (
                <Badge variant="secondary" className="text-[10px]">Discover</Badge>
              )}
              {config.networks.googleTv && (
                <Badge variant="secondary" className="text-[10px]">Google TV</Badge>
              )}
              {config.networks.videoPartner && (
                <Badge variant="secondary" className="text-[10px]">Video Partners</Badge>
              )}
            </div>
          </div>

          {/* Video Settings - Inventory Type */}
          {config.videoSettings && (
            <div className="space-y-2">
              <Label className="text-xs">Inventory Type</Label>
              <Select
                value={phase.googleInventoryType || "Standard"}
                onValueChange={(v) => onUpdate("googleInventoryType", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.videoSettings.inventoryType.map((it) => (
                    <SelectItem key={it} value={it}>{it}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* AI Max (Search only) */}
          {config.targeting.aiMax === "optional" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch
                  id={`gads-aimax-${phase.id}`}
                  checked={phase.googleAiMax ?? false}
                  onCheckedChange={(v) => onUpdate("googleAiMax", v)}
                  className="h-4 w-7"
                />
                <Label htmlFor={`gads-aimax-${phase.id}`} className="text-xs">AI Maximization</Label>
              </div>
              {phase.googleAiMax && config.targeting.aiMaxOptions && (
                <div className="flex flex-wrap gap-2 ml-6">
                  {config.targeting.aiMaxOptions.map((opt) => (
                    <div key={opt} className="flex items-center gap-1.5">
                      <Checkbox
                        id={`gads-aimax-opt-${phase.id}-${opt}`}
                        checked={(phase.googleAiMaxOptions || []).includes(opt)}
                        onCheckedChange={(checked) => {
                          const current = phase.googleAiMaxOptions || [];
                          onUpdate(
                            "googleAiMaxOptions",
                            checked ? [...current, opt] : current.filter((o) => o !== opt)
                          );
                        }}
                        className="h-3.5 w-3.5"
                      />
                      <label htmlFor={`gads-aimax-opt-${phase.id}-${opt}`} className="text-xs">{opt}</label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Customer Acquisition */}
          {config.features.customerAcquisition && (
            <div className="space-y-2">
              <Label className="text-xs">Customer Acquisition</Label>
              <Select
                value={phase.googleCustomerAcquisition || "Everyone"}
                onValueChange={(v) => onUpdate("googleCustomerAcquisition", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Everyone">Everyone</SelectItem>
                  <SelectItem value="New Customers Only">New Customers Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* App Platform (App Promotion only) */}
          {config.features.appPlatform && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">App Platform</Label>
                <Select
                  value={phase.googleAppPlatform || ""}
                  onValueChange={(v) => onUpdate("googleAppPlatform", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="android">Android</SelectItem>
                    <SelectItem value="ios">iOS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">App ID</Label>
                <Input
                  className="h-8 text-xs"
                  value={phase.googleAppId || ""}
                  onChange={(e) => onUpdate("googleAppId", e.target.value)}
                  placeholder="com.example.app"
                />
              </div>
            </div>
          )}

          {/* Feature toggles */}
          <div className="flex flex-wrap gap-4">
            {config.features.productFeed && (
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id={`gads-product-feed-${phase.id}`}
                  checked={phase.googleProductFeed ?? false}
                  onCheckedChange={(v) => onUpdate("googleProductFeed", !!v)}
                  className="h-3.5 w-3.5"
                />
                <label htmlFor={`gads-product-feed-${phase.id}`} className="text-xs">Product Feed</label>
              </div>
            )}
            {config.features.productFeed && phase.googleProductFeed && (
              <div className="w-full space-y-2">
                <Label className="text-xs">Merchant Center ID</Label>
                <Input
                  className="h-8 text-xs"
                  value={phase.googleMerchantCenterId || ""}
                  onChange={(e) => onUpdate("googleMerchantCenterId", e.target.value)}
                  placeholder="Enter Merchant Center ID"
                />
                <Label className="text-xs">Feed Label</Label>
                <Input
                  className="h-8 text-xs"
                  value={phase.googleFeedLabel || ""}
                  onChange={(e) => onUpdate("googleFeedLabel", e.target.value)}
                  placeholder="e.g. US, EU, ALL"
                />
              </div>
            )}
            {config.targeting.optimizedTargeting && (
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id={`gads-optimized-targeting-${phase.id}`}
                  checked={phase.googleOptimizedTargeting ?? true}
                  onCheckedChange={(v) => onUpdate("googleOptimizedTargeting", !!v)}
                  className="h-3.5 w-3.5"
                />
                <label htmlFor={`gads-optimized-targeting-${phase.id}`} className="text-xs">Optimized Targeting</label>
              </div>
            )}
            {config.features.exclude && (
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id={`gads-exclude-${phase.id}`}
                  checked={phase.googleExclude ?? false}
                  onCheckedChange={(v) => onUpdate("googleExclude", !!v)}
                  className="h-3.5 w-3.5"
                />
                <label htmlFor={`gads-exclude-${phase.id}`} className="text-xs">Exclusions</label>
              </div>
            )}
          </div>

          {/* Targeting info badges */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Targeting Level</Label>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {config.targeting.audienceTargetingLevel}
              </Badge>
              {config.targeting.keywords && (
                <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 border-green-200">
                  Keywords
                </Badge>
              )}
              {config.targeting.searchThemes && (
                <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 border-purple-200">
                  Search Themes
                </Badge>
              )}
              {config.targeting.topics && (
                <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-700 border-orange-200">
                  Topics
                </Badge>
              )}
              {config.targeting.placements.length > 0 && (
                <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-700 border-cyan-200">
                  Placements
                </Badge>
              )}
              {config.targeting.audienceSegments.map((seg) => (
                <Badge key={seg} variant="secondary" className="text-[10px]">
                  {seg}
                </Badge>
              ))}
            </div>
          </div>

          {/* Landing Page URL */}
          <div className="space-y-2">
            <Label className="text-xs">Landing Page URL</Label>
            <Input
              className="h-8 text-xs"
              value={phase.googleLandingPageUrl || ""}
              onChange={(e) => onUpdate("googleLandingPageUrl", e.target.value)}
              placeholder="https://example.com/landing"
            />
          </div>
        </>
      )}
    </div>
  );
}
