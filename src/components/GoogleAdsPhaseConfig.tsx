import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
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
import { Loader2, ShieldCheck, Target, Swords, Ban } from "lucide-react";
import { KeywordItem, KeywordStrategy } from "./KeywordTargeting";
import { useSampleMode } from "@/contexts/SampleModeContext";

interface GoogleAdsPhaseConfigProps {
  phase: Phase;
  onUpdate: (field: string, value: any) => void;
  googleCustomerId?: string;
  selectedKeywords?: KeywordItem[];
  googleDefaults?: {
    googleBidStrategy?: string;
    googleTargetCpa?: number;
    googleTargetRoas?: number;
    googleMaxCpcBid?: number;
    googleCampaignType?: string;
    googleCampaignSubtype?: string;
    googleLocationTargeting?: string;
    googleSearchPartner?: boolean;
    googleDisplayNetwork?: boolean;
    googleCustomerAcquisition?: string;
    googleOptimizedTargeting?: boolean;
    googleInventoryType?: string;
    googleAiMax?: boolean;
    googleAiMaxOptions?: string[];
    googleLandingPageUrl?: string;
    googleMerchantCenterId?: string;
    googleFeedLabel?: string;
    googlePlacements?: string[];
    googleBrandGuidelines?: boolean;
    googleBusinessName?: string;
  };
}

