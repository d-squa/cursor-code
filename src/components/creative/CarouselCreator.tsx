// Carousel Creator Component
// Allows multi-selecting creatives within an ad set to link as carousel cards
// Includes platform-specific validation for aspect ratios and card limits

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { GripVertical, Image, Video, X, Plus, Layers, AlertTriangle, CheckCircle, Layout, Film, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreativeTextAssetRow } from '@/types/creativeTextAssets';
import type { CarouselLink, CarouselCardData } from '@/types/carouselTypes';
import { CAROUSEL_CARD_FIELDS } from '@/types/carouselTypes';
import { validateCarouselCreatives, getPlacementBadges, CAROUSEL_PLATFORM_REQUIREMENTS } from '@/utils/placementCompatibility';

interface CarouselCreatorProps {
  selectedRows: CreativeTextAssetRow[];
  existingCarousel?: CarouselLink | null;
  onCreateCarousel: (carousel: CarouselLink) => void;
  onCancel: () => void;
  open: boolean;
  /** When provided, text field changes are synced back to the main table in real time */
  onRowChange?: (id: string, updates: Partial<CreativeTextAssetRow>) => void;
}

const TEXT_ASSET_FIELDS: { key: keyof CreativeTextAssetRow; label: string; maxLength?: number; placeholder: string; colSpan?: boolean }[] = [
  { key: 'primaryText', label: 'Primary Text', maxLength: 500, placeholder: 'Main ad copy...', colSpan: true },
  { key: 'headline', label: 'Headline', maxLength: 255, placeholder: 'Headline' },
  { key: 'description', label: 'Description', maxLength: 125, placeholder: 'Description' },
  { key: 'destinationUrl', label: 'Destination URL', maxLength: 2000, placeholder: 'https://...', colSpan: true },
  { key: 'callToAction', label: 'Call to Action', maxLength: 50, placeholder: 'LEARN_MORE' },
];

