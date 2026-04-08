import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, X, GripVertical, Link2, ChevronDown, ChevronRight, Copy, Trash2, ExternalLink, Lock, Info, Search, ShieldCheck, Target, Swords, Ban } from "lucide-react";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useExtensionModeOptional } from "@/contexts/ExtensionModeContext";
import MetaAppSearch from "./MetaAppSearch";
import { Phase, AdSetSplitDimension, AdSetConfig } from "@/types/mediaplan";
import { format, addDays, differenceInDays, parseISO } from "date-fns";
import { platformAdFormats } from "@/utils/adFormats";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Switch } from "@/components/ui/switch";
import { CampaignPublisherConfig } from "./CampaignPublisherConfig";
import { TargetingConfigComponent } from "./TargetingConfig";
import { getOptimizationGoalForFocus } from "@/utils/strategyFocusMapping";
import { BudgetTypeApplyDialog } from "./BudgetTypeApplyDialog";
import { BudgetTypeToggleGroup } from "./BudgetTypeToggleGroup";
import { PhaseAudienceSelector } from "./PhaseAudienceSelector";
import { BroadTargetingAudiences } from "./BroadTargetingAudiences";
import { UnifiedTargeting, UnifiedTargetingConfig } from "./UnifiedTargeting";
import { TiktokPhaseConfig } from "./TiktokPhaseConfig";
import { MetaPhaseConfig } from "./MetaPhaseConfig";
import { GoogleAdsPhaseConfig } from "./GoogleAdsPhaseConfig";
import { PhaseTaxonomyInputs } from "./PhaseTaxonomyInputs";
import { PhaseTaxonomyPreview } from "./PhaseTaxonomyPreview";
import { useTaxonomyTemplates } from "@/hooks/useTaxonomyTemplates";
import { SplittableSection } from "./SplittableSection";
import { AdSetSplitManager } from "./AdSetSplitManager";
import { createInitialAdSets } from "@/utils/adSetSplitUtils";
import { detectTargetingType } from "@/utils/detectTargetingType";
import { getAudienceStrategyConfig, type AudienceStrategyConfig } from "@/utils/audienceStrategyMapping";
import { getPlacementsForSelection } from "@/utils/placements";
import { 
  getObjectivesForPlatform, 
  getOptimizationGoalsForObjective, 
  getDefaultOptimizationGoal,
  detectPlatformType,
  type ObjectiveMapping 
} from "@/utils/objectiveOptimizationMapping";
import {
  getDestinationsForObjective,
  getDestinationForOptimizationGoal,
  getDestinationsForGoal,
  destinationRequiresApp,
  destinationRequiresMessaging,
  destinationRequiresWebsite,
  META_APP_STORES,
  META_MESSAGING_MODES,
  TIKTOK_MESSAGING_APPS,
} from "@/utils/destinationOptions";
import { getTikTokSearchModeConfig } from "@/utils/tiktokOptimizationLocationMapping";
import { getObjectiveFromPhaseName } from "@/utils/phaseObjectiveMapping";

interface PhaseSchedulerProps {
  phases: Phase[];
  onPhasesChange: (phases: Phase[]) => void;
  /** Commits a manual structural edit (add/remove/duplicate) in one parent update to avoid transient auto-regeneration loops. */
  onManualPhasesChange?: (phases: Phase[]) => void;
  /** Signals parent to skip the next generic→market phase sync (prevents circular clobber). */
  onSkipNextSync?: () => void;
  /** Signals parent that the user manually added/removed/duplicated a phase (prevents auto-detect override). */
  onManualPhaseEdit?: () => void;
  startDate: string;
  endDate: string;
  platformId?: string;
  platformName: string;
  strategyFocus?: string;
  strategy?: string;
  marketTargeting?: {
    ageMin?: number;
    ageMax?: number;
    gender?: string;
    devices?: string[];
    languages?: string[];
    os?: string[];
  };
  adAccountDefaults?: {
    hasDefaults: boolean;
    conversionBudgetType?: string;
    nonConversionBudgetType?: string;
    // Meta placement defaults
    publisherPlatforms?: string[];
    positions?: {
      facebook?: string[];
      instagram?: string[];
      audience_network?: string[];
      messenger?: string[];
      threads?: string[];
    };
    metaAdvantagePlusPlacements?: boolean;
    // TikTok placement defaults
    tiktokPlacementType?: string;
    tiktokPlacements?: string[];
    // Meta destination defaults
    metaOptimizationLocation?: string;
    metaAppStore?: string;
    metaAppId?: string;
    metaMessagingMode?: string;
    metaMessengerEnabled?: boolean;
    metaInstagramDmEnabled?: boolean;
    metaWhatsappEnabled?: boolean;
    metaWhatsappNumber?: string;
    metaPageId?: string;
    metaInstagramAccountId?: string;
    metaLandingPageUrl?: string;
    // Meta advanced settings defaults
    metaBidStrategy?: string;
    metaBidAmount?: number;
    metaClickWindow?: number;
    metaViewWindow?: number;
    metaBillingEvent?: string;
    // TikTok destination defaults
    tiktokOptimizationLocation?: string;
    tiktokAppId?: string;
    tiktokAppName?: string;
    tiktokMessagingApp?: string;
    tiktokFacebookPageId?: string;
    tiktokMessageEventSet?: string;
    tiktokWhatsappNumber?: string;
    tiktokZaloAccountId?: string;
    tiktokLineBusinessId?: string;
    tiktokLandingPageUrl?: string;
    // TikTok advanced settings defaults
    tiktokBidStrategy?: string;
    tiktokBidAmount?: number;
    tiktokClickWindow?: number;
    tiktokViewWindow?: number;
    tiktokBillingEvent?: string;
    // Catalog & Product Set defaults
    metaCatalogId?: string;
    metaProductSetId?: string;
    tiktokCatalogId?: string;
    tiktokProductSetId?: string;
    // Google Ads defaults
    googleCustomerId?: string;
    googleLandingPageUrl?: string;
    googleBidStrategy?: string;
    googleTargetCpa?: number;
    googleTargetRoas?: number;
    googleMaxCpcBid?: number;
    googleCampaignObjective?: string;
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
    googleBrandGuidelines?: boolean;
    googleBusinessName?: string;
    // Meta Advantage+ defaults
    metaAdvantagePlusCampaign?: boolean;
    metaAdvantagePlusAudience?: boolean;
    metaAdvantagePlusCreative?: boolean;
    metaConversionCount?: string;
  };
  onApplyBudgetTypeToAll?: (budgetType: "daily" | "lifetime") => void;
  onOpenCustomizeBudgetTypes?: () => void;
  marketBudget?: number;
  adAccountId?: string;
  basicTargeting?: UnifiedTargetingConfig;
  // Activation-level context for taxonomy
  activationContext?: {
    activationName?: string;
    boNumber?: string;
    clientName?: string;
    teamName?: string;
    totalBudget?: number;
    market?: string;
    markets?: string[];
    platformBudget?: number;
  };
  // Expand/collapse signal from parent
  phaseExpandSignal?: { action: 'expand' | 'collapse'; target?: string; counter: number };
  // Taxonomy validation callback - reports if all custom fields are complete
  onTaxonomyValidationChange?: (isComplete: boolean, totalMissing: number) => void;
}

interface DraggingState {
  phaseId: string;
  type: 'start' | 'end' | 'move';
  initialX: number;
  initialStartPos?: number;
  initialEndPos?: number;
}

