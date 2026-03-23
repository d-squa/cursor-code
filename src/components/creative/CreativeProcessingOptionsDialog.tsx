// Creative Processing Options Dialog
// Shown when user clicks "Run Matching" — lets them enable carousel auto-grouping
// and asset customization detection before matching begins

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Layers,
  LayoutGrid,
  AlertTriangle,
  Wand2,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { DetectedGroupCard } from './DetectedGroupCard';
import {
  runCreativeDetection,
  isCarouselCompatible,
  isAssetCustomizationCompatible,
  type DetectableAsset,
  type DetectedGroup,
} from '@/utils/creativeProcessingDetection';

export interface ProcessingOptions {
  enableCarousel: boolean;
  enableAssetCustomization: boolean;
  approvedGroupIds: Set<string>;
  rejectedGroupIds: Set<string>;
  detectedGroups: DetectedGroup[];
}

interface CreativeProcessingOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: DetectableAsset[];
  platform: string;
  objective?: string;
  googleCampaignType?: string;
  onConfirm: (options: ProcessingOptions) => void;
  isProcessing?: boolean;
}

export function CreativeProcessingOptionsDialog({
  open,
  onOpenChange,
  assets,
  platform,
  objective,
  googleCampaignType,
  onConfirm,
  isProcessing = false,
}: CreativeProcessingOptionsDialogProps) {
  const [enableCarousel, setEnableCarousel] = useState(true);
  const [enableAssetCustomization, setEnableAssetCustomization] = useState(true);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

  // Compatibility checks
  const carouselCompatible = useMemo(
    () => isCarouselCompatible(platform, objective, googleCampaignType),
    [platform, objective, googleCampaignType]
  );
  const acCompatible = useMemo(
    () => isAssetCustomizationCompatible(platform, objective, googleCampaignType),
    [platform, objective, googleCampaignType]
  );

  // Run detection
  const detection = useMemo(() => {
    console.log(`[ProcessingDialog] Running detection on ${assets.length} assets, platform=${platform}`);
    console.log(`[ProcessingDialog] Assets:`, assets.map(a => ({
      name: a.name,
      filePath: a.filePath,
      folderPath: a.folderPath,
      type: a.assetType,
      w: a.width,
      h: a.height,
    })));

    const result = runCreativeDetection(assets, {
      enableCarousel: enableCarousel && carouselCompatible,
      enableAssetCustomization: enableAssetCustomization && acCompatible,
      platform,
      objective,
      googleCampaignType,
    });

    console.log(`[ProcessingDialog] Detection results: ${result.carouselGroups.length} carousels, ${result.assetCustomizations.length} asset customizations`);
    if (result.carouselGroups.length > 0) {
      result.carouselGroups.forEach(g => console.log(`[ProcessingDialog] Carousel: "${g.id}" — ${g.assets.length} assets in "${g.folderPath}"`));
    }

    return result;
  }, [assets, enableCarousel, enableAssetCustomization, platform, objective, googleCampaignType, carouselCompatible, acCompatible]);

  const allGroups: DetectedGroup[] = [
    ...detection.carouselGroups,
    ...detection.assetCustomizations,
  ];

  const hasDetections = allGroups.length > 0;

  const handleApprove = (groupId: string) => {
    setApprovedIds((prev) => {
      const next = new Set(prev);
      next.add(groupId);
      return next;
    });
    setRejectedIds((prev) => {
      const next = new Set(prev);
      next.delete(groupId);
      return next;
    });
  };

  const handleReject = (groupId: string) => {
    setRejectedIds((prev) => {
      const next = new Set(prev);
      next.add(groupId);
      return next;
    });
    setApprovedIds((prev) => {
      const next = new Set(prev);
      next.delete(groupId);
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm({
      enableCarousel: enableCarousel && carouselCompatible,
      enableAssetCustomization: enableAssetCustomization && acCompatible,
      approvedGroupIds: approvedIds,
      rejectedGroupIds: rejectedIds,
      detectedGroups: allGroups,
    });
  };

  const pendingCount = allGroups.filter(
    (g) => !approvedIds.has(g.id) && !rejectedIds.has(g.id)
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Creative Processing Options
          </DialogTitle>
          <DialogDescription>
            Configure how your {assets.length} creatives will be processed and grouped before matching.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-2">
            {/* Toggle: Carousel Auto-Grouping */}
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 mt-0.5">
                <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="carousel-toggle" className="text-sm font-semibold cursor-pointer">
                    Carousel Auto-Grouping
                  </Label>
                  <Switch
                    id="carousel-toggle"
                    checked={enableCarousel && carouselCompatible}
                    onCheckedChange={setEnableCarousel}
                    disabled={!carouselCompatible}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Automatically detect and group compatible images into carousel ads based on same
                  dimensions, folder structure, and sequence indicators in file names.
                </p>
                {!carouselCompatible && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    Not compatible with current campaign objective/type
                  </div>
                )}
                {enableCarousel && carouselCompatible && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {detection.carouselGroups.length > 0 ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {detection.carouselGroups.length} carousel group{detection.carouselGroups.length !== 1 ? 's' : ''} detected
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">No carousel patterns detected</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Toggle: Asset Customization Detection */}
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 mt-0.5">
                <LayoutGrid className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ac-toggle" className="text-sm font-semibold cursor-pointer">
                    Asset Customization Detection
                  </Label>
                  <Switch
                    id="ac-toggle"
                    checked={enableAssetCustomization && acCompatible}
                    onCheckedChange={setEnableAssetCustomization}
                    disabled={!acCompatible}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Detect creatives that share the same base content in different aspect ratios
                  (e.g. 1:1, 9:16, 4:5) and map them into a single ad with placement-based asset customization.
                </p>
                {!acCompatible && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    Not compatible with current platform/objective
                  </div>
                )}
                {enableAssetCustomization && acCompatible && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {detection.assetCustomizations.length > 0 ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {detection.assetCustomizations.length} customization pattern{detection.assetCustomizations.length !== 1 ? 's' : ''} detected
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">No asset customization patterns detected</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Detected Groups Review */}
            {hasDetections && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Detected Groups</h4>
                    {pendingCount > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {pendingCount} pending review
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Review each detected grouping below. Approved groups will be created automatically;
                    rejected groups will have their assets treated as individual creatives.
                  </p>

                  <div className="space-y-2">
                    {allGroups.map((group) => (
                      <DetectedGroupCard
                        key={group.id}
                        group={group}
                        status={
                          approvedIds.has(group.id)
                            ? 'approved'
                            : rejectedIds.has(group.id)
                              ? 'rejected'
                              : 'pending'
                        }
                        onApprove={handleApprove}
                        onReject={handleReject}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* No detections info */}
            {!hasDetections && (enableCarousel || enableAssetCustomization) && (
              <>
                <Separator />
                <Alert>
                  <AlertDescription className="text-xs">
                    No carousel or asset customization patterns were detected in your {assets.length} creatives.
                    All assets will be matched individually. You can still proceed with matching.
                  </AlertDescription>
                </Alert>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing} className="gap-2">
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {isProcessing ? 'Processing...' : 'Run Matching'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