export function CarouselCreator({ selectedRows, existingCarousel, onCreateCarousel, onCancel, open, onRowChange }: CarouselCreatorProps) {
  const [carouselName, setCarouselName] = useState('');
  // orderedIds tracks card ordering only (not the row data itself)
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [cardData, setCardData] = useState<Record<string, CarouselCardData>>({});
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const prevOpenRef = React.useRef(false);

  // Build a lookup from selectedRows so text values always come from props (live data)
  const rowLookup = useMemo(() => {
    const map = new Map<string, CreativeTextAssetRow>();
    for (const r of selectedRows) map.set(r.id, r);
    return map;
  }, [selectedRows]);

  // Derive orderedCards from orderedIds + rowLookup (no stale copies)
  const orderedCards = useMemo(() => {
    return orderedIds
      .map(id => rowLookup.get(id))
      .filter(Boolean) as CreativeTextAssetRow[];
  }, [orderedIds, rowLookup]);

  // Only initialize when dialog first opens (not on every selectedRows change)
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;

    if (!justOpened || selectedRows.length === 0) return;

    if (existingCarousel) {
      setCarouselName(existingCarousel.carouselName);
      setCardData(existingCarousel.cardData ?? {});

      const existingIds = existingCarousel.cardIds.filter(id =>
        selectedRows.some(r => r.id === id)
      );
      const missingIds = selectedRows
        .filter(r => !existingCarousel.cardIds.includes(r.id))
        .map(r => r.id);
      setOrderedIds([...existingIds, ...missingIds]);
    } else {
      setCarouselName('');
      setCardData({});
      setOrderedIds(selectedRows.map(r => r.id));
    }
    setExpandedCards(new Set());
  }, [open, selectedRows, existingCarousel]);

  // Toggle card expansion
  const toggleCardExpand = useCallback((cardId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  // Update card data field
  const updateCardField = useCallback((cardId: string, field: keyof CarouselCardData, value: string) => {
    setCardData(prev => ({
      ...prev,
      [cardId]: {
        ...prev[cardId],
        [field]: value,
      },
    }));
  }, []);

  // Validate all selected are from same ad set
  const adSetNames = [...new Set(selectedRows.map(r => r.adSet))];
  const isSameAdSet = adSetNames.length === 1;
  const adSetName = adSetNames[0] || 'Unknown';
  const platform = orderedCards[0]?.platform?.toLowerCase() || 'meta';

  // Platform requirements
  const platformReqs = CAROUSEL_PLATFORM_REQUIREMENTS[platform] || CAROUSEL_PLATFORM_REQUIREMENTS.meta;

  // Validate carousel creatives for the platform
  const carouselValidation = useMemo(() => {
    if (orderedCards.length === 0) return { isValid: false, errors: [], warnings: [], compatiblePlacements: [] };
    
    const creatives = orderedCards.map(row => ({
      width: (row as any).width,
      height: (row as any).height,
      aspectRatio: row.aspectRatio,
      mediaType: row.mediaType,
    }));
    
    return validateCarouselCreatives(creatives, platform);
  }, [orderedCards, platform]);

  // Get per-card placement badges
  const cardPlacements = useMemo(() => {
    return orderedCards.map(row => {
      const width = (row as any).width;
      const height = (row as any).height;
      return getPlacementBadges(width, height, row.mediaType, platform);
    });
  }, [orderedCards, platform]);

  // Handle drag start
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newOrder = [...orderedCards];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, removed);
    setOrderedCards(newOrder);
    setDraggedIndex(index);
  }, [draggedIndex, orderedCards]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  // Handle position number change
  const handlePositionChange = useCallback((currentIndex: number, newPosition: number) => {
    if (newPosition < 1 || newPosition > orderedCards.length) return;
    
    const newOrder = [...orderedCards];
    const [removed] = newOrder.splice(currentIndex, 1);
    newOrder.splice(newPosition - 1, 0, removed);
    setOrderedCards(newOrder);
  }, [orderedCards]);

  // Remove card from carousel
  const handleRemoveCard = useCallback((index: number) => {
    setOrderedCards(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Create / update carousel
  const handleCreate = useCallback(() => {
    if (!carouselName.trim() || orderedCards.length < 2) return;

    const carousel: CarouselLink = {
      id: existingCarousel?.id ?? crypto.randomUUID(),
      carouselName: carouselName.trim(),
      adSetId: orderedCards[0]?.assignmentId.split('_')[0] || '',
      adSetName,
      platform: orderedCards[0]?.platform || 'meta',
      market: orderedCards[0]?.market || '',
      phase: orderedCards[0]?.phase || '',
      cardIds: orderedCards.map((r) => r.id),
      cardData,
    };

    onCreateCarousel(carousel);
  }, [carouselName, orderedCards, adSetName, cardData, onCreateCarousel, existingCarousel]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-3xl w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {existingCarousel ? 'Edit Carousel' : 'Create Carousel'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Validation warning - same ad set */}
          {!isSameAdSet && (
            <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Selected creatives must be from the same ad set. Found: {adSetNames.join(', ')}
            </div>
          )}

          {/* Platform requirements info */}
          <div className="bg-muted/50 px-3 py-2 rounded-md text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">{platform.charAt(0).toUpperCase() + platform.slice(1)} Carousel Requirements</span>
              <Badge variant="outline" className="text-[10px]">
                {platformReqs.minCards}-{platformReqs.maxCards} cards
              </Badge>
            </div>
            <div className="text-muted-foreground">
              Supported aspect ratios: {platformReqs.aspectRatios.join(', ')}
              {platformReqs.sameAspectRatio && <span className="ml-1">(all cards must match)</span>}
            </div>
          </div>

          {/* Carousel validation errors */}
          {carouselValidation.errors.length > 0 && (
            <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm space-y-1">
              {carouselValidation.errors.map((err, i) => (
                <div key={i} className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {err}
                </div>
              ))}
            </div>
          )}

          {/* Carousel validation warnings */}
          {carouselValidation.warnings.length > 0 && (
            <div className="bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 rounded-md text-sm space-y-1">
              {carouselValidation.warnings.map((warn, i) => (
                <div key={i} className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {warn}
                </div>
              ))}
            </div>
          )}

          {/* Compatible placements */}
          {carouselValidation.isValid && carouselValidation.compatiblePlacements.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              <span>Compatible with:</span>
              {carouselValidation.compatiblePlacements.map(p => (
                <Badge key={p} variant="secondary" className="gap-1 text-xs">
                  {p === 'feed' && <Layout className="h-3 w-3" />}
                  {p === 'story' && <Film className="h-3 w-3" />}
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Badge>
              ))}
            </div>
          )}

          {/* Carousel name input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Carousel Name</label>
            <Input
              value={carouselName}
              onChange={(e) => setCarouselName(e.target.value)}
              placeholder="Enter carousel name..."
            />
          </div>

          {/* Ad Set info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Ad Set:</span>
            <Badge variant="secondary">{adSetName}</Badge>
          </div>

          {/* Card ordering */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Card Order & Parameters</label>
            <div className="space-y-1 border rounded-md p-2 bg-muted/30">
              {orderedCards.map((row, index) => {
                const badges = cardPlacements[index] || [];
                const carouselBadge = badges.find(b => b.type === 'carousel');
                const isCarouselCompatible = carouselBadge?.variant !== 'incompatible';
                const isExpanded = expandedCards.has(row.id);
                const thisCardData = cardData[row.id] || {};
                
                return (
                  <Collapsible key={row.id} open={isExpanded} onOpenChange={() => toggleCardExpand(row.id)}>
                    <div
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "bg-background rounded border",
                        draggedIndex === index && "opacity-50",
                        !isCarouselCompatible && "border-amber-500/50 bg-amber-500/5"
                      )}
                    >
                      <div className="flex items-center gap-2 p-2 cursor-move">
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                        
                        {/* Position number input */}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Input
                                type="number"
                                min={1}
                                max={orderedCards.length}
                                value={index + 1}
                                onChange={(e) => handlePositionChange(index, parseInt(e.target.value) || 1)}
                                className="w-12 h-7 text-center text-xs"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </TooltipTrigger>
                            <TooltipContent>Card position</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {/* Media type icon */}
                        {row.mediaType === 'video' ? (
                          <Video className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <Image className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}

                        {/* Thumbnail */}
                        {row.thumbnailUrl && (
                          <img 
                            src={row.thumbnailUrl} 
                            alt="" 
                            className="h-8 w-8 object-cover rounded shrink-0"
                          />
                        )}

                        {/* Name */}
                        <span className="text-sm truncate flex-1">{row.creativeName}</span>

                        {/* Placement compatibility indicator */}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge 
                                variant={isCarouselCompatible ? "secondary" : "outline"}
                                className={cn(
                                  "text-[9px] px-1.5",
                                  isCarouselCompatible ? "bg-green-500/15 text-green-600" : "text-amber-600"
                                )}
                              >
                                {isCarouselCompatible ? '✓' : '⚠'}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {isCarouselCompatible 
                                ? 'Compatible with carousel format' 
                                : 'Aspect ratio may not be optimal for carousel'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {/* Expand/collapse button */}
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>

                        {/* Remove button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleRemoveCard(index)}
                          disabled={orderedCards.length <= 2}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Card-level parameters */}
                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-1 border-t bg-muted/20 space-y-3">
                          {/* Main text assets */}
                          <div>
                            <p className="text-xs text-muted-foreground font-medium mb-1.5">Text Assets</p>
                            <div className="grid grid-cols-2 gap-2">
                              {TEXT_ASSET_FIELDS.map(field => (
                                <div key={field.key} className={cn("space-y-1", field.colSpan && 'col-span-2')}>
                                  <Label className="text-xs">{field.label}</Label>
                                  {field.key === 'primaryText' ? (
                                    <Textarea
                                      value={(row[field.key] as string) || ''}
                                      onChange={(e) => {
                                        // Update local state
                                        const updatedCards = orderedCards.map(c => c.id === row.id ? { ...c, [field.key]: e.target.value } : c);
                                        setOrderedCards(updatedCards);
                                        // Sync back to main table
                                        onRowChange?.(row.id, { [field.key]: e.target.value });
                                      }}
                                      placeholder={field.placeholder}
                                      className="text-xs min-h-[60px]"
                                      maxLength={field.maxLength}
                                    />
                                  ) : (
                                    <Input
                                      value={(row[field.key] as string) || ''}
                                      onChange={(e) => {
                                        const updatedCards = orderedCards.map(c => c.id === row.id ? { ...c, [field.key]: e.target.value } : c);
                                        setOrderedCards(updatedCards);
                                        onRowChange?.(row.id, { [field.key]: e.target.value });
                                      }}
                                      placeholder={field.placeholder}
                                      className="h-8 text-xs"
                                      maxLength={field.maxLength}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Card-level parameters */}
                          <div>
                            <p className="text-xs text-muted-foreground font-medium mb-1.5">Card Parameters</p>
                            <div className="grid grid-cols-2 gap-2">
                              {CAROUSEL_CARD_FIELDS.map(field => (
                                <div key={field.id} className={cn("space-y-1", field.id.includes('Url') && 'col-span-2')}>
                                  <Label className="text-xs">{field.label}</Label>
                                  <Input
                                    value={thisCardData[field.id as keyof CarouselCardData] || ''}
                                    onChange={(e) => updateCardField(row.id, field.id as keyof CarouselCardData, e.target.value)}
                                    placeholder={field.placeholder}
                                    className="h-8 text-xs"
                                    maxLength={field.maxLength}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum {platformReqs.minCards} cards required. Click the arrow to expand card parameters.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreate}
            disabled={!isSameAdSet || !carouselName.trim() || orderedCards.length < platformReqs.minCards || carouselValidation.errors.length > 0}
          >
            <Plus className="h-4 w-4 mr-1" />
            {existingCarousel ? 'Save Carousel' : 'Create Carousel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}