export function PhaseScheduler({ 
  phases, 
  onPhasesChange,
  onManualPhasesChange,
  onSkipNextSync,
  onManualPhaseEdit,
  startDate, 
  endDate, 
  platformId = "meta", 
  platformName, 
  strategyFocus, 
  strategy, 
  marketTargeting,
  adAccountDefaults,
  onApplyBudgetTypeToAll,
  onOpenCustomizeBudgetTypes,
  marketBudget,
  adAccountId,
  basicTargeting,
  activationContext,
  onTaxonomyValidationChange,
  phaseExpandSignal,
}: PhaseSchedulerProps) {
  const extensionMode = useExtensionModeOptional();
  const isGooglePlatform = platformId?.toLowerCase() === 'google' || platformId?.toLowerCase() === 'google_ads';
  const taxonomyPlatform: 'meta' | 'tiktok' | 'google' = isGooglePlatform ? 'google' : platformId?.toLowerCase() === 'tiktok' ? 'tiktok' : 'meta';
  const { templates: taxonomyTemplates, loading: taxonomyLoading, refresh: refreshTaxonomy } = useTaxonomyTemplates(adAccountId, taxonomyPlatform);
  const [dragging, setDragging] = useState<DraggingState | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<{ [key: string]: boolean }>({});
  const prevSignalRef = useRef(0);

  // Handle expand/collapse signal from parent
  useEffect(() => {
    if (phaseExpandSignal && phaseExpandSignal.counter !== prevSignalRef.current) {
      prevSignalRef.current = phaseExpandSignal.counter;
      if (phaseExpandSignal.target) {
        // Toggle phases with matching name
        setExpandedPhases(prev => {
          const newState = { ...prev };
          const matchingPhases = phases.filter(p => p.name === phaseExpandSignal.target);
          const allExpanded = matchingPhases.every(p => prev[p.id]);
          matchingPhases.forEach(p => { newState[p.id] = !allExpanded; });
          return newState;
        });
      } else {
        // Expand or collapse all
        const newState: { [key: string]: boolean } = {};
        phases.forEach(p => { newState[p.id] = phaseExpandSignal.action === 'expand'; });
        setExpandedPhases(newState);
      }
    }
  }, [phaseExpandSignal, phases]);
  const [budgetTypeDialogOpen, setBudgetTypeDialogOpen] = useState(false);
  const [pendingBudgetType, setPendingBudgetType] = useState<"daily" | "lifetime" | null>(null);
  const [pendingBudgetPhaseId, setPendingBudgetPhaseId] = useState<string | null>(null);
  const [optimisticBudgetTypes, setOptimisticBudgetTypes] = useState<Record<string, Phase["budgetType"] | undefined>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const splitManagerRefs = useRef<{ [phaseId: string]: HTMLDivElement | null }>({});
  const [scrollToSplitPhaseId, setScrollToSplitPhaseId] = useState<string | null>(null);

  // Keep latest phases in a ref so multiple rapid updates (e.g. switching to Manual placements
  // which updates strategy + publishers + positions) don't clobber each other due to stale closures.
  const phasesRef = useRef<Phase[]>(phases);
  useEffect(() => {
    phasesRef.current = phases;
  }, [phases]);

  // Clear optimistic budget type once it matches the canonical phases prop.
  useEffect(() => {
    setOptimisticBudgetTypes((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;

      let changed = false;
      const next = { ...prev };
      for (const phaseId of keys) {
        const canonical = phases.find((p) => p.id === phaseId)?.budgetType;
        if (canonical === next[phaseId]) {
          delete next[phaseId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [phases]);
  
  // Track previous default split dimensions to detect when they're cleared
  const prevDefaultSplitDimensionRef = useRef<AdSetSplitDimension | undefined>(basicTargeting?.defaultAdSetSplitDimension);
  const prevDefaultSplitDimensionPerPlatformRef = useRef<Record<string, AdSetSplitDimension> | undefined>(basicTargeting?.defaultAdSetSplitDimensionPerPlatform);
  
  // When default split dimension is cleared, remove inherited splits from phases
  useEffect(() => {
    const prevDimension = prevDefaultSplitDimensionRef.current;
    const prevDimPerPlatform = prevDefaultSplitDimensionPerPlatformRef.current;
    const currentDimension = basicTargeting?.defaultAdSetSplitDimension;
    const currentDimPerPlatform = basicTargeting?.defaultAdSetSplitDimensionPerPlatform;
    
    // Update refs for next comparison
    prevDefaultSplitDimensionRef.current = currentDimension;
    prevDefaultSplitDimensionPerPlatformRef.current = currentDimPerPlatform;
    
    // Collect all dimensions that were previously set but are now cleared
    const clearedDimensions = new Set<AdSetSplitDimension>();
    
    // Check legacy single dimension
    const wasLegacyValid = prevDimension && prevDimension !== 'none';
    const isLegacyNowCleared = !currentDimension || currentDimension === 'none';
    if (wasLegacyValid && isLegacyNowCleared) {
      clearedDimensions.add(prevDimension);
    }
    
    // Check per-platform dimensions
    if (prevDimPerPlatform) {
      Object.entries(prevDimPerPlatform).forEach(([platformId, prevPlatformDim]) => {
        if (prevPlatformDim && prevPlatformDim !== 'none') {
          const currentPlatformDim = currentDimPerPlatform?.[platformId];
          if (!currentPlatformDim || currentPlatformDim === 'none') {
            clearedDimensions.add(prevPlatformDim);
          }
        }
      });
    }
    
    if (clearedDimensions.size > 0) {
      console.log('🧹 Default split dimension(s) cleared:', Array.from(clearedDimensions));
      
      // Find phases that have any of the cleared split dimensions
      const phasesWithInheritedSplit = phasesRef.current.filter(phase => 
        phase.adSetSplitDimension && clearedDimensions.has(phase.adSetSplitDimension)
      );
      
      if (phasesWithInheritedSplit.length > 0) {
        console.log(`🧹 Clearing splits from ${phasesWithInheritedSplit.length} phase(s)`);
        const updatedPhases = phasesRef.current.map(phase => {
          if (phase.adSetSplitDimension && clearedDimensions.has(phase.adSetSplitDimension)) {
            return {
              ...phase,
              adSetSplitDimension: undefined,
              adSets: undefined,
              useCBO: undefined,
            };
          }
          return phase;
        });
        onPhasesChange(updatedPhases);
      }
    }
  }, [basicTargeting?.defaultAdSetSplitDimension, basicTargeting?.defaultAdSetSplitDimensionPerPlatform, onPhasesChange]);
  
  // Taxonomy validation state - track per phase per entity type
  const [taxonomyValidation, setTaxonomyValidation] = useState<Record<string, { campaign: boolean; adset: boolean; campaignMissing: number; adsetMissing: number }>>({});
  
  // Store callback in ref to avoid re-render loops
  const taxonomyValidationCallbackRef = useRef(onTaxonomyValidationChange);
  taxonomyValidationCallbackRef.current = onTaxonomyValidationChange;
  
  // Clean up stale phase IDs from validation state when phases change
  useEffect(() => {
    const currentPhaseIds = new Set(phases.map(p => p.id));
    setTaxonomyValidation(prev => {
      const cleanedValidation: typeof prev = {};
      let hasChanges = false;
      Object.entries(prev).forEach(([phaseId, value]) => {
        if (currentPhaseIds.has(phaseId)) {
          cleanedValidation[phaseId] = value;
        } else {
          hasChanges = true;
        }
      });
      return hasChanges ? cleanedValidation : prev;
    });
  }, [phases]);
  
  // Report aggregated validation status to parent
  useEffect(() => {
    const totalMissing = Object.values(taxonomyValidation).reduce((sum, v) => sum + v.campaignMissing + v.adsetMissing, 0);
    const allComplete = Object.values(taxonomyValidation).length === 0 || Object.values(taxonomyValidation).every(v => v.campaign && v.adset);
    taxonomyValidationCallbackRef.current?.(allComplete, totalMissing);
  }, [taxonomyValidation]);
  
  // Auto-scroll to split manager when a split is activated
  useEffect(() => {
    if (scrollToSplitPhaseId) {
      // Small delay to allow the DOM to render
      const timer = setTimeout(() => {
        const el = splitManagerRefs.current[scrollToSplitPhaseId];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setScrollToSplitPhaseId(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scrollToSplitPhaseId]);
  
  // Helper to update taxonomy validation for a specific phase
  const handleTaxonomyValidation = useCallback((phaseId: string, entityType: 'campaign' | 'adset', isComplete: boolean, missingCount: number) => {
    setTaxonomyValidation(prev => {
      const current = prev[phaseId];
      const newValues = {
        campaign: entityType === 'campaign' ? isComplete : (current?.campaign ?? true),
        adset: entityType === 'adset' ? isComplete : (current?.adset ?? true),
        campaignMissing: entityType === 'campaign' ? missingCount : (current?.campaignMissing ?? 0),
        adsetMissing: entityType === 'adset' ? missingCount : (current?.adsetMissing ?? 0),
      };
      // Only update if values changed
      if (current && 
          current.campaign === newValues.campaign && 
          current.adset === newValues.adset &&
          current.campaignMissing === newValues.campaignMissing &&
          current.adsetMissing === newValues.adsetMissing) {
        return prev;
      }
      return { ...prev, [phaseId]: newValues };
    });
  }, []);

  // Helper to update custom taxonomy values for a phase
  const handleTaxonomyValueChange = (phaseId: string, entityType: 'campaign' | 'adset', paramId: string, value: string) => {
    const updatedPhases = phases.map(phase => {
      if (phase.id === phaseId) {
        const valuesKey = entityType === 'campaign' ? 'campaignTaxonomyValues' : 'adsetTaxonomyValues';
        return {
          ...phase,
          [valuesKey]: {
            ...(phase[valuesKey] || {}),
            [paramId]: value
          }
        };
      }
      return phase;
    });
    onPhasesChange(updatedPhases);
  };

  // Helper to get default publishers and placements for platforms
  const getDefaultPublisherConfig = () => {
    // For TikTok, use adAccountDefaults if available
    if (platformId?.toLowerCase() === 'tiktok' || platformName.toLowerCase().includes('tiktok')) {
      return {
        tiktokPlacementType: adAccountDefaults?.tiktokPlacementType || 'PLACEMENT_TYPE_AUTOMATIC',
        tiktokPlacements: adAccountDefaults?.tiktokPlacements || ['PLACEMENT_TIKTOK'],
        publisherPlatforms: [],
        positions: {},
        advantagePlusPlacements: undefined
      };
    }
    
    // For Meta, use adAccountDefaults if available
    if (platformName.includes("Meta")) {
      // Use defaults from adAccountDefaults if available
      if (adAccountDefaults?.publisherPlatforms && adAccountDefaults.publisherPlatforms.length > 0) {
        return {
          publisherPlatforms: adAccountDefaults.publisherPlatforms,
          positions: adAccountDefaults.positions || {},
          advantagePlusPlacements: adAccountDefaults.metaAdvantagePlusPlacements ?? true
        };
      }
      
      // Fallback to hardcoded defaults
      const publishers = ["facebook", "instagram", "audience_network", "messenger", "threads"];
      const placementOptions: Record<string, Record<string, string[]>> = {
        "Facebook (Meta)": {
          facebook: ["feed", "instant_article", "instream_video", "marketplace", "right_column", "search", "video_feeds", "story"],
          instagram: ["stream", "story", "explore", "explore_home", "reels"],
          audience_network: ["native_banner_interstitial", "instream_video", "rewarded_video"],
          messenger: ["messenger_home", "sponsored_messages", "story"],
          threads: ["threads"]
        }
      };
      const placements = placementOptions["Facebook (Meta)"];
      const positions: any = {};
      publishers.forEach(pub => {
        if (placements[pub]) positions[pub] = placements[pub];
      });
      return { publisherPlatforms: publishers, positions, advantagePlusPlacements: true };
    }
    return { publisherPlatforms: [], positions: {}, advantagePlusPlacements: undefined };
  };

  // Initialize default phases if empty
  useEffect(() => {
    if (phases.length !== 0) return;
    if (!startDate || !endDate) return;

    const campaignStart = parseISO(startDate);
    const campaignEnd = parseISO(endDate);
    const totalDays = differenceInDays(campaignEnd, campaignStart);

    const defaultPublisherConfig = getDefaultPublisherConfig();

    // IMPORTANT: keep objective + optimizationGoal values aligned with objectiveOptimizationMapping.ts
    // so dependent fields (Optimization Location + Landing Page URL) can auto-populate.
    const detected = detectPlatformType(platformName);
    const platformKey =
      detected ?? (platformName.toLowerCase().includes("tiktok") ? "tiktok" : "meta");

    const goalForObjective = (objective?: string) => {
      if (!objective) return undefined;
      if (!platformKey) return undefined;
      return getDefaultOptimizationGoal(platformKey, objective) || undefined;
    };

    // TikTok defaults: tCPA (COST_CAP) for Traffic and Sales/Conversions objectives
    const tiktokBidDefaults = (objective?: string): Partial<Phase> => {
      if (platformKey !== 'tiktok' || !objective) return {};
      const upper = objective.toUpperCase();
      if (['TRAFFIC', 'CONVERSIONS', 'SALES'].includes(upper)) {
        return { tiktokBidStrategy: 'COST_CAP' };
      }
      return {};
    };

    if (totalDays <= 0) return;

    // For manual strategy, start with one empty phase
    if (strategy === "manual") {
      const manualPhase: Phase = {
        id: `phase-${Date.now()}`,
        name: "Phase 1",
        startDate: format(campaignStart, "yyyy-MM-dd"),
        endDate: format(campaignEnd, "yyyy-MM-dd"),
        budgetPercentage: 100,
        assetTypes: [],
        isLoyaltyPhase: false,
        ...defaultPublisherConfig,
      };
      onPhasesChange([manualPhase]);
      return;
    }

    // Default phases for auto-detect and full-funnel
    const awarenessObjective = strategyFocus
      ? getDefaultObjectiveForFocus(strategyFocus, "Awareness")
      : undefined;
    const considerationObjective = strategyFocus
      ? getDefaultObjectiveForFocus(strategyFocus, "Consideration")
      : undefined;
    const conversionObjective = strategyFocus
      ? getDefaultObjectiveForFocus(strategyFocus, "Conversion")
      : undefined;

    const defaultPhases: Phase[] = [
      {
        id: "phase-awareness",
        name: "Awareness",
        startDate: format(campaignStart, "yyyy-MM-dd"),
        endDate: format(addDays(campaignStart, Math.floor(totalDays * 0.5)), "yyyy-MM-dd"),
        budgetPercentage: 50,
        assetTypes: [],
        isLoyaltyPhase: false,
        objective: awarenessObjective,
        optimizationGoal: goalForObjective(awarenessObjective),
        ...defaultPublisherConfig,
        ...tiktokBidDefaults(awarenessObjective),
      },
      {
        id: "phase-consideration",
        name: "Consideration",
        startDate: format(addDays(campaignStart, Math.floor(totalDays * 0.5)), "yyyy-MM-dd"),
        endDate: format(addDays(campaignStart, Math.floor(totalDays * 0.8)), "yyyy-MM-dd"),
        budgetPercentage: 30,
        assetTypes: [],
        isLoyaltyPhase: false,
        objective: considerationObjective,
        optimizationGoal: goalForObjective(considerationObjective),
        ...defaultPublisherConfig,
        ...tiktokBidDefaults(considerationObjective),
      },
      {
        id: "phase-conversion",
        name: "Conversion",
        startDate: format(addDays(campaignStart, Math.floor(totalDays * 0.8)), "yyyy-MM-dd"),
        endDate: format(campaignEnd, "yyyy-MM-dd"),
        budgetPercentage: 20,
        assetTypes: [],
        isLoyaltyPhase: false,
        objective: conversionObjective,
        optimizationGoal: goalForObjective(conversionObjective),
        ...defaultPublisherConfig,
        ...tiktokBidDefaults(conversionObjective),
      },
      {
        id: "phase-loyalty",
        name: "Loyalty",
        startDate: format(campaignStart, "yyyy-MM-dd"),
        endDate: format(campaignEnd, "yyyy-MM-dd"),
        budgetPercentage: 0,
        assetTypes: [],
        isLoyaltyPhase: true,
        objective: platformKey === "tiktok" ? "CONVERSIONS" : "OUTCOME_SALES",
        optimizationGoal: "VALUE",
        ...defaultPublisherConfig,
        ...tiktokBidDefaults(platformKey === "tiktok" ? "CONVERSIONS" : "OUTCOME_SALES"),
      },
    ];

    onPhasesChange(defaultPhases);
  }, [startDate, endDate, strategy, strategyFocus, platformName, phases.length]);


  // Track if we've already applied defaults for each phase (by phase ID + objective) to prevent re-triggering
  const appliedDestinationDefaultsRef = useRef<Map<string, string>>(new Map());
  const adAccountDefaultsFingerprint = useMemo(() => JSON.stringify(adAccountDefaults ?? null), [adAccountDefaults]);
  
  // Auto-populate destination fields from defaults when phases have objectives that require destinations
  // This handles the case where phases are auto-generated with objectives already set (e.g., auto-generate strategy)
  // IMPORTANT: Use a stable ref to avoid triggering this effect when onPhasesChange identity changes
  const onPhasesChangeRef = useRef(onPhasesChange);
  onPhasesChangeRef.current = onPhasesChange;

  const commitManualPhaseStructureChange = useCallback((updatedPhases: Phase[]) => {
    if (onManualPhasesChange) {
      onManualPhasesChange(updatedPhases);
      return;
    }

    onPhasesChange(updatedPhases);
    onManualPhaseEdit?.();
  }, [onManualPhaseEdit, onManualPhasesChange, onPhasesChange]);

   // Guard ref to prevent normalization loops — tracks whether initial normalization has run
  const lastNormalizedPhasesRef = useRef<string>('');
  const hasNormalizedTikTokRef = useRef(false);
  const hasNormalizedGoogleRef = useRef(false);

  // Normalize legacy TikTok objective/goal values so the dropdowns can hydrate saved campaigns.
  // Uses phasesRef to avoid re-firing on every phases change — only triggers on platform identity change.
  useEffect(() => {
    const isTikTok =
      platformId?.toLowerCase() === "tiktok" || platformName.toLowerCase().includes("tiktok");

    if (!isTikTok) return;
    
    // Only normalize once on initial load (legacy data hydration)
    if (hasNormalizedTikTokRef.current) return;

    // Defer to next tick so phasesRef has the latest hydrated phases
    const timer = setTimeout(() => {
      const currentPhases = phasesRef.current;
      if (currentPhases.length === 0) return;

      const tikTokMappings = getObjectivesForPlatform("tiktok");
      const validTikTokObjectives = new Set(tikTokMappings.map((o) => o.value));
      const validTikTokGoals = new Set(tikTokMappings.flatMap((o) => o.optimizationGoals.map((g) => g.value)));

      const toCanonical = (input: string) =>
        input
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "");

      const normalizeObjective = (objective?: string) => {
        if (!objective) return objective;

        const upper = objective.toUpperCase();

        // Map Meta-style objectives to TikTok equivalents
        const metaToTikTokObjective: Record<string, string> = {
          "OUTCOME_AWARENESS": "REACH",
          "OUTCOME_TRAFFIC": "TRAFFIC",
          "OUTCOME_ENGAGEMENT": "COMMUNITY_INTERACTION",
          "OUTCOME_LEADS": "LEAD_GENERATION",
          "OUTCOME_SALES": "CONVERSIONS",
          "OUTCOME_APP_PROMOTION": "APP_PROMOTION",
        };
        
        if (metaToTikTokObjective[upper]) {
          return metaToTikTokObjective[upper];
        }

        // Common legacy labels
        if (["SALES", "CONVERSION", "CONVERSIONS"].includes(upper)) return "CONVERSIONS";

        const candidate = toCanonical(objective);
        if (validTikTokObjectives.has(candidate)) return candidate;

        // Handle labels like "Conversions / Sales" or "Product Sales (Catalog)"
        if (candidate.startsWith("CONVERSIONS")) return "CONVERSIONS";
        if (candidate.startsWith("PRODUCT_SALES")) return "PRODUCT_SALES";

        return objective;
      };

      const normalizeGoal = (goal?: string) => {
        if (!goal) return goal;
        const upper = goal.toUpperCase();

        // Map Meta-style optimization goals to TikTok equivalents
        const metaToTikTokGoal: Record<string, string> = {
          "REACH": "REACH",
          "LINK_CLICKS": "CLICK",
          "LANDING_PAGE_VIEWS": "LANDING_PAGE_VIEW",
          "OFFSITE_CONVERSIONS": "CONVERT",
          "APP_INSTALLS": "APP_INSTALL",
          "APP_EVENTS": "APP_EVENT",
          "LEAD_GENERATION": "FORM",
          "THRUPLAY": "VIDEO_VIEW",
          "POST_ENGAGEMENT": "PROFILE_VISIT",
          "CONVERSATIONS": "MESSAGING",
          "VALUE": "VALUE",
        };
        
        if (metaToTikTokGoal[upper]) {
          return metaToTikTokGoal[upper];
        }

        // Common legacy labels
        if (["CONVERSION", "CONVERSIONS"].includes(upper)) return "CONVERT";
        if (["CONVERSATION"].includes(upper)) return "MESSAGING";

        const candidate = toCanonical(goal);
        if (validTikTokGoals.has(candidate)) return candidate;

        // Handle pluralization
        if (candidate === "LANDING_PAGE_VIEWS") return "LANDING_PAGE_VIEW";

        return goal;
      };

      let changed = false;

      const updated = currentPhases.map((p) => {
        const objective = normalizeObjective(p.objective);
        const optimizationGoal = normalizeGoal(p.optimizationGoal);
        
        // Auto-detect Search campaign type from phase name (only on first load, not if user explicitly toggled)
        let tiktokCampaignType = p.tiktokCampaignType;
        if (platformId?.toLowerCase() === 'tiktok' && !p.tiktokCampaignType && p.name?.toLowerCase().includes('search')) {
          tiktokCampaignType = 'Search';
        }
        
        // For search phases, ensure the objective is search-compatible
        // PRODUCT_SALES is not valid for search — remap to CONVERSIONS
        let finalObjective = objective;
        if (tiktokCampaignType === 'Search' && finalObjective) {
          const searchCfg = getTikTokSearchModeConfig(finalObjective);
          if (!searchCfg) {
            // Objective not supported for search — remap to CONVERSIONS (most common search objective)
            finalObjective = 'CONVERSIONS';
          }
        }
        
        // If search mode is active, auto-correct optimization goal
        let finalGoal = optimizationGoal;
        if (tiktokCampaignType === 'Search' && finalObjective) {
          const searchCfg = getTikTokSearchModeConfig(finalObjective);
          if (searchCfg && finalGoal && !searchCfg.allowedGoals.includes(finalGoal)) {
            finalGoal = searchCfg.allowedGoals[0] || finalGoal;
          }
        }

        if (finalObjective !== p.objective || finalGoal !== p.optimizationGoal || tiktokCampaignType !== p.tiktokCampaignType) {
          changed = true;
          return { ...p, objective: finalObjective, optimizationGoal: finalGoal, tiktokCampaignType };
        }

        return p;
      });

      hasNormalizedTikTokRef.current = true;
      
      if (changed) {
        phasesRef.current = updated;
        onPhasesChangeRef.current(updated);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [platformId, platformName]);

  // Normalize legacy Meta-style objective/goal values so Google Ads dropdowns hydrate correctly.
  // Only runs once on initial load (legacy data hydration) to prevent cascading re-renders.
  // Uses phasesRef to avoid re-firing on every phases change.
  useEffect(() => {
    const isGoogle =
      platformId?.toLowerCase() === "google" ||
      platformId?.toLowerCase() === "google_ads" ||
      platformName.toLowerCase().includes("google");

    if (!isGoogle) return;

    // Only normalize once on initial load (legacy data hydration)
    if (hasNormalizedGoogleRef.current) return;

    // Defer to next tick so phasesRef has the latest hydrated phases
    const timer = setTimeout(() => {
      const currentPhases = phasesRef.current;
      if (currentPhases.length === 0) return;

      const googleMappings = getObjectivesForPlatform("google");
      const validGoogleObjectives = new Set(googleMappings.map((o) => o.value));

      let changed = false;

      const updated = currentPhases.map((p) => {
        const fallback = getObjectiveFromPhaseName(p.name || "Conversion", strategyFocus, "google");

        const objectiveNeedsFix = !p.objective || !validGoogleObjectives.has(p.objective);
        const objective = objectiveNeedsFix ? fallback.objective : p.objective;

        const validGoalValues = new Set(
          getOptimizationGoalsForObjective("google", objective).map((g) => g.value)
        );

        const optimizationGoalNeedsFix =
          !p.optimizationGoal || !validGoalValues.has(p.optimizationGoal);

        const fallbackGoal = validGoalValues.has(fallback.optimizationGoal)
          ? fallback.optimizationGoal
          : (getDefaultOptimizationGoal("google", objective) || undefined);

        const optimizationGoal = optimizationGoalNeedsFix
          ? fallbackGoal
          : p.optimizationGoal;

        if (objective !== p.objective || optimizationGoal !== p.optimizationGoal) {
          changed = true;
          return { ...p, objective, optimizationGoal };
        }

        return p;
      });

      hasNormalizedGoogleRef.current = true;

      if (changed) {
        phasesRef.current = updated;
        onPhasesChangeRef.current(updated);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [platformId, platformName, strategyFocus]);

  // Destination defaults effect — uses a fingerprint to avoid re-running when phases change
  // from unrelated updates (e.g. budget type, name edits). Only processes phases whose
  // objective hasn't been handled yet (tracked by appliedDestinationDefaultsRef).
  const destinationDefaultsFingerprint = useMemo(() => {
    // Only re-run when a phase has an objective we haven't processed yet
    return phases
      .filter(p => p.objective && appliedDestinationDefaultsRef.current.get(p.id) !== p.objective)
      .map(p => `${p.id}:${p.objective}`)
      .join('|');
  }, [phases]);

  useEffect(() => {
    if (!adAccountDefaults || phases.length === 0) return;
    if (!destinationDefaultsFingerprint) return; // All phases already processed
    
    const currentPhases = phasesRef.current;
    const isTikTok = platformName.toLowerCase().includes('tiktok');
    const isMeta = platformName.toLowerCase().includes('meta');
    const isGoogle = platformId?.toLowerCase() === 'google' || platformId?.toLowerCase() === 'google_ads' || platformName.toLowerCase().includes('google');
    const platformType = isTikTok ? "tiktok" : isMeta ? "meta" : "google";
    
    let hasUpdates = false;
    const updatedPhases = currentPhases.map(phase => {
      // Skip phases without objectives
      if (!phase.objective) return phase;
      
      // Skip if we've already processed this phase with this objective
      if (appliedDestinationDefaultsRef.current.get(phase.id) === phase.objective) return phase;
      
      const validDestinations = (isMeta || isTikTok) ? getDestinationsForObjective(platformType as "meta" | "tiktok", phase.objective) : [];
      if (validDestinations.length === 0 && !isGoogle) {
        // Mark as processed even if no destinations needed
        appliedDestinationDefaultsRef.current.set(phase.id, phase.objective);
        return phase;
      }
      
      const updatedPhase = { ...phase };
      let phaseHasUpdates = false;
      
      if (isMeta) {
        // Check if optimization goal requires a specific destination
        const goalRequiredDestination = phase.optimizationGoal ? getDestinationForOptimizationGoal(phase.optimizationGoal) : null;
        
        // Auto-populate Meta destination if missing
        if (!phase.metaOptimizationLocation) {
          // First priority: use destination required by optimization goal
          if (goalRequiredDestination && validDestinations.some(d => d.value === goalRequiredDestination)) {
            phaseHasUpdates = true;
            updatedPhase.metaOptimizationLocation = goalRequiredDestination;
          }
          // Second priority: use account default destination
          else if (adAccountDefaults.metaOptimizationLocation) {
            const defaultDest = adAccountDefaults.metaOptimizationLocation;
            if (validDestinations.some(d => d.value === defaultDest)) {
              phaseHasUpdates = true;
              updatedPhase.metaOptimizationLocation = defaultDest;
            }
          }
          
          // Auto-populate related fields based on the set destination
          const setDest = updatedPhase.metaOptimizationLocation;
          if (setDest === 'WEBSITE') {
            if (!phase.metaLandingPageUrl && adAccountDefaults.metaLandingPageUrl) {
              phaseHasUpdates = true;
              updatedPhase.metaLandingPageUrl = adAccountDefaults.metaLandingPageUrl;
            }
          } else if (setDest === 'APP') {
            updatedPhase.metaAppStore = phase.metaAppStore || adAccountDefaults.metaAppStore;
            updatedPhase.metaAppId = phase.metaAppId || adAccountDefaults.metaAppId;
          } else if (setDest === 'MESSAGING_APPS') {
            updatedPhase.metaMessagingMode = phase.metaMessagingMode || adAccountDefaults.metaMessagingMode;
            updatedPhase.metaMessengerEnabled = phase.metaMessengerEnabled !== undefined ? phase.metaMessengerEnabled : adAccountDefaults.metaMessengerEnabled;
            updatedPhase.metaInstagramDmEnabled = phase.metaInstagramDmEnabled !== undefined ? phase.metaInstagramDmEnabled : adAccountDefaults.metaInstagramDmEnabled;
            updatedPhase.metaWhatsappEnabled = phase.metaWhatsappEnabled !== undefined ? phase.metaWhatsappEnabled : adAccountDefaults.metaWhatsappEnabled;
            updatedPhase.metaWhatsappNumber = phase.metaWhatsappNumber || adAccountDefaults.metaWhatsappNumber;
            updatedPhase.metaPageId = phase.metaPageId || adAccountDefaults.metaPageId;
            updatedPhase.metaInstagramAccountId = phase.metaInstagramAccountId || adAccountDefaults.metaInstagramAccountId;
          }
        }
        // Always populate landing page URL if missing (fallback for when WEBSITE destination isn't explicitly set)
        if (!updatedPhase.metaLandingPageUrl && !phase.metaLandingPageUrl && adAccountDefaults.metaLandingPageUrl) {
          phaseHasUpdates = true;
          updatedPhase.metaLandingPageUrl = adAccountDefaults.metaLandingPageUrl;
        }
      } else if (isTikTok) {
        // Auto-populate TikTok destination if missing
        if (!phase.tiktokOptimizationLocation && adAccountDefaults.tiktokOptimizationLocation) {
          const defaultDest = adAccountDefaults.tiktokOptimizationLocation;
          if (validDestinations.some(d => d.value === defaultDest)) {
            phaseHasUpdates = true;
            updatedPhase.tiktokOptimizationLocation = defaultDest;
            if (defaultDest === 'App') {
              updatedPhase.tiktokAppId = phase.tiktokAppId || adAccountDefaults.tiktokAppId;
              updatedPhase.tiktokAppName = phase.tiktokAppName || adAccountDefaults.tiktokAppName;
            } else if (defaultDest === 'Instant Messaging Apps') {
              updatedPhase.tiktokMessagingApp = phase.tiktokMessagingApp || adAccountDefaults.tiktokMessagingApp;
              updatedPhase.tiktokFacebookPageId = phase.tiktokFacebookPageId || adAccountDefaults.tiktokFacebookPageId;
              updatedPhase.tiktokMessageEventSet = phase.tiktokMessageEventSet || adAccountDefaults.tiktokMessageEventSet;
              updatedPhase.tiktokWhatsappNumber = phase.tiktokWhatsappNumber || adAccountDefaults.tiktokWhatsappNumber;
              updatedPhase.tiktokZaloAccountId = phase.tiktokZaloAccountId || adAccountDefaults.tiktokZaloAccountId;
              updatedPhase.tiktokLineBusinessId = phase.tiktokLineBusinessId || adAccountDefaults.tiktokLineBusinessId;
            }
          }
        }
        // Always populate landing page URL if missing
        if (!phase.tiktokLandingPageUrl && adAccountDefaults.tiktokLandingPageUrl) {
          phaseHasUpdates = true;
          updatedPhase.tiktokLandingPageUrl = adAccountDefaults.tiktokLandingPageUrl;
        }
      } else if (isGoogle) {
        // Auto-populate Google Ads landing page URL and bid strategy from defaults
        if (!phase.googleLandingPageUrl && adAccountDefaults.googleLandingPageUrl) {
          phaseHasUpdates = true;
          updatedPhase.googleLandingPageUrl = adAccountDefaults.googleLandingPageUrl;
        }
        if (!phase.googleBidStrategy && adAccountDefaults.googleBidStrategy) {
          phaseHasUpdates = true;
          updatedPhase.googleBidStrategy = adAccountDefaults.googleBidStrategy;
        }
        if (phase.googleTargetCpa === undefined && adAccountDefaults.googleTargetCpa) {
          phaseHasUpdates = true;
          updatedPhase.googleTargetCpa = adAccountDefaults.googleTargetCpa;
        }
        if (phase.googleTargetRoas === undefined && adAccountDefaults.googleTargetRoas) {
          phaseHasUpdates = true;
          updatedPhase.googleTargetRoas = adAccountDefaults.googleTargetRoas;
        }
        if (phase.googleMaxCpcBid === undefined && adAccountDefaults.googleMaxCpcBid) {
          phaseHasUpdates = true;
          updatedPhase.googleMaxCpcBid = adAccountDefaults.googleMaxCpcBid;
        }
      }
      
      // Mark this phase as processed with this objective
      appliedDestinationDefaultsRef.current.set(phase.id, phase.objective);
      
      if (phaseHasUpdates) {
        hasUpdates = true;
      }
      
      return phaseHasUpdates ? updatedPhase : phase;
    });
    
    if (hasUpdates) {
      phasesRef.current = updatedPhases;
      onPhasesChangeRef.current(updatedPhases);
    }
  }, [destinationDefaultsFingerprint, adAccountDefaultsFingerprint, platformName, platformId]);

  // Auto-populate Meta placement defaults from adAccountDefaults.
  // Important: defaults can change AFTER phases are created (e.g. user selects ad account).
  // We update phases only when they are still using the previous defaults (or empty), to avoid overriding user edits.
  const prevMetaPlacementDefaultsRef = useRef<{
    publisherPlatforms?: string[];
    positions?: Record<string, any>;
    metaAdvantagePlusPlacements?: boolean;
  } | null>(null);

  const arraysEqual = (a?: string[], b?: string[]) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  };

  const jsonEqual = (a: any, b: any) => {
    return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  };

  useEffect(() => {
    if (!adAccountDefaults || phases.length === 0) return;

    const isMeta = platformName.toLowerCase().includes("meta");
    if (!isMeta) return;

    const currentPublishers = adAccountDefaults.publisherPlatforms || [];
    const currentPositions = adAccountDefaults.positions || {};

    const hasDefaultPublishers = currentPublishers.length > 0;
    const hasDefaultPositions = Object.keys(currentPositions).length > 0;

    if (!hasDefaultPublishers && !hasDefaultPositions) return;

    const prev = prevMetaPlacementDefaultsRef.current;

    const publishersChanged =
      !!prev?.publisherPlatforms &&
      hasDefaultPublishers &&
      !arraysEqual(prev.publisherPlatforms, currentPublishers);

    const positionsChanged =
      !!prev?.positions &&
      hasDefaultPositions &&
      !jsonEqual(prev.positions, currentPositions);

    const strategyChanged =
      prev?.metaAdvantagePlusPlacements != null &&
      adAccountDefaults.metaAdvantagePlusPlacements != null &&
      prev.metaAdvantagePlusPlacements !== adAccountDefaults.metaAdvantagePlusPlacements;

    // Use current phases from ref to avoid stale closure
    const currentPhases = phasesRef.current;
    const updatedPhases = currentPhases.map((phase) => {
      const shouldApplyPublishers =
        hasDefaultPublishers &&
        (!phase.publisherPlatforms ||
          phase.publisherPlatforms.length === 0 ||
          (publishersChanged &&
            prev?.publisherPlatforms &&
            arraysEqual(phase.publisherPlatforms, prev.publisherPlatforms)));

      const shouldApplyPositions =
        hasDefaultPositions &&
        (!phase.positions ||
          Object.keys(phase.positions).length === 0 ||
          (positionsChanged && prev?.positions && jsonEqual(phase.positions, prev.positions)));

      const shouldApplyStrategy =
        phase.advantagePlusPlacements == null ||
        (strategyChanged &&
          prev?.metaAdvantagePlusPlacements != null &&
          phase.advantagePlusPlacements === prev.metaAdvantagePlusPlacements);

      if (!shouldApplyPublishers && !shouldApplyPositions && !shouldApplyStrategy) return phase;

      return {
        ...phase,
        ...(shouldApplyPublishers ? { publisherPlatforms: [...currentPublishers] } : {}),
        ...(shouldApplyPositions
          ? { positions: JSON.parse(JSON.stringify(currentPositions)) }
          : {}),
        ...(shouldApplyStrategy
          ? { advantagePlusPlacements: adAccountDefaults.metaAdvantagePlusPlacements ?? true }
          : {}),
      };
    });

    // Update ref AFTER we compute the delta, so comparisons are against the previous defaults.
    prevMetaPlacementDefaultsRef.current = {
      publisherPlatforms: hasDefaultPublishers ? [...currentPublishers] : undefined,
      positions: hasDefaultPositions ? JSON.parse(JSON.stringify(currentPositions)) : undefined,
      metaAdvantagePlusPlacements: adAccountDefaults.metaAdvantagePlusPlacements,
    };

    const changed = updatedPhases.some((p, i) => p !== currentPhases[i]);
    if (changed) {
      phasesRef.current = updatedPhases;
      onPhasesChangeRef.current(updatedPhases);
    }
  }, [adAccountDefaultsFingerprint, platformName]);

  const getDefaultObjectiveForFocus = (focus: string, phaseName: string): string => {
    const normalizedPlatformId = (platformId || "").toLowerCase();
    const platformForMapping = detectedPlatform
      ?? (normalizedPlatformId === "google_ads" ? "google"
        : normalizedPlatformId === "google" ? "google"
        : normalizedPlatformId === "tiktok" ? "tiktok"
        : normalizedPlatformId === "snapchat" ? "snapchat"
        : "meta");

    return getObjectiveFromPhaseName(phaseName, focus, platformForMapping).objective;
  };

  const campaignStart = parseISO(startDate);
  const campaignEnd = parseISO(endDate);
  
  const totalDays = differenceInDays(campaignEnd, campaignStart);

  const dateToPosition = (dateStr: string): number => {
    if (!dateStr || totalDays <= 0) return 0;
    const date = parseISO(dateStr);
    const days = differenceInDays(date, campaignStart);
    return (days / totalDays) * 100;
  };

  const positionToDate = (position: number): string => {
    if (totalDays <= 0) return format(campaignStart, "yyyy-MM-dd");
    const days = Math.round((position / 100) * totalDays);
    return format(addDays(campaignStart, days), "yyyy-MM-dd");
  };

  // Get client X position from mouse or touch event
  const getClientX = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): number => {
    if ('touches' in e) {
      return e.touches[0]?.clientX ?? (e as TouchEvent).changedTouches?.[0]?.clientX ?? 0;
    }
    return (e as MouseEvent).clientX;
  };

  const handleDragStart = (phaseId: string, type: 'start' | 'end' | 'move', e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const phase = phases.find(p => p.id === phaseId);
    if (!phase) return;
    
    const clientX = getClientX(e);
    setDragging({ 
      phaseId, 
      type, 
      initialX: clientX,
      initialStartPos: dateToPosition(phase.startDate),
      initialEndPos: dateToPosition(phase.endDate)
    });
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!dragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clientX = getClientX(e);
    const x = clientX - rect.left;
    const position = Math.max(0, Math.min(100, (x / rect.width) * 100));

    const updatedPhases = phases.map(phase => {
      if (phase.id === dragging.phaseId) {
        if (dragging.type === 'start') {
          const newDate = positionToDate(position);
          return { ...phase, startDate: newDate };
        } else if (dragging.type === 'end') {
          const newDate = positionToDate(position);
          return { ...phase, endDate: newDate };
        } else if (dragging.type === 'move') {
          // Calculate the delta movement
          const initialStartPos = dragging.initialStartPos ?? 0;
          const initialEndPos = dragging.initialEndPos ?? 0;
          const phaseWidth = initialEndPos - initialStartPos;
          
          // Calculate new position based on initial position and mouse delta
          const deltaX = clientX - dragging.initialX;
          const deltaPercent = (deltaX / rect.width) * 100;
          
          let newStartPos = initialStartPos + deltaPercent;
          let newEndPos = initialEndPos + deltaPercent;
          
          // Clamp to boundaries
          if (newStartPos < 0) {
            newStartPos = 0;
            newEndPos = phaseWidth;
          }
          if (newEndPos > 100) {
            newEndPos = 100;
            newStartPos = 100 - phaseWidth;
          }
          
          return { 
            ...phase, 
            startDate: positionToDate(newStartPos),
            endDate: positionToDate(newEndPos)
          };
        }
      }
      return phase;
    });

    onPhasesChange(updatedPhases);
  };

  const handleDragEnd = () => {
    setDragging(null);
  };

  useEffect(() => {
    if (dragging) {
      const handleGlobalMouseUp = () => handleDragEnd();
      const handleGlobalTouchEnd = () => handleDragEnd();
      const handleGlobalMouseMove = (e: MouseEvent) => handleDragMove(e);
      const handleGlobalTouchMove = (e: TouchEvent) => {
        e.preventDefault(); // Prevent scrolling while dragging
        handleDragMove(e);
      };
      
      window.addEventListener("mouseup", handleGlobalMouseUp);
      window.addEventListener("touchend", handleGlobalTouchEnd);
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("touchmove", handleGlobalTouchMove, { passive: false });
      
      return () => {
        window.removeEventListener("mouseup", handleGlobalMouseUp);
        window.removeEventListener("touchend", handleGlobalTouchEnd);
        window.removeEventListener("mousemove", handleGlobalMouseMove);
        window.removeEventListener("touchmove", handleGlobalTouchMove);
      };
    }
  }, [dragging, phases]);

  // Validate dates (MUST be after hooks to keep hook order stable)
  if (!startDate || !endDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phase Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Please select activation start and end dates first to enable phase scheduling.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Check if dates are valid
  if (isNaN(campaignStart.getTime()) || isNaN(campaignEnd.getTime())) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phase Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Invalid dates selected. Please check your activation dates.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (totalDays <= 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phase Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">End date must be after start date to schedule phases.</p>
        </CardContent>
      </Card>
    );
  }

  const addPhase = () => {
    const defaultPublisherConfig = getDefaultPublisherConfig();
    const newPhase: Phase = {
      id: `phase-${Date.now()}`,
      name: `Phase ${phases.length + 1}`,
      startDate: format(campaignStart, "yyyy-MM-dd"),
      endDate: format(addDays(campaignStart, 7), "yyyy-MM-dd"),
      budgetPercentage: 0,
      ...defaultPublisherConfig,
    };
    commitManualPhaseStructureChange([...phases, newPhase]);
  };

  const removePhase = (phaseId: string) => {
    commitManualPhaseStructureChange(phases.filter(p => p.id !== phaseId));
  };

  const duplicatePhase = (phaseId: string) => {
    const phaseToDuplicate = phases.find(p => p.id === phaseId);
    if (!phaseToDuplicate) return;
    
    const newPhase = {
      ...phaseToDuplicate,
      id: `phase-${Date.now()}`,
      name: `${phaseToDuplicate.name} (Copy)`,
    };
    commitManualPhaseStructureChange([...phases, newPhase]);
  };

  const updatePhaseName = (phaseId: string, name: string) => {
    onPhasesChange(phases.map(p => p.id === phaseId ? { ...p, name } : p));
    setEditingName(null);
  };

  const updatePhaseBudget = (phaseId: string, budget: number) => {
    onPhasesChange(phases.map(p => p.id === phaseId ? { ...p, budgetPercentage: budget } : p));
  };

  const snapToPreviousPhase = (phaseId: string) => {
    const currentIndex = phases.findIndex(p => p.id === phaseId);
    if (currentIndex <= 0) return;

    const previousPhase = phases[currentIndex - 1];
    const updatedPhases = phases.map(p => 
      p.id === phaseId ? { ...p, startDate: previousPhase.endDate } : p
    );
    onPhasesChange(updatedPhases);
  };

  const toggleAssetType = (phaseId: string, assetType: string) => {
    onPhasesChange(phases.map(p => {
      if (p.id === phaseId) {
        const currentTypes = p.assetTypes || [];
        const newTypes = currentTypes.includes(assetType)
          ? currentTypes.filter(t => t !== assetType)
          : [...currentTypes, assetType];
        return { ...p, assetTypes: newTypes };
      }
      return p;
    }));
  };

  const updateBudgetValue = (phaseId: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      updatePhaseBudget(phaseId, numValue);
    }
  };

  const updatePhaseField = (phaseId: string, field: string, value: any) => {
    console.log("📝 updatePhaseField called:", { phaseId, field, value });

    const base = phasesRef.current;
    const updatedPhases = base.map((p) => (p.id === phaseId ? { ...p, [field]: value } : p));
    phasesRef.current = updatedPhases;

    const updatedPhase = updatedPhases.find((p) => p.id === phaseId);
    console.log("📋 Updated phase full object:", updatedPhase);
    console.log(`📋 Updated phase.${field}:`, updatedPhase?.[field]);

    onPhasesChange(updatedPhases);
  };

  const updatePhaseFields = (phaseId: string, updates: Record<string, any>) => {
    console.log("📝 updatePhaseFields called:", { phaseId, updates });

    const base = phasesRef.current;
    const updatedPhases = base.map((p) => (p.id === phaseId ? { ...p, ...updates } : p));
    phasesRef.current = updatedPhases;

    onPhasesChange(updatedPhases);
  };

  // Detect platform type for mapping
  const detectedPlatform = detectPlatformType(platformName);
  
  // Get objectives from the centralized mapping
  const getAvailableObjectives = (): ObjectiveMapping[] => {
    if (detectedPlatform) {
      return getObjectivesForPlatform(detectedPlatform);
    }
    // Fallback for unsupported platforms
    return [
      { value: "Awareness", label: "Awareness", optimizationGoals: [{ value: "REACH", label: "Reach" }] },
      { value: "Consideration", label: "Consideration", optimizationGoals: [{ value: "CLICKS", label: "Clicks" }] },
      { value: "Conversion", label: "Conversion", optimizationGoals: [{ value: "CONVERSIONS", label: "Conversions" }] },
    ];
  };

  // Get optimization goals for a specific objective
  const getOptimizationGoalsForPhase = (objective: string, phase?: Phase) => {
    if (!objective || !detectedPlatform) {
      return [];
    }
    let goals = getOptimizationGoalsForObjective(detectedPlatform, objective);
    
    // Apply TikTok search-mode filtering when keywords are active
    if (detectedPlatform === 'tiktok' && phase?.tiktokCampaignType === 'Search') {
      const searchConfig = getTikTokSearchModeConfig(objective);
      if (searchConfig) {
        goals = goals.filter(g => searchConfig.allowedGoals.includes(g.value));
      }
    }
    
    return goals;
  };

  // Auto-select optimization goal based on objective and platform
  const getAutoOptimizationGoal = (objective: string): string => {
    if (!detectedPlatform) return "";
    const defaultGoal = getDefaultOptimizationGoal(detectedPlatform, objective);
    return defaultGoal || "";
  };

  const togglePhaseExpansion = (phaseId: string, open?: boolean) => {
    setExpandedPhases((prev) => ({ ...prev, [phaseId]: open ?? !prev[phaseId] }));
  };

  const getPhaseColor = (index: number) => {
    const colors = [
      "bg-blue-500/20 border-blue-500",
      "bg-purple-500/20 border-purple-500",
      "bg-green-500/20 border-green-500",
      "bg-orange-500/20 border-orange-500",
    ];
    return colors[index % colors.length];
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Phase Timeline</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addPhase}>
            <Plus className="h-3 w-3 mr-1" />
            Add Phase
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {format(campaignStart, "MMM d, yyyy")} - {format(campaignEnd, "MMM d, yyyy")} ({totalDays + 1} days)
        </p>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="relative h-48 bg-muted/30 rounded-lg border touch-none"
        >
          {/* Timeline markers */}
          <div className="absolute inset-0 flex pointer-events-none">
            {Array.from({ length: 11 }).map((_, i) => (
              <div key={i} className="flex-1 border-r border-muted-foreground/10 last:border-r-0">
                <div className="text-[10px] text-muted-foreground/60 px-1 pt-1">
                  {format(addDays(campaignStart, (totalDays * i) / 10), "MMM d")}
                </div>
              </div>
            ))}
          </div>

          {/* Phase bars */}
          {phases.filter(p => !p.isLoyaltyPhase).map((phase, index) => {
            const startPos = dateToPosition(phase.startDate);
            const endPos = dateToPosition(phase.endDate);
            const width = endPos - startPos;
            const canSnap = index > 0;
            const phaseDays = phase.startDate && phase.endDate ? 
              differenceInDays(parseISO(phase.endDate), parseISO(phase.startDate)) + 1 : 0;
            const timePercentage = totalDays > 0 ? Math.round((phaseDays / (totalDays + 1)) * 100) : 0;

            return (
              <div
                key={phase.id}
                className={`absolute h-12 ${getPhaseColor(index)} border-2 rounded-md transition-shadow hover:shadow-lg cursor-move touch-none select-none`}
                style={{
                  left: `${startPos}%`,
                  width: `${width}%`,
                  top: `${28 + index * 24}px`,
                  zIndex: dragging?.phaseId === phase.id ? 20 : 10,
                }}
                onMouseDown={(e) => {
                  // Only trigger move if not clicking on handles or buttons
                  const target = e.target as HTMLElement;
                  if (!target.closest('[data-handle]') && !target.closest('button') && !target.closest('input')) {
                    handleDragStart(phase.id, 'move', e);
                  }
                }}
                onTouchStart={(e) => {
                  const target = e.target as HTMLElement;
                  if (!target.closest('[data-handle]') && !target.closest('button') && !target.closest('input')) {
                    handleDragStart(phase.id, 'move', e);
                  }
                }}
              >
                {/* Start handle */}
                <div
                  data-handle="start"
                  className="absolute left-0 top-0 bottom-0 w-4 cursor-ew-resize bg-current opacity-50 hover:opacity-100 active:opacity-100 transition-opacity touch-none"
                  onMouseDown={(e) => handleDragStart(phase.id, 'start', e)}
                  onTouchStart={(e) => handleDragStart(phase.id, 'start', e)}
                >
                  <GripVertical className="h-4 w-4 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>

                {/* Phase content */}
                <div className="px-3 py-1 flex items-center justify-between h-full">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {canSnap && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={() => snapToPreviousPhase(phase.id)}
                        title="Snap to previous phase"
                      >
                        <Link2 className="h-3 w-3" />
                      </Button>
                    )}
                    {editingName === phase.id ? (
                      <Input
                        value={phase.name}
                        onChange={(e) => onPhasesChange(phases.map(p => p.id === phase.id ? { ...p, name: e.target.value } : p))}
                        onBlur={() => setEditingName(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingName(null)}
                        className="h-6 text-xs px-1 py-0"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="text-xs font-medium truncate cursor-pointer hover:underline"
                        onClick={() => setEditingName(phase.id)}
                        title={phase.name}
                      >
                        {phase.name}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {timePercentage}%
                    </Badge>
                    {editingBudget === phase.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={phase.budgetPercentage}
                          onChange={(e) => updateBudgetValue(phase.id, e.target.value)}
                          onBlur={() => setEditingBudget(null)}
                          onKeyDown={(e) => e.key === "Enter" && setEditingBudget(null)}
                          className="h-6 w-16 text-xs px-1 py-0"
                          min="0"
                          max="100"
                          autoFocus
                        />
                        <span className="text-[10px]">%</span>
                      </div>
                    ) : (
                      <Badge 
                        variant="secondary" 
                        className="text-[10px] cursor-pointer"
                        onClick={() => setEditingBudget(phase.id)}
                      >
                        Budget: {phase.budgetPercentage}%
                      </Badge>
                    )}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]">
                          Assets
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3" align="start">
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs font-semibold">Asset Types</Label>
                            <p className="text-[10px] text-muted-foreground mt-1">Select formats for this phase</p>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {platformAdFormats[platformId]?.map((format) => (
                              <div key={format} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${phase.id}-${format}`}
                                  checked={phase.assetTypes?.includes(format)}
                                  onCheckedChange={() => toggleAssetType(phase.id, format)}
                                />
                                <label
                                  htmlFor={`${phase.id}-${format}`}
                                  className="text-xs cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                  {format}
                                </label>
                              </div>
                            ))}
                          </div>
                          <div className="pt-2 border-t text-xs text-muted-foreground">
                            {phase.startDate && phase.endDate ? 
                              `${format(parseISO(phase.startDate), "MMM d")} - ${format(parseISO(phase.endDate), "MMM d, yyyy")}`
                              : "Dates not set"}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-accent"
                      onClick={() => duplicatePhase(phase.id)}
                      title="Duplicate phase"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    {extensionMode.canDeleteItem(phase.id, 'phase') ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-destructive/20"
                        onClick={() => removePhase(phase.id)}
                        title="Delete phase"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-30 cursor-not-allowed"
                              disabled
                            >
                              <Lock className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Original phases cannot be deleted in extension mode
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>

                {/* End handle */}
                <div
                  data-handle="end"
                  className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize bg-current opacity-50 hover:opacity-100 active:opacity-100 transition-opacity touch-none"
                  onMouseDown={(e) => handleDragStart(phase.id, 'end', e)}
                  onTouchStart={(e) => handleDragStart(phase.id, 'end', e)}
                >
                  <GripVertical className="h-4 w-4 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
              </div>
            );
          })}

          {/* Loyalty phase - editable timeline */}
          {phases.filter(p => p.isLoyaltyPhase).map((phase) => {
            const startPos = dateToPosition(phase.startDate);
            const endPos = dateToPosition(phase.endDate);
            const width = endPos - startPos;
            const phaseDays = phase.startDate && phase.endDate ? 
              differenceInDays(parseISO(phase.endDate), parseISO(phase.startDate)) + 1 : 0;
            const timePercentage = totalDays > 0 ? Math.round((phaseDays / (totalDays + 1)) * 100) : 0;
            
            return (
              <div
                key={phase.id}
                className="absolute h-8 bg-amber-500/10 border border-amber-500 border-dashed rounded-md cursor-move touch-none select-none"
                style={{
                  left: `${startPos}%`,
                  width: `${width}%`,
                  top: `${28 + (phases.filter(p => !p.isLoyaltyPhase).length) * 24}px`,
                  zIndex: dragging?.phaseId === phase.id ? 20 : 5,
                }}
                onMouseDown={(e) => {
                  const target = e.target as HTMLElement;
                  if (!target.closest('[data-handle]') && !target.closest('button') && !target.closest('input')) {
                    handleDragStart(phase.id, 'move', e);
                  }
                }}
                onTouchStart={(e) => {
                  const target = e.target as HTMLElement;
                  if (!target.closest('[data-handle]') && !target.closest('button') && !target.closest('input')) {
                    handleDragStart(phase.id, 'move', e);
                  }
                }}
              >
                {/* Start handle */}
                <div
                  data-handle="start"
                  className="absolute left-0 top-0 bottom-0 w-4 cursor-ew-resize bg-amber-500 opacity-50 hover:opacity-100 active:opacity-100 transition-opacity touch-none"
                  onMouseDown={(e) => handleDragStart(phase.id, 'start', e)}
                  onTouchStart={(e) => handleDragStart(phase.id, 'start', e)}
                >
                  <GripVertical className="h-4 w-4 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div className="px-3 py-1 flex items-center justify-between h-full">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {editingName === phase.id ? (
                      <Input
                        value={phase.name}
                        onChange={(e) => onPhasesChange(phases.map(p => p.id === phase.id ? { ...p, name: e.target.value } : p))}
                        onBlur={() => setEditingName(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingName(null)}
                        className="h-5 text-xs px-1 py-0"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="text-xs font-medium truncate cursor-pointer hover:underline"
                        onClick={() => setEditingName(phase.id)}
                        title={phase.name}
                      >
                        {phase.name}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {timePercentage}%
                    </Badge>
                    {editingBudget === phase.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={phase.budgetPercentage}
                          onChange={(e) => updateBudgetValue(phase.id, e.target.value)}
                          onBlur={() => setEditingBudget(null)}
                          onKeyDown={(e) => e.key === "Enter" && setEditingBudget(null)}
                          className="h-5 w-16 text-xs px-1 py-0"
                          min="0"
                          max="100"
                          autoFocus
                        />
                        <span className="text-[10px]">%</span>
                      </div>
                    ) : (
                      <Badge 
                        variant="secondary" 
                        className="text-[10px] cursor-pointer"
                        onClick={() => setEditingBudget(phase.id)}
                      >
                        Budget: {phase.budgetPercentage}%
                      </Badge>
                    )}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-5 px-2 text-[10px]">
                          Assets
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3" align="start">
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs font-semibold">Asset Types</Label>
                            <p className="text-[10px] text-muted-foreground mt-1">Select formats for loyalty phase</p>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {platformAdFormats[platformId]?.map((format) => (
                              <div key={format} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${phase.id}-${format}`}
                                  checked={phase.assetTypes?.includes(format)}
                                  onCheckedChange={() => toggleAssetType(phase.id, format)}
                                />
                                <label
                                  htmlFor={`${phase.id}-${format}`}
                                  className="text-xs cursor-pointer leading-none"
                                >
                                  {format}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 hover:bg-accent"
                      onClick={() => duplicatePhase(phase.id)}
                      title="Duplicate phase"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 hover:bg-destructive/20"
                      onClick={() => removePhase(phase.id)}
                      title="Delete phase"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* End handle */}
                <div
                  data-handle="end"
                  className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize bg-amber-500 opacity-50 hover:opacity-100 active:opacity-100 transition-opacity touch-none"
                  onMouseDown={(e) => handleDragStart(phase.id, 'end', e)}
                  onTouchStart={(e) => handleDragStart(phase.id, 'end', e)}
                >
                  <GripVertical className="h-4 w-4 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Phase configuration list */}
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-semibold">Phase Configuration</Label>
            <p className="text-xs text-muted-foreground">Configure objectives, targeting, and placements for each phase</p>
          </div>
          
          {phases.map((phase, index) => {
            const phaseDays = phase.startDate && phase.endDate ? 
              differenceInDays(parseISO(phase.endDate), parseISO(phase.startDate)) + 1 : 0;
            const availableObjectives = getAvailableObjectives();
            const isGooglePlatform = platformId?.toLowerCase() === 'google' || platformId?.toLowerCase() === 'google_ads';
            const isTikTokPlatform = platformId?.toLowerCase() === 'tiktok';
            const isGoogleSearchPhase = isGooglePlatform && phase.googleCampaignType === "Search";
            const isTikTokSearchPhase = isTikTokPlatform && phase.tiktokCampaignType === "Search";
            const isSearchPhase = isGoogleSearchPhase || isTikTokSearchPhase;
            const allSelectedKeywords = isSearchPhase ? (basicTargeting?.selectedKeywords || []) : [];
            const platformKeywordFilter = isGoogleSearchPhase ? 'google' : isTikTokSearchPhase ? 'tiktok' : null;
            const phaseKeywords = platformKeywordFilter ? allSelectedKeywords.filter(kw => kw.platform === platformKeywordFilter) : allSelectedKeywords;
            const phaseSearchVolume = phaseKeywords.filter(kw => !kw.isNegative).reduce((sum, kw) => sum + (kw.avgMonthlySearches || 0), 0);
            const keywordStrategyGroups = isSearchPhase && phaseKeywords.length > 0 ? (() => {
              const groups = (['brand', 'generic', 'competition'] as const).map(strategy => {
                const kws = phaseKeywords.filter(kw => kw.strategy === strategy);
                const positives = kws.filter(kw => !kw.isNegative);
                const negatives = kws.filter(kw => kw.isNegative);
                const totalVol = positives.reduce((s, kw) => s + (kw.avgMonthlySearches || 0), 0);
                return { strategy, positives, negatives, totalVol, count: positives.length + negatives.length };
              }).filter(g => g.count > 0);
              // Calculate volume-weighted budget percentages
              const totalGroupVol = groups.reduce((s, g) => s + g.totalVol, 0);
              return groups.map(g => ({
                ...g,
                budgetPct: totalGroupVol > 0 ? Math.round((g.totalVol / totalGroupVol) * 100) : Math.round(100 / groups.length),
              }));
            })() : [];
            
            return (
              <Collapsible
                key={phase.id}
                open={!!expandedPhases[phase.id]}
                onOpenChange={(open) => togglePhaseExpansion(phase.id, open)}
              >
                <div className="border rounded-lg bg-card">
                  <div className="flex items-center justify-between p-4">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="flex-1 flex items-center justify-start gap-3 p-0 hover:bg-transparent"
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className={`w-3 h-3 rounded ${phase.isLoyaltyPhase ? 'bg-amber-500/40' : getPhaseColor(index).split(" ")[0]}`} />
                          <span className="font-medium">{phase.name}</span>
                          {phase.objective && (
                            <span className="text-xs text-muted-foreground">
                              ({getAudienceStrategyConfig(platformName, phase.objective, phase.optimizationGoal).rationale})
                            </span>
                          )}
                          {phase.startDate && phase.endDate && (
                            <Badge variant="outline" className="text-xs">
                              {format(parseISO(phase.startDate), "MMM d")} - {format(parseISO(phase.endDate), "MMM d")} ({phaseDays} days)
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {phase.budgetPercentage}% budget
                          </Badge>
                          {isSearchPhase && phaseSearchVolume > 0 && (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800">
                                <Search className="h-3 w-3 mr-1" />
                                {phaseSearchVolume >= 1_000_000 ? `${(phaseSearchVolume / 1_000_000).toFixed(1)}M` : phaseSearchVolume >= 1_000 ? `${(phaseSearchVolume / 1_000).toFixed(1)}K` : phaseSearchVolume} vol/mo
                              </Badge>
                              <DataSourceBadge dataSource="live_api" platformName={isTikTokSearchPhase ? "TikTok" : "Google Ads"} />
                            </div>
                          )}
                          {adAccountId && !taxonomyLoading && (
                            <PhaseTaxonomyPreview
                              platform={taxonomyPlatform}
                              campaignTemplate={taxonomyTemplates.campaign}
                              adsetTemplate={taxonomyTemplates.adset}
                              context={{
                                platform: taxonomyPlatform,
                                activationName: activationContext?.activationName,
                                boNumber: activationContext?.boNumber,
                                clientName: activationContext?.clientName,
                                teamName: activationContext?.teamName,
                                totalBudget: activationContext?.totalBudget,
                                market: activationContext?.market,
                                markets: activationContext?.markets,
                                platformBudget: activationContext?.platformBudget,
                                objective: phase.objective,
                                optimizationGoal: phase.optimizationGoal,
                                optimizationLocation: phase.metaOptimizationLocation || phase.tiktokOptimizationLocation,
                                funnelStage: phase.funnelStage,
                                bidStrategy: phase.metaBidStrategy || phase.tiktokBidStrategy,
                                billingEvent: phase.metaBillingEvent || phase.tiktokBillingEvent,
                                budgetType: phase.budgetType,
                                phaseBudget: marketBudget ? marketBudget * (phase.budgetPercentage / 100) : undefined,
                                advantagePlusPlacements: phase.advantagePlusPlacements,
                                placementType: phase.tiktokPlacementType,
                                placements: phase.tiktokPlacements,
                                publisherPlatforms: phase.publisherPlatforms,
                                positions: phase.positions,
                              targetingType: phase.useBroadTargeting ? 'BRD' : detectTargetingType(phase.overrideTargeting ? phase.targeting : basicTargeting, phase.audiences),
                                ageMin: phase.useBroadTargeting ? undefined : (phase.overrideTargeting ? phase.targeting?.ageMin : (phase.targeting?.ageMin ?? basicTargeting?.ageMin ?? marketTargeting?.ageMin)),
                                ageMax: phase.useBroadTargeting ? undefined : (phase.overrideTargeting ? phase.targeting?.ageMax : (phase.targeting?.ageMax ?? basicTargeting?.ageMax ?? marketTargeting?.ageMax)),
                                gender: phase.useBroadTargeting ? undefined : (phase.overrideTargeting ? phase.targeting?.genders?.[0] : (phase.targeting?.genders?.[0] || basicTargeting?.genders?.[0] || marketTargeting?.gender)),
                                devices: phase.useBroadTargeting ? undefined : (phase.overrideTargeting ? phase.targeting?.devices : (phase.targeting?.devices || basicTargeting?.devices || marketTargeting?.devices)),
                                languages: phase.useBroadTargeting ? undefined : (phase.overrideTargeting ? phase.targeting?.languages : (phase.targeting?.languages || basicTargeting?.languages || marketTargeting?.languages)),
                                startDate: phase.startDate || startDate,
                                endDate: phase.endDate || endDate,
                              }}
                              campaignCustomValues={phase.campaignTaxonomyValues}
                              adsetCustomValues={phase.adsetTaxonomyValues}
                            />
                          )}
                        </div>
                      </Button>
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 hover:bg-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicatePhase(phase.id);
                        }}
                        title="Duplicate phase"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 hover:bg-destructive/20 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePhase(phase.id);
                        }}
                        title="Delete phase"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <ChevronDown className={`h-4 w-4 transition-transform ${expandedPhases[phase.id] ? 'rotate-180' : ''}`} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>

                  {/* Keyword Strategy Sub-rows for Search phases (Google & TikTok) */}
                  {isSearchPhase && keywordStrategyGroups.length > 0 && (
                    <div className="border-t bg-muted/10">
                      {keywordStrategyGroups.map(({ strategy, positives, negatives, totalVol, budgetPct }) => {
                        const strategyConfig: Record<string, { label: string; icon: React.ReactNode; colorClass: string }> = {
                          brand: { label: "Brand", icon: <ShieldCheck className="h-3 w-3" />, colorClass: "text-blue-700 dark:text-blue-400" },
                          generic: { label: "Generic", icon: <Target className="h-3 w-3" />, colorClass: "text-emerald-700 dark:text-emerald-400" },
                          competition: { label: "Competition", icon: <Swords className="h-3 w-3" />, colorClass: "text-amber-700 dark:text-amber-400" },
                        };
                        const meta = strategyConfig[strategy];
                        const formatVol = (vol: number) => {
                          if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
                          if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
                          return String(vol);
                        };
                        return (
                          <div key={strategy} className="flex items-center gap-3 px-4 py-2 border-b last:border-b-0">
                            <div className="w-3" />
                            <div className={`flex items-center gap-1.5 ${meta.colorClass}`}>
                              {meta.icon}
                              <span className="text-xs font-medium">{meta.label}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                              {positives.length} keyword{positives.length !== 1 ? 's' : ''}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              {budgetPct}% budget
                            </Badge>
                            {negatives.length > 0 && (
                              <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                                <Ban className="h-2.5 w-2.5 mr-0.5" />{negatives.length} neg
                              </Badge>
                            )}
                            {totalVol > 0 && (
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800">
                                  <Search className="h-2.5 w-2.5 mr-0.5" />{formatVol(totalVol)} vol/mo
                                </Badge>
                                <DataSourceBadge dataSource="live_api" platformName="Google Ads" />
                              </div>
                            )}
                            <div className="ml-auto flex gap-1">
                              {positives.slice(0, 3).map(kw => (
                                <Badge key={kw.id} variant="secondary" className="text-[9px]">
                                  {kw.name}
                                </Badge>
                              ))}
                              {positives.length > 3 && (
                                <span className="text-[9px] text-muted-foreground">+{positives.length - 3}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <CollapsibleContent>
                    <div className="p-4 pt-0 space-y-4 border-t">
                      {/* Campaign & Ad Set Taxonomy - Right after phase name */}
                      {adAccountId && !taxonomyLoading && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <PhaseTaxonomyInputs
                            platform={taxonomyPlatform}
                            entityType="campaign"
                            template={taxonomyTemplates.campaign}
                            onRefresh={refreshTaxonomy}
                            context={{
                              platform: taxonomyPlatform,
                              activationName: activationContext?.activationName,
                              boNumber: activationContext?.boNumber,
                              clientName: activationContext?.clientName,
                              teamName: activationContext?.teamName,
                              totalBudget: activationContext?.totalBudget,
                              market: activationContext?.market,
                              markets: activationContext?.markets,
                              platformBudget: activationContext?.platformBudget,
                              phaseBudget: marketBudget ? marketBudget * (phase.budgetPercentage / 100) : undefined,
                              objective: phase.objective,
                              placementType: phase.advantagePlusPlacements ? 'automatic' : (phase.tiktokPlacementType || 'manual'),
                              publisherPlatforms: phase.publisherPlatforms,
                              positions: phase.positions,
                              startDate: phase.startDate || startDate,
                              endDate: phase.endDate || endDate,
                            }}
                            customValues={phase.campaignTaxonomyValues}
                            onCustomValueChange={(paramId, value) => handleTaxonomyValueChange(phase.id, 'campaign', paramId, value)}
                            onValidationChange={(isComplete, missing) => handleTaxonomyValidation(phase.id, 'campaign', isComplete, missing)}
                          />
                          <PhaseTaxonomyInputs
                            platform={taxonomyPlatform}
                            entityType="adset"
                            template={taxonomyTemplates.adset}
                            onRefresh={refreshTaxonomy}
                            context={{
                              platform: taxonomyPlatform,
                              optimizationGoal: phase.optimizationGoal,
                              optimizationLocation: phase.metaOptimizationLocation || phase.tiktokOptimizationLocation,
                              phaseBudget: marketBudget ? marketBudget * (phase.budgetPercentage / 100) : undefined,
                              budgetType: phase.budgetType,
                              ageMin: phase.useBroadTargeting ? undefined : (phase.overrideTargeting ? phase.targeting?.ageMin : (phase.targeting?.ageMin ?? basicTargeting?.ageMin ?? marketTargeting?.ageMin)),
                              ageMax: phase.useBroadTargeting ? undefined : (phase.overrideTargeting ? phase.targeting?.ageMax : (phase.targeting?.ageMax ?? basicTargeting?.ageMax ?? marketTargeting?.ageMax)),
                              gender: phase.useBroadTargeting ? undefined : (phase.overrideTargeting ? phase.targeting?.genders?.[0] : (phase.targeting?.genders?.[0] || basicTargeting?.genders?.[0] || marketTargeting?.gender)),
                              location: activationContext?.market,
                              devices: phase.useBroadTargeting ? undefined : (phase.overrideTargeting ? phase.targeting?.devices : (phase.targeting?.devices || basicTargeting?.devices || marketTargeting?.devices)),
                              languages: phase.useBroadTargeting ? undefined : (phase.overrideTargeting ? phase.targeting?.languages : (phase.targeting?.languages || basicTargeting?.languages || marketTargeting?.languages)),
                              advantagePlusPlacements: phase.advantagePlusPlacements,
                              placementType: phase.advantagePlusPlacements ? 'automatic' : (phase.tiktokPlacementType || 'manual'),
                              publisherPlatforms: phase.publisherPlatforms,
                              positions: phase.positions,
                              targetingType: phase.useBroadTargeting ? 'BRD' : detectTargetingType(phase.overrideTargeting ? phase.targeting : basicTargeting, phase.audiences),
                            }}
                            customValues={phase.adsetTaxonomyValues}
                            onCustomValueChange={(paramId, value) => handleTaxonomyValueChange(phase.id, 'adset', paramId, value)}
                            onValidationChange={(isComplete, missing) => handleTaxonomyValidation(phase.id, 'adset', isComplete, missing)}
                          />
                        </div>
                      )}

                      {/* Targeting Summary */}
                      {(() => {
                        const audienceStrategy = getAudienceStrategyConfig(platformName, phase.objective, phase.optimizationGoal);
                        
                        // Hide inherited targeting section if strategy doesn't support it
                        if (!marketTargeting || (!audienceStrategy.showInheritedTargeting && !phase.useBroadTargeting)) {
                          return null;
                        }
                        
                        return (
                          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                            <Label className="text-sm font-semibold">
                              {phase.useBroadTargeting ? "Broad Targeting" : "Inherited Targeting"}
                            </Label>
                            {phase.useBroadTargeting ? (
                              <div className="text-xs text-muted-foreground">
                                <p>No demographic or interest targeting applied. Ads will be shown to the broadest possible audience.</p>
                              </div>
                            ) : (
                            <div className="text-xs text-muted-foreground space-y-1">
                              {(basicTargeting?.ageMin !== undefined || basicTargeting?.ageMax !== undefined || marketTargeting.ageMin !== undefined || marketTargeting.ageMax !== undefined) && (
                                <div className="flex justify-between">
                                  <span>Age Range:</span>
                                  <span className="font-medium text-foreground">
                                    {basicTargeting?.ageMin ?? marketTargeting.ageMin ?? 18} - {basicTargeting?.ageMax ?? marketTargeting.ageMax ?? 65}
                                  </span>
                                </div>
                              )}
                              {marketTargeting.gender && marketTargeting.gender !== 'all' && (
                                <div className="flex justify-between">
                                  <span>Gender:</span>
                                  <span className="font-medium text-foreground">
                                    {marketTargeting.gender === '1' ? 'Male' : marketTargeting.gender === '2' ? 'Female' : 'All'}
                                  </span>
                                </div>
                              )}
                              {marketTargeting.languages && marketTargeting.languages.length > 0 && !marketTargeting.languages.includes('all') && (
                                <div className="flex justify-between">
                                  <span>Languages:</span>
                                  <span className="font-medium text-foreground">
                                    {marketTargeting.languages.length} selected
                                  </span>
                                </div>
                              )}
                              {marketTargeting.devices && marketTargeting.devices.length > 0 && !marketTargeting.devices.includes('all') && (
                                <div className="flex justify-between">
                                  <span>Devices:</span>
                                  <span className="font-medium text-foreground">
                                    {marketTargeting.devices.length} selected
                                  </span>
                                </div>
                              )}
                              {marketTargeting.os && marketTargeting.os.length > 0 && !marketTargeting.os.includes('all') && (
                                <div className="flex justify-between">
                                  <span>Operating Systems:</span>
                                  <span className="font-medium text-foreground">
                                    {marketTargeting.os.length} selected
                                  </span>
                                </div>
                              )}
                              {/* Show detailed targeting counts by type */}
                              {!phase.overrideTargeting && basicTargeting?.selectedItems && basicTargeting.selectedItems.length > 0 && (() => {
                                const interestCount = basicTargeting.selectedItems.filter(item => item.category === 'interest').length;
                                const behaviorCount = basicTargeting.selectedItems.filter(item => item.category === 'behavior').length;
                                const demographicCount = basicTargeting.selectedItems.filter(item => item.category === 'demographic').length;
                                
                                return (
                                  <div className="pt-2 border-t space-y-1">
                                    <div className="flex justify-between">
                                      <span>Detailed Targeting:</span>
                                      <span className="font-medium text-foreground">{basicTargeting.selectedItems.length} total</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 justify-end">
                                      {interestCount > 0 && (
                                        <Badge variant="outline" className="text-xs">
                                          {interestCount} Interests
                                        </Badge>
                                      )}
                                      {behaviorCount > 0 && (
                                        <Badge variant="outline" className="text-xs">
                                          {behaviorCount} Behaviors
                                        </Badge>
                                      )}
                                      {demographicCount > 0 && (
                                        <Badge variant="outline" className="text-xs">
                                          {demographicCount} Demographics
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                        );
                      })()}
                      {/* Phase-Level Targeting Override - Available for all objectives */}
                      {basicTargeting && !phase.useBroadTargeting && (
                        basicTargeting.selectedItems && basicTargeting.selectedItems.length > 0 ||
                        basicTargeting.ageMin !== undefined ||
                        basicTargeting.genders?.length ||
                        basicTargeting.devices?.length
                      ) && (
                        <div className="border rounded-lg p-4 bg-muted/30">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Override Campaign Targeting</span>
                              {phase.overrideTargeting && (
                                <Badge variant="secondary" className="text-xs">Active</Badge>
                              )}
                            </div>
                            <Switch
                              checked={phase.overrideTargeting === true}
                              onCheckedChange={(checked) => {
                                console.log('🔄 Switch onCheckedChange:', { checked, currentValue: phase.overrideTargeting, phaseId: phase.id });
                                const platformFilter = platformId === 'tiktok' ? 'tiktok' 
                                  : platformId === 'google_ads' ? 'google' 
                                  : platformId === 'snapchat' ? 'snapchat' 
                                  : 'meta';
                                
                                const filterItemsForPlatform = (items: any[]) => 
                                  items.filter(item => item.platforms?.includes(platformFilter));
                                
                                if (checked) {
                                   // When enabling override, always initialize from basicTargeting (Step 2)
                                   // Always prefer basicTargeting values so the user sees their Step 2 settings
                                   if (basicTargeting) {
                                     const filteredItems = basicTargeting.selectedItems ? 
                                         filterItemsForPlatform(basicTargeting.selectedItems) : [];
                                     // If platform filter removed all items, fall back to all items (platforms field may not be set)
                                     const finalItems = filteredItems.length === 0 && basicTargeting.selectedItems?.length 
                                       ? [...basicTargeting.selectedItems] : filteredItems;
                                     const phaseTargeting: UnifiedTargetingConfig = {
                                       ageMin: basicTargeting.ageMin,
                                       ageMax: basicTargeting.ageMax,
                                       genders: basicTargeting.genders ? [...basicTargeting.genders] : [],
                                       devices: basicTargeting.devices ? [...basicTargeting.devices] : [],
                                       os: basicTargeting.os ? [...basicTargeting.os] : [],
                                       languages: basicTargeting.languages ? [...basicTargeting.languages] : [],
                                       selectedItems: finalItems,
                                       selectedKeywords: basicTargeting.selectedKeywords ? [...basicTargeting.selectedKeywords] : [],
                                       useBroadTargeting: false,
                                       retargetingAudienceIds: basicTargeting.retargetingAudienceIds ? [...basicTargeting.retargetingAudienceIds] : [],
                                       lookalikeAudienceIds: basicTargeting.lookalikeAudienceIds ? [...basicTargeting.lookalikeAudienceIds] : [],
                                       customAudienceIds: basicTargeting.customAudienceIds ? [...basicTargeting.customAudienceIds] : [],
                                       // Copy ad set split settings
                                       defaultAdSetSplitDimension: basicTargeting.defaultAdSetSplitDimension,
                                       defaultAdSetSplitDimensionPerPlatform: basicTargeting.defaultAdSetSplitDimensionPerPlatform ? { ...basicTargeting.defaultAdSetSplitDimensionPerPlatform } : undefined,
                                       defaultAdSets: basicTargeting.defaultAdSets ? [...basicTargeting.defaultAdSets] : undefined,
                                       defaultAdSetsPerPlatform: basicTargeting.defaultAdSetsPerPlatform ? { ...basicTargeting.defaultAdSetsPerPlatform } : undefined,
                                       defaultAdSetSplitUseCBO: basicTargeting.defaultAdSetSplitUseCBO,
                                     };
                                     console.log('🔄 Setting override ON with targeting from basicTargeting:', phaseTargeting);
                                     updatePhaseFields(phase.id, { overrideTargeting: true, useBroadTargeting: false, targeting: phaseTargeting });
                                   } else {
                                     console.log('🔄 Setting override ON (no basicTargeting available)');
                                     updatePhaseFields(phase.id, { overrideTargeting: true, useBroadTargeting: false });
                                   }
                                } else {
                                  // When disabling override, reset to preset
                                  const presetCopy: UnifiedTargetingConfig | undefined = basicTargeting ? {
                                    ageMin: basicTargeting.ageMin,
                                    ageMax: basicTargeting.ageMax,
                                    genders: basicTargeting.genders ? [...basicTargeting.genders] : [],
                                    devices: basicTargeting.devices ? [...basicTargeting.devices] : [],
                                    os: basicTargeting.os ? [...basicTargeting.os] : [],
                                    languages: basicTargeting.languages ? [...basicTargeting.languages] : [],
                                    selectedItems: basicTargeting.selectedItems ? 
                                      filterItemsForPlatform(basicTargeting.selectedItems) : [],
                                    useBroadTargeting: false,
                                  } : undefined;
                                  
                                  console.log('🔄 Setting override OFF, resetting to preset:', presetCopy);
                                  updatePhaseFields(phase.id, { overrideTargeting: false, targeting: presetCopy });
                                }
                              }}
                            />
                          </div>
                          {phase.overrideTargeting && (
                            <div className="pt-4 border-t mt-4">
                              {phase.targeting && (
                                <>
                                  {console.log('[PhaseScheduler] Rendering BasicTargeting:', { 
                                    platformId, 
                                    adAccountId,
                                    phaseId: phase.id,
                                    metaAdAccountId: platformId === 'meta' ? adAccountId : undefined,
                                    tiktokAdvertiserId: platformId === 'tiktok' ? adAccountId : undefined
                                  })}
                                  <UnifiedTargeting
                                    key={`phase-targeting-${phase.id}-${phase.overrideTargeting}`}
                                    targeting={phase.targeting as UnifiedTargetingConfig}
                                    onUpdate={(targeting) => updatePhaseField(phase.id, "targeting", targeting)}
                                    metaAdAccountId={platformId === 'meta' ? adAccountId : undefined}
                                    tiktokAdvertiserId={platformId === 'tiktok' ? adAccountId : undefined}
                                    googleCustomerId={platformId === 'google_ads' ? adAccountId : undefined}
                                    skipLocalStorage={true}
                                    currentSplitDimension={phase.adSetSplitDimension}
                                    onSplitDimensionChange={(dim, useCBO) => {
                                      const newDimension = dim === 'none' ? undefined : dim;
                                      const newAdSets = newDimension ? createInitialAdSets(dim, phase.name, {
                                        platformId: platformId || 'meta',
                                        currentGender: phase.targeting?.genders?.[0] || basicTargeting?.genders?.[0],
                                        currentAgeMin: phase.targeting?.ageMin ?? basicTargeting?.ageMin,
                                        currentAgeMax: phase.targeting?.ageMax ?? basicTargeting?.ageMax,
                                        currentDevices: phase.targeting?.devices || basicTargeting?.devices,
                                        currentLanguages: phase.targeting?.languages || basicTargeting?.languages,
                                      }) : undefined;
                                      updatePhaseFields(phase.id, { 
                                        adSetSplitDimension: newDimension,
                                        adSets: newAdSets,
                                        useCBO: useCBO,
                                      });
                                      // Trigger scroll to split manager
                                      if (newDimension) {
                                        setScrollToSplitPhaseId(phase.id);
                                      }
                                    }}
                                  />
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Broad Targeting Toggle - Works against Override */}
                      <div className="border rounded-lg p-4 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Use Broad Targeting</span>
                            {phase.useBroadTargeting && (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Active</Badge>
                            )}
                          </div>
                          <Switch
                            checked={phase.useBroadTargeting === true}
                            disabled={phase.overrideTargeting === true}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                // When enabling broad targeting, disable override and clear native targeting
                                const broadTargeting: UnifiedTargetingConfig = {
                                  selectedItems: [],
                                  useBroadTargeting: true,
                                  // Clear demographics for broad
                                  ageMin: undefined,
                                  ageMax: undefined,
                                  genders: [],
                                  devices: [],
                                  os: [],
                                  languages: [],
                                };
                                updatePhaseFields(phase.id, { 
                                  useBroadTargeting: true, 
                                  overrideTargeting: false,
                                  targeting: broadTargeting 
                                });
                              } else {
                                // When disabling broad targeting, restore inherited targeting
                                const isTikTok = platformId === 'tiktok';
                                const inheritedTargeting: UnifiedTargetingConfig | undefined = basicTargeting ? {
                                  ageMin: basicTargeting.ageMin,
                                  ageMax: basicTargeting.ageMax,
                                  genders: basicTargeting.genders ? [...basicTargeting.genders] : [],
                                  devices: basicTargeting.devices ? [...basicTargeting.devices] : [],
                                  os: basicTargeting.os ? [...basicTargeting.os] : [],
                                  languages: basicTargeting.languages ? [...basicTargeting.languages] : [],
                                  selectedItems: basicTargeting.selectedItems ? 
                                    basicTargeting.selectedItems.filter(item => 
                                      isTikTok ? item.platforms.includes('tiktok') : item.platforms.includes('meta')
                                    ) : [],
                                  useBroadTargeting: false,
                                } : undefined;
                                updatePhaseFields(phase.id, { 
                                  useBroadTargeting: false, 
                                  targeting: inheritedTargeting 
                                });
                              }
                            }}
                          />
                        </div>
                        {phase.useBroadTargeting && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Broad targeting removes all demographic, interest, and audience targeting. Only location targeting will be applied.
                          </p>
                        )}
                        {phase.overrideTargeting && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Disable "Override Campaign Targeting" to use broad targeting.
                          </p>
                        )}
                      </div>

                      {/* Audience Selection - hidden when broad targeting or AI-managed audience is active */}
                      {(() => {
                        if (phase.useBroadTargeting) return null;
                        
                        // Hide audience selector when Advantage+ Audience (Meta) or Auto-Targeting (TikTok) is enabled
                        const isMeta = platformId?.toLowerCase() === 'meta';
                        const isTikTok = platformId?.toLowerCase() === 'tiktok';
                        const isAiAudience = (isMeta && (phase.metaAdvantagePlusAudience || phase.metaAdvantagePlusCampaign)) || 
                                             (isTikTok && (phase.tiktokAutoTargetingEnabled || phase.tiktokSmartPlusEnabled));
                        
                        if (isAiAudience) {
                          return (
                            <Alert className="border-primary/30 bg-primary/5">
                              <Info className="h-4 w-4 text-primary" />
                              <AlertDescription className="text-xs">
                                <strong>{isMeta ? 'Advantage+ Audience' : 'Smart+ Auto-Targeting'} is active.</strong> Audience targeting is fully managed by {isMeta ? 'Meta' : 'TikTok'} AI. {isMeta ? 'Manual selections are used as suggestions only.' : 'Manual audience selections will be ignored.'}
                              </AlertDescription>
                            </Alert>
                          );
                        }

                        return (
                          <SplittableSection
                            dimension="audience_selection"
                            dimensionLabel="Audience Selection"
                            currentSplitDimension={phase.adSetSplitDimension}
                            onSplitClick={(dim, useCBO) => {
                              const newDimension = dim === 'none' ? undefined : dim;
                              const newAdSets = newDimension ? createInitialAdSets(dim, phase.name, {
                                platformId: platformId || 'meta',
                                currentGender: phase.targeting?.genders?.[0] || basicTargeting?.genders?.[0],
                                currentDevices: phase.targeting?.devices || basicTargeting?.devices,
                                currentLanguages: phase.targeting?.languages || basicTargeting?.languages,
                                currentAgeMin: phase.targeting?.ageMin ?? basicTargeting?.ageMin,
                                currentAgeMax: phase.targeting?.ageMax ?? basicTargeting?.ageMax,
                                currentOptimizationGoal: phase.optimizationGoal,
                                availableAudiences: phase.audiences?.map(a => ({ id: a.id, name: a.name, type: a.type })),
                                availableOptimizationGoals: getOptimizationGoalsForPhase(phase.objective || '', phase),
                              }) : undefined;
                              updatePhaseFields(phase.id, {
                                adSetSplitDimension: newDimension,
                                adSets: newAdSets,
                                useCBO: useCBO,
                              });
                              // Trigger scroll to split manager
                              if (newDimension) {
                                setScrollToSplitPhaseId(phase.id);
                              }
                            }}
                          >
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Label>Audience Selection</Label>
                                {phase.objective && phase.optimizationGoal && (
                                  <Badge variant="secondary" className="text-xs">
                                    Based on {phase.objective} / {phase.optimizationGoal}
                                  </Badge>
                                )}
                              </div>
                              {adAccountId ? (
                                <PhaseAudienceSelector
                                  phaseName={phase.name}
                                  phaseId={phase.id}
                                  phaseObjective={phase.objective || ''}
                                  phaseOptimizationGoal={phase.optimizationGoal || ''}
                                  adAccountId={adAccountId}
                                  platform={platformName}
                                  basicTargeting={undefined}
                                  overrideTargeting={phase.overrideTargeting}
                                  showRetargetingAudiences={true}
                                  showLookalikeAudiences={true}
                                  autoExcludeEnabled={phase.autoExcludeAudiences || false}
                                  onAutoExcludeChange={(enabled) => {
                                    updatePhaseField(phase.id, "autoExcludeAudiences", enabled);
                                  }}
                                  onAudiencesSelected={(audiences, excludedAudiences) => {
                                    const updatedPhases = phasesRef.current.map(p => {
                                      if (p.id === phase.id) {
                                        return {
                                          ...p,
                                          audiences,
                                          excludedAudiences: excludedAudiences?.map(a => ({
                                            id: a.id,
                                            name: a.name,
                                            type: a.type,
                                            source: a.source,
                                          })),
                                        };
                                      }
                                      return p;
                                    });
                                    onPhasesChange(updatedPhases);
                                  }}
                                  initialSelection={phase.audiences || []}
                                />
                              ) : (
                                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                                  Connect an ad account to load available audiences.
                                </div>
                              )}
                            </div>
                          </SplittableSection>
                        );
                      })()}

                      {/* TikTok Search Ads Toggle */}
                      {isTikTokPlatform && (
                        <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                          <div className="flex items-center gap-2">
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <Label className="text-sm font-medium">Search Ads</Label>
                              <p className="text-xs text-muted-foreground">
                                {phase.tiktokCampaignType === 'Search' 
                                  ? 'Search mode active — optimization goals and locations are restricted'
                                  : 'Enable to use keyword-based search ads'}
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={phase.tiktokCampaignType === 'Search'}
                            onCheckedChange={(checked) => {
                              const newType = checked ? 'Search' : undefined;
                              const updates: Partial<Phase> = { tiktokCampaignType: newType as any };
                              
                              // When enabling search, auto-correct optimization goal if needed
                              if (checked && phase.objective) {
                                const searchConfig = getTikTokSearchModeConfig(phase.objective);
                                if (searchConfig && phase.optimizationGoal && !searchConfig.allowedGoals.includes(phase.optimizationGoal)) {
                                  updates.optimizationGoal = searchConfig.allowedGoals[0];
                                }
                              }
                              
                              updatePhaseFields(phase.id, updates);
                            }}
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`objective-${phase.id}`}>Campaign Objective</Label>
                          {phase.objective && phase.optimizationGoal && (
                            <Badge variant="secondary" className="text-xs">
                              Goal: {getOptimizationGoalsForPhase(phase.objective, phase).find(g => g.value === phase.optimizationGoal)?.label || phase.optimizationGoal}
                            </Badge>
                          )}
                        </div>
                        <Combobox
                          id={`objective-${phase.id}`}
                          value={phase.objective ?? ""}
                          onValueChange={(value) => {
                            const isTikTok = platformName.toLowerCase().includes('tiktok');
                            const isMeta = !isTikTok;
                            const adjustedObjective = value;
                            
                            // Get valid destinations for this objective
                            const platformType = isTikTok ? "tiktok" : "meta";
                            const validDestinations = getDestinationsForObjective(platformType, adjustedObjective);
                            
                            // IMPORTANT: Use the ref-backed batch updater so we never write based on a stale `phases` array.
                            // This prevents the Select from “snapping back” to the previous value.
                            const basePhase = phasesRef.current.find((p) => p.id === phase.id) ?? phase;

                            // Auto-set optimization goal based on objective and platform
                            const autoGoal = getAutoOptimizationGoal(adjustedObjective);

                            // Get audience strategy config for this objective/goal
                            const audienceStrategy = getAudienceStrategyConfig(platformName, adjustedObjective, autoGoal);

                            // Build updates (single atomic write)
                            const validGoalValues = new Set(
                              getOptimizationGoalsForObjective(platformType, adjustedObjective).map((goal) => goal.value)
                            );

                            const updates: any = {
                              objective: adjustedObjective,
                              optimizationGoal: autoGoal,
                              // Auto-enable/disable broad targeting based on strategy
                              useBroadTargeting: audienceStrategy.useBroadTargeting,
                              // Disable override if broad targeting is auto-enabled
                              overrideTargeting: audienceStrategy.useBroadTargeting ? false : basePhase.overrideTargeting,
                            };

                            if (Array.isArray(basePhase.adSets) && basePhase.adSets.length > 0) {
                              updates.adSets = basePhase.adSets.map((adSet) => {
                                const currentAdSetGoal = adSet.optimizationGoal;
                                const nextAdSetGoal = currentAdSetGoal && validGoalValues.has(currentAdSetGoal)
                                  ? currentAdSetGoal
                                  : autoGoal;

                                return {
                                  ...adSet,
                                  optimizationGoal: nextAdSetGoal,
                                };
                              });
                            }

                            // Auto-populate destination from account defaults if objective requires destination
                            if (validDestinations.length > 0 && adAccountDefaults) {
                              // Always load landing page URL from defaults (used across destinations)
                              if (isMeta && !basePhase.metaLandingPageUrl && adAccountDefaults.metaLandingPageUrl) {
                                updates.metaLandingPageUrl = adAccountDefaults.metaLandingPageUrl;
                              }
                              if (!isMeta && !basePhase.tiktokLandingPageUrl && adAccountDefaults.tiktokLandingPageUrl) {
                                updates.tiktokLandingPageUrl = adAccountDefaults.tiktokLandingPageUrl;
                              }

                              if (isMeta) {
                                // Set Meta destination defaults only if not already set
                                if (!basePhase.metaOptimizationLocation && adAccountDefaults.metaOptimizationLocation) {
                                  const defaultDest = adAccountDefaults.metaOptimizationLocation;
                                  // Only set if it's a valid destination for this objective
                                  if (validDestinations.some((d) => d.value === defaultDest)) {
                                    updates.metaOptimizationLocation = defaultDest;
                                    // Auto-populate related fields based on destination
                                    if (defaultDest === 'APP') {
                                      updates.metaAppStore = basePhase.metaAppStore || adAccountDefaults.metaAppStore;
                                      updates.metaAppId = basePhase.metaAppId || adAccountDefaults.metaAppId;
                                    } else if (defaultDest === 'MESSAGING_APPS') {
                                      updates.metaMessagingMode = basePhase.metaMessagingMode || adAccountDefaults.metaMessagingMode;
                                      updates.metaMessengerEnabled = basePhase.metaMessengerEnabled !== undefined ? basePhase.metaMessengerEnabled : adAccountDefaults.metaMessengerEnabled;
                                      updates.metaInstagramDmEnabled = basePhase.metaInstagramDmEnabled !== undefined ? basePhase.metaInstagramDmEnabled : adAccountDefaults.metaInstagramDmEnabled;
                                      updates.metaWhatsappEnabled = basePhase.metaWhatsappEnabled !== undefined ? basePhase.metaWhatsappEnabled : adAccountDefaults.metaWhatsappEnabled;
                                      updates.metaWhatsappNumber = basePhase.metaWhatsappNumber || adAccountDefaults.metaWhatsappNumber;
                                      updates.metaPageId = basePhase.metaPageId || adAccountDefaults.metaPageId;
                                      updates.metaInstagramAccountId = basePhase.metaInstagramAccountId || adAccountDefaults.metaInstagramAccountId;
                                    }
                                  }
                                }
                              } else {
                                // Set TikTok destination defaults only if not already set
                                if (!basePhase.tiktokOptimizationLocation && adAccountDefaults.tiktokOptimizationLocation) {
                                  const defaultDest = adAccountDefaults.tiktokOptimizationLocation;
                                  // Only set if it's a valid destination for this objective
                                  if (validDestinations.some((d) => d.value === defaultDest)) {
                                    updates.tiktokOptimizationLocation = defaultDest;
                                    // Auto-populate related fields based on destination
                                    if (defaultDest === 'App') {
                                      updates.tiktokAppId = basePhase.tiktokAppId || adAccountDefaults.tiktokAppId;
                                      updates.tiktokAppName = basePhase.tiktokAppName || adAccountDefaults.tiktokAppName;
                                    } else if (defaultDest === 'Instant Messaging Apps') {
                                      updates.tiktokMessagingApp = basePhase.tiktokMessagingApp || adAccountDefaults.tiktokMessagingApp;
                                      updates.tiktokFacebookPageId = basePhase.tiktokFacebookPageId || adAccountDefaults.tiktokFacebookPageId;
                                      updates.tiktokMessageEventSet = basePhase.tiktokMessageEventSet || adAccountDefaults.tiktokMessageEventSet;
                                      updates.tiktokWhatsappNumber = basePhase.tiktokWhatsappNumber || adAccountDefaults.tiktokWhatsappNumber;
                                      updates.tiktokZaloAccountId = basePhase.tiktokZaloAccountId || adAccountDefaults.tiktokZaloAccountId;
                                      updates.tiktokLineBusinessId = basePhase.tiktokLineBusinessId || adAccountDefaults.tiktokLineBusinessId;
                                    } else if (defaultDest === 'TikTok Direct Messages') {
                                      updates.tiktokMessageEventSet = basePhase.tiktokMessageEventSet || adAccountDefaults.tiktokMessageEventSet;
                                    }
                                  }
                                }
                              }
                            }

                            updatePhaseFields(phase.id, updates);
                          }}
                          options={availableObjectives.map((obj) => ({ value: obj.value, label: obj.label }))}
                          placeholder="Select objective"
                          searchPlaceholder="Search objectives..."
                        />
                      </div>

                      {/* Optimization Goal with Split Button */}
                      <SplittableSection
                        dimension="optimization_goal"
                        dimensionLabel="Optimization Goal"
                        currentSplitDimension={phase.adSetSplitDimension}
                        onSplitClick={(dim, useCBO) => {
                          const newDimension = dim === 'none' ? undefined : dim;
                          const newAdSets = newDimension ? createInitialAdSets(dim, phase.name, {
                            platformId: platformId || 'meta',
                            availableOptimizationGoals: getOptimizationGoalsForPhase(phase.objective || "", phase).map(g => ({ value: g.value, label: g.label })),
                            currentOptimizationGoal: phase.optimizationGoal,
                            currentGender: phase.targeting?.genders?.[0] || basicTargeting?.genders?.[0],
                            currentAgeMin: phase.targeting?.ageMin ?? basicTargeting?.ageMin,
                            currentAgeMax: phase.targeting?.ageMax ?? basicTargeting?.ageMax,
                            currentDevices: phase.targeting?.devices || basicTargeting?.devices,
                            currentLanguages: phase.targeting?.languages || basicTargeting?.languages,
                          }) : undefined;
                          updatePhaseFields(phase.id, { 
                            adSetSplitDimension: newDimension,
                            adSets: newAdSets,
                            useCBO: useCBO,
                          });
                          // Trigger scroll to split manager
                          if (newDimension) {
                            setScrollToSplitPhaseId(phase.id);
                          }
                        }}
                        disabled={!phase.objective}
                      >
                        <div className="space-y-2">
                          <Label htmlFor={`optimization-${phase.id}`}>Optimization Goal</Label>
                          <Combobox
                            id={`optimization-${phase.id}`}
                            value={phase.optimizationGoal ?? ""}
                            onValueChange={(value) => {
                              const isMeta = !platformName.toLowerCase().includes('tiktok');
                              
                              // Check if this optimization goal requires a specific destination
                              const requiredDestination = isMeta ? getDestinationForOptimizationGoal(value) : null;
                              
                              const basePhase = phasesRef.current.find((p) => p.id === phase.id) ?? phase;

                              if (requiredDestination && adAccountDefaults) {
                                // Auto-set the destination and populate related defaults
                                const updates: Partial<Phase> = { 
                                  optimizationGoal: value,
                                  metaOptimizationLocation: requiredDestination 
                                };

                                if (
                                  Array.isArray(basePhase.adSets) &&
                                  basePhase.adSets.length > 0 &&
                                  basePhase.adSetSplitDimension !== 'optimization_goal'
                                ) {
                                  updates.adSets = basePhase.adSets.map((adSet) => ({
                                    ...adSet,
                                    optimizationGoal: value,
                                  }));
                                }
                                
                                // Auto-populate related fields based on destination
                                if (requiredDestination === 'APP') {
                                  if (!phase.metaAppStore && adAccountDefaults.metaAppStore) {
                                    updates.metaAppStore = adAccountDefaults.metaAppStore;
                                  }
                                  if (!phase.metaAppId && adAccountDefaults.metaAppId) {
                                    updates.metaAppId = adAccountDefaults.metaAppId;
                                  }
                                } else if (requiredDestination === 'MESSAGING_APPS') {
                                  if (phase.metaMessagingMode === undefined && adAccountDefaults.metaMessagingMode) {
                                    updates.metaMessagingMode = adAccountDefaults.metaMessagingMode;
                                  }
                                  if (phase.metaMessengerEnabled === undefined) {
                                    updates.metaMessengerEnabled = adAccountDefaults.metaMessengerEnabled;
                                  }
                                  if (phase.metaInstagramDmEnabled === undefined) {
                                    updates.metaInstagramDmEnabled = adAccountDefaults.metaInstagramDmEnabled;
                                  }
                                  if (phase.metaWhatsappEnabled === undefined) {
                                    updates.metaWhatsappEnabled = adAccountDefaults.metaWhatsappEnabled;
                                  }
                                  if (!phase.metaWhatsappNumber && adAccountDefaults.metaWhatsappNumber) {
                                    updates.metaWhatsappNumber = adAccountDefaults.metaWhatsappNumber;
                                  }
                                  if (!phase.metaPageId && adAccountDefaults.metaPageId) {
                                    updates.metaPageId = adAccountDefaults.metaPageId;
                                  }
                                  if (!phase.metaInstagramAccountId && adAccountDefaults.metaInstagramAccountId) {
                                    updates.metaInstagramAccountId = adAccountDefaults.metaInstagramAccountId;
                                  }
                                } else if (requiredDestination === 'WEBSITE') {
                                  if (!phase.metaLandingPageUrl && adAccountDefaults.metaLandingPageUrl) {
                                    updates.metaLandingPageUrl = adAccountDefaults.metaLandingPageUrl;
                                  }
                                } else if (requiredDestination === 'CALLS') {
                                  if (!phase.metaPageId && adAccountDefaults.metaPageId) {
                                    updates.metaPageId = adAccountDefaults.metaPageId;
                                  }
                                }
                                
                                updatePhaseFields(phase.id, updates);
                              } else {
                                // No destination required, just update the goal
                                if (
                                  Array.isArray(basePhase.adSets) &&
                                  basePhase.adSets.length > 0 &&
                                  basePhase.adSetSplitDimension !== 'optimization_goal'
                                ) {
                                  updatePhaseFields(phase.id, {
                                    optimizationGoal: value,
                                    adSets: basePhase.adSets.map((adSet) => ({
                                      ...adSet,
                                      optimizationGoal: value,
                                    })),
                                  });
                                } else {
                                  updatePhaseField(phase.id, "optimizationGoal", value);
                                }
                              }
                            }}
                            disabled={!phase.objective}
                            className={!phase.objective ? "opacity-50" : undefined}
                            options={getOptimizationGoalsForPhase(phase.objective || "", phase).map((goal) => ({
                              value: goal.value,
                              label: goal.label,
                            }))}
                            placeholder={phase.objective ? "Select optimization goal" : "Select objective first"}
                            searchPlaceholder="Search optimization goals..."
                          />
                        </div>
                      </SplittableSection>

                      {/* Destination Configuration - Show only for Meta (TikTok handles this in TiktokPhaseConfig) */}
                      {(() => {
                        const isTikTok = platformName.toLowerCase().includes('tiktok');
                        // Skip destination config for TikTok - handled in TiktokPhaseConfig
                        if (isTikTok) return null;
                        
                        // Objectives that do NOT support optimization location selection
                        const objectivesWithoutOptimizationLocation = [
                          'OUTCOME_AWARENESS',
                          'REACH',
                          'BRAND_AWARENESS',
                          'OUTCOME_ENGAGEMENT', // Will be handled specially below based on optimization goal
                        ];
                        
                        // Optimization goals that do NOT require/support optimization location
                        const goalsWithoutOptimizationLocation = [
                          'REACH',
                          'IMPRESSIONS',
                          'AD_RECALL_LIFT',
                          'THRUPLAY',
                          'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS',
                          'POST_ENGAGEMENT',
                          'PAGE_LIKES',
                          'EVENT_RESPONSES',
                          'VIDEO_VIEWS',
                        ];
                        
                        const platformType = "meta";
                        const objectiveLevelDestinations = phase.objective ? getDestinationsForObjective(platformType, phase.objective) : [];
                        
                        // Check if current optimization goal requires a specific destination
                        const goalRequiredDestination = phase.optimizationGoal ? getDestinationForOptimizationGoal(phase.optimizationGoal) : null;
                        
                        // Use goal-specific destination filtering
                        const goalSpecificDestinations = (phase.objective && phase.optimizationGoal) 
                          ? getDestinationsForGoal(phase.objective, phase.optimizationGoal) 
                          : null;
                        
                        // Hide optimization location for objectives that don't support it (except Engagement which is goal-specific)
                        if (phase.objective && objectivesWithoutOptimizationLocation.includes(phase.objective) && phase.objective !== 'OUTCOME_ENGAGEMENT') {
                          return null;
                        }
                        
                        // For Engagement objective, use goal-specific destinations
                        if (phase.objective === 'OUTCOME_ENGAGEMENT') {
                          if (goalSpecificDestinations !== null && goalSpecificDestinations.length === 0) return null;
                          if (goalSpecificDestinations === null && !goalRequiredDestination) return null;
                        } else {
                          // Hide for optimization goals that don't support optimization location
                          if (
                            phase.optimizationGoal &&
                            goalsWithoutOptimizationLocation.includes(phase.optimizationGoal) &&
                            !goalRequiredDestination
                          ) {
                            return null;
                          }
                          // For other objectives, use standard logic
                          if (objectiveLevelDestinations.length === 0 && !goalRequiredDestination) return null;
                        }
                        
                        const currentDestination = phase.metaOptimizationLocation;
                        
                        // Determine available destinations: goal-specific > goal-required > objective-level
                        let availableDestinations: Array<{ value: string; label: string }>;
                        if (goalSpecificDestinations !== null && goalSpecificDestinations.length > 0) {
                          const allLocations = [
                            { value: "WEBSITE", label: "Website" },
                            { value: "APP", label: "App" },
                            { value: "MESSAGING_APPS", label: "Messaging Apps" },
                            { value: "CALLS", label: "Calls" },
                          ];
                          availableDestinations = allLocations.filter(d => goalSpecificDestinations.includes(d.value));
                        } else if (goalRequiredDestination) {
                          availableDestinations = objectiveLevelDestinations.filter(d => d.value === goalRequiredDestination);
                        } else {
                          availableDestinations = objectiveLevelDestinations;
                        }
                        
                        return (
                          <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
                            <Label className="font-medium">Optimization Location</Label>
                            
                            {/* Show info if destination is auto-set by optimization goal */}
                            {goalRequiredDestination && (
                              <p className="text-xs text-muted-foreground">
                                Auto-set based on optimization goal: {availableDestinations[0]?.label || goalRequiredDestination}
                              </p>
                            )}
                            
                            {/* Destination Selection */}
                            <Select
                              value={currentDestination || goalRequiredDestination || ""}
                              onValueChange={(value) => {
                                if (isTikTok) {
                                  updatePhaseField(phase.id, "tiktokOptimizationLocation", value);
                                } else {
                                  // Update destination and auto-populate related defaults
                                  const updates: Partial<Phase> = { metaOptimizationLocation: value };
                                  if (value === 'WEBSITE' && adAccountDefaults) {
                                    if (!phase.metaLandingPageUrl && adAccountDefaults.metaLandingPageUrl) {
                                      updates.metaLandingPageUrl = adAccountDefaults.metaLandingPageUrl;
                                    }
                                  } else if (value === 'APP' && adAccountDefaults) {
                                    if (!phase.metaAppStore && adAccountDefaults.metaAppStore) {
                                      updates.metaAppStore = adAccountDefaults.metaAppStore;
                                    }
                                    if (!phase.metaAppId && adAccountDefaults.metaAppId) {
                                      updates.metaAppId = adAccountDefaults.metaAppId;
                                    }
                                  } else if (value === 'MESSAGING_APPS' && adAccountDefaults) {
                                    if (phase.metaMessagingMode === undefined && adAccountDefaults.metaMessagingMode) {
                                      updates.metaMessagingMode = adAccountDefaults.metaMessagingMode;
                                    }
                                    if (phase.metaMessengerEnabled === undefined) {
                                      updates.metaMessengerEnabled = adAccountDefaults.metaMessengerEnabled;
                                    }
                                    if (phase.metaInstagramDmEnabled === undefined) {
                                      updates.metaInstagramDmEnabled = adAccountDefaults.metaInstagramDmEnabled;
                                    }
                                    if (phase.metaWhatsappEnabled === undefined) {
                                      updates.metaWhatsappEnabled = adAccountDefaults.metaWhatsappEnabled;
                                    }
                                    if (!phase.metaWhatsappNumber && adAccountDefaults.metaWhatsappNumber) {
                                      updates.metaWhatsappNumber = adAccountDefaults.metaWhatsappNumber;
                                    }
                                    if (!phase.metaPageId && adAccountDefaults.metaPageId) {
                                      updates.metaPageId = adAccountDefaults.metaPageId;
                                    }
                                    if (!phase.metaInstagramAccountId && adAccountDefaults.metaInstagramAccountId) {
                                      updates.metaInstagramAccountId = adAccountDefaults.metaInstagramAccountId;
                                    }
                                  } else if (value === 'CALLS' && adAccountDefaults) {
                                    if (!phase.metaPageId && adAccountDefaults.metaPageId) {
                                      updates.metaPageId = adAccountDefaults.metaPageId;
                                    }
                                  }
                                  updatePhaseFields(phase.id, updates);
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select destination" />
                              </SelectTrigger>
                              <SelectContent>
                                {(availableDestinations.length > 0 ? availableDestinations : validDestinations).map((dest) => (
                                  <SelectItem key={dest.value} value={dest.value}>
                                    {dest.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            
                            {/* Meta-specific destination fields */}
                            {(currentDestination === 'WEBSITE' || goalRequiredDestination === 'WEBSITE') && (
                              <div className="space-y-2">
                                <Label className="text-xs">Landing Page URL</Label>
                                <Input
                                  placeholder="https://example.com"
                                  value={phase.metaLandingPageUrl || ""}
                                  onChange={(e) => updatePhaseField(phase.id, "metaLandingPageUrl", e.target.value)}
                                />
                              </div>
                            )}
                            
                            {(currentDestination === 'APP' || goalRequiredDestination === 'APP') && (
                              <div className="space-y-3">
                                <div className="space-y-2">
                                  <Label className="text-xs">App Store</Label>
                                  <Select
                                    value={phase.metaAppStore || ""}
                                    onValueChange={(value) => updatePhaseField(phase.id, "metaAppStore", value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select app store" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {META_APP_STORES.map((store) => (
                                        <SelectItem key={store.value} value={store.value}>
                                          {store.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs">App</Label>
                                  {adAccountDefaults?.metaAppId ? (
                                    <Select
                                      value={phase.metaAppId || ""}
                                      onValueChange={(value) => updatePhaseField(phase.id, "metaAppId", value)}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select app" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value={adAccountDefaults.metaAppId}>
                                          App ID: {adAccountDefaults.metaAppId}
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                                      <span className="text-sm text-muted-foreground">No app configured</span>
                                      <a 
                                        href="/clients" 
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                      >
                                        <Plus className="h-3 w-3" />
                                        Add in Client Defaults
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {(currentDestination === 'MESSAGING_APPS' || goalRequiredDestination === 'MESSAGING_APPS') && (
                              <div className="space-y-3">
                                <div className="space-y-2">
                                  <Label className="text-xs">Messaging Mode</Label>
                                  <Select
                                    value={phase.metaMessagingMode || "AUTOMATIC"}
                                    onValueChange={(value) => updatePhaseField(phase.id, "metaMessagingMode", value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {META_MESSAGING_MODES.map((mode) => (
                                        <SelectItem key={mode.value} value={mode.value}>
                                          {mode.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                {phase.metaMessagingMode === 'MANUAL' && (
                                  <div className="space-y-3">
                                    <Label className="text-xs font-medium">Messaging Channels</Label>
                                    
                                    {/* Facebook Messenger */}
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`messenger-${phase.id}`}
                                        checked={phase.metaMessengerEnabled || false}
                                        onCheckedChange={(checked) => updatePhaseField(phase.id, "metaMessengerEnabled", checked)}
                                      />
                                      <label htmlFor={`messenger-${phase.id}`} className="text-xs cursor-pointer">
                                        Facebook Messenger
                                      </label>
                                    </div>
                                    
                                    {/* Instagram DM */}
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`instagram-dm-${phase.id}`}
                                        checked={phase.metaInstagramDmEnabled || false}
                                        onCheckedChange={(checked) => updatePhaseField(phase.id, "metaInstagramDmEnabled", checked)}
                                      />
                                      <label htmlFor={`instagram-dm-${phase.id}`} className="text-xs cursor-pointer">
                                        Instagram Direct Messages
                                      </label>
                                    </div>
                                    
                                    {/* WhatsApp */}
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`whatsapp-${phase.id}`}
                                        checked={phase.metaWhatsappEnabled || false}
                                        onCheckedChange={(checked) => updatePhaseField(phase.id, "metaWhatsappEnabled", checked)}
                                      />
                                      <label htmlFor={`whatsapp-${phase.id}`} className="text-xs cursor-pointer">
                                        WhatsApp
                                      </label>
                                    </div>
                                    
                                    {/* WhatsApp Number - show only when WhatsApp is enabled */}
                                    {phase.metaWhatsappEnabled && (
                                      <div className="space-y-2 pl-6">
                                        <Label className="text-xs">WhatsApp Business Number</Label>
                                        <Input
                                          placeholder="+1234567890"
                                          value={phase.metaWhatsappNumber || ""}
                                          onChange={(e) => updatePhaseField(phase.id, "metaWhatsappNumber", e.target.value)}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {(currentDestination === 'CALLS' || goalRequiredDestination === 'CALLS') && (
                              <div className="space-y-2">
                                <Label className="text-xs">Facebook Page (for Call Button)</Label>
                                {adAccountDefaults?.metaPageId ? (
                                  <div className="p-2 border rounded-md bg-muted/50">
                                    <span className="text-sm">Page ID: {phase.metaPageId || adAccountDefaults.metaPageId}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                                    <span className="text-sm text-muted-foreground">No page configured</span>
                                    <a 
                                      href="/clients" 
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                    >
                                      <Plus className="h-3 w-3" />
                                      Add in Client Defaults
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                )}
                              </div>
                            )}
                            
                          </div>
                        );
                      })()}

                      {/* Budget Type - Inline with validation */}
                      {(() => {
                        const effectiveBudgetType = optimisticBudgetTypes[phase.id] ?? phase.budgetType;

                        return (
                          <div
                            className={`p-4 rounded-lg border-2 ${!effectiveBudgetType ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20" : "border-border bg-muted/50"}`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="font-medium">Budget Type *</Label>
                                {!effectiveBudgetType && (
                                  <Badge
                                    variant="outline"
                                    className="border-yellow-500 text-yellow-700 dark:text-yellow-300"
                                  >
                                    Required
                                  </Badge>
                                )}
                              </div>

                              <BudgetTypeToggleGroup
                                id={`budget-type-${phase.id}`}
                                value={effectiveBudgetType ?? "none"}
                                options={[
                                  { value: "none", label: "None" },
                                  { value: "daily", label: "Daily" },
                                  { value: "lifetime", label: "Lifetime" },
                                ]}
                                onValueChange={(value) => {
                                  const bt: Phase["budgetType"] | undefined =
                                    value === "none" ? undefined : (value as "daily" | "lifetime");

                                  // Update UI immediately (prevents reverting during intermediate re-renders).
                                  setOptimisticBudgetTypes((prev) => ({ ...prev, [phase.id]: bt }));

                                  // Signal parent to skip the next generic→market phase sync (prevents circular clobber).
                                  onSkipNextSync?.();

                                  // Commit via the stable helper (updates phasesRef.current first),
                                  // otherwise rapid toggles can read a stale phasesRef snapshot and "snap back".
                                  updatePhaseField(phase.id, "budgetType", bt);

                                  // Ask whether to apply this type to all phases.
                                  if (onApplyBudgetTypeToAll && bt) {
                                    setPendingBudgetType(bt);
                                    setPendingBudgetPhaseId(phase.id);
                                    // Defer opening so we don't compete with intermediate renders.
                                    setTimeout(() => setBudgetTypeDialogOpen(true), 0);
                                  }
                                }}
                              />

                              {!effectiveBudgetType && (
                                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                                  Please select a budget type to continue
                                </p>
                              )}

                              {/* Daily Budget Breakdown */}
                              {effectiveBudgetType === "daily" && marketBudget && marketBudget > 0 && (
                                <div className="mt-3 p-3 rounded-md bg-muted/30 border border-border">
                                  <div className="text-xs font-semibold text-muted-foreground mb-2">Daily Budget Breakdown</div>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                      <span className="text-muted-foreground">Phase Budget:</span>
                                      <span className="font-medium">
                                        ${((marketBudget * phase.budgetPercentage) / 100).toLocaleString(undefined, {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-muted-foreground">Duration:</span>
                                      <span className="font-medium">
                                        {(() => {
                                          const start = parseISO(phase.startDate);
                                          const end = parseISO(phase.endDate);
                                          const duration = differenceInDays(end, start) + 1;
                                          return `${duration} day${duration !== 1 ? "s" : ""}`;
                                        })()}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between pt-2 border-t border-border">
                                      <span className="text-muted-foreground font-medium">Daily Budget:</span>
                                      <span className="font-semibold text-primary">
                                        ${(() => {
                                          const start = parseISO(phase.startDate);
                                          const end = parseISO(phase.endDate);
                                          const duration = differenceInDays(end, start) + 1;
                                          const phaseBudget = (marketBudget * phase.budgetPercentage) / 100;
                                          const dailyBudget = phaseBudget / duration;
                                          return dailyBudget.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          });
                                        })()}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Publisher Platforms & Placements with Split Button */}
                      {/* Hidden when Advantage+ Shopping (Meta) or Smart+ (TikTok) is enabled - placements auto-managed */}
                      {!(
                        (platformId?.toLowerCase() === 'meta' && phase.metaAdvantagePlusCampaign) ||
                        (platformId?.toLowerCase() === 'tiktok' && phase.tiktokSmartPlusEnabled)
                      ) && (
                        <SplittableSection
                          dimension="placement"
                          dimensionLabel="Placement"
                          currentSplitDimension={phase.adSetSplitDimension}
                          onSplitClick={(dim, useCBO) => {
                            const newDimension = dim === 'none' ? undefined : dim;
                            const newAdSets = newDimension ? createInitialAdSets(dim, phase.name, {
                              platformId: platformId || 'meta',
                              availablePlacements: getPlacementsForSelection(platformName, phase.assetTypes || []),
                                availableOptimizationGoals: getOptimizationGoalsForPhase(phase.objective || "", phase).map(g => ({ value: g.value, label: g.label })),
                              currentGender: phase.targeting?.genders?.[0] || basicTargeting?.genders?.[0],
                              currentAgeMin: phase.targeting?.ageMin ?? basicTargeting?.ageMin,
                              currentAgeMax: phase.targeting?.ageMax ?? basicTargeting?.ageMax,
                              currentDevices: phase.targeting?.devices || basicTargeting?.devices,
                              currentLanguages: phase.targeting?.languages || basicTargeting?.languages,
                              currentOptimizationGoal: phase.optimizationGoal,
                            }) : undefined;
                            updatePhaseFields(phase.id, { 
                              adSetSplitDimension: newDimension,
                              adSets: newAdSets,
                              useCBO: useCBO,
                            });
                            // Trigger scroll to split manager
                            if (newDimension) {
                              setScrollToSplitPhaseId(phase.id);
                            }
                          }}
                        >
                          <div className="space-y-2">
                            <CampaignPublisherConfig
                              platformName={platformName}
                              publisherPlatforms={phase.publisherPlatforms || []}
                              positions={phase.positions || {}}
                              advantagePlusPlacements={phase.advantagePlusPlacements}
                              placementPreset={phase.placementPreset}
                              onPublisherPlatformsChange={(publishers) => 
                                updatePhaseField(phase.id, "publisherPlatforms", publishers)
                              }
                              onPositionsChange={(positions) => 
                                updatePhaseField(phase.id, "positions", positions)
                              }
                              onAdvantagePlusPlacementsChange={(enabled) =>
                                updatePhaseField(phase.id, "advantagePlusPlacements", enabled)
                              }
                              onPlacementPresetChange={(preset) =>
                                updatePhaseField(phase.id, "placementPreset", preset)
                              }
                              onBatchUpdate={(updates) => 
                                updatePhaseFields(phase.id, updates)
                              }
                            />
                          </div>
                        </SplittableSection>
                      )}

                      {/* Ad Format Split Option - Meta only */}
                      {platformName.includes("Meta") && (
                        <SplittableSection
                          dimension="ad_format"
                          dimensionLabel="Ad Format"
                          currentSplitDimension={phase.adSetSplitDimension}
                          onSplitClick={(dim, useCBO) => {
                            const newDimension = dim === 'none' ? undefined : dim;
                            const newAdSets = newDimension ? createInitialAdSets(dim, phase.name, {
                              platformId: platformId || 'meta',
                              availableOptimizationGoals: getOptimizationGoalsForPhase(phase.objective || "", phase).map(g => ({ value: g.value, label: g.label })),
                              currentGender: phase.targeting?.genders?.[0] || basicTargeting?.genders?.[0],
                              currentAgeMin: phase.targeting?.ageMin ?? basicTargeting?.ageMin,
                              currentAgeMax: phase.targeting?.ageMax ?? basicTargeting?.ageMax,
                              currentDevices: phase.targeting?.devices || basicTargeting?.devices,
                              currentLanguages: phase.targeting?.languages || basicTargeting?.languages,
                              currentOptimizationGoal: phase.optimizationGoal,
                            }) : undefined;
                            updatePhaseFields(phase.id, { 
                              adSetSplitDimension: newDimension,
                              adSets: newAdSets,
                              useCBO: useCBO,
                            });
                            // Trigger scroll to split manager
                            if (newDimension) {
                              setScrollToSplitPhaseId(phase.id);
                            }
                          }}
                        >
                          <div className="p-3 border rounded-md bg-muted/30">
                            <p className="text-xs text-muted-foreground">
                              Split by ad format to test different creative placements (Feed vs Stories, Carousel vs Single).
                              This helps optimize creative matching.
                            </p>
                          </div>
                        </SplittableSection>
                      )}

                      {/* TikTok Advanced Settings - Platform-specific */}
                      {platformId?.toLowerCase() === 'tiktok' && (
                        <TiktokPhaseConfig
                          phase={phase}
                          adAccountDefaults={adAccountDefaults}
                          onUpdate={(field, value) => {
                            console.log("🔄 PhaseScheduler onUpdate called:", { phaseId: phase.id, field, value });
                            updatePhaseField(phase.id, field as keyof Phase, value);
                          }}
                        />
                      )}

                      {/* Meta Advanced Settings - Platform-specific */}
                      {platformId?.toLowerCase() === 'meta' && (
                        <MetaPhaseConfig
                          phase={phase}
                          adAccountDefaults={adAccountDefaults}
                          onUpdate={(field, value) => {
                            console.log("🔄 PhaseScheduler Meta onUpdate called:", { phaseId: phase.id, field, value });
                            updatePhaseField(phase.id, field as keyof Phase, value);
                          }}
                        />
                      )}

                      {/* Google Ads Advanced Settings - Platform-specific */}
                      {(platformId?.toLowerCase() === 'google' || platformId?.toLowerCase() === 'google_ads') && (
                        <GoogleAdsPhaseConfig
                          phase={phase}
                          googleCustomerId={adAccountDefaults?.googleCustomerId}
                          selectedKeywords={basicTargeting?.selectedKeywords}
                          googleDefaults={adAccountDefaults ? {
                            googleBidStrategy: adAccountDefaults.googleBidStrategy,
                            googleTargetCpa: adAccountDefaults.googleTargetCpa,
                            googleTargetRoas: adAccountDefaults.googleTargetRoas,
                            googleMaxCpcBid: adAccountDefaults.googleMaxCpcBid,
                            googleCampaignType: adAccountDefaults.googleCampaignType,
                            googleCampaignSubtype: adAccountDefaults.googleCampaignSubtype,
                            googleLocationTargeting: adAccountDefaults.googleLocationTargeting,
                            googleSearchPartner: adAccountDefaults.googleSearchPartner,
                            googleDisplayNetwork: adAccountDefaults.googleDisplayNetwork,
                            googleCustomerAcquisition: adAccountDefaults.googleCustomerAcquisition,
                            googleOptimizedTargeting: adAccountDefaults.googleOptimizedTargeting,
                            googleInventoryType: adAccountDefaults.googleInventoryType,
                            googleAiMax: adAccountDefaults.googleAiMax,
                            googleAiMaxOptions: adAccountDefaults.googleAiMaxOptions,
                            googleLandingPageUrl: adAccountDefaults.googleLandingPageUrl,
                            googleBrandGuidelines: adAccountDefaults.googleBrandGuidelines,
                            googleBusinessName: adAccountDefaults.googleBusinessName,
                          } : undefined}
                          onUpdate={(field, value) => {
                            console.log("🔄 PhaseScheduler Google Ads onUpdate called:", { phaseId: phase.id, field, value });
                            updatePhaseField(phase.id, field as keyof Phase, value);
                          }}
                        />
                      )}

                      {/* Ad Set Split Manager - shown at bottom of phase */}
                      {/* Show split manager if phase has its own split OR inherits from basic targeting (when not overriding) */}
                      {(() => {
                        // Determine effective split dimension - check per-platform first, then legacy
                        const hasOwnSplit = phase.adSetSplitDimension && phase.adSetSplitDimension !== 'none';
                        
                        // Check per-platform dimension first - only fall back to legacy if no per-platform config exists at all
                        const perPlatformConfig = basicTargeting?.defaultAdSetSplitDimensionPerPlatform;
                        const hasPerPlatformConfig = perPlatformConfig && Object.keys(perPlatformConfig).length > 0;
                        
                        // If per-platform config exists, only use this platform's dimension (no fallback to legacy)
                        // If no per-platform config, use legacy dimension for backwards compatibility
                        const platformDefaultDimension = hasPerPlatformConfig 
                          ? perPlatformConfig[platformId || 'meta'] 
                          : basicTargeting?.defaultAdSetSplitDimension;
                        
                        const hasInheritedSplit = !phase.overrideTargeting && 
                          platformDefaultDimension && 
                          platformDefaultDimension !== 'none';
                        
                        const effectiveDimension = hasOwnSplit 
                          ? phase.adSetSplitDimension 
                          : (hasInheritedSplit ? platformDefaultDimension : undefined);
                        
                        if (!effectiveDimension || effectiveDimension === 'none') return null;
                        
                        // Determine effective ad sets - use phase's own or inherit from default
                        const hasOwnAdSets = phase.adSets && phase.adSets.length > 0;
                        
                        // Check for per-platform default ad sets - only fall back to legacy if no per-platform config exists
                        const perPlatformAdSets = basicTargeting?.defaultAdSetsPerPlatform;
                        const hasPerPlatformAdSets = perPlatformAdSets && Object.keys(perPlatformAdSets).length > 0;
                        const platformDefaultAdSets = hasPerPlatformAdSets
                          ? perPlatformAdSets[platformId || 'meta']
                          : basicTargeting?.defaultAdSets;
                        const hasDefaultAdSets = platformDefaultAdSets && platformDefaultAdSets.length > 0;
                        
                        // If inheriting and phase doesn't have its own ad sets, use the default ad sets
                        const isInheritingAdSets = hasInheritedSplit && !hasOwnSplit && !hasOwnAdSets && hasDefaultAdSets;
                        const effectiveAdSets = hasOwnAdSets 
                          ? phase.adSets 
                          : (isInheritingAdSets ? platformDefaultAdSets : undefined);
                        
                        // If no effective ad sets and no default to inherit, show configuration message
                        const needsConfiguration = hasInheritedSplit && !hasOwnSplit && !hasOwnAdSets && !hasDefaultAdSets;
                        
                        return (
                          <div 
                            ref={(el) => { splitManagerRefs.current[phase.id] = el; }}
                            className="mt-4"
                          >
                            {needsConfiguration ? (
                              <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium">
                                      Inherited Ad Set Split: <span className="text-primary">{effectiveDimension.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      No default ad sets configured. Configure them in the Default Targeting section or create phase-specific splits.
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      // Initialize the phase with the inherited split using proper ad set creation
                                      const initialAdSets = createInitialAdSets(effectiveDimension!, phase.name, {
                                        platformId: platformId || 'meta',
                                        availableOptimizationGoals: getOptimizationGoalsForPhase(phase.objective || "", phase).map(g => ({ value: g.value, label: g.label })),
                                        currentOptimizationGoal: phase.optimizationGoal,
                                        currentGender: phase.targeting?.genders?.[0] || basicTargeting?.genders?.[0],
                                        currentAgeMin: phase.targeting?.ageMin ?? basicTargeting?.ageMin,
                                        currentAgeMax: phase.targeting?.ageMax ?? basicTargeting?.ageMax,
                                        currentDevices: phase.targeting?.devices || basicTargeting?.devices,
                                        currentLanguages: phase.targeting?.languages || basicTargeting?.languages,
                                      });
                                      updatePhaseFields(phase.id, {
                                        adSetSplitDimension: effectiveDimension,
                                        adSets: initialAdSets,
                                        useCBO: basicTargeting?.defaultAdSetSplitUseCBO,
                                      });
                                    }}
                                  >
                                    Configure Split
                                  </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  To disable this split for this phase only, enable "Override Targeting" above.
                                </p>
                              </div>
                            ) : effectiveAdSets && effectiveAdSets.length > 0 ? (
                              <div className="space-y-2">
                                {/* Show indicator when inheriting from default */}
                                {isInheritingAdSets && (
                                  <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                      <strong>Inheriting from default:</strong> These ad sets are configured at the campaign level. 
                                      Enable "Override Targeting" to customize for this phase.
                                    </p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        // Copy the default ad sets to the phase so user can customize
                                        const copiedAdSets = effectiveAdSets.map(adSet => ({
                                          ...adSet,
                                          id: crypto.randomUUID(), // Generate new IDs
                                          name: adSet.name.replace('Default_', `${phase.name}_`),
                                        }));
                                        updatePhaseFields(phase.id, {
                                          adSetSplitDimension: effectiveDimension,
                                          adSets: copiedAdSets,
                                          useCBO: basicTargeting?.defaultAdSetSplitUseCBO,
                                        });
                                      }}
                                    >
                                      Override
                                    </Button>
                                  </div>
                                )}
                                <AdSetSplitManager
                                  dimension={effectiveDimension}
                                  adSets={effectiveAdSets}
                                  platformName={platformName}
                                  platformId={platformId || 'meta'}
                                  phaseName={phase.name}
                                  useCBO={phase.useCBO ?? basicTargeting?.defaultAdSetSplitUseCBO}
                                  onAdSetsChange={(adSets) => {
                                    // If inheriting, first copy to phase then update
                                    if (isInheritingAdSets) {
                                      updatePhaseFields(phase.id, {
                                        adSetSplitDimension: effectiveDimension,
                                        adSets: adSets,
                                        useCBO: basicTargeting?.defaultAdSetSplitUseCBO,
                                      });
                                    } else {
                                      updatePhaseField(phase.id, "adSets", adSets);
                                    }
                                  }}
                                  onRemoveSplit={() => updatePhaseFields(phase.id, { 
                                    adSetSplitDimension: undefined,
                                    adSets: undefined,
                                    useCBO: undefined,
                                  })}
                                  availablePlacements={getPlacementsForSelection(platformName, phase.assetTypes || [])}
                                  availableOptimizationGoals={getOptimizationGoalsForPhase(phase.objective || "", phase).map(g => ({ value: g.value, label: g.label }))}
                                  availableAudiences={phase.audiences?.map(a => ({ id: a.id, name: a.name, type: a.type })) || []}
                                  adAccountId={adAccountId}
                                  currentGender={phase.targeting?.genders?.[0] || basicTargeting?.genders?.[0]}
                                  currentAgeMin={phase.targeting?.ageMin ?? basicTargeting?.ageMin}
                                  currentAgeMax={phase.targeting?.ageMax ?? basicTargeting?.ageMax}
                                  currentDevices={phase.targeting?.devices || basicTargeting?.devices}
                                  currentLanguages={phase.targeting?.languages || basicTargeting?.languages}
                                />
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
          
          {phases.length > 0 && (
            <div className="flex items-center justify-between text-xs font-semibold pt-2 border-t mt-4">
              <span>Total Budget Allocation</span>
              <span className={phases.reduce((sum, p) => sum + p.budgetPercentage, 0) === 100 ? "text-primary" : "text-destructive"}>
                {phases.reduce((sum, p) => sum + p.budgetPercentage, 0)}%
              </span>
            </div>
          )}
        </div>
      </CardContent>

      {/* Budget Type Apply Dialog */}
      {pendingBudgetType && (
        <BudgetTypeApplyDialog
          open={budgetTypeDialogOpen}
          onOpenChange={(open) => {
            setBudgetTypeDialogOpen(open);
            if (!open) {
              setPendingBudgetPhaseId(null);
              setPendingBudgetType(null);
            }
          }}
          budgetType={pendingBudgetType}
          onConfirm={() => {
            if (onApplyBudgetTypeToAll) {
              onApplyBudgetTypeToAll(pendingBudgetType);
            }
          }}
          onCustomize={() => {
            onOpenCustomizeBudgetTypes?.();
          }}
        />
      )}
    </Card>
  );
}