const STRATEGY_CONFIG: Record<KeywordStrategy, { label: string; icon: React.ReactNode; colorClass: string }> = {
  brand: { label: "Brand", icon: <ShieldCheck className="h-3.5 w-3.5" />, colorClass: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800" },
  generic: { label: "Generic", icon: <Target className="h-3.5 w-3.5" />, colorClass: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800" },
  competition: { label: "Competition", icon: <Swords className="h-3.5 w-3.5" />, colorClass: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800" },
};

const MATCH_LABELS: Record<string, string> = { exact: "[Exact]", phrase: '"Phrase"', broad: "Broad" };

function formatVol(vol?: number) {
  if (!vol) return "—";
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return String(vol);
}

export function GoogleAdsPhaseConfig({ phase, onUpdate, googleCustomerId, selectedKeywords, googleDefaults }: GoogleAdsPhaseConfigProps) {
  const { isSampleMode } = useSampleMode();
  const campaignTypes = getGoogleAdsCampaignTypes();
  const selectedType = phase.googleCampaignType || "";
  const subtypes = useMemo(() => selectedType ? getGoogleAdsSubtypes(selectedType) : [], [selectedType]);
  const selectedSubtype = phase.googleCampaignSubtype || "";

  const config = useMemo(
    () => getGoogleAdsCampaignConfig(selectedType, selectedSubtype || undefined),
    [selectedType, selectedSubtype]
  );

  // Auto-set campaign type from objective when not manually set
  useEffect(() => {
    if (phase.googleCampaignType || !phase.objective) return;
    const objectiveToTypeAndSubtype: Record<string, { type: string; subtype?: string }> = {
      AWARENESS_DISPLAY: { type: "Display" },
      AWARENESS_VIDEO_EFFICIENT_REACH: { type: "Video", subtype: "Efficient Reach" },
      AWARENESS_VIDEO_NON_SKIPPABLE: { type: "Video", subtype: "Non-skippable Reach" },
      AWARENESS_VIDEO_TARGET_FREQUENCY: { type: "Video", subtype: "Target Frequency" },
      AWARENESS_AD_SEQUENCE: { type: "Video", subtype: "Ad Sequence" },
      AWARENESS_VIDEO_VIEWS: { type: "Video", subtype: "Video Views" },
      AWARENESS_AUDIO_REACH: { type: "Video", subtype: "Audio Reach" },
      CONVERSION_SEARCH: { type: "Search" },
      CONSIDERATION_PMAX: { type: "Performance Max" },
      CONSIDERATION_APP_INSTALLS: { type: "App Promotion", subtype: "App Installs" },
      CONSIDERATION_APP_ENGAGEMENT: { type: "App Promotion", subtype: "App Engagement" },
      CONSIDERATION_APP_PRE_REGISTRATION: { type: "App Promotion", subtype: "App Pre-registration" },
      CONSIDERATION_DEMAND_GEN: { type: "Demand Gen" },
      CONVERSION_SHOPPING: { type: "Shopping" },
    };
    const mapping = objectiveToTypeAndSubtype[phase.objective];
    if (mapping && campaignTypes.includes(mapping.type)) {
      onUpdate("googleCampaignType", mapping.type);
      const availableSubtypes = getGoogleAdsSubtypes(mapping.type);
      if (mapping.subtype && availableSubtypes.includes(mapping.subtype)) {
        onUpdate("googleCampaignSubtype", mapping.subtype);
      }
      const newConfig = getGoogleAdsCampaignConfig(mapping.type, mapping.subtype);
      if (newConfig?.bidStrategies?.length) {
        onUpdate("googleBidStrategy", newConfig.bidStrategies[0]);
      }
    }
  }, [phase.objective, phase.googleCampaignType]);

  // Auto-populate from client defaults when fields are empty
  useEffect(() => {
    if (!googleDefaults) return;
    if (!phase.googleCampaignType && googleDefaults.googleCampaignType) {
      onUpdate("googleCampaignType", googleDefaults.googleCampaignType);
      if (googleDefaults.googleCampaignSubtype) {
        onUpdate("googleCampaignSubtype", googleDefaults.googleCampaignSubtype);
      }
    }
    if (!phase.googleBidStrategy && googleDefaults.googleBidStrategy) {
      onUpdate("googleBidStrategy", googleDefaults.googleBidStrategy);
    }
    if (phase.googleTargetCpa === undefined && googleDefaults.googleTargetCpa) {
      onUpdate("googleTargetCpa", googleDefaults.googleTargetCpa);
    }
    if (phase.googleTargetRoas === undefined && googleDefaults.googleTargetRoas) {
      onUpdate("googleTargetRoas", googleDefaults.googleTargetRoas);
    }
    if (phase.googleMaxCpcBid === undefined && googleDefaults.googleMaxCpcBid) {
      onUpdate("googleMaxCpcBid", googleDefaults.googleMaxCpcBid);
    }
    if (phase.googleLocationTargeting === undefined && googleDefaults.googleLocationTargeting) {
      onUpdate("googleLocationTargeting", googleDefaults.googleLocationTargeting);
    }
    if (phase.googleSearchPartner === undefined && googleDefaults.googleSearchPartner !== undefined) {
      onUpdate("googleSearchPartner", googleDefaults.googleSearchPartner);
    }
    if (phase.googleDisplayNetwork === undefined && googleDefaults.googleDisplayNetwork !== undefined) {
      onUpdate("googleDisplayNetwork", googleDefaults.googleDisplayNetwork);
    }
    if (phase.googleCustomerAcquisition === undefined && googleDefaults.googleCustomerAcquisition) {
      onUpdate("googleCustomerAcquisition", googleDefaults.googleCustomerAcquisition);
    }
    if (phase.googleOptimizedTargeting === undefined && googleDefaults.googleOptimizedTargeting !== undefined) {
      onUpdate("googleOptimizedTargeting", googleDefaults.googleOptimizedTargeting);
    }
    if (phase.googleInventoryType === undefined && googleDefaults.googleInventoryType) {
      onUpdate("googleInventoryType", googleDefaults.googleInventoryType);
    }
    if (phase.googleAiMax === undefined && googleDefaults.googleAiMax !== undefined) {
      onUpdate("googleAiMax", googleDefaults.googleAiMax);
    }
    if (!phase.googleAiMaxOptions?.length && googleDefaults.googleAiMaxOptions?.length) {
      onUpdate("googleAiMaxOptions", googleDefaults.googleAiMaxOptions);
    }
    if (!phase.googleLandingPageUrl && googleDefaults.googleLandingPageUrl) {
      onUpdate("googleLandingPageUrl", googleDefaults.googleLandingPageUrl);
    }
    if (!phase.googleMerchantCenterId && googleDefaults.googleMerchantCenterId) {
      onUpdate("googleMerchantCenterId", googleDefaults.googleMerchantCenterId);
      onUpdate("googleProductFeed", true);
    }
    if (!phase.googleFeedLabel && googleDefaults.googleFeedLabel) {
      onUpdate("googleFeedLabel", googleDefaults.googleFeedLabel);
    }
    if (!phase.googlePlacements?.length && googleDefaults.googlePlacements?.length) {
      onUpdate("googlePlacements", googleDefaults.googlePlacements);
    }
    if (phase.googleBrandGuidelines === undefined && googleDefaults.googleBrandGuidelines !== undefined) {
      onUpdate("googleBrandGuidelines", googleDefaults.googleBrandGuidelines);
    }
    if (!phase.googleBusinessName && googleDefaults.googleBusinessName) {
      onUpdate("googleBusinessName", googleDefaults.googleBusinessName);
    }
  }, [phase.id, googleDefaults]);

  const [merchantCenters, setMerchantCenters] = useState<Array<{ id: string; merchantCenterId: string; merchantCenterName: string }>>([]);
  const [feedLabels, setFeedLabels] = useState<Array<{ label: string; country: string }>>([]);
  const [loadingMC, setLoadingMC] = useState(false);

  useEffect(() => {
    if (googleCustomerId && phase.googleProductFeed) {
      setLoadingMC(true);
      supabase.functions.invoke("fetch-google-merchant-centers", {
        body: { customerId: googleCustomerId },
      }).then(({ data, error }) => {
        if (!error && data) {
          setMerchantCenters(data.merchantCenters || []);
          setFeedLabels(data.feedLabels || []);
        }
      }).finally(() => setLoadingMC(false));
    }
  }, [googleCustomerId, phase.googleProductFeed]);

  // Single source of truth: Optimization Goal drives Google Bid Strategy.
  // Keep googleBidStrategy in sync so downstream DSP push & conditional inputs work.
  useEffect(() => {
    if (phase.optimizationGoal && phase.optimizationGoal !== phase.googleBidStrategy) {
      onUpdate("googleBidStrategy", phase.optimizationGoal);
    }
  }, [phase.optimizationGoal]);

  const handleCampaignTypeChange = (value: string) => {
    onUpdate("googleCampaignType", value);
    onUpdate("googleCampaignSubtype", "");
    // Auto-set bid strategy to first available
    const newConfig = getGoogleAdsCampaignConfig(value);
    if (newConfig?.bidStrategies?.length) {
      onUpdate("googleBidStrategy", newConfig.bidStrategies[0]);
    }
  };

  // Keyword strategy summary for Search campaigns
  const isSearchCampaign = selectedType === "Search";
  const keywordStrategySummary = useMemo(() => {
    if (!isSearchCampaign || !selectedKeywords || selectedKeywords.length === 0) return null;

    const strategies: KeywordStrategy[] = ["brand", "generic", "competition"];
    return strategies.map((strategy) => {
      const kws = selectedKeywords.filter((kw) => kw.strategy === strategy);
      const positives = kws.filter((kw) => !kw.isNegative);
      const negatives = kws.filter((kw) => kw.isNegative);
      const totalVol = positives.reduce((s, kw) => s + (kw.avgMonthlySearches || 0), 0);
      const avgVol = positives.length > 0 ? Math.round(totalVol / positives.length) : 0;
      const avgCpc = positives.length > 0
        ? positives.reduce((s, kw) => s + ((kw.cpcLow || 0) + (kw.cpcHigh || 0)) / 2, 0) / positives.length
        : 0;
      const matchTypes = positives.reduce<Record<string, number>>((acc, kw) => {
        const mt = kw.matchType || "broad";
        acc[mt] = (acc[mt] || 0) + 1;
        return acc;
      }, {});

      return { strategy, positives, negatives, totalVol, avgVol, avgCpc, matchTypes };
    });
  }, [isSearchCampaign, selectedKeywords]);

  return (
    <fieldset disabled={isSampleMode} className={`space-y-4 border-t pt-4 ${isSampleMode ? "opacity-90 [&_*]:cursor-not-allowed" : ""}`}>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-200">
          Google Ads
        </Badge>
        {isSampleMode && (
          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">Sample tour — read-only</Badge>
        )}
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

      {/* Keyword Strategy Summary for Search Campaigns */}
      {isSearchCampaign && keywordStrategySummary && (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Keyword Strategy Breakdown</Label>
            <Badge variant="secondary" className="text-[10px]">
              {selectedKeywords?.filter(k => !k.isNegative).length || 0} positive · {selectedKeywords?.filter(k => k.isNegative).length || 0} negative
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {keywordStrategySummary.map(({ strategy, positives, negatives, totalVol, avgVol, avgCpc, matchTypes }) => {
              const meta = STRATEGY_CONFIG[strategy];
              const hasKeywords = positives.length > 0 || negatives.length > 0;

              return (
                <div
                  key={strategy}
                  className={`rounded-lg border p-3 space-y-2 ${hasKeywords ? meta.colorClass : "bg-muted/30 border-border opacity-60"}`}
                >
                  <div className="flex items-center gap-1.5">
                    {meta.icon}
                    <span className="text-xs font-semibold">{meta.label}</span>
                    {positives.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] ml-auto h-4 px-1.5">
                        {positives.length}
                      </Badge>
                    )}
                  </div>

                  {hasKeywords ? (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-1 text-[10px]">
                        <div>
                          <span className="text-muted-foreground">Total Vol</span>
                          <p className="font-semibold">{formatVol(totalVol)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Avg Vol</span>
                          <p className="font-semibold">{formatVol(avgVol)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Avg CPC</span>
                          <p className="font-semibold">{avgCpc > 0 ? `$${avgCpc.toFixed(2)}` : "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Negatives</span>
                          <p className="font-semibold flex items-center gap-0.5">
                            {negatives.length > 0 ? (
                              <><Ban className="h-2.5 w-2.5" />{negatives.length}</>
                            ) : "—"}
                          </p>
                        </div>
                      </div>

                      {/* Match type breakdown */}
                      {Object.keys(matchTypes).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(matchTypes).map(([mt, count]) => (
                            <Badge key={mt} variant="outline" className="text-[9px] h-4 px-1">
                              {MATCH_LABELS[mt] || mt}: {count}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Top keywords preview */}
                      <div className="space-y-0.5 mt-1">
                        {positives.slice(0, 3).map((kw) => (
                          <div key={kw.id} className="flex items-center justify-between text-[10px]">
                            <span className="truncate flex-1">{kw.name}</span>
                            <span className="text-muted-foreground ml-1 shrink-0">{formatVol(kw.avgMonthlySearches)}</span>
                          </div>
                        ))}
                        {positives.length > 3 && (
                          <p className="text-[10px] text-muted-foreground">+{positives.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">No keywords assigned</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {config && (
        <>
          {/* Bid strategy is driven by the phase Optimization Goal (single source of truth).
              We only render the conditional inputs (Target CPA / ROAS / Max CPC). */}
          {(() => {
            const bidStrategy = phase.googleBidStrategy || phase.optimizationGoal || "";
            const isTargetCpa = bidStrategy === "Target CPA" || bidStrategy === "TARGET_CPA";
            const isTargetRoas = bidStrategy === "Target ROAS" || bidStrategy === "TARGET_ROAS";
            const isManualCpc =
              bidStrategy === "Manual CPC" ||
              bidStrategy === "Maximum CPC" ||
              bidStrategy === "MANUAL_CPC" ||
              bidStrategy === "MAXIMUM_CPC";
            const hasInput = isTargetCpa || isTargetRoas || isManualCpc;
            if (!hasInput) return null;
            return (
              <div className="grid gap-4 md:grid-cols-2">
                {isTargetCpa && (
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
                {isTargetRoas && (
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
                {isManualCpc && (
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
            );
          })()}
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

          {/* Brand Guidelines (Performance Max only) */}
          {selectedType === "Performance Max" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch
                  id={`gads-brand-guidelines-${phase.id}`}
                  checked={phase.googleBrandGuidelines ?? false}
                  onCheckedChange={(v) => {
                    onUpdate("googleBrandGuidelines", v);
                    if (!v) onUpdate("googleBusinessName", "");
                  }}
                  className="h-4 w-7"
                />
                <Label htmlFor={`gads-brand-guidelines-${phase.id}`} className="text-xs">Brand Guidelines</Label>
              </div>
              {phase.googleBrandGuidelines && (
                <div className="ml-6 space-y-2">
                  <Label className="text-xs">Business Name <span className="text-destructive">*</span></Label>
                  <Input
                    className="h-8 text-xs"
                    value={phase.googleBusinessName || ""}
                    onChange={(e) => onUpdate("googleBusinessName", e.target.value)}
                    placeholder="Your business name"
                  />
                  <p className="text-[10px] text-muted-foreground">Required when Brand Guidelines is enabled. A logo asset must also be linked in your Google Ads account.</p>
                </div>
              )}
            </div>
          )}

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
                {loadingMC ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</div>
                ) : (
                  <Select
                    value={phase.googleMerchantCenterId || undefined}
                    onValueChange={(v) => onUpdate("googleMerchantCenterId", v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select Merchant Center" />
                    </SelectTrigger>
                    <SelectContent>
                      {merchantCenters.length === 0 ? (
                        <SelectItem value="none" disabled>No Merchant Centers linked</SelectItem>
                      ) : (
                        merchantCenters.map((mc) => (
                          <SelectItem key={mc.id} value={mc.merchantCenterId}>
                            {mc.merchantCenterName} ({mc.merchantCenterId})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
                <Label className="text-xs">Feed Label</Label>
                <Select
                  value={phase.googleFeedLabel || undefined}
                  onValueChange={(v) => onUpdate("googleFeedLabel", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select feed label" />
                  </SelectTrigger>
                  <SelectContent>
                    {feedLabels.length === 0 ? (
                      <SelectItem value="none" disabled>No feed labels found</SelectItem>
                    ) : (
                      feedLabels.map((fl) => (
                        <SelectItem key={fl.label} value={fl.label}>
                          {fl.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
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

          {/* Exclusion inputs */}
          {config.features.exclude && phase.googleExclude && (
            <div className="space-y-3 rounded-md border border-dashed p-3 bg-muted/30">
              <div className="flex items-center gap-1.5">
                <Ban className="h-3.5 w-3.5 text-destructive" />
                <Label className="text-xs font-medium">Exclusions</Label>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Prevent your ads from appearing for these terms, placements, or topics. One entry per line.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Negative Keywords</Label>
                  <Textarea
                    placeholder="e.g. free&#10;cheap&#10;competitor brand"
                    value={(phase.googleExcludedKeywords || []).join("\n")}
                    onChange={(e) =>
                      onUpdate(
                        "googleExcludedKeywords",
                        e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                      )
                    }
                    className="text-xs min-h-[70px]"
                  />
                </div>

                {config.targeting.placements.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Excluded Placements</Label>
                    <Textarea
                      placeholder="e.g. example.com&#10;youtube.com/@channel&#10;com.example.app"
                      value={(phase.googleExcludedPlacements || []).join("\n")}
                      onChange={(e) =>
                        onUpdate(
                          "googleExcludedPlacements",
                          e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                        )
                      }
                      className="text-xs min-h-[70px]"
                    />
                  </div>
                )}

                {config.targeting.topics && (
                  <div className="space-y-1">
                    <Label className="text-xs">Excluded Topics</Label>
                    <Textarea
                      placeholder="e.g. Sensitive Social Issues&#10;Tragedy & Conflict"
                      value={(phase.googleExcludedTopics || []).join("\n")}
                      onChange={(e) =>
                        onUpdate(
                          "googleExcludedTopics",
                          e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                        )
                      }
                      className="text-xs min-h-[70px]"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Excluded Content Labels</Label>
                  <MultiSelect
                    options={GOOGLE_CONTENT_LABEL_OPTIONS}
                    value={phase.googleExcludedContentLabels || []}
                    onChange={(vals) => onUpdate("googleExcludedContentLabels", vals)}
                    placeholder="Select content labels to exclude"
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Placements Selection */}
          {config.targeting.placements.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Placements</Label>
              <p className="text-[10px] text-muted-foreground">
                Select where your ads can appear. Available placements depend on the campaign type.
              </p>
              <div className="flex flex-wrap gap-2">
                {config.targeting.placements.map((placement) => {
                  const isSelected = (phase.googlePlacements || []).includes(placement);
                  return (
                    <div key={placement} className="flex items-center gap-1.5">
                      <Checkbox
                        id={`gads-placement-${phase.id}-${placement}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          const current = phase.googlePlacements || [];
                          onUpdate(
                            "googlePlacements",
                            checked
                              ? [...current, placement]
                              : current.filter((p) => p !== placement)
                          );
                        }}
                        className="h-3.5 w-3.5"
                      />
                      <label
                        htmlFor={`gads-placement-${phase.id}-${placement}`}
                        className="text-xs"
                      >
                        {placement}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
              {config.targeting.placements.length > 0 && (phase.googlePlacements || []).length > 0 && (
                <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-700 border-cyan-200">
                  {(phase.googlePlacements || []).length} Placements
                </Badge>
              )}
              {config.targeting.audienceSegments.map((seg) => (
                <Badge key={seg} variant="secondary" className="text-[10px]">
                  {seg}
                </Badge>
              ))}
            </div>
          </div>

          {/* Location Targeting Setting */}
          <div className="space-y-2">
            <Label className="text-xs">Location Targeting</Label>
            <Select
              value={phase.googleLocationTargeting || "PRESENCE_OR_INTEREST"}
              onValueChange={(v) => onUpdate("googleLocationTargeting", v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRESENCE_OR_INTEREST">
                  Presence or interest: People in, regularly in, or who've shown interest in your locations (recommended)
                </SelectItem>
                <SelectItem value="PRESENCE">
                  Presence: People in or regularly in your included locations
                </SelectItem>
              </SelectContent>
            </Select>
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
    </fieldset>
  );
}
